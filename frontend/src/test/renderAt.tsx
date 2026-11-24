import { render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import type { RouteObject } from 'react-router'
import { routes } from '../routes'

// Renders the app at an address with the same routes and router mode as production. Extra pages are added
// under the app, next to its own.
export function renderAt(path: string, extraPages: RouteObject[] = []) {
  const [{ children: pages, ...app }] = routes
  const router = createMemoryRouter(
    [{ ...app, children: [...extraPages, ...pages] }],
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}
