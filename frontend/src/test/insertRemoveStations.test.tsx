import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { jsonResponse } from './mockFetch'
import { renderAt } from './renderAt'
import {
  mockApi,
  openNewSegment,
  rejected,
  savedSegment,
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

describe('inserting and removing stations', () => {
  async function openSavedSegment() {
    renderAt('/projects/7/segments/12')
    return screen.findByRole('heading', { name: 'Segment 3' })
  }

  function labels() {
    return screen
      .getAllByText(/^(Station|Shot) \d+\.\d+$/)
      .map((label) => label.textContent)
  }

  const flagMessage =
    'Check this shot: it now joins different stations, so its distance and azimuth need checking.'

  // The shots marked for checking, by label. Each has a button to confirm it.
  function flaggedShots() {
    return screen
      .queryAllByRole('button', { name: / distance and azimuth are right$/ })
      .map((button) =>
        button.getAttribute('aria-label')?.replace(/ distance.*/, ''),
      )
  }

  it('inserts a blank station and the blank shot arriving at it below a station, and moves to the new shot’s distance', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(
      screen.getByRole('button', {
        name: 'Insert station after Station 3.1',
      }),
    )

    expect(labels()).toEqual([
      'Station 3.0',
      'Shot 3.1',
      'Station 3.1',
      'Shot 3.2',
      'Station 3.2',
      'Shot 3.3',
      'Station 3.3',
    ])
    expect(screen.getByLabelText('Shot 3.2 distance (m)')).toHaveFocus()
    const values = [
      ['Station 3.0 depth (m)', '3'],
      ['Station 3.0 note', 'Line arrow'],
      ['Shot 3.1 distance (m)', '30'],
      ['Station 3.1 depth (m)', '12.35'],
      ['Shot 3.2 distance (m)', ''],
      ['Shot 3.2 azimuth (°)', ''],
      ['Shot 3.2 note', ''],
      ['Station 3.2 depth (m)', ''],
      ['Station 3.2 note', ''],
      ['Shot 3.3 distance (m)', '8.13'],
      ['Shot 3.3 azimuth (°)', '359.5'],
      ['Shot 3.3 note', 'Restriction'],
      ['Station 3.3 depth (m)', '7'],
    ]
    for (const [name, value] of values) {
      expect(screen.getByLabelText(name)).toHaveValue(value)
    }
  })

  it('flags the shot that now leaves the inserted station, and says its distance and azimuth need checking', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(
      screen.getByRole('button', {
        name: 'Insert station after Station 3.0',
      }),
    )

    for (const name of ['Shot 3.2 distance (m)', 'Shot 3.2 azimuth (°)']) {
      expect(screen.getByLabelText(name)).toHaveAccessibleDescription(
        flagMessage,
      )
    }
    expect(flaggedShots()).toEqual(['Shot 3.2'])
  })

  it('flags nothing when inserting after the last station', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(
      screen.getByRole('button', {
        name: 'Insert station after Station 3.2',
      }),
    )

    expect(labels()).toEqual([
      'Station 3.0',
      'Shot 3.1',
      'Station 3.1',
      'Shot 3.2',
      'Station 3.2',
      'Shot 3.3',
      'Station 3.3',
    ])
    expect(screen.getByLabelText('Shot 3.3 distance (m)')).toHaveFocus()
    expect(screen.getByLabelText('Station 3.2 depth (m)')).toHaveValue('7')
    expect(flaggedShots()).toEqual([])
  })

  it('removes a station in the middle and the shot arriving at it, and flags the shot that left it', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.1' }))

    expect(labels()).toEqual(['Station 3.0', 'Shot 3.1', 'Station 3.1'])
    const values = [
      ['Station 3.0 depth (m)', '3'],
      ['Station 3.0 note', 'Line arrow'],
      ['Shot 3.1 distance (m)', '8.13'],
      ['Shot 3.1 azimuth (°)', '359.5'],
      ['Shot 3.1 note', 'Restriction'],
      ['Station 3.1 depth (m)', '7'],
    ]
    for (const [name, value] of values) {
      expect(screen.getByLabelText(name)).toHaveValue(value)
    }
    expect(flaggedShots()).toEqual(['Shot 3.1'])
    expect(
      screen.getByLabelText('Shot 3.1 azimuth (°)'),
    ).toHaveAccessibleDescription(flagMessage)
    expect(screen.getByLabelText('Station 3.0 depth (m)')).toHaveFocus()
  })

  it('removes the last station and the shot arriving at it, and flags nothing', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.2' }))

    expect(labels()).toEqual(['Station 3.0', 'Shot 3.1', 'Station 3.1'])
    expect(screen.getByLabelText('Shot 3.1 distance (m)')).toHaveValue('30')
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.35')
    expect(flaggedShots()).toEqual([])
  })

  it('removes the first station and the shot leaving it, and flags nothing', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.0' }))

    expect(labels()).toEqual(['Station 3.0', 'Shot 3.1', 'Station 3.1'])
    const values = [
      ['Station 3.0 depth (m)', '12.35'],
      ['Station 3.0 note', ''],
      ['Shot 3.1 distance (m)', '8.13'],
      ['Shot 3.1 note', 'Restriction'],
      ['Station 3.1 depth (m)', '7'],
    ]
    for (const [name, value] of values) {
      expect(screen.getByLabelText(name)).toHaveValue(value)
    }
    expect(flaggedShots()).toEqual([])
    expect(screen.getByLabelText('Station 3.0 depth (m)')).toHaveFocus()
  })

  it('makes removal unavailable when only two stations remain', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.2' }))

    for (const name of ['Remove Station 3.0', 'Remove Station 3.1']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(
      screen.getByRole('button', { name: 'Insert station after Station 3.1' }),
    ).toBeEnabled()
  })

  it('renumbers the labels at once after several inserts and removals', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegment()

    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 4.0' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 4.0' }),
    )
    await user.click(screen.getByRole('button', { name: 'Remove Station 4.2' }))

    expect(labels()).toEqual([
      'Station 4.0',
      'Shot 4.1',
      'Station 4.1',
      'Shot 4.2',
      'Station 4.2',
    ])
  })

  it.each([
    ['editing its distance', 'Shot 3.2 distance (m)'],
    ['editing its azimuth', 'Shot 3.2 azimuth (°)'],
  ])('clears the flag on %s', async (_action, name) => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )

    await user.type(screen.getByLabelText(name), '1')

    expect(flaggedShots()).toEqual([])
    expect(screen.getByLabelText(name)).not.toHaveAccessibleDescription()
  })

  it('keeps the flag when only the note of the flagged shot is edited', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )

    await user.type(screen.getByLabelText('Shot 3.2 note'), 'Low')

    expect(flaggedShots()).toEqual(['Shot 3.2'])
  })

  it('clears the flag when the surveyor confirms the values are right, keeping them', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )

    await user.click(
      screen.getByRole('button', {
        name: 'Shot 3.2 distance and azimuth are right',
      }),
    )

    expect(flaggedShots()).toEqual([])
    expect(screen.getByLabelText('Shot 3.2 distance (m)')).toHaveValue('30')
    expect(screen.getByLabelText('Shot 3.2 azimuth (°)')).toHaveValue('45')
  })

  it('refuses to save while any shot is flagged, saying how many to check, and saves once they are dealt with', async () => {
    const user = userEvent.setup()
    const onReplace = vi.fn(() => Promise.resolve(jsonResponse(savedSegment())))
    mockApi({ onReplace })
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.2' }),
    )
    expect(flaggedShots()).toEqual(['Shot 3.2', 'Shot 3.4'])

    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      "This segment can't be saved until its flagged shots are checked. 2 shots need checking.",
    )
    expect(onReplace).not.toHaveBeenCalled()

    await user.click(
      screen.getByRole('button', {
        name: 'Shot 3.2 distance and azimuth are right',
      }),
    )
    expect(screen.getByRole('alert')).toHaveTextContent(
      '1 shot needs checking.',
    )
    await user.type(screen.getByLabelText('Shot 3.4 azimuth (°)'), '0')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(onReplace).toHaveBeenCalledTimes(1)
  })

  it('sends surviving stations and shots with their ids and new ones without, with notes on the right rows', async () => {
    const user = userEvent.setup()
    let replaced: unknown
    mockApi({
      onReplace: (body) => {
        replaced = body
        return Promise.resolve(jsonResponse(savedSegment()))
      },
    })
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.0' }))
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )
    await user.type(screen.getByLabelText('Shot 3.1 distance (m)'), '2')
    await user.type(screen.getByLabelText('Shot 3.1 azimuth (°)'), '90')
    await user.type(screen.getByLabelText('Shot 3.1 note'), 'New')
    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '10')
    await user.click(
      screen.getByRole('button', {
        name: 'Shot 3.2 distance and azimuth are right',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    await screen.findByRole('heading', { name: 'Crystal Cave' })
    expect(replaced).toEqual({
      surveyDate: '2026-11-21',
      name: 'Side passage',
      note: 'Silty',
      unitSystem: 'metric',
      stations: [
        { id: 102, depth: 12.345, note: '' },
        { id: null, depth: 10, note: '' },
        { id: 103, depth: 7, note: '' },
      ],
      shots: [
        { id: null, distance: 2, azimuth: 90, note: 'New' },
        { id: 202, distance: 8.125, azimuth: 359.5, note: 'Restriction' },
      ],
    })
  })

  it('shows no flags when the segment is reopened after saving', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )
    await user.click(
      screen.getByRole('button', {
        name: 'Shot 3.2 distance and azimuth are right',
      }),
    )
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    const list = await screen.findByRole('list', { name: 'Segments' })

    await user.click(within(list).getByRole('link', { name: /Segment 3/ }))

    await screen.findByRole('heading', { name: 'Segment 3' })
    expect(flaggedShots()).toEqual([])
  })

  it('keeps the insert and remove controls out of the Tab order, which passes a flagged shot’s confirm button', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )
    act(() => screen.getByLabelText('Segment note').focus())

    const order = [
      'Station 3.0 depth (m)',
      'Shot 3.1 distance (m)',
      'Shot 3.1 azimuth (°)',
      'Station 3.1 depth (m)',
      'Shot 3.2 distance (m)',
      'Shot 3.2 azimuth (°)',
      'Shot 3.2 distance and azimuth are right',
      'Station 3.2 depth (m)',
      'Shot 3.3 distance (m)',
      'Shot 3.3 azimuth (°)',
      'Station 3.3 depth (m)',
      'Add shot and station',
    ]
    for (const name of order) {
      await user.tab()
      expect(
        screen.queryByRole('textbox', { name }) ??
          screen.getByRole('button', { name }),
      ).toHaveFocus()
    }
  })

  it('drops the messages of a removed row from the fields and the summary, and keeps the others on their rows', async () => {
    const user = userEvent.setup()
    mockApi({
      onReplace: () =>
        rejected({
          'stations[1].depth': ['Depth must be zero or more.'],
          'shots[0].distance': ['Distance must be more than zero.'],
          'stations[2].depth': ['Depth is required.'],
        }),
    })
    await openSavedSegment()
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('3 fields need fixing.')

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.1' }))

    expect(summary).toHaveTextContent('1 field needs fixing.')
    expect(
      screen.getByLabelText('Station 3.1 depth (m)'),
    ).toHaveAccessibleDescription('Depth is required.')
    expect(screen.getByLabelText('Station 3.0 depth (m)')).toBeValid()
    expect(screen.getByLabelText('Shot 3.1 distance (m)')).toBeValid()

    await user.click(
      screen.getByRole('button', { name: 'Insert station after Station 3.0' }),
    )

    expect(summary).toHaveTextContent('1 field needs fixing.')
    expect(
      screen.getByLabelText('Station 3.2 depth (m)'),
    ).toHaveAccessibleDescription('Depth is required.')
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toBeValid()
  })

  it('describes a flagged shot’s field by both its validation message and the flag', async () => {
    const user = userEvent.setup()
    mockApi({
      onReplace: () =>
        rejected({ 'shots[1].azimuth': ['Azimuth must be from 0 to 360.'] }),
    })
    await openSavedSegment()
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: 'Remove Station 3.1' }))

    const azimuth = screen.getByLabelText('Shot 3.1 azimuth (°)')
    expect(azimuth).toBeInvalid()
    expect(azimuth).toHaveAccessibleDescription(
      `Azimuth must be from 0 to 360. ${flagMessage}`,
    )
  })
})
