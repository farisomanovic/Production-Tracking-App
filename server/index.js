/**
 * @file index.js
 * @description Server entry point: loads the environment, then starts the app
 * listening. All app wiring (middleware, routers) lives in app.js — the split
 * lets tests import the app without reading .env or starting a server.
 */
// MUST stay the first import: app.js reads process.env.CLIENT_ORIGIN while it
// is being evaluated, and ESM executes static imports in declaration order.
import 'dotenv/config'
import app from './app.js'
import prisma from './lib/prisma.js'
import { createShutdownHandler } from './lib/shutdown.js'

const PORT = process.env.PORT || 3000

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})

const shutdown = createShutdownHandler({ server, prisma })
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
