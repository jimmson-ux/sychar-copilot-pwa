#!/usr/bin/env bash
# Seed Supabase auth.users for all active Nkoroi staff.
# Password: Nkoroi@2026  (staff should change after first login)
# email_confirm: true — no verification email needed.
SVC="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3Z3RzbGRpbWxyaHRndnBuam5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4ODMyOSwiZXhwIjoyMDg4NTY0MzI5fQ.yFMBGBd_VI5q0zLpPke3fUbPESCmr39fp70KpsjNnN4"
BASE="https://xwgtsldimlrhtgvpnjnd.supabase.co"
DEFAULT_PW="Nkoroi@2026"

EMAILS=(
  "jafwande@gmail.com"
  "dlenairoshi@gmail.com"
  "rita2thiringi@gmail.com"
  "faithtirops@gmail.com"
  "oliviaonyango5@gmail.com"
  "geraldmogere@gmail.com"
  "denochep@gmail.com"
  "danielmbugua232@gmail.com"
  "atoninyatigo@gmail.com"
  "kuyionivivian@gmail.com"
  "jeddykanini@gmail.com"
  "mwendewinfredmary@gmail.com"
  "deltoo66@gmail.com"
  "rasoha.agesa@yahoo.com"
  "otienofelix909@gmail.com"
  "jebichiimaureen@gmail.com"
  "michstellah@gmail.com"
  "gkchonge@gmail.com"
  "oshome.nixon@staff.nkoroi.internal"
  "marioningungi91@mwalimu.tsc.go.ke"
  "maresikobunz@gmail.com"
  "kamaujames23@gmail.com"
  "chriskerubo@gmail.com"
  "kariukipatrick432@gmail.com"
  "joyceigwora82@gmail.com"
  "eunicemwangangi8@gmail.com"
  "mulwanthemba@gmail.com"
  "eunicebedinaadegu@gmail.com"
  "bethnjoki1@gmail.com"
  "nathannjuguna90@gmail.com"
  "rebeccamageria@gmail.com"
  "wairimu0895@yahoo.com"
)

created=0; skipped=0; failed=0

for email in "${EMAILS[@]}"; do
  resp=$(curl -s -w "\n%{http_code}" \
    "$BASE/auth/v1/admin/users" \
    -X POST \
    -H "apikey: $SVC" \
    -H "Authorization: Bearer $SVC" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$DEFAULT_PW\",\"email_confirm\":true}")

  code=$(echo "$resp" | tail -1)
  body=$(echo "$resp" | head -1)

  if [[ "$code" == "200" ]]; then
    echo "[CREATED] $email"
    ((created++))
  elif [[ "$body" == *"already been registered"* ]] || [[ "$body" == *"already exists"* ]] || [[ "$code" == "422" ]]; then
    echo "[EXISTS]  $email"
    ((skipped++))
  else
    echo "[FAILED]  $email — HTTP $code — $body"
    ((failed++))
  fi
done

echo ""
echo "Done: $created created, $skipped already existed, $failed failed"
