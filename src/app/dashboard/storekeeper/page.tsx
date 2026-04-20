'use client'
export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Item { id: string; name: string; unit: string; category: string; current_stock: number; min_stock: number; reorder_point: number }
interface BurnRate { item_id: string; name: string; unit: string; current_stock: number; avg_daily_7d: number; days_remaining: number | null; alert: boolean; anomaly_flag: boolean }
interface LogEntry { id: string; transaction_type: string; quantity_before: number; quantity_change: number; quantity_after: number; issued_to: string | null; notes: string | null; server_timestamp: string; geo_verified: boolean }
interface AieForm { id: string; form_number: string; requested_by: string; department: string; total_amount: number; status: string }

const CARD: React.CSSProperties = { background: 'white', border: '1px solid #f1f5f9', borderRadius: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }
const PH: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 14 }
const TX_CLR: Record<string, string> = { ISSUE: '#dc2626', RESTOCK: '#16a34a', DAMAGE: '#d97706', 'WRITE-OFF': '#7c3aed', RESERVE: '#2563eb' }

export default function StorekeeperPage() {
  const [tab, setTab]         = useState<'stock' | 'issue' | 'delivery' | 'burnrate' | 'aie'>('stock')
  const [items, setItems]     = useState<Item[]>([])
  const [burn, setBurn]       = useState<BurnRate[]>([])
  const [forms, setForms]     = useState<AieForm[]>([])
  const [binItem, setBinItem] = useState<string>('')
  const [binLog, setBinLog]   = useState<LogEntry[]>([])
  const [loading, setLoad]    = useState(true)

  // Issue state
  const [iItemId, setIItemId] = useState('')
  const [iQty, setIQty]       = useState('')
  const [iTo, setITo]         = useState('')
  const [iRole, setIRole]     = useState('')
  const [iReqId, setIReqId]   = useState('')
  const [iNotes, setINotes]   = useState('')
  const [iPhoto, setIPhoto]   = useState('')
  const [issuing, setIssuing] = useState(false)
  const [iMsg, setIMsg]       = useState<{ ok: boolean; text: string } | null>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  // Delivery state
  const [dUrl, setDUrl]     = useState('')
  const [dReq, setDReq]     = useState('')
  const [ocr, setOcr]       = useState<{ extracted_items: Array<{ description: string; quantity: number | null; unit: string | null }>; shortages: Array<{ expected_item: string; expected_qty: number; received_qty: number | null }>; has_shortages: boolean } | null>(null)
  const [ocrLoad, setOcrLoad] = useState(false)

  const loadAll = useCallback(async () => {
    setLoad(true)
    const [iR, bR, fR] = await Promise.all([
      fetch('/api/store/items').then(r => r.ok ? r.json() : { items: [] }),
      fetch('/api/store/burn-rate').then(r => r.ok ? r.json() : { burn_rates: [] }),
      fetch('/api/aie/forms?status=approved').then(r => r.ok ? r.json() : { forms: [] }),
    ])
    setItems(iR.items ?? [])
    setBurn(bR.burn_rates ?? [])
    setForms(fR.forms ?? [])
    setLoad(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  async function loadBin(id: string) {
    setBinItem(id)
    const { createClient } = await import('@supabase/supabase-js')
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data } = await db.from('inventory_logs').select('*').eq('item_id', id).order('server_timestamp', { ascending: false }).limit(50)
    setBinLog((data ?? []) as LogEntry[])
  }

  async function submitIssue() {
    if (!iItemId || !iQty || !iTo || !iReqId) { setIMsg({ ok: false, text: 'Item, quantity, issued-to, and requisition ID required.' }); return }
    setIssuing(true); setIMsg(null)
    const loc = await new Promise<{ lat?: number; lng?: number }>(res => {
      navigator.geolocation?.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res({}))
    })
    const r = await fetch('/api/store/transaction', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: iItemId, transaction_type: 'ISSUE', quantity_change: -Math.abs(Number(iQty)), issued_to: iTo, issued_to_role: iRole || null, authorized_by: iReqId, photo_evidence_url: iPhoto || null, notes: iNotes || null, ...loc }),
    })
    const d = await r.json() as { ok?: boolean; error?: string; item_name?: string; quantity_after?: number; geo_verified?: boolean }
    if (d.ok) {
      setIMsg({ ok: true, text: `✓ Issued from ${d.item_name}. New stock: ${d.quantity_after}. ${d.geo_verified ? 'GPS verified.' : 'GPS not verified.'}` })
      setIQty(''); setITo(''); setIRole(''); setINotes(''); setIPhoto(''); setIItemId(''); loadAll()
    } else {
      setIMsg({ ok: false, text: d.error ?? 'Issue failed' })
    }
    setIssuing(false)
  }

  async function runOcr() {
    if (!dUrl) return
    setOcrLoad(true); setOcr(null)
    const r = await fetch('/api/store/delivery', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_note_url: dUrl, requisition_id: dReq || undefined }) })
    if (r.ok) setOcr(await r.json())
    setOcrLoad(false)
  }

  const alerts = burn.filter(b => b.alert || b.anomaly_flag)

  const grouped = items.reduce((g, i) => { (g[i.category] ??= []).push(i); return g }, {} as Record<string, Item[]>)

  return (
    <div style={{ padding: '20px 20px 40px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#111827', margin: 0, fontFamily: 'Space Grotesk, sans-serif' }}>Store & Inventory</h1>
        <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{new Date().toLocaleDateString('en-KE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {alerts.length > 0 && (
        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 6 }}>⚠ {alerts.length} inventory alert{alerts.length > 1 ? 's' : ''}</div>
          {alerts.map(a => (
            <div key={a.item_id} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 2 }}>
              {a.anomaly_flag ? '🔴 Potential leakage' : '🟡 Low stock'}: <strong>{a.name}</strong>
              {a.days_remaining != null ? ` — ${a.days_remaining} days remaining` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
        {(['stock', 'issue', 'delivery', 'burnrate', 'aie'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{ flexShrink: 0, padding: '7px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none', background: tab === t ? '#1e40af' : '#f3f4f6', color: tab === t ? 'white' : '#374151' }}>
            {{ stock: 'Stock', issue: 'Issue Items', delivery: 'New Delivery', burnrate: 'Burn Rate', aie: 'Requisitions' }[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 300, borderRadius: 16 }} />
      ) : (
        <>
          {/* STOCK */}
          {tab === 'stock' && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#1e40af,#059669)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>Current Stock Levels</div>
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: 13 }}>No inventory items. Add items via your principal or system admin.</div>
                ) : (
                  Object.entries(grouped).map(([cat, catItems]) => (
                    <div key={cat} style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 6 }}>{cat}</div>
                      {catItems.map(item => {
                        const pct = item.reorder_point > 0 ? Math.min(100, Math.round((item.current_stock / item.reorder_point) * 100)) : 100
                        const clr = pct <= 25 ? '#dc2626' : pct <= 60 ? '#d97706' : '#16a34a'
                        return (
                          <div key={item.id} onClick={() => loadBin(item.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: binItem === item.id ? '#eff6ff' : '#f9fafb', borderRadius: 10, marginBottom: 4, cursor: 'pointer', border: binItem === item.id ? '1px solid #bfdbfe' : '1px solid transparent' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{item.name}</div>
                              <div style={{ height: 4, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden', marginTop: 4, width: 140 }}>
                                <div style={{ height: '100%', width: `${pct}%`, background: clr, borderRadius: 2, transition: 'width 0.4s' }} />
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 16, fontWeight: 800, color: clr }}>{item.current_stock}</div>
                              <div style={{ fontSize: 10, color: '#9ca3af' }}>{item.unit}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ))
                )}

                {/* Bin card */}
                {binItem && (
                  <div style={{ marginTop: 20, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                        Bin Card — {items.find(i => i.id === binItem)?.name}
                      </div>
                      <button onClick={() => { setBinItem(''); setBinLog([]) }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af' }}>×</button>
                    </div>
                    {binLog.length === 0 ? (
                      <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', padding: 12 }}>No transactions recorded yet</div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                              {['Date', 'Type', 'Before', 'Change', 'After', 'Issued To', 'GPS'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {binLog.map(l => (
                              <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '6px 10px', color: '#6b7280', whiteSpace: 'nowrap' }}>{new Date(l.server_timestamp).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: TX_CLR[l.transaction_type] ?? '#374151' }}>{l.transaction_type}</td>
                                <td style={{ padding: '6px 10px', color: '#6b7280' }}>{l.quantity_before}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700, color: l.quantity_change < 0 ? '#dc2626' : '#16a34a' }}>{l.quantity_change > 0 ? '+' : ''}{l.quantity_change}</td>
                                <td style={{ padding: '6px 10px', fontWeight: 700 }}>{l.quantity_after}</td>
                                <td style={{ padding: '6px 10px', color: '#374151', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.issued_to ?? l.notes ?? '—'}</td>
                                <td style={{ padding: '6px 10px' }}>{l.geo_verified ? <span style={{ color: '#16a34a' }}>✓</span> : <span style={{ color: '#d97706' }}>—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ISSUE */}
          {tab === 'issue' && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#dc2626,#d97706)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>Issue Items</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Item *</label>
                    <select value={iItemId} onChange={e => setIItemId(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13 }}>
                      <option value="">Select item…</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.name} — {i.current_stock} {i.unit} in stock</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Quantity *</label>
                      <input type="number" min="0.01" step="0.01" value={iQty} onChange={e => setIQty(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Approved Req ID *</label>
                      <input value={iReqId} onChange={e => setIReqId(e.target.value)} placeholder="Paste requisition UUID" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Issued To *</label>
                      <input value={iTo} onChange={e => setITo(e.target.value)} placeholder="Full name" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Role / Position</label>
                      <input value={iRole} onChange={e => setIRole(e.target.value)} placeholder="e.g. Head Cook" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <input value={iNotes} onChange={e => setINotes(e.target.value)} placeholder="Notes (optional)" style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13 }} />
                  <div>
                    <input ref={photoRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = ev => setIPhoto(ev.target?.result as string); r.readAsDataURL(f) }} />
                    <button onClick={() => photoRef.current?.click()} style={{ padding: '9px 18px', background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 13, cursor: 'pointer', color: '#374151' }}>
                      📷 {iPhoto ? 'Photo captured ✓' : 'Take photo of items'}
                    </button>
                  </div>

                  {iMsg && (
                    <div style={{ padding: '10px 14px', borderRadius: 10, background: iMsg.ok ? '#dcfce7' : '#fff5f5', color: iMsg.ok ? '#166534' : '#dc2626', fontSize: 13, fontWeight: 600 }}>
                      {iMsg.text}
                    </div>
                  )}

                  <button onClick={submitIssue} disabled={issuing} style={{ padding: '13px', background: issuing ? '#93c5fd' : 'linear-gradient(135deg,#1e40af,#059669)', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: issuing ? 'not-allowed' : 'pointer' }}>
                    {issuing ? 'Processing…' : 'Issue & Log'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DELIVERY */}
          {tab === 'delivery' && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#7c3aed,#1e40af)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>New Delivery — OCR Verification</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Delivery Note Photo URL *</label>
                    <input value={dUrl} onChange={e => setDUrl(e.target.value)} placeholder="https://… (upload to storage first, paste URL here)" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>Requisition ID (for shortage check)</label>
                    <input value={dReq} onChange={e => setDReq(e.target.value)} placeholder="Optional" style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <button onClick={runOcr} disabled={ocrLoad || !dUrl} style={{ padding: '12px', background: ocrLoad ? '#93c5fd' : 'linear-gradient(135deg,#7c3aed,#1e40af)', color: 'white', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: ocrLoad ? 'not-allowed' : 'pointer' }}>
                    {ocrLoad ? 'Reading document…' : 'Extract with Google Vision OCR'}
                  </button>

                  {ocr && (
                    <div>
                      {ocr.has_shortages && (
                        <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 12, padding: '12px', marginBottom: 12 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>⚠ {ocr.shortages.length} shortage(s) detected</div>
                          {ocr.shortages.map((s, i) => (
                            <div key={i} style={{ fontSize: 12, color: '#7f1d1d', marginBottom: 3 }}>
                              <strong>{s.expected_item}</strong>: expected {s.expected_qty} — received {s.received_qty ?? 'not found in delivery note'}
                            </div>
                          ))}
                        </div>
                      )}
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8 }}>
                        Extracted {ocr.extracted_items.length} item{ocr.extracted_items.length !== 1 ? 's' : ''} — confirm or correct below:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
                        {ocr.extracted_items.map((item, i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 12px', background: '#f9fafb', borderRadius: 8, fontSize: 12, alignItems: 'center' }}>
                            <span style={{ color: '#9ca3af', minWidth: 22 }}>{i + 1}.</span>
                            <span style={{ flex: 1, color: '#111827', fontWeight: 600 }}>{item.description}</span>
                            {item.quantity != null && (
                              <span style={{ color: '#374151', fontWeight: 700, flexShrink: 0 }}>{item.quantity} {item.unit ?? ''}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BURN RATE */}
          {tab === 'burnrate' && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#d97706,#dc2626)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>Burn Rate — Boarding Provisions</div>
                {burn.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: 13 }}>No data yet — burn rates appear after 7 days of ISSUE transactions</div>
                ) : burn.map(b => (
                  <div key={b.item_id} style={{ padding: '12px 14px', background: b.anomaly_flag ? '#fff5f5' : b.alert ? '#fffbeb' : '#f9fafb', border: `1px solid ${b.anomaly_flag ? '#fecaca' : b.alert ? '#fde68a' : '#f1f5f9'}`, borderRadius: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          Avg {b.avg_daily_7d} {b.unit}/day · Stock: {b.current_stock} {b.unit}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {b.days_remaining != null ? (
                          <div style={{ fontSize: 20, fontWeight: 800, color: b.days_remaining <= 5 ? '#dc2626' : b.days_remaining <= 10 ? '#d97706' : '#16a34a' }}>
                            {b.days_remaining}d
                          </div>
                        ) : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                        <div style={{ fontSize: 9, color: '#9ca3af' }}>days remaining</div>
                      </div>
                    </div>
                    {b.anomaly_flag && (
                      <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
                        🔴 Potential leakage — consumption &gt;20% above expected for 3+ consecutive days. Flag to principal.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AIE */}
          {tab === 'aie' && (
            <div style={CARD}>
              <div style={{ height: 4, background: 'linear-gradient(90deg,#059669,#1e40af)' }} />
              <div style={{ padding: '18px 20px' }}>
                <div style={PH}>Approved Requisitions to Fulfil</div>
                {forms.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: '#9ca3af', fontSize: 13 }}>No approved requisitions pending fulfilment</div>
                ) : forms.map(f => (
                  <div key={f.id} style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: 12, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{f.form_number}</div>
                      <div style={{ fontSize: 11, color: '#6b7280' }}>{f.department} · {f.requested_by}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginTop: 2 }}>KSH {f.total_amount.toLocaleString('en-KE', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <button onClick={async () => {
                      await fetch(`/api/aie/forms/${f.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'fulfilled' }) })
                      loadAll()
                    }} style={{ padding: '8px 16px', background: '#059669', color: 'white', border: 'none', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      Mark Fulfilled
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
