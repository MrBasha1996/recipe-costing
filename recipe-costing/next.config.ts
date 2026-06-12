import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
