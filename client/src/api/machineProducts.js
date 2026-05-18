/**
 * Provides frontend API helpers for machine-product compatibility.
 * Maps machine setup screens to Express /machine-products endpoints.
 * Controls which products are available when starting a production run.
 */
import api from './axiosInstance'

/**
 * Fetches products linked to a machine.
 *
 * @param {string} machineId - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing machine-product links.
 */
export function getMachineProducts(machineId) {
  return api.get(`/machine-products/machine/${machineId}`)
}

/**
 * Links a product to a machine.
 *
 * @param {Object} data - Link payload with machineId and productId.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created link.
 */
export function linkProductToMachine(data) {
  return api.post('/machine-products', data)
}

/**
 * Removes a machine-product compatibility link.
 *
 * @param {string} id - MachineProduct UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing unlink status.
 */
export function unlinkProductFromMachine(id) {
  return api.delete(`/machine-products/${id}`)
}
