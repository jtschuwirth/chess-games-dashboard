#!/usr/bin/env node
/**
 * Copies the Stockfish worker out of node_modules so it can be served from /public.
 * Runs on postinstall; the copies are gitignored.
 *
 * The single-threaded lite build is deliberate: the multi-threaded one needs
 * cross-origin isolation headers, which would constrain where this can be hosted.
 * Lite is equally deliberate — the full build carries a 99 MB NNUE network, which is
 * not something to hand a browser.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const FILES = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']
const src = path.join('node_modules', 'stockfish', 'bin')
const dest = 'public'

mkdirSync(dest, { recursive: true })

// an upgrade renames the build, so last version's copy would otherwise sit in public
// for ever: served by nothing, shipped by every deploy
for (const file of readdirSync(dest)) {
  if (file.startsWith('stockfish-') && !FILES.includes(file)) {
    rmSync(path.join(dest, file))
    console.log(`Removed stale ${file}`)
  }
}

for (const file of FILES) {
  copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`Copied ${file} -> ${dest}/`)
}
