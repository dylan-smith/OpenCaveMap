// PROTOTYPE: throwaway. Three variants of the segment entry screen, switchable via ?variant=A|B|C,
// on the dev-only route /prototype/segment-entry. Nothing is saved anywhere.
import { useEffect } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useSearchParams } from 'react-router'
import { SEGMENT_NUMBER, azimuthValue, useDraft } from './draft'
import type { UnitSystem } from './draft'
import { VariantA, name as nameA } from './VariantA'
import { VariantB, name as nameB } from './VariantB'
import { VariantC, name as nameC } from './VariantC'

const VARIANTS = [
  { key: 'A', name: nameA, Component: VariantA },
  { key: 'B', name: nameB, Component: VariantB },
  { key: 'C', name: nameC, Component: VariantC },
]

function SegmentEntryPrototype() {
  const [params, setParams] = useSearchParams()
  const d = useDraft()
  const found = VARIANTS.findIndex((v) => v.key === params.get('variant'))
  const index = found === -1 ? 0 : found
  const variant = VARIANTS[index]

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, [contenteditable]')) return
      const step =
        event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (step === 0) return
      const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length]
      setParams({ variant: next.key }, { replace: true })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, setParams])

  const go = (step: number) =>
    setParams(
      {
        variant:
          VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length].key,
      },
      { replace: true },
    )

  const errorCount = Object.keys(d.errors).length

  return (
    <Stack spacing={2} sx={{ pb: 10 }}>
      <Paper component="section" elevation={2} sx={{ p: 3 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', mb: 2, flexWrap: 'wrap' }}
          useFlexGap
        >
          <Typography variant="h5" component="h2" sx={{ flex: 1 }}>
            Segment {SEGMENT_NUMBER}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={d.unit}
            onChange={(_, next: UnitSystem | null) => {
              if (next) d.setUnit(next)
            }}
          >
            <ToggleButton value="imperial">Imperial</ToggleButton>
            <ToggleButton value="metric">Metric</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            size="small"
            type="date"
            label="Survey date"
            defaultValue="2026-11-21"
            required
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField size="small" label="Name (optional)" sx={{ flex: 1 }} />
        </Stack>
        <TextField
          size="small"
          label="Segment note"
          multiline
          fullWidth
          sx={{ my: 2 }}
        />

        <variant.Component d={d} />

        <Stack spacing={1} sx={{ mt: 3 }}>
          {errorCount > 0 && (
            <Alert severity="error">
              {errorCount} reading{errorCount === 1 ? '' : 's'} missing or
              invalid.
            </Alert>
          )}
          {d.needReview > 0 && (
            <Alert severity="warning">
              {d.needReview} shot{d.needReview === 1 ? '' : 's'} to check before
              saving.
            </Alert>
          )}
          {d.saved && (
            <Alert severity="success">
              Valid. This is where the segment would be saved.
            </Alert>
          )}
          <Box>
            <Button variant="contained" onClick={() => d.save()}>
              Save segment
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2">
          What would be stored (always metres). Enter moves to the next reading;
          Alt+N jumps to the note.
        </Typography>
        <Box component="pre" sx={{ fontSize: 12, m: 0, overflowX: 'auto' }}>
          {d.seg.stations
            .map((station, i) => {
              const shot = d.seg.shots.at(i)
              const lines = [
                `Station ${SEGMENT_NUMBER}.${i}  depth=${station.depth.m === null ? '?' : Number(station.depth.m.toFixed(4))} m  note="${station.note}"`,
              ]
              if (shot) {
                lines.push(
                  `  Shot ${SEGMENT_NUMBER}.${i + 1}   distance=${shot.distance.m === null ? '?' : Number(shot.distance.m.toFixed(4))} m  azimuth=${azimuthValue(shot.azimuth) ?? '?'}°  note="${shot.note}"${shot.review ? '  [needs review]' : ''}`,
                )
              }
              return lines.join('\n')
            })
            .join('\n')}
        </Box>
      </Paper>

      <Paper
        elevation={8}
        sx={{
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          bgcolor: 'grey.900',
          color: 'common.white',
          borderRadius: 99,
          px: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          zIndex: 2000,
        }}
      >
        <Button
          color="inherit"
          onClick={() => go(-1)}
          aria-label="Previous variant"
        >
          ←
        </Button>
        <Typography variant="body2" noWrap>
          {variant.key} ({variant.name})
        </Typography>
        <Button color="inherit" onClick={() => go(1)} aria-label="Next variant">
          →
        </Button>
      </Paper>
    </Stack>
  )
}

export default SegmentEntryPrototype
