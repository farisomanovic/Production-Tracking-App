/**
 * @file vite.config.js
 * @description Vite build/dev-server configuration. Only the React plugin is
 * registered — dev proxying is not needed because the API is called directly
 * on localhost:3000 with CORS open (see axiosInstance.js TODOs).
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
