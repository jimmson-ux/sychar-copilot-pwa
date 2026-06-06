# Sychar Copilot — Platform Blueprint (durable record for every school)

> The single source of truth for the multi-tenant architecture, the full feature set, the
> onboarding runbook, and the per-school configuration of every school in Sychar. Keep this
> committed so no plan/feature/build is ever lost. Updated 2026-06-06.

## 1. Architecture (multi-tenant)
- **One shared Supabase project** `xwgtsldimlrhtgvpnjnd` (Postgres + edge functions + storage) backs ALL schools.
- **Tenant resolution:** `schools`(subdomain/code/name) + `tenant_configs`(slug, school_short_code, settings). The staff PWA resolves the tenant by subdomain; parents (wazazi) by slug/short_code.
- **Per-school staff repo + worker:** each school gets a dedicated repo cloned from `nkoroi-mixed-pwa` (TanStack Start → Cloudflare Worker) on its own subdomain (`<school>.sychar.co.ke`). Lovable connects to that repo for UI. All point at the shared Supabase.
- **Parent PWA** = `wazazi.sychar.co.ke` (sychar-parents-pwa), multi-school; isolation by `parent_student_links` (authoritative) + single-school JWT + `requireParentStudent` reads + push relay filtered by `school_id`+`student_ids`.
- **Platform hub** = `sychar-system` (Next.js → Vercel): admin onboarding, biometric ADMS ingest, visitor API, cron routes.
- **Tenant feature flags** live in `tenant_configs.settings`: `school_type` (day|boarding), `is_mixed` (bool — coupling detection), `visitor_alerts` (bool), `require_parent_phone` (bool), `attendance_prealert`/`attendance_prealert_scope`, `current_term`/`current_year`.

## 2. Per-school config matrix
| School | school_id | subdomain | code | short_code | type | is_mixed | visitor_alerts | require_parent_phone | repo | status |
|---|---|---|---|---|---|---|---|---|---|---|
| Nkoroi Mixed Day Secondary | 68bd8d34-f2f0-4297-bd18-093328824d84 | (none, resolves by code) | NKOROI | 1834 | day | true | false | **true** | nkoroi-mixed-pwa | LIVE; 586 real students, 12 streams |
| Oloolaiser High | d228b049-1185-4bf5-9577-52f7f9c714e9 | oloolaiser | OLOOLAISER | OLHS | boarding | false | **true** | true | oloolaiser-highschool-pwa | tenant ready; awaiting bio-data + deploy |
| PCEA Upper Matasia Senior Sec | d380a396-c3dc-47a8-a1c3-0aa267c77869 | matasia | MATASIA | MTSA | day | true | false | false (flip after phones seeded) | (pending URL) | tenant created 2026-06-06; nkoroi-parity; data + repo pending |

## 3. Feature inventory (all built; nkoroi-parity is the baseline every school inherits)
- **Students/roster:** CSV import (`/api/admin/import-students`, class resolution, parent-link seed, optional biometric enrolment), staff import, parent↔student links. Admission numbers may legitimately repeat per school → uniqueness via `students.id` (UUID) + readable `admission_number` ref; `admission_no` is display + parent-search (dups allowed).
- **Parent PWA (wazazi):** knowledge-based login (school code + name + admission no + **guardian phone**, per-school `require_parent_phone`); `code:'register_phone'` prompt when phone not on file; cross-school isolation; live gate-presence card; payment receipts; query routing; web-push.
- **Intelligent staff push engine** (`pushStaff` → `staff_notifications` feed + `send-push` edge fn → `push_subscriptions`, `sub_role`-resolved):
  - **T1** ToD weekly handover digest → incoming Teacher-on-Duty.
  - **T2** Lesson-plan EOD reminder (AI/Groq, per teacher) — edge fn `lesson-plan-reminder`.
  - **T3** QR-scan persistence — edge fn `lesson-scan-monitor`: re-nudges a teacher due in class until they scan; period-end → missed + reason prompt (`submitLessonAbsenceReason` → principal/deputies/dean).
  - **T4** Apology AI + RAG (`analyzeApologyRisk`): drugs (all schools) / coupling (mixed only) → confidential push to counselor/dean/principal.
  - **Meetings/Summons:** `staff_summons` + `staff_summons_acks` (individual/department/all, acknowledge-to-attend); secretary + minutes template (`getMinutesTemplate`/`saveMeetingMinutes`, RAG-indexed into `document_embeddings`); leadership awareness on dept/all meetings.
  - **Parent AGM:** `createParentMeeting` (push all parents via relay) + `confirmMeetingAttendance` (wazazi) → `getParentMeetingRsvps` tally on principal dashboard.
  - **Visitor alerts** (schools with `visitor_alerts=true`): role-routed on check-in (storekeeper/bursar/principal/deputies/ToD + host).
  - Signed QStash cron routes: `/api/cron/lesson-plan-reminder`, `/api/cron/lesson-scan-monitor`, `/api/cron/tod-handover` (nkoroi worker; QStash-signature verified).
