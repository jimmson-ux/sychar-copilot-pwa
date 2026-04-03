import { useState } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null
function getClient(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _supabase
}

export interface OCRResult {
  success: boolean
  data: Record<string, unknown>
  confidence: number | null
  task: string
}

export function useOCRScanner() {
  const [isScanning, setIsScanning] = useState(false)
  const [result, setResult] = useState<OCRResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scan = async (
    file: File | string,
    task: string
  ): Promise<OCRResult | null> => {
    setIsScanning(true)
    setError(null)
    setResult(null)

    try {
      let base64: string
      let mimeType: string

      if (typeof file === 'string') {
        base64 = file.includes(',') ? file.split(',')[1] : file
        mimeType = 'image/png'
      } else {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            resolve((reader.result as string).split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        mimeType = file.type || 'image/jpeg'
      }

      const {
        data: { session },
      } = await getClient().auth.getSession()

      // Try Supabase Edge Function first
      const { data, error: fnError } = await getClient().functions.invoke(
        'process-document',
        {
          body: {
            base64,
            mimeType,
            task,
            schoolId: process.env.NEXT_PUBLIC_SCHOOL_ID,
            userId: session?.user?.id,
          },
        }
      )

      if (fnError) {
        // Fallback: call Next.js API route with direct Gemini
        const res = await fetch('/api/scanner/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64,
            mimeType,
            task,
            userId: session?.user?.id,
          }),
        })
        const fallbackData = await res.json()
        if (!fallbackData.success) throw new Error(fallbackData.error || 'OCR failed')
        const ocr: OCRResult = { ...fallbackData, task }
        setResult(ocr)
        return ocr
      }

      if (!data?.success) throw new Error(data?.error || 'OCR failed')

      const ocr: OCRResult = { ...data, task }
      setResult(ocr)
      return ocr
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Scan failed. Please try again.'
      setError(msg)
      return null
    } finally {
      setIsScanning(false)
    }
  }

  const reset = () => {
    setResult(null)
    setError(null)
    setIsScanning(false)
  }

  return { scan, isScanning, result, error, reset }
}
