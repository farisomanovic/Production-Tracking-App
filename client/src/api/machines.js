/**
 * @file machines.js
 * @description Axios wrappers for /api/machines. Pure HTTP calls only — no React
 * state, no formatting, no error handling. Callers own try/catch and UI feedback.
 */
import api from './axiosInstance'

/**
 * Fetches every machine, active and inactive (callers filter for dropdowns).
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Machine[].
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllMachines()
 * const selectable = res.data.filter(m => m.active)
 */
export function getAllMachines() {
  return api.get('/machines')
}

/**
 * Fetches one machine by id.
 *
 * @param {string} id - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Machine.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getMachineById('7cd0…')
 */
export function getMachineById(id) {
  return api.get(`/machines/${id}`)
}

/**
 * Creates a machine.
 *
 * @param {Object} data - `{ name: string, code?: string }` — code must be unique when present.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Machine (201).
 * @throws {import('axios').AxiosError} 400 when name is missing; 500 today on duplicate code.
 *
 * @example
 * await createMachine({ name: 'Foil line 2', code: 'FOL-02' })
 */
export function createMachine(data) {
  return api.post('/machines', data)
}

/**
 * Partially updates a machine; `{ active: false }` is the soft-delete call.
 *
 * @param {string} id - Machine UUID.
 * @param {Object} data - Any subset of `{ name, code, active }`; omitted fields stay unchanged.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Machine.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateMachine('7cd0…', { code: 'EXT-01B' })
 */
export function updateMachine(id, data) {
  return api.put(`/machines/${id}`, data)
}
