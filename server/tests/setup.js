/**
 * @file setup.js
 * @description Vitest setupFiles entry: runs before EACH test file, inside
 * that file's own worker process. The import order below is the contract —
 * (1) load .env.test, (2) assertTestDatabase.js hard-exits the worker unless
 * DATABASE_URL points at the test database. No test file can ever run a
 * query against real production data, even with a broken config.
 */
import './loadTestEnv.js'
import '../lib/assertTestDatabase.js'
import { afterAll } from 'vitest'

// Prisma's open connection pool keeps the worker process alive after the last
// test — disconnect so the fork exits cleanly (no hang warnings, no zombie
// Postgres sessions). Dynamic import on purpose: Node's module cache returns
// the SAME shared instance the routes used, so this closes the real pool.
afterAll(async () => {
    const { default: prisma } = await import('../lib/prisma.js')
    await prisma.$disconnect()
})
