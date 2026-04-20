'use client'

/**
 * SchoolTypeGate
 *
 * Renders children only when the school's type matches.
 *
 * Rules:
 *   type="day"      → renders for schoolType 'day' or 'both'
 *   type="boarding" → renders for schoolType 'boarding' or 'both'
 *   type="both"     → renders only for schoolType 'both'
 *
 * Usage:
 *   <SchoolTypeGate type="boarding">
 *     <NightDutyPanel />       {/* hidden for pure day schools *\/}
 *   </SchoolTypeGate>
 *
 *   <SchoolTypeGate type="day">
 *     <GatePassPanel />        {/* shown for day + mixed schools *\/}
 *   </SchoolTypeGate>
 *
 *   <SchoolTypeGate type="both">
 *     <DayBoardingToggle />    {/* shown only for mixed schools *\/}
 *   </SchoolTypeGate>
 */

import React from 'react'
import { useSchool } from '@/hooks/useSchool'

type SchoolTypeProp = 'day' | 'boarding' | 'both'

interface SchoolTypeGateProps {
  type:      SchoolTypeProp
  children:  React.ReactNode
  fallback?: React.ReactNode
}

export function SchoolTypeGate({ type, children, fallback = null }: SchoolTypeGateProps) {
  const { schoolType } = useSchool()

  const visible =
    type === 'both'
      ? schoolType === 'both'
      : type === 'boarding'
        ? schoolType === 'boarding' || schoolType === 'both'
        : schoolType === 'day'      || schoolType === 'both'

  return visible ? <>{children}</> : <>{fallback}</>
}
