// CT/CTV 소재 검수 공통 규격 정의
// CT: 이미지 4종 (띠 / 전면 / 중간 / 네이티브) + 영상 (가로/세로형)
// CTV: 영상 (15s 또는 30s, MP4)

export interface CreativeSpec {
  key: string
  label: string
  width: number
  height: number
}

// CT — 이미지 규격 (사용자 정의)
export const CT_IMAGE_SPECS: CreativeSpec[] = [
  { key: '띠',     label: '띠',     width: 640,  height: 100 },
  { key: '전면',   label: '전면',   width: 640,  height: 960 },
  { key: '중간',   label: '중간',   width: 300,  height: 250 },
  { key: '네이티브', label: '네이티브', width: 1200, height: 627 },
]

// 동일 사이즈를 가진 규격 그룹 (띠 + 전면이 같은 640×100)
export function findMatchingSpecs(width: number, height: number): CreativeSpec[] {
  return CT_IMAGE_SPECS.filter(s => s.width === width && s.height === height)
}

// CTV — 영상 길이·포맷 (사용자 정의)
export const CTV_DURATION_OPTIONS = [15, 30] as const  // 초
export const CTV_DURATION_TOLERANCE_SEC = 0.5
export const CTV_REQUIRED_FORMAT = 'mp4'

// CT — 영상 규격 (사용자 제공 PDF '크로스타겟 제작가이드' 2024.03)
//   가로형: 1920×1080, 1080P, 30MB 이내, 30초 이하, 2,000KBPS, 30FPS, H.264/AAC, -23 LUFS
//   세로형: 1080×1920, 1080P, 30MB 이내, 30초 이하, 2,000KBPS, 30FPS, H.264/AAC, -23 LUFS
export interface CtVideoSpec {
  key: 'horizontal' | 'vertical'
  label: string
  width: number
  height: number
}
export const CT_VIDEO_SPECS: CtVideoSpec[] = [
  { key: 'horizontal', label: '가로형', width: 1920, height: 1080 },
  { key: 'vertical',   label: '세로형', width: 1080, height: 1920 },
]
export const CT_VIDEO_MAX_SIZE_BYTES = 30 * 1024 * 1024  // 30MB
export const CT_VIDEO_MAX_DURATION_SEC = 30
export const CT_VIDEO_MAX_BITRATE_KBPS = 2000
export const CT_VIDEO_DURATION_TOLERANCE_SEC = 0.5
export const CT_VIDEO_BITRATE_TOLERANCE_PCT = 5  // 2,000kbps 기준 ±5%
export const CT_VIDEO_REQUIRED_FORMAT = 'mp4'

/**
 * 이미지 파일에서 해상도(naturalWidth × naturalHeight) 추출.
 * 브라우저 메모리에서만 동작 — 서버 업로드 X.
 */
export function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지를 읽을 수 없습니다'))
    }
    img.src = url
  })
}

/**
 * 영상 파일에서 duration(초) + extension + 해상도 추출.
 * loadedmetadata 이벤트 사용 — 전체 다운로드 없이 메타만.
 */
export function readVideoMetadata(file: File): Promise<{
  duration: number
  extension: string
  mimeType: string
  width: number
  height: number
}> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase()
      const meta = {
        duration: video.duration,
        extension: ext,
        mimeType: file.type,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      URL.revokeObjectURL(url)
      resolve(meta)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('영상 메타데이터를 읽을 수 없습니다'))
    }
    video.src = url
  })
}

export interface CtImageCheckResult {
  fileName: string
  fileSize: number
  width: number
  height: number
  matchedSpecs: CreativeSpec[]
  passed: boolean
}

export function checkCtImage(fileName: string, fileSize: number, width: number, height: number): CtImageCheckResult {
  const matchedSpecs = findMatchingSpecs(width, height)
  return { fileName, fileSize, width, height, matchedSpecs, passed: matchedSpecs.length > 0 }
}

export interface CtvVideoCheckResult {
  fileName: string
  fileSize: number
  duration: number
  extension: string
  mimeType: string
  isMp4: boolean
  durationMatched: 15 | 30 | null
  passed: boolean
}

