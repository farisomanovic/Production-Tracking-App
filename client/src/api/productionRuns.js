/**
 * @file productionRuns.js
 * @description Axios wrappers for /api/production-runs — the run lifecycle
 * (create → complete), filtered listing, detail, and deletion. Pure HTTP calls
 * only; payload assembly lives in the wizard and RunDetailPage.
 */
import api from './axiosInstance'

/**
 * Fetches runs, optionally filtered.
 *
 * @param {Object} [params] - Any of `{ machineId, operatorId, productId, status,
 * dateFrom, dateTo, limit }` — dates as "YYYY-MM-DD", status "in_progress" | "completed".
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = ProductionRun[]
 * (operator/machine/product narrowed to `{ name }`; no recipe), newest date first.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllRuns({ machineId: '7cd0…', status: 'completed', limit: 1 })
 */
export function getAllRuns(params) {
  return api.get('/production-runs', { params })
}

/**
 * Fetches one run with all completion data (parameters, materials, outputs).
 *
 * @param {string} id - ProductionRun UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = full run aggregate.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getRunById('ab12…')
 */
export function getRunById(id) {
  return api.get(`/production-runs/${id}`)
}

/**
 * Starts a run (in_progress). Called after wizard Step 2 — measurements are
 * submitted later through completeRun.
 *
 * @param {Object} data - Required: `{ date, startTime, operatorId, machineId, productId, recipeId }`.
 * Optional: `{ warmupStartTime, stableStartTime, energyStart, notes, potentialBuyer }`.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created run (201).
 * @throws {import('axios').AxiosError} 400 on validation failure (missing fields, future date, inactive operator).
 *
 * @example
 * const res = await createRun({ date: '2026-07-04', startTime: '2026-07-04T08:30:00.000',
 *   operatorId: 'b3f1…', machineId: '7cd0…', productId: 'c771…', recipeId: 'd1e2…' })
 */
export function createRun(data) {
  return api.post('/production-runs', data)
}

/**
 * Updates a run's mutable header fields (notes, buyer, times, energy).
 *
 * @param {string} id - ProductionRun UUID.
 * @param {Object} data - Any subset of `{ notes, potentialBuyer, warmupStartTime,
 * stableStartTime, energyStart, energyEnd, endTime }`.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated run.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateRun('ab12…', { potentialBuyer: 'Bingo d.o.o.' })
 */
// TODO: unused — no page imports this, so run headers are uneditable in the UI.
// todo.md Group 8 #2.
export function updateRun(id, data) {
  return api.put(`/production-runs/${id}`, data)
}

/**
 * Completes an in-progress run with its measurements, usage, and outputs —
 * one call, one server-side transaction.
 *
 * @param {string} id - ProductionRun UUID.
 * @param {Object} data - `{ endTime, parameterValues: [{ machineParameterId, value }],
 * outputs: [{ productId, quantityProduced }] }` required;
 * `{ materialUsages: [{ materialId, quantityUsed }], energyEnd, notes,
 * netWeightPerUnit, grossWeightPerUnit, scrapKg }` optional (run-level weights, ≥ 0).
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = completed run aggregate.
 * @throws {import('axios').AxiosError} 400 invalid payload; 404 unknown run;
 * 409 already completed or insufficient material stock.
 *
 * @example
 * await completeRun('ab12…', {
 *   endTime: '2026-07-04T14:30:00.000',
 *   parameterValues: [{ machineParameterId: '31f0…', value: 210 }],
 *   materialUsages: [{ materialId: 'a9d2…', quantityUsed: 480 }],
 *   outputs: [{ productId: 'c771…', quantityProduced: 500 }],
 *   netWeightPerUnit: 1.5, grossWeightPerUnit: 1.6, scrapKg: 10
 * })
 */
export function completeRun(id, data) {
  return api.post(`/production-runs/${id}/complete`, data)
}

/**
 * Deletes a run; the server restores any material stock the run had consumed.
 *
 * @param {string} id - ProductionRun UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = confirmation message.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * await deleteRun('ab12…')
 */
export function deleteRun(id) {
    return api.delete(`/production-runs/${id}`)
}
