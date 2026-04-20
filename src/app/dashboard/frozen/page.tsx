'use client'

import { useEffect, useState } from 'react'

export default function FrozenPage() {
  const [role, setRole] = useState('')

  useEffect(() => {
    try {
      const cached = localStorage.getItem('sychar_role_cache')
      if (cached) { const { r } = JSON.parse(cached); setRole(r ?? '') }
    } catch { /* ignore */ }
  }, [])

  // Canteen users are never frozen — redirect them away
  if (role === 'canteen') {
    if (typeof window !== 'undefined') window.location.href = '/dashboard/canteen'
    return null
  }

  const isPrincipal = role === 'principal'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">

        {/* Status banner */}
        <div className="bg-red-600 text-white rounded-2xl p-6 text-center shadow-lg">
          <p className="text-4xl mb-3">🔒</p>
          <h1 className="text-xl font-black">Portal Suspended</h1>
          <p className="text-red-200 text-sm mt-1">
            {isPrincipal
              ? 'Your subscription has expired. Renew to restore full access.'
              : 'This portal is currently under maintenance. Contact the school office.'}
          </p>
        </div>

        {isPrincipal && (
          <>
            {/* Payment details */}
            <div className="bg-white rounded-xl border p-5 space-y-3">
              <h2 className="font-bold text-gray-900">Renewal Instructions</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Bank</span>
                  <span className="font-semibold">Equity Bank Kenya</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Account Name</span>
                  <span className="font-semibold">Sychar Technologies Ltd</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Account No.</span>
                  <span className="font-mono font-bold text-blue-700">0350293812600</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">M-Pesa Paybill</span>
                  <span className="font-mono font-bold text-green-700">522533</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Reference</span>
                  <span className="font-mono text-gray-700">SYCHAR-{'{YOUR SCHOOL CODE}'}</span>
                </div>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
                After payment, WhatsApp your payment confirmation to <strong>+254 700 000 000</strong>. Access is restored within 2 hours.
              </div>
            </div>

            {/* Data download — KDPA compliance: always available */}
            <div className="bg-white rounded-xl border p-5">
              <h2 className="font-bold text-gray-900 mb-1">Download Your Data</h2>
              <p className="text-xs text-gray-500 mb-3">
                Your data belongs to your school. Download it anytime — even while suspended.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Students', path: '/api/export/students' },
                  { label: 'Marks',    path: '/api/export/marks' },
                  { label: 'Staff',    path: '/api/export/staff' },
                  { label: 'Finance',  path: '/api/export/finance' },
                ].map(item => (
                  <a key={item.label} href={item.path} download
                    className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg py-2 text-sm font-medium transition-colors">
                    ⬇ {item.label}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}

        {!isPrincipal && (
          <div className="bg-white rounded-xl border p-5 text-center">
            <p className="text-gray-500 text-sm">
              The school portal is temporarily under maintenance.
            </p>
            <p className="text-gray-400 text-xs mt-2">
              Please contact the school administration for assistance.
            </p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400">
          Powered by Sychar · Your data is safe and intact
        </p>
      </div>
    </div>
  )
}
