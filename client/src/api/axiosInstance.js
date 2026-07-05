/**
 * @file axiosInstance.js
 * @description The one shared Axios instance every api/*.js helper builds on.
 * Base URL configuration belongs here and nowhere else; endpoint paths belong
 * in the per-resource helper files.
 */
import axios from 'axios'

const api = axios.create({
  // TODO: hardcoded host means the app only works when the browser runs on the
  // same machine as the API — a tablet on the shop floor cannot reach
  // "localhost". Read import.meta.env.VITE_API_URL with this as the dev
  // fallback. todo.md Group 1 #1.
  // TODO: no response interceptor and no timeout — network failures surface only
  // as console errors in individual catch blocks, and a hung request spins
  // forever. Group 1 #1.
  baseURL: 'http://localhost:3000/api',
})

export default api
