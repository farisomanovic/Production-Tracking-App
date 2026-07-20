/**
 * @file app.js
 * @description Builds and exports the Express app: global middleware and one
 * router per domain resource. Route logic lives in ./routes/*.js, database
 * access in ./lib/prisma.js. Deliberately NO env loading and NO listening
 * here — index.js owns both. Tests import this app directly (Supertest), so
 * importing this file must never read .env or occupy a port.
 */
import express from 'express'
import cors from 'cors'
import operatorsRouter from './routes/operators.js'
import machinesRouter from './routes/machines.js'
import parametersRouter from './routes/parameters.js'
import productsRouter from './routes/products.js'
import materialsRouter from './routes/materials.js'
import machineParametersRouter from './routes/machineParameters.js'
import machineProductsRouter from './routes/machineProducts.js'
import recipesRouter from './routes/recipes.js'
import recipeProductsRouter from './routes/recipeProducts.js'
import productionRunsRouter from './routes/productionRuns.js'
import errorHandler from './middleware/errorHandler.js'
import { assertClientOriginConfigured } from './lib/assertClientOrigin.js'

const app = express()

// cors() treats a falsy origin option the same as origin: '*' (allow any
// origin) — a missing env var must crash loudly here, not silently open
// CORS to every site.
const clientOrigin = assertClientOriginConfigured(process.env.CLIENT_ORIGIN)
app.use(cors({ origin: clientOrigin }))
// Registered before the routers on purpose: express.json() is what fills req.body,
// and Express runs middleware strictly in registration order — moved below the
// routers, every handler would see req.body === undefined.
app.use(express.json())

// TODO: no authentication — anyone who can reach this host can read and mutate all
// data. Auth middleware belongs here, above the routers, so every /api route is
// gated in one place. See todo.md Group 1 #4.
app.use('/api/operators', operatorsRouter)
app.use('/api/machines', machinesRouter)
app.use('/api/parameters', parametersRouter)
app.use('/api/products', productsRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/machine-parameters', machineParametersRouter)
app.use('/api/machine-products', machineProductsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api/recipe-products', recipeProductsRouter)
app.use('/api/production-runs', productionRunsRouter)

/**
 * Health check that proves the process is up without touching the database —
 * useful to distinguish "server down" from "database down" while debugging.
 *
 * @param {import('express').Request} req - Unused.
 * @param {import('express').Response} res - Always 200 with a static JSON body.
 * @returns {void}
 *
 * @example
 * // GET http://localhost:3000/ping
 * // → 200 { "message": "Server is alive!" }
 */
app.get('/ping', (req, res) => {
  res.json({ message: 'Server is alive!' })
})

// Registered LAST: Express only treats 4-arg functions as error handlers, and
// routing only reaches here for errors thrown/rejected anywhere above.
app.use(errorHandler)

export default app
