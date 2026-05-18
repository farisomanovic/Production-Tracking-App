/**
 * Provides frontend API helpers for machine records.
 * Maps React admin screens to Express /machines endpoints.
 * Supports active-flag updates used for machine soft deletion.
 */
import api from './axiosInstance'

/**
 * Fetches all machines.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing machine records.
 */
export function getAllMachines() {
  return api.get('/machines')
}

/**
 * Fetches one machine by id.
 *
 * @param {string} id - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one machine.
 */
export function getMachineById(id) {
  return api.get(`/machines/${id}`)
}

/**
 * Creates a machine.
 *
 * @param {Object} data - Machine creation payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created machine.
 */
export function createMachine(data) {
  return api.post('/machines', data)
}

/**
 * Updates a machine, including active=false soft deletion.
 *
 * @param {string} id - Machine UUID.
 * @param {Object} data - Partial machine update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated machine.
 */
export function updateMachine(id, data) {
  return api.put(`/machines/${id}`, data)
}
