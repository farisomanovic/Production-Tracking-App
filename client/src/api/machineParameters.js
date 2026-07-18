/**
 * @file machineParameters.js
 * @description Axios wrappers for /api/machine-parameters — the machine↔parameter
 * links that define which measurements a machine's run form collects, and in
 * what order. Parameter definitions themselves live in parameters.js.
 */
import api from './axiosInstance'

/**
 * Fetches a machine's parameter links in form display order.
 *
 * @param {string} machineId - Machine UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = MachineParameter[]
 * (each including its `parameter`), sorted by displayOrder.
 * @throws {import('axios').AxiosError} On network failure or non-2xx status.
 *
 * @example
 * const res = await getMachineParameters('7cd0…')
 * res.data.forEach(mp => console.log(mp.parameter.name, mp.displayOrder))
 */
export function getMachineParameters(machineId) {
  return api.get(`/machine-parameters/machine/${machineId}`)
}

/**
 * Links a parameter to a machine; without displayOrder the server appends it
 * to the end of the form.
 *
 * @param {Object} data - `{ machineId, parameterId }` required; `{ displayOrder }` optional.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = created link (201).
 * @throws {import('axios').AxiosError} 400 when already linked or ids missing.
 *
 * @example
 * await linkParameterToMachine({ machineId: '7cd0…', parameterId: 'e01b…' })
 */
export function linkParameterToMachine(data) {
  return api.post('/machine-parameters', data)
}

/**
 * Updates a link's displayOrder (form position).
 *
 * @param {string} id - MachineParameter link UUID (not the parameter id).
 * @param {Object} data - `{ displayOrder: number }`.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = updated link.
 * @throws {import('axios').AxiosError} 400 when displayOrder missing; 409 when the target position is taken.
 *
 * @example
 * await updateMachineParameter('31f0…', { displayOrder: 1 })
 */
// TODO: unused — there is no reorder UI, partly because the unique displayOrder
// constraint makes swaps fail anyway. todo.md Group 5 #2 and Group 8 #2.
export function updateMachineParameter(id, data) {
  return api.put(`/machine-parameters/${id}`, data)
}

/**
 * Removes a parameter assignment from a machine.
 *
 * @param {string} id - MachineParameter link UUID.
 * @returns {Promise<import('axios').AxiosResponse>} Resolves with `data` = confirmation message.
 * @throws {import('axios').AxiosError} 409 when the link has recorded run values (RESTRICT FK).
 *
 * @example
 * await unlinkParameterFromMachine('31f0…')
 */
export function unlinkParameterFromMachine(id) {
  return api.delete(`/machine-parameters/${id}`)
}
