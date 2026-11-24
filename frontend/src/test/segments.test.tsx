import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { trackEvent, trackException } from '../telemetry'
import {
  jsonResponse,
  mockFetch,
  unreachable,
  unreachableMessage,
} from './mockFetch'
import { renderAt } from './renderAt'

vi.mock('../telemetry', () => ({
  trackEvent: vi.fn(),
  trackException: vi.fn(),
  trackPageView: vi.fn(),
}))

const project = { id: 7, name: 'Crystal Cave' }

const savedSegments = [
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
function blankSegment(surveyDate: string | null = '2026-11-21') {
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

// What the API returns for saved segment 12, number 3 in the list: three stations and two shots. Two readings have
// more decimals than are shown.
function savedSegment() {
  return {
    id: 12,
    number: 3,
    surveyDate: '2026-11-21',
    name: 'Side passage',
    note: 'Silty',
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

// A fake segments API for project 7. A POST or PUT gets the handler's response, or a saved segment by default.
function mockApi({
  segments = savedSegments,
  blank = blankSegment(),
  saved = savedSegment(),
  onCreate = () => Promise.resolve(jsonResponse({}, 201)),
  onReplace = () => Promise.resolve(jsonResponse(savedSegment())),
}: {
  segments?: unknown[]
  blank?: unknown
  saved?: unknown
  onCreate?: (body: unknown) => Promise<Response>
  onReplace?: (body: unknown, url: string) => Promise<Response>
} = {}) {
  return mockFetch((url, init) => {
    // The API client always sends JSON text.
    if (init?.method === 'POST') {
      return onCreate(JSON.parse(init.body as string))
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
function rejected(
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
const rejectedSegment = {
  surveyDate: ['Survey date is required.'],
  'stations[1].depth': ['Depth is required.'],
  'shots[1].distance': ['Distance must be more than zero.'],
  'shots[1].azimuth': ['Azimuth must be from 0 to 360.'],
  stations: ['A segment needs at least two stations.'],
}

async function openNewSegment() {
  renderAt('/projects/7/segments/new')
  return screen.findByRole('heading', { name: 'Segment 4' })
}

beforeEach(() => {
  setSession({ token: 'test:Tester', name: 'Tester', provider: 'test' })
})

afterEach(() => {
  act(() => setSession(null))
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('project page segments', () => {
  it('lists each segment with its number, name, survey date, stations and total length', async () => {
    mockApi()

    renderAt('/projects/7')

    const list = await screen.findByRole('list', { name: 'Segments' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Segment 3 · Side passage')
    expect(items[0]).toHaveTextContent('2026-11-21 · 4 stations · 15.5 m')
    expect(items[1]).toHaveTextContent('Segment 1')
    expect(items[1]).not.toHaveTextContent('Segment 1 ·')
    expect(items[1]).toHaveTextContent('2026-03-02 · 2 stations · 30 m')
  })

  it('says when the project has no segments yet', async () => {
    mockApi({ segments: [] })

    renderAt('/projects/7')

    expect(await screen.findByText('No segments yet.')).toBeInTheDocument()
  })

  it('links to the entry screen to add a segment', async () => {
    mockApi()

    renderAt('/projects/7')

    expect(
      await screen.findByRole('link', { name: 'Add segment' }),
    ).toHaveAttribute('href', '/projects/7/segments/new')
  })

  it('opens a segment from its row in the list', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/projects/7')
    const list = await screen.findByRole('list', { name: 'Segments' })

    const row = within(list).getByRole('link', { name: /Segment 3/ })
    expect(row).toHaveAttribute('href', '/projects/7/segments/12')
    expect(
      within(list).getByRole('link', { name: /Segment 1/ }),
    ).toHaveAttribute('href', '/projects/7/segments/10')
    await user.click(row)

    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.35')
  })

  it('shows a message when the segments cannot be loaded', async () => {
    mockFetch((url) =>
      url.endsWith('/segments')
        ? unreachable()
        : Promise.resolve(jsonResponse(project)),
    )

    renderAt('/projects/7')

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
  })
})

describe('segment entry screen', () => {
  it('opens the new segment the API supplies, with the default survey date', async () => {
    mockApi()

    await openNewSegment()

    expect(screen.getByLabelText(/Survey date/)).toHaveValue('2026-11-21')
    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Segment note')).toHaveValue('')
    for (const name of [
      'Station 4.0 depth (m)',
      'Station 4.0 note',
      'Shot 4.1 distance (m)',
      'Shot 4.1 azimuth (°)',
      'Shot 4.1 note',
      'Station 4.1 depth (m)',
      'Station 4.1 note',
    ]) {
      expect(screen.getByLabelText(name)).toHaveValue('')
    }
    expect(screen.queryByLabelText(/Shot 4\.2/)).not.toBeInTheDocument()
  })

  it('leaves the survey date empty for a project with no segments', async () => {
    mockApi({ blank: blankSegment(null) })

    await openNewSegment()

    expect(screen.getByLabelText(/Survey date/)).toHaveValue('')
  })

  it('shows every label with the word Station or Shot, in sequence order', async () => {
    mockApi()

    await openNewSegment()

    const labels = screen
      .getAllByText(/^(Station|Shot) \d+\.\d+$/)
      .map((label) => label.textContent)
    expect(labels).toEqual(['Station 4.0', 'Shot 4.1', 'Station 4.1'])
  })

  it('adds a shot and station with the next labels', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()

    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )

    const labels = screen
      .getAllByText(/^(Station|Shot) \d+\.\d+$/)
      .map((label) => label.textContent)
    expect(labels).toEqual([
      'Station 4.0',
      'Shot 4.1',
      'Station 4.1',
      'Shot 4.2',
      'Station 4.2',
      'Shot 4.3',
      'Station 4.3',
    ])
    expect(screen.getByLabelText('Shot 4.3 distance (m)')).toHaveValue('')
    expect(screen.getByLabelText('Station 4.3 depth (m)')).toHaveValue('')
  })

  it('saves what was typed and returns to the project page, where the segment is listed', async () => {
    const user = userEvent.setup()
    let created: unknown
    mockApi({
      segments: [],
      onCreate: (body) => {
        created = body
        return Promise.resolve(jsonResponse({}, 201))
      },
    })
    await openNewSegment()

    await user.type(screen.getByLabelText('Name'), ' Main line ')
    await user.type(screen.getByLabelText('Segment note'), 'Clear water')
    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await user.type(screen.getByLabelText('Station 4.0 note'), 'Line arrow')
    await user.type(screen.getByLabelText('Shot 4.1 distance (m)'), '12.5')
    await user.type(screen.getByLabelText('Shot 4.1 azimuth (°)'), '045')
    await user.type(screen.getByLabelText('Shot 4.1 note'), 'Restriction')
    await user.type(screen.getByLabelText('Station 4.1 depth (m)'), '7')
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.type(screen.getByLabelText('Shot 4.2 distance (m)'), '4')
    await user.type(screen.getByLabelText('Shot 4.2 azimuth (°)'), '360')
    await user.type(screen.getByLabelText('Station 4.2 depth (m)'), ' 0 ')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(created).toEqual({
      surveyDate: '2026-11-21',
      name: ' Main line ',
      note: 'Clear water',
      stations: [
        { id: null, depth: 3, note: 'Line arrow' },
        { id: null, depth: 7, note: '' },
        { id: null, depth: 0, note: '' },
      ],
      shots: [
        { id: null, distance: 12.5, azimuth: 45, note: 'Restriction' },
        { id: null, distance: 4, azimuth: 360, note: '' },
      ],
    })
    expect(trackEvent).toHaveBeenCalledWith('SegmentCreated')
  })

  it('sends each reading as the number typed, and a blank reading or survey date as missing', async () => {
    const user = userEvent.setup()
    let created: unknown
    mockApi({
      blank: blankSegment(null),
      onCreate: (body) => {
        created = body
        return rejected()
      },
    })
    await openNewSegment()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '-2')
    await user.type(screen.getByLabelText('Shot 4.1 distance (m)'), '.5')
    await user.type(screen.getByLabelText('Shot 4.1 azimuth (°)'), ' 12. ')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('alert')
    expect(created).toEqual({
      surveyDate: null,
      name: '',
      note: '',
      stations: [
        { id: null, depth: -2, note: '' },
        { id: null, depth: null, note: '' },
      ],
      shots: [{ id: null, distance: 0.5, azimuth: 12, note: '' }],
    })
  })

  it('keeps the survey date and the readings within what the API can read', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    const depth = screen.getByLabelText('Station 4.0 depth (m)')

    await user.type(depth, '1234567890123456789012345')

    expect(depth).toHaveValue('12345678901234567890')
    expect(screen.getByLabelText('Shot 4.1 distance (m)')).toHaveAttribute(
      'maxlength',
      '20',
    )
    expect(screen.getByLabelText('Shot 4.1 azimuth (°)')).toHaveAttribute(
      'maxlength',
      '20',
    )
    expect(screen.getByLabelText(/Survey date/)).toHaveAttribute(
      'max',
      '9999-12-31',
    )
  })

  it('lists the saved segment on the project page after saving', async () => {
    const user = userEvent.setup()
    const segments: unknown[] = []
    mockApi({
      segments,
      onCreate: () => {
        segments.push(savedSegments[0])
        return Promise.resolve(jsonResponse({}, 201))
      },
    })
    await openNewSegment()

    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    const list = await screen.findByRole('list', { name: 'Segments' })
    expect(within(list).getByRole('listitem')).toHaveTextContent(
      'Segment 3 · Side passage',
    )
  })

  it('says the segment could not be saved when the API rejects it, and keeps what was typed', async () => {
    const user = userEvent.setup()
    mockApi({ onCreate: () => rejected() })
    await openNewSegment()

    await user.type(screen.getByLabelText('Name'), 'Main line')
    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.type(screen.getByLabelText('Shot 4.2 azimuth (°)'), '90')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This segment couldn't be saved. 1 field needs fixing.",
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Main line')
    expect(screen.getByLabelText('Station 4.0 depth (m)')).toHaveValue('3')
    expect(screen.getByLabelText('Shot 4.2 azimuth (°)')).toHaveValue('90')
    expect(
      screen.getByRole('heading', { name: 'Segment 4' }),
    ).toBeInTheDocument()
    expect(trackException).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('shows each message beside its field and marks the field invalid, with a summary', async () => {
    const user = userEvent.setup()
    mockApi({ onCreate: () => rejected(rejectedSegment) })
    await openNewSegment()

    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.clear(screen.getByLabelText(/Survey date/))
    await user.type(screen.getByLabelText('Name'), 'Main line')
    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await user.type(screen.getByLabelText('Station 4.0 note'), 'Line arrow')
    await user.type(screen.getByLabelText('Shot 4.1 distance (m)'), '12.5')
    await user.type(screen.getByLabelText('Shot 4.2 distance (m)'), '0')
    await user.type(screen.getByLabelText('Shot 4.2 azimuth (°)'), '400')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('4 fields need fixing.')
    expect(summary).toHaveTextContent('A segment needs at least two stations.')

    const invalid = [
      [/Survey date/, 'Survey date is required.'],
      ['Station 4.1 depth (m)', 'Depth is required.'],
      ['Shot 4.2 distance (m)', 'Distance must be more than zero.'],
      ['Shot 4.2 azimuth (°)', 'Azimuth must be from 0 to 360.'],
    ] as const
    for (const [name, message] of invalid) {
      const field = screen.getByLabelText(name)
      expect(field).toBeInvalid()
      expect(field).toHaveAccessibleDescription(message)
    }
    for (const name of [
      'Name',
      'Station 4.0 depth (m)',
      'Shot 4.1 distance (m)',
      'Shot 4.1 azimuth (°)',
      'Station 4.2 depth (m)',
    ]) {
      expect(screen.getByLabelText(name)).toBeValid()
    }

    expect(screen.getByLabelText('Name')).toHaveValue('Main line')
    expect(screen.getByLabelText('Station 4.0 depth (m)')).toHaveValue('3')
    expect(screen.getByLabelText('Station 4.0 note')).toHaveValue('Line arrow')
    expect(screen.getByLabelText('Shot 4.1 distance (m)')).toHaveValue('12.5')
    expect(screen.getByLabelText('Shot 4.2 distance (m)')).toHaveValue('0')
    expect(screen.getByLabelText('Shot 4.2 azimuth (°)')).toHaveValue('400')
    expect(screen.getByLabelText('Station 4.2 depth (m)')).toHaveValue('')
    expect(trackException).not.toHaveBeenCalled()
  })

  it('says beside its field that a reading is not a number, without sending the segment, and saves once each is one', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn((body: unknown) =>
      Promise.resolve(jsonResponse(body, 201)),
    )
    mockApi({ onCreate })
    await openNewSegment()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), 'deep')
    await user.type(screen.getByLabelText('Shot 4.1 distance (m)'), '12,5')
    await user.type(screen.getByLabelText('Shot 4.1 azimuth (°)'), 'N')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This segment couldn't be saved. 3 fields need fixing.",
    )
    const invalid = [
      ['Station 4.0 depth (m)', 'Depth must be a number, such as 12.5.'],
      ['Shot 4.1 distance (m)', 'Distance must be a number, such as 12.5.'],
      ['Shot 4.1 azimuth (°)', 'Azimuth must be a number, such as 12.5.'],
    ] as const
    for (const [name, message] of invalid) {
      const field = screen.getByLabelText(name)
      expect(field).toBeInvalid()
      expect(field).toHaveAccessibleDescription(message)
    }
    // Left blank, which is the API's to say.
    expect(screen.getByLabelText('Station 4.1 depth (m)')).toBeValid()
    expect(screen.getByLabelText('Shot 4.1 distance (m)')).toHaveValue('12,5')
    expect(onCreate).not.toHaveBeenCalled()
    expect(trackException).not.toHaveBeenCalled()

    await user.clear(screen.getByLabelText('Station 4.0 depth (m)'))
    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await user.clear(screen.getByLabelText('Shot 4.1 distance (m)'))
    await user.type(screen.getByLabelText('Shot 4.1 distance (m)'), '12.5')
    await user.clear(screen.getByLabelText('Shot 4.1 azimuth (°)'))
    await user.type(screen.getByLabelText('Shot 4.1 azimuth (°)'), '0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(onCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        stations: [
          { id: null, depth: 3, note: '' },
          { id: null, depth: null, note: '' },
        ],
        shots: [{ id: null, distance: 12.5, azimuth: 0, note: '' }],
      }),
    )
  })

  it('takes only a plain decimal number for a reading', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(() => Promise.resolve(jsonResponse({}, 201)))
    mockApi({ onCreate })
    await openNewSegment()
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )

    const typed = [
      ['Station 4.0 depth (m)', '1,000'],
      ['Shot 4.1 distance (m)', '1e3'],
      ['Shot 4.1 azimuth (°)', '+5'],
      ['Station 4.1 depth (m)', '1 000'],
      ['Shot 4.2 distance (m)', '12.5.1'],
      ['Shot 4.2 azimuth (°)', '0x10'],
      ['Station 4.2 depth (m)', 'Infinity'],
    ] as const
    for (const [name, text] of typed) {
      await user.type(screen.getByLabelText(name), text)
    }
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '7 fields need fixing.',
    )
    for (const [name] of typed) {
      expect(screen.getByLabelText(name)).toBeInvalid()
    }
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('keeps each message on the row it was reported for when rows are added', async () => {
    const user = userEvent.setup()
    mockApi({ onCreate: () => rejected(rejectedSegment) })
    await openNewSegment()
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await screen.findByRole('alert')

    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )

    expect(
      screen.getByLabelText('Station 4.1 depth (m)'),
    ).toHaveAccessibleDescription('Depth is required.')
    expect(screen.getByLabelText('Shot 4.2 distance (m)')).toBeInvalid()
    expect(screen.getByLabelText('Shot 4.3 distance (m)')).toBeValid()
    expect(screen.getByLabelText('Station 4.3 depth (m)')).toBeValid()
  })

  it("clears a field's message when that field is changed", async () => {
    const user = userEvent.setup()
    mockApi({ onCreate: () => rejected(rejectedSegment) })
    await openNewSegment()
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    const summary = await screen.findByRole('alert')

    await user.type(screen.getByLabelText('Station 4.1 depth (m)'), '7')
    await user.type(screen.getByLabelText('Shot 4.2 azimuth (°)'), '90')

    for (const name of ['Station 4.1 depth (m)', 'Shot 4.2 azimuth (°)']) {
      const field = screen.getByLabelText(name)
      expect(field).toBeValid()
      expect(field).not.toHaveAccessibleDescription()
    }
    expect(screen.getByLabelText('Shot 4.2 distance (m)')).toBeInvalid()
    expect(screen.getByLabelText(/Survey date/)).toBeInvalid()
    expect(summary).toHaveTextContent('2 fields need fixing.')
  })

  it('saves once every field is fixed, leaving no messages behind', async () => {
    const user = userEvent.setup()
    let attempts = 0
    mockApi({
      onCreate: () => {
        attempts += 1
        return attempts === 1
          ? rejected({ 'stations[1].depth': ['Depth is required.'] })
          : Promise.resolve(jsonResponse({}, 201))
      },
    })
    await openNewSegment()
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 field needs fixing.',
    )

    await user.type(screen.getByLabelText('Station 4.1 depth (m)'), '7')
    expect(screen.getByLabelText('Station 4.1 depth (m)')).toBeValid()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(attempts).toBe(2)
  })

  it('shows a message the screen has no field for in the summary', async () => {
    const user = userEvent.setup()
    mockApi({
      onCreate: () => rejected({ 'stations[5].depth': ['Depth is required.'] }),
    })
    await openNewSegment()

    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('Depth is required.')
    expect(summary).not.toHaveTextContent('need fixing')
  })

  it("shows the can't reach message when the API is unreachable on save, and keeps what was typed", async () => {
    const user = userEvent.setup()
    mockApi({ onCreate: unreachable })
    await openNewSegment()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
    expect(screen.getByLabelText('Station 4.0 depth (m)')).toHaveValue('3')
    expect(screen.getByRole('button', { name: 'Save segment' })).toBeEnabled()
    expect(trackException).toHaveBeenCalledTimes(1)
  })

  it('goes back to the project page without saving', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()

    await user.click(screen.getByRole('link', { name: '← Back to project' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it("shows the not found page when the project doesn't exist", async () => {
    mockFetch(() => Promise.resolve(new Response(null, { status: 404 })))

    renderAt('/projects/7/segments/new')

    expect(
      await screen.findByText(
        "That project doesn't exist. It may have been deleted.",
      ),
    ).toBeInTheDocument()
  })

  it.each(['abc', '0', '1.5'])(
    'shows the not found page for the project id %j without calling the API',
    (id) => {
      mockFetch(() => Promise.resolve(jsonResponse({})))

      renderAt(`/projects/${id}/segments/new`)

      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('shows a message when the API is unreachable', async () => {
    mockFetch(unreachable)

    renderAt('/projects/7/segments/new')

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
    expect(trackException).toHaveBeenCalledTimes(1)
  })
})

describe('reopening a saved segment', () => {
  async function openSavedSegment() {
    renderAt('/projects/7/segments/12')
    return screen.findByRole('heading', { name: 'Segment 3' })
  }

  it('shows its survey date, name, note, and every station and shot with its label, readings and note', async () => {
    mockApi()

    await openSavedSegment()

    expect(screen.getByLabelText(/Survey date/)).toHaveValue('2026-11-21')
    expect(screen.getByLabelText('Name')).toHaveValue('Side passage')
    expect(screen.getByLabelText('Segment note')).toHaveValue('Silty')
    const labels = screen
      .getAllByText(/^(Station|Shot) \d+\.\d+$/)
      .map((label) => label.textContent)
    expect(labels).toEqual([
      'Station 3.0',
      'Shot 3.1',
      'Station 3.1',
      'Shot 3.2',
      'Station 3.2',
    ])
    const values = [
      ['Station 3.0 depth (m)', '3'],
      ['Station 3.0 note', 'Line arrow'],
      ['Shot 3.1 distance (m)', '30'],
      ['Shot 3.1 azimuth (°)', '45'],
      ['Shot 3.1 note', ''],
      ['Station 3.1 depth (m)', '12.35'],
      ['Station 3.1 note', ''],
      ['Shot 3.2 distance (m)', '8.13'],
      ['Shot 3.2 azimuth (°)', '359.5'],
      ['Shot 3.2 note', 'Restriction'],
      ['Station 3.2 depth (m)', '7'],
      ['Station 3.2 note', ''],
    ]
    for (const [name, value] of values) {
      expect(screen.getByLabelText(name)).toHaveValue(value)
    }
  })

  it('saves the changes over the segment and returns to the project page, where the list reflects them', async () => {
    const user = userEvent.setup()
    const segments = [...savedSegments]
    let replaced: unknown
    let replacedAt = ''
    mockApi({
      segments,
      onReplace: (body, url) => {
        replaced = body
        replacedAt = url
        segments.splice(0, 2, savedSegments[1], {
          ...savedSegments[0],
          name: 'Upstream',
          surveyDate: '2026-01-05',
          totalLength: 39.13,
        })
        return Promise.resolve(jsonResponse(savedSegment()))
      },
    })
    await openSavedSegment()

    await user.clear(screen.getByLabelText(/Survey date/))
    await user.type(screen.getByLabelText(/Survey date/), '2026-01-05')
    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Upstream')
    await user.clear(screen.getByLabelText('Shot 3.1 distance (m)'))
    await user.type(screen.getByLabelText('Shot 3.1 distance (m)'), '31')
    await user.clear(screen.getByLabelText('Station 3.0 note'))
    await user.type(screen.getByLabelText('Shot 3.1 note'), 'Low')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(replacedAt).toMatch(/\/api\/projects\/7\/segments\/12$/)
    // The readings that weren't changed go back as the API sent them, not as they were shown.
    expect(replaced).toEqual({
      surveyDate: '2026-01-05',
      name: 'Upstream',
      note: 'Silty',
      stations: [
        { id: 101, depth: 3, note: '' },
        { id: 102, depth: 12.345, note: '' },
        { id: 103, depth: 7, note: '' },
      ],
      shots: [
        { id: 201, distance: 31, azimuth: 45, note: 'Low' },
        { id: 202, distance: 8.125, azimuth: 359.5, note: 'Restriction' },
      ],
    })
    expect(trackEvent).toHaveBeenCalledWith('SegmentUpdated')
    expect(trackEvent).not.toHaveBeenCalledWith('SegmentCreated')
    const items = within(
      await screen.findByRole('list', { name: 'Segments' }),
    ).getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('Segment 3 · Upstream')
    expect(items[1]).toHaveTextContent('2026-01-05 · 4 stations · 39.13 m')
  })

  it('saves a shot and station added at the end as new rows, with the next labels', async () => {
    const user = userEvent.setup()
    let replaced: { stations: unknown[]; shots: unknown[] } | undefined
    mockApi({
      onReplace: (body) => {
        replaced = body as typeof replaced
        return Promise.resolve(jsonResponse(savedSegment()))
      },
    })
    await openSavedSegment()

    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.type(screen.getByLabelText('Shot 3.3 distance (m)'), '4')
    await user.type(screen.getByLabelText('Shot 3.3 azimuth (°)'), '180')
    await user.type(screen.getByLabelText('Station 3.3 depth (m)'), '9')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(replaced?.stations.at(-1)).toEqual({
      id: null,
      depth: 9,
      note: '',
    })
    expect(replaced?.shots.at(-1)).toEqual({
      id: null,
      distance: 4,
      azimuth: 180,
      note: '',
    })
  })

  it('places the messages from a rejected save beside their fields, and keeps what was typed', async () => {
    const user = userEvent.setup()
    mockApi({
      onReplace: () =>
        rejected({ 'shots[1].azimuth': ['Azimuth must be from 0 to 360.'] }),
    })
    await openSavedSegment()

    await user.clear(screen.getByLabelText('Shot 3.2 azimuth (°)'))
    await user.type(screen.getByLabelText('Shot 3.2 azimuth (°)'), '400')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This segment couldn't be saved. 1 field needs fixing.",
    )
    const azimuth = screen.getByLabelText('Shot 3.2 azimuth (°)')
    expect(azimuth).toBeInvalid()
    expect(azimuth).toHaveAccessibleDescription(
      'Azimuth must be from 0 to 360.',
    )
    expect(azimuth).toHaveValue('400')
    expect(screen.getByLabelText('Name')).toHaveValue('Side passage')
    expect(trackException).not.toHaveBeenCalled()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it("shows the can't reach message when the API is unreachable on save, and keeps what was typed", async () => {
    const user = userEvent.setup()
    mockApi({ onReplace: unreachable })
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.2 note'), 'Sump')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
    expect(screen.getByLabelText('Station 3.2 note')).toHaveValue('Sump')
    expect(trackException).toHaveBeenCalledTimes(1)
  })

  it("shows the not found page when the segment doesn't exist", async () => {
    mockApi()

    renderAt('/projects/7/segments/99')

    expect(
      await screen.findByText(
        "That segment doesn't exist. It may have been deleted.",
      ),
    ).toBeInTheDocument()
  })

  it("shows the not found page when the project doesn't exist", async () => {
    mockFetch(() => Promise.resolve(new Response(null, { status: 404 })))

    renderAt('/projects/8/segments/12')

    expect(
      await screen.findByRole('heading', { name: 'Page not found' }),
    ).toBeInTheDocument()
  })

  it.each([
    ['abc', '12'],
    ['0', '12'],
    ['7', 'abc'],
    ['7', '0'],
    ['7', '1.5'],
    ['7', '-3'],
  ])(
    'shows the not found page for project %j and segment %j without calling the API',
    (projectId, segmentId) => {
      mockFetch(() => Promise.resolve(jsonResponse({})))

      renderAt(`/projects/${projectId}/segments/${segmentId}`)

      expect(
        screen.getByRole('heading', { name: 'Page not found' }),
      ).toBeInTheDocument()
      expect(fetch).not.toHaveBeenCalled()
    },
  )

  it('shows a message when the API is unreachable', async () => {
    mockFetch(unreachable)

    renderAt('/projects/7/segments/12')

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
    expect(trackException).toHaveBeenCalledTimes(1)
  })
})

describe('typing a slate from the keyboard', () => {
  function field(name: string) {
    return screen.getByLabelText(name)
  }

  // Puts the cursor in a field without the mouse, as Tab from the field before it would.
  function focus(name: string) {
    act(() => field(name).focus())
  }

  // Opens a new segment with three stations, its fields in slate order.
  async function openThreeStations(user: ReturnType<typeof userEvent.setup>) {
    await openNewSegment()
    focus('Station 4.1 depth (m)')
    await user.keyboard('{Enter}')
  }

  it('tabs from the segment note through the readings in slate order, skipping the notes', async () => {
    const user = userEvent.setup()
    mockApi()
    await openThreeStations(user)
    focus('Segment note')

    const order = [
      'Station 4.0 depth (m)',
      'Shot 4.1 distance (m)',
      'Shot 4.1 azimuth (°)',
      'Station 4.1 depth (m)',
      'Shot 4.2 distance (m)',
      'Shot 4.2 azimuth (°)',
      'Station 4.2 depth (m)',
    ]
    for (const name of order) {
      await user.tab()
      expect(field(name)).toHaveFocus()
    }
    await user.tab()
    expect(
      screen.getByRole('button', { name: 'Add shot and station' }),
    ).toHaveFocus()
  })

  it('walks the same readings in reverse with Shift+Tab', async () => {
    const user = userEvent.setup()
    mockApi()
    await openThreeStations(user)
    focus('Station 4.2 depth (m)')

    const order = [
      'Shot 4.2 azimuth (°)',
      'Shot 4.2 distance (m)',
      'Station 4.1 depth (m)',
      'Shot 4.1 azimuth (°)',
      'Shot 4.1 distance (m)',
      'Station 4.0 depth (m)',
      'Segment note',
    ]
    for (const name of order) {
      await user.tab({ shift: true })
      expect(field(name)).toHaveFocus()
    }
  })

  it('moves to the next reading with Enter and selects what is in it', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Station 4.0 depth (m)')

    await user.keyboard('3{Enter}12.5{Enter}045{Enter}')
    expect(field('Station 4.1 depth (m)')).toHaveFocus()

    await user.tab({ shift: true })
    await user.tab({ shift: true })
    await user.keyboard('{Enter}')
    const azimuth = field('Shot 4.1 azimuth (°)') as HTMLInputElement
    expect(azimuth).toHaveFocus()
    expect(azimuth.selectionStart).toBe(0)
    expect(azimuth.selectionEnd).toBe(3)
    await user.keyboard('90')
    expect(azimuth).toHaveValue('90')
  })

  it("adds a shot and station with Enter in the last station's depth, and moves to the new shot's distance", async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Station 4.1 depth (m)')

    await user.keyboard('7{Enter}')

    expect(field('Shot 4.2 distance (m)')).toHaveFocus()
    expect(field('Station 4.2 depth (m)')).toBeInTheDocument()
    expect(field('Station 4.1 depth (m)')).toHaveValue('7')
  })

  it('never saves the segment with Enter in a reading or a note', async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn(() => Promise.resolve(jsonResponse({}, 201)))
    mockApi({ onCreate })
    await openNewSegment()
    focus('Station 4.0 depth (m)')

    await user.keyboard('3{Enter}12.5{Enter}045{Enter}7{Enter}')
    focus('Station 4.0 note')
    await user.keyboard('Line arrow{Enter}')
    focus('Shot 4.1 note')
    await user.keyboard('Restriction{Enter}')

    expect(onCreate).not.toHaveBeenCalled()
    expect(field('Segment note')).toBeInTheDocument()
  })

  it("moves from a station's depth to its note with Alt+N, without typing an n", async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Station 4.0 depth (m)')

    await user.keyboard('3{Alt>}n{/Alt}Line arrow')

    expect(field('Station 4.0 note')).toHaveFocus()
    expect(field('Station 4.0 note')).toHaveValue('Line arrow')
    expect(field('Station 4.0 depth (m)')).toHaveValue('3')
  })

  it.each(['Shot 4.1 distance (m)', 'Shot 4.1 azimuth (°)'])(
    "moves from %s to the shot's note with Alt+N",
    async (name) => {
      const user = userEvent.setup()
      mockApi()
      await openNewSegment()
      focus(name)

      await user.keyboard('5{Alt>}n{/Alt}')

      expect(field('Shot 4.1 note')).toHaveFocus()
      expect(field('Shot 4.1 note')).toHaveValue('')
      expect(field(name)).toHaveValue('5')
    },
  )

  it("moves from a station's note to the next shot's distance with Enter", async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Station 4.0 depth (m)')

    await user.keyboard('3{Alt>}n{/Alt}Line arrow{Enter}')

    expect(field('Shot 4.1 distance (m)')).toHaveFocus()
    expect(field('Station 4.0 note')).toHaveValue('Line arrow')
  })

  it("moves from a shot's note to the next station's depth with Enter", async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Shot 4.1 azimuth (°)')

    await user.keyboard('045{Alt>}n{/Alt}Restriction{Enter}')

    expect(field('Station 4.1 depth (m)')).toHaveFocus()
    expect(field('Shot 4.1 note')).toHaveValue('Restriction')
  })

  it("adds a shot and station with Enter in the last station's note, and moves to the new shot's distance", async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()
    focus('Station 4.1 depth (m)')

    await user.keyboard('7{Alt>}n{/Alt}Jump left{Enter}')

    expect(field('Shot 4.2 distance (m)')).toHaveFocus()
    expect(field('Station 4.1 note')).toHaveValue('Jump left')
  })

  it('still lets a note be reached and edited with the mouse', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()

    await user.click(field('Shot 4.1 note'))
    await user.keyboard('Restriction')

    expect(field('Shot 4.1 note')).toHaveFocus()
    expect(field('Shot 4.1 note')).toHaveValue('Restriction')
  })
})
