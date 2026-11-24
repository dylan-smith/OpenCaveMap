import { useEffect, useState } from 'react'
import type { SubmitEvent } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError, describeFetchError } from '../api/projects'
import { createSegment, getNewSegment } from '../api/segments'
import type { Segment, SegmentRequest } from '../api/segments'
import { trackEvent, trackException } from '../telemetry'
import NotFoundPage from './NotFoundPage'
import { parseId } from './parseId'

// What the user has typed, kept as text until the API parses it. key identifies a row to React, since rows added
// here have no id until they're saved. shots[i] runs from stations[i] to stations[i + 1].
type DraftStation = {
  key: string
  id: number | null
  depth: string
  note: string
}

type DraftShot = {
  key: string
  id: number | null
  distance: string
  azimuth: string
  note: string
}

type Draft = {
  number: number
  surveyDate: string
  name: string
  note: string
  stations: DraftStation[]
  shots: DraftShot[]
}

let lastRowKey = 0

function nextRowKey() {
  lastRowKey += 1
  return `row-${lastRowKey}`
}

function newStation(): DraftStation {
  return { key: nextRowKey(), id: null, depth: '', note: '' }
}

function newShot(): DraftShot {
  return { key: nextRowKey(), id: null, distance: '', azimuth: '', note: '' }
}

function toDraft(segment: Segment): Draft {
  return {
    number: segment.number,
    surveyDate: segment.surveyDate ?? '',
    name: segment.name ?? '',
    note: segment.note ?? '',
    stations: segment.stations.map((station) => ({
      key: nextRowKey(),
      id: station.id,
      depth: station.depth,
      note: station.note ?? '',
    })),
    shots: segment.shots.map((shot) => ({
      key: nextRowKey(),
      id: shot.id,
      distance: shot.distance,
      azimuth: shot.azimuth,
      note: shot.note ?? '',
    })),
  }
}

function toRequest(draft: Draft): SegmentRequest {
  return {
    surveyDate: draft.surveyDate,
    name: draft.name,
    note: draft.note,
    stations: draft.stations.map(({ id, depth, note }) => ({
      id,
      depth,
      note,
    })),
    shots: draft.shots.map(({ id, distance, azimuth, note }) => ({
      id,
      distance,
      azimuth,
      note,
    })),
  }
}

// Labels come from the API for saved rows, but rows are added before anything is saved, so while editing they're
// worked out from the segment's number and the row's position. Stations count from 0 and shots from 1.
function stationLabel(draft: Draft, index: number) {
  return `Station ${draft.number}.${index}`
}

function shotLabel(draft: Draft, index: number) {
  return `Shot ${draft.number}.${index + 1}`
}

// Station and shot labels share a width so their fields line up. A shot row is indented beside the line joining
// its two stations, which starts under the centre of each station's dot.
const dotSize = 16
const labelWidth = 120
const shotIndent = 32

