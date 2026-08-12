import type { NextConfig } from "next";

// apps/web (Expo, a different origin in dev — :8081 vs this app's :3000 —
// and always a different origin in production, since it's a native/web app
// served from its own domain) needs to fetch this API's routes and static
// dataset files cross-origin. No cookies/credentials are involved (identity
// is a token in the request body, not a cookie), so a wide-open
// Access-Control-Allow-Origin is appropriate for this public game API.
const CORS_HEADERS = [
  { key: "Access-Control-Allow-Origin", value: "*" },
  { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@321guess/core"],
  async headers() {
    return [
      { source: "/api/:path*", headers: CORS_HEADERS },
      { source: "/data/:path*", headers: CORS_HEADERS },
    ];
  },
};

export default nextConfig;
