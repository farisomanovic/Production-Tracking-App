/**
 * @file prisma.js
 * @description Exposes the single shared PrismaClient for the whole backend.
 * Every route module imports this instance; queries, models, and business logic
 * do NOT belong here — only client construction.
 */
import { PrismaClient } from '@prisma/client'

// One instance per process on purpose: Node caches a module after its first
// import, so every router that imports this file receives the SAME client and
// therefore shares one connection pool. Constructing `new PrismaClient()` in each
// route file would open one pool per file (~num_cpus*2+1 connections each) and
// exhaust Postgres' max_connections.
const prisma = new PrismaClient()

export default prisma
