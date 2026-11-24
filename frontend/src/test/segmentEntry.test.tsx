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
import {
  blankSegment,
  mockApi,
  openNewSegment,
  rejected,
  savedSegments,
} from './segmentFixtures'

vi.mock('../telemetry', () => ({
  trackEvent: vi.fn(),
  trackException: vi.fn(),
  trackPageView: vi.fn(),
}))

beforeEach(() => {
  setSession({ token: 'test:Tester', name: 'Tester', provider: 'test' })
})

afterEach(() => {
  act(() => setSession(null))
  vi.restoreAllMocks()
  vi.clearAllMocks()
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

  it('has no delete action for a segment that is not saved yet', async () => {
    mockApi()

    await openNewSegment()

    expect(
      screen.queryByRole('button', { name: /Delete/ }),
    ).not.toBeInTheDocument()
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
