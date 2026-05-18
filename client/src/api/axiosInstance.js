/**
 * Configures the shared Axios instance for frontend API calls.
 * Centralizes the Express API base URL used by all client helpers.
 * Keeps page components independent from low-level HTTP configuration.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
})

export default api
