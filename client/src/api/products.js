import api from './axiosInstance'

export function getAllProducts() {
  return api.get('/products')
}

export function getProductById(id) {
  return api.get(`/products/${id}`)
}

export function createProduct(data) {
  return api.post('/products', data)
}

export function updateProduct(id, data) {
  return api.put(`/products/${id}`, data)
}