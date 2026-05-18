/**
 * Mounts the React application into the browser DOM.
 * Loads global styles before rendering route-level components.
 * Enables React StrictMode diagnostics during development.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
