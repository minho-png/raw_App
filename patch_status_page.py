#!/usr/bin/env python3
# -*- coding: utf-8 -*-

with open('app/campaign/ct-plus/status/page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Find insertion point for states and function - after uploading state, before handleSave
marker1 = 'const [uploading,           setUploading]           = useState(false)\n\n  function handleSave() {'
if marker1 not in content:
    print('ERROR: Could not find marker1')
    exit(1)

new_states = 'const [uploading,           setUploading]           = useState(false)\n  const [analyzing,           setAnalyzing]           = useState(false)\n  const [analyzeToast,        setAnalyzeToast]        = useState<string | null>(null)\n\n  async function handleAnalyzePdf() {\n    if (!pdfFile) return\n    setAnalyzing(true)\n    setAnalyzeToast(null)\n    try {\n      const formData = new FormData()\n      formData.append(\'file\', pdfFile)\n      const res = await fetch(\'/api/v1/agencies/analyze-pdf\', { method: \'POST\', body: formData })\n      if (!res.ok) throw new Error(\'분석 실패\')\n      const { fields } = await res.json()\n      if (fields) {\n        if (fields.corporateName) setCorporateName(fields.corporateName)\n        if (fields.businessNumber) setBusinessNumber(fields.businessNumber)\n        if (fields.representative) setRepresentative(fields.representative)\n        if (fields.address) setAddress(fields.address)\n        if (fields.businessType) setBusinessType(fields.businessType)\n        if (fields.businessItem) setBusinessItem(fields.businessItem)\n        setAnalyzeToast(\'자동 분석 완료 — 내용을 확인하고 저장하세요\')\n      }\n    } catch (err) {\n      console.error(err)\n      setAnalyzeToast(\'분석 중 오류가 발생했습니다\')\n    } finally {\n      setAnalyzing(false)\n      setTimeout(() => setAnalyzeToast(null), 5000)\n    }\n  }\n\n  function handleSave() {'

content = content.replace(marker1, new_states)

# Find insertion point for button UI - after </MF> for PDF file input
marker2 = '            <MF label="PDF 파일">\n              <input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] ?? null)} className={inputCls} />\n            </MF>\n          </div>\n        </section>\n\n        {/* 액션 */}'

new_ui = '            <MF label="PDF 파일">\n              <input type="file" accept=".pdf" onChange={e => setPdfFile(e.target.files?.[0] ?? null)} className={inputCls} />\n            </MF>\n            {pdfFile && (\n              <div className="flex items-center gap-3">\n                <button\n                  type="button"\n                  onClick={handleAnalyzePdf}\n                  disabled={analyzing}\n                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"\n                >\n                  {analyzing ? (\n                    <>\n                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">\n                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />\n                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />\n                      </svg>\n                      분석 중...\n                    </>\n                  ) : (\n                    <>\n                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>\n                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.347a3.5 3.5 0 00-1.043 2.31v.133a1 1 0 01-1 1H9.92a1 1 0 01-1-1v-.133c0-.895-.356-1.754-.988-2.386l-.347-.347z" />\n                      </svg>\n                      PDF 자동 분석\n                    </>\n                  )}\n                </button>\n                {analyzeToast && (\n                  <span className={`text-sm font-medium ${analyzeToast.includes(\'오류\') ? \'text-red-600\' : \'text-purple-700\'}`}>\n                    {analyzeToast}\n                  </span>\n                )}\n              </div>\n            )}\n          </div>\n        </section>\n\n        {/* 액션 */}'

content = content.replace(marker2, new_ui)

with open('app/campaign/ct-plus/status/page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✓ Patches applied successfully')
