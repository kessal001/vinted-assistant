import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { workerThreads: true, cpus: 2, useTypeScriptCli: false },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "127.0.0.1", port: "8000" },
      { protocol: "http", hostname: "localhost", port: "8000" },
    ],
  },
};

export default nextConfig;
