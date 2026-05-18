/**
 * Configures Vite for the React frontend application.
 * Registers the official React plugin used by local dev and builds.
 * Keeps frontend bundling settings centralized at the client root.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
