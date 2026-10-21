import type { NextConfig } from "next";

const imageOrigin = new URL(process.env.NEXT_PUBLIC_STRAPI_URL || "http://127.0.0.1:1337");
const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),
  images: {
    remotePatterns: [{
      protocol: imageOrigin.protocol === "https:" ? "https" : "http",
      hostname: imageOrigin.hostname,
      port: imageOrigin.port,
      pathname: "/uploads/**",
    }],
  },
};

export default nextConfig;
