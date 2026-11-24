// PROTOTYPE: throwaway. Variant B: the conventional grid, one row per station with the shot leaving it.
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { SEGMENT_NUMBER } from './draft'
import type { Draft } from './draft'
import { NoteField, NumField } from './fields'

export const name = 'Classic grid'

export function VariantB({ d }: { d: Draft }) {
  const { seg } = d
  return (
    <>
      <Table size="small" sx={{ '& td, & th': { px: 0.5 } }}>
        <TableHead>
          <TableRow>
            <TableCell>Station</TableCell>
            <TableCell>Depth</TableCell>
            <TableCell>Station note</TableCell>
            <TableCell>Shot</TableCell>
            <TableCell>Distance</TableCell>
            <TableCell>Azimuth</TableCell>
            <TableCell>Shot note</TableCell>
            <TableCell />
          </TableRow>
        </TableHead>
        <TableBody>
          {seg.stations.map((station, i) => {
            const shot = seg.shots.at(i)
            const shotSx = shot?.review ? { bgcolor: '#fff4e5' } : {}
            return (
              <TableRow key={station.id}>
                <TableCell>
                  {SEGMENT_NUMBER}.{i}
                </TableCell>
                <TableCell>
                  <NumField
                    d={d}
                    label={d.unitLabel}
                    dataKey={`d-${station.id}`}
                    noteKey={`dn-${station.id}`}
                    value={station.depth.text}
                    onChange={(text) => d.setDepth(station.id, text)}
                    width={80}
                  />
                </TableCell>
                <TableCell>
                  <NoteField
                    d={d}
                    dataKey={`dn-${station.id}`}
                    rowKey={`d-${station.id}`}
                    value={station.note}
                    onChange={(text) => d.setStationNote(station.id, text)}
                  />
                </TableCell>
                {shot ? (
                  <>
                    <TableCell sx={shotSx}>
                      {SEGMENT_NUMBER}.{i + 1}
                      {shot.review && (
                        <Button
                          size="small"
                          tabIndex={-1}
                          title="This shot now joins different stations. Click if its numbers are right."
                          onClick={() => d.clearReview(shot.id)}
                          sx={{ minWidth: 0 }}
                        >
                          ⚠
                        </Button>
                      )}
                    </TableCell>
                    <TableCell sx={shotSx}>
                      <NumField
                        d={d}
                        label={d.unitLabel}
                        dataKey={`l-${shot.id}`}
                        noteKey={`ln-${shot.id}`}
                        value={shot.distance.text}
                        onChange={(text) => d.setDistance(shot.id, text)}
                        width={80}
                      />
                    </TableCell>
                    <TableCell sx={shotSx}>
                      <NumField
                        d={d}
                        label="°"
                        dataKey={`a-${shot.id}`}
                        noteKey={`ln-${shot.id}`}
                        value={shot.azimuth}
                        onChange={(text) => d.setAzimuth(shot.id, text)}
                        width={80}
                      />
                    </TableCell>
                    <TableCell sx={shotSx}>
                      <NoteField
                        d={d}
                        dataKey={`ln-${shot.id}`}
                        rowKey={`a-${shot.id}`}
                        value={shot.note}
                        onChange={(text) => d.setShotNote(shot.id, text)}
                      />
                    </TableCell>
                  </>
                ) : (
                  <TableCell colSpan={4} />
                )}
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  <Button
                    size="small"
                    tabIndex={-1}
                    title="Insert a station after this one"
                    onClick={() => d.insertAfter(i)}
                    sx={{ minWidth: 0 }}
                  >
                    +
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
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Button sx={{ mt: 1 }} onClick={() => d.addAtEnd()}>
        + Add row
      </Button>
    </>
  )
}
