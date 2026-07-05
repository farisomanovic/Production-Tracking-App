/**
 * @file operators.js
 * @description Axios wrappers for /api/operators. Pure HTTP calls only — no React
 * state, no formatting, no error handling. Callers own try/catch and UI feedback.
 */
import api from './axiosInstance'

/**
 * Fetches every operator, active and inactive (callers filter for dropdowns).
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Operator[].
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllOperators()
 * const selectable = res.data.filter(op => op.active)
 */
export function getAllOperators() {
  return api.get('/operators')
}

/**
 * Fetches one operator by id.
 *
 * @param {string} id - Operator UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Operator.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getOperatorById('b3f1c2d4-…')
 */
// TODO: unused — no page imports this; delete it or build the screen that needs
// it. todo.md Group 8 #2.
export function getOperatorById(id) {
  return api.get(`/operators/${id}`)
}

/**
 * Creates an operator.
 *
 * @param {Object} data - `{ name: string }` — the only field the server accepts on create.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Operator (201).
 * @throws {import('axios').AxiosError} 400 when name is missing; network/5xx otherwise.
 *
 * @example
 * await createOperator({ name: 'Emina' })
 */
export function createOperator(data) {
  return api.post('/operators', data)
}

/**
 * Partially updates an operator; `{ active: false }` is the soft-delete call.
 *
 * @param {string} id - Operator UUID.
 * @param {Object} data - Any subset of `{ name, active }`; omitted fields stay unchanged.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Operator.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateOperator('b3f1c2d4-…', { active: false })
 */
export function updateOperator(id, data) {
  return api.put(`/operators/${id}`, data)
}
