import { screen } from '@testing-library/react'
import { jsonResponse, mockFetch } from './mockFetch'
import { renderAt } from './renderAt'

export const project = { id: 7, name: 'Crystal Cave', unitSystem: 'metric' }

export const savedSegments = [
  {
    id: 12,
    number: 3,
    name: 'Side passage',
    surveyDate: '2026-11-21',
    stationCount: 4,
    // Unrounded, as the API sends it.
    totalLength: 15.504,
    unitSystem: 'metric',
  },
  {
    id: 10,
    number: 1,
    name: null,
    surveyDate: '2026-03-02',
    stationCount: 2,
    totalLength: 30,
    unitSystem: 'metric',
  },
]

// What the API returns for the blank new segment: its number, the default survey date, the project's unit system,
// two stations and a shot.
export function blankSegment(
  surveyDate: string | null = '2026-11-21',
  unitSystem = 'metric',
) {
  return {
    id: null,
    number: 4,
    surveyDate,
    name: null,
    note: null,
    unitSystem,
    stations: [
      { id: null, depth: null, note: null },
      { id: null, depth: null, note: null },
    ],
    shots: [{ id: null, distance: null, azimuth: null, note: null }],
  }
}

// What the API returns for saved segment 12, number 3 in the list: three stations and two shots. Two readings have
// more decimals than are shown.
export function savedSegment(unitSystem = 'metric') {
  return {
    id: 12,
    number: 3,
    surveyDate: '2026-11-21',
    name: 'Side passage',
    note: 'Silty',
    unitSystem,
    stations: [
      { id: 101, depth: 3, note: 'Line arrow' },
      { id: 102, depth: 12.345, note: null },
      { id: 103, depth: 7, note: null },
    ],
    shots: [
      { id: 201, distance: 30, azimuth: 45, note: null },
      {
        id: 202,
        distance: 8.125,
        azimuth: 359.5,
        note: 'Restriction',
      },
    ],
  }
}

// A fake segments API for project 7. A POST, PUT or DELETE gets the handler's response, by default a saved segment
// or, for a DELETE, no content. A PUT to the project itself goes to onUpdateProject.
export function mockApi({
  segments = savedSegments,
  blank = blankSegment(),
  saved = savedSegment(),
  onCreate = () => Promise.resolve(jsonResponse({}, 201)),
  onReplace = () => Promise.resolve(jsonResponse(savedSegment())),
  onDelete = () => Promise.resolve(new Response(null, { status: 204 })),
  onUpdateProject = (body) => Promise.resolve(jsonResponse({ id: 7, ...body })),
}: {
  segments?: unknown[]
  blank?: unknown
  saved?: unknown
  onCreate?: (body: unknown) => Promise<Response>
  onReplace?: (body: unknown, url: string) => Promise<Response>
  onDelete?: (url: string) => Promise<Response>
  onUpdateProject?: (body: Record<string, unknown>) => Promise<Response>
} = {}) {
  return mockFetch((url, init) => {
    if (init?.method === 'DELETE') {
      return onDelete(url)
    }
    // The API client always sends JSON text.
    if (init?.method === 'POST') {
      return onCreate(JSON.parse(init.body as string))
    }
    if (init?.method === 'PUT' && url.endsWith('/api/projects/7')) {
      return onUpdateProject(
        JSON.parse(init.body as string) as Record<string, unknown>,
      )
    }
    if (init?.method === 'PUT') {
      return onReplace(JSON.parse(init.body as string), url)
    }
    if (url.endsWith('/api/projects/7/segments/new')) {
      return Promise.resolve(jsonResponse(blank))
    }
    if (url.endsWith('/api/projects/7/segments/12')) {
      return Promise.resolve(jsonResponse(saved))
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
