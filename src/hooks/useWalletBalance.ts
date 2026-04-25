'use client'
import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export type WalletState = {
  id: string
  balance: number
  is_frozen: boolean
  frozen_at: string | null
  freeze_reason: string | null
  updated_at: string
}

export function useWalletBalance(studentId: string | null) {
  const supabase = getSupabaseClient()
  const [wallet, setWallet]   = useState<WalletState | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) { setLoading(false); return }

    supabase
      .from('student_wallets')
      .select('id, balance, is_frozen, frozen_at, freeze_reason, updated_at')
      .eq('student_id', studentId)
      .maybeSingle()
      .then(({ data }) => {
        setWallet(data as WalletState | null)
        setLoading(false)
      })

    const channel = supabase
      .channel(`wallet-${studentId}`)
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'student_wallets',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          setWallet(payload.new as WalletState)
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  return { wallet, loading }
}
