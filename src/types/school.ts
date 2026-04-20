// ── School types — single source of truth for multitenancy ──────────────────
// Used by SchoolThemeProvider, useSchool, useFeatureFlag,
// and every V0 component that needs school context.

export interface SchoolTheme {
  primary_color:    string   // e.g. "#1e40af"
  secondary_color:  string   // e.g. "#22c55e"
  gradient_from:    string
  gradient_to:      string
  logo_url:         string
  banner_url:       string
  school_motto:     string
  login_style:      'split_screen' | 'centered' | 'full_banner'
  accent_pattern:   string   // e.g. "dots" | "lines" | "none"
}

export interface FeaturesEnabled {
  boarding_module:       boolean
  dual_deputy:           boolean
  school_nurse:          boolean
  digital_wallet:        boolean
  alumni_portal:         boolean
  e_magazine:            boolean
  qr_lesson_attendance:  boolean
  nts_management:        boolean
  gate_pass:             boolean
  provisions_store:      boolean
}

export interface SchoolContext {
  schoolId:       string
  schoolName:     string
  shortName:      string
  schoolType:     'day' | 'boarding' | 'both'
  curriculumMix:  'CBC' | '844' | 'fusion'
  theme:          SchoolTheme
  featuresEnabled: FeaturesEnabled
  currentTerm:    string              // "Term 1", "Term 2", "Term 3"
  academicYear:   string              // "2026"
  principalPhone: string
  knecCode:       string
  county:         string
}

// Defaults — used while loading and as fallback
export const DEFAULT_THEME: SchoolTheme = {
  primary_color:   '#1e40af',
  secondary_color: '#22c55e',
  gradient_from:   '#1e40af',
  gradient_to:     '#22c55e',
  logo_url:        '/icon-192.png',
  banner_url:      '',
  school_motto:    '',
  login_style:     'centered',
  accent_pattern:  'none',
}

export const DEFAULT_FEATURES: FeaturesEnabled = {
  boarding_module:       false,
  dual_deputy:           false,
  school_nurse:          true,
  digital_wallet:        false,
  alumni_portal:         true,
  e_magazine:            true,
  qr_lesson_attendance:  true,
  nts_management:        false,
  gate_pass:             true,
  provisions_store:      false,
}

export const DEFAULT_CONTEXT: SchoolContext = {
  schoolId:        '',
  schoolName:      'Sychar School',
  shortName:       'Sychar',
  schoolType:      'day',
  curriculumMix:   'fusion',
  theme:           DEFAULT_THEME,
  featuresEnabled: DEFAULT_FEATURES,
  currentTerm:     'Term 1',
  academicYear:    new Date().getFullYear().toString(),
  principalPhone:  '',
  knecCode:        '',
  county:          '',
}
