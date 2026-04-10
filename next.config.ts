import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['xlsx'],
  serverExternalPackages: ['mongodb'],
  // 대용량 CSV 파일 업로드 지원 (모티브 광고성과 등 최대 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
