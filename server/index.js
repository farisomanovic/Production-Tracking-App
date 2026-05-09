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

app.use(cors())
app.use(express.json())

app.use('/api/operators', operatorsRouter)
app.use('/api/machines', machinesRouter)
app.use('/api/parameters', parametersRouter)
app.use('/api/products', productsRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/machine-parameters', machineParametersRouter)
app.use('/api/machine-products', machineProductsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api/production-runs', productionRunsRouter) 

app.get('/ping', (req, res) => {
  res.json({ message: 'Server is alive!' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
