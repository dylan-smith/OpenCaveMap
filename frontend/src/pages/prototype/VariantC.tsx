// PROTOTYPE: throwaway. Variant C: one big prompt asking for the next reading, with the slate so far below it.
import { useState } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { SEGMENT_NUMBER } from './draft'
import type { Draft } from './draft'

export const name = 'One reading at a time'

interface Step {
  key: string
  owner: string
  prompt: string
  value: string
  set: (text: string) => void
  note: string
  setNote: (text: string) => void
}

export function VariantC({ d }: { d: Draft }) {
  const { seg } = d
  const steps: Step[] = []
  seg.stations.forEach((station, i) => {
    steps.push({
      key: `d-${station.id}`,
      owner: `Station ${SEGMENT_NUMBER}.${i}`,
      prompt: `Depth (${d.unitLabel})`,
      value: station.depth.text,
      set: (text) => d.setDepth(station.id, text),
      note: station.note,
      setNote: (text) => d.setStationNote(station.id, text),
    })
    const shot = seg.shots.at(i)
    if (!shot) return
    const shared = {
      owner: `Shot ${SEGMENT_NUMBER}.${i + 1}`,
      note: shot.note,
      setNote: (text: string) => d.setShotNote(shot.id, text),
    }
    steps.push({
      ...shared,
      key: `l-${shot.id}`,
      prompt: `Distance (${d.unitLabel})`,
      value: shot.distance.text,
      set: (text) => d.setDistance(shot.id, text),
    })
    steps.push({
      ...shared,
      key: `a-${shot.id}`,
      prompt: 'Azimuth (°)',
      value: shot.azimuth,
      set: (text) => d.setAzimuth(shot.id, text),
    })
  })

  const [cursor, setCursor] = useState(steps[0].key)
  const index = Math.max(
    0,
    steps.findIndex((s) => s.key === cursor),
  )
  const step = steps[index]

  function advance() {
    const next = steps.at(index + 1)
    setCursor(next ? next.key : `l-${d.addAtEnd()}`)
  }

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 3, mb: 2, textAlign: 'center' }}>
        <Typography variant="h5" component="p">
          {step.owner}
        </Typography>
        <TextField
          // Remount per step so each one starts focused.
          key={step.key}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          label={step.prompt}
          value={step.value}
          error={Boolean(d.errors[step.key])}
          helperText={d.errors[step.key] ?? 'Enter for the next reading'}
          onChange={(event) => step.set(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              advance()
            }
          }}
          sx={{ my: 2, width: 220 }}
          slotProps={{
            htmlInput: {
              inputMode: 'decimal',
              style: { fontSize: 32, textAlign: 'center' },
            },
          }}
        />
        <Box>
          <TextField
            size="small"
            label={`Note for ${step.owner}`}
            value={step.note}
            onChange={(event) => step.setNote(event.target.value)}
            sx={{ width: '100%', maxWidth: 420 }}
            slotProps={{ htmlInput: { tabIndex: -1 } }}
          />
        </Box>
      </Paper>

      {seg.stations.map((station, i) => {
        const shot = seg.shots.at(i)
        const cell = (key: string, text: string, suffix: string) => (
          <Button
            size="small"
            tabIndex={-1}
            variant={key === step.key ? 'contained' : 'text'}
            color={d.errors[key] ? 'error' : 'primary'}
            onClick={() => setCursor(key)}
            sx={{ minWidth: 0, textTransform: 'none' }}
          >
            {text === '' ? '—' : `${text}${suffix}`}
          </Button>
        )
        return (
          <Box key={station.id}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontWeight: 700, width: 120 }} noWrap>
                ● Station {SEGMENT_NUMBER}.{i}
              </Typography>
              {cell(`d-${station.id}`, station.depth.text, ` ${d.unitLabel}`)}
              <Typography variant="body2" color="text.secondary" noWrap>
                {station.note}
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Button
                size="small"
                tabIndex={-1}
                onClick={() => d.insertAfter(i)}
                sx={{ minWidth: 0, whiteSpace: 'nowrap' }}
              >
                + after
              </Button>
              <Button
                size="small"
                color="error"
                tabIndex={-1}
                disabled={seg.stations.length <= 2}
                onClick={() => d.removeStation(i)}
                sx={{ minWidth: 0 }}
              >
                ✕
              </Button>
            </Box>
            {shot && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  ml: '7px',
                  pl: 3,
                  borderLeft: '2px solid',
                  borderColor: shot.review ? 'warning.main' : 'divider',
                  bgcolor: shot.review ? '#fff4e5' : undefined,
                }}
              >
                <Typography color="text.secondary" sx={{ width: 88 }} noWrap>
                  Shot {SEGMENT_NUMBER}.{i + 1}
                </Typography>
                {cell(`l-${shot.id}`, shot.distance.text, ` ${d.unitLabel}`)}
                {cell(`a-${shot.id}`, shot.azimuth, '°')}
                <Typography variant="body2" color="text.secondary" noWrap>
                  {shot.note}
                </Typography>
                {shot.review && (
                  <Button
                    size="small"
                    tabIndex={-1}
                    onClick={() => d.clearReview(shot.id)}
                  >
                    ⚠ Check, or click if right
                  </Button>
                )}
              </Box>
            )}
          </Box>
        )
      })}
    </Box>
  )
}
