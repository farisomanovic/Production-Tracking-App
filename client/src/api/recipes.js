/**
 * Provides frontend API helpers for recipe records.
 * Maps recipe screens to Express /recipes endpoints.
 * Supports product-specific lookup for the new-run wizard.
 */
import api from './axiosInstance'

/**
 * Fetches all recipes with their related composition data.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing recipe aggregates.
 */
export function getAllRecipes() {
  return api.get('/recipes')
}

/**
 * Fetches recipes available for a product.
 *
 * @param {string} productId - Product UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing product-specific recipes.
 */
export function getRecipesByProduct(productId) {
  return api.get(`/recipes/by-product/${productId}`)
}

/**
 * Fetches one recipe by id.
 *
 * @param {string} id - Recipe UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing one recipe aggregate.
 */
export function getRecipeById(id) {
  return api.get(`/recipes/${id}`)
}

/**
 * Creates a recipe with its material items.
 *
 * @param {Object} data - Recipe creation payload with items array.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created recipe.
 */
export function createRecipe(data) {
  return api.post('/recipes', data)
}

/**
 * Updates recipe metadata.
 *
 * @param {string} id - Recipe UUID.
 * @param {Object} data - Partial recipe update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated recipe.
 */
export function updateRecipe(id, data) {
  return api.put(`/recipes/${id}`, data)
}
