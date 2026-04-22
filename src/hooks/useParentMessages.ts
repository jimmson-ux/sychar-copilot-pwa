'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { getSupabaseClient } from '@/lib/supabase'

export type ParentMessage = {
  id: string
  parent_id: string
  student_id: string | null
  message_body: string
  sender_type: 'parent' | 'system_bot' | 'ai_assistant' | 'staff'
  message_type: string
  is_read: boolean
  metadata: Record<string, unknown>
  created_at: string
}

const PAGE_SIZE = 20

export function useParentMessages(parentId: string | null) {
  const supabase = getSupabaseClient()
  const [messages, setMessages] = useState<ParentMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const oldestCursor = useRef<string | null>(null)

  const loadInitial = useCallback(async () => {
    if (!parentId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('parent_messages')
      .select('*')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (!error && data) {
      const ordered = data.reverse()
      setMessages(ordered)
      oldestCursor.current = ordered[0]?.created_at || null
      setHasMore(data.length === PAGE_SIZE)

      await supabase
        .from('parent_messages')
        .update({ is_read: true })
        .eq('parent_id', parentId)
        .eq('is_read', false)
    }
    setLoading(false)
  }, [parentId, supabase])

  const loadMore = useCallback(async () => {
    if (!parentId || !oldestCursor.current || loadingMore || !hasMore) return
    setLoadingMore(true)

    const { data, error } = await supabase
      .from('parent_messages')
      .select('*')
      .eq('parent_id', parentId)
      .lt('created_at', oldestCursor.current)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (!error && data) {
      const ordered = data.reverse()
      setMessages(prev => [...ordered, ...prev])
      oldestCursor.current = ordered[0]?.created_at || oldestCursor.current
      setHasMore(data.length === PAGE_SIZE)
    }
    setLoadingMore(false)
  }, [parentId, loadingMore, hasMore, supabase])

  useEffect(() => {
    if (!parentId) return
    loadInitial()

    const channel = supabase
      .channel(`parent-messages-${parentId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'parent_messages',
          filter: `parent_id=eq.${parentId}`,
        },
        (payload) => {
          const newMsg = payload.new as ParentMessage
          setMessages(prev => [...prev, newMsg])

          if (newMsg.sender_type !== 'parent') {
            try {
              const audio = new Audio('/sounds/notification.mp3')
              audio.volume = 0.4
              audio.play().catch(() => {})
            } catch {}
          }

          supabase
            .from('parent_messages')
            .update({ is_read: true })
            .eq('id', newMsg.id)
            .then(() => {})
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [parentId, loadInitial, supabase])

  const sendMessage = useCallback(async (body: string) => {
    if (!parentId) return
    const { error } = await supabase.from('parent_messages').insert([{
      parent_id: parentId,
      message_body: body,
      sender_type: 'parent',
      message_type: 'text',
    }])
    if (error) throw error
  }, [parentId, supabase])

  const unreadCount = messages.filter(
    m => !m.is_read && m.sender_type !== 'parent'
  ).length

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    sendMessage,
    unreadCount,
  }
}
