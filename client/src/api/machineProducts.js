import api from './axiosInstance'

export function getMachineProducts(machineId) {
  return api.get(`/machine-products/machine/${machineId}`)
}

export function linkProductToMachine(data) {
  return api.post('/machine-products', data)
}

export function unlinkProductFromMachine(id) {
  return api.delete(`/machine-products/${id}`)
}