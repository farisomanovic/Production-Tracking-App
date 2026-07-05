/**
 * @file materials.js
 * @description Axios wrappers for /api/materials. Pure HTTP calls only — no React
 * state, no formatting, no error handling. Callers own try/catch and UI feedback.
 */
import api from './axiosInstance'

/**
 * Fetches every material with current stock quantities.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Material[].
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllMaterials()
 * const lowStock = res.data.filter(m => m.stockQty < 100)
 */
export function getAllMaterials() {
  return api.get('/materials')
}

/**
 * Fetches one material by id.
 *
 * @param {string} id - Material UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Material.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getMaterialById('a9d2…')
 */
// TODO: unused — no page imports this; delete it or build the screen that needs
// it. todo.md Group 8 #2.
export function getMaterialById(id) {
  return api.get(`/materials/${id}`)
}

/**
 * Creates a material.
 *
 * @param {Object} data - `{ name, unit }` required; `{ supplier, stockQty }` optional (stock defaults to 0).
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Material (201).
 * @throws {import('axios').AxiosError} 400 when name/unit missing; network/5xx otherwise.
 *
 * @example
 * await createMaterial({ name: 'LDPE regranulat', unit: 'kg', stockQty: 500 })
 */
export function createMaterial(data) {
  return api.post('/materials', data)
}

/**
 * Partially updates a material — including stock, which is an ABSOLUTE overwrite.
 *
 * @param {string} id - Material UUID.
 * @param {Object} data - Any subset of `{ name, unit, supplier, stockQty }`.
 * `stockQty` replaces the stored value outright — see the lost-update TODO in MaterialsPage.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Material.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateMaterial('a9d2…', { supplier: 'Prevent d.o.o.' })
 */
export function updateMaterial(id, data) {
  return api.put(`/materials/${id}`, data)
}
