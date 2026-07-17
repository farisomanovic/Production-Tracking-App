/**
 * @file recipes.js
 * @description Axios wrappers for /api/recipes (product material formulas).
 * Pure HTTP calls only — formula validation lives on the server and in
 * RecipesPage; material master data in materials.js.
 */
import api from './axiosInstance'

/**
 * Fetches every recipe with product and material composition included.
 *
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Recipe[] aggregates.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getAllRecipes()
 */
export function getAllRecipes() {
  return api.get('/recipes')
}

/**
 * Fetches only the recipes belonging to one product — used by wizard Step 2 so
 * incompatible recipes are never offered.
 *
 * @param {string} productId - Product UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Recipe[] (possibly empty).
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getRecipesByProduct('c771…')
 * const preselected = res.data.find(r => r.isDefault)
 */
export function getRecipesByProduct(productId) {
  return api.get(`/recipes/by-product/${productId}`)
}

/**
 * Fetches one recipe aggregate by id — wizard Step 4 uses this to list the
 * materials whose usage must be recorded.
 *
 * @param {string} id - Recipe UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = Recipe with recipeItems.
 * @throws {import('axios').AxiosError} 404 if the id is unknown; network/5xx otherwise.
 *
 * @example
 * const res = await getRecipeById('d1e2…')
 */
export function getRecipeById(id) {
  return api.get(`/recipes/${id}`)
}

/**
 * Creates a recipe together with its items and its linked products; the
 * server rejects formulas that do not total 100% and requires at least one
 * productId (a recipe must always be linked to at least one product).
 *
 * @param {Object} data - `{ name, productIds: string[], items: [{ materialId, percentage, plannedQtyKg? }] }`
 * required; `{ isDefault, notes }` optional. Percentages must sum to 100.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created Recipe aggregate (201).
 * @throws {import('axios').AxiosError} 400 on incomplete formula; network/5xx otherwise.
 *
 * @example
 * await createRecipe({
 *   name: 'Regranulat mix', productIds: ['c771…'],
 *   items: [{ materialId: 'a9d2…', percentage: 60 }, { materialId: '77b0…', percentage: 40 }]
 * })
 */
export function createRecipe(data) {
  return api.post('/recipes', data)
}

/**
 * Updates recipe metadata (name/isDefault/notes), and also doubles as the
 * activate/deactivate call via `active` — items cannot be changed through the
 * API at all today.
 *
 * @param {string} id - Recipe UUID.
 * @param {Object} data - Any subset of `{ name, isDefault, notes, active }`.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated Recipe aggregate.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * await updateRecipe('d1e2…', { active: false })
 */
export function updateRecipe(id, data) {
  return api.put(`/recipes/${id}`, data)
}
