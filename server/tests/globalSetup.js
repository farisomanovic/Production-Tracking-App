/**
 * @file globalSetup.js
 * @description Vitest globalSetup: runs ONCE per `vitest` invocation, in its
 * own process (NOT the workers that run test files), and resets the test
 * database to the seed baseline so every run starts from a known state.
 * Env is loaded here independently of tests/setup.js — variables set in this
 * process do not reliably reach the worker processes, so both sides load
 * their own and each is guarded by assertTestDatabase.js.
 *
 * Note for watch mode: this does NOT re-run on file-save re-runs, only on
 * launch. Test files clean up before and after themselves, so that's safe;
 * `npm run seed:test` resets the baseline manually anytime.
 */
import './loadTestEnv.js'
import '../lib/assertTestDatabase.js'
import { seedTestDatabase } from '../prisma/seedTestDatabase.js'
import prisma from '../lib/prisma.js'

export default async function globalSetup() {
    await seedTestDatabase()
    await prisma.$disconnect()
}
