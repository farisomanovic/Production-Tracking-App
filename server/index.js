/**
 * @file index.js
 * @description Express entry point: builds the app, registers global middleware,
 * mounts one router per domain resource, and starts listening. Only wiring belongs
 * here — route logic lives in ./routes/*.js, database access in ./lib/prisma.js.
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
import productionRunsRouter from './routes/productionRuns.js'

const app = express()
// TODO: hardcoded port — should be process.env.PORT with a 3000 fallback, plus
// `import 'dotenv/config'` at the top of this file. dotenv is installed but never
// loaded; DATABASE_URL only works because Prisma auto-reads .env itself, so any
// NEW env var would silently be undefined. See todo.md Group 1 #1.
const PORT = 3000

// TODO: cors() with no options accepts requests from ANY origin. Combined with the
// missing auth below this makes the API fully open — restrict it once env loading
// exists: app.use(cors({ origin: process.env.CLIENT_ORIGIN })). todo.md Group 1 #2.
app.use(cors())
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

// TODO: no central error middleware — every router hand-rolls try/catch and most
// failures collapse to a generic 500. One `app.use((err, req, res, next) => …)`
// registered here, LAST (Express only treats 4-arg functions as error handlers),
// would fix the wrong status codes in one place. See todo.md Group 4 #5.
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
