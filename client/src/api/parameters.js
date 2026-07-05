/**
 * @file parameters.js
 * @description Axios wrappers for /api/parameters (reusable measurement types).
 * Pure HTTP calls only — machine assignment lives in machineParameters.js.
 */
import api from './axiosInstance'

/**
 * Fetches every parameter definition.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Parameter[].
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllParameters()
 */
export function getAllParameters() {
  return api.get('/parameters')
}

/**
 * Fetches one parameter definition by id.
 *
 * @param {string} id - Parameter UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Parameter.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getParameterById('e01b…')
 */
// TODO: unused — no page imports this; delete it or build the screen that needs
// it. todo.md Group 8 #2.
export function getParameterById(id) {
  return api.get(`/parameters/${id}`)
}

/**
 * Creates a parameter definition.
 *
 * @param {Object} data - `{ name }` required; `{ unit, description }` optional.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Parameter (201).
 * @throws {import('axios').AxiosError} 400 when name is missing; network/5xx otherwise.
 *
 * @example
 * await createParameter({ name: 'Line speed', unit: 'm/min' })
 */
export function createParameter(data) {
  return api.post('/parameters', data)
}

/**
 * Partially updates a parameter definition.
 *
 * @param {string} id - Parameter UUID.
 * @param {Object} data - Any subset of `{ name, unit, description }`.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Parameter.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateParameter('e01b…', { unit: '°F' })
 */
// TODO: unused — ParametersPage only creates; there is no edit UI yet.
// todo.md Group 8 #2.
export function updateParameter(id, data) {
  return api.put(`/parameters/${id}`, data)
}
