# PCEA Upper Matasia Senior Secondary — onboarding checklist

Day school, small roll, understaffed, **mixed** (boys & girls). Feature set = **nkoroi parity**
until specific improvements are requested. Shared Supabase `xwgtsldimlrhtgvpnjnd`.

## Frontend repo de-Nkoroi-fied + multi-role Deputy — DONE (2026-06-10)
Repo `pceauppermatasiasenior` (Vite/TanStack, talks directly to shared Supabase) was a verbatim
Nkoroi clone. Made PCEA-distinct + built the understaffed-school multi-role dashboard:
- **Identity:** Nkoroi UUID fallback → PCEA `d380a396…`; `nkoroimixed.sychar.co.ke` → `pceamatasia.sychar.co.ke`; all "Nkoroi Mixed…" names, PDF headers (report-card, payslip), placeholders, CSV filenames, social handle, manifest, `.env.example` → PCEA; school address → `P.O. Box 44-00208, Ngong Hills · uppermatasia@gmail.com`.
- **Roster:** `src/lib/nkoroi-roster.ts` → **`src/lib/pcea-roster.ts`** (`PCEA_ROSTER` = the real 16 staff, PCEA departments, no streams); importers repointed.
- **Multi-role (`secondary_roles`):** previously read by zero code. Added `StaffRecord.secondary_roles` + `rolesFor()`/`navItemsForRoles()` (`types.ts`); `role-guard` now allows primary ∪ secondary; sidebar shows the union; `auth-context` selects + **self-heals** `secondary_roles` (works even before the RPC migration lands); dev-bypass gains a multi-role Deputy preview.
- **Deputy "Command Center":** `MultiRoleCommandCenter` on `dashboard.deputy-admin` — one-click switch cards to Finance / Store / Requisitions / Teaching for whichever hats the user holds.
- **DB:** Deputy **Moti Abel Nyakundi** → `sub_role=deputy_principal_admin`, `secondary_roles=[bursar,storekeeper,subject_teacher]` (live + in `seed-matasia.ts`). RPC migration `20260610120000_staff_record_secondary_roles.sql` (both repos) adds `secondary_roles`/`assigned_class` to `get_current_staff_record` — **apply via Supabase dashboard** (self-heal covers it meanwhile).
- **⏳ Branding pending user assets:** logo file + hex colors. `styles.css` `--nkoroi-*`/`.nkoroi-*` tokens + `nkoroi-logo.jpg` kept as the single swap point; legacy `tenant-context` slug aliases left (harmless).

## Tenant + repo — DONE (2026-06-06)
- `schools.id` = **d380a396-c3dc-47a8-a1c3-0aa267c77869**, subdomain **`pceamatasia`** (aligned to host `pceamatasia.sychar.co.ke`), code `MATASIA`, county Kajiado.
- `tenant_configs`: slug `pceamatasia`, **short code `MTSA`** (parents log in with this), settings: `school_type=day`, `is_mixed=true`, `visitor_alerts=false`, `require_parent_phone=false`.
- **Repo created + pushed:** `github.com/jimmson-ux/pceauppermatasiasenior` (worker `pcea-matasia-pwa`, route `pceamatasia.sychar.co.ke/*`). Connect Lovable to it.

## ⚠️ Multi-role staff (understaffing)
Deputy Principal also = Storekeeper + Bursar + Subject Teacher. `staff_records.sub_role` is single → at seed time give multi-role staff `secondary_roles[]` (or duplicate role rows) so storekeeper/bursar/teacher pushes + dashboards all reach the one person. Don't lose any role.

## DNS
Add a **proxied CNAME `pceamatasia`** under the sychar.co.ke zone (unless `*.sychar.co.ke` wildcard already resolves it) so the worker route binds.

## Seed data — DONE (2026-06-10) via `scripts/seed-matasia.ts`
Roster from official bio-data (no synthetic data; fields not in source left NULL).
- **3 classes** (single stream): Form 3 (844), Form 4 (844), Grade 10 (CBE).
- **100 students**: Form 3 = 26, Form 4 = 40, Grade 10 = 34.
- **16 staff**: 12 teaching (`tsc`) + 4 support (`bom`). sub_role authoritative; documented dual roles in `secondary_roles` (Senior Master+G&C, HOD Humanities+G&C, HOD Sciences+class_teacher).
- **Class teachers** wired via `staff_records.assigned_class` + `assigned_class_id` (Mogire→F3, Kariu→F4, Kariuki→G10).
- **3 academic terms** mirrored from Nkoroi; **Term 2 2026 = current**; `tenant_configs` current_term=2/current_year=2026.

**Schema gotchas learned (durable):**
- `students` unique key is **`admission_number`** (constraint `students_school_admission_number_uniq`), NOT `admission_no`. `admission_no` is the free display field → dup-admission model: keep real number on `admission_no`, suffix `admission_number` on collision.
- `students.grade` is **integer** (Grade 10 → `10`, forms → null); `form` carries 3/4.
- `staff_records.employment_type` CHECK allows **`tsc`/`bom`** (use `bom` for support staff).
- `classes.class_teacher_id` FK does **not** accept `staff_records.id` — leave null (Nkoroi does); class-teacher resolution is via `assigned_class`/`assigned_class_id`.

**⚠️ Data gaps to verify with school:**
- **ADM 984 duplicate** kept as 2 real students (Doughlas Lekinyotu F4 / Charles Memusi F3) — flagged for school to confirm/reassign.
- **No bursar/storekeeper** in source (the earlier multi-role assumption is NOT in the documents) — confirm who handles finance/stores before fee/inventory features go live.
- **gender, guardian phones, DOB, KCPE** not in source → NULL. Collect guardian phones before parent linking.

## Pending (awaiting your data + secrets)
1. **Lovable:** connect the repo; replace `nkoroi-roster.ts` fallback + `dev-bypass.ts` pilot UUID + branding with PCEA's.
2. **Secrets** (Worker): own `STAFF_JWT_SECRET` (also add to wazazi `PUSH_RELAY_SECRETS`), Supabase service/anon, AI keys, Pusher, Upstash, Firebase. M-Pesa when fees go live.
3. **Parent links:** collect guardian phones → seed onto students → `/api/admin/seed-parent-links` (`seed_from_students`).
4. **Auth users:** create login users for the 12 teaching staff (force_password_change already true) so they can sign in.
5. **Deploy + DNS:** build + `wrangler deploy`; `pceamatasia.sychar.co.ke` CNAME already added.
6. **Flip flags:** `require_parent_phone=true` AFTER guardian phones seeded + Lovable login phone field live. Consider `visitor_alerts` later if they adopt a gate book.
7. **Schedules:** QStash → signed `/api/cron/*` routes (lesson-plan-reminder, lesson-scan-monitor, tod-handover).

## Understaffed-school notes (apply when customizing)
- Role mapping may collapse (e.g. one deputy, HOD = subject teacher); duty roster lighter; the AI duty-roster generator handles small staff. ToD handover + lesson-scan persistence still apply.
- Everything else inherits nkoroi behaviour. See `SYCHAR_PLATFORM_BLUEPRINT.md` for the full feature set + runbook.
