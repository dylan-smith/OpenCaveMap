import type { RouteObject } from 'react-router'
import App from './App'
import { ErrorFallback } from './ErrorBoundary'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ProjectsPage from './pages/ProjectsPage'
import SegmentEntryPage from './pages/SegmentEntryPage'
import NotFoundPage from './pages/NotFoundPage'

// The app's pages, rendered inside App's layout. Used by the browser router in main.tsx and the tests' memory router.
export const routes = [
  {
    path: '/',
    element: <App />,
    // Without this the router shows its own developer error page. The caught error is still reported by the root's
    // onCaughtError handler in main.tsx.
    ErrorBoundary: ErrorFallback,
    children: [
      { index: true, element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'projects/:id/segments/new', element: <SegmentEntryPage /> },
      {
        path: 'projects/:id/segments/:segmentId',
        element: <SegmentEntryPage />,
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
] satisfies RouteObject[]
