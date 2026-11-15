import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // every Vercel deploy gets its own asset URLs (?dpl=<id>): the CDN caches /_next/static forever, and a
  // stylesheet that kept its name across deploys was served stale (old layout on phones)
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
