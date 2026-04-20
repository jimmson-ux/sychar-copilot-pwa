# Hercules API Contract
## Sychar CoPilot — Parent PWA Backend

**Version:** 1.0.0  
**Base URL:** `https://{your-domain}/api`  
**Auth scheme:** Bearer JWT (issued by `/api/parent/auth/verify-otp`)  
**Date:** 2026-04-11

---

## Authentication Flow

```
Parent opens Hercules PWA
         │
         ▼
[1] Scan student QR card  ──→  POST /parent/auth/lookup
         │                     Body: { short_code, virtual_qr_id }
         │                     → { masked_phone, school_name, _ctx }
         ▼
[2] Confirm phone, request OTP ──→  POST /parent/auth/request-otp
         │                          Body: { _ctx }
         │                          → { sent: true }
         ▼
[3] Enter 6-digit OTP  ──→  POST /parent/auth/verify-otp
         │                  Body: { phone, otp, school_id }
         │                  → { token: "eyJ...", student_ids: [...] }
         ▼
[4] Store JWT in device storage
    Attach as: Authorization: Bearer {token}
    All subsequent requests use this token.
```

---

## Error Conventions

All errors return JSON `{ "error": "<message>" }` with an appropriate HTTP status.

| Status | Meaning |
|--------|---------|
| 400 | Validation error — check request body |
| 401 | Unauthorized — token missing, expired, or invalid |
| 403 | Forbidden — token valid but resource not accessible to this parent |
| 404 | Resource not found |
| 410 | OTP expired |
| 422 | Business rule violation (e.g. insufficient wallet balance) |
| 429 | Rate limited |
| 500 | Server error |
| 502 | Upstream failure (e.g. M-Pesa STK push rejected) |

---

## Endpoints

---

### Auth

#### `POST /parent/auth/lookup`
Resolves school + student from a scanned QR code. Step 1 of login.

**Request**
```json
{
  "short_code":    "NKR001",
  "virtual_qr_id": "A3F2-B901"
}
```

**Response 200**
```json
{
  "masked_phone": "+254 7** *** 789",
  "school_name":  "Nkoroi Mixed Senior Secondary School",
  "_ctx":         "eyJzY2hvb2xfaWQiOi..."
}
```

> `_ctx` is an opaque context token — pass it verbatim to `/request-otp`. It is base64-encoded and not sensitive, but treat it as a single-use nonce.

**Errors:** `400` missing fields · `404` QR not recognised · `422` no parent contact registered

---

#### `POST /parent/auth/request-otp`
Sends a 6-digit OTP via WhatsApp. Step 2 of login.

**Request**
```json
{ "_ctx": "eyJzY2hvb2xfaWQiOi..." }
```

**Response 200**
```json
{ "sent": true }
```

**Rate limit:** 3 requests per 10 minutes per phone number. Returns `429` if exceeded.

---

#### `POST /parent/auth/verify-otp`
Verifies the OTP and issues a JWT. Step 3 of login.

**Request**
```json
{
  "phone":     "+254712345678",
  "otp":       "847291",
  "school_id": "68bd8d34-f2f0-4297-bd18-093328824d84"
}
```

**Response 200**
```json
{
  "token":       "eyJhbGciOiJIUzI1NiJ9...",
  "student_ids": ["uuid-1", "uuid-2"]
}
```

**Errors:** `404` no active OTP session · `410` OTP expired · `401` wrong OTP (with remaining attempts) · `429` too many failed attempts

> The JWT contains `school_id`, `student_ids`, and `session_id` — all resolved from the DB, never from the request body. Token TTL: **30 days**.

---

### Children

#### `GET /parent/child`
Returns profile cards for all children linked to this parent.

**Auth required:** Yes  
**Response 200**
```json
{
  "students": [
    {
      "id":           "uuid",
      "full_name":    "Jane Doe",
      "gender":       "female",
      "photo_url":    "https://...",
      "stream":       "A",
      "class_id":     "uuid",
      "classes":      { "name": "Form 3", "level": 3 }
    }
  ]
}
```

---

### Fees

#### `GET /parent/fees?student_id={id}`
Returns fee ledger and payment history for one child.

**Auth required:** Yes  
**Query params:** `student_id` (required — must belong to this parent)

