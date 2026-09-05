import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router'

import { useAuthStore } from '@/stores/auth'
import {
  products as productsApi,
  stock as stockApi,
  inventory as inventoryApi,
  clients as clientsApi,
  warehouseLocations as locationsApi,
  auditLogs as auditLogsApi,
} from '@/api'
import type { Product, ProductDetail, ScanMatch } from '@/api/products'
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
import { BarcodeScanner } from '@/components/scanner'
import { useDefaultSelection } from '@/hooks/useDefaultSelection'
import { ScanResultPanel } from '@/features/inventory/ScanResultPanel'
import { CheckInPanel } from '@/features/inventory/CheckInPanel'
import JsBarcode from 'jsbarcode'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function InventoryPage() {
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.role)
  const currentUserId = useAuthStore((s) => s.userId)
  const isAdmin = role === 'admin'
  // Admins and employees are both full inventory operators; only admin-exclusive
  // surfaces (audit logs) stay behind isAdmin.
  const isStaff = role === 'admin' || role === 'employee'

  // Tabs
  const [activeTab, setActiveTab] = useState<'products' | 'stock' | 'ledgers' | 'daily-checkout' | 'audit-logs'>('products')

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
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [adjustStockOpen, setAdjustStockOpen] = useState(false)
  const [auditLogs, setAuditLogs] = useState<any[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [ledgerDetailOpen, setLedgerDetailOpen] = useState(false)
  const [selectedLedgerEntry, setSelectedLedgerEntry] = useState<InventoryLedgerEntry | null>(null)
  const [clientContactOpen, setClientContactOpen] = useState(false)
  const [selectedClientDetail, setSelectedClientDetail] = useState<any>(null)
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false)
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null)
  const barcodeRef = useRef<SVGSVGElement | null>(null)

  // Product detail modal (US: click a product to see everything about it)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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

  // Opening stock, folded into the Add Product form so registering a SKU and
  // putting it on a shelf is one step instead of two dialogs.
  const [withOpeningStock, setWithOpeningStock] = useState(false)
  const [openingLocationId, setOpeningLocationId] = useState('')
  const [openingQuantity, setOpeningQuantity] = useState(1)

  // Stock Adjustment Form State
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustMovementType, setAdjustMovementType] = useState<
    'CHECKIN' | 'INTERNAL_MOVE' | 'CHECKOUT' | 'ADJUSTMENT'
  >('CHECKIN')
  const [adjustFromLocationId, setAdjustFromLocationId] = useState('')
  const [adjustToLocationId, setAdjustToLocationId] = useState('')
  const [adjustQuantity, setAdjustQuantity] = useState(1)
  const [adjustReferenceId, setAdjustReferenceId] = useState('')
  const [adjustNotes, setAdjustNotes] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [deactivateSaving, setDeactivateSaving] = useState(false)

  // Product picker search inside the Adjust Stock modal
  const [adjustProductSearch, setAdjustProductSearch] = useState('')

  // Search/Filters (Products tab)
  const [skuSearch, setSkuSearch] = useState('')
  const [productNameSearch, setProductNameSearch] = useState('')
  const [hideDeactivated, setHideDeactivated] = useState(false)

  // Stock tab filters (US-041)
  const [stockClientFilter, setStockClientFilter] = useState('')
  const [stockLocationFilter, setStockLocationFilter] = useState('')

  // Ledger tab filters (US-058/059/060)
  const [ledgerStartDate, setLedgerStartDate] = useState('')
  const [ledgerEndDate, setLedgerEndDate] = useState('')
  const [ledgerClientFilter, setLedgerClientFilter] = useState('')
  const [ledgerMovementType, setLedgerMovementType] = useState('')
  const [ledgerProductSearch, setLedgerProductSearch] = useState('')
  const [ledgerFiltering, setLedgerFiltering] = useState(false)

  // Daily Checkout tab (US-053/054)
  const [dailyCheckoutDate, setDailyCheckoutDate] = useState(() => new Date().toISOString().split('T')[0])
  const [dailyCheckoutData, setDailyCheckoutData] = useState<any[]>([])
  const [dailyCheckoutLoading, setDailyCheckoutLoading] = useState(false)

  const loadData = async () => {
    setLoading(true)
    try {
      const [prodsData, stockData, ledgersData, clientsData, locsData] = await Promise.all([
        productsApi.getAllProducts().catch(() => [] as Product[]),
        stockApi.getAllStockLevels().catch(() => [] as StockLevel[]),
        inventoryApi.getAllInventoryLedgers().catch(() => [] as any[]),
        // Employees get the slim lookup: enough to attribute a product to a client,
        // without exposing client contact details.
        isAdmin
          ? clientsApi.getAllClients().catch(() => [])
          : clientsApi.getClientLookup().catch(() => []),
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
  }, [role])

  // Dropdown defaults are seeded when a modal opens, which is a moment that can
  // arrive before these lists do. Re-seeding as they land stops a select from
  // displaying a choice its state does not hold — the failure that made
  // registering a product with opening stock refuse to save.
  useDefaultSelection(clientId, setClientId, clients, !selectedProduct)
  useDefaultSelection(openingLocationId, setOpeningLocationId, locations)
  useDefaultSelection(adjustToLocationId, setAdjustToLocationId, locations)
  useDefaultSelection(adjustFromLocationId, setAdjustFromLocationId, locations)

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
    setWithOpeningStock(false)
    setOpeningLocationId(locations[0]?.id || '')
    setOpeningQuantity(1)
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
    setWithOpeningStock(false)
    setProductModalOpen(true)
  }

  // ── Scanning ───────────────────────────────────────────────────────────────
  // Two modes off the same scanner: 'find' jumps to the product, 'checkin' books
  // stock against a bin and keeps the camera running for the next carton.
  const [scanMode, setScanMode] = useState<'find' | 'checkin' | null>(null)
  const [scanResultOpen, setScanResultOpen] = useState(false)
  const [scannedCode, setScannedCode] = useState('')
  const [scanMatches, setScanMatches] = useState<ScanMatch[]>([])
  const [scanNotFound, setScanNotFound] = useState(false)
  const [scanLoading, setScanLoading] = useState(false)
  const [checkInProduct, setCheckInProduct] = useState<ScanMatch | null>(null)

  const resolveScan = async (code: string) => {
    setScannedCode(code)
    setScanLoading(true)
    setScanNotFound(false)
    setScanMatches([])
    setCheckInProduct(null)
    setScanResultOpen(true)
    try {
      const { matches } = await productsApi.lookupByCode(code)
      setScanMatches(matches)
      // Exactly one match in check-in mode goes straight to the booking form —
      // on a goods-in bench an extra confirmation per carton is a real cost.
      if (matches.length === 1 && scanMode === 'checkin') {
        setCheckInProduct(matches[0])
      }
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setScanNotFound(true)
      } else {
        showToast(err?.response?.data?.error || err?.message || 'Lookup failed.', 'error')
        setScanResultOpen(false)
      }
    } finally {
      setScanLoading(false)
    }
  }

  const closeScanResult = () => {
    setScanResultOpen(false)
    setScanMatches([])
    setScanNotFound(false)
    setCheckInProduct(null)
    setScannedCode('')
  }

  /**
   * A scan that matched nothing, turned into a new product.
   *
   * Opens the ordinary product form with the scanned code already in the
   * barcode field; client, SKU and the rest are typed by the operator. Opening
   * stock lives in the same form, so one pass registers the SKU and puts it on
   * a shelf — which is the whole point of scanning something in off the van.
   */
  const handleCreateFromScan = (code: string) => {
    closeScanResult()
    setScanMode(null)
    handleOpenAddProduct()
    setBarcode(code)
  }

  const handleScanPick = async (picked: ScanMatch | Product) => {
    if (scanMode === 'checkin') {
      setCheckInProduct(picked as ScanMatch)
      return
    }
    closeScanResult()
    setScanMode(null)
    await handleOpenDetail(picked as Product)
  }

  // Product detail — one request returns product, stock by location and recent movements
  const handleOpenDetail = async (prod: Product) => {
    setSelectedProduct(prod)
    setDetail(null)
    setDetailOpen(true)
    setDetailLoading(true)
    try {
      setDetail(await productsApi.getProductAndStockLevelById(prod.id))
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load product details.', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (productSaving) return
    
    if (!clientId || !skuCode || !productName) {
      showToast('Client, SKU Code, and Product Name are required.', 'error')
      return
    }

    // SKUs are unique per client, so a clash only matters within one. This is
    // the guard that lets create-from-scan exist: a mis-typed or mis-scanned
    // code stops here rather than becoming a second SKU nobody can tell apart.
    if (!selectedProduct) {
      const clash = products.find(
        (p) =>
          p.clientId === clientId &&
          p.skuCode.trim().toLowerCase() === skuCode.trim().toLowerCase(),
      )
      if (clash) {
        showToast(
          `${clients.find((c) => c.id === clientId)?.companyName ?? 'This client'} already has SKU ${clash.skuCode} (${clash.productName}). Use a different SKU, or attach the barcode to that product instead.`,
          'error',
        )
        return
      }
    }

    const addingOpeningStock = !selectedProduct && withOpeningStock
    if (addingOpeningStock) {
      if (!openingLocationId) {
        showToast('Select a location for the opening stock.', 'error')
        return
      }
      if (openingQuantity <= 0) {
        showToast('Opening stock quantity must be greater than zero.', 'error')
        return
      }
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
        await productsApi.createProduct({
          ...payload,
          ...(addingOpeningStock
            ? {
                initialStock: {
                  locationId: openingLocationId,
                  quantity: Number(openingQuantity),
                },
              }
            : {}),
        })
        showToast(
          addingOpeningStock
            ? `SKU registered with ${openingQuantity} units of opening stock.`
            : 'Product catalog SKU registered successfully.'
        )
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
    if (!selectedProduct || deactivateSaving) return
    setDeactivateSaving(true)
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
    } finally {
      setDeactivateSaving(false)
    }
  }

  // Delete Product Action (US-099)
  const handleDeleteProduct = async () => {
    if (!selectedProduct || productSaving) return
    setProductSaving(true)
    try {
      await productsApi.deleteProduct(selectedProduct.id)
      showToast('Product has been deleted successfully.')
      setDeleteConfirmOpen(false)
      setSelectedProduct(null)
      await loadData()
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to delete product.', 'error')
    } finally {
      setProductSaving(false)
    }
  }

  // Stock Adjustment.
  // Pass a product to skip the picker entirely — this is the common case, opened
  // from a product row or the detail modal.
  const handleOpenAdjustStock = (preselect?: Product) => {
    if (products.length === 0) {
      showToast('Please register at least one product first.', 'error')
      return
    }
    setAdjustProductId(preselect?.id || products[0]?.id || '')
    setAdjustProductSearch('')
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
    if (adjustSaving) return
    
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
      } else if (adjustMovementType === 'ADJUSTMENT') {
        // Stock leaving with no shipment behind it. The reason is the only
        // record of why, so it is required here as well as on the server —
        // catching it before the round trip keeps the typed quantity on screen.
        payload.fromLocationId = adjustFromLocationId
        if (!adjustNotes.trim()) {
          showToast('Say what happened to the stock — a write-off needs a reason.', 'error')
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

  // US-058/059/060: Apply ledger filters
  const handleApplyLedgerFilters = async () => {
    setLedgerFiltering(true)
    try {
      const hasAnyFilter = ledgerStartDate || ledgerEndDate || ledgerClientFilter || ledgerMovementType || ledgerProductSearch
      if (hasAnyFilter) {
        // Find productId from search text
        let productId: string | undefined
        if (ledgerProductSearch) {
          const match = products.find(
            (p) =>
              p.skuCode.toLowerCase().includes(ledgerProductSearch.toLowerCase()) ||
              p.productName.toLowerCase().includes(ledgerProductSearch.toLowerCase())
          )
          productId = match?.id
        }
        const filtered = await inventoryApi.getLedgerWithFilters({
          startDate: ledgerStartDate || undefined,
          endDate: ledgerEndDate || undefined,
          clientId: ledgerClientFilter || undefined,
          movementType: ledgerMovementType || undefined,
          productId,
        })
        setLedgers(Array.isArray(filtered) ? filtered : [])
      } else {
        const all = await inventoryApi.getAllInventoryLedgers()
        setLedgers(Array.isArray(all) ? all : [])
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to apply filters.', 'error')
    } finally {
      setLedgerFiltering(false)
    }
  }

  const handleClearLedgerFilters = async () => {
    setLedgerStartDate('')
    setLedgerEndDate('')
    setLedgerClientFilter('')
    setLedgerMovementType('')
    setLedgerProductSearch('')
    setLedgerFiltering(true)
    try {
      const all = await inventoryApi.getAllInventoryLedgers()
      setLedgers(Array.isArray(all) ? all : [])
    } catch {
      // ignore
    } finally {
      setLedgerFiltering(false)
    }
  }

  // US-061/062: Generate PDF Report
  const handleGenerateLedgerPDF = () => {
    const sorted = [...ledgers].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const doc = new jsPDF({ orientation: 'landscape' })

    doc.setFontSize(18)
    doc.setTextColor(15, 23, 42)
    doc.text('ProPackers WMS — Inventory Ledger Report', 14, 20)

    doc.setFontSize(10)
    doc.setTextColor(100, 116, 139)
    const filterSummary: string[] = []
    if (ledgerStartDate) filterSummary.push(`From: ${ledgerStartDate}`)
    if (ledgerEndDate) filterSummary.push(`To: ${ledgerEndDate}`)
    if (ledgerMovementType) filterSummary.push(`Type: ${ledgerMovementType}`)
    if (ledgerClientFilter) {
      const cl = clients.find((c) => c.id === ledgerClientFilter)
      filterSummary.push(`Client: ${cl?.companyName || ledgerClientFilter}`)
    }
    if (ledgerProductSearch) filterSummary.push(`Product: ${ledgerProductSearch}`)
    doc.text(filterSummary.length > 0 ? `Filters: ${filterSummary.join(' | ')}` : 'Filters: None (showing all)', 14, 28)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 34)

    const tableData = sorted.map((l) => [
      new Date(l.timestamp).toLocaleString(),
      l.movementType,
      l.product?.skuCode || '—',
      l.product?.productName || '—',
      String(l.quantity),
      `${l.fromLocation?.locationName || 'Supplier'} → ${l.toLocation?.locationName || 'Dispatch'}`,
      `${l.user?.firstName || ''} ${l.user?.lastName || ''}`.trim() || '—',
    ])

    autoTable(doc, {
      startY: 40,
      head: [['Timestamp', 'Type', 'SKU', 'Product', 'Qty', 'From → To', 'User']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [15, 118, 110] },
    })

    // US-062: Summary totals
    const totalIn = sorted.filter((l) => l.movementType === 'CHECKIN').reduce((sum, l) => sum + l.quantity, 0)
    const totalOut = sorted.filter((l) => l.movementType === 'CHECKOUT').reduce((sum, l) => sum + l.quantity, 0)
    const totalMoves = sorted.filter((l) => l.movementType === 'INTERNAL_MOVE').reduce((sum, l) => sum + l.quantity, 0)
    const finalY = (doc as any).lastAutoTable?.finalY || 60
    doc.setFontSize(10)
    doc.setTextColor(15, 23, 42)
    doc.text(`Summary — Total Inbound: ${totalIn} units | Total Outbound: ${totalOut} units | Internal Moves: ${totalMoves} units`, 14, finalY + 10)

    doc.save(`ProPackers_Ledger_Report_${new Date().toISOString().split('T')[0]}.pdf`)
    showToast('PDF report generated and downloaded.')
  }

  // US-053/054: Load daily checkout summary
  const loadDailyCheckout = async (date: string) => {
    setDailyCheckoutLoading(true)
    try {
      const data = await inventoryApi.getDailyCheckoutSummary(date)
      setDailyCheckoutData(Array.isArray(data) ? data : [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load daily checkout data.', 'error')
      setDailyCheckoutData([])
    } finally {
      setDailyCheckoutLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'daily-checkout') {
      void loadDailyCheckout(dailyCheckoutDate)
    }
  }, [activeTab, dailyCheckoutDate])

  // US-102: Load system audit logs
  const loadAuditLogs = async () => {
    setAuditLoading(true)
    try {
      const data = await auditLogsApi.getAllAuditLogs()
      setAuditLogs(Array.isArray(data) ? data : [])
    } catch (err: any) {
      showToast(err?.response?.data?.error || err?.message || 'Failed to load audit logs.', 'error')
      setAuditLogs([])
    } finally {
      setAuditLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'audit-logs' && isAdmin) {
      void loadAuditLogs()
    }
  }, [activeTab, isAdmin])

  // US-038: Barcode generation
  const handleOpenBarcode = (prod: Product) => {
    setBarcodeProduct(prod)
    setBarcodeModalOpen(true)
  }

  useEffect(() => {
    if (barcodeModalOpen && barcodeProduct && barcodeRef.current) {
      try {
        JsBarcode(barcodeRef.current, barcodeProduct.barcode || barcodeProduct.skuCode, {
          format: 'CODE128',
          width: 2,
          height: 80,
          displayValue: true,
          fontSize: 14,
          margin: 10,
        })
      } catch {
        // fallback if format fails
      }
    }
  }, [barcodeModalOpen, barcodeProduct])

  const handlePrintBarcode = () => {
    if (!barcodeRef.current) return
    const svgContent = barcodeRef.current.outerHTML
    const printWindow = window.open('', '_blank', 'width=400,height=300')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>Barcode — ${barcodeProduct?.skuCode}</title></head>
          <body style="display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;">
            <div style="text-align:center;">
              <h3 style="font-family:monospace;margin-bottom:8px;">${barcodeProduct?.productName}</h3>
              ${svgContent}
            </div>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.focus()
      printWindow.print()
    }
  }

  // US-040: Client contact modal
  const handleOpenClientContact = (clientCompanyId: string) => {
    const client = clients.find((c) => c.id === clientCompanyId)
    if (client) {
      setSelectedClientDetail(client)
      setClientContactOpen(true)
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

  // Filtered Lists (US-044: deactivated products toggle + sort)
  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => {
      const matchSku = p.skuCode.toLowerCase().includes(skuSearch.toLowerCase())
      const matchName = p.productName.toLowerCase().includes(productNameSearch.toLowerCase())
      if (hideDeactivated && p.isDeactivated) return false
      return matchSku && matchName
    })
    // Sort: active first, deactivated last
    list = list.sort((a, b) => {
      if (a.isDeactivated === b.isDeactivated) return 0
      return a.isDeactivated ? 1 : -1
    })
    return list
  }, [products, skuSearch, productNameSearch, hideDeactivated])

  // Product picker inside the Adjust Stock modal. A plain <select> of every SKU is
  // unusable once the catalog grows, so the list is searchable by SKU or name.
  const adjustProductOptions = useMemo(() => {
    const active = products.filter((p) => !p.isDeactivated)
    const q = adjustProductSearch.trim().toLowerCase()
    if (!q) return active
    return active.filter(
      (p) => p.skuCode.toLowerCase().includes(q) || p.productName.toLowerCase().includes(q)
    )
  }, [products, adjustProductSearch])

  // US-041: Stock table filters
  const filteredStockLevels = useMemo(() => {
    return stockLevels.filter((sl) => {
      if (stockClientFilter) {
        const prod = products.find((p) => p.id === sl.productId)
        if (prod?.clientId !== stockClientFilter) return false
      }
      if (stockLocationFilter && sl.locationId !== stockLocationFilter) return false
      return true
    })
  }, [stockLevels, stockClientFilter, stockLocationFilter, products])

  const formatWeight = (w?: any) => {
    if (w === undefined || w === null) return '—'
    return `${Number(w).toFixed(2)} kg`
  }

  const MOVEMENT_LABELS: Record<string, string> = {
    CHECKIN: 'Stock In',
    CHECKOUT: 'Stock Out',
    INTERNAL_MOVE: 'Move',
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
        {isStaff && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setScanMode('find')}>
              Scan to Find
            </Button>
            <Button variant="secondary" onClick={() => navigate('/receiving')}>
              Receive Stock
            </Button>
            <Button variant="secondary" onClick={() => handleOpenAdjustStock()}>
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
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6 overflow-x-auto">
        {[
          { id: 'products', label: 'SKU Products Catalog' },
          { id: 'stock', label: 'Stock Allocations' },
          { id: 'ledgers', label: 'Inventory Movement Ledger' },
          { id: 'daily-checkout', label: 'Daily Checkout Summary' },
          ...(isAdmin ? [{ id: 'audit-logs', label: 'System Audit Logs' }] : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id as any)}
            className={`pb-3 [@media(pointer:coarse)]:py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
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
                  {/* Search filters + US-044 toggle */}
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <Input
                      placeholder="Search by SKU code..."
              loading={loading}
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
                    <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none ml-auto [@media(pointer:coarse)]:py-2">
                      <input
                        type="checkbox"
                        checked={hideDeactivated}
                        onChange={(e) => setHideDeactivated(e.target.checked)}
                        className="check-target text-cyan-600 focus:ring-cyan-500"
                      />
                      Hide Deactivated
                    </label>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[60rem] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                          <th className="pb-3 font-semibold">SKU Code</th>
                          <th className="pb-3 font-semibold">Product Name</th>
                          <th className="pb-3 font-semibold">Attributes (Colour / Size)</th>
                          <th className="pb-3 font-semibold">Weight</th>
                          <th className="pb-3 font-semibold">Threshold Limit</th>
                          <th className="pb-3 font-semibold">Client Company</th>
                          <th className="pb-3 font-semibold">Status</th>
                          {isStaff && <th className="pb-3 font-semibold text-right">Actions</th>}
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
                              <tr
                                key={p.id}
                                onClick={() => handleOpenDetail(p)}
                                className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/50 ${
                                  p.isDeactivated ? 'opacity-50' : ''
                                }`}
                              >
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
                                {/* US-040: Clickable client name */}
                                <td className="py-4">
                                  <button
                                    type="button"
                                    className="font-medium text-slate-700 dark:text-slate-300 hover:text-cyan-600 hover:underline transition-colors cursor-pointer [@media(pointer:coarse)]:py-2"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      if (p.clientId) handleOpenClientContact(p.clientId)
                                    }}
                                  >
                                    {p.client?.companyName || '—'}
                                  </button>
                                </td>
                                <td className="py-4">
                                  <Badge variant={p.isDeactivated ? 'secondary' : 'default'}>
                                    {p.isDeactivated ? 'Deactivated' : 'Active'}
                                  </Badge>
                                </td>
                                {isStaff && (
                                  <td className="py-4 text-right">
                                    {/* Stock adjustment is the highest-frequency action, so it stays
                                        one click from the row. Edit / barcode / deactivate / delete
                                        live in the detail modal, opened by clicking the row. */}
                                    <div className="flex justify-end gap-1.5">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        disabled={p.isDeactivated}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleOpenAdjustStock(p)
                                        }}
                                      >
                                        Adjust Stock
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

              {/* TAB 2: STOCK ALLOCATION (US-041: filters) */}
              {activeTab === 'stock' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Select
                      value={stockClientFilter}
                      onChange={(e) => setStockClientFilter(e.target.value)}
                      className="max-w-xs"
                    >
                      <option value="">All Clients</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.companyName}</option>
                      ))}
                    </Select>
                    <Select
                      value={stockLocationFilter}
                      onChange={(e) => setStockLocationFilter(e.target.value)}
                      className="max-w-xs"
                    >
                      <option value="">All Locations</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.locationName}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[45rem] text-left text-sm">
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
                        {filteredStockLevels.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              No stock allocations recorded. Adjust stock or check-in inventory.
                            </td>
                          </tr>
                        ) : (
                          filteredStockLevels.map((sl) => (
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

              {/* TAB 3: MOVEMENT LEDGER (US-057 to US-062) */}
              {activeTab === 'ledgers' && (
                <div className="space-y-4">
                  {/* Filter Controls */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">Ledger Filters</h3>
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={handleClearLedgerFilters} disabled={ledgerFiltering}>
                          Clear
                        </Button>
                        <Button size="sm" onClick={handleApplyLedgerFilters} disabled={ledgerFiltering}>
                          {ledgerFiltering ? 'Filtering...' : 'Apply Filters'}
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Start Date</label>
                        <Input type="date" value={ledgerStartDate} onChange={(e) => setLedgerStartDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">End Date</label>
                        <Input type="date" value={ledgerEndDate} onChange={(e) => setLedgerEndDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Client</label>
                        <Select value={ledgerClientFilter} onChange={(e) => setLedgerClientFilter(e.target.value)}>
                          <option value="">All Clients</option>
                          {clients.map((c) => (
                            <option key={c.id} value={c.id}>{c.companyName}</option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Movement Type</label>
                        <Select value={ledgerMovementType} onChange={(e) => setLedgerMovementType(e.target.value)}>
                          <option value="">All Types</option>
                          <option value="CHECKIN">CHECKIN (Inbound)</option>
                          <option value="CHECKOUT">CHECKOUT (Outbound)</option>
                          <option value="INTERNAL_MOVE">INTERNAL_MOVE</option>
                        </Select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Product Name / SKU</label>
                        <Input placeholder="Search product..." value={ledgerProductSearch} onChange={(e) => setLedgerProductSearch(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  {/* PDF Generate Button (US-061) */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">{ledgers.length} entries shown</span>
                    <Button variant="secondary" size="sm" onClick={handleGenerateLedgerPDF} disabled={ledgers.length === 0}>
                      Generate PDF Report
                    </Button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[52rem] text-left text-sm">
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
                              <tr
                                key={l.id}
                                className="cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-900/50 transition-colors"
                                onClick={() => {
                                  setSelectedLedgerEntry(l)
                                  setLedgerDetailOpen(true)
                                }}
                              >
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

              {/* TAB 4: DAILY CHECKOUT SUMMARY (US-053/054) */}
              {activeTab === 'daily-checkout' && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Date</label>
                      <Input
                        type="date"
                        value={dailyCheckoutDate}
                        onChange={(e) => setDailyCheckoutDate(e.target.value)}
                        className="max-w-xs"
                      />
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => loadDailyCheckout(dailyCheckoutDate)} className="mt-4 sm:mt-0">
                      Refresh
                    </Button>
                  </div>

                  {dailyCheckoutLoading ? (
                    <div className="py-8 text-center text-slate-500">Loading daily checkout data...</div>
                  ) : dailyCheckoutData.length === 0 ? (
                    <div className="py-8 text-center text-slate-400">
                      No checkout transactions found for {new Date(dailyCheckoutDate).toLocaleDateString('en-GB', { dateStyle: 'long' })}.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {dailyCheckoutData.map((group: any, idx: number) => {
                        const items = Array.isArray(group.items) ? group.items : []
                        const totalQty = items.reduce((sum: number, it: any) => sum + (it.quantity || 0), 0)
                        return (
                          <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-900/50 px-4 py-3 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-slate-800 dark:text-slate-200">
                                  {group.clientName || group.clientId || 'Unknown Client'}
                                </span>
                                <Badge variant="secondary">{items.length} items</Badge>
                              </div>
                              <span className="text-sm font-bold text-rose-600">{totalQty} units checked out</span>
                            </div>
                            <table className="w-full min-w-[38rem] text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                                  <th className="px-4 pb-2 pt-3 font-semibold">Product SKU</th>
                                  <th className="px-4 pb-2 pt-3 font-semibold">Product Name</th>
                                  <th className="px-4 pb-2 pt-3 font-semibold text-center">Quantity</th>
                                  <th className="px-4 pb-2 pt-3 font-semibold">Checked Out By</th>
                                  <th className="px-4 pb-2 pt-3 font-semibold text-right">Time</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                                {items.map((it: any, iIdx: number) => (
                                  <tr key={iIdx}>
                                    <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200">{it.skuCode || '—'}</td>
                                    <td className="px-4 py-3">{it.productName || '—'}</td>
                                    <td className="px-4 py-3 text-center font-bold">{it.quantity} units</td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                                      {it.userName || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-xs font-mono text-slate-500">
                                      {it.timestamp ? new Date(it.timestamp).toLocaleTimeString() : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: SYSTEM AUDIT LOGS (US-102) */}
              {activeTab === 'audit-logs' && isAdmin && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-500">{auditLogs.length} audit trail entries</span>
                    <Button variant="secondary" size="sm" onClick={loadAuditLogs} loading={auditLoading}>
                      {auditLoading ? 'Refreshing...' : 'Refresh Logs'}
                    </Button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-400">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 pb-2">
                          <th className="pb-3 font-semibold">Timestamp</th>
                          <th className="pb-3 font-semibold">Action</th>
                          <th className="pb-3 font-semibold">User</th>
                          <th className="pb-3 font-semibold">Activity Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                        {auditLogs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-8 text-center text-slate-400">
                              No manual edits or deletions recorded.
                            </td>
                          </tr>
                        ) : (
                          auditLogs.map((log) => {
                            let parsed = {}
                            try {
                              parsed = JSON.parse(log.details)
                            } catch {
                              parsed = { raw: log.details }
                            }
                            return (
                              <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/10">
                                <td className="py-4 text-xs font-mono text-slate-500">
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="py-4">
                                  <Badge
                                    variant={
                                      log.action === 'DELETE_PRODUCT'
                                        ? 'destructive'
                                        : log.action === 'CREATE_PRODUCT'
                                          ? 'default'
                                          : 'secondary'
                                    }
                                  >
                                    {log.action}
                                  </Badge>
                                </td>
                                <td className="py-4 text-xs">
                                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                                    {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System Admin'}
                                  </div>
                                </td>
                                <td className="py-4 text-xs font-mono max-w-md truncate">
                                  {JSON.stringify(parsed)}
                                </td>
                              </tr>
                            )
                          })
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
            <Button type="submit" form="save-product-form" loading={productSaving}>
              {productSaving ? 'Saving SKU...' : 'Save Product'}
            </Button>
          </div>
        }
      >
        <form id="save-product-form" onSubmit={handleSaveProduct} className="space-y-4">
          <div>
            <label htmlFor="product-client" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Client Owner *
            </label>
            <Select id="product-client" value={clientId} onChange={(e) => setClientId(e.target.value)} required>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="product-sku" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                SKU Code *
              </label>
              <Input
                id="product-sku"
                placeholder="PRO-PK-T-BLUE"
                value={skuCode}
                onChange={(e) => setSkuCode(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="product-barcode" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Barcode (optional)
              </label>
              <Input
                id="product-barcode"
                placeholder="501234567890"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="product-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Product Name *
            </label>
            <Input
              id="product-name"
              placeholder="Polyester packing tape blue"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="product-colour" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Colour
              </label>
              <Input id="product-colour" placeholder="Blue" value={colour} onChange={(e) => setColour(e.target.value)} />
            </div>
            <div>
              <label htmlFor="product-size" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Size
              </label>
              <Input id="product-size" placeholder="Large" value={size} onChange={(e) => setSize(e.target.value)} />
            </div>
            <div>
              <label htmlFor="product-weight" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Weight (kg)
              </label>
              <Input
                id="product-weight"
                type="number"
                step="0.001"
                placeholder="0.25"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="product-threshold" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Low Stock Threshold Limit *
            </label>
            <Input
              id="product-threshold"
              type="number"
              min="0"
              value={thresholdLimit}
              onChange={(e) => setThresholdLimit(parseInt(e.target.value) || 0)}
              required
            />
          </div>

          {/* Opening stock — saves a second trip through the Adjust Stock dialog.
              Only offered when registering a new SKU, not when editing one. */}
          {!selectedProduct && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={withOpeningStock}
                  onChange={(e) => setWithOpeningStock(e.target.checked)}
                  className="check-target text-cyan-600 focus:ring-cyan-500"
                />
                Add opening stock now
              </label>
              <p className="text-xs text-slate-500">
                Records an inbound check-in so the SKU arrives on the shelf ready to use.
              </p>

              {withOpeningStock && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label htmlFor="opening-location" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Location *
                    </label>
                    <Select
                      id="opening-location"
                      value={openingLocationId}
                      onChange={(e) => setOpeningLocationId(e.target.value)}
                      required
                    >
                      {locations.length === 0 && <option value="">No locations available</option>}
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.locationName} (Zone {loc.zone || '—'})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <label htmlFor="opening-quantity" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Quantity *
                    </label>
                    <Input
                      id="opening-quantity"
                      type="number"
                      min="1"
                      value={openingQuantity}
                      onChange={(e) => setOpeningQuantity(parseInt(e.target.value) || 1)}
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>

      {/* ───────────────────────────────── MODAL: PRODUCT DETAIL ───────────────────────────────── */}
      <Modal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={selectedProduct ? `${selectedProduct.skuCode} — ${selectedProduct.productName}` : 'Product details'}
        description={selectedProduct?.client?.companyName || undefined}
        size="xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            {isStaff && selectedProduct && (
              <>
                <Button variant="ghost" onClick={() => handleOpenBarcode(selectedProduct)}>
                  Barcode
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setDetailOpen(false)
                    handleOpenEditProduct(selectedProduct)
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant={selectedProduct.isDeactivated ? 'secondary' : 'destructive'}
                  onClick={() => {
                    setDetailOpen(false)
                    setDeactivateConfirmOpen(true)
                  }}
                >
                  {selectedProduct.isDeactivated ? 'Reactivate' : 'Deactivate'}
                </Button>
                {/* Admin only, matching the route. An employee pressing this
                    would only ever get a 403 — Deactivate is their reversible
                    equivalent and sits right beside it. */}
                {isAdmin && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setDetailOpen(false)
                      setDeleteConfirmOpen(true)
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  disabled={selectedProduct.isDeactivated}
                  onClick={() => {
                    setDetailOpen(false)
                    handleOpenAdjustStock(selectedProduct)
                  }}
                >
                  Adjust Stock
                </Button>
              </>
            )}
          </div>
        }
      >
        {detailLoading ? (
          <div className="py-12 text-center text-slate-500">Loading product details...</div>
        ) : !detail ? (
          <div className="py-12 text-center text-slate-400">No details available.</div>
        ) : (
          <div className="space-y-6">
            {/* Stock summary against the threshold */}
            <div className="flex flex-col sm:flex-row gap-4">
              {(() => {
                const isLow = detail.totalQuantity < detail.product.thresholdLimit
                return [
                  {
                    label: 'Total units on hand',
                    value: detail.totalQuantity,
                    color: isLow
                      ? 'text-rose-700 bg-rose-50 border-rose-100 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300'
                      : 'text-teal-700 bg-teal-50 border-teal-100 dark:bg-teal-950/30 dark:border-teal-900 dark:text-teal-300',
                  },
                  {
                    label: 'Low stock threshold',
                    value: detail.product.thresholdLimit,
                    color:
                      'text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300',
                  },
                  {
                    label: 'Locations holding stock',
                    value: detail.stockLevels.length,
                    color:
                      'text-indigo-700 bg-indigo-50 border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-900 dark:text-indigo-300',
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`flex-1 border rounded-2xl p-4 ${color}`}>
                    <p className="text-xs uppercase tracking-wider font-semibold opacity-80">{label}</p>
                    <p className="text-2xl font-extrabold mt-1">{value}</p>
                  </div>
                ))
              })()}
            </div>

            {detail.totalQuantity < detail.product.thresholdLimit && !detail.product.isDeactivated && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/30 dark:border-rose-900 p-3 text-sm text-rose-700 dark:text-rose-300">
                Stock is below the threshold limit of {detail.product.thresholdLimit} units.
              </div>
            )}

            {/* Attributes */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Specification</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 text-sm">
                {[
                  { label: 'SKU Code', value: detail.product.skuCode },
                  { label: 'Barcode', value: detail.product.barcode || '—' },
                  { label: 'Client', value: detail.product.client?.companyName || '—' },
                  { label: 'Colour', value: detail.product.colour || '—' },
                  { label: 'Size', value: detail.product.size || '—' },
                  { label: 'Weight', value: formatWeight(detail.product.weight) },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">
                      {label}
                    </span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium">{value}</span>
                  </div>
                ))}
                <div>
                  <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">
                    Status
                  </span>
                  <Badge variant={detail.product.isDeactivated ? 'secondary' : 'default'}>
                    {detail.product.isDeactivated ? 'Deactivated' : 'Active'}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Stock by location */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Stock by location</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                      <th className="pb-2 font-semibold">Location</th>
                      <th className="pb-2 font-semibold">Zone / Shelf / Bin</th>
                      <th className="pb-2 font-semibold text-right">On hand</th>
                      <th className="pb-2 font-semibold text-right">Reserved</th>
                      <th className="pb-2 font-semibold text-right">Available</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {detail.stockLevels.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No stock allocated yet.
                        </td>
                      </tr>
                    ) : (
                      detail.stockLevels.map((sl) => (
                        <tr key={sl.id}>
                          <td className="py-3 font-medium">{sl.location?.locationName || '—'}</td>
                          <td className="py-3 text-slate-500">
                            {[sl.location?.zone, sl.location?.shelf, sl.location?.bin]
                              .filter(Boolean)
                              .join(' / ') || '—'}
                          </td>
                          <td className="py-3 text-right font-bold">{sl.currentQuantity}</td>
                          <td className="py-3 text-right text-slate-500">{sl.reservedQuantity}</td>
                          <td className="py-3 text-right">{sl.currentQuantity - sl.reservedQuantity}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent movements */}
            <div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-2">Recent movements</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[38rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                      <th className="pb-2 font-semibold">When</th>
                      <th className="pb-2 font-semibold">Type</th>
                      <th className="pb-2 font-semibold text-right">Qty</th>
                      <th className="pb-2 font-semibold">From → To</th>
                      <th className="pb-2 font-semibold">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-900">
                    {detail.recentMovements.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-slate-400">
                          No movements recorded yet.
                        </td>
                      </tr>
                    ) : (
                      detail.recentMovements.map((m) => (
                        <tr key={m.id}>
                          <td className="py-3 text-slate-500">
                            {new Date(m.timestamp).toLocaleString()}
                          </td>
                          <td className="py-3">
                            <Badge variant={m.movementType === 'CHECKOUT' ? 'secondary' : 'default'}>
                              {MOVEMENT_LABELS[m.movementType] || m.movementType}
                            </Badge>
                          </td>
                          <td className="py-3 text-right font-bold">{m.quantity}</td>
                          <td className="py-3 text-slate-600 dark:text-slate-400">
                            {(m.fromLocation?.locationName || 'Supplier') +
                              ' → ' +
                              (m.toLocation?.locationName || 'Dispatch')}
                          </td>
                          <td className="py-3 text-slate-500">
                            {`${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
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
              loading={deactivateSaving}
            >
              {deactivateSaving ? 'Processing...' : 'Confirm Action'}
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
            <Button type="submit" form="adjust-stock-form" loading={adjustSaving}>
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
            <Input
              placeholder="Filter by SKU code or product name..."
              value={adjustProductSearch}
              onChange={(e) => {
                const q = e.target.value
                setAdjustProductSearch(q)
                // Keep the selection valid as the list narrows.
                const next = products.filter((p) => {
                  if (p.isDeactivated) return false
                  const t = q.trim().toLowerCase()
                  if (!t) return true
                  return p.skuCode.toLowerCase().includes(t) || p.productName.toLowerCase().includes(t)
                })
                if (next.length > 0 && !next.some((p) => p.id === adjustProductId)) {
                  setAdjustProductId(next[0].id)
                }
              }}
              className="mb-2"
            />
            <Select value={adjustProductId} onChange={(e) => setAdjustProductId(e.target.value)} required>
              {adjustProductOptions.length === 0 && (
                <option value="">No products match “{adjustProductSearch}”</option>
              )}
              {adjustProductOptions.map((p) => (
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
                <option value="CHECKIN">Stock In — receiving from supplier</option>
                <option value="INTERNAL_MOVE">Move — between warehouse locations</option>
                <option value="CHECKOUT">Stock Out — dispatch to customer</option>
                {/* The way to reduce stock when nothing shipped. Without it the
                    only option was Stock Out, which demands a real dispatched
                    shipment — so damage and miscounts had to be recorded as
                    goods leaving on someone's order. */}
                <option value="ADJUSTMENT">Write Off — damage, loss or a miscount</option>
              </Select>
            </div>
            <div>
              <label htmlFor="adjust-quantity" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Quantity *
              </label>
              <Input
                id="adjust-quantity"
                type="number"
                min="1"
                value={adjustQuantity}
                onChange={(e) => setAdjustQuantity(parseInt(e.target.value) || 1)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Show Source Slot for anything leaving a bin */}
            {(adjustMovementType === 'CHECKOUT' ||
              adjustMovementType === 'INTERNAL_MOVE' ||
              adjustMovementType === 'ADJUSTMENT') && (
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
              <label htmlFor="adjust-reference" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                Shipment Label *
              </label>
              <Input
                id="adjust-reference"
                placeholder="The label scanned off the parcel, e.g. SHP-000123"
                value={adjustReferenceId}
                onChange={(e) => setAdjustReferenceId(e.target.value)}
                required
              />
              <p className="mt-1 text-xs text-slate-400">
                Must match a shipment that has been dispatched.
              </p>
            </div>
          )}

          <div>
            <label htmlFor="adjust-notes" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
              {adjustMovementType === 'ADJUSTMENT' ? 'Reason *' : 'Transaction Notes'}
            </label>
            <Input
              id="adjust-notes"
              placeholder={
                adjustMovementType === 'ADJUSTMENT'
                  ? 'e.g. Crushed by a pallet truck; 3 short on the quarterly count'
                  : 'e.g. Weekly manual stock verification or slot relocation'
              }
              value={adjustNotes}
              onChange={(e) => setAdjustNotes(e.target.value)}
              required={adjustMovementType === 'ADJUSTMENT'}
            />
            {adjustMovementType === 'ADJUSTMENT' && (
              <p className="mt-1 text-xs text-slate-400">
                Nothing else records why this stock left, so a reason is required.
                Units already reserved for a shipment cannot be written off.
              </p>
            )}
          </div>
        </form>
      </Modal>

      {/* ────────────────────────────────── MODAL: LEDGER ENTRY DETAIL (US-057) ────────────────────────────────── */}
      <Modal
        open={ledgerDetailOpen}
        onClose={() => setLedgerDetailOpen(false)}
        title="Inventory Movement Details"
        description="Full audit trail for this ledger transaction."
        size="md"
      >
        {selectedLedgerEntry && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Movement Type</span>
                <Badge
                  variant={
                    selectedLedgerEntry.movementType === 'CHECKIN'
                      ? 'default'
                      : selectedLedgerEntry.movementType === 'CHECKOUT'
                        ? 'destructive'
                        : 'secondary'
                  }
                  className="mt-1"
                >
                  {selectedLedgerEntry.movementType}
                </Badge>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Timestamp</span>
                <strong className="text-slate-700 dark:text-slate-200">{new Date(selectedLedgerEntry.timestamp).toLocaleString()}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Product</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedLedgerEntry.product?.skuCode}</strong>
                <span className="block text-xs text-slate-500">{selectedLedgerEntry.product?.productName}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Quantity</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedLedgerEntry.quantity} units</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">From Location</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedLedgerEntry.fromLocation?.locationName || 'External (Supplier)'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">To Location</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedLedgerEntry.toLocation?.locationName || 'External (Dispatch)'}</strong>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Performed By</span>
                <strong className="text-slate-700 dark:text-slate-200">{selectedLedgerEntry.user?.firstName} {selectedLedgerEntry.user?.lastName}</strong>
                <span className="block text-xs text-slate-500">{selectedLedgerEntry.user?.email}</span>
              </div>
              <div>
                <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Client</span>
                <strong className="text-slate-700 dark:text-slate-200">
                  {(() => {
                    const prod = products.find((p) => p.id === selectedLedgerEntry.productId)
                    const client = clients.find((c) => c.id === prod?.clientId)
                    return client?.companyName || '—'
                  })()}
                </strong>
              </div>
            </div>
            {(selectedLedgerEntry.referenceId || selectedLedgerEntry.notes) && (
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                {selectedLedgerEntry.referenceId && (
                  <p className="text-sm"><span className="font-semibold text-slate-500">Reference:</span> <span className="font-mono text-cyan-600">{selectedLedgerEntry.referenceId}</span></p>
                )}
                {selectedLedgerEntry.notes && (
                  <p className="text-sm mt-1"><span className="font-semibold text-slate-500">Notes:</span> {selectedLedgerEntry.notes}</p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ────────────────────────────────── MODAL: CLIENT CONTACT (US-040) ────────────────────────────────── */}
      <Modal
        open={clientContactOpen}
        onClose={() => setClientContactOpen(false)}
        title="Client Contact Details"
        description="Business contact information for this client account."
        size="sm"
      >
        {selectedClientDetail && (
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Company Name</span>
              <strong className="text-slate-800 dark:text-slate-200">{selectedClientDetail.companyName || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Contact Name</span>
              <strong className="text-slate-800 dark:text-slate-200">{selectedClientDetail.contactName || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Email</span>
              <strong className="text-slate-800 dark:text-slate-200">{selectedClientDetail.email || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Phone</span>
              <strong className="text-slate-800 dark:text-slate-200">{selectedClientDetail.mobile || '—'}</strong>
            </div>
            <div>
              <span className="text-slate-400 block text-xs uppercase tracking-wider font-semibold">Address</span>
              <strong className="text-slate-800 dark:text-slate-200">{selectedClientDetail.address || '—'}</strong>
            </div>
          </div>
        )}
      </Modal>

      {/* ────────────────────────────────── MODAL: BARCODE (US-038) ────────────────────────────────── */}
      <Modal
        open={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        title="Product Barcode"
        description={`Barcode label for ${barcodeProduct?.skuCode || 'product'}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBarcodeModalOpen(false)}>Close</Button>
            <Button onClick={handlePrintBarcode}>Print Barcode</Button>
          </div>
        }
      >
        <div className="flex flex-col items-center py-4">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{barcodeProduct?.productName}</p>
          <svg ref={barcodeRef} />
        </div>
      </Modal>

      {/* ────────────────────────────────── MODAL: DELETE PRODUCT CONFIRM (US-099) ────────────────────────────────── */}
      <Modal
        open={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete SKU Product"
        description="Permanently delete this product from the inventory ledger."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)} disabled={productSaving}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProduct} loading={productSaving}>
              {productSaving ? 'Deleting...' : 'Delete Product'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Are you sure you want to permanently delete{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{selectedProduct?.productName}</span> (SKU:{' '}
            <span className="font-mono">{selectedProduct?.skuCode}</span>)?
          </p>
          {/* The old copy said the database would "restrict this delete to
              maintain system integrity", which described a 500. The rules are
              checked properly now, so they can be stated as rules. */}
          <p className="text-xs text-slate-600 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 p-3 rounded-xl">
            This works only for a product that was never used — nothing on the
            shelf, no recorded movements, and not on any shipment. Anything else
            is refused, and <strong>Deactivate</strong> is what you want: it hides
            the product and keeps its history.
          </p>
        </div>
      </Modal>

      {/* ─────────────────────────────────── SCANNER ─────────────────────────────────── */}
      <BarcodeScanner
        open={scanMode !== null && !scanResultOpen}
        onClose={() => setScanMode(null)}
        onScan={resolveScan}
        title={scanMode === 'checkin' ? 'Scan to check in' : 'Scan to find'}
        description={
          scanMode === 'checkin'
            ? 'Scan each carton as it comes off the pallet.'
            : 'Hold the label steady inside the frame.'
        }
      />

      {/* What the scan resolved to: one product, several, or none */}
      <Modal
        open={scanResultOpen}
        onClose={() => {
          closeScanResult()
          // Back to the camera rather than out of the flow entirely — in
          // check-in mode the next carton is already waiting.
          if (scanMode !== 'checkin') setScanMode(null)
        }}
        title={checkInProduct ? 'Check stock in' : 'Scan result'}
        description={scannedCode ? `Code ${scannedCode}` : undefined}
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                closeScanResult()
                if (scanMode !== 'checkin') setScanMode(null)
              }}
            >
              {scanMode === 'checkin' ? 'Scan next' : 'Close'}
            </Button>
          </div>
        }
      >
        {scanLoading ? (
          <p className="py-6 text-center text-sm text-slate-400">Looking that up…</p>
        ) : checkInProduct ? (
          <CheckInPanel
            product={checkInProduct}
            locations={locations}
            onBookedIn={() => void loadData()}
            onError={(m) => showToast(m, 'error')}
            onDone={() => {
              closeScanResult()
              setScanMode(null)
            }}
          />
        ) : (
          <ScanResultPanel
            code={scannedCode}
            matches={scanMatches}
            notFound={scanNotFound}
            allProducts={products}
            onPick={handleScanPick}
            onAttached={() => {
              showToast('Barcode attached. Scan it again to open the product.')
              closeScanResult()
            }}
            onError={(m) => showToast(m, 'error')}
            onCreateNew={handleCreateFromScan}
          />
        )}
      </Modal>
    </div>
  )
}
