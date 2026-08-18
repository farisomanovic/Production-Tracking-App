/**
 * @file optionalTextTrim.test.js
 * @description Tests for normalizeOptionalText across every optional free-text
 * field. These fields carry no unique constraint, which is why they went
 * unnormalized — but several are de facto grouping keys, and " PakOm" vs
 * "PakOm " renders identically in a dropdown and in the XLSX export while never
 * grouping together.
 *
 * Two rules per field: padding is stripped, and whitespace-only collapses to
 * null so a cleared field is ONE value rather than any of "", " ", "\n".
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-TRIM'

let baseline
let isolatedMachine

async function cleanup() {
    await prisma.productionRun.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machineProduct.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipeItem.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()
    isolatedMachine = await prisma.machine.create({
        data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1` }
    })
    await prisma.machineProduct.create({
        data: { machineId: isolatedMachine.id, productId: baseline.product.id }
    })
})

afterAll(cleanup)

describe('POST /api/materials — supplier', () => {
    it('strips padding from a supplier', async () => {
        const res = await request(app).post('/api/materials')
            .send({ name: `${PREFIX} padded supplier`, unit: 'kg', supplier: '   PakOm   ' })
        expect(res.status).toBe(201)
        expect(res.body.supplier).toBe('PakOm')
    })

    it('stores a whitespace-only supplier as null', async () => {
        const res = await request(app).post('/api/materials')
            .send({ name: `${PREFIX} blank supplier`, unit: 'kg', supplier: '   ' })
        expect(res.status).toBe(201)
        expect(res.body.supplier).toBeNull()
    })
})

describe('PUT /api/materials/:id — supplier', () => {
    it('strips padding from a supplier on update', async () => {
        const created = await prisma.material.create({
            data: { name: `${PREFIX} put supplier`, unit: 'kg' }
        })
        const res = await request(app).put(`/api/materials/${created.id}`)
            .send({ supplier: '  Bosnaplast  ' })
        expect(res.status).toBe(200)
        expect(res.body.supplier).toBe('Bosnaplast')
    })
})

describe('POST /api/products — description', () => {
    it('strips padding from a description', async () => {
        const res = await request(app).post('/api/products')
            .send({ name: `${PREFIX} padded desc`, code: `${PREFIX}-P1`, unit: 'kg', description: '  wide roll  ' })
        expect(res.status).toBe(201)
        expect(res.body.description).toBe('wide roll')
    })

    it('stores a whitespace-only description as null', async () => {
        const res = await request(app).post('/api/products')
            .send({ name: `${PREFIX} blank desc`, code: `${PREFIX}-P2`, unit: 'kg', description: '  ' })
        expect(res.status).toBe(201)
        expect(res.body.description).toBeNull()
    })
})

describe('PUT /api/products/:id — description', () => {
    it('strips padding from a description on update', async () => {
        const created = await prisma.product.create({
            data: { name: `${PREFIX} put desc`, code: `${PREFIX}-P3`, unit: 'kg' }
        })
        const res = await request(app).put(`/api/products/${created.id}`)
            .send({ description: '  thin foil  ' })
        expect(res.status).toBe(200)
        expect(res.body.description).toBe('thin foil')
    })
})

describe('POST /api/parameters — unit and description', () => {
    // Parameter.unit is deliberately free text (CLAUDE.md names it the
    // exception to VALID_UNITS). Trimming is not validation and does not
    // close that vocabulary — it only stops "bar" and "bar " being two units.
    it('strips padding from a free-text unit', async () => {
        const res = await request(app).post('/api/parameters')
            .send({ name: `${PREFIX} padded unit`, unit: '  m/min  ' })
        expect(res.status).toBe(201)
        expect(res.body.unit).toBe('m/min')
    })

    it('stores a whitespace-only unit as null', async () => {
        const res = await request(app).post('/api/parameters')
            .send({ name: `${PREFIX} blank unit`, unit: '   ' })
        expect(res.status).toBe(201)
        expect(res.body.unit).toBeNull()
    })

    it('strips padding from a description', async () => {
        const res = await request(app).post('/api/parameters')
            .send({ name: `${PREFIX} padded pdesc`, description: '  melt zone 3  ' })
        expect(res.status).toBe(201)
        expect(res.body.description).toBe('melt zone 3')
    })
})

describe('PUT /api/parameters/:id — unit', () => {
    it('strips padding from a unit on update', async () => {
        const created = await prisma.parameter.create({ data: { name: `${PREFIX} put unit` } })
        const res = await request(app).put(`/api/parameters/${created.id}`).send({ unit: '  bar  ' })
        expect(res.status).toBe(200)
        expect(res.body.unit).toBe('bar')
    })
})

describe('POST /api/recipes — notes', () => {
    it('strips padding from notes', async () => {
        const res = await request(app).post('/api/recipes').send({
            name: `${PREFIX} recipe`,
            productIds: [baseline.product.id],
            notes: '  summer mix  ',
            items: [{ materialId: baseline.material.id, percentage: 100 }]
        })
        expect(res.status).toBe(201)
        expect(res.body.notes).toBe('summer mix')
    })
})

describe('POST /api/production-runs — notes and potentialBuyer', () => {
    it('strips padding from notes and potentialBuyer', async () => {
        const res = await request(app).post('/api/production-runs').send({
            date: new Date().toISOString(),
            startTime: new Date().toISOString(),
            operatorId: baseline.operator.id,
            machineId: isolatedMachine.id,
            productId: baseline.product.id,
            recipeId: baseline.recipe.id,
            notes: '  ran clean  ',
            potentialBuyer: '  Agrokor  '
        })
        expect(res.status).toBe(201)
        expect(res.body.notes).toBe('ran clean')
        expect(res.body.potentialBuyer).toBe('Agrokor')
        await prisma.productionRun.delete({ where: { id: res.body.id } })
    })

    it('stores whitespace-only notes as null', async () => {
        const res = await request(app).post('/api/production-runs').send({
            date: new Date().toISOString(),
            startTime: new Date().toISOString(),
            operatorId: baseline.operator.id,
            machineId: isolatedMachine.id,
            productId: baseline.product.id,
            recipeId: baseline.recipe.id,
            notes: '   '
        })
        expect(res.status).toBe(201)
        expect(res.body.notes).toBeNull()
        await prisma.productionRun.delete({ where: { id: res.body.id } })
    })
})
