// Main server file for the production tracker application. Sets up the Express server, middleware and routes.
// We are importing the necessary modules and route handlers for our application. 
// We use Express to create the server, The web framework that handles incoming HTTP requests (like GET and POST).
import express from 'express'
// We are importing the CORS middleware to enable Cross-Origin Resource Sharing, 
// which allows our frontend application (running on a different origin) 
// to make requests to this backend server without being blocked by the browser's same-origin policy.
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

// We are creating an instance of the Express application 
// and defining the port number on which the server will listen for incoming requests.
const app = express()
const PORT = 3000

// We are setting up middleware for our Express application. 
app.use(cors())
// We are using the built-in express.json() middleware to automatically parse JSON request 
// bodies and make them available on req.body in our route handlers.
app.use(express.json())

// We are mounting our route handlers on specific paths. Each router handles a different set of related endpoints, 
// and we are organizing them into separate files for better maintainability.
app.use('/api/operators', operatorsRouter)
app.use('/api/machines', machinesRouter)
app.use('/api/parameters', parametersRouter)
app.use('/api/products', productsRouter)
app.use('/api/materials', materialsRouter)
app.use('/api/machine-parameters', machineParametersRouter)
app.use('/api/machine-products', machineProductsRouter)
app.use('/api/recipes', recipesRouter)
app.use('/api/production-runs', productionRunsRouter) 

// We are adding a simple health check endpoint at /ping that returns a JSON response indicating that the server is alive. 
// This can be used by monitoring tools or the frontend to check if the backend is running and responsive.
app.get('/ping', (req, res) => {
  res.json({ message: 'Server is alive!' })
})

// Finally, we are starting the server by calling app.listen() and passing in the port number 
// and a callback function that logs a message to the console when the server is successfully running.
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
