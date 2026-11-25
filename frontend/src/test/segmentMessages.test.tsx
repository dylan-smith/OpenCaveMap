import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { trackEvent, trackException } from '../telemetry'
import { jsonResponse } from './mockFetch'
import {
  mockApi,
  openNewSegment,
  rejected,
  rejectedSegment,
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
})
