import { useEffect, useState, useMemo } from 'react'
import { expenses as expensesApi } from '@/api'
import { AXIOS_INSTANCE } from '@/api/http-client'
import type { Expense, ExpenseCategory } from '@/api/expenses'
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
import { X, Image } from 'lucide-react'

const fmt = (n: number | string) =>
  `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const CATEGORY_COLORS: Record<string, string> = {
  'Salaries': 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
  'Rent & Rates': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  'Utilities': 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900',
  'Equipment & Maintenance': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900',
  'Insurance': 'bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900',
  'Consumables & Packaging': 'bg-pink-100 text-pink-800 border-pink-200 dark:bg-pink-950/40 dark:text-pink-300 dark:border-pink-900',
}

const getCategoryBadgeClass = (name: string) => {
  return CATEGORY_COLORS[name] || 'bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800'
}

export default function ExpensesPage() {
  // Data States
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [, setLoading] = useState(false)

  // Filters
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // Toast
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
  const [addExpenseModalOpen, setAddExpenseModalOpen] = useState(false)
  const [addCategoryModalOpen, setAddCategoryModalOpen] = useState(false)
  const [receiptPreviewModalOpen, setReceiptPreviewModalOpen] = useState(false)
  const [selectedReceiptUrl, setSelectedReceiptUrl] = useState('')
  const [selectedReceiptIsPdf, setSelectedReceiptIsPdf] = useState(false)

  // Form states
  const [expenseForm, setExpenseForm] = useState({ categoryId: '', amount: '', date: new Date().toISOString().split('T')[0], description: '' })
  const [categoryNameInput, setCategoryNameInput] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadedReceiptUrl, setUploadedReceiptUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [categoriesData, expensesData] = await Promise.all([
        expensesApi.getAllCategories(),
        expensesApi.getAllExpenses({
          categoryId: selectedCategory === 'All' ? undefined : selectedCategory,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      ])
      setCategories(categoriesData || [])
      setExpenses(expensesData || [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load expenses.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [selectedCategory, startDate, endDate])

  // Receipt image upload
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setUploading(true)
    try {
      const result = await expensesApi.uploadReceipt(file)
      setUploadedReceiptUrl(result.url)
      showToast('Receipt document uploaded successfully.')
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to upload receipt.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!expenseForm.categoryId || !expenseForm.amount || !expenseForm.date || !expenseForm.description.trim()) {
      showToast('Please fill in all required fields.', 'error')
      return
    }
    setSaving(true)
    try {
      await expensesApi.createExpense({
        categoryId: expenseForm.categoryId,
        amount: Number(expenseForm.amount),
        date: expenseForm.date,
        description: expenseForm.description.trim(),
        receiptImageUrl: uploadedReceiptUrl,
      })
      showToast('Expense recorded successfully.')
      setAddExpenseModalOpen(false)
      setUploadedReceiptUrl(null)
      setSelectedFile(null)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to create expense.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!categoryNameInput.trim()) return
    setSaving(true)
    try {
      await expensesApi.createCategory(categoryNameInput.trim())
      showToast('Custom expense category created.')
      setAddCategoryModalOpen(false)
      setCategoryNameInput('')
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to create category.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return
    try {
      await expensesApi.deleteExpense(id)
      showToast('Expense record deleted.')
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to delete expense.', 'error')
    }
  }

  // Categories sum summaries
  const categorySummary = useMemo(() => {
    return categories.map((cat) => {
      const filtered = expenses.filter((e) => e.categoryId === cat.id)
      const total = filtered.reduce((acc, e) => acc + Number(e.amount), 0)
      return {
        ...cat,
        total,
        count: filtered.length,
      }
    }).filter((c) => c.count > 0).sort((a, b) => b.total - a.total)
  }, [categories, expenses])

  const totalFilteredExpense = useMemo(() => {
    return expenses.reduce((acc, e) => acc + Number(e.amount), 0)
  }, [expenses])

  const handleOpenReceiptPreview = async (url: string) => {
    // Receipts are served from an authenticated endpoint, so fetch them through
    // the API client (which attaches the bearer token) and preview via a blob URL.
    setSelectedReceiptIsPdf(url.toLowerCase().endsWith('.pdf'))
    setReceiptPreviewModalOpen(true)
    try {
      const res = await AXIOS_INSTANCE.get(url, { responseType: 'blob' })
      const objectUrl = URL.createObjectURL(res.data as Blob)
      setSelectedReceiptUrl(objectUrl)
    } catch (err) {
      showToast((err as any)?.response?.data?.error || 'Failed to load receipt.', 'error')
      setReceiptPreviewModalOpen(false); setSelectedReceiptUrl('')
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast popup */}
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white font-sans">Expense Management</h1>
          <p className="text-sm text-slate-500 mt-1 font-sans">
            Track non-payroll costs, configure categories, upload digital receipts, and audit operational cash flows.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setAddCategoryModalOpen(true)}>
            Add Category
          </Button>
          <Button
            variant="default"
            onClick={() => {
              setExpenseForm({ categoryId: categories[0]?.id || '', amount: '', date: new Date().toISOString().split('T')[0], description: '' })
              setAddExpenseModalOpen(true)
            }}
          >
            Record Expense
          </Button>
        </div>
      </div>

      {/* Category breakdown grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {categorySummary.map((cat) => (
          <div
            key={cat.id}
            onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'All' : cat.id)}
            className={`border rounded-2xl p-5 shadow-sm transition-all cursor-pointer bg-card ${
              selectedCategory === cat.id
                ? 'border-cyan-500 bg-cyan-50/10 dark:bg-cyan-950/20'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            <Badge className={`w-fit border ${getCategoryBadgeClass(cat.categoryName)}`}>
              {cat.categoryName}
            </Badge>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white mt-3">{fmt(cat.total)}</p>
            <p className="text-xs text-slate-400 mt-0.5">{cat.count} ledger entries</p>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-48">
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.categoryName}
              </option>
            ))}
          </Select>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
          <span className="text-slate-400 text-xs">to</span>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
          {(startDate || endDate || selectedCategory !== 'All') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate('')
                setEndDate('')
                setSelectedCategory('All')
              }}
            >
              Clear Filters
            </Button>
          )}
        </div>
        <div className="text-sm font-semibold text-slate-500 font-sans">
          Total Filtered: <span className="text-slate-950 dark:text-white text-base font-bold">{fmt(totalFilteredExpense)}</span>
        </div>
      </div>

      {/* Expenses Table list */}
      <Card className="shadow-sm border-slate-200 dark:border-slate-800">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[45rem] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2 bg-slate-50/50 dark:bg-slate-900/10">
                  <th className="p-4 font-semibold">Category</th>
                  <th className="p-4 font-semibold">Description</th>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Receipt</th>
                  <th className="p-4 font-semibold text-right">Amount</th>
                  <th className="p-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No expense records found matching current query.
                    </td>
                  </tr>
                ) : (
                  expenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-900/10">
                      <td className="p-4">
                        <Badge className={`border ${getCategoryBadgeClass(exp.category?.categoryName || '')}`}>
                          {exp.category?.categoryName || 'General'}
                        </Badge>
                      </td>
                      <td className="p-4 text-slate-800 dark:text-slate-200 font-medium">
                        {exp.description || '—'}
                      </td>
                      <td className="p-4 text-slate-500 font-sans">
                        {new Date(exp.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-4">
                        {exp.receiptImageUrl ? (
                          <button
                            type="button"
                            onClick={() => handleOpenReceiptPreview(exp.receiptImageUrl!)}
                            className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 dark:text-cyan-400 hover:underline cursor-pointer"
                          >
                            <Image className="w-3.5 h-3.5" /> View Receipt
                          </button>
                        ) : (
                          <span className="text-slate-400 text-xs italic">None</span>
                        )}
                      </td>
                      <td className="p-4 text-right font-extrabold text-slate-900 dark:text-white font-mono">
                        {fmt(exp.amount)}
                      </td>
                      <td className="p-4 text-right">
                        {exp.category?.categoryName !== 'Salaries' ? (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteExpense(exp.id)} className="text-rose-600">
                            Delete
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Auto Locked</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ─── MODALS ─── */}

      {/* Record Expense Modal */}
      <Modal open={addExpenseModalOpen} onClose={() => setAddExpenseModalOpen(false)}>
        <form onSubmit={handleAddExpense} className="space-y-4">
          <CardHeader>
            <CardTitle>Record Manual Expense</CardTitle>
            <CardDescription>Enter financial parameters and upload transaction receipts.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Expense Category
              </label>
              <Select
                value={expenseForm.categoryId}
                onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value })}
                required
              >
                <option value="">Select Category</option>
                {categories
                  .filter((c) => c.categoryName !== 'Salaries')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.categoryName}
                    </option>
                  ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Amount (£)
              </label>
              <Input
                type="number"
                step="0.01"
                placeholder="e.g. 150.00"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Transaction Date
              </label>
              <Input
                type="date"
                value={expenseForm.date}
                onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Description / Vendor details
              </label>
              <Input
                placeholder="e.g. Printer inks / office desk repair"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Upload Receipt Image/PDF
              </label>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.pdf"
                onChange={handleFileChange}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
              />
              {uploading && <p className="text-xs text-cyan-600 mt-1">Uploading file...</p>}
              {selectedFile && !uploading && <p className="text-xs text-slate-500 mt-1">Selected: {selectedFile.name}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setAddExpenseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving || uploading}>
              {saving ? 'Recording...' : 'Post Expense'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Add Custom Category Modal */}
      <Modal open={addCategoryModalOpen} onClose={() => setAddCategoryModalOpen(false)}>
        <form onSubmit={handleAddCategory} className="space-y-4">
          <CardHeader>
            <CardTitle>Add Expense Category</CardTitle>
            <CardDescription>Configure custom categories for tracking non-payroll overheads.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                Category Name
              </label>
              <Input
                placeholder="e.g. IT Equipment / Marketing"
                value={categoryNameInput}
                onChange={(e) => setCategoryNameInput(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 border-slate-100 dark:border-slate-800">
            <Button type="button" variant="ghost" onClick={() => setAddCategoryModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {saving ? 'Creating...' : 'Create Category'}
            </Button>
          </CardFooter>
        </form>
      </Modal>

      {/* Receipt Preview Modal */}
      <Modal open={receiptPreviewModalOpen} onClose={() => setReceiptPreviewModalOpen(false)}>
        <div className="space-y-4 w-full">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle>Receipt Document Preview</CardTitle>
              <CardDescription>Transaction audit record image/document.</CardDescription>
            </div>
            <button type="button" onClick={() => setReceiptPreviewModalOpen(false)} className="text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </CardHeader>
          <CardContent className="flex justify-center items-center min-h-60 p-5 bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-100 dark:border-slate-800">
            {!selectedReceiptUrl ? (
              <div className="text-sm text-slate-500">Loading receipt…</div>
            ) : selectedReceiptIsPdf ? (
              <iframe src={selectedReceiptUrl} className="w-full h-[450px] rounded-xl" title="Receipt PDF Preview" />
            ) : (
              <img src={selectedReceiptUrl} className="max-w-full max-h-[450px] object-contain rounded-xl shadow" alt="Receipt Upload" />
            )}
          </CardContent>
        </div>
      </Modal>
    </div>
  )
}
