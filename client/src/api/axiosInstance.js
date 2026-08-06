/**
 * @file axiosInstance.js
 * @description The one shared Axios instance every api/*.js helper builds on.
 * Base URL configuration belongs here and nowhere else; endpoint paths belong
 * in the per-resource helper files.
 *
 * The base URL goes through src/lib/apiBaseUrl.js, which throws rather than
 * silently fall back to localhost in a production bundle. vite.config.js runs the
 * same check during `vite build`, so this call is only a backstop — it can fire
 * solely for a bundle produced without that config.
 */
import axios from 'axios'
import { resolveApiBaseUrl } from '../lib/apiBaseUrl'

// Resolved once at module load rather than per request: Vite has already replaced
// both of these with literals in the bundle, so there is nothing left to re-read.
const api = axios.create({
  baseURL: resolveApiBaseUrl(import.meta.env.VITE_API_URL, { isDev: import.meta.env.DEV }),
})

export default api
