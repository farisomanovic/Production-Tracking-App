/**
 * @file products.js
 * @description Axios wrappers for /api/products. Pure HTTP calls only — machine
 * compatibility lives in machineProducts.js, recipes in recipes.js.
 */
import api from './axiosInstance'

/**
 * Fetches every product.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Product[].
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllProducts()
 */
export function getAllProducts() {
  return api.get('/products')
}

/**
 * Fetches one product by id.
 *
 * @param {string} id - Product UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Product.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getProductById('c771…')
 */
// TODO: unused — no page imports this; delete it or build the screen that needs
// it. todo.md Group 8 #2.
export function getProductById(id) {
  return api.get(`/products/${id}`)
}

/**
 * Creates a product.
 *
 * @param {Object} data - `{ name, code, unit }` effectively required (schema requires code);
 * `{ widthMm, thicknessMm, lengthM, description }` optional.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Product (201).
 * @throws {import('axios').AxiosError} 400 when name/unit missing; 500 today when code is missing or duplicated.
 *
 * @example
 * await createProduct({ name: 'LDPE folija 50µ', code: 'LD-50', unit: 'kg' })
 */
export function createProduct(data) {
  return api.post('/products', data)
}

/**
 * Partially updates a product.
 *
 * @param {string} id - Product UUID.
 * @param {Object} data - Any subset of product fields; omitted fields stay unchanged.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Product.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateProduct('c771…', { thicknessMm: 0.55 })
 */
// TODO: unused — ProductsPage only creates; there is no edit UI yet.
// todo.md Group 8 #2.
export function updateProduct(id, data) {
  return api.put(`/products/${id}`, data)
}
