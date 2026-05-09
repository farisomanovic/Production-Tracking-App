import api from './axiosInstance'

export function getAllMachines() {
  return api.get('/machines')
}

export function getMachineById(id) {
  return api.get(`/machines/${id}`)
}

export function createMachine(data) {
  return api.post('/machines', data)
}

export function updateMachine(id, data) {
  return api.put(`/machines/${id}`, data)
}