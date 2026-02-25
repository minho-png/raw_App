# 🚀 Streamlit 앱 배포 가이드 (Deployment Guide)

GFA RAW Master Pro를 전 세계 어디서든 접속할 수 있도록 배포하는 가장 쉽고 대중적인 방법은 **Streamlit Community Cloud**를 사용하는 것입니다.

## 📋 사전 준비 사항
1. **GitHub 계정**: 코드를 업로드할 저장소가 필요합니다.
2. **requirements.txt**: 이미 `c:\RAW_APP` 폴더에 생성되어 있습니다 (배포 시 필수).

---

## 🛠️ 단계별 배포 순서

### 1단계: GitHub에 코드 올리기
1. [GitHub](https://github.com/)에서 새로운 저장소(Repository)를 만듭니다 (예: `gfa-raw-master`).
2. 로컬 컴퓨터의 `c:\RAW_APP` 폴더 파일들을 해당 저장소에 업로드합니다.
   - 업로드할 파일: `app.py`, `logic.py`, `requirements.txt`
   - (`result.csv`나 `test_logic.py`는 선택사항입니다.)

### 2단계: Streamlit Cloud 가입 및 연결
1. [Streamlit Community Cloud](https://share.streamlit.io/)에 접속하여 GitHub 계정으로 로그인합니다.
2. **"Create app"** 버튼을 클릭합니다.

### 3단계: 앱 설정 및 배포
1. **Repository**: 방금 만든 GitHub 저장소를 선택합니다.
2. **Main file path**: `app.py`를 입력합니다.
3. **App URL**: 원하는 URL 주소를 설정합니다.
4. **Deploy!** 버튼을 클릭합니다.

---

## � 비용 분석 (Cost Analysis)
1. **배포 비용: 0원**
   - Streamlit Community Cloud는 GitHub 저장소와 연결하여 사용하는 한 **무료**로 앱을 호스팅할 수 있습니다.
   - GitHub 역시 공개/비공개 저장소 생성이 기본적으로 **무료**입니다.
2. **제한 사항**: 무료 티어는 리소구(CPU/RAM)가 제한적이므로, 아주 큰 데이터(수백만 행)를 처리할 때는 속도가 느려질 수 있습니다.

---

## 🔒 보안 분석 (Security Analysis)
1. **데이터 저장 방식**: 
   - 이 앱은 사용자가 업로드한 파일을 서버에 **영구 저장하지 않습니다.**
   - 파일 데이터는 서버의 메모리(RAM)에 잠시 머물렀다가, 브라우저 세션이 종료되면 자동으로 소멸됩니다.
2. **코드 보안**:
   - **Public Repo**: GitHub 저장소를 'Public'으로 만들면 전 세계 누구나 코드를 볼 수 있습니다. 광고 대행사의 고유 로직이 기밀이라면 반드시 **'Private' 저장소**로 생성하세요.
   - **Private Repo**: Streamlit Cloud는 계정당 1개의 비공개(Private) 저장소 연결을 무료로 지원합니다.
3. **권장 사항 (Professional)**: 
   - 만약 고객사 데이터 보안 규정이 매우 엄격하다면, 클라우드 배포보다는 지금처럼 **로컬 컴퓨터 내에서 실행**하거나, 사내 전용 서버(AWS EC2, Docker 등)에 독립적으로 구축하는 것이 가장 안전합니다.

---

## �💡 주의사항 (중요)
- **requirements.txt**: 배포 환경에서 라이브러리를 설치할 때 사용되므로 파일 이름과 내용이 정확해야 합니다 (이미 준비됨).
- **보안**: 공개된 GitHub 저장소에 중요한 데이터나 비밀번호가 포함되지 않도록 주의하세요.
- **파일 업로드**: 배포된 앱에서도 사용자가 파일을 직접 업로드하여 사용할 수 있습니다.

---

## 🏃 로컬에서 다시 실행하려면?
개발 중이거나 개인적으로 사용할 때는 터미널(PowerShell)에서 다음 명령어를 유지하세요:
```powershell
cd c:\RAW_APP
streamlit run app.py
```
