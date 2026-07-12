/**
 * @file seed-test.js
 * @description CLI wrapper that resets the dedicated test database
 * (production_tracker_test) to its known baseline. The actual wipe-and-seed
 * routine lives in seedTestDatabase.js so the Vitest globalSetup can reuse
 * it. Run via `npm run seed:test` from server/, never directly with `node`
 * (see assertTestDatabase.js).
 */
import '../lib/assertTestDatabase.js'
import prisma from '../lib/prisma.js'
import { seedTestDatabase } from './seedTestDatabase.js'

await seedTestDatabase()
await prisma.$disconnect()
