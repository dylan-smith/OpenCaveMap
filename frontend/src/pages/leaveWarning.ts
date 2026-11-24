import { useEffect, useRef } from 'react'
import { useBlocker } from 'react-router'

// Asks before leaving the screen while changed is true. Going elsewhere in the app, or back or forward in the
// browser, opens LeaveDialog with the props this returns as dialog, and closing or reloading the tab gets the
// browser's own prompt. allowLeaving lets the navigation after a successful save or delete go without asking.
export function useLeaveWarning(changed: boolean) {
  // Set when a save or delete has succeeded, so leaving afterwards doesn't ask. A failed save leaves it unset, as
  // the entries are still unsaved. A ref, because the blocker reads it during the navigation that follows.
  const leaving = useRef(false)
  const blocker = useBlocker(() => changed && !leaving.current)

  // Closing or reloading the tab can't show the app's own dialog, so the browser asks instead.
  useEffect(() => {
    if (!changed) {
      return
    }
    function warn(event: BeforeUnloadEvent) {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      window.removeEventListener('beforeunload', warn)
    }
  }, [changed])

  return {
    // Stay cancels the navigation, which also undoes the browser's back or forward button, so the address and the
    // entries stay as they were.
    dialog: {
      open: blocker.state === 'blocked',
      onStay: () => blocker.reset?.(),
      onLeave: () => blocker.proceed?.(),
    },
    allowLeaving: () => {
      leaving.current = true
    },
  }
}
