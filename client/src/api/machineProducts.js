/**
 * @file machineProducts.js
 * @description Axios wrappers for /api/machine-products — the machine↔product
 * compatibility links that filter the wizard's product dropdown. Product master
 * data lives in products.js.
 */
import api from './axiosInstance'

/**
 * Fetches the products a machine is allowed to produce.
 *
 * @param {string} machineId - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = MachineProduct[]
 * (each including its `product`), sorted by product name.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getMachineProducts('7cd0…')
 * const products = res.data.map(link => link.product)
 */
export function getMachineProducts(machineId) {
  return api.get(`/machine-products/machine/${machineId}`)
}

/**
 * Links a product to a machine.
 *
 * @param {Object} data - `{ machineId, productId }`, both required UUIDs.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created link (201).
 * @throws {import('axios').AxiosError} 400 when already linked or ids missing.
 *
 * @example
 * await linkProductToMachine({ machineId: '7cd0…', productId: 'c771…' })
 */
export function linkProductToMachine(data) {
  return api.post('/machine-products', data)
}

/**
 * Removes a machine-product compatibility link. Safe for history — runs
 * reference the product directly, not this link.
 *
 * @param {string} id - MachineProduct link UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = confirmation message.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await unlinkProductFromMachine('88c1…')
 */
export function unlinkProductFromMachine(id) {
  return api.delete(`/machine-products/${id}`)
}
