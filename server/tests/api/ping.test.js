/**
 * @file ping.test.js
 * @description Smoke test: proves the whole test pipeline works — vitest
 * config, .env.test loading, the test-DB guard, the app import, and a
 * Supertest request — before any database-touching test exists. If this
 * fails, fix the plumbing before reading any other test failure.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../app.js'

describe('GET /ping', () => {
    it('answers without touching the database', async () => {
        const res = await request(app).get('/ping')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ message: 'Server is alive!' })
    })
})
