import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import {
  payroll as payrollApi,
  employees as employeesApi,
} from '@/api'
import type { SalaryBreakdown, Fine } from '@/api/payroll'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'
import { Banknote, TrendingDown, TrendingUp, Plus, X, RotateCcw, ShieldAlert, Award } from 'lucide-react'

const fmt = (n: number | string) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const getMonthOptions = () => {
  const options = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const val = d.toISOString().slice(0, 7) // YYYY-MM
    const lbl = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
    options.push({ value: val, label: lbl })
  }
  return options
}

export default function PayrollPage() {
  const role = useAuthStore((s) => s.role)
  const currentUserId = useAuthStore((s) => s.userId)
  const isAdmin = role === 'admin'

  const monthOptions = useMemo(() => getMonthOptions(), [])
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value)

  // Data
  const [payrollSummary, setPayrollSummary] = useState<SalaryBreakdown[]>([])
  const [employeeRecord, setEmployeeRecord] = useState<SalaryBreakdown | null>(null)
  const [allEmployees, setAllEmployees] = useState<any[]>([])
  const [activeFineRule, setActiveFineRule] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  // Modals
  const [baseSalaryModalOpen, setBaseSalaryModalOpen] = useState(false)
  const [fineRuleModalOpen, setFineRuleModalOpen] = useState(false)
  const [addFineModalOpen, setAddFineModalOpen] = useState(false)
  const [addBonusModalOpen, setAddBonusModalOpen] = useState(false)
  const [finalizeModalOpen, setFinalizeModalOpen] = useState(false)

  // Selected state for modals
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [selectedEmpUserId, setSelectedEmpUserId] = useState('')
  const [selectedEmpName, setSelectedEmpName] = useState('')

  // Form States
  const [baseSalaryInput, setBaseSalaryInput] = useState('')
  const [fineRuleForm, setFineRuleForm] = useState({ lateMinutes: 10, fineType: 'FIXED', amount: '' })
  const [fineForm, setFineForm] = useState({ reason: '', amount: '', date: new Date().toISOString().split('T')[0] })
  const [bonusForm, setBonusForm] = useState({ reason: '', amount: '', date: new Date().toISOString().split('T')[0] })
  const [saving, setSaving] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      if (isAdmin) {
        const [sumData, ruleData, empList] = await Promise.all([
          payrollApi.getSummary(`${selectedMonth}-01`),
          payrollApi.getActiveFineRule().catch(() => null),
          employeesApi.getAllEmployees().catch(() => []),
        ])
        setPayrollSummary(sumData || [])
        setActiveFineRule(ruleData || null)
        setAllEmployees(empList || [])
      } else {
        const breakdown = await payrollApi.getMySummary(`${selectedMonth}-01`)
        setEmployeeRecord(breakdown || null)
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load payroll details.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [selectedMonth])

  // Admin Actions
  const handleOpenBaseSalary = (employeeId: string, currentSalary: number, name: string) => {
    setSelectedEmpId(employeeId)
    setSelectedEmpName(name)
    setBaseSalaryInput(currentSalary ? currentSalary.toString() : '')
    setBaseSalaryModalOpen(true)
  }

  const handleUpdateBaseSalary = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmpId || !baseSalaryInput || Number(baseSalaryInput) < 0) {
      showToast('Please enter a valid salary amount.', 'error')
      return
    }
    setSaving(true)
    try {
      await payrollApi.setBaseSalary(selectedEmpId, Number(baseSalaryInput))
      showToast('Base salary updated successfully.')
      setBaseSalaryModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to update base salary.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleConfigureFineRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fineRuleForm.amount || Number(fineRuleForm.amount) <= 0) {
      showToast('Please enter a valid fine amount.', 'error')
      return
    }
    setSaving(true)
    try {
      await payrollApi.createFineRule({
        lateMinutes: Number(fineRuleForm.lateMinutes),
        fineType: fineRuleForm.fineType,
        amount: Number(fineRuleForm.amount),
      })
      showToast('Fine rule configured successfully.')
      setFineRuleModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to configure fine rule.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenAddFine = (userId: string, name: string) => {
    setSelectedEmpUserId(userId)
    setSelectedEmpName(name)
    setFineForm({ reason: '', amount: '', date: new Date().toISOString().split('T')[0] })
    setAddFineModalOpen(true)
  }

  const handleAddFine = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmpUserId || !fineForm.reason.trim() || !fineForm.amount || Number(fineForm.amount) <= 0) {
      showToast('Please enter valid details and amount.', 'error')
      return
    }
    setSaving(true)
    try {
      await payrollApi.createFine({
        userId: selectedEmpUserId,
        reason: fineForm.reason.trim(),
        amount: Number(fineForm.amount),
        date: fineForm.date,
      })
      showToast('Fine added successfully.')
      setAddFineModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to add fine.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleOpenAddBonus = (userId: string, name: string) => {
    setSelectedEmpUserId(userId)
    setSelectedEmpName(name)
    setBonusForm({ reason: '', amount: '', date: new Date().toISOString().split('T')[0] })
    setAddBonusModalOpen(true)
  }

  const handleAddBonus = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEmpUserId || !bonusForm.reason.trim() || !bonusForm.amount || Number(bonusForm.amount) <= 0) {
      showToast('Please enter valid details and amount.', 'error')
      return
    }
    setSaving(true)
    try {
      await payrollApi.createBonus({
        userId: selectedEmpUserId,
        reason: bonusForm.reason.trim(),
        amount: Number(bonusForm.amount),
        date: bonusForm.date,
      })
      showToast('Reward/Bonus added successfully.')
      setAddBonusModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to add reward/bonus.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleCancelFine = async (fineId: string) => {
    try {
      await payrollApi.toggleCancelFine(fineId)
      showToast('Fine status updated.')
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to cancel fine.', 'error')
    }
  }

  const handleFinalizePayroll = async () => {
    setSaving(true)
    try {
      await payrollApi.finalizePayroll(`${selectedMonth}-01`)
      showToast('Monthly payroll finalized and salaries expense posted successfully.')
      setFinalizeModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to finalize payroll.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Derived KPI figures
  const totalPayrollCost = useMemo(() => {
    return payrollSummary.reduce((acc, rec) => acc + rec.netPay, 0)
  }, [payrollSummary])

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast Alert */}
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
          <button type="button" onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-slate-600 text-base">
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {isAdmin ? 'Payroll & Compensation' : 'My Compensation'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin
              ? 'Manage employee base salaries, track automated lateness deductions, issue bonuses, and finalize payroll.'
              : 'View your real-time salary breakdown, accumulated late deductions, and bonuses.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="w-56">
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setFineRuleModalOpen(true)}>
                Fine Rules
              </Button>
              <Button variant="default" onClick={() => setFinalizeModalOpen(true)}>
                Lock & Post Payroll
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards for Admin */}
      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Net Pay</p>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{fmt(totalPayrollCost)}</p>
            </div>
            <div className="w-12 h-12 bg-cyan-100 dark:bg-cyan-950 rounded-xl flex items-center justify-center text-cyan-600 dark:text-cyan-300">
              <Banknote className="w-6 h-6" />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lateness Fine Settings</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2">
                {activeFineRule
                  ? `${activeFineRule.fineType === 'FIXED' ? fmt(activeFineRule.amount) : `${activeFineRule.amount}%`} penalty for check-ins late by > ${activeFineRule.lateMinutes} mins`
                  : 'No active late fine rule configured'}
              </p>
            </div>
            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-950 rounded-xl flex items-center justify-center text-rose-600 dark:text-rose-300">
              <ShieldAlert className="w-6 h-6" />
            </div>
          </div>

          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-5 bg-card shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff Count Tracked</p>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">{payrollSummary.length}</p>
            </div>
            <div className="w-12 h-12 bg-teal-100 dark:bg-teal-950 rounded-xl flex items-center justify-center text-teal-600 dark:text-teal-300">
              <Award className="w-6 h-6" />
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading payroll ledger components...</div>
          ) : isAdmin ? (
            /* ADMIN DETAILED SUMMARY */
            <div className="space-y-6">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                      <th className="pb-3 font-semibold">Employee</th>
                      <th className="pb-3 font-semibold">Attendance Info</th>
                      <th className="pb-3 font-semibold">Base Salary</th>
                      <th className="pb-3 font-semibold text-rose-600">Fines</th>
                      <th className="pb-3 font-semibold text-emerald-600">Bonuses</th>
                      <th className="pb-3 font-semibold">Estimated Net Pay</th>
                      <th className="pb-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {payrollSummary.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400">
                          No employee records found for this period. Ensure employees have active accounts.
                        </td>
                      </tr>
                    ) : (
                      payrollSummary.map((record) => {
                        const originalEmp = allEmployees.find((e) => e.userId === record.userId)
                        return (
                          <tr key={record.userId} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                            <td className="py-4 font-medium">
                              <div>{record.employeeName}</div>
                              <div className="text-xs text-slate-400 font-mono">
                                {record.employeeUniqueNumber} {record.jobTitle ? `· ${record.jobTitle}` : ''}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="text-xs text-slate-600 dark:text-slate-400">
                                Days: <span className="font-semibold">{record.daysPresent}</span> · Late: <span className="font-semibold text-rose-600">{record.lateArrivalsCount}</span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5">Hours: {record.hoursWorked.toFixed(1)} hrs</div>
                            </td>
                            <td className="py-4 font-semibold">
                              {record.baseSalary > 0 ? (
                                fmt(record.baseSalary)
                              ) : (
                                <span className="text-slate-400 text-xs italic">Not Set</span>
                              )}
                            </td>
                            <td className="py-4 text-rose-600 font-medium font-mono">
                              −{fmt(record.totalFines)}
                              {record.fines.length > 0 && (
                                <span className="text-xs text-slate-400 block font-sans">
                                  ({record.fines.filter((f) => !f.cancelled).length} active)
                                </span>
                              )}
                            </td>
                            <td className="py-4 text-emerald-600 font-medium font-mono">
                              +{fmt(record.totalBonuses)}
                              {record.bonuses.length > 0 && (
                                <span className="text-xs text-slate-400 block font-sans">
                                  ({record.bonuses.length} items)
                                </span>
                              )}
                            </td>
                            <td className="py-4 text-slate-900 dark:text-white font-extrabold text-base font-mono">
                              {fmt(record.netPay)}
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex justify-end gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleOpenBaseSalary(
                                      record.employeeId,
                                      record.baseSalary,
                                      record.employeeName
                                    )
                                  }
                                >
                                  Base
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenAddFine(record.userId, record.employeeName)}
                                  className="text-rose-600"
                                >
                                  Fine
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenAddBonus(record.userId, record.employeeName)}
                                  className="text-emerald-600"
                                >
                                  Bonus
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Fines and Bonuses cancel lists for Admin */}
              {payrollSummary.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800">
                  {/* Accumulated Fines log */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                      <TrendingDown className="w-4 h-4 text-rose-500" /> Current Month's Lateness/Manual Fines
                    </h3>
                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/10">
                      {payrollSummary.flatMap((r) => r.fines).length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs">No fines recorded this month.</div>
                      ) : (
                        payrollSummary.flatMap((r) =>
                          r.fines.map((f) => {
                            const empName = payrollSummary.find((e) => e.userId === f.userId)?.employeeName || 'Staff'
                            return (
                              <div key={f.id} className={`flex items-center justify-between p-3 text-xs ${f.cancelled ? 'opacity-40' : ''}`}>
                                <div>
                                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                                    {empName} · <span className={f.cancelled ? 'line-through' : ''}>{f.reason}</span>
                                  </p>
                                  <p className="text-[10px] text-slate-400">{new Date(f.date).toLocaleDateString('en-GB')}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-mono text-rose-600 font-bold">−{fmt(f.amount)}</span>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCancelFine(f.id)}
                                    title={f.cancelled ? 'Reinstate Fine' : 'Cancel Fine'}
                                    className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )
                          })
                        )
                      )}
                    </div>
                  </div>

                  {/* Rewards / Bonuses Log */}
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2 text-sm uppercase tracking-wider">
                      <TrendingUp className="w-4 h-4 text-emerald-500" /> Current Month's Bonuses & Rewards
                    </h3>
                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/10">
                      {payrollSummary.flatMap((r) => r.bonuses).length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs">No bonuses recorded this month.</div>
                      ) : (
                        payrollSummary.flatMap((r) =>
                          r.bonuses.map((b) => {
                            const empName = payrollSummary.find((e) => e.userId === b.userId)?.employeeName || 'Staff'
                            return (
                              <div key={b.id} className="flex items-center justify-between p-3 text-xs">
                                <div>
                                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                                    {empName} · {b.reason}
                                  </p>
                                  <p className="text-[10px] text-slate-400">{new Date(b.date).toLocaleDateString('en-GB')}</p>
                                </div>
                                <span className="font-mono text-emerald-600 font-bold">+{fmt(b.amount)}</span>
                              </div>
                            )
                          })
                        )
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* EMPLOYEE PERSONAL REAL-TIME VIEW */
            employeeRecord && (
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Salary breakdown summary block */}
                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-2xl p-6 border border-slate-100 dark:border-slate-800 space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-wider">Estimated Net Pay For Month</p>
                      <p className="text-4xl font-extrabold text-slate-900 dark:text-white mt-1">
                        {fmt(employeeRecord.netPay)}
                      </p>
                    </div>
                    <div className="w-14 h-14 bg-cyan-500/10 rounded-2xl flex items-center justify-center text-cyan-600">
                      <Banknote className="w-7 h-7" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Base Salary</p>
                      <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{fmt(employeeRecord.baseSalary)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-rose-500 mb-1">Fines</p>
                      <p className="text-lg font-bold text-rose-600">−{fmt(employeeRecord.totalFines)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-emerald-600 mb-1">Bonuses</p>
                      <p className="text-lg font-bold text-emerald-600">+{fmt(employeeRecord.totalBonuses)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Lateness stats</p>
                    <p className="text-lg font-bold text-rose-600">{employeeRecord.lateArrivalsCount} late check-ins</p>
                    <p className="text-xs text-slate-400 mt-1">Days present: {employeeRecord.daysPresent} days</p>
                  </div>
                  <div className="border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                    <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Hours logged</p>
                    <p className="text-lg font-bold text-slate-800 dark:text-slate-200">{employeeRecord.hoursWorked.toFixed(1)} hrs</p>
                    <p className="text-xs text-slate-400 mt-1">Real-time attendance summary</p>
                  </div>
                </div>

                {/* Employee Fines list */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-card">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-rose-500" />
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Fines & Deductions</h2>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employeeRecord.fines.length === 0 ? (
                      <div className="p-5 text-center text-slate-400 text-sm">No fines accumulated this month.</div>
                    ) : (
                      employeeRecord.fines.map((f) => (
                        <div key={f.id} className={`flex items-center justify-between px-5 py-3.5 ${f.cancelled ? 'opacity-40' : ''}`}>
                          <div>
                            <p className={`text-sm ${f.cancelled ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200 font-medium'}`}>{f.reason}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(f.date).toLocaleDateString('en-GB')}</p>
                          </div>
                          {f.cancelled ? (
                            <Badge variant="secondary">Cancelled</Badge>
                          ) : (
                            <span className="font-mono font-bold text-rose-600">−{fmt(f.amount)}</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Employee Bonuses list */}
                <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden bg-card">
                  <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    <h2 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-wider">Rewards & Bonuses</h2>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employeeRecord.bonuses.length === 0 ? (
                      <div className="p-5 text-center text-slate-400 text-sm">No performance rewards added this month.</div>
                    ) : (
                      employeeRecord.bonuses.map((b) => (
                        <div key={b.id} className="flex items-center justify-between px-5 py-3.5">
                          <div>
                            <p className="text-sm text-slate-800 dark:text-slate-200 font-medium">{b.reason}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{new Date(b.date).toLocaleDateString('en-GB')}</p>
                          </div>
                          <span className="font-mono font-bold text-emerald-600">+{fmt(b.amount)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )
          )}
        </CardContent>
      </Card>

      {/* ─── MODALS ─── */}

      {/* Set Base Salary Modal */}
      <Modal open={baseSalaryModalOpen} onClose={() => setBaseSalaryModalOpen(false)}>
        <form onSubmit={handleUpdateBaseSalary} className="space-y-4">
          <CardHeader>
            <CardTitle>Set Employee Base Salary</CardTitle>
            <CardDescription>Configure a fixed monthly base salary for {selectedEmpName}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Base Salary Amount (£)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 2500"
                value={baseSalaryInput}
                onChange={(e) => setBaseSalaryInput(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setBaseSalaryModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Update Base'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Fine Rule Configuration Modal */}
      <Modal open={fineRuleModalOpen} onClose={() => setFineRuleModalOpen(false)}>
        <form onSubmit={handleConfigureFineRule} className="space-y-4">
          <CardHeader>
            <CardTitle>Lateness Fine Settings</CardTitle>
            <CardDescription>Set automatic deduction rules for employee late arrivals.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Grace Period Limit (Minutes)
              </label>
              <Input
                type="number"
                value={fineRuleForm.lateMinutes}
                onChange={(e) => setFineRuleForm({ ...fineRuleForm, lateMinutes: Number(e.target.value) })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Deduction Type
              </label>
              <Select
                value={fineRuleForm.fineType}
                onChange={(e) => setFineRuleForm({ ...fineRuleForm, fineType: e.target.value })}
              >
                <option value="FIXED">Fixed Amount Deduction (£)</option>
                <option value="PERCENTAGE">Percentage of Base Salary (%)</option>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Fine Value
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder={fineRuleForm.fineType === 'FIXED' ? 'e.g. 15.00' : 'e.g. 0.5'}
                value={fineRuleForm.amount}
                onChange={(e) => setFineRuleForm({ ...fineRuleForm, amount: e.target.value })}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setFineRuleModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Apply Rule'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Add Manual Fine Modal */}
      <Modal open={addFineModalOpen} onClose={() => setAddFineModalOpen(false)}>
        <form onSubmit={handleAddFine} className="space-y-4">
          <CardHeader>
            <CardTitle>Add Fine / Deduction</CardTitle>
            <CardDescription>Issue a manual deduction on {selectedEmpName}'s monthly pay.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Reason / Description
              </label>
              <Input
                placeholder="e.g. Unexcused absence / late arrival"
                value={fineForm.reason}
                onChange={(e) => setFineForm({ ...fineForm, reason: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Amount (£)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 15.00"
                value={fineForm.amount}
                onChange={(e) => setFineForm({ ...fineForm, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Date
              </label>
              <Input
                type="date"
                value={fineForm.date}
                onChange={(e) => setFineForm({ ...fineForm, date: e.target.value })}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setAddFineModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-rose-600 hover:bg-rose-700 text-white">
              {saving ? 'Saving...' : 'Deduct Pay'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Add Manual Reward Modal */}
      <Modal open={addBonusModalOpen} onClose={() => setAddBonusModalOpen(false)}>
        <form onSubmit={handleAddBonus} className="space-y-4">
          <CardHeader>
            <CardTitle>Reward performance / Add Bonus</CardTitle>
            <CardDescription>Add a performance reward or bonus to {selectedEmpName}'s pay.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Reason / Description
              </label>
              <Input
                placeholder="e.g. Exceeded weekly shipment targets"
                value={bonusForm.reason}
                onChange={(e) => setBonusForm({ ...bonusForm, reason: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Amount (£)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 100.00"
                value={bonusForm.amount}
                onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Date
              </label>
              <Input
                type="date"
                value={bonusForm.date}
                onChange={(e) => setBonusForm({ ...bonusForm, date: e.target.value })}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setAddBonusModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? 'Saving...' : 'Add Reward'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Finalize Monthly Payroll Modal */}
      <Modal open={finalizeModalOpen} onClose={() => setFinalizeModalOpen(false)}>
        <div className="space-y-4">
          <CardHeader>
            <CardTitle>Finalize Monthly Payroll</CardTitle>
            <CardDescription>Lock current month's payroll parameters and post total salaries.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Are you sure you want to finalize payroll for{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {monthOptions.find((o) => o.value === selectedMonth)?.label}
              </span>
              ?
            </p>
            <p className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-xl border border-amber-200">
              This action will compile all employee net salaries, lock the records, and automatically create a
              "Salaries" category expense amounting to{' '}
              <span className="font-bold">{fmt(totalPayrollCost)}</span> in the Expense Management module.
            </p>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setFinalizeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleFinalizePayroll} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700 text-white">
              {saving ? 'Locking...' : 'Lock & Post'}
            </Button>
          </CardFooter>
        </div>
      </Modal>
    </div>
  )
}
