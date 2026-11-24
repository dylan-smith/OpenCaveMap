import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { jsonResponse } from './mockFetch'
import { mockApi, openNewSegment } from './segmentFixtures'

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
