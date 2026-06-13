import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import { attendance as api, users as usersApi, shifts as shiftsApi } from '@/api'
import type { AttendanceLog } from '@/api/attendance'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Input, Select, Modal } from '@/components/Shared Components'

export default function AttendancePage() {
  const role = useAuthStore((s) => s.role)
  const currentUserId = useAuthStore((s) => s.userId)
  const displayName = useAuthStore((s) => s.displayName) ?? 'Workspace User'
  
  const isAdmin = role === 'admin'

  // Common State
  const [logs, setLogs] = useState<AttendanceLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Admin Specific State
  const [users, setUsers] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [editingLog, setEditingLog] = useState<AttendanceLog | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  
  // Shift Settings State
  const [defaultShift, setDefaultShift] = useState<any>(null)
  const [graceMinutes, setGraceMinutes] = useState(10)
  const [showSettings, setShowSettings] = useState(false)
  const [shiftSaving, setShiftSaving] = useState(false)
  const [shiftStartTime, setShiftStartTime] = useState('08:00')
  const [shiftEndTime, setShiftEndTime] = useState('17:00')


  // Edit Form Fields
  const [editLogin, setEditLogin] = useState('')
  const [editLogout, setEditLogout] = useState('')
  const [editStatus, setEditStatus] = useState('on-time')
  const [editDate, setEditDate] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Employee Specific State
  const [clocking, setClocking] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError('')
    try {
      if (isAdmin) {
        const [logsData, usersData, shiftsData] = await Promise.all([
          api.getAllAttendanceLogs(),
          usersApi.getAllUsers(),
          shiftsApi.getAllShifts(),
        ])
        setLogs(logsData)
        setUsers((usersData as any[]).filter((u: any) => u.role === 'employee' || u.role === 'admin'))
        
        const defShift = shiftsData.find((s) => s.name === 'default')
        if (defShift) {
          setDefaultShift(defShift)
          setGraceMinutes(defShift.gracePeriodMins)
          if (defShift.startTime) {
            const startD = new Date(defShift.startTime)
            const sh = String(startD.getUTCHours()).padStart(2, '0')
            const sm = String(startD.getUTCMinutes()).padStart(2, '0')
            setShiftStartTime(`${sh}:${sm}`)
          }
          if (defShift.endTime) {
            const endD = new Date(defShift.endTime)
            const eh = String(endD.getUTCHours()).padStart(2, '0')
            const em = String(endD.getUTCMinutes()).padStart(2, '0')
            setShiftEndTime(`${eh}:${em}`)
          }
        }
      } else if (currentUserId) {
        const userLogs = await api.getAttendanceLogByField('userId', currentUserId)
        setLogs(userLogs)
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to sync attendance logs.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveShiftSettings = async () => {
    setShiftSaving(true)
    try {
      const startTimeIso = `1970-01-01T${shiftStartTime}:00.000Z`
      const endTimeIso = `1970-01-01T${shiftEndTime}:00.000Z`

      if (defaultShift) {
        const updated = await shiftsApi.updateShift(defaultShift.id, {
          startTime: startTimeIso,
          endTime: endTimeIso,
          gracePeriodMins: graceMinutes,
        })
        setDefaultShift(updated)
        alert('Shift settings updated successfully.')
      } else {
        const created = await shiftsApi.createShift({
          name: 'default',
          startTime: startTimeIso,
          endTime: endTimeIso,
          gracePeriodMins: graceMinutes,
        })
        setDefaultShift(created)
        alert('Default shift settings initialized successfully.')
      }
      setShowSettings(false)
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to save shift settings.')
    } finally {
      setShiftSaving(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [isAdmin, currentUserId])

  // Clock In Action
  const handleClockIn = async () => {
    if (!currentUserId) return
    setClocking(true)
    setError('')
    try {
      const now = new Date()
      // format date segment as local YYYY-MM-DD
      const dateStr = now.toISOString().split('T')[0]
      await api.createAttendanceLog({
        userId: currentUserId,
        loginTimestamp: now.toISOString(),
        date: `${dateStr}T00:00:00.000Z`,
      })
      await loadData()
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Clock-in failed.')
    } finally {
      setClocking(false)
    }
  }

  // Clock Out Action
  const handleClockOut = async (todayLogId: string) => {
    setClocking(true)
    setError('')
    try {
      const now = new Date()
      await api.updateLogoutTimestamp(todayLogId, now.toISOString())
      await loadData()
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Clock-out failed.')
    } finally {
      setClocking(false)
    }
  }

  // Admin Actions
  const handleDeleteLog = async (id: string) => {
    if (!confirm('Are you sure you want to delete this log?')) return
    try {
      await api.deleteAttendanceLog(id)
      await loadData()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete log')
    }
  }

  const handleEditClick = (log: AttendanceLog) => {
    setEditingLog(log)
    setEditLogin(log.loginTimestamp ? new Date(log.loginTimestamp).toISOString().slice(0, 16) : '')
    setEditLogout(log.logoutTimestamp ? new Date(log.logoutTimestamp).toISOString().slice(0, 16) : '')
    setEditStatus(log.status)
    setEditDate(log.date ? log.date.split('T')[0] : '')
    setModalOpen(true)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingLog) return
    setEditLoading(true)
    try {
      await api.updateAttendanceLog(editingLog.id, {
        loginTimestamp: new Date(editLogin).toISOString(),
        logoutTimestamp: editLogout ? new Date(editLogout).toISOString() : null,
        status: editStatus,
        date: `${editDate}T00:00:00.000Z`,
      })
      setModalOpen(false)
      setEditingLog(null)
      await loadData()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to update attendance log')
    } finally {
      setEditLoading(false)
    }
  }

  // Memoized lists for Employee View
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])
  const todayLog = useMemo(() => {
    if (isAdmin) return null
    return logs.find((l) => l.date && l.date.split('T')[0] === todayStr)
  }, [logs, todayStr, isAdmin])

  // Memoized stats for Admin View
  const adminDayRecords = useMemo(() => {
    return logs.filter((l) => l.date && l.date.split('T')[0] === selectedDate)
  }, [logs, selectedDate])

  const adminStats = useMemo(() => {
    const onTime = adminDayRecords.filter((r) => r.status === 'on-time').length
    const late = adminDayRecords.filter((r) => r.status === 'late').length
    const presentCount = adminDayRecords.length
    const totalUsers = users.length
    const absent = Math.max(0, totalUsers - presentCount)
    return { onTime, late, absent }
  }, [adminDayRecords, users])

  const adminEmployeeTableData = useMemo(() => {
    return users.map((u) => {
      const record = adminDayRecords.find((r) => r.userId === u.id)
      return { user: u, record }
    })
  }, [users, adminDayRecords])

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '—'
    return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const calculateHours = (login?: string, logout?: string | null) => {
    if (!login || !logout) return '—'
    const diffMs = new Date(logout).getTime() - new Date(login).getTime()
    return (diffMs / (1000 * 60 * 60)).toFixed(1) + ' hrs'
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Shift Attendance</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin 
              ? 'Review and manage daily login / logout check-ins for the operational staff.' 
              : `Hello, ${displayName}. Log your clock-in / clock-out status for today's shift.`}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ───────────────────────────────── EMPLOYEE VIEW ───────────────────────────────── */}
      {!isAdmin && (
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1 shadow-md border-slate-200">
            <CardHeader>
              <CardTitle>Shift Clocking</CardTitle>
              <CardDescription>Register your entry and exit times today.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-6 text-center">
              {!todayLog ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-cyan-50 flex items-center justify-center text-cyan-600 mb-4 animate-pulse">
                    <span className="h-4 w-4 bg-cyan-600 rounded-full" />
                  </div>
                  <h3 className="font-semibold text-lg">Not Clocked In</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-6">Your shift status is currently set as absent today.</p>
                  <Button onClick={handleClockIn} disabled={clocking} className="w-full">
                    {clocking ? 'Logging...' : 'Clock In Now'}
                  </Button>
                </>
              ) : !todayLog.logoutTimestamp ? (
                <>
                  <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 animate-bounce">
                    <span className="h-4 w-4 bg-emerald-600 rounded-full" />
                  </div>
                  <h3 className="font-semibold text-lg text-emerald-700">Clocked In</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-1">Checked in at: {formatTime(todayLog.loginTimestamp)}</p>
                  <p className="text-xs text-slate-400 mb-6">Status: {todayLog.status === 'on-time' ? 'On Time' : 'Late'}</p>
                  <Button variant="destructive" onClick={() => handleClockOut(todayLog.id)} disabled={clocking} className="w-full">
                    {clocking ? 'Logging...' : 'Clock Out Now'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4">
                    <span className="h-4 w-4 bg-indigo-600 rounded-full" />
                  </div>
                  <h3 className="font-semibold text-lg text-indigo-700">Shift Completed</h3>
                  <p className="text-xs text-slate-500 mt-1">In: {formatTime(todayLog.loginTimestamp)} | Out: {formatTime(todayLog.logoutTimestamp)}</p>
                  <p className="text-xs text-slate-400 mt-1 mb-6">Total duration: {calculateHours(todayLog.loginTimestamp, todayLog.logoutTimestamp)}</p>
                  <Button disabled className="w-full bg-slate-100 text-slate-400 border border-slate-200">
                    Done for Today
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="md:col-span-2 shadow-md border-slate-200">
            <CardHeader>
              <CardTitle>My Attendance Logs</CardTitle>
              <CardDescription>Your chronological check-in and check-out logs history.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-4 text-center text-sm text-slate-500">Loading history...</div>
              ) : logs.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">No shift records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="pb-3 font-medium">Date</th>
                        <th className="pb-3 font-medium">Clock In</th>
                        <th className="pb-3 font-medium">Clock Out</th>
                        <th className="pb-3 font-medium">Duration</th>
                        <th className="pb-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {logs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-3 font-medium">{log.date ? new Date(log.date).toLocaleDateString() : '—'}</td>
                          <td className="py-3">{formatTime(log.loginTimestamp)}</td>
                          <td className="py-3">{formatTime(log.logoutTimestamp)}</td>
                          <td className="py-3 text-slate-500">{calculateHours(log.loginTimestamp, log.logoutTimestamp)}</td>
                          <td className="py-3">
                            <Badge variant={log.status === 'on-time' ? 'default' : 'secondary'}>
                              {log.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────── ADMIN VIEW ────────────────────────────────── */}
      {isAdmin && (
        <>
          {/* Shift control and Settings */}
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-medium text-slate-900 dark:text-white">Operations Control</h2>
            <Button variant="secondary" onClick={() => setShowSettings(!showSettings)}>
              {showSettings ? 'Hide Shift Settings' : 'Shift Settings'}
            </Button>
          </div>

          {showSettings && (
            <Card className="shadow-md border-slate-200 p-4 mb-4">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-base">Shift Configuration</CardTitle>
                <CardDescription>Adjust operational shift timings and arrival rules for all employees.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 flex flex-col sm:flex-row gap-4 items-end">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Shift Start Time</label>
                  <Input
                    type="time"
                    value={shiftStartTime}
                    onChange={(e) => setShiftStartTime(e.target.value)}
                    className="w-32"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Shift End Time</label>
                  <Input
                    type="time"
                    value={shiftEndTime}
                    onChange={(e) => setShiftEndTime(e.target.value)}
                    className="w-32"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Grace Period (Minutes)</label>
                  <Input
                    type="number"
                    min="0"
                    max="60"
                    value={graceMinutes}
                    onChange={(e) => setGraceMinutes(parseInt(e.target.value) || 0)}
                    className="w-32"
                  />
                </div>
                <Button onClick={handleSaveShiftSettings} disabled={shiftSaving}>
                  {shiftSaving ? 'Saving...' : 'Save Settings'}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Summary KPIs - Always in a Single Row */}
          <div className="flex flex-col sm:flex-row gap-4 w-full">
            {[
              { label: 'On Time Present', value: adminStats.onTime, variant: 'default' as const, color: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
              { label: 'Late Present', value: adminStats.late, variant: 'secondary' as const, color: 'text-amber-700 bg-amber-50 border-amber-100' },
              { label: 'Absent Today', value: adminStats.absent, variant: 'destructive' as const, color: 'text-red-700 bg-red-50 border-red-100' }
            ].map(({ label, value, variant, color }) => (
              <div key={label} className={`flex-1 border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${color}`}>
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold opacity-80">{label}</p>
                  <p className="text-3xl font-extrabold mt-1">{value}</p>
                </div>
                <Badge variant={variant} className="w-fit mt-2">Active</Badge>
              </div>
            ))}
          </div>

          {/* Date Picker */}
          <div className="flex gap-2 items-center flex-wrap bg-white dark:bg-slate-900 border rounded-xl p-4 shadow-sm mt-4">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Select Date:</span>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="max-w-xs"
            />
            <Button variant="secondary" onClick={loadData} className="ml-auto">
              Refresh Data
            </Button>
          </div>

          {/* Main Logs Table */}
          <Card className="shadow-md border-slate-200">
            <CardHeader className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle>Staff Attendance list</CardTitle>
                <CardDescription>Status records for {new Date(selectedDate).toLocaleDateString('en-GB', { dateStyle: 'long' })}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center text-sm text-slate-500">Loading daily database...</div>
              ) : adminEmployeeTableData.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-400">No active employees found to display.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500">
                        <th className="pb-3 font-medium">Employee Name</th>
                        <th className="pb-3 font-medium">Clock In</th>
                        <th className="pb-3 font-medium">Clock Out</th>
                        <th className="pb-3 font-medium">Work Duration</th>
                        <th className="pb-3 font-medium">Status</th>
                        <th className="pb-3 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {adminEmployeeTableData.map(({ user, record }) => (
                        <tr key={user.id}>
                          <td className="py-3 font-semibold">
                            {user.firstName} {user.lastName}
                            <span className="block font-normal text-xs text-slate-400 font-mono mt-0.5">{user.email}</span>
                          </td>
                          <td className="py-3">{record ? formatTime(record.loginTimestamp) : '—'}</td>
                          <td className="py-3">{record ? formatTime(record.logoutTimestamp) : '—'}</td>
                          <td className="py-3 text-slate-500">
                            {record ? calculateHours(record.loginTimestamp, record.logoutTimestamp) : '—'}
                          </td>
                          <td className="py-3">
                            {record ? (
                              <Badge variant={record.status === 'on-time' ? 'default' : 'secondary'}>
                                {record.status}
                              </Badge>
                            ) : (
                              <Badge variant="destructive">Absent</Badge>
                            )}
                          </td>
                          <td className="py-3 text-right">
                            {record ? (
                              <>
                                <Button variant="ghost" size="sm" onClick={() => handleEditClick(record)}>
                                  Edit
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => handleDeleteLog(record.id)} className="ml-2">
                                  Delete
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-300 italic">No record</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ─────────────────────────────────── EDIT MODAL ─────────────────────────────────── */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Edit Staff Attendance Log"
        description="Manually adjust shift check-in and check-out logs for employees."
        size="md"
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={editLoading}>Cancel</Button>
            <Button type="submit" form="edit-attendance-form" disabled={editLoading}>{editLoading ? 'Saving...' : 'Save Changes'}</Button>
          </div>
        }
      >
        <form id="edit-attendance-form" onSubmit={handleSaveEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Date *</label>
            <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Clock In Timestamp *</label>
            <Input type="datetime-local" value={editLogin} onChange={(e) => setEditLogin(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Clock Out Timestamp (optional)</label>
            <Input type="datetime-local" value={editLogout} onChange={(e) => setEditLogout(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Evaluation Status</label>
            <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
              <option value="on-time">on-time</option>
              <option value="late">late</option>
            </Select>
          </div>
        </form>
      </Modal>
    </div>
  )
}
