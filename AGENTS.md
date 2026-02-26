# AGENTS.md

## Cursor Cloud specific instructions

This is **Light Tab Page (轻标签页)**, a browser extension (Chrome/Edge/Firefox) that replaces the default new tab page. It is a purely client-side Vue 3 + TypeScript + Vite project — no backend, no database, no Docker.

### Key commands

See `package.json` scripts:
- `pnpm run dev` — Vite dev server at http://localhost:5173
- `pnpm run build` — production build to `dist/`
- `pnpm run watch` — development build in watch mode (for loading as unpacked extension)
- `pnpm run check` — TypeScript type checking via `vue-tsc --noEmit`

### Gotchas

- **No test suite exists.** There are no test files, test scripts, or test framework dependencies.
- **No ESLint config.** The only "lint" check available is `pnpm run check` (TypeScript type checking).
- **pnpm v10 blocks build scripts by default.** After `pnpm install`, you must manually run esbuild's install script so Vite can work: `node node_modules/.pnpm/esbuild@0.18.20/node_modules/esbuild/install.js`. The version may change if esbuild is updated.
- **pnpm-lock.yaml is gitignored**, so `pnpm install` resolves fresh dependencies each time.
- **Browser extension testing** requires building (`pnpm run build`) and loading `dist/` as an unpacked extension in Chrome via `chrome://extensions/` with Developer Mode enabled. The Vite dev server (`pnpm run dev`) serves the page for web-based development/preview only.
