import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Search,
  Pencil,
  Trash2,
  Plus,
  Package,
  Boxes,
  Layers,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react'
import { Badge } from '@/components/Shared Components'
import type { StockLevel } from '@/api/stock'
import type { WarehouseLocation } from '@/api/warehouseLocations'
import { depthStyle, type MapNode } from './useWarehouseMap'

interface Props {
  roots: MapNode[]
  nodeById: Map<string, MapNode>
  stockLevels: StockLevel[]
  onEdit: (location: WarehouseLocation) => void
  onDelete: (location: WarehouseLocation) => void
  onAddChild: (parent: WarehouseLocation) => void
}

const flattenIds = (nodes: MapNode[]): string[] =>
  nodes.flatMap((node) => [node.id, ...flattenIds(node.children)])

const matchesQuery = (node: MapNode, query: string) => {
  const haystack = [
    node.location.locationName,
    node.location.locationClass?.name,
    node.location.materializedPath,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return haystack.includes(query)
}

/** Keeps a node when it matches, or when any descendant matches. */
const filterTree = (nodes: MapNode[], query: string): MapNode[] =>
  nodes.reduce<MapNode[]>((acc, node) => {
    const children = filterTree(node.children, query)
    if (children.length > 0 || matchesQuery(node, query)) {
      acc.push({ ...node, children })
    }
    return acc
  }, [])

export default function WarehouseExplorer({
  roots,
  nodeById,
  stockLevels,
  onEdit,
  onDelete,
  onAddChild,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const visibleRoots = useMemo(
    () => (normalizedQuery ? filterTree(roots, normalizedQuery) : roots),
    [roots, normalizedQuery],
  )

  // Roots start open so the layout reads as a warehouse rather than a blank rail.
  useEffect(() => {
    setExpanded((prev) => {
      if (prev.size > 0) return prev
      return new Set(roots.map((root) => root.id))
    })
  }, [roots])

  useEffect(() => {
    if (!normalizedQuery) return
    setExpanded(new Set(flattenIds(visibleRoots)))
  }, [normalizedQuery, visibleRoots])

  const selected = selectedId ? nodeById.get(selectedId) ?? null : null

  const selectNode = (node: MapNode) => {
    setSelectedId(node.id)
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of node.pathIds) next.add(id)
      return next
    })
  }

  const selectById = (id: string) => {
    const node = nodeById.get(id)
    if (node) selectNode(node)
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => setExpanded(new Set(flattenIds(roots)))
  const collapseAll = () => setExpanded(new Set())

  const renderRow = (node: MapNode) => {
    const style = depthStyle(node.depth)
    const isOpen = expanded.has(node.id)
    const isSelected = selectedId === node.id
    const hasChildren = node.children.length > 0

    return (
      <li key={node.id}>
        <div
          className={`group relative flex items-center gap-1.5 rounded-lg pr-2 transition-colors ${
            isSelected ? 'bg-primary/10' : 'hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${node.depth * 14 + 4}px` }}
        >
          {isSelected && (
            <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary" aria-hidden />
          )}

          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            >
              {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}

          <button
            type="button"
            onClick={() => selectNode(node)}
            className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
          >
            <span className={`size-2 shrink-0 rounded-full ${style.dot}`} aria-hidden />
            <span
              className={`truncate text-sm ${isSelected ? 'font-semibold text-foreground' : 'text-slate-700'}`}
            >
              {node.location.locationName}
            </span>
            {hasChildren && (
              <span className="shrink-0 text-[11px] text-slate-400">{node.children.length}</span>
            )}
          </button>

          {node.subtreeUnits > 0 && (
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
              {node.subtreeUnits}
            </span>
          )}
        </div>

        {hasChildren && isOpen && <ul>{node.children.map(renderRow)}</ul>}
      </li>
    )
  }

  return (
    <div className="flex h-full min-h-0 divide-x divide-border">
      {/* Tree rail */}
      <div className="flex w-[300px] shrink-0 flex-col bg-white">
        <div className="space-y-2 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search locations..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={expandAll}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronsUpDown className="size-3.5" strokeWidth={1.75} />
              Expand all
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              <ChevronsDownUp className="size-3.5" strokeWidth={1.75} />
              Collapse all
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleRoots.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">
              {normalizedQuery ? 'No locations match your search.' : 'No locations yet.'}
            </p>
          ) : (
            <ul>{visibleRoots.map(renderRow)}</ul>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="min-w-0 flex-1 overflow-y-auto bg-slate-50/60">
        {selected ? (
          <LocationDetail
            node={selected}
            nodeById={nodeById}
            stockLevels={stockLevels}
            onSelect={selectById}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
            <Layers className="size-8 text-slate-300" strokeWidth={1.5} />
            <p className="text-sm font-medium text-slate-600">Select a location</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              Pick a zone, aisle, shelf or bin from the left to see what it contains and how full it is.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

interface DetailProps {
  node: MapNode
  nodeById: Map<string, MapNode>
  stockLevels: StockLevel[]
  onSelect: (id: string) => void
  onEdit: (location: WarehouseLocation) => void
  onDelete: (location: WarehouseLocation) => void
  onAddChild: (parent: WarehouseLocation) => void
}

function LocationDetail({
  node,
  nodeById,
  stockLevels,
  onSelect,
  onEdit,
  onDelete,
  onAddChild,
}: DetailProps) {
  const style = depthStyle(node.depth)
  const isLeaf = node.children.length === 0

  const locationStock = useMemo(
    () => stockLevels.filter((level) => level.locationId === node.id),
    [stockLevels, node.id],
  )

  const stats = [
    { label: 'Direct children', value: node.children.length },
    { label: 'Total descendants', value: node.descendantCount },
    { label: 'SKUs held', value: node.subtreeSkus },
    { label: 'Units held', value: node.subtreeUnits },
    {
      label: 'Occupied bins',
      value: node.leafCount > 0 ? `${node.occupiedLeafCount} / ${node.leafCount}` : '—',
    },
  ]

  const maxChildUnits = Math.max(1, ...node.children.map((child) => child.subtreeUnits))

  return (
    <div className="space-y-4 p-5">
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {node.pathIds.map((id, index) => {
          const crumb = nodeById.get(id)
          if (!crumb) return null
          const isLast = index === node.pathIds.length - 1

          return (
            <span key={id} className="flex items-center gap-1">
              {index > 0 && <span className="text-slate-300">/</span>}
              <button
                type="button"
                onClick={() => onSelect(id)}
                disabled={isLast}
                className={
                  isLast
                    ? 'font-medium text-foreground'
                    : 'rounded px-1 hover:bg-slate-200 hover:text-slate-800'
                }
              >
                {crumb.location.locationName}
              </button>
            </span>
          )
        })}
      </nav>

      {/* Header */}
      <div className="rounded-xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`size-2.5 rounded-full ${style.dot}`} aria-hidden />
              <h3 className="truncate text-lg font-semibold text-foreground">
                {node.location.locationName}
              </h3>
              <Badge variant="outline" className={`${style.soft} ${style.text} border-transparent`}>
                {node.location.locationClass?.name || 'Location'}
              </Badge>
            </div>
            {node.location.materializedPath && (
              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {node.location.materializedPath}
              </p>
            )}
          </div>

          <div className="inline-flex items-center gap-0.5 rounded-lg border border-border/80 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              title="Add child location"
              aria-label="Add child location"
              onClick={() => onAddChild(node.location)}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Plus className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              title="Edit location"
              aria-label="Edit location"
              onClick={() => onEdit(node.location)}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <Pencil className="size-3.5" strokeWidth={1.75} />
            </button>
            <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
            <button
              type="button"
              title="Delete location"
              aria-label="Delete location"
              onClick={() => onDelete(node.location)}
              className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </dt>
              <dd className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Child map */}
      {!isLeaf && (
        <section className="rounded-xl border border-border bg-white">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <Boxes className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Contains
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                ({node.children.length})
              </span>
            </h4>
          </div>

          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {node.children.map((child) => {
              const childStyle = depthStyle(child.depth)
              const fill = Math.round((child.subtreeUnits / maxChildUnits) * 100)

              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => onSelect(child.id)}
                  className="group rounded-xl border border-border bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-medium text-foreground">
                      {child.location.locationName}
                    </p>
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${childStyle.dot}`} aria-hidden />
                  </div>

                  <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {child.location.locationClass?.name || 'Location'}
                  </p>

                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${child.subtreeUnits > 0 ? childStyle.dot : 'bg-transparent'}`}
                      style={{ width: `${fill}%` }}
                    />
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="tabular-nums">{child.subtreeUnits} units</span>
                    <span>
                      {child.children.length > 0
                        ? `${child.children.length} inside`
                        : child.subtreeUnits > 0
                          ? 'Occupied'
                          : 'Empty'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Stock held here */}
      <section className="rounded-xl border border-border bg-white">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Package className="size-4 text-muted-foreground" strokeWidth={1.75} />
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stock at this location
            <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
              ({locationStock.length})
            </span>
          </h4>
        </div>

        {locationStock.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {isLeaf
              ? 'Nothing stored here yet.'
              : 'Nothing stored directly here. Open a child location to see its stock.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">SKU</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Product</th>
                  <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Client</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On hand</th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reserved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {locationStock.map((level) => (
                  <tr key={level.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      {level.product?.skuCode ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {level.product?.productName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {level.product?.client?.companyName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-foreground">
                      {level.currentQuantity ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-muted-foreground">
                      {level.reservedQuantity ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
