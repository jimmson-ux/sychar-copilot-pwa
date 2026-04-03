'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  ScanLine, FileText, Table2, Receipt, Smartphone,
  CalendarDays, ClipboardList, BarChart2, ChevronLeft, Menu, X,
} from 'lucide-react'

// Lazy singleton — createClient is deferred until first component render (browser only).
// Module-level calls would crash Next.js static generation when env vars are absent.
let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard/scanner',              label: 'Overview',       icon: ScanLine     },
  { href: '/dashboard/scanner/apology-letter', label: 'Apology Letter', icon: FileText,
    roles: ['class_teacher','dean_of_students','deputy_principal','principal','dean_of_studies','deputy_dean_of_studies'] },
  { href: '/dashboard/scanner/mark-sheet',   label: 'Mark Sheet',     icon: Table2,
    roles: ['class_teacher','hod_subjects','hod_pathways','deputy_principal','principal'] },
  { href: '/dashboard/scanner/fee-receipt',  label: 'Fee Receipt',    icon: Receipt,
    roles: ['bursar','deputy_principal','principal'] },
  { href: '/dashboard/scanner/mpesa-batch',  label: 'M-Pesa Batch',   icon: Smartphone,
    roles: ['bursar','principal','deputy_principal'] },
  { href: '/dashboard/scanner/fee-schedule', label: 'Fee Schedule',   icon: CalendarDays,
    roles: ['bursar','principal','deputy_principal'] },
  { href: '/dashboard/scanner/hod-report',   label: 'HOD Report',     icon: ClipboardList,
    roles: ['hod_subjects','hod_pathways','deputy_principal','principal','dean_of_studies','deputy_dean_of_studies'] },
  { href: '/dashboard/scanner/audit',        label: 'Audit',          icon: BarChart2,
    roles: ['principal'] },
]

export default function ScannerSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [subRole, setSubRole] = useState<string>('principal')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getSupabase()
        .from('staff_records')
        .select('sub_role')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data?.sub_role) setSubRole(data.sub_role)
        })
    })
  }, [])

  const visible = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(subRole)
  )

  const SidebarContent = () => (
    <nav className="flex flex-col gap-1 px-3 py-4">
      <div className="flex items-center gap-2 px-3 mb-4">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] flex items-center justify-center">
          <ScanLine className="w-4 h-4 text-white" />
        </div>
        <span className="text-gray-900 font-display font-semibold text-sm">Scanner</span>
      </div>

      {visible.map((item) => {
        const Icon = item.icon
        const isActive = pathname === item.href
        return (
          <button
            key={item.href}
            onClick={() => { router.push(item.href); setOpen(false) }}
            className={`flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-xl text-sm transition-all
              ${isActive
                ? 'bg-gradient-to-r from-[var(--role-primary,#0891b2)]/10 to-[var(--role-primary,#0891b2)]/5 border border-[var(--role-primary,#0891b2)]/20 text-[var(--role-primary,#0891b2)] font-medium'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[var(--role-primary,#0891b2)]' : ''}`} />
            {item.label}
          </button>
        )
      })}

      <div className="mt-auto pt-4 border-t border-gray-100 mx-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-xs transition-colors w-full px-3 py-2"
        >
          <ChevronLeft className="w-3 h-3" />
          Back to Dashboard
        </button>
      </div>
    </nav>
  )

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed top-4 left-4 z-30 w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:text-gray-900"
      >
        <Menu className="w-4 h-4" />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-56 bg-white border-r border-gray-100 flex flex-col">
            <div className="flex justify-end p-3">
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-900 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-52 shrink-0 bg-white border-r border-gray-100 h-full">
        <SidebarContent />
      </aside>
    </>
  )
}
