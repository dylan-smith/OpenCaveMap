import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setSession } from '../auth/session'
import {
  jsonResponse,
  mockFetch,
  unreachable,
  unreachableMessage,
} from './mockFetch'
import { renderAt } from './renderAt'
import { mockApi, project } from './segmentFixtures'

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
