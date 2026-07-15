/**
 * @file machineGuards.js
 * @description Shared guard for master-data mutations that must not happen
 * while their machine has an open run — today used by the MachineParameter/
 * MachineProduct unlink routes. Centralized so the in-progress check stays
 * exactly one query shape, matching ProductionRun_one_in_progress_per_machine's
 * guarantee of at most one in_progress row per machine.
 */
import prisma from './prisma.js'

export async function machineHasRunInProgress(machineId) {
    const run = await prisma.productionRun.findFirst({
        where: { machineId, status: 'in_progress' },
        select: { id: true }
    })
    return run !== null
}