**Response 200**
```json
{
  "ledger": [
    {
      "balance_due":    4500,
      "total_charged":  45000,
      "total_paid":     40500,
      "term":           1,
      "academic_year":  "2026"
    }
  ],
  "payments": [
    {
      "amount":       10000,
      "payment_date": "2026-01-15",
      "method":       "mpesa",
      "reference":    "QAB123XYZ",
      "description":  "Term 1 fees"
    }
  ]
}
```

---

### Attendance

#### `GET /parent/attendance?student_id={id}&term={n}&year={yyyy}`
Returns daily attendance records for the specified term.

**Auth required:** Yes  
**Query params:** `student_id` (required) · `term` (default: `1`) · `year` (default: `2026`)

**Response 200**
```json
{
  "records": [
    { "date": "2026-01-20", "status": "present", "remarks": null }
  ],
  "summary": {
    "total":   45,
    "present": 43,
    "rate":    96
  }
}
```

---

### Wallet

#### `GET /parent/wallet?student_id={id}`
Returns wallet balance and recent transactions.

**Auth required:** Yes

**Response 200**
```json
{
  "wallet": {
    "balance":               350.00,
    "currency":              "KES",
    "low_balance_alert":     100,
    "auto_topup_enabled":    false,
    "auto_topup_threshold":  null,
    "auto_topup_amount":     null
  },
  "transactions": [
    {
      "amount":      200,
      "type":        "topup",
      "description": "M-Pesa topup — QAB123XYZ",
      "created_at":  "2026-03-10T08:22:00Z",
      "reference":   "WTP-1710058920000"
    }
  ]
}
```

---

#### `POST /parent/wallet/topup`
Initiates an M-Pesa STK Push to top up the student wallet.

**Auth required:** Yes  
**Request**
```json
{
  "student_id": "uuid",
  "amount":     500
}
```
Amount range: KES 50–10,000.

**Response 200**
```json
{
  "checkout_request_id": "ws_CO_...",
  "message":             "STK push sent. Enter your M-Pesa PIN to complete."
}
```

> Actual wallet credit happens asynchronously via the M-Pesa callback. Poll `GET /parent/wallet` to confirm.

---

#### `POST /parent/wallet/settings`
Updates wallet alert and auto-topup preferences.

**Auth required:** Yes  
**Request** (all fields optional, at least one required)
```json
{
  "student_id":           "uuid",
  "low_balance_alert":    150,
  "auto_topup_enabled":   true,
  "auto_topup_threshold": 100,
  "auto_topup_amount":    500
}
```

**Response 200**
```json
{ "updated": true }
```

---

### Vouchers

#### `GET /parent/vouchers?student_id={id}`
Returns available packages and the student's voucher history.

**Auth required:** Yes

**Response 200**
```json
{
  "packages": [
    {
      "id":          "uuid",
      "name":        "5-Day Breakfast Pack",
      "description": "Includes tea and bread daily",
      "price":       350,
      "meals_count": 5,
      "valid_days":  7,
      "is_active":   true
    }
  ],
  "vouchers": [
    {
      "id":              "uuid",
      "package_id":      "uuid",
      "meals_remaining": 3,
      "expires_at":      "2026-04-18T00:00:00Z",
      "activated_at":    "2026-04-11T09:00:00Z",
      "status":          "active"
    }
  ]
}
```

---

#### `POST /parent/vouchers/purchase`
Purchases a voucher package.

**Auth required:** Yes  
**Request**
```json
{
  "student_id":      "uuid",
  "package_id":      "uuid",
  "payment_method":  "wallet"
}
```
`payment_method`: `"wallet"` (immediate) or `"mpesa"` (STK push flow).

**Response 201** (wallet payment)
```json
{
  "voucher": {
    "id":              "uuid",
    "meals_remaining": 5,
    "expires_at":      "2026-05-11T00:00:00Z"
  },
  "payment": "wallet"
}
```

**Response 202** (M-Pesa payment — pending)
```json
{
  "message":   "Proceed to M-Pesa payment",
  "reference": "VCH-1713000000000",
  "amount":    350
}
```

---

### Notices

#### `GET /parent/notices`
Returns school notices for parents, sorted newest first.

**Auth required:** Yes

**Response 200**
```json
{
  "notices": [
    {
      "id":             "uuid",
      "title":          "School Closing Day",
      "body":           "School closes on Friday 18th April...",
      "category":       "academic",
      "published_at":   "2026-04-08T07:00:00Z",
      "expires_at":     null,
      "attachment_url": null
    }
  ]
}
```

---

### Calendar

#### `GET /parent/calendar?from={date}&to={date}`
Returns school events in the given date range.

