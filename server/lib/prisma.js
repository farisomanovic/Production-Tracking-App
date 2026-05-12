// This file is used to create a single instance of the PrismaClient and export it for use throughout the application.
// We are simply creating a new Object of the PrismaClient class and exporting it as the default export of this module.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export default prisma