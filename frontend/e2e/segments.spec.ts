import { test, expect } from './fixtures'

// The backend started by playwright.config.ts.
const projectsApiUrl = 'http://localhost:5269/api/projects'

test.describe('Segments', () => {
  let projectId: number

  test.beforeEach(async ({ request }) => {
    const response = await request.post(projectsApiUrl, {
      data: { name: `Segments test project ${Date.now()}` },
    })
    expect(response.ok()).toBe(true)
    projectId = ((await response.json()) as { id: number }).id
  })

  test.afterEach(async ({ request }) => {
    await request.delete(`${projectsApiUrl}/${projectId}`)
  })

  test('adds a segment and sees it listed on the project page', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByText('No segments yet.')).toBeVisible()

    await page.getByRole('link', { name: 'Add segment' }).click()
    await expect(
      page.getByRole('heading', { name: 'Segment 1', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Survey date')).toHaveValue('')

    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Name', { exact: true }).fill('Main line upstream')
    await page.getByLabel('Station 1.0 depth (m)').fill('3')
    await page.getByLabel('Station 1.0 note').fill('Line arrow')
    await page.getByLabel('Shot 1.1 distance (m)').fill('12.5')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('045')
    await page.getByLabel('Station 1.1 depth (m)').fill('7.25')
    await page.getByRole('button', { name: 'Add shot and station' }).click()
    await page.getByLabel('Shot 1.2 distance (m)').fill('8')
    await page.getByLabel('Shot 1.2 azimuth (°)').fill('360')
    await page.getByLabel('Station 1.2 depth (m)').fill('9')
    await page.getByRole('button', { name: 'Save segment' }).click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    const segment = page
      .getByRole('list', { name: 'Segments' })
      .getByRole('listitem')
    await expect(segment).toHaveCount(1)
    await expect(segment).toContainText('Segment 1 · Main line upstream')
    await expect(segment).toContainText('2026-11-21 · 3 stations · 20.5 m')
  })

  test('keeps what was typed when the segment is rejected, and starts the next one on the same day', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}/segments/new`)
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (m)').fill('3')
    await page.getByRole('button', { name: 'Save segment' }).click()

    await expect(
      page.getByText("This segment couldn't be saved.", { exact: false }),
    ).toBeVisible()
    await expect(page.getByLabel('Station 1.0 depth (m)')).toHaveValue('3')
    await expect(page.getByLabel('Station 1.1 depth (m)')).toHaveAttribute(
      'aria-invalid',
      'true',
    )

    await page.getByLabel('Shot 1.1 distance (m)').fill('5')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('90')
    await page.getByLabel('Station 1.1 depth (m)').fill('4')
    await page.getByRole('button', { name: 'Save segment' }).click()
    await page.getByRole('link', { name: 'Add segment' }).click()

    await expect(
      page.getByRole('heading', { name: 'Segment 2', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Survey date')).toHaveValue('2026-11-21')
  })

  test('shows the message beside a reading left blank, and saves once it is fixed', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}/segments/new`)
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (m)').fill('3')
    await page.getByLabel('Shot 1.1 distance (m)').fill('12.5')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('045')
    await page.getByRole('button', { name: 'Save segment' }).click()

    const depth = page.getByLabel('Station 1.1 depth (m)')
    await expect(depth).toHaveAttribute('aria-invalid', 'true')
    await expect(depth).toHaveAccessibleDescription('Depth is required.')
    await expect(page.getByRole('alert')).toContainText('1 field needs fixing.')

    await depth.fill('7')
    await expect(depth).not.toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toBeHidden()
    await page.getByRole('button', { name: 'Save segment' }).click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    await expect(
      page.getByRole('list', { name: 'Segments' }).getByRole('listitem'),
    ).toContainText('Segment 1')
  })

  test('reopens a saved segment, changes a depth and adds a station, and sees the change when it is reopened', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}/segments/new`)
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (m)').fill('3')
    await page.getByLabel('Station 1.0 note').fill('Line arrow')
    await page.getByLabel('Shot 1.1 distance (m)').fill('12.5')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('045')
    await page.getByLabel('Station 1.1 depth (m)').fill('7.25')
    await page.getByRole('button', { name: 'Save segment' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))

    await page.getByRole('link', { name: /Segment 1/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Segment 1', exact: true }),
    ).toBeVisible()
    await expect(page.getByLabel('Station 1.1 depth (m)')).toHaveValue('7.25')
    await expect(page.getByLabel('Station 1.0 note')).toHaveValue('Line arrow')
    await page.getByLabel('Station 1.1 depth (m)').fill('8.5')
    await page.getByRole('button', { name: 'Add shot and station' }).click()
    await page.getByLabel('Shot 1.2 distance (m)').fill('4')
    await page.getByLabel('Shot 1.2 azimuth (°)').fill('180')
    await page.getByLabel('Station 1.2 depth (m)').fill('10')
    await page.getByRole('button', { name: 'Save segment' }).click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    const segment = page
      .getByRole('list', { name: 'Segments' })
      .getByRole('listitem')
    await expect(segment).toHaveCount(1)
    await expect(segment).toContainText('2026-11-21 · 3 stations · 16.5 m')

    await segment.getByRole('link').click()
    await expect(page.getByLabel('Station 1.1 depth (m)')).toHaveValue('8.5')
    await expect(page.getByLabel('Station 1.2 depth (m)')).toHaveValue('10')
    await expect(page.getByLabel('Station 1.0 note')).toHaveValue('Line arrow')
  })

  test('adds a segment, deletes it and sees it gone, and the next segment gets a new number', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}/segments/new`)
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (m)').fill('3')
    await page.getByLabel('Shot 1.1 distance (m)').fill('12.5')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('045')
    await page.getByLabel('Station 1.1 depth (m)').fill('7')
    await page.getByRole('button', { name: 'Save segment' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))

    await page.getByRole('link', { name: /Segment 1/ }).click()
    await expect(
      page.getByRole('heading', { name: 'Segment 1', exact: true }),
    ).toBeVisible()
    const segmentUrl = page.url()
    await page.getByRole('button', { name: 'Delete segment' }).click()

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    await expect(page.getByText('No segments yet.')).toBeVisible()

    await page.goto(segmentUrl)
    await expect(
      page.getByText("That segment doesn't exist. It may have been deleted."),
    ).toBeVisible()

    await page.goto(`/projects/${projectId}`)
    await page.getByRole('link', { name: 'Add segment' }).click()
    await expect(
      page.getByRole('heading', { name: 'Segment 2', exact: true }),
    ).toBeVisible()
  })

  test('types a whole slate from the keyboard and saves it', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}/segments/new`)
    await page.getByLabel('Survey date').fill('2026-11-21')

    await page.getByLabel('Station 1.0 depth (m)').focus()
    for (const reading of ['3', '10', '045', '5']) {
      await page.keyboard.type(reading)
      await page.keyboard.press('Enter')
    }
    await expect(page.getByLabel('Shot 1.2 distance (m)')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Alt+n')
    await page.keyboard.type('Jump left')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('Shot 1.2 distance (m)')).toBeFocused()
    await page.keyboard.type('12.5')
    await page.keyboard.press('Tab')
    await page.keyboard.type('90')
    await page.keyboard.press('Tab')
    await page.keyboard.type('6')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('button', { name: 'Save segment' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    const segment = page
      .getByRole('list', { name: 'Segments' })
      .getByRole('listitem')
    await expect(segment).toHaveCount(1)
    await expect(segment).toContainText('2026-11-21 · 3 stations · 22.5 m')
  })

  test('reopens a saved segment, inserts a station in the middle, checks the flagged shot, and sees the result when it is reopened', async ({
    page,
    request,
  }) => {
    const segmentsUrl = `${projectsApiUrl}/${projectId}/segments`
    type SavedSegment = {
      id: number
      stations: { id: number; label: string }[]
      shots: { id: number; label: string }[]
    }
    const created = await request.post(segmentsUrl, {
      data: {
        surveyDate: '2026-11-21',
        unitSystem: 'metric',
        stations: [
          { depth: '3', note: 'Line arrow' },
          { depth: '7' },
          { depth: '9', note: 'Jump left' },
        ],
        shots: [
          { distance: '10', azimuth: '45' },
          { distance: '20', azimuth: '90', note: 'Restriction' },
        ],
      },
    })
    expect(created.ok()).toBe(true)
    const before = (await created.json()) as SavedSegment

    await page.goto(`/projects/${projectId}/segments/${before.id}`)
    await page
      .getByRole('button', { name: 'Insert station after Station 1.1' })
      .click()
    await expect(page.getByLabel('Shot 1.2 distance (m)')).toBeFocused()
    await page.keyboard.type('5')
    await page.keyboard.press('Tab')
    await page.keyboard.type('180')
    await page.keyboard.press('Tab')
    await page.keyboard.type('8')

    // The shot that used to leave Station 1.1 now leaves the new station.
    const flagged = page.getByLabel('Shot 1.3 distance (m)')
    await expect(flagged).toHaveValue('20')
    await expect(flagged).toHaveAccessibleDescription(/need checking/)
    await page.getByRole('button', { name: 'Save segment' }).click()
    await expect(page.getByRole('alert')).toContainText(
      '1 shot needs checking.',
    )
    await expect(page).toHaveURL(/\/segments\/\d+$/)

    await flagged.fill('15')
    await expect(page.getByRole('alert')).toBeHidden()
    await page.getByRole('button', { name: 'Save segment' }).click()
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`))
    await expect(
      page.getByRole('list', { name: 'Segments' }).getByRole('listitem'),
    ).toContainText('2026-11-21 · 4 stations · 30 m')

    await page.getByRole('link', { name: /Segment 1/ }).click()
    const values = [
      ['Station 1.0 depth (m)', '3'],
      ['Station 1.0 note', 'Line arrow'],
      ['Shot 1.1 distance (m)', '10'],
      ['Station 1.1 depth (m)', '7'],
      ['Shot 1.2 distance (m)', '5'],
      ['Shot 1.2 azimuth (°)', '180'],
      ['Station 1.2 depth (m)', '8'],
      ['Shot 1.3 distance (m)', '15'],
      ['Shot 1.3 note', 'Restriction'],
      ['Station 1.3 depth (m)', '9'],
      ['Station 1.3 note', 'Jump left'],
    ]
    for (const [name, value] of values) {
      await expect(page.getByLabel(name, { exact: true })).toHaveValue(value)
    }
    await expect(
      page.getByRole('button', { name: /distance and azimuth are right/ }),
    ).toHaveCount(0)

    // The stations and shots that were there before keep their identity under their new labels.
    const after = (await (
      await request.get(`${segmentsUrl}/${before.id}`)
    ).json()) as SavedSegment
    expect(after.stations.map((station) => station.label)).toEqual([
      '1.0',
      '1.1',
      '1.2',
      '1.3',
    ])
    expect(after.stations.map((station) => station.id)).toEqual([
      before.stations[0].id,
      before.stations[1].id,
      expect.any(Number),
      before.stations[2].id,
    ])
    expect(after.shots.map((shot) => shot.id)).toEqual([
      before.shots[0].id,
      expect.any(Number),
      before.shots[1].id,
    ])
  })

  test('switches the project to imperial, adds a segment in feet, and sees it converted to metric and back', async ({
    page,
  }) => {
    await page.goto(`/projects/${projectId}`)
    const unitSystem = page.getByRole('group', { name: 'Unit system' })
    await expect(
      unitSystem.getByRole('button', { name: 'Metric' }),
    ).toHaveAttribute('aria-pressed', 'true')

    await unitSystem.getByRole('button', { name: 'Imperial' }).click()
    await expect(
      unitSystem.getByRole('button', { name: 'Imperial' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('link', { name: 'Add segment' }).click()
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (ft)').fill('10')
    await page.getByLabel('Shot 1.1 distance (ft)').fill('30')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('090')
    await page.getByLabel('Station 1.1 depth (ft)').fill('20')
    await page.getByRole('button', { name: 'Save segment' }).click()

    const segment = page
      .getByRole('list', { name: 'Segments' })
      .getByRole('listitem')
    await expect(segment).toContainText('2026-11-21 · 2 stations · 30 ft')
    await segment.getByRole('link').click()
    await expect(page.getByLabel('Shot 1.1 distance (ft)')).toHaveValue('30')
    await page.getByRole('link', { name: '← Back to project' }).click()

    // 30 feet is 9.144 metres, and depths of 10 and 20 feet are 3.048 and 6.096.
    await unitSystem.getByRole('button', { name: 'Metric' }).click()
    await expect(segment).toContainText('2026-11-21 · 2 stations · 9.14 m')
    await segment.getByRole('link').click()
    await expect(page.getByLabel('Station 1.0 depth (m)')).toHaveValue('3.05')
    await expect(page.getByLabel('Shot 1.1 distance (m)')).toHaveValue('9.14')
    await expect(page.getByLabel('Shot 1.1 azimuth (°)')).toHaveValue('90')
    await expect(page.getByLabel('Station 1.1 depth (m)')).toHaveValue('6.1')
    // Saved untouched in metres, the readings are kept as they were stored.
    await page.getByRole('button', { name: 'Save segment' }).click()

    await unitSystem.getByRole('button', { name: 'Imperial' }).click()
    await expect(segment).toContainText('2026-11-21 · 2 stations · 30 ft')
    await segment.getByRole('link').click()
    await expect(page.getByLabel('Station 1.0 depth (ft)')).toHaveValue('10')
    await expect(page.getByLabel('Shot 1.1 distance (ft)')).toHaveValue('30')
    await expect(page.getByLabel('Station 1.1 depth (ft)')).toHaveValue('20')
  })
})
