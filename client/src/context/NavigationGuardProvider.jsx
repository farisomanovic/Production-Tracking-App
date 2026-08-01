/**
 * @file NavigationGuardProvider.jsx
 * @description Wraps the app so any page can set a guard message ("there's
 * something to lose") and BottomNav can read it before letting a tab switch
 * proceed. See useNavigationGuard.js for the read/write hook.
 */
import { useCallback, useState } from 'react'
import { NavigationGuardContext } from './NavigationGuardContext'

/**
 * @component
 * @param {Object} props
 * @param {import('react').ReactNode} props.children
 * @returns {JSX.Element}
 *
 * @example
 * <NavigationGuardProvider><App /></NavigationGuardProvider>
 */
export function NavigationGuardProvider({ children }) {
  const [guardMessage, setGuardMessageState] = useState(null)

  // Stable reference — consumers pass this into a useEffect dependency array,
  // and an inline setState wrapped fresh every render would retrigger it forever.
  const setGuardMessage = useCallback((message) => {
    setGuardMessageState(message)
  }, [])

  return (
    <NavigationGuardContext.Provider value={{ guardMessage, setGuardMessage }}>
      {children}
    </NavigationGuardContext.Provider>
  )
}
