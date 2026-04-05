import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  outputFileTracingExcludes: {
    '*': ['data/recomendarr.db-shm', 'data/recomendarr.db-wal'],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
