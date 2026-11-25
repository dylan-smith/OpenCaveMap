import type { Segment, SegmentErrors, SegmentRequest } from '../api/segments'

// What the user has typed. Readings are kept as text, and read as numbers when the segment is saved. key identifies a
// row to React, since rows added here have no id until they're saved. shots[i] runs from stations[i] to
// stations[i + 1].
export type DraftStation = {
  key: string
  id: number | null
  depth: string
  note: string
}

export type DraftShot = {
  key: string
  id: number | null
  distance: string
  azimuth: string
  note: string
}

export type Draft = {
  number: number
  surveyDate: string
  name: string
  note: string
  stations: DraftStation[]
  shots: DraftShot[]
}

let lastRowKey = 0

function nextRowKey() {
  lastRowKey += 1
  return `row-${lastRowKey}`
}

export function newStation(): DraftStation {
  return { key: nextRowKey(), id: null, depth: '', note: '' }
}

export function newShot(): DraftShot {
  return { key: nextRowKey(), id: null, distance: '', azimuth: '', note: '' }
}

// A reading is a plain decimal number. Spaces around it and zeros in front of it (045) are fine, and the decimal
// separator is a dot. Thousands separators, exponents and plus signs aren't numbers here. A minus sign is, so that the
// API can say what range the reading must be in.
const plainDecimal = /^-?(\d+(\.\d*)?|\.\d+)$/

// No reading is this long, and any number that fits is one the API can read.
export const readingMaxLength = 20

// The number a reading's text stands for: null when nothing is typed, and NaN when what's typed isn't a number.
function readNumber(text: string) {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }
  return plainDecimal.test(trimmed) ? Number(trimmed) : Number.NaN
}

function readingText(reading: number | null) {
  return reading === null ? '' : String(reading)
}

export function toDraft(segment: Segment): Draft {
  return {
    number: segment.number,
    surveyDate: segment.surveyDate ?? '',
    name: segment.name ?? '',
    note: segment.note ?? '',
    stations: segment.stations.map((station) => ({
      key: nextRowKey(),
      id: station.id,
      depth: readingText(station.depth),
      note: station.note ?? '',
    })),
    shots: segment.shots.map((shot) => ({
      key: nextRowKey(),
      id: shot.id,
      distance: readingText(shot.distance),
      azimuth: readingText(shot.azimuth),
      note: shot.note ?? '',
    })),
  }
}

// A reading that isn't a number (see unreadableReadings) is written to JSON as null, like one that's missing.
export function toRequest(draft: Draft): SegmentRequest {
  return {
    surveyDate: draft.surveyDate === '' ? null : draft.surveyDate,
    name: draft.name,
    note: draft.note,
    stations: draft.stations.map(({ id, depth, note }) => ({
      id,
      depth: readNumber(depth),
      note,
    })),
    shots: draft.shots.map(({ id, distance, azimuth, note }) => ({
      id,
      distance: readNumber(distance),
      azimuth: readNumber(azimuth),
      note,
    })),
  }
}

// The messages from a rejected save, placed on the screen. fields holds one message per field, keyed by surveyDate,
// name or note, or by a row's key and the field's name, so a message stays with the row it was reported for even if
// rows move. general holds the messages that aren't tied to one field.
export type Messages = {
  fields: Record<string, string>
  general: string[]
}

// The fields a message can be placed on.
const segmentFields = ['surveyDate', 'name', 'note']
const stationFields = ['depth', 'note']
const shotFields = ['distance', 'azimuth', 'note']

export function rowField(rowKey: string, field: string) {
  return `${rowKey}.${field}`
}

// The API keys each message by the field's path in the request, such as stations[1].depth, so the row is found by
// its position in the draft that was sent. Returns null for a path with no field on the screen.
function fieldForPath(sent: Draft, path: string) {
  if (segmentFields.includes(path)) {
    return path
  }
  const match = /^(stations|shots)\[(\d+)\]\.(\w+)$/.exec(path)
  if (match === null) {
    return null
  }
  const [, rows, index, field] = match
  const row =
    rows === 'stations'
      ? sent.stations.at(Number(index))
      : sent.shots.at(Number(index))
  const fields = rows === 'stations' ? stationFields : shotFields
  return row && fields.includes(field) ? rowField(row.key, field) : null
}

export function placeMessages(sent: Draft, errors: SegmentErrors): Messages {
  const fields: Record<string, string> = {}
  const general: string[] = []
  for (const [path, messages] of Object.entries(errors)) {
    const field = fieldForPath(sent, path)
    if (field === null) {
      general.push(...messages)
    } else {
      fields[field] = messages.join(' ')
    }
  }
  return { fields, general }
}

// The API takes a reading as a number, so text that isn't one can't be sent, and the screen says so itself. This is
// the only thing about a reading the screen checks: whether it's missing or out of range is the API's to say. Returns
// null when every reading typed is a number.
export function unreadableReadings(draft: Draft): Messages | null {
  const fields: Record<string, string> = {}
  function check(rowKey: string, field: string, name: string, text: string) {
    if (Number.isNaN(readNumber(text))) {
      fields[rowField(rowKey, field)] =
        `${name} must be a number, such as 12.5.`
    }
  }
  for (const station of draft.stations) {
    check(station.key, 'depth', 'Depth', station.depth)
  }
  for (const shot of draft.shots) {
    check(shot.key, 'distance', 'Distance', shot.distance)
    check(shot.key, 'azimuth', 'Azimuth', shot.azimuth)
  }
  return Object.keys(fields).length === 0 ? null : { fields, general: [] }
}

export function fieldsToFix(count: number) {
  return count === 1 ? '1 field needs fixing.' : `${count} fields need fixing.`
}

// A label is the segment's number and the row's position, joined by a dot. Stations count from 0 and shots from 1.
export function stationLabel(draft: Draft, index: number) {
  return `Station ${draft.number}.${index}`
}

export function shotLabel(draft: Draft, index: number) {
  return `Shot ${draft.number}.${index + 1}`
}
