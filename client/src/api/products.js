/**
 * Provides frontend API helpers for product records.
 * Maps product admin screens to Express /products endpoints.
 * Supplies product metadata to recipes, machines, and production runs.
 */
import api from './axiosInstance'

/**
 * Fetches all products.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing product records.
 */
export function getAllProducts() {
  return api.get('/products')
}

/**
 * Fetches one product by id.
 *
 * @param {string} id - Product UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one product.
 */
export function getProductById(id) {
  return api.get(`/products/${id}`)
}

/**
 * Creates a product.
 *
 * @param {Object} data - Product creation payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created product.
 */
export function createProduct(data) {
  return api.post('/products', data)
}

/**
 * Updates a product.
 *
 * @param {string} id - Product UUID.
 * @param {Object} data - Partial product update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated product.
 */
export function updateProduct(id, data) {
  return api.put(`/products/${id}`, data)
}
