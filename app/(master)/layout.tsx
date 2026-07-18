// app/(master)/layout.tsx
import { auth } from '@/lib/auth/session'
import { redirect } from 'next/navigation'
import { MasterSidebar } from '@/components/master/master-sidebar'

export default async function MasterLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (session?.user?.role !== 'MASTER_ADMIN') redirect('/login')

  return (
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-background">
      <MasterSidebar email={session.user.email ?? ''} />
      <main className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
          {children}
        </div>
      </main>
    </div>
  )
}