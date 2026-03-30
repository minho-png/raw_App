import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['xlsx'],
  serverExternalPackages: ['mongodb'],
};

export default nextConfig;
