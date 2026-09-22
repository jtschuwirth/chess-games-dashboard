import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * firebase-admin brings in @opentelemetry/api, whose "module" entry is an ESM build
   * with extensionless relative imports that the bundler cannot resolve. Next's own
   * tracer imports it, so serverExternalPackages is not enough — point the bundler at
   * the package's working CommonJS build instead.
   */
  serverExternalPackages: ["firebase-admin"],
  turbopack: {
    resolveAlias: {
      "@opentelemetry/api": "@opentelemetry/api/build/src/index.js",
    },
  },
};

export default nextConfig;
