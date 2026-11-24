// PROTOTYPE: throwaway code for trying out the segment entry screen. Not production.
// Shared in-memory state for every variant, so typed data survives flipping between them.
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

export type UnitSystem = 'metric' | 'imperial'
// m is the stored value (always metres); text is what's in the box in the current unit system.
export interface Length {
  m: number | null
  text: string
}
export interface Station {
  id: number
  depth: Length
  note: string
}
export interface Shot {
  id: number
  distance: Length
  azimuth: string
  note: string
  review: boolean
}
// shots[i] runs from stations[i] to stations[i + 1], and is labelled i + 1.
export interface Segment {
  stations: Station[]
  shots: Shot[]
}

export const SEGMENT_NUMBER = 3
const FEET = 0.3048

const blank = (): Length => ({ m: null, text: '' })
const newStation = (id: number): Station => ({ id, depth: blank(), note: '' })
const newShot = (id: number): Shot => ({
  id,
  distance: blank(),
  azimuth: '',
  note: '',
  review: false,
})

function toLength(text: string, unit: UnitSystem): Length {
  const n = text.trim() === '' ? NaN : Number(text)
  if (Number.isNaN(n)) return { m: null, text }
  return { m: unit === 'metric' ? n : n * FEET, text }
}

export function formatLength(m: number, unit: UnitSystem): string {
  return unit === 'metric'
    ? String(Number(m.toFixed(2)))
    : String(Number((m / FEET).toFixed(1)))
}

const redisplay = (l: Length, unit: UnitSystem): Length =>
  l.m === null ? l : { m: l.m, text: formatLength(l.m, unit) }

export function azimuthValue(text: string): number | null {
  const n = text.trim() === '' ? NaN : Number(text)
  if (Number.isNaN(n) || n < 0 || n > 360) return null
  return n === 360 ? 0 : n
}

export function validate(seg: Segment): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const s of seg.stations) {
    if (s.depth.m === null) errors[`d-${s.id}`] = 'Required'
    else if (s.depth.m < 0) errors[`d-${s.id}`] = 'Must be 0 or more'
  }
  for (const h of seg.shots) {
    if (h.distance.m === null) errors[`l-${h.id}`] = 'Required'
    else if (h.distance.m <= 0) errors[`l-${h.id}`] = 'Must be more than 0'
    if (azimuthValue(h.azimuth) === null) errors[`a-${h.id}`] = '0 to 360'
  }
  return errors
}

function focusKey(key: string) {
  const el = document.querySelector<HTMLInputElement>(`[data-key="${key}"]`)
  el?.focus()
  el?.select()
}

function focusAfter(el: Element | null): boolean {
  const all = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[data-num]'),
  )
  const next = all.at(all.indexOf(el as HTMLInputElement) + 1)
  if (!next || el === null) return false
  next.focus()
  next.select()
  return true
}

