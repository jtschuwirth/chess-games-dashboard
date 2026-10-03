import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  /**
   * firebase-admin brings in @opentelemetry/api, whose "module" entry is an ESM build
   * with extensionless relative imports that the bundler cannot resolve. Next's own
   * tracer imports it, so serverExternalPackages is not enough — point the bundler at
   * the package's working CommonJS build instead.
   *
   * stockfish is external for a different reason: its loader reaches for `self` and
   * fetches its own wasm, so it has to be required at run time rather than bundled.
   */
  serverExternalPackages: ['firebase-admin', 'stockfish'],
  turbopack: {
    resolveAlias: {
      '@opentelemetry/api': '@opentelemetry/api/build/src/index.js',
    },
  },
  /**
   * File tracing follows `require` calls, and the engine asks for its wasm by a path it
   * builds at run time — so nothing points at the binary and it would be left out of the
   * deployed function. Without this the engine route works locally and 500s on Vercel.
   */
  outputFileTracingIncludes: {
    '/api/engine': ['./node_modules/stockfish/bin/stockfish-19-lite-single.*'],
  },
  /**
   * The package ships every flavour of the engine, and two of them carry a 99 MB NNUE
   * network. Traced whole it came to 306 MB for one function, against Vercel's 250 MB
   * ceiling — so the deployment would have failed on upload rather than at run time.
   * Only the lite single-threaded build is ever loaded; the rest is dead weight.
   */
  outputFileTracingExcludes: {
    '/api/engine': [
      'node_modules/stockfish/bin/stockfish-19.*',
      'node_modules/stockfish/bin/stockfish-19-single.*',
      'node_modules/stockfish/bin/stockfish-19-lite.*',
      'node_modules/stockfish/bin/stockfish-19-asm.*',
      'node_modules/stockfish/bin/stockfish.*',
    ],
  },
}

export default nextConfig
