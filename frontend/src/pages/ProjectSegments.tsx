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
import Typography from '@mui/material/Typography'
import { Link } from 'react-router'
import { describeFetchError } from '../api/projects'
import { listSegments } from '../api/segments'
import type { SegmentSummary } from '../api/segments'
import { trackException } from '../telemetry'
import { roundLength } from './readings'

// The segments section of a project page: the list, and the way to add one.
function ProjectSegments({ projectId }: { projectId: number }) {
  const [segments, setSegments] = useState<SegmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    // Ignore a response that arrives after the user has left the page.
    let current = true

    async function load() {
      try {
        const loaded = await listSegments(projectId)
        if (current) {
          setSegments(loaded)
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
  }, [projectId])

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
                    secondary={`${segment.surveyDate} · ${segment.stationCount} stations · ${roundLength(segment.totalLength)} m`}
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
