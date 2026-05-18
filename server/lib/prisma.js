/**
 * Provides the shared Prisma Client singleton for the backend.
 * Centralizes database access for every Express route module.
 * Prevents each router from creating its own connection pool.
 */
import { PrismaClient } from '@prisma/client'

/**
 * Shared Prisma client instance.
 *
 * Route modules import this singleton so database access goes through one
 * configured client instead of creating a new connection pool per file.
 *
 * @type {PrismaClient}
 */
const prisma = new PrismaClient()

export default prisma
