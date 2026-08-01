/**
 * @file useNavigationGuard.js
 * @description Reads/writes the shared navigation guard message set up by
 * NavigationGuardProvider.
 */
import { useContext } from 'react'
import { NavigationGuardContext } from '../context/NavigationGuardContext'

/**
 * @returns {{ guardMessage: string|null, setGuardMessage: Function }}
 *
 * @example
 * const { guardMessage, setGuardMessage } = useNavigationGuard()
 * setGuardMessage(currentStep > 2 && runId ? 'Leaving now will abandon this run.' : null)
 */
export function useNavigationGuard() {
  const context = useContext(NavigationGuardContext)
  if (!context) {
    throw new Error('useNavigationGuard must be used within a NavigationGuardProvider')
  }
  return context
}
