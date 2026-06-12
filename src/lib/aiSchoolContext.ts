// Builds a school-aware system-prompt preamble so AI output is framed for the
// specific tenant: single-gender vs mixed, boarding vs day, curriculum mix.
//
// Critical for Oloolaiser (boys-only boarding): discipline, performance and
// mental-health analysis should reflect boy-child behaviour and tendencies,
// and boarding welfare (homesickness, dormitory life, prep) where relevant.

import { createAdminSupabaseClient } from '@/lib/supabase-server'

export interface SchoolAIProfile {
  schoolName: string
  genderProfile: 'mixed' | 'boys' | 'girls'
  schoolType: 'day' | 'boarding' | 'both'
  curriculumMix: 'CBC' | '844' | 'fusion' | string
}

export async function getSchoolAIProfile(schoolId: string): Promise<SchoolAIProfile> {
  const db = createAdminSupabaseClient()
  const { data } = await db
    .from('school_metadata')
    .select('name, gender_profile, school_type, curriculum_mix')
    .eq('school_id', schoolId)
    .maybeSingle()
  return {
    schoolName: (data as any)?.name ?? 'the school',
    genderProfile: ((data as any)?.gender_profile ?? 'mixed'),
    schoolType: ((data as any)?.school_type ?? 'day'),
    curriculumMix: ((data as any)?.curriculum_mix ?? 'fusion'),
  }
}

export function buildSchoolAIPreamble(p: SchoolAIProfile): string {
  const parts: string[] = []
  parts.push(`Context: you are assisting ${p.schoolName}, a Kenyan secondary school.`)

  if (p.genderProfile === 'boys') {
    parts.push(
      'This is a BOYS-ONLY school. Frame all discipline, performance, well-being and ' +
      'mental-health analysis around boy-child behaviour and tendencies (e.g. peer ' +
      'influence, aggression/anger management, risk-taking, reluctance to seek help, ' +
      'identity and self-efficacy). Never reference female students.',
    )
  } else if (p.genderProfile === 'girls') {
    parts.push(
      'This is a GIRLS-ONLY school. Frame analysis around girl-child behaviour, ' +
      'well-being and safeguarding. Never reference male students.',
    )
  }

  if (p.schoolType === 'boarding' || p.schoolType === 'both') {
    parts.push(
      'It is a boarding school: consider boarding welfare — homesickness, dormitory ' +
      'dynamics, prep/study routines, sick-bay patterns and night-time safety.',
    )
  }

  parts.push('Be concise, practical, and grounded in the Kenyan context (KCSE, CBC/CBE, KNEC, TSC/TPAD).')
  return parts.join(' ')
}

export async function buildSchoolSystemPrompt(schoolId: string, basePrompt?: string): Promise<string> {
  const profile = await getSchoolAIProfile(schoolId)
  const preamble = buildSchoolAIPreamble(profile)
  return basePrompt ? `${preamble}\n\n${basePrompt}` : preamble
}
