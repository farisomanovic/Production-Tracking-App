import api from './axiosInstance'

export function getAllMaterials() {
  return api.get('/materials')
}

export function getMaterialById(id) {
  return api.get(`/materials/${id}`)
}

export function createMaterial(data) {
  return api.post('/materials', data)
}

export function updateMaterial(id, data) {
  return api.put(`/materials/${id}`, data)
}