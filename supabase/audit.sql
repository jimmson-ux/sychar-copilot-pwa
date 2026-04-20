-- ============================================================
-- SYCHAR COPILOT — DATABASE AUDIT SCRIPT
-- Run in Supabase SQL Editor → copy full output back to Claude
-- ============================================================

-- ── 1. TABLES + COLUMNS ──────────────────────────────────────
SELECT
  '=== TABLES & COLUMNS ===' AS section,
  NULL::text AS table_name,
  NULL::text AS column_name,
  NULL::text AS data_type,
  NULL::text AS nullable,
  NULL::text AS column_default
UNION ALL
SELECT
  '',
  c.table_name,
  c.column_name,
  c.udt_name || CASE
    WHEN c.character_maximum_length IS NOT NULL
      THEN '(' || c.character_maximum_length || ')'
    WHEN c.numeric_precision IS NOT NULL AND c.numeric_scale IS NOT NULL
      THEN '(' || c.numeric_precision || ',' || c.numeric_scale || ')'
    ELSE ''
  END,
  CASE c.is_nullable WHEN 'YES' THEN 'NULL' ELSE 'NOT NULL' END,
  COALESCE(c.column_default, '—')
FROM information_schema.columns c
WHERE c.table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- ── 2. INDEXES ────────────────────────────────────────────────
SELECT
  '=== INDEXES ===' AS section,
  NULL::text AS table_name,
  NULL::text AS index_name,
  NULL::text AS index_def
UNION ALL
SELECT
  '',
  t.relname,
  i.relname,
  pg_get_indexdef(ix.indexrelid)
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
ORDER BY t.relname, i.relname;

-- ── 3. FOREIGN KEYS ──────────────────────────────────────────
SELECT
  '=== FOREIGN KEYS ===' AS section,
  NULL::text AS constraint_name,
  NULL::text AS from_table,
  NULL::text AS from_col,
  NULL::text AS to_table,
  NULL::text AS to_col,
  NULL::text AS on_delete
UNION ALL
SELECT
  '',
  rc.constraint_name,
  kcu.table_name,
  kcu.column_name,
  ccu.table_name,
  ccu.column_name,
  rc.delete_rule
FROM information_schema.referential_constraints rc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = rc.constraint_name
  AND kcu.constraint_schema = rc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = rc.unique_constraint_name
  AND ccu.constraint_schema = rc.constraint_schema
WHERE rc.constraint_schema = 'public'
ORDER BY kcu.table_name, kcu.column_name;

-- ── 4. ENUMS ─────────────────────────────────────────────────
SELECT
  '=== ENUMS ===' AS section,
  NULL::text AS enum_name,
  NULL::text AS enum_values
UNION ALL
SELECT
  '',
  t.typname,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE t.typtype = 'e'
  AND n.nspname = 'public'
GROUP BY t.typname
ORDER BY t.typname;

-- ── 5. FUNCTIONS ─────────────────────────────────────────────
SELECT
  '=== FUNCTIONS ===' AS section,
  NULL::text AS function_name,
  NULL::text AS return_type,
  NULL::text AS argument_types,
  NULL::text AS language,
  NULL::text AS body_preview
UNION ALL
SELECT
  '',
  p.proname,
  pg_get_function_result(p.oid),
  pg_get_function_arguments(p.oid),
  l.lanname,
  LEFT(pg_get_functiondef(p.oid), 200) || '…'
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_language l ON l.oid = p.prolang
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ── 6. RLS POLICIES ──────────────────────────────────────────
SELECT
  '=== RLS POLICIES ===' AS section,
  NULL::text AS table_name,
  NULL::text AS policy_name,
  NULL::text AS command,
  NULL::text AS roles,
  NULL::text AS using_expr,
  NULL::text AS check_expr
UNION ALL
SELECT
  '',
  tablename,
  policyname,
  cmd,
  array_to_string(roles, ', '),
  COALESCE(qual, '—'),
  COALESCE(with_check, '—')
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ── 7. RLS ENABLED STATUS ────────────────────────────────────
SELECT
  '=== RLS ENABLED STATUS ===' AS section,
  NULL::text AS table_name,
  NULL::boolean AS rls_enabled,
  NULL::boolean AS rls_forced
UNION ALL
SELECT
  '',
  c.relname,
  c.relrowsecurity,
  c.relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY c.relname;
