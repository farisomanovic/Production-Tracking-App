/**
 * @file recipeProducts.js
 * @description Axios wrappers for /api/recipe-products — the recipe↔product
 * links that let one formula be reused across several products. Recipe/item
 * composition lives in recipes.js.
 */
import api from './axiosInstance'

/**
 * Fetches the products a recipe is linked to.
 *
 * @param {string} recipeId - Recipe UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = RecipeProduct[]
 * (each including its `product`), sorted by product name.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getRecipeProducts('d1e2…')
 * const products = res.data.map(link => link.product)
 */
export function getRecipeProducts(recipeId) {
  return api.get(`/recipe-products/recipe/${recipeId}`)
}

/**
 * Links a product to a recipe.
 *
 * @param {Object} data - `{ recipeId, productId }`, both required UUIDs.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created link (201).
 * @throws {import('axios').AxiosError} 400 when ids missing; 409 when already linked.
 *
 * @example
 * await linkProductToRecipe({ recipeId: 'd1e2…', productId: 'c771…' })
 */
export function linkProductToRecipe(data) {
  return api.post('/recipe-products', data)
}

/**
 * Removes a recipe-product link. The server rejects this with 409 if it would
 * leave the recipe with zero linked products.
 *
 * @param {string} id - RecipeProduct link UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = confirmation message.
 * @throws {import('axios').AxiosError} 409 if this is the recipe's last linked product; network/5xx otherwise.
 *
 * @example
 * await unlinkProductFromRecipe('f0a1…')
 */
export function unlinkProductFromRecipe(id) {
  return api.delete(`/recipe-products/${id}`)
}
