import {
  act,
  screen,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import { unreachable } from './mockFetch'
import { renderAt } from './renderAt'
import { mockApi, rejected, wouldPrompt } from './segmentFixtures'

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

describe('leaving with unsaved entries', () => {
  const leaveDialog = { name: 'Leave without saving?' }

  // Each returns the router, so a test can read the address or go back.
  async function openSavedSegment() {
    const { router } = renderAt('/projects/7/segments/12')
    await screen.findByRole('heading', { name: 'Segment 3' })
    return router
  }

  // Opens the new segment from the project page, so there is a page to go back to.
  async function openNewSegmentFromProject() {
    const user = userEvent.setup()
    const { router } = renderAt('/projects/7')
    await user.click(await screen.findByRole('link', { name: 'Add segment' }))
    await screen.findByRole('heading', { name: 'Segment 4' })
    return router
  }

  async function backToProject() {
    await userEvent.click(
      screen.getByRole('link', { name: '← Back to project' }),
    )
  }

  async function answer(button: 'Stay' | 'Leave') {
    await userEvent.click(
      within(screen.getByRole('dialog', leaveDialog)).getByRole('button', {
        name: button,
      }),
    )
  }

  it.each([
    ['a new segment', '/projects/7/segments/new', 'Segment 4'],
    ['a saved segment', '/projects/7/segments/12', 'Segment 3'],
  ])(
    'leaves %s without asking when nothing has changed',
    async (_segment, path, heading) => {
      mockApi()
      renderAt(path)
      await screen.findByRole('heading', { name: heading })

      await backToProject()

      expect(
        await screen.findByRole('heading', { name: 'Crystal Cave' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    },
  )

  it.each([
    ['a reading', 'Station 3.1 depth (m)', '5'],
    ['a station note', 'Station 3.1 note', 'Jump left'],
    ['a shot note', 'Shot 3.1 note', 'Silt'],
    ['the name', 'Name', ' upstream'],
    ['the segment note', 'Segment note', ' and cold'],
  ])('asks before leaving after changing %s', async (_field, label, text) => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.type(screen.getByLabelText(label), text)
    await backToProject()

    expect(screen.getByRole('dialog', leaveDialog)).toBeInTheDocument()
  })

  it('asks before leaving after changing the survey date', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    const surveyDate = screen.getByLabelText(/Survey date/)
    await user.clear(surveyDate)
    await user.type(surveyDate, '2026-11-22')
    await backToProject()

    expect(screen.getByRole('dialog', leaveDialog)).toBeInTheDocument()
  })

  it.each([
    ['adding a shot and station', 'Add shot and station'],
    ['inserting a station', 'Insert station after Station 3.0'],
    ['removing a station', 'Remove Station 3.2'],
  ])('asks before leaving after %s', async (_change, button) => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.click(screen.getByRole('button', { name: button }))
    await backToProject()

    expect(screen.getByRole('dialog', leaveDialog)).toBeInTheDocument()
  })

  it('leaves without asking when a change is undone by hand', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()
    const depth = screen.getByLabelText('Station 3.1 depth (m)')

    await user.type(depth, '5')
    await user.type(depth, '{Backspace}')
    await backToProject()

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks before following the logo link', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(screen.getByRole('link', { name: 'OpenCaveMap' }))

    expect(screen.getByRole('dialog', leaveDialog)).toBeInTheDocument()
  })

  it('stays at the same address with every entry intact on Stay', async () => {
    const user = userEvent.setup()
    mockApi()
    const router = await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.type(screen.getByLabelText('Shot 3.3 note'), 'Sump')
    await backToProject()
    await answer('Stay')

    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(router.state.location.pathname).toBe('/projects/7/segments/12')
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.355')
    expect(screen.getByLabelText('Shot 3.3 note')).toHaveValue('Sump')
    expect(screen.getByLabelText('Station 3.0 note')).toHaveValue('Line arrow')
  })

  it('leaves and discards the entries on Leave', async () => {
    const user = userEvent.setup()
    mockApi()
    await openNewSegmentFromProject()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    await backToProject()
    await answer('Leave')
    await user.click(await screen.findByRole('link', { name: 'Add segment' }))
    await screen.findByRole('heading', { name: 'Segment 4' })

    expect(screen.getByLabelText('Station 4.0 depth (m)')).toHaveValue('')
    expect(fetch).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('asks before going back in the browser, and stays at the same address on Stay', async () => {
    const user = userEvent.setup()
    mockApi()
    const router = await openNewSegmentFromProject()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    // Reaching for the browser's back button takes focus off the field.
    await user.click(document.body)
    await act(() => router.navigate(-1))
    await screen.findByRole('dialog', leaveDialog)
    await answer('Stay')

    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(router.state.location.pathname).toBe('/projects/7/segments/new')
    expect(screen.getByLabelText('Station 4.0 depth (m)')).toHaveValue('3')
  })

  it('goes back in the browser on Leave', async () => {
    const user = userEvent.setup()
    mockApi()
    const router = await openNewSegmentFromProject()

    await user.type(screen.getByLabelText('Station 4.0 depth (m)'), '3')
    // Reaching for the browser's back button takes focus off the field.
    await user.click(document.body)
    await act(() => router.navigate(-1))
    await screen.findByRole('dialog', leaveDialog)
    await answer('Leave')

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/projects/7')
  })

  it('can be answered from the keyboard, starting on Stay, and Escape stays', async () => {
    const user = userEvent.setup()
    mockApi()
    const router = await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await backToProject()
    const dialog = screen.getByRole('dialog', leaveDialog)

    expect(dialog).toHaveAccessibleDescription(
      "Your entries in this segment haven't been saved. If you leave, they'll be lost.",
    )
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus()
    await user.keyboard('{Escape}')

    await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
    expect(router.state.location.pathname).toBe('/projects/7/segments/12')
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.355')
  })

  it('returns to the project page without asking after a successful save', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([
    ['is rejected', () => rejected()],
    ['cannot reach the API', unreachable],
  ])(
    'still asks before leaving when the save %s',
    async (_outcome, onReplace) => {
      const user = userEvent.setup()
      mockApi({ onReplace })
      await openSavedSegment()

      await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
      await user.click(screen.getByRole('button', { name: 'Save segment' }))
      await screen.findByRole('alert')
      await backToProject()

      expect(screen.getByRole('dialog', leaveDialog)).toBeInTheDocument()
    },
  )

  it('returns to the project page without asking after deleting a changed segment', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(screen.getByRole('button', { name: 'Delete segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  describe('closing or reloading the tab', () => {
    it('closes without a prompt when nothing has changed', async () => {
      mockApi()
      await openSavedSegment()

      expect(wouldPrompt()).toBe(false)
    })

    it('has the browser prompt once an entry has changed, and not once it is changed back', async () => {
      const user = userEvent.setup()
      mockApi()
      await openSavedSegment()
      const depth = screen.getByLabelText('Station 3.1 depth (m)')

      await user.type(depth, '5')
      expect(wouldPrompt()).toBe(true)

      await user.type(depth, '{Backspace}')
      expect(wouldPrompt()).toBe(false)
    })

    it('closes without a prompt after a successful save', async () => {
      const user = userEvent.setup()
      mockApi()
      await openSavedSegment()

      await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
      await user.click(screen.getByRole('button', { name: 'Save segment' }))
      await screen.findByRole('heading', { name: 'Crystal Cave' })

      expect(wouldPrompt()).toBe(false)
    })
  })
})
