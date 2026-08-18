/**
 * @file activeFilter.test.js
 * @description Tests for the shared `?active=` list filter (lib/queryFilters.js)
 * across every endpoint that accepts it. The filter exists so "inactive rows are
 * not selectable" stops being a `.filter()` each consumer had to remember and
 * becomes something the server enforces once.
 *
 * The two link endpoints are covered separately at the bottom because their
 * filter applies to the LINKED row, not to the link.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../app.js'
import prisma from '../../lib/prisma.js'
import { getBaseline } from '../helpers.js'

const PREFIX = 'VT-ACTFILTER'

let baseline
let machine
const ids = {}

async function cleanup() {
    await prisma.machineParameter.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.machineProduct.deleteMany({ where: { machine: { code: { startsWith: PREFIX } } } })
    await prisma.recipeProduct.deleteMany({ where: { recipe: { name: { startsWith: PREFIX } } } })
    await prisma.recipe.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.parameter.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.material.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.product.deleteMany({ where: { code: { startsWith: PREFIX } } })
    await prisma.operator.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.machine.deleteMany({ where: { code: { startsWith: PREFIX } } })
}

beforeAll(async () => {
    await cleanup()
    baseline = await getBaseline()

    // One INACTIVE row per entity: the filter can only be proven by a row that
    // the unfiltered call returns and the filtered call does not.
    ids.operator = (await prisma.operator.create({
        data: { name: `${PREFIX} operator`, active: false }
    })).id
    ids.machine = (await prisma.machine.create({
        data: { name: `${PREFIX} machine`, code: `${PREFIX}-M1`, active: false }
    })).id
    ids.product = (await prisma.product.create({
        data: { name: `${PREFIX} product`, code: `${PREFIX}-P1`, unit: 'kg', active: false }
    })).id
    ids.material = (await prisma.material.create({
        data: { name: `${PREFIX} material`, unit: 'kg', active: false }
    })).id
    ids.parameter = (await prisma.parameter.create({
        data: { name: `${PREFIX} parameter`, active: false }
    })).id
    ids.recipe = (await prisma.recipe.create({
        data: {
            name: `${PREFIX} recipe`,
            active: false,
            products: { create: [{ productId: baseline.product.id }] }
        }
    })).id

    // A machine carrying links to the inactive product and inactive parameter,
    // for the two link endpoints at the bottom.
    machine = await prisma.machine.create({
        data: { name: `${PREFIX} linked`, code: `${PREFIX}-M2` }
    })
    await prisma.machineProduct.create({ data: { machineId: machine.id, productId: ids.product } })
    await prisma.machineProduct.create({ data: { machineId: machine.id, productId: baseline.product.id } })
    await prisma.machineParameter.create({
        data: { machineId: machine.id, parameterId: ids.parameter, displayOrder: 0 }
    })
})

afterAll(cleanup)

const ENDPOINTS = [
    ['operators', '/api/operators', () => ids.operator],
    ['machines', '/api/machines', () => ids.machine],
    ['products', '/api/products', () => ids.product],
    ['materials', '/api/materials', () => ids.material],
    ['parameters', '/api/parameters', () => ids.parameter],
    ['recipes', '/api/recipes', () => ids.recipe]
]

describe.each(ENDPOINTS)('GET %s — ?active= filtering', (name, path, inactiveId) => {
    it(`returns the inactive row when active is omitted`, async () => {
        const res = await request(app).get(path)
        expect(res.status).toBe(200)
        expect(res.body.some(row => row.id === inactiveId())).toBe(true)
    })

    it(`excludes the inactive row with ?active=true`, async () => {
        const res = await request(app).get(`${path}?active=true`)
        expect(res.status).toBe(200)
        expect(res.body.some(row => row.id === inactiveId())).toBe(false)
        // Not merely "empty" — an endpoint that returned nothing at all would
        // also pass the line above.
        expect(res.body.every(row => row.active === true)).toBe(true)
    })

    it(`returns only inactive rows with ?active=false`, async () => {
        const res = await request(app).get(`${path}?active=false`)
        expect(res.status).toBe(200)
        expect(res.body.some(row => row.id === inactiveId())).toBe(true)
        expect(res.body.every(row => row.active === false)).toBe(true)
    })

    it(`rejects a non-boolean active value with 400`, async () => {
        const res = await request(app).get(`${path}?active=banana`)
        expect(res.status).toBe(400)
        expect(res.body.error).toBe("active must be either 'true' or 'false'")
    })

    it(`rejects a repeated active key with 400`, async () => {
        const res = await request(app).get(`${path}?active=true&active=false`)
        expect(res.status).toBe(400)
        expect(res.body.error).toBe('active must be a single value')
    })
})

describe('GET /api/machine-products/machine/:machineId — filters the linked product', () => {
    it('returns links to inactive products when active is omitted', async () => {
        const res = await request(app).get(`/api/machine-products/machine/${machine.id}`)
        expect(res.status).toBe(200)
        expect(res.body.some(link => link.productId === ids.product)).toBe(true)
    })

    it('drops links to inactive products with ?active=true, keeping the rest', async () => {
        const res = await request(app).get(`/api/machine-products/machine/${machine.id}?active=true`)
        expect(res.status).toBe(200)
        expect(res.body.some(link => link.productId === ids.product)).toBe(false)
        // The active link must survive — a filter that dropped everything would
        // pass the assertion above and still be broken.
        expect(res.body.some(link => link.productId === baseline.product.id)).toBe(true)
    })
})

describe('GET /api/machine-parameters/machine/:machineId — filters the linked parameter', () => {
    it('returns links to inactive parameters when active is omitted', async () => {
        const res = await request(app).get(`/api/machine-parameters/machine/${machine.id}`)
        expect(res.status).toBe(200)
        expect(res.body.some(link => link.parameterId === ids.parameter)).toBe(true)
    })

    it('drops links to inactive parameters with ?active=true', async () => {
        const res = await request(app).get(`/api/machine-parameters/machine/${machine.id}?active=true`)
        expect(res.status).toBe(200)
        expect(res.body.some(link => link.parameterId === ids.parameter)).toBe(false)
    })
})