- **Biometric/fingerprint (ZKTeco ADMS):** `/iclock/cdata` + `/api/biometric` (sychar-system) — batched, idempotent ingest for 4-device/900-student bursts; rich parent gate-push; boarding-aware pre-alert cron.
- **Fees suite:** M-Pesa (paybill `tenant_configs.mpesa_paybill`), receipts (bursar `ReceiptsBursariesPanel`), deductions/bursaries, payment plans, bank-statement import, fee defaulters.
- **Academics/AI:** lesson plans, syllabus coverage, exam entry/analysis, CBC/8-4-4, KCSE predictions, gradebook OCR, report narratives, quizzes (Elo), KUCCPS matching, seating, RAG (`rag.functions` inlineStoreEmbeddings/inlineRetrieve over `document_embeddings`).
- **Staff/ops:** roles via `staff_records.sub_role` (NOT `role`), timetable, duty roster + ToD, QR lesson check-in (`lesson_checkins`), HOD live monitor, requisitions, inventory, payroll, leave, library, contacts lookup (`/contacts` — name/adm → class/stream/class-teacher/guardian phone).
- **Counselling/safeguarding:** SOAP/MSE/referrals, apology OCR, G&C consent-gated parent meetings, safeguarding cases + RAG, crisis-monitor/early-warning edge fns.
- **Comms/engagement:** WhatsApp bot, emergency broadcast, morning brief, school highlights/notices slideshow, Formbricks, PostHog/Clarity analytics, Trigger.dev jobs.

## 4. Onboarding runbook (new school)
1. **Tenant:** insert `schools` (name, subdomain, code, county) + `tenant_configs` (slug, school_short_code, settings flags). Additive only.
2. **Repo:** clone `nkoroi-mixed-pwa` → set `wrangler.jsonc` name + route `<sub>.sychar.co.ke/*`, `VITE_SCHOOL_NAME`; push to the school's GitHub repo; connect Lovable. Replace `nkoroi-roster.ts` fallback + branding with the school's.
3. **Secrets:** `wrangler secret bulk .dev.vars` (gitignored) — STAFF_JWT_SECRET (own, add to wazazi `PUSH_RELAY_SECRETS`), Supabase service/anon, AI keys (ANTHROPIC/GROQ/OPENAI), Pusher, Upstash, Firebase build-time. M-Pesa when fees go live.
4. **Build + deploy:** `npm run build` (with VITE_* baked) → `wrangler deploy`; add `<sub>.sychar.co.ke` DNS/route.
5. **Seed data:** students (+guardian phones), staff (sub_role), subjects, terms, classes/streams, class-teacher assignments → seed `parent_student_links`.
6. **Flags:** flip `require_parent_phone=true` only AFTER phones seeded (+ Lovable login phone field live). Set `visitor_alerts`/`is_mixed`/`school_type` to fit.
7. **Schedules:** register QStash schedules pointing at the signed `/api/cron/*` routes.

## 5. Conventions / gotchas (must-knows)
- `staff_records.sub_role` is the authoritative role column — `role` returns zero rows.
- Never manual-deploy wazazi (nitro redirect toolchain); push only, fetch/rebase first (Lovable edits in parallel).
- Migrations: additive only for live tenants (no drops/renames/type changes).
- Push delivery canonical path: client `subscribeToPush` → `push_subscriptions`(staff_id) → `send-push` edge fn. (`pwa_webpush_subscriptions` is a legacy/AIE-only table.)
- Per-school deep memory: `project_nkoroi_audit_2026_06_05`, `project_oloolaiser_biometric`, `project_intelligent_push`, `project_pcea_matasia`, + the dated sprint files.
