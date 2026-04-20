'use client'

import type { SchoolFeatures } from '@/lib/features'
import { hasFeature, ADDON_META } from '@/lib/features'

interface FeatureGateProps {
  feature:   keyof SchoolFeatures
  features:  SchoolFeatures | null
  children:  React.ReactNode
  fallback?: React.ReactNode
}

export default function FeatureGate({
  feature,
  features,
  children,
  fallback,
}: FeatureGateProps) {
  if (hasFeature(features, feature)) {
    return <>{children}</>
  }

  if (fallback !== undefined) {
    return <>{fallback}</>
  }

  const meta = ADDON_META[feature]

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-6 py-10 text-center">
      <span className="text-3xl" aria-hidden="true">🔒</span>
      <p className="text-sm font-semibold text-gray-700">{meta.label}</p>
      <p className="text-sm text-gray-500">This module is not enabled for this school.</p>
      <p className="text-xs text-gray-400">Enable it from the God Mode dashboard.</p>
    </div>
  )
}
