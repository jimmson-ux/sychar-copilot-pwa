'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { UploadCloud, Camera, AlertTriangle, Loader2, FileText } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScanResult {
  base64: string
  mimeType: string
  fileName: string
  fileSize: number
}

interface DocumentScannerProps {
  documentType: string
  title: string
  onScanComplete: (result: ScanResult) => void
}

type CameraState = 'idle' | 'live' | 'captured' | 'error'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DocumentScanner({
  documentType,
  title,
  onScanComplete,
}: DocumentScannerProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'camera'>('upload')

  // Upload state
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  // Camera state
  const [cameraState, setCameraState] = useState<CameraState>('idle')
  const [capturedImage, setCapturedImage] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Attach stream to video element once it mounts and camera is live
  useEffect(() => {
    if (cameraState === 'live' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [cameraState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // ── Upload helpers ──────────────────────────────────────────────────────────

  function handleFile(f: File) {
    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f))
    } else {
      setPreviewUrl(null)
    }
  }

  function clearFile() {
    setFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleScanFile() {
    if (!file) return
    setIsScanning(true)
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      onScanComplete({
        base64,
        mimeType: file.type,
        fileName: file.name,
        fileSize: file.size,
      })
      setIsScanning(false)
    }
    reader.readAsDataURL(file)
  }

  // ── Camera helpers ──────────────────────────────────────────────────────────

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  async function startCamera() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      streamRef.current = s
      setCameraState('live')
    } catch {
      setCameraState('error')
    }
  }

  function handleTabSwitch(tab: 'upload' | 'camera') {
    if (tab === activeTab) return
    if (tab === 'camera') {
      setActiveTab('camera')
      setCameraState('idle')
      setCapturedImage(null)
      startCamera()
    } else {
      stopStream()
      setCameraState('idle')
      setCapturedImage(null)
      setActiveTab('upload')
    }
  }

  function capturePhoto() {
    if (!videoRef.current || !canvasRef.current) return
    const canvas = canvasRef.current
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL('image/png')
    setCapturedImage(dataUrl)
    setCameraState('captured')
    stopStream()
  }

  function retakePhoto() {
    setCapturedImage(null)
    setCameraState('idle')
    startCamera()
  }

  function handleUsePhoto() {
    if (!capturedImage) return
    const base64 = capturedImage.split(',')[1]
    onScanComplete({
      base64,
      mimeType: 'image/png',
      fileName: 'captured-photo.png',
      fileSize: 0,
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-2 bg-[#1f2333] p-1 rounded-full w-fit mb-6">
        <button
          onClick={() => handleTabSwitch('upload')}
          className={
            activeTab === 'upload'
              ? 'bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-full px-5 py-2 text-sm font-medium'
              : 'text-gray-400 hover:text-white px-5 py-2 text-sm rounded-full transition-colors cursor-pointer'
          }
        >
          Upload File
        </button>
        <button
          onClick={() => handleTabSwitch('camera')}
          className={
            activeTab === 'camera'
              ? 'bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF] text-white rounded-full px-5 py-2 text-sm font-medium'
              : 'text-gray-400 hover:text-white px-5 py-2 text-sm rounded-full transition-colors cursor-pointer'
          }
        >
          Take Photo
        </button>
      </div>

      {/* ── Upload Tab ── */}
      {activeTab === 'upload' && (
        <div>
          <div
            className={`border-2 border-dashed rounded-2xl min-h-[240px] flex flex-col items-center
              justify-center cursor-pointer transition-all duration-200 p-8 text-center relative
              ${
                isDragOver
                  ? 'border-[#FF0A6C]/70 bg-[#FF0A6C]/10'
                  : 'border-gray-700 hover:border-[#FF0A6C]/50 hover:bg-[#FF0A6C]/5'
              }`}
            onClick={() => {
              if (!file) fileInputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragOver(true)
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
          >
            {file ? (
              file.type.startsWith('image/') && previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="object-contain max-h-[240px] w-full rounded-xl"
                />
              ) : (
                <div className="flex items-center justify-center gap-3">
                  <FileText className="w-10 h-10 text-gray-500" />
                  <span className="text-gray-400 text-sm">PDF Document</span>
                </div>
              )
            ) : (
              <>
                <UploadCloud className="w-12 h-12 text-gray-600 mb-4" />
                <p className="text-gray-400 text-sm">
                  Drag your document here or click to browse
                </p>
                <p className="text-gray-600 text-xs mt-1">Accepts JPG, PNG, PDF</p>
              </>
            )}
          </div>

          {file && (
            <div className="flex justify-between items-center mt-3">
              <div>
                <p className="text-gray-300 text-sm truncate max-w-[200px]">{file.name}</p>
                <p className="text-gray-500 text-xs">{formatFileSize(file.size)}</p>
              </div>
              <button
                onClick={clearFile}
                className="text-gray-500 hover:text-[#FF0A6C] text-xs transition-colors"
              >
                Clear
              </button>
            </div>
          )}

          <input
            type="file"
            accept="image/*,application/pdf"
            ref={fileInputRef}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleFile(f)
            }}
          />

          <button
            onClick={handleScanFile}
            disabled={!file || isScanning}
            className={`mt-4 w-full py-3 rounded-2xl font-medium text-sm transition-all flex items-center justify-center
              ${
                file && !isScanning
                  ? 'bg-gradient-to-r from-teal-600 to-teal-500 text-white hover:from-teal-500 hover:to-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50'
              }`}
          >
            {isScanning && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            {isScanning ? 'Scanning...' : 'Scan Document'}
          </button>
        </div>
      )}

      {/* ── Camera Tab ── */}
      {activeTab === 'camera' && (
        <div>
          {cameraState === 'idle' && (
            <div className="flex flex-col items-center justify-center min-h-[240px]">
              <div className="animate-spin w-8 h-8 border-2 border-[#FF0A6C] border-t-transparent rounded-full" />
            </div>
          )}

          {cameraState === 'live' && (
            <>
              <div className="rounded-2xl overflow-hidden bg-[#1f2333] aspect-video relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex justify-center mt-4">
                <button
                  onClick={capturePhoto}
                  className="w-16 h-16 rounded-full border-2 border-[#FF0A6C]/50 flex items-center justify-center"
                >
                  <div
                    className="w-12 h-12 rounded-full bg-gradient-to-r from-[#FF0A6C] to-[#2D27FF]
                      hover:scale-95 active:scale-90 transition-transform
                      shadow-[0_0_20px_rgba(255,10,108,0.4)] flex items-center justify-center"
                  >
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </button>
              </div>
            </>
          )}

          {cameraState === 'captured' && capturedImage && (
            <>
              <div className="rounded-2xl overflow-hidden bg-[#1f2333] aspect-video relative">
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button
                  onClick={retakePhoto}
                  className="flex-1 border border-gray-700 text-gray-300 hover:bg-white/5 rounded-2xl px-6 py-2.5 text-sm transition-colors"
                >
                  Retake
                </button>
                <button
                  onClick={handleUsePhoto}
                  className="flex-1 bg-gradient-to-r from-teal-600 to-teal-500 text-white rounded-2xl px-6 py-2.5 text-sm transition-all hover:from-teal-500 hover:to-teal-400"
                >
                  Use This Photo
                </button>
              </div>
            </>
          )}

          {cameraState === 'error' && (
            <div className="flex flex-col items-center justify-center min-h-[240px] text-center p-8">
              <AlertTriangle className="w-10 h-10 text-[#FF0A6C] mb-3" />
              <p className="text-gray-300 text-sm font-medium">Camera access denied</p>
              <p className="text-gray-500 text-xs mt-1">
                Please allow camera access in your browser settings
              </p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </div>
  )
}
