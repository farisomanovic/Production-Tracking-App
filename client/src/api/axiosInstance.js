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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message =
        error.response.data?.error || error.response.data?.message || 'Something went wrong. Please try again.'
      alert(message)
    } else {
      alert('Could not reach the server. Check your connection and try again.')
    }
    return Promise.reject(error)
  }
)

export default api
