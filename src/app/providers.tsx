'use client';
import { useEffect } from 'react';
import { initAnalytics, initClarity, initFormbricks } from '@/lib/analytics';

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initAnalytics();
    initClarity(process.env.NEXT_PUBLIC_CLARITY_ID ?? '');
    initFormbricks(process.env.NEXT_PUBLIC_FORMBRICKS_WORKSPACE_ID ?? '');
  }, []);
  return <>{children}</>;
}
