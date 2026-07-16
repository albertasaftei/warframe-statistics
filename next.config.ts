import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "warframe.market",
        pathname: "/static/assets/**",
      },
    ],
  },
};

export default nextConfig;
