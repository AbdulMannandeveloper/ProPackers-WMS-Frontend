import { Link } from 'react-router'

export default function Error403() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl text-center rounded-xl bg-white p-8 shadow">
        <h1 className="text-4xl font-bold mb-2">403</h1>
        <p className="text-lg text-muted-foreground mb-4">Forbidden — you don't have permission to access this page.</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/app" className="rounded px-4 py-2 bg-cyan-600 text-white">Go to Dashboard</Link>
          <Link to="/auth/login" className="text-sm text-muted-foreground underline">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
