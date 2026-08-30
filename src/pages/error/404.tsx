import { Link } from 'react-router'

export default function NotFound404() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-xl text-center rounded-xl bg-white p-8 shadow">
        <h1 className="text-4xl font-bold mb-2">404</h1>
        <p className="text-lg text-muted-foreground mb-4">Page not found — the link may be broken or the page has moved.</p>
        <div className="flex items-center justify-center gap-3">
          <Link to="/" className="rounded px-4 py-2 bg-cyan-600 text-white">Home</Link>
          <Link to="/app" className="text-sm text-muted-foreground underline">Go to Dashboard</Link>
        </div>
      </div>
    </div>
  )
}
