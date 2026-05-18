/**
 * Provides frontend API helpers for material records.
 * Maps material admin screens to Express /materials endpoints.
 * Supports stock and supplier data used by recipes and production runs.
 */
import api from './axiosInstance'

/**
 * Fetches all materials.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing material records.
 */
export function getAllMaterials() {
  return api.get('/materials')
}

/**
 * Fetches one material by id.
 *
 * @param {string} id - Material UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one material.
 */
export function getMaterialById(id) {
  return api.get(`/materials/${id}`)
}

/**
 * Creates a material.
 *
 * @param {Object} data - Material creation payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created material.
 */
export function createMaterial(data) {
  return api.post('/materials', data)
}

/**
 * Updates material metadata or stock quantity.
 *
 * @param {string} id - Material UUID.
 * @param {Object} data - Partial material update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated material.
 */
export function updateMaterial(id, data) {
  return api.put(`/materials/${id}`, data)
}
