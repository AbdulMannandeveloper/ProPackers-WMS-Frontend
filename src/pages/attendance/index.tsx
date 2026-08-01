import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import { attendance as api, users as usersApi, shifts as shiftsApi, holidays as holidaysApi } from '@/api'
import type { AttendanceLog } from '@/api/attendance'
import type { Holiday } from '@/api/holidays'
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

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ message, type })
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

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

  // Holiday State (US-067)
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [showHolidays, setShowHolidays] = useState(false)
  const [holidayName, setHolidayName] = useState('')
  const [holidayStartDate, setHolidayStartDate] = useState('')
  const [holidayEndDate, setHolidayEndDate] = useState('')
  const [holidaySaving, setHolidaySaving] = useState(false)

  // Archive State (US-068/069)
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false)
  const [archiving, setArchiving] = useState(false)

  // Delete Confirm State
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteLogId, setDeleteLogId] = useState<string | null>(null)

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
        const [logsData, usersData, shiftsData, holidaysData] = await Promise.all([
          api.getAllAttendanceLogs(),
          usersApi.getAllUsers(),
          shiftsApi.getAllShifts(),
          holidaysApi.getAllHolidays().catch(() => []),
        ])
        setLogs(logsData)
        setUsers((usersData as any[]).filter((u: any) => u.role === 'employee' || u.role === 'admin'))
        setHolidays(Array.isArray(holidaysData) ? holidaysData : [])
        
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
        showToast('Shift settings updated successfully.')
      } else {
        const created = await shiftsApi.createShift({
          name: 'default',
          startTime: startTimeIso,
          endTime: endTimeIso,
          gracePeriodMins: graceMinutes,
        })
        setDefaultShift(created)
        showToast('Default shift settings initialized successfully.')
      }
      setShowSettings(false)
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to save shift settings.', 'error')
    } finally {
      setShiftSaving(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [isAdmin, currentUserId])

  // Auto-logout: update logout timestamp when user navigates away or closes tab
  // This ensures the last logout of the day is captured
  useEffect(() => {
    if (!currentUserId) return

    const handleAutoLogout = async () => {
      try {
        const todayStr = new Date().toISOString().split('T')[0]
        const userLogs = await api.getAttendanceLogByField('userId', currentUserId)
        const todayLog = Array.isArray(userLogs)
          ? userLogs.find((l) => l.date && l.date.split('T')[0] === todayStr)
          : null

        if (todayLog) {
          // Update logout timestamp on every logout (last logout = checkout time)
          await api.updateLogoutTimestamp(todayLog.id, new Date().toISOString())
        }
      } catch {
        // Silent fail — don't block navigation
      }
    }

    window.addEventListener('beforeunload', handleAutoLogout)
    return () => window.removeEventListener('beforeunload', handleAutoLogout)
  }, [currentUserId])

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

  // Clock Out Action — updates logout so last logout = checkout time
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
  const handleDeleteLog = async () => {
    if (!deleteLogId) return
    try {
      await api.deleteAttendanceLog(deleteLogId)
      setDeleteConfirmOpen(false)
      setDeleteLogId(null)
      showToast('Attendance log deleted.')
      await loadData()
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to delete log', 'error')
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
      showToast('Attendance log updated successfully.')
      await loadData()
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to update attendance log', 'error')
    } finally {
      setEditLoading(false)
    }
  }

  // US-067: Holiday CRUD
  const handleAddHoliday = async () => {
    if (!holidayName || !holidayStartDate) {
      showToast('Holiday name and start date are required.', 'error')
      return
    }
    setHolidaySaving(true)
    try {
      await holidaysApi.createHoliday({
        name: holidayName,
        startDate: `${holidayStartDate}T00:00:00.000Z`,
        endDate: holidayEndDate ? `${holidayEndDate}T00:00:00.000Z` : undefined,
      })
      setHolidayName('')
      setHolidayStartDate('')
      setHolidayEndDate('')
      showToast('Holiday added.')
      await loadData()
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to add holiday.', 'error')
    } finally {
      setHolidaySaving(false)
    }
  }

  const handleDeleteHoliday = async (id: string) => {
    try {
      await holidaysApi.deleteHoliday(id)
      showToast('Holiday deleted.')
      await loadData()
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Failed to delete holiday.', 'error')
    }
  }

  // US-068/069: Archive
  const handleArchiveAndCleanup = async () => {
    setArchiving(true)
    try {
      const result = await api.archiveAndCleanup()
      setArchiveConfirmOpen(false)
      showToast(result?.message || 'Archive completed successfully.')
      await loadData()
    } catch (e: any) {
      showToast(e?.response?.data?.error || e?.message || 'Archive failed.', 'error')
    } finally {
      setArchiving(false)
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
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
          }`}
        >
          <div className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
          <span className="text-sm font-medium">{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base">×</button>
        </div>
      )}

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
                  <Button variant="destructive" onClick={() => handleClockOut(todayLog.id)} disabled={clocking} className="w-full">
                    {clocking ? 'Logging...' : 'Clock Out Again'}
                  </Button>
                  <p className="text-[10px] text-slate-400 mt-2">Each clock out updates your checkout time.</p>
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
          <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
            <h2 className="text-lg font-medium text-slate-900 dark:text-white">Operations Control</h2>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowHolidays(!showHolidays)}>
                {showHolidays ? 'Hide Holidays' : 'Holiday Calendar'}
              </Button>
              <Button variant="secondary" onClick={() => setShowSettings(!showSettings)}>
                {showSettings ? 'Hide Shift Settings' : 'Shift Settings'}
              </Button>
              <Button variant="destructive" onClick={() => setArchiveConfirmOpen(true)}>
                Archive & Cleanup
              </Button>
            </div>
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

          {/* US-067: Holiday Calendar Section */}
          {showHolidays && (
            <Card className="shadow-md border-slate-200 p-4 mb-4">
              <CardHeader className="p-0 pb-3">
                <CardTitle className="text-base">Holiday Calendar</CardTitle>
                <CardDescription>Manage official holidays. Attendance on these days can be cross-referenced.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                {/* Add Holiday Form */}
                <div className="flex flex-col sm:flex-row gap-3 items-end">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Holiday Name *</label>
                    <Input
                      placeholder="e.g. Christmas Day"
                      value={holidayName}
                      onChange={(e) => setHolidayName(e.target.value)}
                      className="w-48"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Start Date *</label>
                    <Input
                      type="date"
                      value={holidayStartDate}
                      onChange={(e) => setHolidayStartDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1 block">End Date</label>
                    <Input
                      type="date"
                      value={holidayEndDate}
                      onChange={(e) => setHolidayEndDate(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button onClick={handleAddHoliday} disabled={holidaySaving}>
                    {holidaySaving ? 'Adding...' : 'Add Holiday'}
                  </Button>
                </div>

                {/* Holiday List */}
                {holidays.length === 0 ? (
                  <div className="py-4 text-center text-sm text-slate-400">No holidays configured.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-2 font-medium">Name</th>
                          <th className="pb-2 font-medium">Start Date</th>
                          <th className="pb-2 font-medium">End Date</th>
                          <th className="pb-2 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {holidays.map((h) => (
                          <tr key={h.id}>
                            <td className="py-2 font-medium">{h.name}</td>
                            <td className="py-2">{new Date(h.startDate).toLocaleDateString()}</td>
                            <td className="py-2">{h.endDate ? new Date(h.endDate).toLocaleDateString() : '—'}</td>
                            <td className="py-2 text-right">
                              <Button variant="destructive" size="sm" onClick={() => handleDeleteHoliday(h.id)}>
                                Delete
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setDeleteLogId(record.id)
                                    setDeleteConfirmOpen(true)
                                  }}
                                  className="ml-2"
                                >
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

      {/* ─────────────────────────────── DELETE CONFIRM MODAL ─────────────────────────────── */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Attendance Log"
        description="This action cannot be undone."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteLog}>Delete</Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600">Are you sure you want to permanently delete this attendance record?</p>
      </Modal>

      {/* ─────────────────────────────── ARCHIVE CONFIRM MODAL (US-068/069) ─────────────────────────────── */}
      <Modal
        open={archiveConfirmOpen}
        onClose={() => setArchiveConfirmOpen(false)}
        title="Archive & Cleanup Old Logs"
        description="This will archive monthly summaries and permanently delete daily logs older than 2 months."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setArchiveConfirmOpen(false)} disabled={archiving}>Cancel</Button>
            <Button variant="destructive" onClick={handleArchiveAndCleanup} disabled={archiving}>
              {archiving ? 'Archiving...' : 'Confirm Archive & Cleanup'}
            </Button>
          </div>
        }
      >
        <div className="space-y-2 text-sm text-slate-600">
          <p>This operation will:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>Compute and save monthly attendance summaries for all employees</li>
            <li>Permanently delete detailed daily logs older than 2 months</li>
          </ul>
          <p className="text-rose-600 font-medium mt-3">⚠ This action cannot be undone.</p>
        </div>
      </Modal>
    </div>
  )
}
