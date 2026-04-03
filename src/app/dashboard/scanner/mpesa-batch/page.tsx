'use client'

export const dynamic = 'force-dynamic'


import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Smartphone, CheckCircle, AlertTriangle, Upload, Loader2 } from 'lucide-react'
import { useOCRScanner } from '@/hooks/useOCRScanner'


const ALLOWED_ROLES = ['bursar', 'principal', 'deputy_principal']

type ItemStatus = 'waiting' | 'processing' | 'done' | 'failed'

interface QueueItem {
  file: File
  status: ItemStatus
  data: Record<string, unknown> | null
  error: string | null
  previewUrl: string
}

function formatKES(n: unknown): string {
  const num = Number(n)
  if (isNaN(num)) return '—'
  return `KES ${num.toLocaleString()}`
}

export default function MpesaBatchPage() {
  const router = useRouter()
  const { scan } = useOCRScanner()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [done, setDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      createClient().from('staff_records').select('sub_role').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data && !ALLOWED_ROLES.includes(data.sub_role)) router.replace('/dashboard/scanner')
        })
    })
  }, [router])

  function addFiles(files: FileList) {
    const items: QueueItem[] = Array.from(files).slice(0, 20).map((file) => ({
      file,
      status: 'waiting',
      data: null,
      error: null,
      previewUrl: URL.createObjectURL(file),
    }))
    setQueue((q) => [...q, ...items])
  }

  async function processAll() {
    setIsProcessing(true)
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].status === 'done') continue
      setProgressText(`Processing ${i + 1} of ${queue.length}...`)
      setQueue((q) => q.map((item, idx) => idx === i ? { ...item, status: 'processing' } : item))
      const ocr = await scan(queue[i].file, 'ocr_mpesa_batch')
      setQueue((q) =>
        q.map((item, idx) =>
          idx === i
            ? { ...item, status: ocr ? 'done' : 'failed', data: ocr?.data ?? null, error: ocr ? null : 'OCR failed' }
            : item
        )
      )
    }
    setProgressText('')
    setIsProcessing(false)
  }

  async function saveAll() {
    setIsSaving(true)
    const successful = queue.filter((q) => q.status === 'done' && q.data)
    const res = await fetch('/api/scanner/fee-receipt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch: successful.map((q) => q.data), isBatch: true }),
    })
    await res.json()
    setIsSaving(false)
    setDone(true)
  }

  const doneCount = queue.filter((q) => q.status === 'done').length
  const failedCount = queue.filter((q) => q.status === 'failed').length
  const totalKES = queue
    .filter((q) => q.status === 'done' && q.data)
    .reduce((sum, q) => sum + (Number(q.data?.amount) || 0), 0)

  const statusBadge = (status: ItemStatus) => {
    const map: Record<ItemStatus, { cls: string; label: string }> = {
      waiting:    { cls: 'bg-gray-700 text-gray-400',           label: 'Waiting'    },
      processing: { cls: 'bg-[#2D27FF]/20 text-[#2D27FF]',     label: 'Processing' },
      done:       { cls: 'bg-emerald-500/20 text-emerald-500',  label: 'Done'       },
      failed:     { cls: 'bg-[#FF0A6C]/20 text-[#FF0A6C]',     label: 'Failed'     },
    }
    const { cls, label } = map[status]
    return (
      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${cls} flex items-center gap-1`}>
        {status === 'processing' && <Loader2 className="w-3 h-3 animate-spin" />}
        {label}
      </span>
    )
  }

  if (done) {
    return (
      <div className="bg-[#0f111a] min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8 mt-10 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <p className="text-white font-display text-xl font-semibold mb-2">All Payments Saved</p>
            <p className="text-gray-500 text-sm">{doneCount} transactions · {formatKES(totalKES)} total</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => { setDone(false); setQueue([]) }}
                className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-2.5 text-sm font-medium">
                Scan More
              </button>
              <button onClick={() => router.push('/dashboard/scanner')}
                className="flex-1 border border-gray-700 text-gray-300 hover:bg-white/5 rounded-2xl py-2.5 text-sm transition-colors">
                Back
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[#0f111a] min-h-screen p-4 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-[#00E1FD]/10 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-[#00E1FD]" />
          </div>
          <div>
            <h1 className="text-white font-display text-xl font-semibold">M-Pesa Batch Scanner</h1>
            <p className="text-gray-500 text-xs mt-0.5">
              Upload multiple M-Pesa screenshots at once. Process up to 20 at a time.
            </p>
          </div>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-gray-700 rounded-2xl p-8 text-center cursor-pointer hover:border-[#00E1FD]/50 hover:bg-[#00E1FD]/5 transition-all mb-4"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
        >
          <Upload className="w-10 h-10 text-gray-600 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Click or drag M-Pesa screenshots here</p>
          <p className="text-gray-600 text-xs mt-1">Up to 20 images at once</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
        />

        {/* Queue */}
        {queue.length > 0 && (
          <div className="space-y-3 mb-6">
            {queue.map((item, i) => (
              <div key={i} className="bg-[#161925] border border-gray-800 rounded-2xl p-4 flex items-center gap-4">
                <img src={item.previewUrl} alt="" className="w-16 h-12 object-cover rounded-lg shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-gray-300 text-sm truncate">{item.file.name}</p>
                  {item.data && (
                    <p className="text-gray-500 text-xs mt-0.5">
                      {formatKES(item.data.amount)}
                      {item.data.transaction_id ? ` · ${String(item.data.transaction_id)}` : ''}
                      {item.data.sender_name ? ` · ${String(item.data.sender_name)}` : ''}
                    </p>
                  )}
                  {item.error && <p className="text-[#FF0A6C] text-xs mt-0.5">{item.error}</p>}
                </div>
                {statusBadge(item.status)}
              </div>
            ))}
          </div>
        )}

        {/* Progress */}
        {progressText && (
          <div className="flex items-center gap-2 text-[#2D27FF] text-sm mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            {progressText}
          </div>
        )}

        {/* Summary after processing */}
        {!isProcessing && doneCount > 0 && (
          <div className="bg-[#161925] border border-gray-800 rounded-2xl p-4 mb-4 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-white font-display">{doneCount}</p>
              <p className="text-gray-500 text-xs mt-1">Processed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#00E1FD] font-display">{formatKES(totalKES)}</p>
              <p className="text-gray-500 text-xs mt-1">Total KES</p>
            </div>
            <div>
              <p className={`text-2xl font-bold font-display ${failedCount > 0 ? 'text-[#FF0A6C]' : 'text-emerald-500'}`}>{failedCount}</p>
              <p className="text-gray-500 text-xs mt-1">Failed</p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {!isProcessing && queue.some((q) => q.status === 'waiting') && (
            <button onClick={processAll}
              className="flex-1 bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-2xl py-3 text-sm font-medium">
              Process All ({queue.filter((q) => q.status === 'waiting').length} queued)
            </button>
          )}
          {!isProcessing && doneCount > 0 && (
            <button onClick={saveAll} disabled={isSaving}
              className="flex-1 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-2xl py-3 text-sm font-medium hover:from-teal-500 hover:to-teal-400 disabled:opacity-50">
              {isSaving ? 'Saving...' : `Save All to Fee Records`}
            </button>
          )}
          {queue.length > 0 && !isProcessing && (
            <button onClick={() => setQueue([])}
              className="border border-gray-700 text-gray-400 hover:text-white hover:bg-white/5 rounded-2xl px-4 py-3 text-sm transition-colors">
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
