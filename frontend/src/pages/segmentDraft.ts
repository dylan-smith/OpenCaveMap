import type { UnitSystem } from '../api/projects'
import type { Segment, SegmentErrors, SegmentRequest } from '../api/segments'

// What the user has typed, kept as text until the API parses it. key identifies a row to React, since rows added
// here have no id until they're saved. shots[i] runs from stations[i] to stations[i + 1].
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
  // Set when inserting or removing a station makes this shot join different stations, so its distance and azimuth
  // need checking. It belongs to this editing session and is never saved.
  review: boolean
}

// unitSystem is the one the API sent the readings in. It goes back with them unchanged, so the API converts what was
// typed from the units the screen showed, even if the project's setting has changed since.
export type Draft = {
  number: number
  unitSystem: UnitSystem
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
  return {
    key: nextRowKey(),
    id: null,
    distance: '',
    azimuth: '',
    note: '',
    review: false,
  }
}

export function toDraft(segment: Segment): Draft {
  return {
    number: segment.number,
    unitSystem: segment.unitSystem,
    surveyDate: segment.surveyDate ?? '',
    name: segment.name ?? '',
    note: segment.note ?? '',
    stations: segment.stations.map((station) => ({
      key: nextRowKey(),
      id: station.id,
      depth: station.depth,
      note: station.note ?? '',
    })),
    shots: segment.shots.map((shot) => ({
      key: nextRowKey(),
      id: shot.id,
      distance: shot.distance,
      azimuth: shot.azimuth,
      note: shot.note ?? '',
      review: false,
    })),
  }
}

// Stations and shots are inserted and removed in pairs so the segment has no gap: a station with the shot arriving at
// it, or for the first station, the shot leaving it. The one shot that then joins different stations is flagged.
export function insertStationAfter(
  draft: Draft,
  index: number,
  station: DraftStation,
  shot: DraftShot,
): Draft {
  return {
    ...draft,
    stations: draft.stations.toSpliced(index + 1, 0, station),
    // The shot that used to leave this station now leaves the new one.
    shots: flagShot(draft.shots, index).toSpliced(index, 0, shot),
  }
}

export function removeStationAt(draft: Draft, index: number): Draft {
  const stations = draft.stations.toSpliced(index, 1)
  if (index === 0) {
    return { ...draft, stations, shots: draft.shots.toSpliced(0, 1) }
  }
  // The shot that left the removed station now leaves the one before it.
  return {
    ...draft,
    stations,
    shots: flagShot(draft.shots, index).toSpliced(index - 1, 1),
  }
}

// Flags the shot at index for review, if there is one.
function flagShot(shots: DraftShot[], index: number) {
  return shots.map((shot, i) =>
    i === index ? { ...shot, review: true } : shot,
  )
}

// The shot removed along with the station at index.
export function shotRemovedWith(draft: Draft, index: number) {
  return draft.shots.at(index === 0 ? 0 : index - 1)
}

export function toRequest(draft: Draft): SegmentRequest {
  return {
    surveyDate: draft.surveyDate,
    name: draft.name,
    note: draft.note,
    unitSystem: draft.unitSystem,
    stations: draft.stations.map(({ id, depth, note }) => ({
      id,
      depth,
      note,
    })),
    shots: draft.shots.map(({ id, distance, azimuth, note }) => ({
      id,
      distance,
      azimuth,
      note,
    })),
  }
}

// What a save would send, so two drafts with the same entries match even if their rows' keys or review flags differ.
// Comparing with this tells whether anything has changed since the screen opened.
export function comparisonText(draft: Draft) {
  return JSON.stringify(toRequest(draft))
}

// The API's messages from a rejected save, placed on the screen. fields holds one message per field, keyed by
// surveyDate, name or note, or by a row's key and the field's name, so a message stays with the row it was reported
// for even if rows move. general holds the messages that aren't tied to one field.
export type Messages = {
  fields: Record<string, string>
  general: string[]
}

// The fields a message can be placed on.
const segmentFields = ['surveyDate', 'name', 'note']
export const stationFields = ['depth', 'note']
export const shotFields = ['distance', 'azimuth', 'note']

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

export function fieldsToFix(count: number) {
  return count === 1 ? '1 field needs fixing.' : `${count} fields need fixing.`
}

export function shotsToCheck(count: number) {
  return count === 1
    ? '1 shot needs checking.'
    : `${count} shots need checking.`
}

// Labels come from the API for saved rows, but rows are added before anything is saved, so while editing they're
// worked out from the segment's number and the row's position. Stations count from 0 and shots from 1.
export function stationLabel(draft: Draft, index: number) {
  return `Station ${draft.number}.${index}`
}

export function shotLabel(draft: Draft, index: number) {
  return `Shot ${draft.number}.${index + 1}`
}

// The readings in the order they're written on a slate: each station's depth, then the distance and azimuth of the
// shot leaving it. Enter moves along this order. Tab follows it too, because the notes are out of the Tab order.
export function readingOrder(draft: Draft) {
  return draft.stations.flatMap((station, index) => {
    const shot = draft.shots.at(index)
    return shot
      ? [
          rowField(station.key, 'depth'),
          rowField(shot.key, 'distance'),
          rowField(shot.key, 'azimuth'),
        ]
      : [rowField(station.key, 'depth')]
  })
}
