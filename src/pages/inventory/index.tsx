import { useEffect, useState, useMemo } from 'react'
import { useAuthStore } from '@/stores/auth'
import {
  products as productsApi,
  stock as stockApi,
  inventory as inventoryApi,
  clients as clientsApi,
  warehouseLocations as locationsApi,
} from '@/api'
import type { Product } from '@/api/products'
import type { StockLevel } from '@/api/stock'
import type { InventoryLedgerEntry } from '@/api/inventory'
import {
  Button,
  Card,
  CardContent,
  Badge,
  Input,
  Select,
  Modal,
} from '@/components/Shared Components'

export default function InventoryPage() {
  const role = useAuthStore((s) => s.role)
  const currentUserId = useAuthStore((s) => s.userId)
  const isAdmin = role === 'admin'

  // Tabs
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'ledgers'>('products')

  // Global Data States
  const [products, setProducts] = useState<Product[]>([])
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [ledgers, setLedgers] = useState<InventoryLedgerEntry[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Custom Toast State (No JS Alerts)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type })
  }

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  // Modals Toggles
  const [productModalOpen, setProductModalOpen] = useState(false)
  const [deactivateConfirmOpen, setDeactivateConfirmOpen] = useState(false)
  const [adjustStockOpen, setAdjustStockOpen] = useState(false)

  // Product Form State
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [clientId, setClientId] = useState('')
  const [skuCode, setSkuCode] = useState('')
  const [barcode, setBarcode] = useState('')
  const [productName, setProductName] = useState('')
  const [colour, setColour] = useState('')
  const [size, setSize] = useState('')
  const [weight, setWeight] = useState('')
  const [thresholdLimit, setThresholdLimit] = useState(0)
  const [productSaving, setProductSaving] = useState(false)

  // Stock Adjustment Form State
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustMovementType, setAdjustMovementType] = useState<'CHECKIN' | 'INTERNAL_MOVE' | 'CHECKOUT'>('CHECKIN')
  const [adjustFromLocationId, setAdjustFromLocationId] = useState('')
  const [adjustToLocationId, setAdjustToLocationId] = useState('')
  const [adjustQuantity, setAdjustQuantity] = useState(1)
  const [adjustReferenceId, setAdjustReferenceId] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)

  // Search/Filters
  const [skuSearch, setSkuSearch] = useState('')
  const [productNameSearch, setProductNameSearch] = useState('')

  const loadData = async () => {
    setLoading(true)
    try {
      const [prodsData, stockData, ledgersData, clientsData, locsData] = await Promise.all([
        productsApi.getAllProducts(),
        stockApi.getAllStockLevels(),
        inventoryApi.getAllInventoryLedgers().catch(() => [] as any[]),
        isAdmin ? clientsApi.getAllClients().catch(() => []) : Promise.resolve([]),
        locationsApi.getAllWarehouseLocations().catch(() => []),
      ])

      setProducts(prodsData || [])
      setStockLevels(stockData || [])
      setLedgers(Array.isArray(ledgersData) ? ledgersData : [])
      setClients(clientsData || [])
      setLocations(locsData || [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to sync inventory database.', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [isAdmin])

  // Save/Edit Product
  const handleOpenAddProduct = () => {
    setSelectedProduct(null)
    setClientId(clients[0]?.id || '')
    setSkuCode('')
    setBarcode('')
    setProductName('')
    setColour('')
    setSize('')
    setWeight('')
    setThresholdLimit(5)
    setProductModalOpen(true)
  }

  const handleOpenEditProduct = (prod: Product) => {
    setSelectedProduct(prod)
    setClientId(prod.clientId)
    setSkuCode(prod.skuCode)
    setBarcode(prod.barcode || '')
    setProductName(prod.productName)
    setColour(prod.colour || '')
    setSize(prod.size || '')
    setWeight(prod.weight ? String(prod.weight) : '')
    setThresholdLimit(prod.thresholdLimit)
    setProductModalOpen(true)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientId || !skuCode || !productName) {
      showToast('Client, SKU Code, and Product Name are required.', 'error')
      return
    }

    setProductSaving(true)
    try {
      const payload = {
        clientId,
        skuCode,
        barcode: barcode || null,
        productName,
        colour: colour || null,
        size: size || null,
        weight: weight ? Number(weight) : null,
        thresholdLimit: Number(thresholdLimit),
      }

      if (selectedProduct) {
        await productsApi.updateProduct(selectedProduct.id, payload)
        showToast('Product updated successfully.')
      } else {
        await productsApi.createProduct(payload)
        showToast('Product catalog SKU registered successfully.')
      }

      setProductModalOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to save product.', 'error')
    } finally {
      setProductSaving(false)
    }
  }

  // Deactivate Product Action
  const handleToggleDeactivate = async () => {
    if (!selectedProduct) return
    try {
      await productsApi.deactivateProduct(selectedProduct.id)
      showToast(
        selectedProduct.isDeactivated
          ? 'Product has been reactivated successfully.'
          : 'Product has been deactivated successfully.'
      )
      setDeactivateConfirmOpen(false)
      setSelectedProduct(null)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Action failed.', 'error')
    }
  }

  // Stock Adjustment
  const handleOpenAdjustStock = () => {
    if (products.length === 0) {
      showToast('Please register at least one product first.', 'error')
      return
    }
    setAdjustProductId(products[0]?.id || '')
    setAdjustMovementType('CHECKIN')
    setAdjustFromLocationId(locations[0]?.id || '')
    setAdjustToLocationId(locations[0]?.id || '')
    setAdjustQuantity(1)
    setAdjustReferenceId('')
    setAdjustNotes('')
    setAdjustStockOpen(true)
  }

  const handleSaveStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUserId) {
      showToast('Session expired. Please log in again.', 'error')
      return
    }
    if (adjustQuantity <= 0) {
      showToast('Quantity must be greater than zero.', 'error')
      return
    }

    setAdjustSaving(true)
    try {
      const payload: any = {
        productId: adjustProductId,
        movementType: adjustMovementType,
        quantity: Number(adjustQuantity),
        userId: currentUserId,
        notes: adjustNotes || null,
      }

      if (adjustMovementType === 'CHECKIN') {
        payload.toLocationId = adjustToLocationId
      } else if (adjustMovementType === 'CHECKOUT') {
        payload.fromLocationId = adjustFromLocationId
        payload.referenceId = adjustReferenceId
        if (!adjustReferenceId) {
          showToast('Reference ID (Shipment ID) is required for Checkout movements.', 'error')
          setAdjustSaving(false)
          return
        }
      } else if (adjustMovementType === 'INTERNAL_MOVE') {
        payload.fromLocationId = adjustFromLocationId
        payload.toLocationId = adjustToLocationId
        if (adjustFromLocationId === adjustToLocationId) {
          showToast('Source and destination locations must be different.', 'error')
          setAdjustSaving(false)
          return
        }
      }

      await inventoryApi.createInventoryLedgerEntry(payload)
      showToast('Inventory adjusted and stock level updated successfully.')
      setAdjustStockOpen(false)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to adjust stock.', 'error')
    } finally {
      setAdjustSaving(false)
    }
  }

  // Memoized KPIs
  const activeSKUsCount = useMemo(() => products.filter((p) => !p.isDeactivated).length, [products])
  
  const lowStockCount = useMemo(() => {
    return products.filter((p) => {
      if (p.isDeactivated) return false
      const prodStocks = stockLevels.filter((s) => s.productId === p.id)
      const totalStock = prodStocks.reduce((sum, curr) => sum + curr.currentQuantity, 0)
      return totalStock < p.thresholdLimit
    }).length
  }, [products, stockLevels])

  const totalStockUnits = useMemo(
    () => stockLevels.reduce((sum, curr) => sum + curr.currentQuantity, 0),
    [stockLevels]
  )

  // Filtered Lists
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchSku = p.skuCode.toLowerCase().includes(skuSearch.toLowerCase())
      const matchName = p.productName.toLowerCase().includes(productNameSearch.toLowerCase())
      return matchSku && matchName
    })
  }, [products, skuSearch, productNameSearch])

  const formatWeight = (w?: any) => {
    if (w === undefined || w === null) return '—'
    return `${Number(w).toFixed(2)} kg`
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto relative">
      {/* Toast Alert popup (Custom Notification) */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[100] rounded-2xl border p-4 shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/90 dark:border-emerald-800 dark:text-emerald-100'
              : 'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/90 dark:border-rose-800 dark:text-rose-100'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}
          />
          <span className="text-sm font-medium">{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="ml-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-base"
          >
            ×
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inventory & Stock Control</h1>
          <p className="text-sm text-slate-500 mt-1">
            Track product specifications, adjust physical stock levels, and review the double-entry movement ledger.
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleOpenAdjustStock}>
              Adjust Stock Level
            </Button>
            <Button onClick={handleOpenAddProduct}>
              Add Product SKU
            </Button>
          </div>
        )}
      </div>

      {/* KPIs Grid */}
      <div className="flex flex-col sm:flex-row gap-4 w-full">
        {[
          { label: 'Active SKUs registered', value: activeSKUsCount, color: 'text-indigo-700 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300' },
          { label: 'Low Stock Alerts', value: lowStockCount, color: lowStockCount > 0 ? 'text-rose-700 bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300' : 'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300' },
          { label: 'Total Units Stocked', value: totalStockUnits, color: 'text-teal-700 bg-teal-50 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900 dark:text-teal-300' },
        ].map(({ label, value, color }) => (
          <div key={label} className={`flex-1 border rounded-2xl p-5 shadow-sm flex flex-col justify-between ${color}`}>
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold opacity-80">{label}</p>
              <p className="text-3xl font-extrabold mt-1">{value}</p>
            </div>
            <Badge variant="secondary" className="w-fit mt-2">Active</Badge>
          </div>
        ))}
      </div>

      {/* Workspace Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
        {[
          { id: 'products', label: 'SKU Products Catalog' },
          { id: 'stock', label: 'Stock Allocations' },
          { id: 'ledgers', label: 'Inventory Movement Ledger' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-3 text-sm font-semibold border-b-2 transition-all ${
              activeTab === t.id
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Main Workspace content */}
      <Card className="shadow-md border-slate-200 dark:border-slate-800">
        <CardContent className="p-6">
          {loading ? (
            <div className="py-12 text-center text-slate-500">Loading database components...</div>
          ) : (
            <>
              {/* TAB 1: PRODUCT CATALOG */}
              {activeTab === 'products' && (
                <div className="space-y-4">
                  {/* Search filters */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Input
                      placeholder="Search by SKU code..."
                      value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                      className="max-w-xs"
                    />
                    <Input
                      placeholder="Search by Product name..."
                      value={productNameSearch}
                      onChange={(e) => setProductNameSearch(e.target.value)}
                      className="max-w-xs"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                          <th className="pb-3 font-semibold">SKU Code</th>
                          <th className="pb-3 font-semibold">Product Name</th>
                          <th className="pb-3 font-semibold">Attributes (Colour / Size)</th>
                          <th className="pb-3 font-semibold">Weight</th>
                          <th className="pb-3 font-semibold">Threshold Limit</th>
                          <th className="pb-3 font-semibold">Client Company</th>
                          <th className="pb-3 font-semibold">Status</th>
                          {isAdmin && <th className="pb-3 font-semibold text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                        {filteredProducts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="py-8 text-center text-slate-400">
                              No products found matching filters.
                            </td>
                          </tr>
                        ) : (
                          filteredProducts.map((p) => {
                            const isLow =
                              stockLevels
                                .filter((s) => s.productId === p.id)
                                .reduce((sum, s) => sum + s.currentQuantity, 0) < p.thresholdLimit

                            return (
                              <tr key={p.id} className={p.isDeactivated ? 'opacity-50' : ''}>
                                <td className="py-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {p.skuCode}
                                </td>
                                <td className="py-4">
                                  <div className="font-semibold">{p.productName}</div>
                                  {p.barcode && (
                                    <span className="text-xs text-slate-400 font-mono block">
                                      Barcode: {p.barcode}
                                    </span>
                                  )}
                                </td>
                                <td className="py-4 text-slate-600 dark:text-slate-400">
                                  {[p.colour, p.size].filter(Boolean).join(' / ') || '—'}
                                </td>
                                <td className="py-4 text-slate-600 dark:text-slate-400">
                                  {formatWeight(p.weight)}
                                </td>
                                <td className="py-4">
                                  <div className="flex items-center gap-1.5">
                                    <span>{p.thresholdLimit} units</span>
                                    {isLow && !p.isDeactivated && (
                                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 font-medium text-slate-700 dark:text-slate-300">
                                  {p.client?.companyName || '—'}
                                </td>
                                <td className="py-4">
                                  <Badge variant={p.isDeactivated ? 'secondary' : 'default'}>
                                    {p.isDeactivated ? 'Deactivated' : 'Active'}
                                  </Badge>
                                </td>
                                {isAdmin && (
                                  <td className="py-4 text-right">
                                    <div className="flex justify-end gap-1.5">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleOpenEditProduct(p)}
                                      >
                                        Edit
                                      </Button>
                                      <Button
                                        variant={p.isDeactivated ? 'secondary' : 'destructive'}
                                        size="sm"
                                        onClick={() => {
                                          setSelectedProduct(p)
                                          setDeactivateConfirmOpen(true)
                                        }}
                                      >
                                        {p.isDeactivated ? 'Reactivate' : 'Deactivate'}
                                      </Button>
                                    </div>
                                  </td>
                                )}
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: STOCK ALLOCATION */}
              {activeTab === 'stock' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                          <th className="pb-3 font-semibold">Product SKU</th>
                          <th className="pb-3 font-semibold">Location Zone</th>
                          <th className="pb-3 font-semibold">On-Hand Quantity</th>
                          <th className="pb-3 font-semibold">Reserved Quantity</th>
                          <th className="pb-3 font-semibold">Available Quantity</th>
                          <th className="pb-3 font-semibold">Arrived Today</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                        {stockLevels.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              No stock allocations recorded. Adjust stock or check-in inventory.
                            </td>
                          </tr>
                        ) : (
                          stockLevels.map((sl) => (
                            <tr key={sl.id}>
                              <td className="py-4">
                                <span className="font-mono font-bold block text-slate-800 dark:text-slate-200">
                                  {sl.product?.skuCode}
                                </span>
                                <span className="text-xs text-slate-400">{sl.product?.productName}</span>
                              </td>
                              <td className="py-4 font-semibold text-slate-700 dark:text-slate-300">
                                {sl.location?.locationName || 'Unassigned Slot'}
                                {sl.location?.zone && (
                                  <span className="block font-normal text-xs text-slate-400">
                                    Zone {sl.location.zone} | Shelf {sl.location.shelf} | Bin {sl.location.bin}
                                  </span>
                                )}
                              </td>
                              <td className="py-4 font-bold text-slate-800 dark:text-slate-200">
                                {sl.currentQuantity} units
                              </td>
                              <td className="py-4 text-amber-600 font-medium">
                                {sl.reservedQuantity} units
                              </td>
                              <td className="py-4 text-emerald-600 font-bold">
                                {sl.currentQuantity - sl.reservedQuantity} units
                              </td>
                              <td className="py-4 text-slate-500">
                                {sl.arrivedTodayQuantity || 0}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: MOVEMENT LEDGER */}
              {activeTab === 'ledgers' && (
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                          <th className="pb-3 font-semibold">Timestamp</th>
                          <th className="pb-3 font-semibold">Movement Type</th>
                          <th className="pb-3 font-semibold">Product SKU</th>
                          <th className="pb-3 font-semibold">Quantity</th>
                          <th className="pb-3 font-semibold">Routing Slot (From → To)</th>
                          <th className="pb-3 font-semibold">Reference ID / Notes</th>
                          <th className="pb-3 font-semibold text-right">Auditor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                        {ledgers.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-400">
                              No inventory movements logged.
                            </td>
                          </tr>
                        ) : (
                          [...ledgers]
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .map((l) => (
                              <tr key={l.id}>
                                <td className="py-4 text-xs font-mono text-slate-500">
                                  {new Date(l.timestamp).toLocaleString()}
                                </td>
                                <td className="py-4">
                                  <Badge
                                    variant={
                                      l.movementType === 'CHECKIN'
                                        ? 'default'
                                        : l.movementType === 'CHECKOUT'
                                          ? 'destructive'
                                          : 'secondary'
                                    }
                                  >
                                    {l.movementType}
                                  </Badge>
                                </td>
                                <td className="py-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {l.product?.skuCode || '—'}
                                </td>
                                <td className="py-4 font-semibold text-slate-800 dark:text-slate-200">
                                  {l.quantity} units
                                </td>
                                <td className="py-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                                  {l.fromLocation?.locationName || 'Supplier'} →{' '}
                                  {l.toLocation?.locationName || 'Dispatch'}
                                </td>
                                <td className="py-4">
                                  {l.referenceId && (
                                    <span className="font-mono text-xs text-cyan-600 block">
                                      Ref: {l.referenceId}
                                    </span>
                                  )}
                                  {l.notes && <span className="text-slate-500 text-xs block">{l.notes}</span>}
                                </td>
                                <td className="py-4 text-right text-xs">
                                  <div className="font-semibold text-slate-700 dark:text-slate-300">
                                    {l.user?.firstName} {l.user?.lastName}
                                  </div>
                                  <div className="text-slate-400">{l.user?.email}</div>
                                </td>
                              </tr>
                            ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ────────────────────────────────── MODAL: SAVE PRODUCT ────────────────────────────────── */}
      <Modal
        open={productModalOpen}
        onClose={() => setProductModalOpen(false)}
        title={selectedProduct ? 'Modify SKU product' : 'Register New SKU Product'}
        description="Register a unique stock-keeping unit barcode and threshold limits."
        size="md"
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setProductModalOpen(false)} disabled={productSaving}>
              Cancel
            </Button>
            <Button type="submit" form="save-product-form" disabled={productSaving}>
              {productSaving ? 'Saving SKU...' : 'Save Product'}
            </Button>
          </div>
        }
      >
        <form id="save-product-form" onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Client Owner *
            </label>
            <Select value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                SKU Code *
              </label>
              <Input
                placeholder="PRO-PK-T-BLUE"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Barcode (optional)
              </label>
              <Input
                placeholder="501234567890"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Product Name *
            </label>
            <Input
              placeholder="Polyester packing tape blue"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Colour
              </label>
              <Input placeholder="Blue" value={colour} onChange={(e) => setColour(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Size
              </label>
              <Input placeholder="Large" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Weight (kg)
              </label>
              <Input
                type="number"
                step="0.001"
                placeholder="0.25"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Low Stock Threshold Limit *
            </label>
            <Input
              type="number"
              min="0"
              value={thresholdLimit}
              onChange={(e) => setThresholdLimit(parseInt(e.target.value) || 0)}
              required
            />
          </div>
        </form>
      </Modal>

      {/* ──────────────────────────────── MODAL: CONFIRM DEACTIVATION ──────────────────────────────── */}
      <Modal
        open={deactivateConfirmOpen}
        onClose={() => setDeactivateConfirmOpen(false)}
        title={selectedProduct?.isDeactivated ? 'Reactivate product SKU' : 'Deactivate product SKU'}
        description="Verify this operations action. Deactivating a product does not delete existing stock data but hides it in core shipping selectors."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeactivateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={selectedProduct?.isDeactivated ? 'default' : 'destructive'}
              onClick={handleToggleDeactivate}
            >
              Confirm Action
            </Button>
          </div>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Are you sure you want to {selectedProduct?.isDeactivated ? 'reactivate' : 'deactivate'}{' '}
          <strong className="font-mono">{selectedProduct?.skuCode}</strong> ({selectedProduct?.productName})?
        </p>
      </Modal>

      {/* ────────────────────────────────── MODAL: ADJUST STOCK ────────────────────────────────── */}
      <Modal
        open={adjustStockOpen}
        onClose={() => setAdjustStockOpen(false)}
        title="Record Inventory Stock Adjustment"
        description="Enter double-entry logistics check-ins, check-outs or internal moves."
        size="md"
        contentClassName="space-y-4"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdjustStockOpen(false)} disabled={adjustSaving}>
              Cancel
            </Button>
            <Button type="submit" form="adjust-stock-form" disabled={adjustSaving}>
              {adjustSaving ? 'Saving Adjustment...' : 'Record Transaction'}
            </Button>
          </div>
        }
      >
        <form id="adjust-stock-form" onSubmit={handleSaveStockAdjustment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Select Product SKU *
            </label>
            <Select value={adjustProductId} onChange={(e) => setAdjustProductId(e.target.value)} required>
              {products
                .filter((p) => !p.isDeactivated)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.skuCode}] {p.productName}
                  </option>
                ))}
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Logistics Movement Type *
              </label>
              <Select
                value={adjustMovementType}
                onChange={(e) => setAdjustMovementType(e.target.value as any)}
                required
              >
                <option value="CHECKIN">CHECKIN (Inbound Supplier)</option>
                <option value="INTERNAL_MOVE">INTERNAL_MOVE (Move Slots)</option>
                <option value="CHECKOUT">CHECKOUT (Outbound Dispatch)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Quantity *
              </label>
              <Input
                type="number"
                min="1"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 1)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Show Source Slot for checkout/move */}
            {(adjustMovementType === 'CHECKOUT' || adjustMovementType === 'INTERNAL_MOVE') && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Source Slot (From) *
                </label>
                <Select
                  value={adjustFromLocationId}
                  onChange={(e) => setAdjustFromLocationId(e.target.value)}
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.locationName} (Zone {loc.zone || '—'})
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Show Destination Slot for checkin/move */}
            {(adjustMovementType === 'CHECKIN' || adjustMovementType === 'INTERNAL_MOVE') && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                  Destination Slot (To) *
                </label>
                <Select
                  value={adjustToLocationId}
                  onChange={(e) => setAdjustToLocationId(e.target.value)}
                  required
                >
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.locationName} (Zone {loc.zone || '—'})
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Show reference shipment input only for check-out */}
          {adjustMovementType === 'CHECKOUT' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Reference ID (Shipment ID) *
              </label>
              <Input
                placeholder="Logistics UUID matching a Dispatched shipment"
                value={adjustReferenceId}
                onChange={(e) => setAdjustReferenceId(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Transaction Notes
            </label>
            <Input
              placeholder="e.g. Weekly manual stock verification or slot relocation"
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  )
}
