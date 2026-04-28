// CT/CTV 소재 검수 공통 규격 정의
// CT: 이미지 4종 (띠 / 전면 / 중간 / 네이티브)
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
  { key: '전면',   label: '전면',   width: 640,  height: 100 },
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
 * 영상 파일에서 duration(초) + extension 추출.
 * loadedmetadata 이벤트 사용 — 전체 다운로드 없이 메타만.
 */
export function readVideoMetadata(file: File): Promise<{ duration: number; extension: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      const ext = (file.name.split('.').pop() ?? '').toLowerCase()
      resolve({ duration: video.duration, extension: ext, mimeType: file.type })
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
