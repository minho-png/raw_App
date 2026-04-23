export type Platform = 'kakao' | 'naver' | 'google' | 'meta'

export interface ImageSpec {
  name: string
  width: number
  height: number
  maxSizeMB: number
  formats: string[]
  ratio?: string
}

export interface VideoSpec {
  name: string
  minWidth: number
  minHeight: number
  maxSizeMB: number
  maxDurationSec: number
  formats: string[]
  ratio?: string
}

export const KakaoImageSpecs: ImageSpec[] = [
  { name: '카카오 비즈보드', width: 1029, height: 258, maxSizeMB: 1, formats: ['JPG', 'PNG'], ratio: '4:1' },
  { name: '디스플레이 (1200×628)', width: 1200, height: 628, maxSizeMB: 5, formats: ['JPG', 'PNG'], ratio: '1.91:1' },
  { name: '디스플레이 (500×500)', width: 500, height: 500, maxSizeMB: 5, formats: ['JPG', 'PNG'], ratio: '1:1' },
  { name: '디스플레이 (640×200)', width: 640, height: 200, maxSizeMB: 5, formats: ['JPG', 'PNG'], ratio: '3.2:1' },
  { name: '네이티브 (1:1)', width: 600, height: 600, maxSizeMB: 5, formats: ['JPG', 'PNG'], ratio: '1:1' },
]

export const KakaoVideoSpecs: VideoSpec[] = [
  { name: '720p 이상', minWidth: 1280, minHeight: 720, maxSizeMB: 500, maxDurationSec: 180, formats: ['MP4'], ratio: '16:9' },
  { name: '1080p 권장', minWidth: 1920, minHeight: 1080, maxSizeMB: 500, maxDurationSec: 180, formats: ['MP4'], ratio: '16:9' },
]

