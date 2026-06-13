// Per-school role routing — resolves which sub_role(s) an "academic", "admin" or
// "dean" concern should reach, from the school's deputy/dean configuration. This makes
// every feature map correctly without hardcoding: two-deputy schools (Nkoroi, Oloolaiser)
// split Academic vs Admin; single-deputy schools (PCEA) route both to the one deputy;
// schools without a Dean of Studies route dean concerns to the academic deputy.
//
// Driven by tenant_configs.features { dual_deputy, has_dean } — NOT by staff presence,
// since rosters can be incomplete. Returns an ordered fan-out list (first = ideal target,
// rest = fallback) so push/notify reaches whoever actually holds the role.

export interface DeputyConfig {
  dualDeputy: boolean
  hasDean: boolean
}

export function deputyConfigFromFeatures(features: Record<string, unknown> | null | undefined): DeputyConfig {
  return {
    dualDeputy: Boolean(features?.dual_deputy),
    hasDean: Boolean(features?.has_dean),
  }
}

/** Academic concerns (timetable, marks, syllabus, lessons). */
export function academicTargets(cfg: DeputyConfig): string[] {
  return cfg.dualDeputy
    ? ['deputy_principal_academic', 'deputy_principal']
    : ['deputy_principal']
}

/** Administrative concerns (discipline, attendance, dorms, visitors, leave-outs). */
export function adminTargets(cfg: DeputyConfig): string[] {
  return cfg.dualDeputy
    ? ['deputy_principal_admin', 'deputy_principal']
    : ['deputy_principal']
}

/** Daily academic operations (lesson monitoring, scheme coverage, marks submission). */
export function deanTargets(cfg: DeputyConfig): string[] {
  return cfg.hasDean
    ? ['dean_of_studies', ...academicTargets(cfg)]
    : academicTargets(cfg)
}

/** Everyone who should receive an academic escalation, principal always included for oversight. */
export function academicEscalation(cfg: DeputyConfig): string[] {
  return Array.from(new Set([...deanTargets(cfg), 'principal']))
}

/** Everyone who should receive an admin escalation. */
export function adminEscalation(cfg: DeputyConfig): string[] {
  return Array.from(new Set([...adminTargets(cfg), 'principal']))
}
