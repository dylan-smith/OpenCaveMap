import { useEffect, useState } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import { Link, Outlet, useLocation } from 'react-router'
import logo from './assets/logo.svg'
import { disableGoogleAutoSelect } from './auth/google'
import { setSession, useSession } from './auth/session'
import type { Session } from './auth/session'
import SignInPage from './auth/SignInPage'
import LeaveDialog from './pages/LeaveDialog'
import { useUnsavedEntries } from './pages/unsavedEntries'
import { trackPageView } from './telemetry'

function signOut() {
  disableGoogleAutoSelect()
  setSession(null)
}

// Who a session belongs to, the same across sign-ins.
function userOf(session: Session) {
  return `${session.provider}:${session.email ?? session.name}`
}

function App() {
  const { pathname } = useLocation()
  const session = useSession()
  const unsaved = useUnsavedEntries()
  // The user the pages belong to, remembered while signed out. null once they've signed out on purpose.
  const [owner, setOwner] = useState(session && userOf(session))
  const [confirmingSignOut, setConfirmingSignOut] = useState(false)

  if (session !== null && userOf(session) !== owner) {
    setOwner(userOf(session))
  }

  // One page view for the first load and one for each route change after it, including back and forward.
  useEffect(() => {
    trackPageView()
  }, [pathname])

  // Losing the sign-in, when it expires or the user signs out in another tab, would otherwise throw away entries
  // they haven't saved. Their page stays, hidden behind the sign-in page, and comes back if the same user signs in
  // again. Keyed by the user, so anyone else gets fresh pages. Pages without unsaved entries go, and load again.
  const keepPages = session === null && unsaved && owner !== null
  const pages = (session !== null || keepPages) && (
    <div key={owner} hidden={session === null}>
      <Outlet />
    </div>
  )

  function handleSignOut() {
    if (unsaved) {
      setConfirmingSignOut(true)
    } else {
      signOut()
    }
  }

  // Signing out on purpose discards the entries.
  function signOutAndDiscard() {
    setConfirmingSignOut(false)
    setOwner(null)
    signOut()
  }

  return (
    <Container maxWidth="md" component="main" sx={{ py: 4 }}>
      {session && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            mb: 1,
          }}
        >
          <Avatar
            src={session.pictureUrl}
            alt=""
            sx={{ width: 28, height: 28, fontSize: 14 }}
          >
            {session.name.charAt(0).toUpperCase()}
          </Avatar>
          <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
            {session.name}
          </Typography>
          <Button size="small" onClick={handleSignOut} sx={{ flexShrink: 0 }}>
            Sign out
          </Button>
        </Box>
      )}
      <Typography variant="h3" component="h1" gutterBottom>
        <Box
          component={Link}
          to="/"
          sx={{ display: 'block', width: 'fit-content', mx: 'auto' }}
        >
          <Box
            component="img"
            src={logo}
            alt="OpenCaveMap"
            sx={{ display: 'block', height: 120 }}
          />
        </Box>
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        align="center"
        sx={{ mb: 3 }}
      >
        Survey, map and share caves.
      </Typography>

      {session === null && <SignInPage />}
      {pages}
      <LeaveDialog
        open={confirmingSignOut}
        onStay={() => setConfirmingSignOut(false)}
        onLeave={signOutAndDiscard}
      />
    </Container>
  )
}

export default App
