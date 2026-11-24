import { useId } from 'react'
import type { KeyboardEvent, RefCallback } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { DraftShot, DraftStation } from './segmentDraft'

// Station and shot labels share a width so their fields line up. A shot row is indented beside the line joining
// its two stations, which starts under the centre of each station's dot.
const dotSize = 16
const labelWidth = 120
const shotIndent = 32

// Every field's accessible name includes the row's label, so a screen reader says which reading it's on, and the
// unit, m or ft, the depth is in.
export function StationRow({
  label,
  unit,
  station,
  canRemove,
  onInsertAfter,
  onRemove,
  message,
  onChange,
  inputRef,
  onReadingKeyDown,
  onNoteKeyDown,
}: {
  label: string
  unit: string
  station: DraftStation
  canRemove: boolean
  onInsertAfter: () => void
  onRemove: () => void
  message: (field: 'depth' | 'note') => string | undefined
  onChange: (changes: Partial<DraftStation>) => void
  inputRef: (field: 'depth' | 'note') => RefCallback<HTMLInputElement>
  onReadingKeyDown: (field: 'depth', event: KeyboardEvent) => void
  onNoteKeyDown: (event: KeyboardEvent) => void
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 1,
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: dotSize,
          height: dotSize,
          mt: 1.25,
          borderRadius: '50%',
          bgcolor: 'primary.main',
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          minWidth: labelWidth,
          pt: 1,
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <TextField
        size="small"
        label={`Depth (${unit})`}
        value={station.depth}
        inputRef={inputRef('depth')}
        onKeyDown={(event) => onReadingKeyDown('depth', event)}
        onChange={(event) => onChange({ depth: event.target.value })}
        error={Boolean(message('depth'))}
        helperText={message('depth')}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} depth (${unit})`,
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        size="small"
        label="Note"
        value={station.note}
        inputRef={inputRef('note')}
        onKeyDown={onNoteKeyDown}
        onChange={(event) => onChange({ note: event.target.value })}
        error={Boolean(message('note'))}
        helperText={message('note')}
        sx={{ flex: 1, minWidth: 160 }}
        slotProps={{
          // Notes are occasional, so Tab skips them. Alt+N in a reading reaches one.
          htmlInput: { 'aria-label': `${label} note`, tabIndex: -1 },
        }}
      />
      {/* Out of the Tab order, like the notes, so Tab keeps to the readings. Each name says which station it acts
          on, since every station has a pair. */}
      <Box sx={{ display: 'flex', mt: 0.5 }}>
        <Button
          size="small"
          tabIndex={-1}
          aria-label={`Insert station after ${label}`}
          onClick={onInsertAfter}
          sx={{ whiteSpace: 'nowrap' }}
        >
          Insert station
        </Button>
        <Button
          size="small"
          color="error"
          tabIndex={-1}
          aria-label={`Remove ${label}`}
          disabled={!canRemove}
          onClick={onRemove}
        >
          Remove
        </Button>
      </Box>
    </Box>
  )
}

// A flagged shot is marked with a warning border, and also in words, so it doesn't rely on colour. Its distance and
// azimuth are described by the message, so a screen reader reads it on reaching either.
export function ShotRow({
  label,
  unit,
  shot,
  message,
  onChange,
  onConfirm,
  inputRef,
  onReadingKeyDown,
  onNoteKeyDown,
}: {
  label: string
  unit: string
  shot: DraftShot
  message: (field: 'distance' | 'azimuth' | 'note') => string | undefined
  onChange: (changes: Partial<DraftShot>) => void
  onConfirm: () => void
  inputRef: (
    field: 'distance' | 'azimuth' | 'note',
  ) => RefCallback<HTMLInputElement>
  onReadingKeyDown: (
    field: 'distance' | 'azimuth',
    event: KeyboardEvent,
  ) => void
  onNoteKeyDown: (event: KeyboardEvent) => void
}) {
  const id = useId()
  const reviewId = `${id}-review`
  // A flagged shot's line is wider, still centred under the stations' dots, with the fields where they were.
  const lineWidth = shot.review ? 4 : 2

  // MUI describes a field by its message, and this replaces that, so the message's id is included here.
  function describedBy(field: 'distance' | 'azimuth') {
    const ids = [
      message(field) ? `${id}-${field}-helper-text` : null,
      shot.review ? reviewId : null,
    ].filter((value) => value !== null)
    return ids.length > 0 ? ids.join(' ') : undefined
  }

  return (
    <Box
      sx={{
        ml: `${dotSize / 2 - lineWidth / 2}px`,
        pl: `${shotIndent - dotSize / 2 - lineWidth / 2}px`,
        py: 1.5,
        borderLeft: `${lineWidth}px solid`,
        borderColor: shot.review ? 'warning.main' : 'divider',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 1,
      }}
    >
      <Typography
        color="text.secondary"
        sx={{
          // Lines the shot's fields up with the stations'.
          minWidth: labelWidth + dotSize - shotIndent,
          pt: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Typography>
      <TextField
        id={`${id}-distance`}
        size="small"
        label={`Distance (${unit})`}
        value={shot.distance}
        inputRef={inputRef('distance')}
        onKeyDown={(event) => onReadingKeyDown('distance', event)}
        onChange={(event) => onChange({ distance: event.target.value })}
        error={Boolean(message('distance'))}
        helperText={message('distance')}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} distance (${unit})`,
            'aria-describedby': describedBy('distance'),
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        id={`${id}-azimuth`}
        size="small"
        label="Azimuth (°)"
        value={shot.azimuth}
        inputRef={inputRef('azimuth')}
        onKeyDown={(event) => onReadingKeyDown('azimuth', event)}
        onChange={(event) => onChange({ azimuth: event.target.value })}
        error={Boolean(message('azimuth'))}
        helperText={message('azimuth')}
        sx={{ width: 110 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} azimuth (°)`,
            'aria-describedby': describedBy('azimuth'),
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        size="small"
        label="Note"
        value={shot.note}
        inputRef={inputRef('note')}
        onKeyDown={onNoteKeyDown}
        onChange={(event) => onChange({ note: event.target.value })}
        error={Boolean(message('note'))}
        helperText={message('note')}
        sx={{ flex: 1, minWidth: 160 }}
        slotProps={{
          // Notes are occasional, so Tab skips them. Alt+N in a reading reaches one.
          htmlInput: { 'aria-label': `${label} note`, tabIndex: -1 },
        }}
      />
      {shot.review && (
        <Box
          sx={{
            flexBasis: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 1,
          }}
        >
          <Typography id={reviewId} variant="body2">
            <Box component="span" aria-hidden sx={{ color: 'warning.main' }}>
              ⚠{' '}
            </Box>
            <strong>Check this shot:</strong> it now joins different stations,
            so its distance and azimuth need checking.
          </Typography>
          {/* In the Tab order after the azimuth, so the keyboard can confirm the shot as it passes. */}
          <Button
            size="small"
            aria-label={`${label} distance and azimuth are right`}
            onClick={onConfirm}
          >
            Distance and azimuth are right
          </Button>
        </Box>
      )}
    </Box>
  )
}
