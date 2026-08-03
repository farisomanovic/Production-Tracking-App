/**
 * @file axiosInstance.js
 * @description The one shared Axios instance every api/*.js helper builds on.
 * Base URL configuration belongs here and nowhere else; endpoint paths belong
 * in the per-resource helper files.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
})

export default api
