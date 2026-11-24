// PROTOTYPE: throwaway. The two input boxes the form-style variants share.
import TextField from '@mui/material/TextField'
import type { Draft } from './draft'

export function NumField(props: {
  d: Draft
  label: string
  dataKey: string
  noteKey: string
  value: string
  onChange: (text: string) => void
  width?: number
}) {
  const error = props.d.errors[props.dataKey]
  return (
    <TextField
      size="small"
      label={props.label}
      value={props.value}
      error={Boolean(error)}
      helperText={error}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={props.d.onNumKeyDown}
      sx={{ width: props.width ?? 130, flexShrink: 0 }}
      slotProps={{
        htmlInput: {
          inputMode: 'decimal',
          'data-num': '',
          'data-key': props.dataKey,
          'data-note': props.noteKey,
        },
      }}
    />
  )
}

export function NoteField(props: {
  d: Draft
  dataKey: string
  /** The last number field on this note's row; Enter carries on from there. */
  rowKey: string
  value: string
  onChange: (text: string) => void
}) {
  return (
    <TextField
      size="small"
      label="Note"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={props.d.onNoteKeyDown}
      sx={{ flex: 1, minWidth: 120 }}
      slotProps={{
        htmlInput: {
          tabIndex: -1,
          'data-key': props.dataKey,
          'data-row': props.rowKey,
        },
      }}
    />
  )
}
