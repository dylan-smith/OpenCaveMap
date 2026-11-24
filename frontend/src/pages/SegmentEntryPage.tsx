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
import { describeFetchError, lengthUnit } from '../api/projects'
import {
  createSegment,
  deleteSegment,
  getSegment,
  getNewSegment,
  replaceSegment,
  segmentRejectedMessage,
  SegmentRejectedError,
} from '../api/segments'
import { trackEvent, trackException } from '../telemetry'
import LeaveDialog from './LeaveDialog'
import { useLeaveWarning } from './leaveWarning'
import NotFoundPage from './NotFoundPage'
import { parseId } from './parseId'
import { useReadingKeys } from './readingKeys'
import {
  comparisonText,
  fieldsToFix,
  insertStationAfter,
  newShot,
  newStation,
  placeMessages,
  removeStationAt,
  rowField,
  shotFields,
  shotLabel,
  shotRemovedWith,
  shotsToCheck,
  stationFields,
  stationLabel,
  toDraft,
  toRequest,
  unreadableReadings,
} from './segmentDraft'
import type { Draft, DraftShot, DraftStation, Messages } from './segmentDraft'
import { ShotRow, StationRow } from './SegmentRows'

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
  // The entries as the screen opened with them, to tell whether there are unsaved changes.
  const [openedEntries, setOpenedEntries] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const [messages, setMessages] = useState<Messages | null>(null)
  // Set when a save is refused because shots are flagged. Its message shows until none are.
  const [reviewRefused, setReviewRefused] = useState(false)

  const { inputRef, focusOnceShown, handleReadingKeyDown, handleNoteKeyDown } =
    useReadingKeys(draft, addShotAndStation)

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
          const opened = toDraft(segment)
          setDraft(opened)
          setOpenedEntries(comparisonText(opened))
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

  // Changing an entry and changing it back counts as no change.
  const changed = draft !== null && comparisonText(draft) !== openedEntries
  const leaveWarning = useLeaveWarning(changed)

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

  // Editing a flagged shot's distance or azimuth deals with the flag, as confirming it does.
  function updateShot(key: string, changes: Partial<DraftShot>) {
    const reviewed =
      'distance' in changes || 'azimuth' in changes ? { review: false } : {}
    setDraft(
      (previous) =>
        previous && {
          ...previous,
          shots: previous.shots.map((shot) =>
            shot.key === key ? { ...shot, ...changes, ...reviewed } : shot,
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

  // Moves to the new shot's distance, where the surveyor types next.
  function insertAfter(stationKey: string) {
    const station = newStation()
    const shot = newShot()
    setDraft((previous) => {
      if (previous === null) {
        return previous
      }
      const index = previous.stations.findIndex((row) => row.key === stationKey)
      return insertStationAfter(previous, index, station, shot)
    })
    setReviewRefused(false)
    focusOnceShown(rowField(shot.key, 'distance'))
  }

  // The removed rows' messages go with them. The control that had focus goes too, so focus moves to the depth of
  // the station before the removed one, or of the new first station.
  function removeStation(stationKey: string) {
    if (draft === null || draft.stations.length <= 2) {
      return
    }
    const index = draft.stations.findIndex((row) => row.key === stationKey)
    const shot = shotRemovedWith(draft, index)
    setDraft((previous) => previous && removeStationAt(previous, index))
    clearMessages([
      ...stationFields.map((field) => rowField(stationKey, field)),
      ...(shot ? shotFields.map((field) => rowField(shot.key, field)) : []),
    ])
    setReviewRefused(false)
    const focusStation = draft.stations[index === 0 ? 1 : index - 1]
    focusOnceShown(rowField(focusStation.key, 'depth'))
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (draft === null) {
      return
    }

    // Whether a flagged shot is right is known only to this editing session, so the screen checks this, not the API.
    if (draft.shots.some((shot) => shot.review)) {
      setReviewRefused(true)
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
      leaveWarning.allowLeaving()
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

  // Acts straight away, like deleting a project. Only a saved segment can be deleted.
  async function handleDelete(id: number) {
    setDeleting(true)
    setDeleteError('')

    try {
      await deleteSegment(projectId, id)
      trackEvent('SegmentDeleted')
      leaveWarning.allowLeaving()
      void navigate(`/projects/${projectId}`)
    } catch (error) {
      trackException(error, { operation: 'deleteSegment' })
      setDeleteError(describeFetchError(error, 'Unable to delete segment.'))
      setDeleting(false)
    }
  }

  const busy = saving || deleting
  const flagged = draft?.shots.filter((shot) => shot.review).length ?? 0

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
                        unit={lengthUnit(draft.unitSystem)}
                        station={station}
                        canRemove={draft.stations.length > 2}
                        onInsertAfter={() => insertAfter(station.key)}
                        onRemove={() => removeStation(station.key)}
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
                          unit={lengthUnit(draft.unitSystem)}
                          shot={shot}
                          message={(field) =>
                            message(rowField(shot.key, field))
                          }
                          onChange={(changes) => updateShot(shot.key, changes)}
                          onConfirm={() =>
                            updateShot(shot.key, { review: false })
                          }
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
              {reviewRefused && flagged > 0 && (
                <Alert severity="error">
                  This segment can&apos;t be saved until its flagged shots are
                  checked. {shotsToCheck(flagged)}
                </Alert>
              )}
              {saveError && <Alert severity="error">{saveError}</Alert>}
              {deleteError && <Alert severity="error">{deleteError}</Alert>}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Button type="submit" variant="contained" disabled={busy}>
                  {saving ? 'Saving…' : 'Save segment'}
                </Button>
                {/* type="button", so Enter in a field never deletes. */}
                {segmentId !== null && (
                  <Button
                    type="button"
                    color="error"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void handleDelete(segmentId)}
                  >
                    {deleting ? 'Deleting…' : 'Delete segment'}
                  </Button>
                )}
              </Stack>
            </Box>
          </Paper>
        )
      )}
      <LeaveDialog {...leaveWarning.dialog} />
    </Stack>
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
