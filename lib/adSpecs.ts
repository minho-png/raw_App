export type Platform = 'kakao' | 'naver' | 'google' | 'meta'

const KB  = 1024
const MB  = 1024 * KB
const GB  = 1024 * MB

// ── 공통 타입 ──────────────────────────────────────────────────────

export interface ProductImageSpec {
  label: string
  minWidth: number
  minHeight: number
  /** exact: 정확히 일치 / min: 이상 */
  sizeMode: 'exact' | 'min'
  ratio?: string
  maxFileSizeBytes: number
  minFileSizeBytes?: number
  allowedFormats: string[]   // lowercase: ['jpg','jpeg','png'] etc.
  transparentRequired?: boolean
  transparentForbidden?: boolean
  note?: string
}

export interface ProductVideoSpec {
  label: string
  minWidth: number
  minHeight: number
  ratio?: string
  maxFileSizeBytes: number
  allowedFormats: string[]
  maxDurationSec: number
  minDurationSec?: number
  requiresSound?: boolean
  note?: string
}

export interface AdProduct {
  id: string
  platform: Platform
  name: string
  mediaType: 'image' | 'video' | 'both'
  imageSpecs: ProductImageSpec[]
  videoSpecs: ProductVideoSpec[]
}

// ── 상품 목록 ──────────────────────────────────────────────────────

