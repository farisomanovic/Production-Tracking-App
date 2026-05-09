import api from './axiosInstance'

export function getAllParameters() {
  return api.get('/parameters')
}

export function getParameterById(id) {
  return api.get(`/parameters/${id}`)
}

export function createParameter(data) {
  return api.post('/parameters', data)
}

export function updateParameter(id, data) {
  return api.put(`/parameters/${id}`, data)
}