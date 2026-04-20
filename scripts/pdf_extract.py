#!/usr/bin/env python3
"""
사업자등록증 PDF 텍스트 추출 + 필드 파싱
stdin: base64 인코딩된 PDF 데이터
stdout: JSON { corporateName, businessNumber, representative, address, businessType, businessItem }
"""
import sys
import json
import re
import base64
import io

try:
    import pdfplumber
except ImportError:
    try:
        import pypdf as _pypdf
        pdfplumber = None
    except ImportError:
        pdfplumber = None

try:
    import pypdf
except ImportError:
    pypdf = None


def normalize(text: str) -> str:
    """연속 공백 및 자간 공백 제거, 정규화"""
    # 한글 사이 공백 제거 (PDF 추출 시 자간 공백이 들어가는 경우)
    text = re.sub(r'(?<=[\uac00-\ud7a3])\s+(?=[\uac00-\ud7a3])', '', text)
    # 연속 공백 → 단일 공백
    text = re.sub(r'[ \t]+', ' ', text)
    return text


def extract_text_pdfplumber(pdf_bytes: bytes) -> str:
    """pdfplumber로 PDF 텍스트 추출"""
    text_parts = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text(x_tolerance=2, y_tolerance=2) or ''
            text_parts.append(page_text)
    return '\n'.join(text_parts)


def extract_text_pypdf(pdf_bytes: bytes) -> str:
    """pypdf로 PDF 텍스트 추출 (fallback)"""
    text_parts = []
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    for page in reader.pages:
        text_parts.append(page.extract_text() or '')
    return '\n'.join(text_parts)


def extract_text(pdf_bytes: bytes) -> str:
    """PDF에서 텍스트 추출 (pdfplumber 우선, pypdf fallback)"""
    if pdfplumber:
        try:
            return extract_text_pdfplumber(pdf_bytes)
        except Exception:
            pass
    if pypdf:
        try:
            return extract_text_pypdf(pdf_bytes)
        except Exception:
            pass
    return ''


def find_after_label(text: str, labels: list, stop_labels: list = None, max_len: int = 60) -> str | None:
    """
    labels 중 하나가 나온 직후 텍스트를 추출.
    stop_labels 중 하나가 나오면 거기서 자름.
    """
    stop_labels = stop_labels or []
    for label in labels:
        # 라벨 패턴: 라벨 다음에 콜론/공백 등이 올 수 있음
        pattern = re.escape(label) + r'[\s：:]*(.+?)(?=' + '|'.join(re.escape(s) for s in stop_labels) + r'|$)' if stop_labels else re.escape(label) + r'[\s：:]*(.{1,' + str(max_len) + r'})'
        m = re.search(pattern, text)
        if m:
            val = m.group(1).strip()
            val = re.sub(r'\s+', ' ', val).strip()
            if val:
                return val
    return None


def parse_fields(raw_text: str) -> dict:
    """
    사업자등록증 필드 파싱.
    법인사업자 / 개인사업자 양식 모두 처리.
    """
    # 한글 자간 공백 제거
    text = normalize(raw_text)
    result = {}

    # ── 사업자등록번호 ────────────────────────────────────────────
    # 형식: 000-00-00000
    bn = re.search(r'\b(\d{3}-\d{2}-\d{5})\b', text)
    if bn:
        result['businessNumber'] = bn.group(1)

    # ── 법인명 / 상호 ────────────────────────────────────────────
    # 법인사업자: "법인명", "법인명(단체명)"
    # 개인사업자: "상호"
    stop_corp = ['성명', '대표', '사업장', '개업', '법인등록', '주민', '전화']
    corp = find_after_label(text, ['법인명(단체명)', '법인명', '상호'], stop_corp, max_len=50)
    if corp:
        # 불필요한 괄호 내용 제거 (예: "주식회사 테스트 (대표이사 홍길동)")
        corp = re.split(r'[(\[（]', corp)[0].strip()
        result['corporateName'] = corp

    # ── 대표자명 ──────────────────────────────────────────────────
    stop_rep = ['개업', '사업장', '법인', '주민', '전화', '업태', '종목']
    rep = find_after_label(text, ['성명', '대표자성명', '대표자'], stop_rep, max_len=20)
    if rep:
        # 이름만 추출 (숫자·특수문자 제거)
        rep_clean = re.sub(r'[^가-힣a-zA-Z\s]', '', rep).strip().split()[0] if rep.strip() else None
        if rep_clean:
            result['representative'] = rep_clean

    # ── 사업장소재지 ──────────────────────────────────────────────
    stop_addr = ['업태', '종목', '개업', '발급', '이 증명서', '사업의 종류']
    addr = find_after_label(text, ['사업장소재지', '사업장 소재지'], stop_addr, max_len=100)
    if addr:
        # "본점:" 이후 제거
        addr = re.split(r'본\s*점', addr)[0].strip()
        result['address'] = addr

    # ── 업태 ──────────────────────────────────────────────────────
    # 업태와 종목이 같은 줄에 있는 경우: "업태 서비스업 종목 광고업"
    biz_line = re.search(r'업\s*태\s*[：:]?\s*(.+?)(?=종\s*목|$)', text)
    if biz_line:
        bt = biz_line.group(1).strip()
        bt = re.split(r'종\s*목', bt)[0].strip()
        bt = re.sub(r'\s+', ' ', bt)
        if bt:
            result['businessType'] = bt

    # ── 종목 ──────────────────────────────────────────────────────
    item_line = re.search(r'종\s*목\s*[：:]?\s*(.+?)(?=전화|팩스|발급|이 증명서|사업장|$)', text)
    if item_line:
        it = item_line.group(1).strip()
        it = re.sub(r'\s+', ' ', it)
        if it:
            result['businessItem'] = it

    return result


def main():
    b64_data = sys.stdin.buffer.read()
    if not b64_data:
        print(json.dumps({}))
        return
    try:
        pdf_bytes = base64.b64decode(b64_data)
    except Exception as e:
        sys.stderr.write(f'base64 decode error: {e}\n')
        print(json.dumps({}))
        return

    try:
        raw_text = extract_text(pdf_bytes)
    except Exception as e:
        sys.stderr.write(f'PDF extract error: {e}\n')
        print(json.dumps({}))
        return

    fields = parse_fields(raw_text)
    print(json.dumps(fields, ensure_ascii=False))


if __name__ == '__main__':
    main()
