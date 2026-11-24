import { useCallback, useId } from 'react'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'

// Asks before leaving with unsaved entries, by going elsewhere or by signing out. Focus starts on Stay, the choice
// that loses nothing, and Escape stays too.
function LeaveDialog({
  open,
  onStay,
  onLeave,
}: {
  open: boolean
  onStay: () => void
  onLeave: () => void
}) {
  const id = useId()
  // The dialog's contents mount each time it opens, so this runs once per opening. Stable, so a re-render while it's
  // open doesn't take focus back from Leave.
  const focusStay = useCallback((button: HTMLButtonElement | null) => {
    button?.focus()
  }, [])
  return (
    <Dialog
      open={open}
      onClose={onStay}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <DialogTitle id={`${id}-title`}>Leave without saving?</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-description`}>
          Your entries in this segment haven&apos;t been saved. If you leave,
          they&apos;ll be lost.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button ref={focusStay} onClick={onStay}>
          Stay
        </Button>
        <Button color="error" onClick={onLeave}>
          Leave
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default LeaveDialog
