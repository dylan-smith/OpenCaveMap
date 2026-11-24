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
  mockApi,
  rejected,
  savedSegment,
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

  it('deletes the segment straight away and returns to the project page, where it is no longer listed', async () => {
    const user = userEvent.setup()
    const segments = [...savedSegments]
    let deletedAt = ''
    mockApi({
      segments,
      onDelete: (url) => {
        deletedAt = url
        segments.splice(0, 1)
        return Promise.resolve(new Response(null, { status: 204 }))
      },
    })
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Delete segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(deletedAt).toMatch(/\/api\/projects\/7\/segments\/12$/)
    expect(trackEvent).toHaveBeenCalledWith('SegmentDeleted')
    const items = within(
      await screen.findByRole('list', { name: 'Segments' }),
    ).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Segment 1')
    expect(screen.queryByText(/Segment 3/)).not.toBeInTheDocument()
  })

  it('treats a segment that is already gone as deleted', async () => {
    const user = userEvent.setup()
    mockApi({
      onDelete: () => Promise.resolve(new Response(null, { status: 404 })),
    })
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Delete segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(trackEvent).toHaveBeenCalledWith('SegmentDeleted')
    expect(trackException).not.toHaveBeenCalled()
  })

  it.each([
    [
      'fails',
      () => Promise.resolve(new Response(null, { status: 500 })),
      'Unable to delete segment.',
    ],
    ['cannot reach the API', unreachable, unreachableMessage],
  ])(
    'shows a message and stays usable when deleting %s',
    async (_outcome, onDelete, message) => {
      const user = userEvent.setup()
      mockApi({ onDelete })
      await openSavedSegment()

      await user.type(screen.getByLabelText('Station 3.2 note'), 'Sump')
      await user.click(screen.getByRole('button', { name: 'Delete segment' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(message)
      expect(
        screen.getByRole('button', { name: 'Delete segment' }),
      ).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Save segment' })).toBeEnabled()
      expect(screen.getByLabelText('Station 3.2 note')).toHaveValue('Sump')
      expect(trackException).toHaveBeenCalledTimes(1)
      expect(trackEvent).not.toHaveBeenCalled()
    },
  )

  it('never deletes the segment with Enter in a field', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    )
    mockApi({ onDelete })
    await openSavedSegment()

    // Enter in the name saves the segment, so it goes last.
    for (const name of [
      'Station 3.0 depth (m)',
      'Shot 3.1 azimuth (°)',
      'Station 3.2 depth (m)',
      'Shot 3.2 note',
      'Name',
    ]) {
      act(() => screen.getByLabelText(name).focus())
      await user.keyboard('{Enter}')
    }

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(trackEvent).toHaveBeenCalledWith('SegmentUpdated')
    expect(onDelete).not.toHaveBeenCalled()
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
