import api from './axiosInstance'

export function getAllRecipes() {
  return api.get('/recipes')
}

export function getRecipesByProduct(productId) {
  return api.get(`/recipes?productId=${productId}`)
}

export function getRecipeById(id) {
  return api.get(`/recipes/${id}`)
}

export function createRecipe(data) {
  return api.post('/recipes', data)
}

export function updateRecipe(id, data) {
  return api.put(`/recipes/${id}`, data)
}