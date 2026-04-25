'use client'
import { useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export type ExeatRequest = {
  id: string
  reason: string
  destination: string
  leave_date: string
  return_date: string
  leave_type: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  gate_code: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
}

export function useExeatStatus(studentId: string | null) {
  const supabase = getSupabaseClient()
  const [requests, setRequests] = useState<ExeatRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) { setLoading(false); return }

    supabase
      .from('exeat_requests')
      .select('id, reason, destination, leave_date, return_date, leave_type, status, gate_code, approved_at, rejection_reason, created_at')
      .eq('student_id', studentId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setRequests((data ?? []) as ExeatRequest[])
        setLoading(false)
      })

    const channel = supabase
      .channel(`exeat-${studentId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'exeat_requests',
          filter: `student_id=eq.${studentId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setRequests(prev => [payload.new as ExeatRequest, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            setRequests(prev =>
              prev.map(r => r.id === (payload.new as ExeatRequest).id ? payload.new as ExeatRequest : r)
            )
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [studentId, supabase])

  const latestActive = requests.find(r => r.status === 'pending' || r.status === 'approved') ?? null

  return { requests, latestActive, loading }
}
