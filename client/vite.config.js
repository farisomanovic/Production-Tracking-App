/**
 * @file vite.config.js
 * @description Vite build/dev-server configuration. Two things live here: the
 * React plugin, and a build-time assertion that `VITE_API_URL` is set.
 *
 * Why that assertion is here and not only in axiosInstance.js: Vite inlines
 * `import.meta.env` at build time, so by the moment the running app could notice
 * the value is missing, the broken bundle already exists and has probably already
 * been uploaded. Checking during `vite build` moves the failure into the terminal
 * of the person running the build — the last point where it is cheap to fix.
 * `loadEnv()` reads the same .env files and the same VITE_-prefixed `process.env`
 * that Vite is about to inline, so the value checked here is exactly the value
 * that would be baked in.
 *
 * Only `command === 'build'` is guarded. `vite` (dev) and `vite preview` are both
 * command 'serve': dev is entitled to the localhost fallback, and preview merely
 * serves a dist/ whose base URL was decided — and checked — when it was built.
 *
 * There is deliberately NO exemption for `vite build --mode development`, because
 * mode does not drive `import.meta.env.DEV`: NODE_ENV does, and Vite defaults it
 * to 'production' for every build regardless of mode. Such a bundle would have
 * `DEV === false` and would throw in the browser, so it has to be caught here too.
 *
 * Dev proxying is still not configured — the dev server calls the API directly on
 * localhost:3000, which CORS on the server already allows.
 */
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolveApiBaseUrl } from './src/lib/apiBaseUrl.js'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // Called for its throw; the return value is discarded because Vite does the
    // inlining itself, from this same loadEnv() data. import.meta.dirname rather
    // than process.cwd() so the .env files read are the ones next to this file
    // even when vite is invoked from the repo root with --root.
    resolveApiBaseUrl(loadEnv(mode, import.meta.dirname).VITE_API_URL, { isDev: false })
  }

  return {
    plugins: [react()],
  }
})
