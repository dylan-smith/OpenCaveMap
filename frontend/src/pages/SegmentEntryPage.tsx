import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, RefCallback, SubmitEvent } from 'react'
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
  getSegment,
  getNewSegment,
  replaceSegment,
  segmentRejectedMessage,
  SegmentRejectedError,
} from '../api/segments'
import type { Segment, SegmentErrors, SegmentRequest } from '../api/segments'
import { trackEvent, trackException } from '../telemetry'
import NotFoundPage from './NotFoundPage'
import { parseId } from './parseId'
import { roundLength } from './readings'

// What the user has typed. Readings are kept as text, and read as numbers when the segment is saved. key identifies a
// row to React, since rows added here have no id until they're saved. shots[i] runs from stations[i] to
// stations[i + 1]. A saved row also keeps the depth or distance the API sent, which is shown rounded (see
// lengthToSend), and a row added here has null.
type DraftStation = {
  key: string
  id: number | null
  depth: string
  savedDepth: number | null
  note: string
}

type DraftShot = {
  key: string
  id: number | null
  distance: string
  savedDistance: number | null
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
  return { key: nextRowKey(), id: null, depth: '', savedDepth: null, note: '' }
}

function newShot(): DraftShot {
  return {
    key: nextRowKey(),
    id: null,
    distance: '',
    savedDistance: null,
    azimuth: '',
    note: '',
  }
}

// A reading is a plain decimal number. Spaces around it and zeros in front of it (045) are fine, and the decimal
// separator is a dot. Thousands separators, exponents and plus signs aren't numbers here. A minus sign is, so that the
// API can say what range the reading must be in.
const plainDecimal = /^-?(\d+(\.\d*)?|\.\d+)$/

// No reading is this long, and any number that fits is one the API can read.
const readingMaxLength = 20

// The number a reading's text stands for: null when nothing is typed, and NaN when what's typed isn't a number.
function readNumber(text: string) {
  const trimmed = text.trim()
  if (trimmed === '') {
    return null
  }
  return plainDecimal.test(trimmed) ? Number(trimmed) : Number.NaN
}

// An azimuth is shown as it comes, and a depth or distance rounded.
function readingText(reading: number | null) {
  return reading === null ? '' : String(reading)
}

function lengthText(length: number | null) {
  return length === null ? '' : String(roundLength(length))
}

// A depth or distance is shown rounded, so while it still reads as the number shown, the unrounded one the API sent
// goes back instead. Saving without changing a reading then leaves it exactly as stored.
function lengthToSend(text: string, saved: number | null) {
  const typed = readNumber(text)
  return saved !== null && typed === roundLength(saved) ? saved : typed
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
      depth: lengthText(station.depth),
      savedDepth: station.depth,
      note: station.note ?? '',
    })),
    shots: segment.shots.map((shot) => ({
      key: nextRowKey(),
      id: shot.id,
      distance: lengthText(shot.distance),
      savedDistance: shot.distance,
      azimuth: readingText(shot.azimuth),
      note: shot.note ?? '',
    })),
  }
}

// A reading that isn't a number (see unreadableReadings) is written to JSON as null, like one that's missing.
function toRequest(draft: Draft): SegmentRequest {
  return {
    surveyDate: draft.surveyDate === '' ? null : draft.surveyDate,
    name: draft.name,
    note: draft.note,
    stations: draft.stations.map(({ id, depth, savedDepth, note }) => ({
      id,
      depth: lengthToSend(depth, savedDepth),
      note,
    })),
    shots: draft.shots.map(
      ({ id, distance, savedDistance, azimuth, note }) => ({
        id,
        distance: lengthToSend(distance, savedDistance),
        azimuth: readNumber(azimuth),
        note,
      }),
    ),
  }
}

// The messages from a rejected save, placed on the screen. fields holds one message per field, keyed by surveyDate,
// name or note, or by a row's key and the field's name, so a message stays with the row it was reported for even if
// rows move. general holds the messages that aren't tied to one field.
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

// The API takes a reading as a number, so text that isn't one can't be sent, and the screen says so itself. This is
// the only thing about a reading the screen checks: whether it's missing or out of range is the API's to say. Returns
// null when every reading typed is a number.
function unreadableReadings(draft: Draft): Messages | null {
  const fields: Record<string, string> = {}
  function check(rowKey: string, field: string, name: string, text: string) {
    if (Number.isNaN(readNumber(text))) {
      fields[rowField(rowKey, field)] =
        `${name} must be a number, such as 12.5.`
    }
  }
  for (const station of draft.stations) {
    check(station.key, 'depth', 'Depth', station.depth)
  }
  for (const shot of draft.shots) {
    check(shot.key, 'distance', 'Distance', shot.distance)
    check(shot.key, 'azimuth', 'Azimuth', shot.azimuth)
  }
  return Object.keys(fields).length === 0 ? null : { fields, general: [] }
}

function fieldsToFix(count: number) {
  return count === 1 ? '1 field needs fixing.' : `${count} fields need fixing.`
}

// A label is the segment's number and the row's position, joined by a dot. Stations count from 0 and shots from 1.
function stationLabel(draft: Draft, index: number) {
  return `Station ${draft.number}.${index}`
}

function shotLabel(draft: Draft, index: number) {
  return `Shot ${draft.number}.${index + 1}`
}

// The readings in the order they're written on a slate: each station's depth, then the distance and azimuth of the
// shot leaving it. Enter moves along this order. Tab follows it too, because the notes are out of the Tab order.
function readingOrder(draft: Draft) {
  return draft.stations.flatMap((station, index) => {
    const shot = draft.shots.at(index)
    return shot
      ? [
          rowField(station.key, 'depth'),
          rowField(shot.key, 'distance'),
          rowField(shot.key, 'azimuth'),
        ]
      : [rowField(station.key, 'depth')]
  })
}

