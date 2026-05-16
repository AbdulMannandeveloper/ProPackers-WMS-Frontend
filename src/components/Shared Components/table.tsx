import type { ComponentPropsWithoutRef, Key, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import { Input } from './input'
import { Select } from './select'
import { Textarea } from './textarea'

import { cn } from '@/lib/utils'

type RowRecord = Record<string, unknown>

export type TableInputType = 'text' | 'number' | 'email' | 'password' | 'date' | 'datetime-local' | 'textarea' | 'select' | 'checkbox'

export interface TableOption {
  label: ReactNode
  value: string
  disabled?: boolean
}

export interface TableColumn<T extends RowRecord> {
  key: keyof T & string
  header: ReactNode
  editable?: boolean
  inputType?: TableInputType
  options?: TableOption[]
  placeholder?: string
  className?: string
  headerClassName?: string
  render?: (value: T[keyof T], row: T, rowIndex: number) => ReactNode
}

export interface EditableTableProps<T extends RowRecord> {
  data: T[]
  columns: Array<TableColumn<T>>
  rowKey: keyof T & string | ((row: T) => Key)
  allowRowEdit?: boolean
  emptyState?: ReactNode
  className?: string
  tableClassName?: string
  rowClassName?: (row: T, isEditing: boolean) => string
  onRowsChange?: (rows: T[]) => void
  onRowSave?: (row: T, rowIndex: number) => void
  onRowDelete?: (row: T, rowIndex: number) => void
}

function resolveRowKey<T extends RowRecord>(row: T, rowKey: keyof T & string | ((row: T) => Key)): Key {
  return typeof rowKey === 'function' ? rowKey(row) : String(row[rowKey] ?? '')
}

function toEditableValue(value: unknown, inputType?: TableInputType): string | number | boolean {
  if (inputType === 'checkbox') {
    return Boolean(value)
  }

  if (inputType === 'number') {
    if (typeof value === 'number') {
      return value
    }

    const parsed = Number(value ?? '')
    return Number.isNaN(parsed) ? 0 : parsed
  }

  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
}

function formatValue(value: unknown): ReactNode {
  if (value === null || value === undefined || value === '') {
    return '—'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  return String(value)
}

function EditableTable<T extends RowRecord>({
  data,
  columns,
  rowKey,
  allowRowEdit = true,
  emptyState = 'No data available.',
  className,
  tableClassName,
  rowClassName,
  onRowsChange,
  onRowSave,
  onRowDelete,
}: EditableTableProps<T>) {
  const [rows, setRows] = useState<T[]>(data)
  const [editingRowKey, setEditingRowKey] = useState<Key | null>(null)
  const [draftRow, setDraftRow] = useState<T | null>(null)

  useEffect(() => {
    setRows(data)
  }, [data])

  const hasActions = allowRowEdit || Boolean(onRowDelete)

  const editingRowIndex = useMemo(() => {
    if (editingRowKey === null) {
      return -1
    }

    return rows.findIndex((row) => resolveRowKey(row, rowKey) === editingRowKey)
  }, [editingRowKey, rowKey, rows])

  const beginEdit = (row: T) => {
    if (!allowRowEdit) {
      return
    }

    setEditingRowKey(resolveRowKey(row, rowKey))
    setDraftRow(structuredClone(row))
  }

  const cancelEdit = () => {
    setEditingRowKey(null)
    setDraftRow(null)
  }

  const updateDraft = (columnKey: keyof T & string, nextValue: string | number | boolean) => {
    if (!draftRow) {
      return
    }

    setDraftRow({
      ...draftRow,
      [columnKey]: nextValue,
    })
  }

  const saveDraft = () => {
    if (!draftRow || editingRowIndex < 0) {
      return
    }

    const nextRows = rows.map((row, index) => (index === editingRowIndex ? draftRow : row))
    setRows(nextRows)
    onRowsChange?.(nextRows)
    onRowSave?.(draftRow, editingRowIndex)
    cancelEdit()
  }

  const deleteRow = (row: T, index: number) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index)
    setRows(nextRows)
    onRowsChange?.(nextRows)
    onRowDelete?.(row, index)
    if (editingRowIndex === index) {
      cancelEdit()
    }
  }

  return (
    <div className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}>
      <div className={cn('overflow-x-auto', tableClassName)}>
        <table className='min-w-full border-separate border-spacing-0 text-sm'>
          <thead className='bg-muted/60 text-muted-foreground'>
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    'border-b border-border px-4 py-3 text-left font-medium first:pl-5 last:pr-5',
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}

              {hasActions ? <th className='border-b border-border px-4 py-3 text-right font-medium last:pr-5'>Actions</th> : null}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (hasActions ? 1 : 0)} className='px-5 py-10 text-center text-muted-foreground'>
                  {emptyState}
                </td>
              </tr>
            ) : null}

            {rows.map((row, rowIndex) => {
              const currentRowKey = resolveRowKey(row, rowKey)
              const isEditing = currentRowKey === editingRowKey
              const activeRow = isEditing && draftRow ? draftRow : row

              return (
                <tr
                  key={String(currentRowKey)}
                  onDoubleClick={() => beginEdit(row)}
                  className={cn(
                    'border-b border-border transition-colors last:border-b-0',
                    allowRowEdit ? 'cursor-pointer hover:bg-muted/40' : '',
                    rowClassName?.(row, isEditing),
                  )}
                >
                  {columns.map((column) => {
                    const cellValue = activeRow[column.key]
                    const isEditable = Boolean(column.editable ?? true)

                    return (
                      <td key={column.key} className={cn('border-b border-border px-4 py-3 align-top first:pl-5 last:pr-5', column.className)}>
                        {isEditing && isEditable ? (
                          column.inputType === 'textarea' ? (
                            <Textarea
                              className='min-h-20 rounded-xl'
                              value={String(toEditableValue(cellValue, column.inputType))}
                              placeholder={column.placeholder}
                              onChange={(event) => updateDraft(column.key, event.target.value)}
                            />
                          ) : column.inputType === 'select' ? (
                            <Select
                              value={String(toEditableValue(cellValue, column.inputType))}
                              options={column.options}
                              placeholder={column.placeholder}
                              onChange={(event) => updateDraft(column.key, event.target.value)}
                            />
                          ) : column.inputType === 'checkbox' ? (
                            <label className='inline-flex items-center gap-2'>
                              <input
                                type='checkbox'
                                checked={Boolean(toEditableValue(cellValue, column.inputType))}
                                onChange={(event) => updateDraft(column.key, event.target.checked)}
                                className='h-4 w-4 rounded border-border accent-primary'
                              />
                              <span className='text-sm text-muted-foreground'>Enabled</span>
                            </label>
                          ) : (
                            <Input
                              type={column.inputType ?? 'text'}
                              value={String(toEditableValue(cellValue, column.inputType))}
                              placeholder={column.placeholder}
                              onChange={(event) => {
                                const nextValue = column.inputType === 'number'
                                  ? (event.target.value === '' ? 0 : Number(event.target.value))
                                  : event.target.value
                                updateDraft(column.key, nextValue)
                              }}
                            />
                          )
                        ) : column.render ? (
                          column.render(cellValue as T[keyof T], row, rowIndex)
                        ) : (
                          formatValue(cellValue)
                        )}
                      </td>
                    )
                  })}

                  {hasActions ? (
                    <td className='border-b border-border px-4 py-3 text-right align-top last:pr-5'>
                      <div className='inline-flex items-center gap-2'>
                        {isEditing ? (
                          <>
                            <Button type='button' size='sm' onClick={saveDraft}>
                              Save
                            </Button>
                            <Button type='button' variant='outline' size='sm' onClick={cancelEdit}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            {allowRowEdit ? (
                              <Button type='button' variant='ghost' size='sm' onClick={() => beginEdit(row)}>
                                Edit
                              </Button>
                            ) : null}

                            {onRowDelete ? (
                              <Button type='button' variant='destructive' size='sm' onClick={() => deleteRow(row, rowIndex)}>
                                Delete
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Table({ className, ...props }: ComponentPropsWithoutRef<'table'>) {
  return <table className={cn('min-w-full text-sm', className)} {...props} />
}

export { Table, EditableTable }