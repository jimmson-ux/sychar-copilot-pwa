// @sychar/core — framework-agnostic platform logic. Single source of truth;
// vendored into the school PWAs via scripts/sync-core.mjs. NO next/* or @tanstack/*.

export * from './ctx'

// Templates (lesson plan, record of work, TOD, counselling, nurse, minutes)
export * from './templates'

// Domain config + calculators
export * from './domain/roles'
export * from './domain/curriculumConfig'
export * from './domain/kra2026'
export * from './domain/kuccps-data'
export * from './domain/kemis'
export * from './domain/scannerSchemas'
export * from './domain/subjectColors'
export * from './domain/billing'
export * from './domain/nurseStock'
export * from './domain/features'
export * from './domain/roleRouting'

// Shared types
export * from './types/school'

// Data-access (dependency-injected: (supabase, ctx, input)) — added in Phase 2.
