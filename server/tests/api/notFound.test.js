/**
 * @file notFound.test.js
 * @description Proves unmatched routes get the same JSON error shape as every
 * other failure in this API. Before the catch-all in app.js, Express handed
 * these to its own finalhandler, which answers with an HTML page — and
 * client/src/lib/errorMessage.js reads `err.response.data.error`, which is
 * undefined on a string body, so a mistyped path showed the user the same
 * generic fallback as a network outage.
 *
 * The last two tests guard POSITION, not presence. The catch-all's correctness
 * lives entirely in where it sits in app.js and nothing in its body says so:
 * moved above the routers it 404s the whole API, moved above cors() it kills
 * preflight. Deleting it is the unlikely regression; moving it is the likely one.
 */
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../../app.js'

describe('unmatched routes', () => {
    it('answers an unknown /api path with JSON naming the method and path', async () => {
        const res = await request(app).get('/api/materialz')
        expect(res.status).toBe(404)
        // Asserting the header too: body.error alone would still pass if a
        // future handler sent JSON text under an HTML content-type, which is
        // exactly the half-fix that would keep axios parsing it as a string.
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body.error).toBe('Cannot GET /api/materialz')
    })

    it('answers an unknown non-/api path with the same JSON contract', async () => {
        // Separately sabotage-able from the case above: a catch-all scoped to
        // '/api' leaves this path on the HTML fallback. The server hosts
        // nothing but the API and /ping, so there is no path that should
        // legitimately answer with a web page.
        const res = await request(app).get('/pingg')
        expect(res.status).toBe(404)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body.error).toBe('Cannot GET /pingg')
    })

    it('answers a known path with an unregistered method in JSON', async () => {
        // /ping is registered for GET only, so POST matches no layer at all —
        // the same finalhandler path as a typo, reached a different way.
        const res = await request(app).post('/ping')
        expect(res.status).toBe(404)
        expect(res.headers['content-type']).toMatch(/json/)
        expect(res.body.error).toBe('Cannot POST /ping')
    })

    it('does not shadow the routers or their own 404s', async () => {
        // Both halves fail if the catch-all is ever registered above the
        // routers: a matched route stops being reached at all, and a route's
        // own resource-specific 404 gets replaced by the generic routing one.
        const alive = await request(app).get('/ping')
        expect(alive.status).toBe(200)
        expect(alive.body).toEqual({ message: 'Server is alive!' })

        const unknownOperator = await request(app).get(`/api/operators/${crypto.randomUUID()}`)
        expect(unknownOperator.status).toBe(404)
        expect(unknownOperator.body.error).toBe('Operator not found')
    })

    it('does not swallow the CORS preflight', async () => {
        // cors() answers OPTIONS itself and ends the response, so preflight
        // must never reach the catch-all. If it does, every cross-origin
        // mutation from the browser fails before its real request is sent —
        // a total client outage that no same-origin test would notice.
        const res = await request(app)
            .options('/api/machines')
            .set('Origin', process.env.CLIENT_ORIGIN)
            .set('Access-Control-Request-Method', 'POST')
        expect(res.status).toBe(204)
        expect(res.headers['access-control-allow-origin']).toBe(process.env.CLIENT_ORIGIN)
    })
})
