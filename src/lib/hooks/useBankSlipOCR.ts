'use client'

import { useState, useCallback } from 'react'

export interface BankSlipResult {
  amount: number | null
  reference: string | null
  date: string | null
  method: 'mpesa' | 'bank_transfer' | 'cash' | null
  rawText: string
  confidence: number  // 0–1
}

// Lazy-load Tesseract only in the browser — avoids SSR bundle issues.
let tesseractPromise: Promise<typeof import('tesseract.js')> | null = null
function loadTesseract() {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js')
  }
  return tesseractPromise
}

export function useBankSlipOCR() {
  const [scanning, setScanning]   = useState(false)
  const [progress, setProgress]   = useState(0)
  const [result, setResult]       = useState<BankSlipResult | null>(null)
  const [error, setError]         = useState<string | null>(null)

  const scan = useCallback(async (file: File) => {
    setScanning(true)
    setProgress(0)
    setResult(null)
    setError(null)

    try {
      const Tesseract = await loadTesseract()
      const { data } = await Tesseract.recognize(file, 'eng', {
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100))
          }
        },
      })

      const text       = data.text ?? ''
      const confidence = (data.confidence ?? 0) / 100

      setResult({
        amount:    parseAmount(text),
        reference: parseReference(text),
        date:      parseDate(text),
        method:    detectMethod(text),
        rawText:   text,
        confidence,
      })
    } catch {
      setError('OCR failed — try a clearer, well-lit image.')
    } finally {
      setScanning(false)
      setProgress(0)
    }
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
    setProgress(0)
  }, [])

  return { scan, scanning, progress, result, error, reset }
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseAmount(text: string): number | null {
  const patterns = [
    /Ksh\s*([\d,]+(?:\.\d{2})?)/i,
    /KES\s*([\d,]+(?:\.\d{2})?)/i,
    /Amount[:\s]+([\d,]+(?:\.\d{2})?)/i,
    /received\s+Ksh\s*([\d,]+)/i,
    /Total[:\s]+([\d,]+(?:\.\d{2})?)/i,
  ]
  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const n = parseFloat(m[1].replace(/,/g, ''))
      if (!isNaN(n) && n > 0) return n
    }
  }
  return null
}

function parseReference(text: string): string | null {
  // M-Pesa 10-char alphanumeric confirmation code e.g. "RBG7Q9X2WK"
  const mpesa = text.match(/\b([A-Z][A-Z0-9]{9})\b/)
  if (mpesa) return mpesa[1]
  const bank = text.match(/Ref(?:erence)?[:\s#]+([A-Z0-9/-]{6,25})/i)
  if (bank) return bank[1].trim()
  return null
}

function parseDate(text: string): string | null {
  const m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const [, d, mo, y] = m
    const year = y.length === 2 ? `20${y}` : y
    return `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return null
}

function detectMethod(text: string): 'mpesa' | 'bank_transfer' | 'cash' | null {
  const t = text.toLowerCase()
  if (t.includes('mpesa') || t.includes('m-pesa') || t.includes('safaricom')) return 'mpesa'
  if (t.includes('bank') || t.includes('equity') || t.includes('kcb') ||
      t.includes('cooperative') || t.includes('stanbic') || t.includes('rtgs')) return 'bank_transfer'
  if (t.includes('cash') || t.includes('receipt')) return 'cash'
  return null
}
