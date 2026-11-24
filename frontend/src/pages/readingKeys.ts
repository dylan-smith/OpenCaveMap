import { useEffect, useRef } from 'react'
import type { KeyboardEvent, RefCallback } from 'react'
import { readingOrder, rowField } from './segmentDraft'
import type { Draft, DraftShot } from './segmentDraft'

// Moving between the rows' fields from the keyboard, so a slate can be typed in without reaching for the mouse.
// Each field registers its input with inputRef, keyed like its message, and passes its keys to handleReadingKeyDown
// or handleNoteKeyDown. addShotAndStation adds a shot and station at the end, and returns the new shot.
export function useReadingKeys(
  draft: Draft | null,
  addShotAndStation: () => DraftShot,
) {
  // The inputs of the rows' fields, keyed like their messages, so the keyboard can move between them.
  const inputs = useRef(new Map<string, HTMLInputElement>())
  // A field to move to once the render that adds it has happened.
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (pendingFocus.current !== null) {
      inputs.current.get(pendingFocus.current)?.focus()
      pendingFocus.current = null
    }
  })

  // Moves to a field once the render that adds it has happened.
  function focusOnceShown(field: string) {
    pendingFocus.current = field
  }

  function inputRef(field: string): RefCallback<HTMLInputElement> {
    return (input) => {
      if (input === null) {
        inputs.current.delete(field)
      } else {
        inputs.current.set(field, input)
      }
    }
  }

  // Moves to the reading after field and selects it, so typing replaces what's there. After the last station's
  // depth, that adds a shot and station and moves to the new shot's distance.
  function moveAfter(field: string) {
    if (draft === null) {
      return
    }
    const order = readingOrder(draft)
    const next = order.at(order.indexOf(field) + 1)
    if (next === undefined) {
      focusOnceShown(rowField(addShotAndStation().key, 'distance'))
    } else {
      const input = inputs.current.get(next)
      input?.focus()
      input?.select()
    }
  }

  // Enter in a reading moves to the next one rather than saving the segment. Alt+N moves to the row's note, with
  // the cursor after what's already there. It's matched by the key's position, since on a Mac Alt+N types a
  // character other than n.
  function handleReadingKeyDown(
    rowKey: string,
    field: string,
    event: KeyboardEvent,
  ) {
    if (event.key === 'Enter') {
      event.preventDefault()
      moveAfter(rowField(rowKey, field))
    } else if (event.altKey && event.code === 'KeyN') {
      event.preventDefault()
      const note = inputs.current.get(rowField(rowKey, 'note'))
      note?.focus()
      note?.setSelectionRange(note.value.length, note.value.length)
    }
  }

  // Enter in a note goes back to the readings, at the one after the note's row.
  function handleNoteKeyDown(lastReading: string, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      moveAfter(lastReading)
    }
  }

  return { inputRef, handleReadingKeyDown, handleNoteKeyDown }
}