export function checkCtvVideo(
  fileName: string, fileSize: number,
  duration: number, extension: string, mimeType: string,
): CtvVideoCheckResult {
  const isMp4 = extension === CTV_REQUIRED_FORMAT || mimeType === 'video/mp4'
  let durationMatched: 15 | 30 | null = null
  for (const opt of CTV_DURATION_OPTIONS) {
    if (Math.abs(duration - opt) <= CTV_DURATION_TOLERANCE_SEC) {
      durationMatched = opt
      break
    }
  }
  return {
    fileName, fileSize, duration, extension, mimeType,
    isMp4, durationMatched,
    passed: isMp4 && durationMatched !== null,
  }
}

// CT 영상 검수 — 사용자 PDF 가이드 기준.
// 브라우저에서 검사 가능: 해상도(width/height), duration, fileSize, extension/mimeType, bit rate(추정).
// 브라우저에서 자동 검사 불가 (수동 확인 필요): frame rate, codec(H.264/AAC), 오디오 LUFS.
export interface CtVideoCheckResult {
  fileName: string
  fileSize: number
  width: number
  height: number
  duration: number
  extension: string
  mimeType: string
  bitrateKbps: number      // 추정: fileSize × 8 / duration / 1000
  matchedSpec: CtVideoSpec | null  // 가로형 / 세로형 / null
  isMp4: boolean
  durationOk: boolean      // ≤ 30초 (tolerance)
  sizeOk: boolean          // ≤ 30MB
  bitrateOk: boolean       // ≤ 2,000kbps (tolerance)
  passed: boolean          // 모든 자동 검사 통과
  issues: string[]         // 실패 사유 모음
}

export function checkCtVideo(
  fileName: string, fileSize: number,
  duration: number, extension: string, mimeType: string,
  width: number, height: number,
): CtVideoCheckResult {
  const isMp4 = extension === CT_VIDEO_REQUIRED_FORMAT || mimeType === 'video/mp4'
  // 사이즈 매칭 (가로형 1920×1080 또는 세로형 1080×1920)
  const matchedSpec = CT_VIDEO_SPECS.find(s => s.width === width && s.height === height) ?? null
  // 길이 — 30초 이하 (tolerance ± 0.5초)
  const durationOk = duration > 0 && duration <= CT_VIDEO_MAX_DURATION_SEC + CT_VIDEO_DURATION_TOLERANCE_SEC
  // 용량 — 30MB 이내
  const sizeOk = fileSize > 0 && fileSize <= CT_VIDEO_MAX_SIZE_BYTES
  // Bit rate 추정 = (fileSize × 8) / duration / 1000 [kbps]
  const bitrateKbps = duration > 0 ? Math.round((fileSize * 8) / duration / 1000) : 0
  const bitrateLimit = CT_VIDEO_MAX_BITRATE_KBPS * (1 + CT_VIDEO_BITRATE_TOLERANCE_PCT / 100)
  const bitrateOk = bitrateKbps > 0 && bitrateKbps <= bitrateLimit

  const issues: string[] = []
  if (!isMp4) issues.push('MP4 포맷 아님 (확장자/MIME 확인)')
  if (!matchedSpec) issues.push(`해상도 미일치 (실제 ${width}×${height}, 필요 1920×1080 또는 1080×1920)`)
  if (!durationOk) issues.push(`길이 초과 (실제 ${duration.toFixed(1)}초, 최대 ${CT_VIDEO_MAX_DURATION_SEC}초)`)
  if (!sizeOk) issues.push(`용량 초과 (실제 ${(fileSize / 1024 / 1024).toFixed(1)}MB, 최대 30MB)`)
  if (!bitrateOk) issues.push(`비트레이트 초과 (추정 ${bitrateKbps}kbps, 최대 ${CT_VIDEO_MAX_BITRATE_KBPS}kbps)`)

  return {
    fileName, fileSize, width, height, duration, extension, mimeType,
    bitrateKbps, matchedSpec, isMp4, durationOk, sizeOk, bitrateOk,
    passed: isMp4 && matchedSpec !== null && durationOk && sizeOk && bitrateOk,
    issues,
  }
}
