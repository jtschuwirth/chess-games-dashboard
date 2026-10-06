/** Resolves the project's `@/*` alias and extensionless relative imports to .ts files. */
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../../../../..')

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const base = path.join(ROOT, 'src', specifier.slice(2))
    for (const candidate of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
  }

  if (specifier.startsWith('.') && !/\.(m?js|ts|json)$/.test(specifier)) {
    const parent = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : ROOT
    const base = path.resolve(parent, specifier)
    for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
  }

  return next(specifier, context)
}
