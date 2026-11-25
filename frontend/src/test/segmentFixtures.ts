import { screen } from '@testing-library/react'
import { jsonResponse, mockFetch } from './mockFetch'
import { renderAt } from './renderAt'

export const project = { id: 7, name: 'Crystal Cave' }

export const savedSegments = [
  {
    id: 12,
    number: 3,
    name: 'Side passage',
    surveyDate: '2026-11-21',
    stationCount: 4,
    // Unrounded, as the API sends it.
    totalLength: 15.504,
  },
  {
    id: 10,
    number: 1,
    name: null,
    surveyDate: '2026-03-02',
    stationCount: 2,
    totalLength: 30,
  },
]

// What the API returns for the blank new segment: its number, the default survey date, two stations and a shot.
export function blankSegment(surveyDate: string | null = '2026-11-21') {
  return {
    id: null,
    number: 4,
    surveyDate,
    name: null,
    note: null,
    stations: [
      { id: null, depth: null, note: null },
      { id: null, depth: null, note: null },
    ],
    shots: [{ id: null, distance: null, azimuth: null, note: null }],
  }
}

// A fake segments API for project 7. A POST gets the handler's response, or 201 with an empty body by default.
export function mockApi({
  segments = savedSegments,
  blank = blankSegment(),
  onCreate = () => Promise.resolve(jsonResponse({}, 201)),
}: {
  segments?: unknown[]
  blank?: unknown
  onCreate?: (body: unknown) => Promise<Response>
} = {}) {
  return mockFetch((url, init) => {
    // The API client always sends JSON text.
    if (init?.method === 'POST') {
      return onCreate(JSON.parse(init.body as string))
    }
    if (url.endsWith('/api/projects/7/segments/new')) {
      return Promise.resolve(jsonResponse(blank))
    }
    if (url.endsWith('/api/projects/7/segments')) {
      return Promise.resolve(jsonResponse(segments))
    }
    if (url.endsWith('/api/projects/7')) {
      return Promise.resolve(jsonResponse(project))
    }
    return Promise.resolve(new Response(null, { status: 404 }))
  })
}

// The API's validation problem response, with each message keyed by the path of the field it belongs to.
export function rejected(
  errors: Record<string, string[]> = {
    'stations[1].depth': ['Depth is required.'],
  },
): Promise<Response> {
  return Promise.resolve(
    jsonResponse(
      {
        title: 'One or more validation errors occurred.',
        status: 400,
        errors,
      },
      400,
    ),
  )
}

// A rejection covering the survey date, the second station's depth, the second shot's distance and azimuth, and a
// message that isn't tied to one field.
export const rejectedSegment = {
  surveyDate: ['Survey date is required.'],
  'stations[1].depth': ['Depth is required.'],
  'shots[1].distance': ['Distance must be more than zero.'],
  'shots[1].azimuth': ['Azimuth must be from 0 to 360.'],
  stations: ['A segment needs at least two stations.'],
}

export async function openNewSegment() {
  renderAt('/projects/7/segments/new')
  return screen.findByRole('heading', { name: 'Segment 4' })
}
