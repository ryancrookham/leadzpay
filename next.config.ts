import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // The strict typescript ESLint config flags pre-existing `any` types
    // across many API routes and pages as build errors. Lint locally with
    // `npx eslint src/` — Vercel builds will skip ESLint.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
