import { apiBaseUrl } from '../config'
import { apiFetch } from './client'
import { ApiError } from './projects'

// A row in a project's list of segments. totalLength is in metres, unrounded.
export type SegmentSummary = {
  id: number
  number: number
  name: string | null
  surveyDate: string
  stationCount: number
  totalLength: number
}

// A segment as the entry screen shows it: a saved one, or a blank new one without ids or readings. Stations and
// shots are in order along the line. Depths and distances are in metres and azimuths in degrees, all unrounded, and
// the survey date is YYYY-MM-DD.
export type Segment = {
  id: number | null
  number: number
  surveyDate: string | null
  name: string | null
  note: string | null
  stations: Station[]
  shots: Shot[]
}

export type Station = {
  id: number | null
  depth: number | null
  note: string | null
}

export type Shot = {
  id: number | null
  distance: number | null
  azimuth: number | null
  note: string | null
}

// What the user entered. A reading is a number, or null when none was entered, and the survey date is YYYY-MM-DD, or
// null. The API trims the name and notes, and validates everything.
export type SegmentRequest = {
  surveyDate: string | null
  name: string
  note: string
  stations: { id: number | null; depth: number | null; note: string }[]
  shots: {
    id: number | null
    distance: number | null
    azimuth: number | null
    note: string
  }[]
}

export const segmentRejectedMessage =
  "This segment couldn't be saved. Check the survey date and every reading, then try again."

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

// A 400 means the API rejected something the user typed, so it's thrown as an ApiError for the screen to show.
export async function createSegment(
  projectId: number,
  segment: SegmentRequest,
): Promise<Segment> {
  const response = await apiFetch(segmentsUrl(projectId), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(segment),
  })

  if (response.status === 400) {
    throw new ApiError(400, segmentRejectedMessage)
  }
  if (!response.ok) {
    throw new Error('Unable to save segment.')
  }
  return (await response.json()) as Segment
}
