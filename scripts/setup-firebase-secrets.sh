#!/usr/bin/env bash
# ─── Firebase + Gemini secrets setup ─────────────────────────────────────────
# Fill in the values below, then run:
#   bash scripts/setup-firebase-secrets.sh
#
# Where to get each value:
#   FIREBASE_PROJECT_ID          → Firebase Console → Project Settings → General → Project ID
#   FIREBASE_SERVICE_ACCOUNT_JSON → Firebase Console → Project Settings → Service Accounts
#                                    → Generate new private key → copy entire JSON content
#   GEMINI_API_KEY               → Google AI Studio (aistudio.google.com) → Get API key
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

FIREBASE_PROJECT_ID="your-firebase-project-id"

# Paste the full service account JSON on one line (replace newlines in private_key with \n)
FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"firebase-adminsdk-xxx@your-project-id.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}'

GEMINI_API_KEY="your-gemini-api-key"

# ─── Deploy secrets to Supabase edge functions ───────────────────────────────
echo "Setting Supabase edge function secrets..."

npx supabase secrets set \
  FIREBASE_PROJECT_ID="$FIREBASE_PROJECT_ID" \
  FIREBASE_SERVICE_ACCOUNT_JSON="$FIREBASE_SERVICE_ACCOUNT_JSON" \
  GEMINI_API_KEY="$GEMINI_API_KEY"

echo ""
echo "Done. Secrets set:"
echo "  ✓ FIREBASE_PROJECT_ID"
echo "  ✓ FIREBASE_SERVICE_ACCOUNT_JSON"
echo "  ✓ GEMINI_API_KEY"
echo ""
echo "Next steps:"
echo "  1. Add NEXT_PUBLIC_FIREBASE_* vars to .env.local"
echo "  2. Run: npm run build  (prebuild generates public/firebase-messaging-sw.js)"
echo "  3. Deploy: npm run deploy"
