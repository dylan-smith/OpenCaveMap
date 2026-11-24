import { Component } from 'react'
import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Container from '@mui/material/Container'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

// Also the router's error boundary for the app's routes (routes.tsx), which catches errors in them before they reach
// ErrorBoundary.
export function ErrorFallback() {
  return (
    <Container maxWidth="md" component="main" sx={{ py: 4 }}>
      <Alert severity="error">
        Something went wrong. Reload the page to try again.
      </Alert>
    </Container>
  )
}

// Shows a fallback instead of a blank page. Errors are reported to telemetry by the root's onCaughtError
// handler in main.tsx, so this doesn't report them itself.
class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />
    }

    return this.props.children
  }
}

export default ErrorBoundary
