import {
  act,
  screen,
  waitForElementToBeRemoved,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSession, sessionStorageKey, setSession } from '../auth/session'
import { jsonResponse, mockFetch } from './mockFetch'
import { renderAt } from './renderAt'
import { mockApi, savedSegment, wouldPrompt } from './segmentFixtures'

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

describe('losing the sign-in with unsaved entries', () => {
  const signedOutMessage =
    'You were signed out before the segment could be saved. Save it again.'

  // What the API sends once the user's sign-in has expired.
  function expired() {
    return Promise.resolve(new Response(null, { status: 401 }))
  }

  async function openSavedSegment() {
    const { router } = renderAt('/projects/7/segments/12')
    await screen.findByRole('heading', { name: 'Segment 3' })
    return router
  }

  // Signs in through the sign-in page's test sign-in form.
  async function signInAs(name: string) {
    const user = userEvent.setup()
    const field = await screen.findByRole('textbox', { name: 'Name' })
    await user.clear(field)
    await user.type(field, name)
    await user.click(
      screen.getByRole('button', { name: 'Sign in as test user' }),
    )
  }

  it('brings the entries back, with a message, when the same user signs in again after a save is refused', async () => {
    const user = userEvent.setup()
    // The first save gets a 401, as if the sign-in had expired, and the second succeeds.
    const replace = vi
      .fn<(body: unknown) => Promise<Response>>(() =>
        Promise.resolve(jsonResponse(savedSegment())),
      )
      .mockImplementationOnce(expired)
    mockApi({ onReplace: replace })
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(
      screen.getByRole('button', { name: 'Add shot and station' }),
    )
    await user.type(screen.getByLabelText('Shot 3.3 note'), 'Sump')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await screen.findByRole('heading', { level: 2, name: 'Sign in' })
    await signInAs('Tester')

    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(signedOutMessage)
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.355')
    expect(screen.getByLabelText('Shot 3.3 note')).toHaveValue('Sump')
    expect(screen.getByLabelText('Station 3.0 note')).toHaveValue('Line arrow')

    await user.click(screen.getByRole('button', { name: 'Save segment' }))

    expect(
      await screen.findByRole('heading', { name: 'Crystal Cave' }),
    ).toBeInTheDocument()
    expect(replace).toHaveBeenCalledTimes(2)
    expect(replace.mock.lastCall?.[0]).toMatchObject({
      stations: expect.arrayContaining([
        expect.objectContaining({ depth: 12.355 }),
      ]) as unknown,
    })
  })

  it('hides the entries from sight, the keyboard and screen readers while the sign-in page shows, and the browser still prompts on closing the tab', async () => {
    const user = userEvent.setup()
    mockApi({ onReplace: expired })
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await screen.findByRole('heading', { level: 2, name: 'Sign in' })

    expect(screen.getByLabelText('Station 3.1 depth (m)')).not.toBeVisible()
    expect(
      screen.queryByRole('heading', { name: 'Segment 3' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: 'Station 3.1 depth (m)' }),
    ).not.toBeInTheDocument()
    expect(wouldPrompt()).toBe(true)
  })

  it('gives a different user who signs in a fresh page, without the entries', async () => {
    const user = userEvent.setup()
    mockApi({ onReplace: expired })
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    await user.type(screen.getByLabelText('Shot 3.1 note'), 'Silt')
    await user.click(screen.getByRole('button', { name: 'Save segment' }))
    await signInAs('Someone else')

    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.35')
    expect(screen.getByLabelText('Shot 3.1 note')).toHaveValue('')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(
      new Headers(vi.mocked(fetch).mock.lastCall?.[1]?.headers).get(
        'Authorization',
      ),
    ).toBe('Bearer test:Someone else')
  })

  it('keeps the entries when the user signs out in another tab, and brings them back when they sign in again', async () => {
    const user = userEvent.setup()
    mockApi()
    await openSavedSegment()

    await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
    act(() => {
      localStorage.removeItem(sessionStorageKey)
      window.dispatchEvent(
        new StorageEvent('storage', { key: sessionStorageKey }),
      )
    })
    await signInAs('Tester')

    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue('12.355')
  })

  it('drops a page without unsaved entries when the sign-in is lost, and loads it again after signing in', async () => {
    mockApi()
    await openSavedSegment()

    act(() => setSession(null))

    expect(
      screen.queryByLabelText('Station 3.1 depth (m)'),
    ).not.toBeInTheDocument()
    await signInAs('Tester')
    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(
      vi
        .mocked(fetch)
        .mock.calls.filter(
          ([url]) =>
            typeof url === 'string' &&
            url.endsWith('/api/projects/7/segments/12'),
        ),
    ).toHaveLength(2)
  })

  it('loads a page again, rather than showing its error, after its load is refused and the user signs in', async () => {
    let calls = 0
    mockFetch(async () => {
      calls += 1
      return calls === 1
        ? new Response(null, { status: 401 })
        : jsonResponse(savedSegment())
    })
    renderAt('/projects/7/segments/12')
    await signInAs('Tester')

    expect(
      await screen.findByRole('heading', { name: 'Segment 3' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  describe('signing out', () => {
    const leaveDialog = { name: 'Leave without saving?' }

    async function answer(button: 'Stay' | 'Leave') {
      await userEvent.click(
        within(screen.getByRole('dialog', leaveDialog)).getByRole('button', {
          name: button,
        }),
      )
    }

    it('asks first, and keeps the user signed in with the entries on Stay', async () => {
      const user = userEvent.setup()
      mockApi()
      await openSavedSegment()

      await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
      await answer('Stay')

      await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
      expect(getSession()).not.toBeNull()
      expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue(
        '12.355',
      )
    })

    it('signs out and discards the entries on Leave', async () => {
      const user = userEvent.setup()
      mockApi()
      await openSavedSegment()

      await user.type(screen.getByLabelText('Station 3.1 depth (m)'), '5')
      await user.click(screen.getByRole('button', { name: 'Sign out' }))
      await answer('Leave')

      await waitForElementToBeRemoved(() => screen.queryByRole('dialog'))
      expect(
        screen.getByRole('heading', { level: 2, name: 'Sign in' }),
      ).toBeInTheDocument()
      expect(getSession()).toBeNull()
      expect(
        screen.queryByLabelText('Station 3.1 depth (m)'),
      ).not.toBeInTheDocument()
      await signInAs('Tester')
      expect(
        await screen.findByRole('heading', { name: 'Segment 3' }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Station 3.1 depth (m)')).toHaveValue(
        '12.35',
      )
    })

    it('signs out without asking when nothing has changed', async () => {
      const user = userEvent.setup()
      mockApi()
      await openSavedSegment()

      await user.click(screen.getByRole('button', { name: 'Sign out' }))

      expect(
        screen.getByRole('heading', { level: 2, name: 'Sign in' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
