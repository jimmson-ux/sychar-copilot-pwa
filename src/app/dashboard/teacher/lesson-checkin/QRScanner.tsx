'use client'

// html5-qrcode scanner wrapper.
// Renders a live camera viewfinder and calls onResult() with the decoded string.

import { useEffect, useRef, useCallback } from 'react'

interface QRScannerProps {
  onResult: (text: string) => void
  onError?: (err: string) => void
  active: boolean
}

export default function QRScanner({ onResult, onError, active }: QRScannerProps) {
  const mountId = 'qr-reader-mount'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null)

  const startScanner = useCallback(async () => {
    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(mountId)
    scannerRef.current = scanner

    try {
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          onResult(decodedText)
          // Auto-stop after first successful scan
          scanner.stop().catch(() => {})
        },
        undefined
      )
    } catch (err) {
      onError?.(String(err))
    }
  }, [onResult, onError])

  useEffect(() => {
    if (!active) return
    startScanner()
    return () => {
      scannerRef.current?.stop().catch(() => {})
    }
  }, [active, startScanner])

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div
        id={mountId}
        className="rounded-xl overflow-hidden border-2 border-blue-500"
        style={{ minHeight: 280 }}
      />
      <p className="text-center text-sm text-gray-500 mt-2">
        Point camera at classroom QR code
      </p>
    </div>
  )
}
