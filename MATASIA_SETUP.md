# PCEA Upper Matasia Senior Secondary — onboarding checklist

Day school, small roll, understaffed, **mixed** (boys & girls). Feature set = **nkoroi parity**
until specific improvements are requested. Shared Supabase `xwgtsldimlrhtgvpnjnd`.

## Tenant — DONE (2026-06-06)
- `schools.id` = **d380a396-c3dc-47a8-a1c3-0aa267c77869**, subdomain `matasia`, code `MATASIA`, county Kajiado.
- `tenant_configs`: slug `matasia`, **short code `MTSA`** (parents log in with this), settings: `school_type=day`, `is_mixed=true`, `visitor_alerts=false`, `require_parent_phone=false`.

## Pending (awaiting your data + GitHub URL + instructions)
1. **Staff repo:** give the GitHub URL → I clone `nkoroi-mixed-pwa`, set worker name + route `matasia.sychar.co.ke/*` + `VITE_SCHOOL_NAME="PCEA Upper Matasia Senior Secondary School"`, push; connect Lovable. Replace `nkoroi-roster.ts` fallback + branding with PCEA's.
2. **Secrets** (Worker): own `STAFF_JWT_SECRET` (also add to wazazi `PUSH_RELAY_SECRETS`), Supabase service/anon, AI keys, Pusher, Upstash, Firebase. M-Pesa when fees go live.
3. **Seed data** (via sychar-system admin endpoints): students (+guardian phones), staff (sub_role; note understaffing → fewer roles, possibly one person multi-role), subjects, academic terms, classes/streams, class-teacher assignments; then `parent_student_links` (`/api/admin/seed-parent-links` `seed_from_students`).
4. **Deploy + DNS:** build + `wrangler deploy`; add `matasia.sychar.co.ke`.
5. **Flip flags:** `require_parent_phone=true` AFTER guardian phones seeded + Lovable login phone field live. Consider `visitor_alerts` later if they adopt a gate book.
6. **Schedules:** QStash → signed `/api/cron/*` routes (lesson-plan-reminder, lesson-scan-monitor, tod-handover).

## Understaffed-school notes (apply when customizing)
- Role mapping may collapse (e.g. one deputy, HOD = subject teacher); duty roster lighter; the AI duty-roster generator handles small staff. ToD handover + lesson-scan persistence still apply.
- Everything else inherits nkoroi behaviour. See `SYCHAR_PLATFORM_BLUEPRINT.md` for the full feature set + runbook.
