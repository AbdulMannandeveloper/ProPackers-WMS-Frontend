import { useCallback, useState, useMemo } from 'react'
import Tree from 'react-d3-tree'
import type { WarehouseLocationClass } from '@/api/warehouseLocations'

interface WarehouseTreeProps {
  locations: any[]
  classes: WarehouseLocationClass[]
  onEdit: (location: any) => void
  onDelete: (location: any) => void
}

function buildD3TreeData(locations: any[]) {
  // react-d3-tree expects { name, attributes, children }
  const nodeMap = new Map<string, any>()

  for (const loc of locations) {
    nodeMap.set(loc.id, {
      name: loc.locationName,
      attributes: {
        id: loc.id,
        className: loc.locationClass?.name || '',
        originalData: loc,
      },
      children: [],
    })
  }

  const roots: any[] = []

  for (const loc of locations) {
    const node = nodeMap.get(loc.id)!
    if (loc.parentLocationId && nodeMap.has(loc.parentLocationId)) {
      nodeMap.get(loc.parentLocationId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  // If there are multiple roots, we need to wrap them in an artificial super-root
  // because D3 tree expects a single root node.
  if (roots.length === 0) return null
  if (roots.length === 1) return roots[0]

  return {
    name: 'Warehouse System',
    attributes: { isSuperRoot: true },
    children: roots,
  }
}

const renderForeignObjectNode = ({
  nodeDatum,
  toggleNode,
  foreignObjectProps,
  onEdit,
  onDelete
}: any) => {
  const isSuperRoot = nodeDatum.attributes?.isSuperRoot

  if (isSuperRoot) {
    return (
      <g>
        <circle r={15} fill="#4f46e5" onClick={toggleNode} />
        <text fill="black" strokeWidth="1" x="20" dy="5">Warehouse System</text>
      </g>
    )
  }

  const { className, originalData } = nodeDatum.attributes
  
  return (
    <g>
      <foreignObject {...foreignObjectProps}>
        <div 
          className="border border-slate-300 bg-white rounded-lg shadow-sm w-full h-full flex flex-col items-center justify-center relative overflow-hidden pb-3"
          style={{ width: '160px', height: '96px' }}
        >
          {/* Top colored bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-indigo-500" />
          
          <div className="font-semibold text-slate-800 truncate px-2 w-full text-center text-sm mt-1">
            {nodeDatum.name}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400 mt-0.5">
            {className || 'Location'}
          </div>

          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(originalData); }}
              className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded bg-blue-50"
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(originalData); }}
              className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded bg-red-50"
            >
              Delete
            </button>
          </div>

          {nodeDatum.children && nodeDatum.children.length > 0 && (
            <button 
              className="absolute bottom-0 right-0 left-0 h-4 bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-[10px] text-slate-500"
              onClick={toggleNode}
            >
              {nodeDatum.__rd3t.collapsed ? 'Expand ▼' : 'Collapse ▲'}
            </button>
          )}
        </div>
      </foreignObject>
    </g>
  )
}

export default function WarehouseTree({ locations, classes, onEdit, onDelete }: WarehouseTreeProps) {
  const [translate, setTranslate] = useState({ x: 0, y: 0 })
  const [dimensions, setDimensions] = useState<{ width: number, height: number } | null>(null)

  const treeData = useMemo(() => buildD3TreeData(locations), [locations])

  const containerRef = useCallback((containerElem: HTMLDivElement | null) => {
    if (containerElem !== null) {
      const { width, height } = containerElem.getBoundingClientRect()
      setDimensions({ width, height })
      setTranslate({ x: width / 2, y: 50 })
    }
  }, [])

  if (!treeData) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-400">
        No locations found. Add some to build your warehouse map!
      </div>
    )
  }

  // Node sizes for foreign object
  const nodeSize = { x: 200, y: 150 }
  const foreignObjectProps = {
    width: 160,
    height: 96,
    x: -80,
    y: -48,
  }

  return (
    <div className="w-full h-full absolute inset-0" ref={containerRef}>
      {dimensions && (
        <Tree
          data={treeData}
          orientation="vertical"
          translate={translate}
          nodeSize={nodeSize}
          renderCustomNodeElement={(rd3tProps) =>
            renderForeignObjectNode({ ...rd3tProps, foreignObjectProps, onEdit, onDelete })
          }
          separation={{ siblings: 1.2, nonSiblings: 1.5 }}
        />
      )}
    </div>
  )
}
