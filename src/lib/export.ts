// Export helpers — turn rows into CSV or XLSX for the Data Export Centre.
// Server-only (xlsx is a Node dep). Columns is an ordered [key, header] list so
// exports are stable and human-readable.
import * as XLSX from 'xlsx'

export type Column = [key: string, header: string]
export type Row = Record<string, unknown>

function cell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function toCSV(rows: Row[], columns: Column[]): string {
  const esc = (s: string) => /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  const head = columns.map(([, h]) => esc(h)).join(',')
  const body = rows.map((r) => columns.map(([k]) => esc(cell(r[k]))).join(',')).join('\n')
  return `${head}\n${body}`
}

export function toXLSX(rows: Row[], columns: Column[]): Uint8Array {
  const aoa = [columns.map(([, h]) => h), ...rows.map((r) => columns.map(([k]) => cell(r[k])))]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Export')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
}
