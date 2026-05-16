import api from './axiosInstance'

export function getAllRuns(params) {
  return api.get('/production-runs', { params })
}

export function getRunById(id) {
  return api.get(`/production-runs/${id}`)
}

export function createRun(data) {
  return api.post('/production-runs', data)
}

export function updateRun(id, data) {
  return api.put(`/production-runs/${id}`, data)
}

export function completeRun(id, data) {
  return api.post(`/production-runs/${id}/complete`, data)
}

export function deleteRun(id) {
    return api.delete(`/production-runs/${id}`)
}