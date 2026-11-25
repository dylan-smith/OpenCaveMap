import type { KeyboardEvent, RefCallback } from 'react'
import Box from '@mui/material/Box'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { readingMaxLength } from './segmentDraft'
import type { DraftShot, DraftStation } from './segmentDraft'

// Station and shot labels share a width so their fields line up. A shot row is indented beside the line joining
// its two stations, which starts under the centre of each station's dot.
const dotSize = 16
const labelWidth = 120
const shotIndent = 32

// Every field's accessible name includes the row's label, so a screen reader says which reading it's on.
export function StationRow({
  label,
  station,
  message,
  onChange,
  inputRef,
  onReadingKeyDown,
  onNoteKeyDown,
}: {
  label: string
  station: DraftStation
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
        label="Depth (m)"
        value={station.depth}
        inputRef={inputRef('depth')}
        onKeyDown={(event) => onReadingKeyDown('depth', event)}
        onChange={(event) => onChange({ depth: event.target.value })}
        error={Boolean(message('depth'))}
        helperText={message('depth')}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} depth (m)`,
            inputMode: 'decimal',
            maxLength: readingMaxLength,
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
    </Box>
  )
}

export function ShotRow({
  label,
  shot,
  message,
  onChange,
  inputRef,
  onReadingKeyDown,
  onNoteKeyDown,
}: {
  label: string
  shot: DraftShot
  message: (field: 'distance' | 'azimuth' | 'note') => string | undefined
  onChange: (changes: Partial<DraftShot>) => void
  inputRef: (
    field: 'distance' | 'azimuth' | 'note',
  ) => RefCallback<HTMLInputElement>
  onReadingKeyDown: (
    field: 'distance' | 'azimuth',
    event: KeyboardEvent,
  ) => void
  onNoteKeyDown: (event: KeyboardEvent) => void
}) {
  return (
    <Box
      sx={{
        ml: `${dotSize / 2 - 1}px`,
        pl: `${shotIndent - dotSize / 2 - 1}px`,
        py: 1.5,
        borderLeft: '2px solid',
        borderColor: 'divider',
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
        size="small"
        label="Distance (m)"
        value={shot.distance}
        inputRef={inputRef('distance')}
        onKeyDown={(event) => onReadingKeyDown('distance', event)}
        onChange={(event) => onChange({ distance: event.target.value })}
        error={Boolean(message('distance'))}
        helperText={message('distance')}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} distance (m)`,
            inputMode: 'decimal',
            maxLength: readingMaxLength,
          },
        }}
      />
      <TextField
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
            inputMode: 'decimal',
            maxLength: readingMaxLength,
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
    </Box>
  )
}