// Station and shot labels share a width so their fields line up. A shot row is indented beside the line joining
// its two stations, which starts under the centre of each station's dot.
const dotSize = 16
const labelWidth = 120
const shotIndent = 32

// Enters a new segment when segmentId is null, and otherwise corrects that saved segment.
function SegmentEntry({
  projectId,
  segmentId,
}: {
  projectId: number
  segmentId: number | null
}) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [messages, setMessages] = useState<Messages | null>(null)
  // The inputs of the rows' fields, keyed like their messages, so the keyboard can move between them.
  const inputs = useRef(new Map<string, HTMLInputElement>())
  // A field to move to once the render that adds it has happened.
  const pendingFocus = useRef<string | null>(null)

  useEffect(() => {
    if (pendingFocus.current !== null) {
      inputs.current.get(pendingFocus.current)?.focus()
      pendingFocus.current = null
    }
  })

  useEffect(() => {
    // Ignore a response that arrives after the user has left the page.
    let current = true

    async function load() {
      try {
        const segment =
          segmentId === null
            ? await getNewSegment(projectId)
            : await getSegment(projectId, segmentId)
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
        trackException(error, {
          operation: segmentId === null ? 'loadNewSegment' : 'loadSegment',
        })
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
  }, [projectId, segmentId])

  if (notFound) {
    return (
      <NotFoundPage
        message={
          segmentId === null
            ? "That project doesn't exist. It may have been deleted."
            : "That segment doesn't exist. It may have been deleted."
        }
      />
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

  // Returns the new shot, so the keyboard can move to it once it's on the screen.
  function addShotAndStation() {
    const station = newStation()
    const shot = newShot()
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          stations: [...previous.stations, station],
          shots: [...previous.shots, shot],
        },
    )
    return shot
  }

  function inputRef(field: string): RefCallback<HTMLInputElement> {
    return (input) => {
      if (input === null) {
        inputs.current.delete(field)
      } else {
        inputs.current.set(field, input)
      }
    }
  }

  // Moves to the reading after field and selects it, so typing replaces what's there. After the last station's
  // depth, that adds a shot and station and moves to the new shot's distance.
  function moveAfter(field: string) {
    if (draft === null) {
      return
    }
    const order = readingOrder(draft)
    const next = order.at(order.indexOf(field) + 1)
    if (next === undefined) {
      pendingFocus.current = rowField(addShotAndStation().key, 'distance')
    } else {
      const input = inputs.current.get(next)
      input?.focus()
      input?.select()
    }
  }

  // Enter in a reading moves to the next one rather than saving the segment. Alt+N moves to the row's note, with
  // the cursor after what's already there. It's matched by the key's position, since on a Mac Alt+N types a
  // character other than n.
  function handleReadingKeyDown(
    rowKey: string,
    field: string,
    event: KeyboardEvent,
  ) {
    if (event.key === 'Enter') {
      event.preventDefault()
      moveAfter(rowField(rowKey, field))
    } else if (event.altKey && event.code === 'KeyN') {
      event.preventDefault()
      const note = inputs.current.get(rowField(rowKey, 'note'))
      note?.focus()
      note?.setSelectionRange(note.value.length, note.value.length)
    }
  }

  // Enter in a note goes back to the readings, at the one after the note's row.
  function handleNoteKeyDown(lastReading: string, event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      moveAfter(lastReading)
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft === null) {
      return
    }

    // A reading that isn't a number can't be sent, so it gets its message here instead of from the API.
    const unreadable = unreadableReadings(draft)
    if (unreadable !== null) {
      setSaveError('')
      setMessages(unreadable)
      return
    }

    const sent = draft
    setSaving(true)
    setSaveError('')
    setMessages(null)

    try {
      if (segmentId === null) {
        await createSegment(projectId, toRequest(sent))
        trackEvent('SegmentCreated')
      } else {
        await replaceSegment(projectId, segmentId, toRequest(sent))
        trackEvent('SegmentUpdated')
      }
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
            {/* The API validates what's entered, so the browser doesn't. */}
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
                  slotProps={{
                    inputLabel: { shrink: true },
                    // The last date the API can read, which also keeps the year to four digits.
                    htmlInput: { max: '9999-12-31' },
                  }}
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
                        inputRef={(field) =>
                          inputRef(rowField(station.key, field))
                        }
                        onReadingKeyDown={(field, event) =>
                          handleReadingKeyDown(station.key, field, event)
                        }
                        onNoteKeyDown={(event) =>
                          handleNoteKeyDown(
                            rowField(station.key, 'depth'),
                            event,
                          )
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
                          inputRef={(field) =>
                            inputRef(rowField(shot.key, field))
                          }
                          onReadingKeyDown={(field, event) =>
                            handleReadingKeyDown(shot.key, field, event)
                          }
                          onNoteKeyDown={(event) =>
                            handleNoteKeyDown(
                              rowField(shot.key, 'azimuth'),
                              event,
                            )
                          }
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

function ShotRow({
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

// At /projects/:id/segments/new for a new segment, and /projects/:id/segments/:segmentId for a saved one.
function SegmentEntryPage() {
  const params = useParams()
  const projectId = parseId(params.id)
  const segmentId =
    params.segmentId === undefined ? null : parseId(params.segmentId)
  if (
    projectId === null ||
    (params.segmentId !== undefined && segmentId === null)
  ) {
    return <NotFoundPage />
  }
  // Keyed by the address so moving between two entry screens starts each one with fresh state.
  return (
    <SegmentEntry
      key={`${projectId}/${segmentId ?? 'new'}`}
      projectId={projectId}
      segmentId={segmentId}
    />
  )
}

export default SegmentEntryPage
