import { PrismaClient } from '@prisma/client'

/**
 * Shared Prisma client instance.
 *
 * Route modules import this singleton so database access goes through one
 * configured client instead of creating a new connection pool per file.
 */
const prisma = new PrismaClient()

export default prisma
