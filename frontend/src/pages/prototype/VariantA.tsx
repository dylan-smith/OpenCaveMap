// PROTOTYPE: throwaway. Variant A: one vertical sequence alternating station and shot.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { SEGMENT_NUMBER } from './draft'
import type { Draft } from './draft'
import { NoteField, NumField } from './fields'

export const name = 'Alternating sequence'

const LABEL_WIDTH = 120

export function VariantA({ d }: { d: Draft }) {
  const { seg } = d
  return (
    <Box>
      {seg.stations.map((station, i) => {
        const shot = seg.shots.at(i)
        return (
          <Box key={station.id}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <Typography
                sx={{ width: LABEL_WIDTH, pt: 1, fontWeight: 700 }}
                noWrap
              >
                ● Station {SEGMENT_NUMBER}.{i}
              </Typography>
              <NumField
                d={d}
                label={`Depth (${d.unitLabel})`}
                dataKey={`d-${station.id}`}
                noteKey={`dn-${station.id}`}
                value={station.depth.text}
                onChange={(text) => d.setDepth(station.id, text)}
              />
              <NoteField
                d={d}
                dataKey={`dn-${station.id}`}
                rowKey={`d-${station.id}`}
                value={station.note}
                onChange={(text) => d.setStationNote(station.id, text)}
              />
              <Button
                size="small"
                tabIndex={-1}
                title="Insert a station after this one"
                onClick={() => d.insertAfter(i)}
                sx={{ minWidth: 0, whiteSpace: 'nowrap' }}
              >
                + after
              </Button>
              <Button
                size="small"
                color="error"
                tabIndex={-1}
                title="Remove this station and the shot arriving at it"
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
                  ml: '7px',
                  pl: 3,
                  py: 1.5,
                  borderLeft: '2px solid',
                  borderColor: shot.review ? 'warning.main' : 'divider',
                  bgcolor: shot.review ? '#fff4e5' : undefined,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Typography
                    color="text.secondary"
                    sx={{ width: LABEL_WIDTH - 32, pt: 1 }}
                    noWrap
                  >
                    Shot {SEGMENT_NUMBER}.{i + 1}
                  </Typography>
                  <NumField
                    d={d}
                    label={`Distance (${d.unitLabel})`}
                    dataKey={`l-${shot.id}`}
                    noteKey={`ln-${shot.id}`}
                    value={shot.distance.text}
                    onChange={(text) => d.setDistance(shot.id, text)}
                  />
                  <NumField
                    d={d}
                    label="Azimuth (°)"
                    dataKey={`a-${shot.id}`}
                    noteKey={`ln-${shot.id}`}
                    value={shot.azimuth}
                    onChange={(text) => d.setAzimuth(shot.id, text)}
                    width={110}
                  />
                  <NoteField
                    d={d}
                    dataKey={`ln-${shot.id}`}
                    rowKey={`a-${shot.id}`}
                    value={shot.note}
                    onChange={(text) => d.setShotNote(shot.id, text)}
                  />
                </Box>
                {shot.review && (
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    This shot now joins different stations. Check its distance
                    and azimuth.{' '}
                    <Button
                      size="small"
                      tabIndex={-1}
                      onClick={() => d.clearReview(shot.id)}
                    >
                      They&apos;re right
                    </Button>
                  </Typography>
                )}
              </Box>
            )}
          </Box>
        )
      })}
      <Button sx={{ mt: 1 }} onClick={() => d.addAtEnd()}>
        + Add shot and station
      </Button>
    </Box>
  )
}
