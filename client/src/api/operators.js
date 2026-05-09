import api from './axiosInstance'

export function getAllOperators() {
  return api.get('/operators')
}

export function getOperatorById(id) {
  return api.get(`/operators/${id}`)
}

export function createOperator(data) {
  return api.post('/operators', data)
}

export function updateOperator(id, data) {
  return api.put(`/operators/${id}`, data)
}