function SegmentEntry({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    // Ignore a response that arrives after the user has left the page.
    let current = true

    async function load() {
      try {
        const segment = await getNewSegment(projectId)
        if (!current) {
          return
        }
        if (segment === null) {
          setNotFound(true)
        } else {
          setDraft(toDraft(segment))
        }
      } catch (error) {
        if (!current) {
          return
        }
        trackException(error, { operation: 'loadNewSegment' })
        setLoadError(describeFetchError(error, 'Unable to load the segment.'))
      } finally {
        if (current) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      current = false
    }
  }, [projectId])

  if (notFound) {
    return (
      <NotFoundPage message="That project doesn't exist. It may have been deleted." />
    )
  }

  function update(changes: Partial<Draft>) {
    setDraft((previous) => previous && { ...previous, ...changes })
  }

  function updateStation(index: number, changes: Partial<DraftStation>) {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          stations: previous.stations.map((station, i) =>
            i === index ? { ...station, ...changes } : station,
          ),
        },
    )
  }

  function updateShot(index: number, changes: Partial<DraftShot>) {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          shots: previous.shots.map((shot, i) =>
            i === index ? { ...shot, ...changes } : shot,
          ),
        },
    )
  }

  function addShotAndStation() {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          stations: [...previous.stations, newStation()],
          shots: [...previous.shots, newShot()],
        },
    )
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft === null) {
      return
    }

    setSaving(true)
    setSaveError('')

    try {
      await createSegment(projectId, toRequest(draft))
      trackEvent('SegmentCreated')
      void navigate(`/projects/${projectId}`)
    } catch (error) {
      // A rejected segment is the user's to fix, not a failure to report.
      if (!(error instanceof ApiError)) {
        trackException(error, { operation: 'saveSegment' })
      }
      setSaveError(describeFetchError(error, 'Unable to save segment.'))
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Button component={Link} to={`/projects/${projectId}`}>
          ← Back to project
        </Button>
      </Box>

      {loadError && <Alert severity="error">{loadError}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      ) : (
        draft && (
          <Paper component="section" elevation={2} sx={{ p: 3 }}>
            <Typography variant="h5" component="h2" sx={{ mb: 2 }}>
              Segment {draft.number}
            </Typography>
            {/* The API validates everything, so the browser doesn't. */}
            <Box
              component="form"
              noValidate
              onSubmit={(event) => void handleSubmit(event)}
              sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
            >
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  size="small"
                  type="date"
                  label="Survey date"
                  value={draft.surveyDate}
                  onChange={(event) =>
                    update({ surveyDate: event.target.value })
                  }
                  required
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Name"
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                size="small"
                label="Segment note"
                value={draft.note}
                onChange={(event) => update({ note: event.target.value })}
                multiline
                fullWidth
              />

              <Box>
                {draft.stations.map((station, index) => {
                  const shot = draft.shots.at(index)
                  return (
                    <Box key={station.key}>
                      <StationRow
                        label={stationLabel(draft, index)}
                        station={station}
                        onChange={(changes) => updateStation(index, changes)}
                      />
                      {shot && (
                        <ShotRow
                          label={shotLabel(draft, index)}
                          shot={shot}
                          onChange={(changes) => updateShot(index, changes)}
                        />
                      )}
                    </Box>
                  )
                })}
              </Box>
              <Box>
                <Button onClick={addShotAndStation}>
                  Add shot and station
                </Button>
              </Box>

              {saveError && <Alert severity="error">{saveError}</Alert>}
              <Box>
                <Button type="submit" variant="contained" disabled={saving}>
                  {saving ? 'Saving…' : 'Save segment'}
                </Button>
              </Box>
            </Box>
          </Paper>
        )
      )}
    </Stack>
  )
}

// Every field's accessible name includes the row's label, so a screen reader says which reading it's on.
function StationRow({
  label,
  station,
  onChange,
}: {
  label: string
  station: DraftStation
  onChange: (changes: Partial<DraftStation>) => void
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
        onChange={(event) => onChange({ depth: event.target.value })}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} depth (m)`,
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        size="small"
        label="Note"
        value={station.note}
        onChange={(event) => onChange({ note: event.target.value })}
        sx={{ flex: 1, minWidth: 160 }}
        slotProps={{ htmlInput: { 'aria-label': `${label} note` } }}
      />
    </Box>
  )
}

function ShotRow({
  label,
  shot,
  onChange,
}: {
  label: string
  shot: DraftShot
  onChange: (changes: Partial<DraftShot>) => void
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
        onChange={(event) => onChange({ distance: event.target.value })}
        sx={{ width: 130 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} distance (m)`,
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        size="small"
        label="Azimuth (°)"
        value={shot.azimuth}
        onChange={(event) => onChange({ azimuth: event.target.value })}
        sx={{ width: 110 }}
        slotProps={{
          htmlInput: {
            'aria-label': `${label} azimuth (°)`,
            inputMode: 'decimal',
          },
        }}
      />
      <TextField
        size="small"
        label="Note"
        value={shot.note}
        onChange={(event) => onChange({ note: event.target.value })}
        sx={{ flex: 1, minWidth: 160 }}
        slotProps={{ htmlInput: { 'aria-label': `${label} note` } }}
      />
    </Box>
  )
}

function SegmentEntryPage() {
  const projectId = parseId(useParams().id)
  if (projectId === null) {
    return <NotFoundPage />
  }
  // Keyed by id so moving between two projects' entry screens starts each one with fresh state.
  return <SegmentEntry key={projectId} projectId={projectId} />
}

export default SegmentEntryPage
