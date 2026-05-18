/**
 * Provides frontend API helpers for production-run workflows.
 * Maps React pages to Express /production-runs endpoints.
 * Encapsulates run creation, completion, updates, and deletion.
 */
import api from './axiosInstance'

/**
 * Fetches production runs, optionally filtered by query parameters.
 *
 * @param {Object} [params] - Optional machine, operator, product, date, limit, or status filters.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing run summaries.
 */
export function getAllRuns(params) {
  return api.get('/production-runs', { params })
}

/**
 * Fetches a single production run aggregate by id.
 *
 * @param {string} id - ProductionRun UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing full run detail.
 */
export function getRunById(id) {
  return api.get(`/production-runs/${id}`)
}

/**
 * Starts a new production run.
 *
 * @param {Object} data - Production run header payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created run.
 */
export function createRun(data) {
  return api.post('/production-runs', data)
}

/**
 * Updates mutable production-run fields.
 *
 * @param {string} id - ProductionRun UUID.
 * @param {Object} data - Partial run update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated run.
 */
export function updateRun(id, data) {
  return api.put(`/production-runs/${id}`, data)
}

/**
 * Completes an in-progress production run.
 *
 * @param {string} id - ProductionRun UUID.
 * @param {Object} data - Completion payload with parameters, materials, outputs, and end data.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the completed run.
 */
export function completeRun(id, data) {
  return api.post(`/production-runs/${id}/complete`, data)
}

/**
 * Deletes a production run and reverses server-side related records.
 *
 * @param {string} id - ProductionRun UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing deletion status.
 */
export function deleteRun(id) {
    return api.delete(`/production-runs/${id}`)
}
