import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Pencil } from 'lucide-react'

import { employees as apiEmployees } from '@/api'
import type { Employee } from '@/api/types'
import { Button, Input, Modal } from '@/components/Shared Components'
import { useFeedback } from '@/hooks/useFeedback'

/**
 * Employment records.
 *
 * This tab used to list staff and offer a create form — and creating became
 * redundant once the Users page started making the employee profile itself, so
 * it did nothing the Users page did not. Meanwhile the Employee row carries job
 * title, National Insurance number, date of birth, wage rate and address, and
 * there was no endpoint that could write any of them, so those columns could
 * never be filled in.
 *
 * So this is now where employment details live. Creating an account stays on
 * Users, where it belongs; base salary stays on Payroll, which owns it and
 * multiplies it into net pay.
 */

type Draft = {
  jobTitle: string
  nationalInsuranceNumber: string
  dateOfBirth: string
  wageRate: string
  address: string
}

const EMPTY_DRAFT: Draft = {
  jobTitle: '',
  nationalInsuranceNumber: '',
  dateOfBirth: '',
  wageRate: '',
  address: '',
}

const nameOf = (e: Employee) =>
  [e.user?.firstName, e.user?.lastName].filter(Boolean).join(' ') || 'Unnamed'

/** An ISO timestamp trimmed to the yyyy-mm-dd a date input expects. */
const toDateInput = (value?: string | null) => (value ? String(value).slice(0, 10) : '')

const money = (value?: number | string | null) =>
  value === null || value === undefined || value === ''
    ? null
    : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value))

export default function EmployeeList() {
  const { dialog, showError, showSuccess } = useFeedback()

  const [items, setItems] = useState<Employee[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<Employee | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiEmployees.getAllEmployees()
      setItems(Array.isArray(data) ? data : [])
    } catch (err) {
      // Was a silent catch that left an empty list looking like "no staff".
      showError(err, 'Could not load the employee list')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return items
    return items.filter((e) =>
      [nameOf(e), e.user?.email, e.jobTitle, e.employeeUniqueNumber]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(needle))
    )
  }, [items, search])

  const openEdit = (employee: Employee) => {
    setEditing(employee)
    setDraft({
      jobTitle: employee.jobTitle ?? '',
      nationalInsuranceNumber: employee.nationalInsuranceNumber ?? '',
      dateOfBirth: toDateInput(employee.dateOfBirth),
      wageRate: employee.wageRate != null ? String(employee.wageRate) : '',
      address: employee.address ?? '',
    })
  }

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!editing) return

    setSaving(true)
    try {
      // Blanks are sent as empty strings, which the server reads as "clear this"
      // rather than storing an empty value — an emptied NI number would
      // otherwise collide with the next one on a unique index.
      await apiEmployees.updateEmployee(editing.id, {
        jobTitle: draft.jobTitle,
        nationalInsuranceNumber: draft.nationalInsuranceNumber,
        dateOfBirth: draft.dateOfBirth || null,
        wageRate: draft.wageRate === '' ? null : draft.wageRate,
        address: draft.address,
      })
      showSuccess(`${nameOf(editing)}'s record has been updated.`)
      setEditing(null)
      await load()
    } catch (err) {
      showError(err, 'Could not save this employment record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Employment records
            </h2>
            <p className="text-sm text-slate-500">
              Job titles, wage rates and personal details for your staff.{' '}
              {/* Creating an account is a different job, and doing it in two
                  places is how the two drift apart. */}
              <Link to="/app/users" className="text-cyan-600 hover:underline">
                Add a new employee from Users
              </Link>
              .
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email or job title"
              aria-label="Search employees"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Employee</th>
                <th className="px-4 py-3 font-semibold">Job title</th>
                <th className="px-4 py-3 font-semibold">Number</th>
                <th className="px-4 py-3 font-semibold text-right">Wage rate</th>
                <th className="px-4 py-3 font-semibold text-right">Base salary</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    {items.length === 0
                      ? 'No employees yet. Add one from the Users page.'
                      : 'No employees match that search.'}
                  </td>
                </tr>
              ) : (
                visible.map((employee) => (
                  <tr key={employee.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 dark:text-slate-200">
                        {nameOf(employee)}
                      </div>
                      <div className="text-xs text-slate-400">
                        {employee.user?.email ?? '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {employee.jobTitle || (
                        <span className="text-slate-300 italic">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {employee.employeeUniqueNumber}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {money(employee.wageRate) ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {/* Shown where you would look for it, editable where it
                          belongs. Two screens writing one figure is how they
                          end up disagreeing. */}
                      {money(employee.baseSalary) ?? <span className="text-slate-300">—</span>}
                      <Link
                        to="/app/payroll"
                        className="block text-[11px] font-normal text-cyan-600 hover:underline"
                      >
                        set in Payroll
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(employee)}>
                        <Pencil size={14} className="mr-1" />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `${nameOf(editing)} — employment record` : ''}
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Job title
              </label>
              <Input
                value={draft.jobTitle}
                onChange={(e) => setDraft({ ...draft, jobTitle: e.target.value })}
                placeholder="e.g. Warehouse Operative"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Wage rate (£ per hour)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.wageRate}
                onChange={(e) => setDraft({ ...draft, wageRate: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                National Insurance number
              </label>
              <Input
                value={draft.nationalInsuranceNumber}
                onChange={(e) =>
                  setDraft({ ...draft, nationalInsuranceNumber: e.target.value })
                }
                placeholder="QQ123456C"
                className="font-mono"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Date of birth
              </label>
              <Input
                type="date"
                value={draft.dateOfBirth}
                onChange={(e) => setDraft({ ...draft, dateOfBirth: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Address
            </label>
            <Input
              value={draft.address}
              onChange={(e) => setDraft({ ...draft, address: e.target.value })}
              placeholder="Home address"
            />
          </div>

          <p className="text-xs text-slate-400">
            Leave a field blank to clear it. Base salary is set on the Payroll
            page, which is what pay runs are calculated from.
          </p>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </Modal>

      {dialog}
    </>
  )
}
