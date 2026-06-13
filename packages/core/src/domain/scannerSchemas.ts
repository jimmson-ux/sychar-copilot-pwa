// src/lib/scannerSchemas.ts
// Zod schemas for every scanner API write route.
// All schemas treat OCR-extracted fields as nullable — the OCR model may not
// have found every field. Validation enforces types, lengths, and enum
// whitelists to reject structurally invalid payloads before they reach the DB.

import { z } from 'zod'

// ── Shared primitives ─────────────────────────────────────────────────────────

const nullStr = (max: number) => z.string().max(max).nullable()
const nullDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
  .nullable()
const nullUUID = z.string().uuid('Must be a valid UUID').nullable()
const Term     = z.enum(['Term 1', 'Term 2', 'Term 3'])

// ── /api/scanner (OCR + document_inbox write) ─────────────────────────────────

const DOCUMENT_TYPES = [
  'apology-letter', 'class-mark-sheet', 'student-photo',
  'fee-receipt',    'mpesa-screenshot',  'fee-schedule',
  'hod-report',     'official-letter',   'any-document',
] as const

const MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif',
] as const

export const ScannerOcrSchema = z.object({
  // base64 string — 8 MB image ≈ 10.7 MB base64; 11 M chars is a safe ceiling
  base64:       z.string().min(1).max(11_000_000),
  mimeType:     z.enum(MIME_TYPES),
  documentType: z.enum(DOCUMENT_TYPES),
})

// ── /api/scanner/apology-letter ───────────────────────────────────────────────

export const ApologySchema = z.object({
  extractedData: z.object({
    student_name:      nullStr(100),
    admission_number:  nullStr(20),
    class_name:        nullStr(50),
    letter_date:       nullDate,
    offence_committed: nullStr(500),
    parent_signed:     z.boolean().nullable(),
    teacher_witness:   nullStr(100),
    tone:              z.enum(['genuine', 'reluctant', 'unclear']).nullable(),
  }),
  inboxId: nullUUID,
})

// ── /api/scanner/fee-receipt (single payment) ────────────────────────────────

export const FeeReceiptSingleSchema = z.object({
  isBatch: z.undefined().or(z.literal(false)),
  extractedData: z.object({
    amount_paid:          z.coerce.number().positive().max(10_000_000).nullable(),
    payment_date:         nullDate,
    reference_number:     nullStr(50),
    mpesa_transaction_id: nullStr(20),
    paid_by_name:         nullStr(100),
    term:                 Term.nullable(),
    payment_method:       z.enum(['M-Pesa', 'Bank', 'Cash']).nullable(),
  }),
  // studentId is validated server-side against the authenticated school
  studentId:   nullUUID,
  studentName: nullStr(100),
  receiptType: z.string().max(30).nullable(),
})

// ── /api/scanner/fee-receipt (M-Pesa batch) ──────────────────────────────────

const MpesaBatchItemSchema = z.object({
  amount:         z.coerce.number().positive().max(10_000_000).nullable(),
  date:           z.string().max(30).nullable(),   // OCR date format varies
  transaction_id: nullStr(20),
  sender_name:    nullStr(100),
  sender_phone:   nullStr(20),
})

export const FeeReceiptBatchSchema = z.object({
  isBatch: z.literal(true),
  batch:   z.array(MpesaBatchItemSchema).min(1).max(20),
})

// ── /api/scanner/mark-sheet ──────────────────────────────────────────────────

export const MarkSheetSchema = z.object({
  students: z
    .array(
      z.object({
        studentId:   nullUUID,
        studentName: z.string().max(100),
        admissionNo: nullStr(20),
        score:       z.number().min(0).max(100),
      })
    )
    .min(1)
    .max(100),
  // Regex prevents % and _ injection in ilike queries (HIGH-8)
  subjectName: z.string().min(1).max(100).regex(/^[a-zA-Z0-9\s\-.()/&:]+$/, 'Invalid subject name'),
  className:   z.string().min(1).max(50).regex(/^[a-zA-Z0-9\s]+$/, 'Invalid class name'),
  examType:    z.string().min(1).max(50),
  term:        Term,
  skipped:     z.number().int().min(0).default(0),
})

// ── /api/scanner/fee-schedule ────────────────────────────────────────────────

export const FeeScheduleSchema = z.object({
  feeItems: z
    .array(
      z.object({
        item_name: z.string().max(100),
        amount:    z.string().max(20),    // kept as string — parsed to float in route
        due_date:  z.string().max(30),
        mandatory: z.boolean(),
        notes:     z.string().max(200),
      })
    )
    .max(50),
  term:         Term,
  academicYear: z.string().max(15),
  formGrade:    z.string().max(20),
})

// ── /api/scanner/hod-report ──────────────────────────────────────────────────

const IssueItemSchema = z.object({
  issue:     z.string().max(500),
  raised_by: z.string().max(100),
  status:    z.string().max(30),
})

const ActionItemSchema = z.object({
  action:      z.string().max(500),
  assigned_to: z.string().max(100),
  deadline:    z.string().max(30),
  status:      z.string().max(30),
})

export const HodReportSchema = z.object({
  reportData: z.object({
    department:  z.string().max(100),
    hodName:     z.string().max(100),
    reportDate:  nullDate,
  }),
  issuesRaised: z.array(IssueItemSchema).max(50),
  actionItems:  z.array(ActionItemSchema).max(50),
})

// ── /api/scanner/[type] (generic fallback) ───────────────────────────────────

export const GenericSaveSchema = z.object({
  inboxId: nullUUID,
})
