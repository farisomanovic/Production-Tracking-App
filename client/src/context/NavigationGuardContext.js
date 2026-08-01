/**
 * @file NavigationGuardContext.js
 * @description The context object itself, kept in its own file (no component
 * export here) so react-refresh/only-export-components doesn't flag the
 * provider component or the useNavigationGuard hook for sharing a file with it.
 */
import { createContext } from 'react'

export const NavigationGuardContext = createContext(null)
