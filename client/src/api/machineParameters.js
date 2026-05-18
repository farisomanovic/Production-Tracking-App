/**
 * Provides frontend API helpers for machine-parameter assignments.
 * Maps admin parameter configuration to Express /machine-parameters endpoints.
 * Preserves displayOrder updates used to render production forms.
 */
import api from './axiosInstance'

/**
 * Fetches ordered parameters assigned to a machine.
 *
 * @param {string} machineId - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing machine-parameter links.
 */
export function getMachineParameters(machineId) {
  return api.get(`/machine-parameters/machine/${machineId}`)
}

/**
 * Links a parameter to a machine.
 *
 * @param {Object} data - Link payload with machineId, parameterId, and optional displayOrder.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the created link.
 */
export function linkParameterToMachine(data) {
  return api.post('/machine-parameters', data)
}

/**
 * Updates a machine-parameter link, primarily displayOrder.
 *
 * @param {string} id - MachineParameter UUID.
 * @param {Object} data - Partial link update payload.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing the updated link.
 */
export function updateMachineParameter(id, data) {
  return api.put(`/machine-parameters/${id}`, data)
}

/**
 * Removes a parameter assignment from a machine.
 *
 * @param {string} id - MachineParameter UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Axios response containing unlink status.
 */
export function unlinkParameterFromMachine(id) {
  return api.delete(`/machine-parameters/${id}`)
}
