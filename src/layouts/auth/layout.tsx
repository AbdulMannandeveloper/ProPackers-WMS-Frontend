import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-shell min-h-screen bg-slate-50">
      <div className="grid min-h-screen w-full lg:grid-cols-[48%_52%] xl:grid-cols-[50%_50%] 2xl:grid-cols-[51%_49%]">
        <aside className="auth-shell__marketing sticky top-0 hidden h-screen flex-col justify-between overflow-y-auto px-8 py-8 text-white lg:flex">
          <div className="space-y-12">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-blue-900 shadow-lg shadow-black/20">
                <span className="text-xl font-black tracking-tight">P</span>
              </div>
              <div>
                <div className="text-xl font-semibold leading-none">Propacker</div>
                <div className="mt-1 text-sm text-white/70">Warehouse Management System</div>
              </div>
            </div>

            <div className="max-w-xl space-y-5">
              <p className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
                Clear access for every role, with a simple and calm workspace.
              </p>
              <p className="max-w-lg text-base leading-7 text-white/75">
                Admins, employees, and clients all get the right view with a clean sign-in experience and secure OTP flow.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                'Inventory and warehouse control',
                'Client service visibility',
                'Team operations dashboard',
                'Secure OTP sign-in',
              ].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/80 backdrop-blur">
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 text-sm text-white/55">
            <div className="h-px w-full bg-white/10" />
            <p>Designed to feel straightforward, premium, and easy on the eyes.</p>
          </div>
        </aside>

        <main className="auth-stage flex min-h-screen items-center justify-center px-4 py-10 sm:px-8 lg:px-10">
          <div className="w-full max-w-[34rem]">{children}</div>
        </main>
      </div>
    </div>
  )
}
