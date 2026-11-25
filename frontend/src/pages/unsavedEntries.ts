import { useSyncExternalStore } from 'react'

// Whether the page showing holds entries the user hasn't saved. The entry screen sets it, and App reads it to keep
// the page through a lost sign-in and to ask before signing out.
type Listener = () => void

const listeners = new Set<Listener>()

let current = false

export function hasUnsavedEntries() {
  return current
}

export function setUnsavedEntries(unsaved: boolean) {
  if (unsaved === current) {
    return
  }
  current = unsaved
  listeners.forEach((listener) => listener())
}

function subscribe(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useUnsavedEntries() {
  return useSyncExternalStore(subscribe, hasUnsavedEntries)
}
