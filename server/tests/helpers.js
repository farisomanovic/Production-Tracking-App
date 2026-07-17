/**
 * @file helpers.js
 * @description Shared test helpers. Deliberately tiny: one function that
 * re-fetches the seed baseline rows. Tests run in a different process than
 * globalSetup (which did the seeding), so fixture ids must be read from the
 * database by their stable unique markers — TEST-M1 / TEST-P1 / the seed
 * names — not passed along in memory. If seed fixtures are ever renamed in
 * seedTestDatabase.js, this is the single place to update.
 */
import prisma from '../lib/prisma.js'

export async function getBaseline() {
    const machine = await prisma.machine.findUnique({ where: { code: 'TEST-M1' } })
    const product = await prisma.product.findUnique({ where: { code: 'TEST-P1' } })
    const operator = await prisma.operator.findFirst({ where: { name: 'Test Operator' } })
    const material = await prisma.material.findFirst({ where: { name: 'Test Material' } })
    const recipe = await prisma.recipe.findFirst({ where: { products: { some: { productId: product.id, isDefault: true } } } })
    return { machine, product, operator, material, recipe }
}
