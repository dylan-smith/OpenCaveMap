import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { describeFetchError, lengthUnit, updateProject } from '../api/projects'
import type { Project, UnitSystem } from '../api/projects'
import { listSegments } from '../api/segments'
import type { SegmentSummary } from '../api/segments'
import { trackEvent, trackException } from '../telemetry'

// The segments section of a project page: the list, the way to add one, and the project's unit system. onProjectChange
// gets the project once a new unit system is saved, and the list then reloads in it.
function ProjectSegments({
  project,
  onProjectChange,
}: {
  project: Project
  onProjectChange: (project: Project) => void
}) {
  const projectId = project.id
  const [segments, setSegments] = useState<SegmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [changingUnitSystem, setChangingUnitSystem] = useState(false)
  const [unitSystemError, setUnitSystemError] = useState('')

  useEffect(() => {
    // Ignore a response that arrives after the user has left the page.
    let current = true

    async function load() {
      try {
        const loaded = await listSegments(projectId)
        if (current) {
          setSegments(loaded)
          setErrorMessage('')
        }
      } catch (error) {
        if (!current) {
          return
        }
        trackException(error, { operation: 'loadSegments' })
        setErrorMessage(describeFetchError(error, 'Unable to load segments.'))
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
  }, [projectId, project.unitSystem])

  // Saved straight away. The project's saved name goes with it, not whatever is in the rename field.
  async function changeUnitSystem(unitSystem: UnitSystem | null) {
    // The group passes null when its pressed button is clicked again.
    if (unitSystem === null || unitSystem === project.unitSystem) {
      return
    }

    setChangingUnitSystem(true)
    setUnitSystemError('')

    try {
      const saved = await updateProject(projectId, project.name, unitSystem)
      trackEvent('ProjectUnitSystemChanged', { unitSystem })
      setLoading(true)
      onProjectChange(saved)
    } catch (error) {
      trackException(error, { operation: 'saveUnitSystem' })
      setUnitSystemError(
        describeFetchError(error, 'Unable to change the unit system.'),
      )
    } finally {
      setChangingUnitSystem(false)
    }
  }

  return (
    <Paper
      component="section"
      elevation={2}
      sx={{ p: 3 }}
      aria-labelledby="segments-heading"
    >
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}
      >
        <Typography variant="h6" component="h3" id="segments-heading">
          Segments
        </Typography>
        <Button
          component={Link}
          to={`/projects/${projectId}/segments/new`}
          variant="contained"
        >
          Add segment
        </Button>
      </Stack>

      <ToggleButtonGroup
        exclusive
        size="small"
        aria-label="Unit system"
        value={project.unitSystem}
        disabled={changingUnitSystem}
        onChange={(_event, value: UnitSystem | null) =>
          void changeUnitSystem(value)
        }
        sx={{ mb: 1 }}
      >
        <ToggleButton value="metric">Metric</ToggleButton>
        <ToggleButton value="imperial">Imperial</ToggleButton>
      </ToggleButtonGroup>

      {unitSystemError && <Alert severity="error">{unitSystemError}</Alert>}
      {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      ) : (
        !errorMessage &&
        (segments.length === 0 ? (
          <Typography color="text.secondary">No segments yet.</Typography>
        ) : (
          <List aria-labelledby="segments-heading">
            {segments.map((segment) => (
              <ListItem key={segment.id} divider disablePadding>
                <ListItemButton
                  component={Link}
                  to={`/projects/${projectId}/segments/${segment.id}`}
                >
                  <ListItemText
                    primary={
                      segment.name === null
                        ? `Segment ${segment.number}`
                        : `Segment ${segment.number} · ${segment.name}`
                    }
                    secondary={`${segment.surveyDate} · ${segment.stationCount} stations · ${segment.totalLength} ${lengthUnit(segment.unitSystem)}`}
                    slotProps={{
                      primary: { sx: { overflowWrap: 'anywhere' } },
                    }}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        ))
      )}
    </Paper>
  )
}

export default ProjectSegments
