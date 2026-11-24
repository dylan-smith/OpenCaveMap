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
import { describeFetchError } from '../api/projects'
import {
  createSegment,
  getNewSegment,
  segmentRejectedMessage,
  SegmentRejectedError,
} from '../api/segments'
import type { Segment, SegmentErrors, SegmentRequest } from '../api/segments'
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

// The API's messages from a rejected save, placed on the screen. fields holds one message per field, keyed by
// surveyDate, name or note, or by a row's key and the field's name, so a message stays with the row it was reported
// for even if rows move. general holds the messages that aren't tied to one field.
type Messages = {
  fields: Record<string, string>
  general: string[]
}

// The fields a message can be placed on.
const segmentFields = ['surveyDate', 'name', 'note']
const stationFields = ['depth', 'note']
const shotFields = ['distance', 'azimuth', 'note']

function rowField(rowKey: string, field: string) {
  return `${rowKey}.${field}`
}

// The API keys each message by the field's path in the request, such as stations[1].depth, so the row is found by
// its position in the draft that was sent. Returns null for a path with no field on the screen.
function fieldForPath(sent: Draft, path: string) {
  if (segmentFields.includes(path)) {
    return path
  }
  const match = /^(stations|shots)\[(\d+)\]\.(\w+)$/.exec(path)
  if (match === null) {
    return null
  }
  const [, rows, index, field] = match
  const row =
    rows === 'stations'
      ? sent.stations.at(Number(index))
      : sent.shots.at(Number(index))
  const fields = rows === 'stations' ? stationFields : shotFields
  return row && fields.includes(field) ? rowField(row.key, field) : null
}

function placeMessages(sent: Draft, errors: SegmentErrors): Messages {
  const fields: Record<string, string> = {}
  const general: string[] = []
  for (const [path, messages] of Object.entries(errors)) {
    const field = fieldForPath(sent, path)
    if (field === null) {
      general.push(...messages)
    } else {
      fields[field] = messages.join(' ')
    }
  }
  return { fields, general }
}

function fieldsToFix(count: number) {
  return count === 1 ? '1 field needs fixing.' : `${count} fields need fixing.`
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
  const [messages, setMessages] = useState<Messages | null>(null)

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

  // A field's message goes once the user changes that field. The summary goes with the last message.
  function clearMessages(fields: string[]) {
    setMessages((previous) => {
      if (
        previous === null ||
        !fields.some((field) => field in previous.fields)
      ) {
        return previous
      }
      const remaining = Object.fromEntries(
        Object.entries(previous.fields).filter(
          ([field]) => !fields.includes(field),
        ),
      )
      return Object.keys(remaining).length === 0 &&
        previous.general.length === 0
        ? null
        : { ...previous, fields: remaining }
    })
  }

  function update(changes: Partial<Draft>) {
    setDraft((previous) => previous && { ...previous, ...changes })
    clearMessages(Object.keys(changes))
  }

  function updateStation(key: string, changes: Partial<DraftStation>) {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          stations: previous.stations.map((station) =>
            station.key === key ? { ...station, ...changes } : station,
          ),
        },
    )
    clearMessages(Object.keys(changes).map((field) => rowField(key, field)))
  }

  function updateShot(key: string, changes: Partial<DraftShot>) {
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          shots: previous.shots.map((shot) =>
            shot.key === key ? { ...shot, ...changes } : shot,
          ),
        },
    )
    clearMessages(Object.keys(changes).map((field) => rowField(key, field)))
  }

  function message(field: string) {
    return messages?.fields[field]
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

    const sent = draft
    setSaving(true)
    setSaveError('')
    setMessages(null)

    try {
      await createSegment(projectId, toRequest(sent))
      trackEvent('SegmentCreated')
      void navigate(`/projects/${projectId}`)
    } catch (error) {
      // A rejected segment is the user's to fix, not a failure to report.
      if (error instanceof SegmentRejectedError) {
        setMessages(placeMessages(sent, error.errors))
      } else {
        trackException(error, { operation: 'saveSegment' })
        setSaveError(describeFetchError(error, 'Unable to save segment.'))
      }
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
                  error={Boolean(message('surveyDate'))}
                  helperText={message('surveyDate')}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  size="small"
                  label="Name"
                  value={draft.name}
                  onChange={(event) => update({ name: event.target.value })}
                  error={Boolean(message('name'))}
                  helperText={message('name')}
                  sx={{ flex: 1 }}
                />
              </Stack>
              <TextField
                size="small"
                label="Segment note"
                value={draft.note}
                onChange={(event) => update({ note: event.target.value })}
                error={Boolean(message('note'))}
                helperText={message('note')}
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
                        message={(field) =>
                          message(rowField(station.key, field))
                        }
                        onChange={(changes) =>
                          updateStation(station.key, changes)
                        }
                      />
                      {shot && (
                        <ShotRow
                          label={shotLabel(draft, index)}
                          shot={shot}
                          message={(field) =>
                            message(rowField(shot.key, field))
                          }
                          onChange={(changes) => updateShot(shot.key, changes)}
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

              {messages && (
                <Alert severity="error">
                  {segmentRejectedMessage}
                  {Object.keys(messages.fields).length > 0 &&
                    ` ${fieldsToFix(Object.keys(messages.fields).length)}`}
                  {messages.general.length > 0 && (
                    <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
                      {messages.general.map((text, index) => (
                        <li key={index}>{text}</li>
                      ))}
                    </Box>
                  )}
                </Alert>
              )}
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
  message,
  onChange,
}: {
  label: string
  station: DraftStation
  message: (field: 'depth' | 'note') => string | undefined
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
        error={Boolean(message('depth'))}
        helperText={message('depth')}
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
        error={Boolean(message('note'))}
        helperText={message('note')}
        sx={{ flex: 1, minWidth: 160 }}
        slotProps={{ htmlInput: { 'aria-label': `${label} note` } }}
      />
    </Box>
  )
}

function ShotRow({
  label,
  shot,
  message,
  onChange,
}: {
  label: string
  shot: DraftShot
  message: (field: 'distance' | 'azimuth' | 'note') => string | undefined
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
        error={Boolean(message('distance'))}
        helperText={message('distance')}
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
        error={Boolean(message('azimuth'))}
        helperText={message('azimuth')}
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
        error={Boolean(message('note'))}
        helperText={message('note')}
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
