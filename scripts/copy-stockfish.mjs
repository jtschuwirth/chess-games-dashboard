#!/usr/bin/env node
/**
 * Copies the Stockfish worker out of node_modules so it can be served from /public.
 * Runs on postinstall; the copies are gitignored.
 *
 * The single-threaded lite build is deliberate: the multi-threaded one needs
 * cross-origin isolation headers, which would constrain where this can be hosted.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const FILES = ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm']
const src = path.join('node_modules', 'stockfish', 'bin')
const dest = 'public'

mkdirSync(dest, { recursive: true })

for (const file of FILES) {
  copyFileSync(path.join(src, file), path.join(dest, file))
  console.log(`Copied ${file} -> ${dest}/`)
}
