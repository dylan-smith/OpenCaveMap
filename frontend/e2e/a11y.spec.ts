import AxeBuilder from '@axe-core/playwright'
import { test, expect } from './fixtures'

// The backend started by playwright.config.ts.
const projectsApiUrl = 'http://localhost:5269/api/projects'

test.describe('Accessibility', () => {
  test('main page has no detectable accessibility violations', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'OpenCaveMap' }),
    ).toBeVisible()
    await expect(
      page.getByRole('heading', { name: 'Create project' }),
    ).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()

    expect(results.violations).toEqual([])
  })

  test('project page has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y test project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id, name } = (await response.json()) as { id: number; name: string }

    try {
      await page.goto(`/projects/${id}`)
      await expect(page.getByRole('heading', { name })).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('project page with a segment has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y segments project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id, name } = (await response.json()) as { id: number; name: string }

    try {
      const segment = await request.post(`${projectsApiUrl}/${id}/segments`, {
        data: {
          surveyDate: '2026-11-21',
          unitSystem: 'metric',
          name: 'Main line',
          stations: [{ depth: '3' }, { depth: '7' }],
          shots: [{ distance: '12.5', azimuth: '45' }],
        },
      })
      expect(segment.ok()).toBe(true)

      await page.goto(`/projects/${id}`)
      await expect(page.getByRole('heading', { name })).toBeVisible()
      await expect(page.getByText('Segment 1 · Main line')).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('segment entry screen has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y entry project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id } = (await response.json()) as { id: number }

    try {
      await page.goto(`/projects/${id}/segments/new`)
      await expect(
        page.getByRole('heading', { name: 'Segment 1', exact: true }),
      ).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('segment entry screen showing validation messages has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y messages project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id } = (await response.json()) as { id: number }

    try {
      await page.goto(`/projects/${id}/segments/new`)
      await expect(
        page.getByRole('heading', { name: 'Segment 1', exact: true }),
      ).toBeVisible()
      await page.getByRole('button', { name: 'Save segment' }).click()
      await expect(page.getByLabel('Station 1.0 depth (m)')).toHaveAttribute(
        'aria-invalid',
        'true',
      )
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('leave without saving dialog has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y leave project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id } = (await response.json()) as { id: number }

    try {
      await page.goto(`/projects/${id}/segments/new`)
      await page.getByLabel('Station 1.0 depth (m)').fill('3')
      await page.getByRole('link', { name: '← Back to project' }).click()
      await expect(
        page.getByRole('dialog', { name: 'Leave without saving?' }),
      ).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('segment entry screen with a flagged shot has no detectable accessibility violations', async ({
    page,
    request,
  }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `A11y flagged project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    const { id } = (await response.json()) as { id: number }

    try {
      await page.goto(`/projects/${id}/segments/new`)
      await expect(
        page.getByRole('heading', { name: 'Segment 1', exact: true }),
      ).toBeVisible()
      await page
        .getByRole('button', { name: 'Insert station after Station 1.0' })
        .click()
      await page.getByRole('button', { name: 'Save segment' }).click()
      await expect(page.getByRole('alert')).toContainText(
        '1 shot needs checking.',
      )
      const results = await new AxeBuilder({ page }).analyze()

      expect(results.violations).toEqual([])
    } finally {
      await request.delete(`${projectsApiUrl}/${id}`)
    }
  })

  test('not found page has no detectable accessibility violations', async ({
    page,
  }) => {
    await page.goto('/no/such/page')
    await expect(
      page.getByRole('heading', { name: 'Page not found' }),
    ).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()

    expect(results.violations).toEqual([])
  })
})