export const ALL_PRODUCTS: AdProduct[] = [

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 카카오모먼트
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'kakao-bizboard',
    platform: 'kakao',
    name: '비즈보드',
    mediaType: 'image',
    imageSpecs: [{
      label: '1029×258px (PNG-24/32 · 투명배경 필수)',
      minWidth: 1029, minHeight: 258, sizeMode: 'exact',
      ratio: '4:1',
      maxFileSizeBytes: 300 * KB,
      allowedFormats: ['png'],
      transparentRequired: true,
      note: 'PNG-24 또는 PNG-32만 허용. 배경이 투명한 이미지 필수. 카카오모먼트 이미지 배너 제작툴로 제작.',
    }],
    videoSpecs: [],
  },
  {
    id: 'kakao-display-image',
    platform: 'kakao',
    name: '디스플레이 · 이미지',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '1200×600px 이상 · 2:1',
        minWidth: 1200, minHeight: 600, sizeMode: 'min',
        ratio: '2:1',
        maxFileSizeBytes: 500 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
      {
        label: '500×500px 이상 · 1:1',
        minWidth: 500, minHeight: 500, sizeMode: 'min',
        ratio: '1:1',
        maxFileSizeBytes: 500 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
      {
        label: '720×1280px 이상 · 9:16',
        minWidth: 720, minHeight: 1280, sizeMode: 'min',
        ratio: '9:16',
        maxFileSizeBytes: 500 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
      {
        label: '800×1000px 이상 · 4:5 (세이프존 준수)',
        minWidth: 800, minHeight: 1000, sizeMode: 'min',
        ratio: '4:5',
        maxFileSizeBytes: 500 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '세이프존 준수 필요',
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'kakao-display-video',
    platform: 'kakao',
    name: '디스플레이 · 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [
      {
        label: '16:9 · 1280×720px 이상',
        minWidth: 1280, minHeight: 720, ratio: '16:9',
        maxFileSizeBytes: 1 * GB,
        allowedFormats: ['mp4', 'avi', 'flv'],
        maxDurationSec: 3600, minDurationSec: 3,
        note: 'AVI, FLV, MP4 권장. 최소 3초 이상.',
      },
      {
        label: '9:16 · 720×1280px 이상',
        minWidth: 720, minHeight: 1280, ratio: '9:16',
        maxFileSizeBytes: 1 * GB,
        allowedFormats: ['mp4', 'avi', 'flv'],
        maxDurationSec: 3600, minDurationSec: 3,
      },
    ],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 네이버 GFA
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'naver-smart-channel',
    platform: 'naver',
    name: '스마트채널',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '750×160px (PNG 전용)',
        minWidth: 750, minHeight: 160, sizeMode: 'exact',
        ratio: '4.69:1',
        maxFileSizeBytes: 150 * KB,
        allowedFormats: ['png'],
        note: 'PNG 파일만 허용. 제작용 PSD 샘플 사용 필수.',
      },
      {
        label: '750×200px (PNG 전용)',
        minWidth: 750, minHeight: 200, sizeMode: 'exact',
        ratio: '3.75:1',
        maxFileSizeBytes: 150 * KB,
        allowedFormats: ['png'],
        note: 'PNG 파일만 허용.',
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'naver-image-da',
    platform: 'naver',
    name: '이미지 DA',
    mediaType: 'image',
    imageSpecs: [{
      label: '1250×560px',
      minWidth: 1250, minHeight: 560, sizeMode: 'exact',
      ratio: '2.23:1',
      maxFileSizeBytes: 250 * KB,
      minFileSizeBytes: 50 * KB,
      allowedFormats: ['jpg', 'jpeg', 'png'],
      note: '최소 50KB 이상 / 최대 250KB 이하',
    }],
    videoSpecs: [],
  },
  {
    id: 'naver-native',
    platform: 'naver',
    name: '네이티브',
    mediaType: 'image',
    imageSpecs: [{
      label: '342×228px (1.5:1 비율)',
      minWidth: 342, minHeight: 228, sizeMode: 'exact',
      ratio: '1.5:1',
      maxFileSizeBytes: 130 * KB,
      minFileSizeBytes: 10 * KB,
      allowedFormats: ['jpg', 'jpeg', 'png'],
      note: '최소 10KB / 최대 130KB. PNG-24 포함.',
    }],
    videoSpecs: [],
  },
  {
    id: 'naver-feed-image',
    platform: 'naver',
    name: '피드 · 이미지',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '1200×628px · 16:9 (50KB~500KB)',
        minWidth: 1200, minHeight: 628, sizeMode: 'exact',
        ratio: '1.91:1',
        maxFileSizeBytes: 500 * KB,
        minFileSizeBytes: 50 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
      {
        label: '1200×1200px · 1:1 (80KB~800KB)',
        minWidth: 1200, minHeight: 1200, sizeMode: 'exact',
        ratio: '1:1',
        maxFileSizeBytes: 800 * KB,
        minFileSizeBytes: 80 * KB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'naver-outstream-video',
    platform: 'naver',
    name: '아웃스트림 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [{
      label: '1280×720px · 16:9',
      minWidth: 1280, minHeight: 720, ratio: '16:9',
      maxFileSizeBytes: 1 * GB,
      allowedFormats: ['mp4', 'aiv', 'wmv', 'mpg', 'mpeg'],
      maxDurationSec: 600, minDurationSec: 5,
      requiresSound: true,
      note: '사운드 필수. 5초~10분.',
    }],
  },
  {
    id: 'naver-instream-video',
    platform: 'naver',
    name: '인스트림 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [{
      label: '1280×720px 이상 · 16:9 (최소 640×360)',
      minWidth: 640, minHeight: 360, ratio: '16:9',
      maxFileSizeBytes: 1 * GB,
      allowedFormats: ['mp4', 'aiv', 'mov', 'wmv'],
      maxDurationSec: 600, minDurationSec: 5,
      note: '권장 1280×720 이상. 사운드 없는 경우 10초 이상 안내 문구 필수.',
    }],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Meta
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'meta-facebook-image',
    platform: 'meta',
    name: 'Facebook 피드 · 이미지',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '1440×1440px · 1:1 (최소 너비 600px)',
        minWidth: 600, minHeight: 600, sizeMode: 'min',
        ratio: '1:1',
        maxFileSizeBytes: 30 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '권장 1440×1440px. 최소 너비 600픽셀 이상.',
      },
      {
        label: '1440×1800px · 4:5 (최소 너비 600px)',
        minWidth: 600, minHeight: 750, sizeMode: 'min',
        ratio: '4:5',
        maxFileSizeBytes: 30 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '권장 1440×1800px. 최소 너비 600픽셀 이상.',
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'meta-instagram-image',
    platform: 'meta',
    name: 'Instagram 피드 · 이미지',
    mediaType: 'image',
    imageSpecs: [{
      label: '1440×1440px · 1:1 (최소 너비 500px)',
      minWidth: 500, minHeight: 500, sizeMode: 'min',
      ratio: '1:1',
      maxFileSizeBytes: 30 * MB,
      allowedFormats: ['jpg', 'jpeg', 'png'],
      note: '권장 1440×1440px. 최소 너비 500픽셀 이상.',
    }],
    videoSpecs: [],
  },
  {
    id: 'meta-facebook-video',
    platform: 'meta',
    name: 'Facebook 피드 · 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [
      {
        label: '1:1 비율',
        minWidth: 1080, minHeight: 1080, ratio: '1:1',
        maxFileSizeBytes: 4 * GB,
        allowedFormats: ['mp4', 'mov', 'gif'],
        maxDurationSec: 14460, minDurationSec: 1,
        note: '최대 4GB / 1초~241분',
      },
      {
        label: '4:5 비율',
        minWidth: 1080, minHeight: 1350, ratio: '4:5',
        maxFileSizeBytes: 4 * GB,
        allowedFormats: ['mp4', 'mov', 'gif'],
        maxDurationSec: 14460, minDurationSec: 1,
      },
    ],
  },
  {
    id: 'meta-instagram-video',
    platform: 'meta',
    name: 'Instagram 피드 · 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [{
      label: '4:5 비율',
      minWidth: 1080, minHeight: 1350, ratio: '4:5',
      maxFileSizeBytes: 4 * GB,
      allowedFormats: ['mp4', 'mov', 'gif'],
      maxDurationSec: 3600, minDurationSec: 1,
      note: '최대 4GB / 1초~60분',
    }],
  },

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Google
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  {
    id: 'google-gdn-standard',
    platform: 'google',
    name: 'GDN · 일반형',
    mediaType: 'image',
    imageSpecs: [
      { label: '728×90 (리더보드)',         minWidth: 728, minHeight: 90,  sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
      { label: '336×280 (라지 렉탱글)',     minWidth: 336, minHeight: 280, sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
      { label: '300×250 (미디엄 렉탱글)',   minWidth: 300, minHeight: 250, sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
      { label: '300×50 (모바일 배너)',       minWidth: 300, minHeight: 50,  sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
      { label: '160×600 (와이드 스카이스크래퍼)', minWidth: 160, minHeight: 600, sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
      { label: '250×250 (스퀘어)',           minWidth: 250, minHeight: 250, sizeMode: 'exact', maxFileSizeBytes: 600 * KB, allowedFormats: ['jpg', 'jpeg', 'png'] },
    ],
    videoSpecs: [],
  },
  {
    id: 'google-gdn-responsive',
    platform: 'google',
    name: 'GDN · 반응형',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '1.91:1 · 권장 1200×628px (최소 600×314)',
        minWidth: 600, minHeight: 314, sizeMode: 'min',
        ratio: '1.91:1',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '권장 1200×628px',
      },
      {
        label: '1:1 · 권장 1200×1200px (최소 300×300)',
        minWidth: 300, minHeight: 300, sizeMode: 'min',
        ratio: '1:1',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '권장 1200×1200px',
      },
      {
        label: '4:5 · 권장 960×1200px (최소 480×600)',
        minWidth: 480, minHeight: 600, sizeMode: 'min',
        ratio: '4:5',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '선택 사항',
      },
      {
        label: '9:16 · 권장 1080×1920px (최소 600×1067)',
        minWidth: 600, minHeight: 1067, sizeMode: 'min',
        ratio: '9:16',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
        note: '선택 사항',
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'google-demandgen-image',
    platform: 'google',
    name: '디멘드젠 · 이미지',
    mediaType: 'image',
    imageSpecs: [
      {
        label: '1200×628px · 1.91:1',
        minWidth: 1200, minHeight: 628, sizeMode: 'exact',
        ratio: '1.91:1',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
      {
        label: '1200×1200px · 1:1',
        minWidth: 1200, minHeight: 1200, sizeMode: 'exact',
        ratio: '1:1',
        maxFileSizeBytes: 5 * MB,
        allowedFormats: ['jpg', 'jpeg', 'png'],
      },
    ],
    videoSpecs: [],
  },
  {
    id: 'google-demandgen-video',
    platform: 'google',
    name: '디멘드젠 · 동영상',
    mediaType: 'video',
    imageSpecs: [],
    videoSpecs: [
      { label: '16:9 · 1920×1080px', minWidth: 1920, minHeight: 1080, ratio: '16:9', maxFileSizeBytes: 256 * GB, allowedFormats: ['mp4', 'mpg', 'mpeg'], maxDurationSec: 3600, minDurationSec: 5 },
      { label: '1:1 · 1080×1080px',  minWidth: 1080, minHeight: 1080, ratio: '1:1',  maxFileSizeBytes: 256 * GB, allowedFormats: ['mp4', 'mpg', 'mpeg'], maxDurationSec: 3600, minDurationSec: 5 },
      { label: '4:5 · 1080×1350px',  minWidth: 1080, minHeight: 1350, ratio: '4:5',  maxFileSizeBytes: 256 * GB, allowedFormats: ['mp4', 'mpg', 'mpeg'], maxDurationSec: 3600, minDurationSec: 5 },
      { label: '9:16 · 1080×1920px', minWidth: 1080, minHeight: 1920, ratio: '9:16', maxFileSizeBytes: 256 * GB, allowedFormats: ['mp4', 'mpg', 'mpeg'], maxDurationSec: 3600, minDurationSec: 5 },
    ],
  },
]

// ── 조회 함수 ──────────────────────────────────────────────────────

export function getProducts(platform: Platform): AdProduct[] {
  return ALL_PRODUCTS.filter(p => p.platform === platform)
}

export function getProduct(id: string): AdProduct | undefined {
  return ALL_PRODUCTS.find(p => p.id === id)
}

export function getDefaultProductId(platform: Platform): string {
  return getProducts(platform)[0]?.id ?? ''
}

// ── 파일 크기 포맷 ─────────────────────────────────────────────────

export function formatFileSize(bytes: number): string {
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)}GB`
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)}MB`
  if (bytes >= KB) return `${Math.round(bytes / KB)}KB`
  return `${bytes}B`
}

// ── 검증 결과 타입 ─────────────────────────────────────────────────

export interface ImageCheckResult {
  formatOk: boolean
  sizeOk: boolean        // 파일 용량
  minSizeOk: boolean     // 최소 용량 (없으면 true)
  dimensionMatch: 'exact' | 'meets-min' | 'ratio-match' | 'too-small'
  overallPass: boolean
  spec: ProductImageSpec
  issues: string[]
  warnings: string[]
}

export interface VideoCheckResult {
  formatOk: boolean
  sizeOk: boolean
  dimensionMatch: 'meets-min' | 'ratio-match' | 'too-small'
  durationOk: boolean
  overallPass: boolean
  spec: ProductVideoSpec
  issues: string[]
  warnings: string[]
}

const RATIO_TOL = 0.06

// ── 이미지 검증 ────────────────────────────────────────────────────

export function checkImageFile(
  file: File,
  width: number,
  height: number,
  spec: ProductImageSpec
): ImageCheckResult {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const formatOk = spec.allowedFormats.includes(ext)
  const sizeOk   = file.size <= spec.maxFileSizeBytes
  const minSizeOk = spec.minFileSizeBytes === undefined || file.size >= spec.minFileSizeBytes

  const fileRatio = width / height
  const specRatio = spec.minWidth / spec.minHeight
  const ratioDiff = Math.abs(fileRatio - specRatio) / specRatio
  const ratioOk   = ratioDiff <= RATIO_TOL

  let dimensionMatch: 'exact' | 'meets-min' | 'ratio-match' | 'too-small'
  if (spec.sizeMode === 'exact') {
    if (width === spec.minWidth && height === spec.minHeight) {
      dimensionMatch = 'exact'
    } else if (ratioOk) {
      dimensionMatch = 'ratio-match'
    } else {
      dimensionMatch = 'too-small'
    }
  } else {
    if (width >= spec.minWidth && height >= spec.minHeight) {
      dimensionMatch = (width === spec.minWidth && height === spec.minHeight) ? 'exact' : 'meets-min'
    } else if (ratioOk) {
      dimensionMatch = 'ratio-match'
    } else {
      dimensionMatch = 'too-small'
    }
  }

  const issues: string[] = []
  const warnings: string[] = []

  if (!formatOk) {
    issues.push(`파일 형식 오류: ${ext.toUpperCase()} → ${spec.allowedFormats.map(f => f.toUpperCase()).join(' / ')} 필요`)
  }
  if (!sizeOk) {
    issues.push(`용량 초과: ${formatFileSize(file.size)} → ${formatFileSize(spec.maxFileSizeBytes)} 이하 필요`)
  }
  if (!minSizeOk) {
    issues.push(`용량 부족: ${formatFileSize(file.size)} → ${formatFileSize(spec.minFileSizeBytes!)} 이상 필요`)
  }
  if (dimensionMatch === 'too-small') {
    const req = spec.sizeMode === 'exact' ? `${spec.minWidth}×${spec.minHeight}px` : `${spec.minWidth}×${spec.minHeight}px 이상`
    issues.push(`크기 오류: ${width}×${height}px → ${req} 필요`)
  } else if (dimensionMatch === 'ratio-match') {
    const req = spec.sizeMode === 'exact' ? `${spec.minWidth}×${spec.minHeight}px` : `${spec.minWidth}×${spec.minHeight}px 이상`
    issues.push(`크기 부족: ${width}×${height}px → ${req} 필요 (비율은 일치)`)
  }
  if (spec.note) warnings.push(spec.note)

  const overallPass = formatOk && sizeOk && minSizeOk &&
    (dimensionMatch === 'exact' || dimensionMatch === 'meets-min')

  return { formatOk, sizeOk, minSizeOk, dimensionMatch, overallPass, spec, issues, warnings }
}

// ── 동영상 검증 ────────────────────────────────────────────────────

export function checkVideoFile(
  file: File,
  width: number,
  height: number,
  durationSec: number,
  spec: ProductVideoSpec
): VideoCheckResult {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const formatOk = spec.allowedFormats.includes(ext)
  const sizeOk   = file.size <= spec.maxFileSizeBytes

  const fileRatio = width / height
  const specRatio = spec.minWidth / spec.minHeight
  const ratioDiff = Math.abs(fileRatio - specRatio) / specRatio
  const ratioOk   = ratioDiff <= RATIO_TOL

  let dimensionMatch: 'meets-min' | 'ratio-match' | 'too-small'
  if (width >= spec.minWidth && height >= spec.minHeight) {
    dimensionMatch = 'meets-min'
  } else if (ratioOk) {
    dimensionMatch = 'ratio-match'
  } else {
    dimensionMatch = 'too-small'
  }

  const durationOk = durationSec <= spec.maxDurationSec &&
    (spec.minDurationSec === undefined || durationSec >= spec.minDurationSec)

  const issues: string[] = []
  const warnings: string[] = []

  if (!formatOk) {
    issues.push(`파일 형식 오류: ${ext.toUpperCase()} → ${spec.allowedFormats.map(f => f.toUpperCase()).join(' / ')} 필요`)
  }
  if (!sizeOk) {
    issues.push(`용량 초과: ${formatFileSize(file.size)} → ${formatFileSize(spec.maxFileSizeBytes)} 이하 필요`)
  }
  if (dimensionMatch === 'too-small') {
    issues.push(`해상도 부족: ${width}×${height}px → ${spec.minWidth}×${spec.minHeight}px 이상 필요`)
  } else if (dimensionMatch === 'ratio-match') {
    issues.push(`해상도 부족 (비율 일치): ${width}×${height}px → ${spec.minWidth}×${spec.minHeight}px 이상 필요`)
  }
  if (!durationOk) {
    if (durationSec > spec.maxDurationSec) {
      issues.push(`재생시간 초과: ${Math.round(durationSec)}초 → ${spec.maxDurationSec}초 이하 필요`)
    } else if (spec.minDurationSec && durationSec < spec.minDurationSec) {
      issues.push(`재생시간 부족: ${Math.round(durationSec)}초 → ${spec.minDurationSec}초 이상 필요`)
    }
  }
  if (spec.requiresSound) warnings.push('사운드 필수 (사운드 없는 경우 집행 불가)')
  if (spec.note) warnings.push(spec.note)

  const overallPass = formatOk && sizeOk && dimensionMatch === 'meets-min' && durationOk
  return { formatOk, sizeOk, dimensionMatch, durationOk, overallPass, spec, issues, warnings }
}

// ── 최적 매칭 탐색 ─────────────────────────────────────────────────

export function findBestImageMatch(
  file: File, width: number, height: number, product: AdProduct
): ImageCheckResult | null {
  if (!product.imageSpecs.length) return null
  let best: ImageCheckResult | null = null
  for (const spec of product.imageSpecs) {
    const r = checkImageFile(file, width, height, spec)
    if (r.overallPass) return r
    if (!best || r.issues.length < best.issues.length) best = r
  }
  return best
}

export function findBestVideoMatch(
  file: File, width: number, height: number, dur: number, product: AdProduct
): VideoCheckResult | null {
  if (!product.videoSpecs.length) return null
  let best: VideoCheckResult | null = null
  for (const spec of product.videoSpecs) {
    const r = checkVideoFile(file, width, height, dur, spec)
    if (r.overallPass) return r
    if (!best || r.issues.length < best.issues.length) best = r
  }
  return best
}

// ── 하위 호환 (기존 코드가 남아있을 경우 대비) ─────────────────────
export type Platform_ = Platform
