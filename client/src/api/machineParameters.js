import api from './axiosInstance'

export function getMachineParameters(machineId) {
  return api.get(`/machine-parameters/machine/${machineId}`)
}

export function linkParameterToMachine(data) {
  return api.post('/machine-parameters', data)
}

export function updateMachineParameter(id, data) {
  return api.put(`/machine-parameters/${id}`, data)
}

export function unlinkParameterFromMachine(id) {
  return api.delete(`/machine-parameters/${id}`)
}