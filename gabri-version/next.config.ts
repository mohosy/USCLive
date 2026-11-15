import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // every Vercel deploy gets its own asset URLs (?dpl=<id>): the CDN caches /_next/static forever, and a
  // stylesheet that kept its name across deploys was served stale (old layout on phones)
  deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // every page and API answer: no MIME sniffing, no full URLs leaked to other sites, and the app cannot be framed
        // by another site (clickjacking)
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      // campus outline and building footprints (3 MB) change only with a deploy: let browsers keep them for a day
      { source: "/data/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }] },
    ];
  },
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
