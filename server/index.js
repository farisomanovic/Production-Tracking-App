/**
 * Application entry point.
 *
 * Configures the Express HTTP server, shared middleware, and API route mounts for
 * the production tracking backend.
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
const PORT = 3000

// Allow the frontend origin to call this API from the browser.
app.use(cors())
// Parse JSON payloads so route handlers can read request bodies from req.body.
app.use(express.json())

// Mount each domain router under its API namespace.
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
 * GET /ping
 *
 * Lightweight health check used to verify that the API process is reachable.
 */
app.get('/ping', (req, res) => {
  res.json({ message: 'Server is alive!' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
