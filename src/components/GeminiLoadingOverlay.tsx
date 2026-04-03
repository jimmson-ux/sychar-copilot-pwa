'use client'

import { useState, useEffect } from 'react'

const SCAN_MESSAGES: Record<string, string[]> = {
  ocr_apology_letter: [
    'Reading student handwriting...',
    'Identifying student name and class...',
    'Extracting offence details...',
    'Checking for signatures...',
    'Analysing tone of apology...',
  ],
  ocr_grade_sheet: [
    'Scanning mark sheet columns...',
    'Reading student names...',
    'Extracting scores row by row...',
    'Matching admission numbers...',
    'Calculating totals...',
  ],
  ocr_fee_receipt: [
    'Identifying receipt type...',
    'Reading payment amount...',
    'Extracting reference number...',
    'Reading payment date and time...',
    'Matching student details...',
  ],
  ocr_mpesa_batch: [
    'Reading M-Pesa message...',
    'Extracting transaction ID...',
    'Reading sender details...',
    'Confirming amount...',
  ],
  ocr_fee_schedule: [
    'Reading fee structure document...',
    'Extracting fee items...',
    'Reading amounts...',
    'Identifying due dates...',
    'Compiling fee schedule...',
  ],
  ocr_hod_report: [
    'Reading department report...',
    'Identifying attendees...',
    'Extracting issues raised...',
    'Reading action items...',
    'Identifying deadlines...',
  ],
  ocr_official_letter: [
    'Reading letter details...',
    'Identifying sender and recipient...',
    'Extracting key points...',
    'Reading reference number...',
  ],
  default: [
    'Gemini is reading your document...',
    'Extracting information...',
    'Almost done...',
  ],
}

interface GeminiLoadingOverlayProps {
  isVisible: boolean
  task: string
}

export default function GeminiLoadingOverlay({
  isVisible,
  task,
}: GeminiLoadingOverlayProps) {
  const [msgIdx, setMsgIdx] = useState(0)
  const messages = SCAN_MESSAGES[task] ?? SCAN_MESSAGES.default

  useEffect(() => {
    if (!isVisible) {
      setMsgIdx(0)
      return
    }
    const iv = setInterval(() => setMsgIdx((i) => (i + 1) % messages.length), 1800)
    return () => clearInterval(iv)
  }, [isVisible, messages.length])

  if (!isVisible) return null

  return (
    <div className="absolute inset-0 bg-[#0f111a]/90 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20">
      {/* Spinner */}
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 rounded-full border-2 border-gray-800" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#FF0A6C] border-r-[#2D27FF] animate-spin" />
        <div
          className="absolute inset-2 rounded-full border-2 border-transparent border-t-teal-500 animate-spin"
          style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-white">AI</span>
        </div>
      </div>
      <p className="text-white text-sm font-medium mb-1">{messages[msgIdx]}</p>
      <p className="text-gray-500 text-xs">Powered by Gemini Vision</p>
    </div>
  )
}
