/**
 * @file loadTestEnv.js
 * @description Side-effect module: loads server/.env.test into process.env.
 * This lives in its OWN module because ESM hoists static imports — a
 * dotenv.config() call written between two imports in setup.js would still
 * run AFTER both of them. Import order BETWEEN modules is guaranteed, so
 * importing this module first is what makes the env visible to
 * assertTestDatabase.js on the next import line.
 *
 * dotenv never overrides variables that are already set: a DATABASE_URL
 * exported in the shell wins, and assertTestDatabase.js decides loudly
 * whether it is safe. Never use `import 'dotenv/config'` here — that loads
 * .env, the real database.
 */
import dotenv from 'dotenv'
import { fileURLToPath } from 'node:url'

// Anchored to this file's location, not process.cwd(), so it works no matter
// which directory vitest is launched from; fileURLToPath converts the file://
// URL into a plain Windows path that dotenv can open.
dotenv.config({ path: fileURLToPath(new URL('../.env.test', import.meta.url)) })
