import { useCallback, useEffect, useMemo, useState } from 'react'
import { warehouseLocations as api, stock as stockApi } from '@/api'
import type { WarehouseLocation, WarehouseLocationClass } from '@/api/warehouseLocations'
import type { StockLevel } from '@/api/stock'

export interface MapNode {
  id: string
  location: WarehouseLocation
  depth: number
  /** Ancestor ids from root down to and including this node. */
  pathIds: string[]
  children: MapNode[]
  /** Stock stored directly on this location. */
  directUnits: number
  directReserved: number
  directSkus: number
  /** Stock stored on this location and everything beneath it. */
  subtreeUnits: number
  subtreeSkus: number
  descendantCount: number
  leafCount: number
  occupiedLeafCount: number
}

/**
 * Depth drives colour because the schema has no level column on
 * WarehouseLocationClass, only parentClassId.
 */
const DEPTH_PALETTE = [
  { dot: 'bg-indigo-500', soft: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200' },
  { dot: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200' },
  { dot: 'bg-teal-500', soft: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-200' },
  { dot: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200' },
  { dot: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-700', ring: 'ring-rose-200' },
]

export const depthStyle = (depth: number) => DEPTH_PALETTE[depth % DEPTH_PALETTE.length]

interface StockAggregate {
  units: number
  reserved: number
  skus: number
}

const aggregateStockByLocation = (stockLevels: StockLevel[]) => {
  const byLocation = new Map<string, StockAggregate>()

  for (const level of stockLevels) {
    if (!level?.locationId) continue

    const current = byLocation.get(level.locationId) ?? { units: 0, reserved: 0, skus: 0 }
    current.units += Number(level.currentQuantity ?? 0)
    current.reserved += Number(level.reservedQuantity ?? 0)
    current.skus += 1
    byLocation.set(level.locationId, current)
  }

  return byLocation
}

/**
 * Rolls stock totals up from the leaves so a zone reports everything stored
 * beneath it, not just what sits directly on the zone record.
 */
const rollUp = (node: MapNode) => {
  let subtreeUnits = node.directUnits
  let subtreeSkus = node.directSkus
  let descendantCount = 0
  let leafCount = 0
  let occupiedLeafCount = 0

  if (node.children.length === 0) {
    leafCount = 1
    occupiedLeafCount = node.directUnits > 0 ? 1 : 0
  }

  for (const child of node.children) {
    rollUp(child)
    subtreeUnits += child.subtreeUnits
    subtreeSkus += child.subtreeSkus
    descendantCount += child.descendantCount + 1
    leafCount += child.leafCount
    occupiedLeafCount += child.occupiedLeafCount
  }

  node.subtreeUnits = subtreeUnits
  node.subtreeSkus = subtreeSkus
  node.descendantCount = descendantCount
  node.leafCount = leafCount
  node.occupiedLeafCount = occupiedLeafCount
}

export const buildWarehouseMap = (
  locations: WarehouseLocation[],
  stockLevels: StockLevel[],
) => {
  const stockByLocation = aggregateStockByLocation(stockLevels)
  const nodeById = new Map<string, MapNode>()

  for (const location of locations) {
    const aggregate = stockByLocation.get(location.id)
    nodeById.set(location.id, {
      id: location.id,
      location,
      depth: 0,
      pathIds: [],
      children: [],
      directUnits: aggregate?.units ?? 0,
      directReserved: aggregate?.reserved ?? 0,
      directSkus: aggregate?.skus ?? 0,
      subtreeUnits: 0,
      subtreeSkus: 0,
      descendantCount: 0,
      leafCount: 0,
      occupiedLeafCount: 0,
    })
  }

  const roots: MapNode[] = []

  for (const location of locations) {
    const node = nodeById.get(location.id)
    if (!node) continue

    const parent = location.parentLocationId ? nodeById.get(location.parentLocationId) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const byName = (a: MapNode, b: MapNode) =>
    (a.location.locationName || '').localeCompare(b.location.locationName || '', undefined, {
      numeric: true,
      sensitivity: 'base',
    })

  const applyDepth = (node: MapNode, depth: number, ancestors: string[]) => {
    node.depth = depth
    node.pathIds = [...ancestors, node.id]
    node.children.sort(byName)
    for (const child of node.children) {
      applyDepth(child, depth + 1, node.pathIds)
    }
  }

  roots.sort(byName)
  for (const root of roots) {
    applyDepth(root, 0, [])
    rollUp(root)
  }

  return { roots, nodeById }
}

export function useWarehouseMap() {
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [classes, setClasses] = useState<WarehouseLocationClass[]>([])
  const [stockLevels, setStockLevels] = useState<StockLevel[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [locationData, classData, stockData] = await Promise.all([
        api.getAllWarehouseLocations(),
        api.getAllWarehouseLocationClasses(),
        // Stock is best-effort: the map still works without occupancy numbers.
        stockApi.getAllStockLevels().catch(() => [] as StockLevel[]),
      ])

      setLocations(Array.isArray(locationData) ? locationData : [])
      setClasses(Array.isArray(classData) ? classData : [])
      setStockLevels(Array.isArray(stockData) ? stockData : [])
    } catch (e: any) {
      setLocations([])
      setClasses([])
      setStockLevels([])
      setError(e?.response?.data?.error || e?.message || 'Failed to load warehouse module data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { roots, nodeById } = useMemo(
    () => buildWarehouseMap(locations, stockLevels),
    [locations, stockLevels],
  )

  return { locations, classes, stockLevels, roots, nodeById, loading, error, reload: load }
}
