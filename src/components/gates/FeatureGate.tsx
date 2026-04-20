'use client'

/**
 * FeatureGate
 *
 * Renders children only when the authenticated school has the given feature
 * enabled in features_enabled JSON. Returns null (or optional fallback) otherwise.
 *
 * Usage:
 *   <FeatureGate feature="gate_pass">
 *     <GatePassPanel />
 *   </FeatureGate>
 *
 *   <FeatureGate feature="boarding_module" fallback={<p>Not available</p>}>
 *     <DormitoryPanel />
 *   </FeatureGate>
 *
 * Returns null while school context is loading (featuresEnabled defaults to
 * all false), so optional panels stay hidden until context arrives —
 * no flash of unintended content.
 */

import React from 'react'
import { useFeatureFlag } from '@/hooks/useFeatureFlag'
import type { FeaturesEnabled } from '@/types/school'

interface FeatureGateProps {
  feature:   keyof FeaturesEnabled
  children:  React.ReactNode
  fallback?: React.ReactNode
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const enabled = useFeatureFlag(feature)
  return enabled ? <>{children}</> : <>{fallback}</>
}
