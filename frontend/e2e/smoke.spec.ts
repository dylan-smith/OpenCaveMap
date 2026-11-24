import { test, expect, type Page } from '@playwright/test'

// The token the signed-in smoke test uses: the service token in production, and a test sign-in elsewhere, where
// test sign-in is turned on.
const authToken = process.env.SMOKE_AUTH_TOKEN ?? 'test:Smoke User'

// Saves a session the way the frontend does after signing in (see src/auth/session.ts), before the page loads.
async function signIn(page: Page) {
  await page.addInitScript((token) => {
    localStorage.setItem(
      'opencavemap.session',
      JSON.stringify({ token, name: 'Smoke Test', provider: 'service' }),
    )
  }, authToken)
}

test('smoke: app loads and asks the user to sign in', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'OpenCaveMap' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible()
})

// Deleting the project at the end also deletes its segment, which, with saving and reloading it, proves on the
// preview's SQL Server that the database scripts and the API's model agree.
test('smoke: can create, open, and delete a project with a segment', async ({
  page,
}) => {
  const projectName = `Smoke Test ${Date.now()}`
  await signIn(page)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'OpenCaveMap' })).toBeVisible()

  // Create a project
  await page.getByLabel('Project name').fill(projectName)
  await page.getByRole('button', { name: 'Create project' }).click()

  const projectLink = page.getByRole('link', {
    name: projectName,
    exact: true,
  })
  const deleteButton = page.getByRole('button', { name: 'Delete' })
  const backToProject = page.getByRole('link', {
    name: '← Back to project',
    exact: true,
  })

  try {
    // Verify it appears in the list, then open it. Reloading checks the host serves the deep link.
    await projectLink.click()
    await expect(
      page.getByRole('heading', { name: projectName, exact: true }),
    ).toBeVisible()
    await page.reload()
    await expect(
      page.getByRole('heading', { name: projectName, exact: true }),
    ).toBeVisible()

    // Add a segment, then reload to check it was stored.
    await page.getByRole('link', { name: 'Add segment' }).click()
    await page.getByLabel('Survey date').fill('2026-11-21')
    await page.getByLabel('Station 1.0 depth (m)').fill('3.5')
    await page.getByLabel('Shot 1.1 distance (m)').fill('12.25')
    await page.getByLabel('Shot 1.1 azimuth (°)').fill('045')
    await page.getByLabel('Station 1.1 depth (m)').fill('7')
    await page.getByRole('button', { name: 'Save segment' }).click()
    const segment = page
      .getByRole('list', { name: 'Segments' })
      .getByRole('listitem')
    await expect(segment).toContainText('Segment 1')
    await page.reload()
    await expect(segment).toContainText('2026-11-21 · 2 stations · 12.25 m')
  } finally {
    // Best-effort cleanup so we don't leave data behind if the test fails mid-run. If it failed on the entry screen,
    // go back to the project page first; anywhere else there's no link back, and the click soon gives up.
    await backToProject.click({ timeout: 2000 }).catch(() => {})
    await deleteButton.click().catch(() => {})
  }

  await expect(
    page.getByRole('heading', { name: 'Create project' }),
  ).toBeVisible()
  await expect(projectLink).toBeHidden()
})
