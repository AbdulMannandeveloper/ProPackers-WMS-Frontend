import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Catches render errors so a single broken component shows something a person
 * can act on, rather than a white screen.
 *
 * Warehouse pages render a lot of API data, and one unexpected null in a deeply
 * nested field used to take the whole app down with nothing on screen and
 * nothing in the UI to say what happened.
 *
 * Note this catches errors thrown during render, not rejected promises in event
 * handlers — those are already handled by each page's toast.
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Kept on the console so the stack is recoverable in a browser session.
    // Swap for a reporting service when one exists.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  private handleReload = () => {
    this.setState({ error: null })
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-lg w-full rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Something went wrong on this page
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            The page stopped rendering. Nothing you had saved is affected — reloading
            usually clears it. If it keeps happening, send this message to your
            administrator.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-slate-100 p-3 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
            {error.message}
          </pre>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Reload the page
            </button>
            <a
              href="/app"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}
