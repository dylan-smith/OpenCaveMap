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
import { trackEvent, trackException } from '../telemetry'
import NotFoundPage from './NotFoundPage'
import { parseId } from './parseId'
import { useReadingKeys } from './readingKeys'
import {
  fieldsToFix,
  newShot,
  newStation,
  placeMessages,
  rowField,
  shotLabel,
  stationLabel,
  toDraft,
  toRequest,
  unreadableReadings,
} from './segmentDraft'
import type { Draft, DraftShot, DraftStation, Messages } from './segmentDraft'
import { ShotRow, StationRow } from './SegmentRows'

function SegmentEntry({ projectId }: { projectId: number }) {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [messages, setMessages] = useState<Messages | null>(null)

  const { inputRef, handleReadingKeyDown, handleNoteKeyDown } = useReadingKeys(
    draft,
    addShotAndStation,
  )

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

function SegmentEntryPage() {
  const projectId = parseId(useParams().id)
  if (projectId === null) {
    return <NotFoundPage />
  }
  // Keyed by id so moving between two projects' entry screens starts each one with fresh state.
  return <SegmentEntry key={projectId} projectId={projectId} />
}

export default SegmentEntryPage
