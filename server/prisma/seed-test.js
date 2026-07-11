/**
 * @file seed-test.js
 * @description Resets the dedicated test database (production_tracker_test)
 * to a small, fake, static baseline: one of each master-data entity, wired
 * together, plus one completed ProductionRun with a recorded parameter value.
 * completion.e2e.test.js needs exactly this shape to "borrow" as its template
 * fixture (see its findFirst({ where: { status: 'completed' } }) call).
 *
 * This data is intentionally boring and fake — it is never synced from real
 * production data, and re-running this script always wipes the test database
 * back to this same known baseline. Run via `npm run seed:test` from server/,
 * never directly with `node` (see assertTestDatabase.js).
 */
import '../lib/assertTestDatabase.js'
import prisma from '../lib/prisma.js'

console.log('Wiping production_tracker_test...')
// Children before parents, so every foreign key is gone before its target row.
await prisma.runParameterValue.deleteMany()
await prisma.materialUsage.deleteMany()
await prisma.runOutput.deleteMany()
await prisma.productionRun.deleteMany()
await prisma.recipeItem.deleteMany()
await prisma.recipe.deleteMany()
await prisma.machineProduct.deleteMany()
await prisma.machineParameter.deleteMany()
await prisma.product.deleteMany()
await prisma.material.deleteMany()
await prisma.machine.deleteMany()
await prisma.operator.deleteMany()
await prisma.parameter.deleteMany()

console.log('Seeding baseline fixtures...')
const operator = await prisma.operator.create({ data: { name: 'Test Operator', active: true } })
const machine = await prisma.machine.create({ data: { name: 'Test Machine', code: 'TEST-M1' } })
const parameter = await prisma.parameter.create({ data: { name: 'Test Parameter', unit: 'C' } })
const machineParameter = await prisma.machineParameter.create({
    data: { machineId: machine.id, parameterId: parameter.id, displayOrder: 0 }
})
const product = await prisma.product.create({
    data: { name: 'Test Product', code: 'TEST-P1', unit: 'kg' }
})
await prisma.machineProduct.create({ data: { machineId: machine.id, productId: product.id } })
const material = await prisma.material.create({
    data: { name: 'Test Material', unit: 'kg', stockQty: 1000 }
})
const recipe = await prisma.recipe.create({
    data: { name: 'Test Recipe', isDefault: true, productId: product.id }
})
await prisma.recipeItem.create({
    data: { recipeId: recipe.id, materialId: material.id, percentage: 100 }
})

const now = new Date()
const templateRun = await prisma.productionRun.create({
    data: {
        date: now,
        startTime: now,
        endTime: now,
        status: 'completed',
        operatorId: operator.id,
        machineId: machine.id,
        productId: product.id,
        recipeId: recipe.id
    }
})
await prisma.runParameterValue.create({
    data: { productionRunId: templateRun.id, machineParameterId: machineParameter.id, value: 200 }
})

console.log('Done. Baseline: 1 operator, 1 machine, 1 product, 1 material, 1 recipe, 1 completed run.')
await prisma.$disconnect()
