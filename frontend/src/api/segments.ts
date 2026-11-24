import { apiBaseUrl } from '../config'
import { apiFetch } from './client'
import { ApiError } from './projects'
import type { UnitSystem } from './projects'

// A row in a project's list of segments. totalLength is display text in unitSystem, the project's.
export type SegmentSummary = {
  id: number
  number: number
  name: string | null
  surveyDate: string
  stationCount: number
  totalLength: string
  unitSystem: UnitSystem
}

// A segment as the entry screen shows it: a saved one, or a blank new one without ids. Readings are display text,
// depths and distances in unitSystem and azimuths in degrees, and the survey date is YYYY-MM-DD.
export type Segment = {
  id: number | null
  number: number
  surveyDate: string | null
  name: string | null
  note: string | null
  unitSystem: UnitSystem
  stations: Station[]
  shots: Shot[]
}

export type Station = {
  id: number | null
  label: string
  depth: string
  note: string | null
}

export type Shot = {
  id: number | null
  label: string
  distance: string
  azimuth: string
  note: string | null
}

// Exactly what the user typed. The API trims, parses and validates it, and converts the depths and distances from
// unitSystem, which is the one the segment was shown in.
export type SegmentRequest = {
  surveyDate: string
  name: string
  note: string
  unitSystem: UnitSystem
  stations: { id: number | null; depth: string; note: string }[]
  shots: {
    id: number | null
    distance: string
    azimuth: string
    note: string
  }[]
}

export const segmentRejectedMessage = "This segment couldn't be saved."

// The API's validation messages, keyed by the camelCase path of the field each belongs to: surveyDate, name, note,
// stations[i].depth, shots[i].azimuth and so on, where i is the row's position in the request. A message keyed by
// stations or shots alone is about the segment as a whole.
export type SegmentErrors = Record<string, string[]>

type ValidationProblem = {
  errors?: SegmentErrors
}

// Thrown when the API rejects what the user typed, carrying its messages for the screen to place.
export class SegmentRejectedError extends ApiError {
  readonly errors: SegmentErrors

  constructor(errors: SegmentErrors) {
    super(400, segmentRejectedMessage)
    this.name = 'SegmentRejectedError'
    this.errors = errors
  }
}

function segmentsUrl(projectId: number) {
  return `${apiBaseUrl}/api/projects/${projectId}/segments`
}

export async function listSegments(
  projectId: number,
): Promise<SegmentSummary[]> {
  const response = await apiFetch(segmentsUrl(projectId))
  if (!response.ok) {
    throw new Error('Unable to load segments.')
  }
  return (await response.json()) as SegmentSummary[]
}

// The segment to start entering from, with the number it will get. Returns null when there's no project with this
// id.
export async function getNewSegment(
  projectId: number,
): Promise<Segment | null> {
  const response = await apiFetch(`${segmentsUrl(projectId)}/new`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error('Unable to load the new segment.')
  }
  return (await response.json()) as Segment
}

// A saved segment. Returns null when there's no such segment in a project of this user's.
export async function getSegment(
  projectId: number,
  segmentId: number,
): Promise<Segment | null> {
  const response = await apiFetch(`${segmentsUrl(projectId)}/${segmentId}`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error('Unable to load the segment.')
  }
  return (await response.json()) as Segment
}

export function createSegment(
  projectId: number,
  segment: SegmentRequest,
): Promise<Segment> {
  return saveSegment(segmentsUrl(projectId), 'POST', segment)
}

// Replaces the whole saved segment. Rows with an id update that station or shot, rows without one are new, and saved
// rows left out are removed.
export function replaceSegment(
  projectId: number,
  segmentId: number,
  segment: SegmentRequest,
): Promise<Segment> {
  return saveSegment(`${segmentsUrl(projectId)}/${segmentId}`, 'PUT', segment)
}

// A 404 means the segment is already gone, which is what the caller wanted.
export async function deleteSegment(projectId: number, segmentId: number) {
  const response = await apiFetch(`${segmentsUrl(projectId)}/${segmentId}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 404) {
    throw new Error('Unable to delete segment.')
  }
}

// A 400 means the API rejected something the user typed, so it's thrown with the API's messages for the screen to
// place.
async function saveSegment(
  url: string,
  method: 'POST' | 'PUT',
  segment: SegmentRequest,
): Promise<Segment> {
  const response = await apiFetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(segment),
  })

  if (response.status === 400) {
    const problem = (await response.json()) as ValidationProblem
    throw new SegmentRejectedError(problem.errors ?? {})
  }
  // The user is signed out by now. The screen keeps their entries until they sign in again, then shows this.
  if (response.status === 401) {
    throw new ApiError(
      401,
      'You were signed out before the segment could be saved. Save it again.',
    )
  }
  if (!response.ok) {
    throw new Error('Unable to save segment.')
  }
  return (await response.json()) as Segment
}
