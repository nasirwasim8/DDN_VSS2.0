#!/bin/bash
# ============================================================
#  DDN VSS — OpenAI Fix + Diagnostics Deploy (v2)
#
#  CHANGES IN THIS VERSION:
#  1. enrich_with_fallback() now reads llm_config.json directly
#     inside the background thread — no more missing key in
#     background video processing tasks.
#  2. Added logger.info showing provider_pref + key_set so
#     logs clearly show what was chosen and why.
#
#  Run from WSL:
#    chmod +x deploy_openai_fix.sh
#    ./deploy_openai_fix.sh
# ============================================================

set -euo pipefail

SERVER="nwasim@172.20.146.6"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── SSH ControlMaster: one password prompt for everything ─────
CTRL_PATH="/tmp/ssh_ctl_openai_$$"
echo ""
echo "🔑 Opening SSH connection (one password prompt)..."
ssh -M -S "$CTRL_PATH" -o ControlPersist=60s \
    -o StrictHostKeyChecking=no -fNT "$SERVER"

echo ""
echo "🔧 DDN VSS — OpenAI Fix Deploy (v2)"
echo ""

# ── Step 1: Copy fixed backend files ─────────────────────────
echo "📤 Copying fixed files to server..."

scp -o "ControlPath=$CTRL_PATH" \
    "${SCRIPT_DIR}/backend/app/services/llm_enrichment.py" \
    "${SERVER}:~/projects/Build.DDN.Semantic_Search/backend/app/services/llm_enrichment.py"

scp -o "ControlPath=$CTRL_PATH" \
    "${SCRIPT_DIR}/backend/app/api/routes.py" \
    "${SERVER}:~/projects/Build.DDN.Semantic_Search/backend/app/api/routes.py"

scp -o "ControlPath=$CTRL_PATH" \
    "${SCRIPT_DIR}/backend/main.py" \
    "${SERVER}:~/projects/Build.DDN.Semantic_Search/backend/main.py"

echo "   ✔ llm_enrichment.py + routes.py + main.py copied"
echo ""

# ── Step 2: Restart backend ───────────────────────────────────
echo "🔄 Restarting backend on server..."
ssh -S "$CTRL_PATH" "$SERVER" bash -s <<'ENDSSH'
set -euo pipefail
INSTALL_DIR="$HOME/projects/Build.DDN.Semantic_Search"

echo "── Restarting PM2 backend ────────────────────────────────"
pm2 restart ddn-vss-backend 2>/dev/null || \
    pm2 start "$INSTALL_DIR/ecosystem.config.js" --only ddn-vss-backend
pm2 save
echo "   ✔ Backend restarted"

echo "⏳ Waiting 20s for backend and models to load..."
sleep 20

echo ""
echo "── Startup log (LLM config lines) ───────────────────────"
pm2 logs ddn-vss-backend --lines 50 --nostream 2>/dev/null | \
    grep -iE "(LLM|OpenAI|Ollama|OPENAI|provider|key_set|🤖|🔑|✅|⚠️|enrichment)" \
    | tail -20 || echo "  (no LLM lines found — check manually)"

echo ""
echo "── Checking LLM config via API ──────────────────────────"
curl -sf http://localhost:8001/api/config/llm 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('   provider        :', d.get('provider'))
    print('   openai_key_set  :', d.get('openai_key_set'))
    print('   openai_key      :', d.get('openai_key_masked', '(none)'))
    print('   openai_reachable:', d.get('openai_reachable', 'N/A'))
    print('   ollama_available:', d.get('ollama_available'))
except Exception as e:
    print('   (could not parse:', e, ')')
" || echo "   Backend not yet responding"

echo ""
echo "── Check llm_config.json on disk ────────────────────────"
LLM_JSON="$HOME/projects/Build.DDN.Semantic_Search/backend/data/llm_config.json"
if [ -f "$LLM_JSON" ]; then
    echo "   ✅ llm_config.json EXISTS"
    cat "$LLM_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
key = d.get('openai_api_key','')
if key: d['openai_api_key'] = key[:7] + '...' + key[-4:] if len(key)>11 else '****'
print('  ', json.dumps(d, indent=2))
"
else
    echo "   ❌ llm_config.json NOT FOUND"
    echo "   → Go to Configuration → AI Enrichment → Save LLM Configuration"
fi

echo ""
echo "── Test OpenAI connectivity from server ─────────────────"
LLM_JSON="$HOME/projects/Build.DDN.Semantic_Search/backend/data/llm_config.json"
OPENAI_KEY=""
if [ -f "$LLM_JSON" ]; then
    OPENAI_KEY=$(python3 -c "import json; d=json.load(open('$LLM_JSON')); print(d.get('openai_api_key',''))" 2>/dev/null || echo "")
fi
if [ -n "$OPENAI_KEY" ]; then
    HTTP_CODE=$(curl -s -o /tmp/_oai_test.json -w "%{http_code}" \
        --max-time 10 \
        -H "Authorization: Bearer $OPENAI_KEY" \
        "https://api.openai.com/v1/models" 2>/dev/null || echo "000")
    if   [ "$HTTP_CODE" = "200" ]; then echo "   ✅ OpenAI REACHABLE — key is valid"
    elif [ "$HTTP_CODE" = "401" ]; then echo "   ❌ HTTP 401 — INVALID/EXPIRED key"; cat /tmp/_oai_test.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ',d.get('error',{}).get('message','?'))" 2>/dev/null
    elif [ "$HTTP_CODE" = "429" ]; then echo "   ⚠️  HTTP 429 — RATE LIMITED / QUOTA EXCEEDED"; cat /tmp/_oai_test.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('  ',d.get('error',{}).get('message','?'))" 2>/dev/null
    elif [ "$HTTP_CODE" = "000" ]; then echo "   ❌ Cannot reach api.openai.com (firewall/no internet)"
    else echo "   ⚠️  HTTP $HTTP_CODE — unexpected"; fi
    rm -f /tmp/_oai_test.json
else
    echo "   ⚠️  No OpenAI key found in llm_config.json"
fi

echo ""
echo "✅ Deploy + diagnostics complete."
ENDSSH

# Close SSH master
ssh -S "$CTRL_PATH" -O exit "$SERVER" 2>/dev/null || true

echo ""
echo "✅ Done! Check the output above to see the root cause."
echo ""
echo "Common fixes:"
echo "  401 (invalid key)  → Update key in Configuration → AI Enrichment → Save"
echo "  429 (quota)        → Check OpenAI billing at platform.openai.com/usage"
echo "  000 (no internet)  → Server firewall blocks outbound HTTPS to OpenAI"
echo "  No llm_config.json → Open app → Configuration → Save LLM Configuration"
echo ""
