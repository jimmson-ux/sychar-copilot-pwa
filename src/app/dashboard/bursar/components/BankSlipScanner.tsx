'use client'

import { useRef, useCallback, useState } from 'react'
import { useBankSlipOCR } from '@/lib/hooks/useBankSlipOCR'

interface ExtractedValues {
  amount: number | null
  reference: string | null
  date: string | null
  method: 'mpesa' | 'bank_transfer' | 'cash' | null
}

interface BankSlipScannerProps {
  onExtracted: (values: ExtractedValues) => void
  onClose: () => void
}

export default function BankSlipScanner({ onExtracted, onClose }: BankSlipScannerProps) {
  const { scan, scanning, progress, result, error, reset } = useBankSlipOCR()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.')
      return
    }
    await scan(file)
  }, [scan])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleApply = useCallback(() => {
    if (!result) return
    onExtracted({
      amount:    result.amount,
      reference: result.reference,
      date:      result.date,
      method:    result.method,
    })
    onClose()
  }, [result, onExtracted, onClose])

  const confidenceColor = result
    ? result.confidence >= 0.85 ? 'text-green-600'
    : result.confidence >= 0.65 ? 'text-amber-600'
    : 'text-red-600'
    : ''

  const confidenceLabel = result
    ? result.confidence >= 0.85 ? 'High confidence'
    : result.confidence >= 0.65 ? 'Medium confidence'
    : 'Low confidence — verify manually'
    : ''

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-blue-600 text-lg">📷</span>
          <span className="font-semibold text-blue-800 text-sm">Scan Bank Slip / M-Pesa Screenshot</span>
          <span className="text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">On-device OCR</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none"
          aria-label="Close scanner"
        >
          ✕
        </button>
      </div>

      {!result && !scanning && (
        <>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-500 bg-blue-100' : 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <div className="text-4xl mb-2">🏦</div>
            <p className="text-sm font-medium text-blue-700">Drop slip image here or click to browse</p>
            <p className="text-xs text-gray-500 mt-1">JPG · PNG · WebP — image never leaves this device</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-2"
          >
            📸 Take Photo / Choose Image
          </button>
        </>
      )}

      {scanning && (
        <div className="text-center py-6 space-y-3">
          <div className="text-3xl animate-spin inline-block">⚙️</div>
          <p className="text-sm font-medium text-blue-700">Reading text from image…</p>
          <div className="w-full bg-blue-100 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-blue-500">{progress}%</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
          <button onClick={reset} className="ml-2 underline text-red-600 hover:text-red-800">Try again</button>
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className={`text-xs font-semibold flex items-center gap-1 ${confidenceColor}`}>
            <span>●</span> {confidenceLabel} ({Math.round(result.confidence * 100)}%)
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500 font-medium mb-1">Amount</div>
              <div className="font-bold text-gray-800">
                {result.amount != null ? `KSH ${result.amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}` : '—'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500 font-medium mb-1">Method</div>
              <div className="font-medium text-gray-800 capitalize">
                {result.method?.replace('_', ' ') ?? '—'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500 font-medium mb-1">Reference</div>
              <div className="font-mono text-xs font-bold text-gray-800 break-all">
                {result.reference ?? '—'}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border">
              <div className="text-xs text-gray-500 font-medium mb-1">Date</div>
              <div className="font-medium text-gray-800">{result.date ?? '—'}</div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleApply}
              disabled={result.amount == null && result.reference == null}
              className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-40"
            >
              ✓ Use These Values
            </button>
            <button
              onClick={reset}
              className="flex-1 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              Rescan
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