export function useDraft() {
  const nextId = useRef(10)
  const pendingFocus = useRef<string | null>(null)
  const [unit, setUnitState] = useState<UnitSystem>('imperial')
  const [attempted, setAttempted] = useState(false)
  const [saved, setSaved] = useState(false)
  const [seg, setSegRaw] = useState<Segment>({
    stations: [newStation(1), newStation(2)],
    shots: [newShot(1)],
  })

  // Focus a field that only exists after the render that added it.
  useEffect(() => {
    if (pendingFocus.current) {
      focusKey(pendingFocus.current)
      pendingFocus.current = null
    }
  })

  const setSeg = (fn: (s: Segment) => Segment) => {
    setSaved(false)
    setSegRaw(fn)
  }
  const mapStation = (id: number, fn: (s: Station) => Station) =>
    setSeg((s) => ({
      ...s,
      stations: s.stations.map((x) => (x.id === id ? fn(x) : x)),
    }))
  const mapShot = (id: number, fn: (s: Shot) => Shot) =>
    setSeg((s) => ({
      ...s,
      shots: s.shots.map((x) => (x.id === id ? fn(x) : x)),
    }))

  /** Adds a shot and station at the end. Returns the new shot's id. */
  function addAtEnd(): number {
    const stationId = nextId.current++
    const shotId = nextId.current++
    setSeg((s) => ({
      stations: [...s.stations, newStation(stationId)],
      shots: [...s.shots, newShot(shotId)],
    }))
    pendingFocus.current = `l-${shotId}`
    return shotId
  }

  /** Adds a station, and the shot arriving at it, after the station at index. */
  function insertAfter(index: number) {
    const stationId = nextId.current++
    const shotId = nextId.current++
    setSeg((s) => {
      const stations = [...s.stations]
      const shots = [...s.shots]
      stations.splice(index + 1, 0, newStation(stationId))
      // The shot that used to leave this station now leaves the new one, so its numbers are suspect.
      if (index < shots.length) shots[index] = { ...shots[index], review: true }
      shots.splice(index, 0, newShot(shotId))
      return { stations, shots }
    })
    pendingFocus.current = `l-${shotId}`
  }

  /** Removes a station and the shot arriving at it (for the first station, the shot leaving it). */
  function removeStation(index: number) {
    setSeg((s) => {
      if (s.stations.length <= 2) return s
      const stations = s.stations.filter((_, i) => i !== index)
      const shots = [...s.shots]
      if (index === 0) {
        shots.splice(0, 1)
      } else {
        // The shot that left the removed station now leaves the one before it.
        if (index < shots.length) {
          shots[index] = { ...shots[index], review: true }
        }
        shots.splice(index - 1, 1)
      }
      return { stations, shots }
    })
  }

  function onNumKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLInputElement
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!focusAfter(target)) addAtEnd()
    } else if (event.altKey && event.key.toLowerCase() === 'n') {
      event.preventDefault()
      if (target.dataset.note) focusKey(target.dataset.note)
    }
  }

  /** Enter in a note goes back to the number flow, after the row the note belongs to. */
  function onNoteKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const row = (event.target as HTMLInputElement).dataset.row ?? ''
    const el = document.querySelector(`[data-key="${row}"]`)
    if (!focusAfter(el)) addAtEnd()
  }

  const errors = validate(seg)
  const needReview = seg.shots.filter((h) => h.review).length

  return {
    seg,
    unit,
    unitLabel: unit === 'metric' ? 'm' : 'ft',
    errors: attempted ? errors : {},
    needReview,
    saved,
    setUnit(next: UnitSystem) {
      setUnitState(next)
      setSegRaw((s) => ({
        stations: s.stations.map((x) => ({
          ...x,
          depth: redisplay(x.depth, next),
        })),
        shots: s.shots.map((x) => ({
          ...x,
          distance: redisplay(x.distance, next),
        })),
      }))
    },
    setDepth: (id: number, text: string) =>
      mapStation(id, (x) => ({ ...x, depth: toLength(text, unit) })),
    setStationNote: (id: number, note: string) =>
      mapStation(id, (x) => ({ ...x, note })),
    setDistance: (id: number, text: string) =>
      mapShot(id, (x) => ({
        ...x,
        distance: toLength(text, unit),
        review: false,
      })),
    setAzimuth: (id: number, azimuth: string) =>
      mapShot(id, (x) => ({ ...x, azimuth, review: false })),
    setShotNote: (id: number, note: string) =>
      mapShot(id, (x) => ({ ...x, note })),
    clearReview: (id: number) => mapShot(id, (x) => ({ ...x, review: false })),
    addAtEnd,
    insertAfter,
    removeStation,
    onNumKeyDown,
    onNoteKeyDown,
    save() {
      setAttempted(true)
      setSaved(Object.keys(errors).length === 0 && needReview === 0)
    },
  }
}

export type Draft = ReturnType<typeof useDraft>
