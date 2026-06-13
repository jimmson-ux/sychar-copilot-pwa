// Canonical Sychar ERP analytics event names. Use these constants everywhere so
// every school's PostHog project reports the same vocabulary and dashboards/funnels
// are comparable across tenants. NEVER attach PII (names, admission numbers, phones,
// medical, finance amounts) to events — ids and roles only.

export const EVENTS = {
  // Auth / session
  LOGIN: 'login',
  LOGOUT: 'logout',
  // Parent PWA
  ATTENDANCE_VIEWED: 'attendance_viewed',
  RESULTS_VIEWED: 'results_viewed',
  FEE_STATEMENT_VIEWED: 'fee_statement_viewed',
  NOTICE_READ: 'notice_read',
  PAYMENT_PROOF_UPLOADED: 'payment_proof_uploaded',
  // Academic
  LESSON_QR_SCANNED: 'lesson_qr_scanned',
  LESSON_COMPLETED: 'lesson_completed',
  MARKS_SUBMITTED: 'marks_submitted',
  SCHEME_UPDATED: 'scheme_updated',
  REPORT_GENERATED: 'report_generated',
  // Procurement
  REQUISITION_CREATED: 'requisition_created',
  PO_GENERATED: 'po_generated',
  INVOICE_UPLOADED: 'invoice_uploaded',
  DELIVERY_NOTE_UPLOADED: 'delivery_note_uploaded',
  // Stores
  GOODS_RECEIVED: 'goods_received',
  GOODS_ISSUED: 'goods_issued',
  STOCK_ADJUSTMENT: 'stock_adjustment',
  // Finance
  PAYMENT_RECORDED: 'payment_recorded',
  RECEIPT_GENERATED: 'receipt_generated',
  FEE_BALANCE_CHECKED: 'fee_balance_checked',
  // Nurse
  MEDICINE_DISPENSED: 'medicine_dispensed',
  EXPIRY_ALERT_ACKNOWLEDGED: 'expiry_alert_acknowledged',
  // Leadership
  REQUISITION_APPROVED: 'requisition_approved',
  PAYMENT_AUTHORIZED: 'payment_authorized',
  // System
  ERROR_OCCURRED: 'error_occurred',
  REPORT_DOWNLOADED: 'report_downloaded',
  NOTIFICATION_READ: 'notification_read',
  ASK_AI: 'ask_ai',
} as const

export type SycharEvent = (typeof EVENTS)[keyof typeof EVENTS]
