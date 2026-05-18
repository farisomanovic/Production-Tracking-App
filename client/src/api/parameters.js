/**
 * Provides frontend API helpers for reusable parameter definitions.
 * Maps parameter admin screens to Express /parameters endpoints.
 * Supplies values later linked to machines through displayOrder-aware assignments.
 */
import api from './axiosInstance'

/**
 * Fetches all parameter definitions.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing parameter records.
 */
export function getAllParameters() {
  return api.get('/parameters')
}

/**
 * Fetches one parameter definition by id.
 *
 * @param {string} id - Parameter UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one parameter.
 */
export function getParameterById(id) {
  return api.get(`/parameters/${id}`)
}

/**
 * Creates a parameter definition.
 *
 * @param {Object} data - Parameter creation payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created parameter.
 */
export function createParameter(data) {
  return api.post('/parameters', data)
}

/**
 * Updates a parameter definition.
 *
 * @param {string} id - Parameter UUID.
 * @param {Object} data - Partial parameter update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated parameter.
 */
export function updateParameter(id, data) {
  return api.put(`/parameters/${id}`, data)
}
