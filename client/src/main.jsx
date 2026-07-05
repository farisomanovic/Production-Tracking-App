/**
 * @file main.jsx
 * @description Browser entry point: mounts <App /> into #root. Nothing else
 * belongs here — global styles are imported for their side effect only.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// StrictMode double-invokes effects in development on purpose — it exposes
// fetch effects that misbehave when run twice (e.g. duplicate POSTs). It has
// zero effect on the production build.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
