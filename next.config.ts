import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // @ts-ignore - The types might be outdated but the feature exists in recent versions
    turbopack: {
      root: "./"
    }
  }
};

export default nextConfig;
