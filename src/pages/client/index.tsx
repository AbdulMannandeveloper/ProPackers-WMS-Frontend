import { useEffect, useState } from 'react'
import { useAuthStore } from '@/stores/auth'
import { clients as apiClients, services as apiServices } from '@/api'
import clientServicesApi from '@/api/clientServices'

export default function ClientPortalPage() {
  const userId = useAuthStore((s) => s.userId)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<{ description: string; chargedPrice: number }[]>([])
  const [activeTab, setActiveTab] = useState<'overview' | 'services'>('overview')

  useEffect(() => {
    const load = async () => {
      if (!userId) return
      setLoading(true)
      try {
        // find client record for this user
        const all = await apiClients.getAllClients()
        const myClient = Array.isArray(all) ? all.find((c: any) => c.userId === userId) : null
        if (!myClient) {
          setItems([])
          return
        }

        const [svcList, clientSvcList] = await Promise.all([
          apiServices.getAllServices(),
          clientServicesApi.getClientServicesByClientId(myClient.id),
        ])
        const svcs = Array.isArray(svcList) ? svcList : []
        const cs = Array.isArray(clientSvcList) ? clientSvcList : []
        setItems(cs.map((entry: any) => ({ description: (svcs.find((s: any) => s.id === entry.serviceId)?.description) ?? entry.serviceId, chargedPrice: Number(entry.chargedPrice ?? 0) })))
      } catch (e) {
        setItems([])
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [userId])

  return (
    <div className="rounded-xl bg-white p-6 shadow">
      <h2 className="text-xl font-semibold">Client portal</h2>

      <div className="mt-3 mb-4">
        <nav className="flex gap-2">
          <button className={`px-3 py-1 rounded ${activeTab === 'overview' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('overview')}>Overview</button>
          <button className={`px-3 py-1 rounded ${activeTab === 'services' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`} onClick={() => setActiveTab('services')}>Services</button>
        </nav>
      </div>

      {activeTab === 'overview' && (
        <div>
          <p className="mt-2 text-sm text-muted-foreground">Overview and quick links.</p>
        </div>
      )}

      {activeTab === 'services' && (
        <div className="mt-4">
          <h3 className="text-lg font-medium mb-2">Your assigned services</h3>
          {loading ? (
            <div>Loading…</div>
          ) : (
            <div>
              {items.length === 0 ? (
                <div>No services assigned yet.</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      <th className="py-2">Service</th>
                      <th className="py-2">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="py-2">{it.description}</td>
                        <td className="py-2">{it.chargedPrice}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
