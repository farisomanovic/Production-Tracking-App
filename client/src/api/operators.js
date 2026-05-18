/**
 * Provides frontend API helpers for operator records.
 * Maps React admin screens to Express /operators endpoints.
 * Supports active-flag updates used for operator soft deletion.
 */
import api from './axiosInstance'

/**
 * Fetches all operators.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing operator records.
 */
export function getAllOperators() {
  return api.get('/operators')
}

/**
 * Fetches one operator by id.
 *
 * @param {string} id - Operator UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one operator.
 */
export function getOperatorById(id) {
  return api.get(`/operators/${id}`)
}

/**
 * Creates an operator.
 *
 * @param {Object} data - Operator creation payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created operator.
 */
export function createOperator(data) {
  return api.post('/operators', data)
}

/**
 * Updates an operator, including active=false soft deletion.
 *
 * @param {string} id - Operator UUID.
 * @param {Object} data - Partial operator update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated operator.
 */
export function updateOperator(id, data) {
  return api.put(`/operators/${id}`, data)
}