**Auth required:** Yes  
**Query params:** `from` (ISO date, default today) · `to` (ISO date, default +90 days)

**Response 200**
```json
{
  "events": [
    {
      "id":          "uuid",
      "title":       "Mock Examinations Begin",
      "event_date":  "2026-04-22",
      "end_date":    "2026-04-30",
      "category":    "exam",
      "is_holiday":  false,
      "location":    null
    }
  ]
}
```

---

### Health

#### `GET /parent/health?student_id={id}`
Returns nurse visit summaries. Clinical notes are excluded.

**Auth required:** Yes

**Response 200**
```json
{
  "visits": [
    {
      "id":                "uuid",
      "visit_date":        "2026-03-15",
      "presenting_complaint": "Headache",
      "outcome":           "Paracetamol administered, returned to class",
      "referral_needed":   false,
      "follow_up_date":    null
    }
  ]
}
```

---

### Discipline

#### `GET /parent/discipline?student_id={id}`
Returns discipline records. Internal staff notes and witness names are excluded.

**Auth required:** Yes

**Response 200**
```json
{
  "records": [
    {
      "id":              "uuid",
      "incident_date":   "2026-02-10",
      "allegation":      "Late to school",
      "action_taken":    "Written warning issued",
      "status":          "resolved",
      "parent_informed": true,
      "suspension_days": null
    }
  ]
}
```

---

## M-Pesa Callback (Server → Server)

#### `POST /parent/mpesa/callback`
Receives Safaricom Daraja STK Push result callbacks.

**Called by:** Safaricom servers (not the Hercules app)  
**IP whitelist:** Safaricom production CIDRs enforced  
**Auth:** None (Safaricom pushes unsigned; IP check is the security layer)

**Response (always 200 to Safaricom)**
```json
{ "ResultCode": 0, "ResultDesc": "Accepted" }
```

---

## QR Token Security Model

```
Physical card:
  [QR IMAGE]
  A3F2-B901          ← human-readable Virtual QR ID (no student info)

QR image encodes:
  A3F2-B901.NKR001.a3f2b901c4d5...  ← signed payload

Server verification:
  1. Split on '.': [qr_id, short_code, sig]
  2. Recompute HMAC-SHA256(STUDENT_QR_SECRET, "{qr_id}.{short_code}")
  3. Compare first 32 hex chars (constant-time)
  4. Lookup student_qr_tokens WHERE virtual_qr_id = qr_id AND school_id matches short_code
```

**Properties:**
- No student name, class, or admission number on the card
- Cross-school replay is rejected (short_code baked into signed message)
- Physical card loss: deactivate token via admin portal, reprint
- Secret rotation: re-run `/api/admin/students/generate-qr-codes` after rotating `STUDENT_QR_SECRET`

---

## Environment Variables Required

| Variable | Purpose |
|----------|---------|
| `PARENT_JWT_SECRET` | Signs parent session JWTs (min 32 chars, random) |
| `STUDENT_QR_SECRET` | HMAC key for QR payload signing (min 32 chars, random) |
| `MPESA_CONSUMER_KEY` | Daraja app consumer key |
| `MPESA_CONSUMER_SECRET` | Daraja app consumer secret |
| `MPESA_SHORTCODE` | Business shortcode |
| `MPESA_PASSKEY` | Lipa na M-Pesa passkey |
| `MPESA_CALLBACK_URL` | Must be `https://{domain}/api/parent/mpesa/callback` |

---

## Verification Checklist

```
□ 1. Short code query
      SELECT short_code FROM school_metadata WHERE school_id = '{nkoroi_id}';
      Expected: NKR001

□ 2. QR count
      SELECT COUNT(*) FROM student_qr_tokens WHERE school_id = '{id}' AND is_active = TRUE;
      Expected: one row per active student

□ 3. Anon isolation
      POST /parent/auth/lookup with valid QR from school A
      Attempt to access school B data — must return 403

□ 4. Parent JWT cannot access staff routes
      Use parent Bearer token on GET /api/attendance/[classId]
      Expected: 403 Forbidden (no staff_record for this user)

□ 5. Tamper detection
      Mutate one character in the QR payload, call /parent/auth/lookup
      Expected: 404 "QR code not recognised"
      (Even if qr_id exists in DB, sig mismatch rejects before lookup)

□ 6. School isolation
      Parent authenticated to school A's student_ids
      GET /parent/fees?student_id={school_B_student_id}
      Expected: 403 (student_id not in JWT student_ids)
```
