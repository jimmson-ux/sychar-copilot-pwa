#!/bin/bash
set -e
PROJECT_REF="xwgtsldimlrhtgvpnjnd"

echo "Deploying Sychar Copilot Edge Functions..."

supabase functions deploy process-document      --project-ref $PROJECT_REF
supabase functions deploy send-sms              --project-ref $PROJECT_REF
supabase functions deploy generate-pdf          --project-ref $PROJECT_REF
supabase functions deploy ai-insights           --project-ref $PROJECT_REF
supabase functions deploy notify-parent         --project-ref $PROJECT_REF
supabase functions deploy sms-gateway           --project-ref $PROJECT_REF
supabase functions deploy verify-attendance-gps --project-ref $PROJECT_REF
supabase functions deploy generate-qr-token      --project-ref $PROJECT_REF
supabase functions deploy sms-nts-attendance     --project-ref $PROJECT_REF

echo "Setting secrets..."
supabase secrets set \
  GEMINI_API_KEY="$(grep GEMINI_API_KEY .env.local | cut -d'=' -f2-)" \
  ANTHROPIC_API_KEY="$(grep ANTHROPIC_API_KEY .env.local | cut -d'=' -f2-)" \
  AT_API_KEY="$(grep AT_API_KEY .env.local | cut -d'=' -f2-)" \
  AT_USERNAME="$(grep AT_USERNAME .env.local | cut -d'=' -f2-)" \
  AT_SENDER_ID="$(grep AT_SENDER_ID .env.local | cut -d'=' -f2-)" \
  AT_WEBHOOK_SECRET="$(grep AT_WEBHOOK_SECRET .env.local | cut -d'=' -f2-)" \
  SYCHAR_QR_SECRET="$(grep SYCHAR_QR_SECRET .env.local | cut -d'=' -f2-)" \
  APP_URL="$(grep APP_URL .env.local | cut -d'=' -f2-)" \
  --project-ref $PROJECT_REF

echo "Done! Verify at: https://supabase.com/dashboard/project/$PROJECT_REF/functions"