export const NaverImageSpecs: ImageSpec[] = [
  { name: '250×250', width: 250, height: 250, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1:1' },
  { name: '300×250', width: 300, height: 250, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1.2:1' },
  { name: '300×600', width: 300, height: 600, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1:2' },
  { name: '728×90', width: 728, height: 90, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '8.1:1' },
  { name: '320×50', width: 320, height: 50, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '6.4:1' },
  { name: '480×80', width: 480, height: 80, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '6:1' },
  { name: '640×100', width: 640, height: 100, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '6.4:1' },
  { name: '1200×627', width: 1200, height: 627, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1.91:1' },
]

export const NaverVideoSpecs: VideoSpec[] = [
  { name: '인스트림 (16:9)', minWidth: 1280, minHeight: 720, maxSizeMB: 100, maxDurationSec: 180, formats: ['MP4'], ratio: '16:9' },
  { name: '아웃스트림 (1:1)', minWidth: 640, minHeight: 640, maxSizeMB: 100, maxDurationSec: 180, formats: ['MP4'], ratio: '1:1' },
]

export const GoogleImageSpecs: ImageSpec[] = [
  { name: '300×250', width: 300, height: 250, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1.2:1' },
  { name: '728×90', width: 728, height: 90, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '8.1:1' },
  { name: '160×600', width: 160, height: 600, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '0.27:1' },
  { name: '300×600', width: 300, height: 600, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1:2' },
  { name: '320×50', width: 320, height: 50, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '6.4:1' },
  { name: '970×90', width: 970, height: 90, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '10.8:1' },
  { name: '250×250', width: 250, height: 250, maxSizeMB: 0.15, formats: ['JPG', 'PNG', 'GIF'], ratio: '1:1' },
]

export const GoogleVideoSpecs: VideoSpec[] = [
  { name: 'YouTube 인스트림', minWidth: 1280, minHeight: 720, maxSizeMB: 10240, maxDurationSec: 10800, formats: ['MP4', 'MOV'], ratio: '16:9' },
]

export const MetaImageSpecs: ImageSpec[] = [
  { name: '피드 (1:1)', width: 1080, height: 1080, maxSizeMB: 30, formats: ['JPG', 'PNG'], ratio: '1:1' },
  { name: '피드 (1.91:1)', width: 1200, height: 628, maxSizeMB: 30, formats: ['JPG', 'PNG'], ratio: '1.91:1' },
  { name: '피드 (4:5)', width: 1080, height: 1350, maxSizeMB: 30, formats: ['JPG', 'PNG'], ratio: '4:5' },
  { name: '스토리/릴스', width: 1080, height: 1920, maxSizeMB: 30, formats: ['JPG', 'PNG'], ratio: '9:16' },
]

export const MetaVideoSpecs: VideoSpec[] = [
  { name: '피드 (4:5)', minWidth: 1080, minHeight: 1350, maxSizeMB: 4096, maxDurationSec: 240, formats: ['MP4', 'MOV'], ratio: '4:5' },
  { name: '피드 (1:1)', minWidth: 1080, minHeight: 1080, maxSizeMB: 4096, maxDurationSec: 240, formats: ['MP4', 'MOV'], ratio: '1:1' },
  { name: '스토리 (9:16)', minWidth: 1080, minHeight: 1920, maxSizeMB: 4096, maxDurationSec: 15, formats: ['MP4', 'MOV'], ratio: '9:16' },
  { name: '릴스 (9:16)', minWidth: 1080, minHeight: 1920, maxSizeMB: 4096, maxDurationSec: 90, formats: ['MP4', 'MOV'], ratio: '9:16' },
]

export function getImageSpecs(platform: Platform): ImageSpec[] {
  const specs: Record<Platform, ImageSpec[]> = {
    kakao: KakaoImageSpecs,
    naver: NaverImageSpecs,
    google: GoogleImageSpecs,
    meta: MetaImageSpecs,
  }
  return specs[platform]
}

export function getVideoSpecs(platform: Platform): VideoSpec[] {
  const specs: Record<Platform, VideoSpec[]> = {
    kakao: KakaoVideoSpecs,
    naver: NaverVideoSpecs,
    google: GoogleVideoSpecs,
    meta: MetaVideoSpecs,
  }
  return specs[platform]
}

export interface SpecCheckResult {
  matched: ImageSpec | VideoSpec | null
  matchType: 'exact' | 'ratio-match' | 'no-match'
  similarity: number
}

const TOLERANCE = 0.1

export function checkImageSpec(uploadedWidth: number, uploadedHeight: number, spec: ImageSpec): SpecCheckResult {
  if (uploadedWidth === spec.width && uploadedHeight === spec.height) {
    return { matched: spec, matchType: 'exact', similarity: 1.0 }
  }
  const uploadedRatio = uploadedWidth / uploadedHeight
  const specRatio = spec.width / spec.height
  const ratioDiff = Math.abs(uploadedRatio - specRatio) / specRatio
  if (ratioDiff <= TOLERANCE) {
    return { matched: spec, matchType: 'ratio-match', similarity: 1.0 - ratioDiff }
  }
  return { matched: null, matchType: 'no-match', similarity: 0 }
}

export function checkVideoSpec(uploadedWidth: number, uploadedHeight: number, uploadedDurationSec: number, spec: VideoSpec): SpecCheckResult {
  const uploadedRatio = uploadedWidth / uploadedHeight
  const specRatio = spec.minWidth / spec.minHeight
  const meetsMinRes = uploadedWidth >= spec.minWidth && uploadedHeight >= spec.minHeight
  const ratioDiff = Math.abs(uploadedRatio - specRatio) / specRatio
  const ratioOk = ratioDiff <= TOLERANCE
  const durationOk = uploadedDurationSec <= spec.maxDurationSec
  if (meetsMinRes && ratioOk && durationOk) {
    return { matched: spec, matchType: 'exact', similarity: 1.0 - ratioDiff }
  }
  if (ratioOk && durationOk) {
    return { matched: spec, matchType: 'ratio-match', similarity: 0.7 }
  }
  return { matched: null, matchType: 'no-match', similarity: 0 }
}
