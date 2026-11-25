import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { trackEvent, trackException } from '../telemetry'
import { jsonResponse, unreachable, unreachableMessage } from './mockFetch'
import { renderAt } from './renderAt'
import {
  blankSegment,
  mockApi,
  openNewSegment,
  project,
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

describe('unit system', () => {
  // savedSegments as the API lists them once the project is imperial, with their lengths in feet, unrounded.
  const segmentsInFeet = [
    {
      ...savedSegments[0],
      totalLength: 50.86614173228346,
      unitSystem: 'imperial',
    },
    {
      ...savedSegments[1],
      totalLength: 98.42519685039369,
      unitSystem: 'imperial',
    },
  ]

  it('shows the project’s unit system on a Metric / Imperial toggle', async () => {
    mockApi()

    renderAt('/projects/7')

    const toggle = await screen.findByRole('group', { name: 'Unit system' })
    expect(
      within(toggle).getByRole('button', { name: 'Metric' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      within(toggle).getByRole('button', { name: 'Imperial' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('saves a new unit system straight away and reloads the list, with total lengths in it', async () => {
    const user = userEvent.setup()
    let updated: unknown
    const segments = [...savedSegments]
    mockApi({
      segments,
      onUpdateProject: (body) => {
        updated = body
        segments.splice(0, 2, ...segmentsInFeet)
        return Promise.resolve(jsonResponse({ ...project, ...body }))
      },
    })
    renderAt('/projects/7')
    const toggle = await screen.findByRole('group', { name: 'Unit system' })
    await screen.findByRole('list', { name: 'Segments' })

    await user.click(within(toggle).getByRole('button', { name: 'Imperial' }))

    expect(
      await within(toggle).findByRole('button', {
        name: 'Imperial',
        pressed: true,
      }),
    ).toBeInTheDocument()
    expect(updated).toEqual({ name: 'Crystal Cave', unitSystem: 'imperial' })
    const list = screen.getByRole('list', { name: 'Segments' })
    const items = await within(list).findAllByText(/stations · .* ft$/)
    expect(items.map((item) => item.textContent)).toEqual([
      '2026-11-21 · 4 stations · 50.9 ft',
      '2026-03-02 · 2 stations · 98.4 ft',
    ])
    expect(trackEvent).toHaveBeenCalledWith('ProjectUnitSystemChanged', {
      unitSystem: 'imperial',
    })
  })

  it('keeps the rename field as typed when the unit system changes', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/projects/7')
    const toggle = await screen.findByRole('group', { name: 'Unit system' })
    await user.clear(screen.getByLabelText(/Project name/))
    await user.type(screen.getByLabelText(/Project name/), 'Not saved yet')

    await user.click(within(toggle).getByRole('button', { name: 'Imperial' }))

    await within(toggle).findByRole('button', {
      name: 'Imperial',
      pressed: true,
    })
    expect(screen.getByLabelText(/Project name/)).toHaveValue('Not saved yet')
    expect(
      screen.getByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
  })

  it('says when the unit system could not be saved, and keeps the one the project has', async () => {
    const user = userEvent.setup()
    mockApi({
      onUpdateProject: () =>
        Promise.resolve(new Response(null, { status: 500 })),
    })
    renderAt('/projects/7')
    const toggle = await screen.findByRole('group', { name: 'Unit system' })

    await user.click(within(toggle).getByRole('button', { name: 'Imperial' }))

    expect(
      await screen.findByText('Unable to change the unit system.'),
    ).toBeInTheDocument()
    expect(
      within(toggle).getByRole('button', { name: 'Metric' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(trackException).toHaveBeenCalledTimes(1)
  })

  it("shows the can't reach message when the API is unreachable on changing it", async () => {
    const user = userEvent.setup()
    mockApi({ onUpdateProject: unreachable })
    renderAt('/projects/7')
    const toggle = await screen.findByRole('group', { name: 'Unit system' })

    await user.click(within(toggle).getByRole('button', { name: 'Imperial' }))

    expect(await screen.findByText(unreachableMessage)).toBeInTheDocument()
  })

  it('does nothing when the current unit system is chosen again', async () => {
    const user = userEvent.setup()
    mockApi()
    renderAt('/projects/7')
    const toggle = await screen.findByRole('group', { name: 'Unit system' })

    await user.click(within(toggle).getByRole('button', { name: 'Metric' }))

    expect(
      within(toggle).getByRole('button', { name: 'Metric' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(fetch).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/projects\/7$/),
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('shows feet on the depth and distance fields of a segment in imperial, and not on azimuths', async () => {
    mockApi({ blank: blankSegment('2026-11-21', 'imperial') })

    await openNewSegment()

    expect(screen.getAllByLabelText('Depth (ft)')).toHaveLength(2)
    expect(screen.getByLabelText('Distance (ft)')).toBeInTheDocument()
    expect(screen.getByLabelText('Azimuth (°)')).toBeInTheDocument()
    expect(screen.queryByLabelText(/\(m\)/)).not.toBeInTheDocument()
    for (const name of [
      'Station 4.0 depth (ft)',
      'Shot 4.1 distance (ft)',
      'Shot 4.1 azimuth (°)',
      'Station 4.1 depth (ft)',
    ]) {
      expect(screen.getByRole('textbox', { name })).toBeInTheDocument()
    }
  })

  it('shows metres on the depth and distance fields of a segment in metric', async () => {
    mockApi()

    await openNewSegment()

    expect(screen.getAllByLabelText('Depth (m)')).toHaveLength(2)
    expect(screen.getByLabelText('Distance (m)')).toBeInTheDocument()
    expect(screen.queryByLabelText(/\(ft\)/)).not.toBeInTheDocument()
  })

  it('sends the unit system the segment came in with, as typed, without converting', async () => {
    const user = userEvent.setup()
    let created: { unitSystem?: unknown; shots?: unknown } | undefined
    mockApi({
      blank: blankSegment('2026-11-21', 'imperial'),
      onCreate: (body) => {
        created = body as typeof created
        return Promise.resolve(jsonResponse({}, 201))
      },
    })
    await openNewSegment()

    await user.type(screen.getByLabelText('Station 4.0 depth (ft)'), '10')
    await user.type(screen.getByLabelText('Shot 4.1 distance (ft)'), '30')
    await user.type(screen.getByLabelText('Shot 4.1 azimuth (°)'), '90')
    await user.type(screen.getByLabelText('Station 4.1 depth (ft)'), '20')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(created?.unitSystem).toBe('imperial')
    expect(created?.shots).toEqual([
      { id: null, distance: 30, azimuth: 90, note: '' },
    ])
  })

  it('sends a reopened segment back in the unit system it was shown in, even if the project has changed since', async () => {
    const user = userEvent.setup()
    let replaced: { unitSystem?: unknown } | undefined
    mockApi({
      saved: savedSegment('imperial'),
      onReplace: (body) => {
        replaced = body as typeof replaced
        return Promise.resolve(jsonResponse(savedSegment()))
      },
    })
    renderAt('/projects/7/segments/12')
    await screen.findByRole('heading', { name: 'Segment 3' })

    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(replaced?.unitSystem).toBe('imperial')
  })
})
