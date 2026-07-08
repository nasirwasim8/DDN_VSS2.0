#!/bin/bash
# ============================================================
#  DDN VSS — OpenAI Diagnostic Script
#  Run from WSL: bash diagnose_openai.sh
#  This SSHs into the server and tells you exactly why
#  OpenAI is being skipped in favor of Ollama.
# ============================================================

SERVER="nwasim@172.20.146.6"

echo ""
echo "🔍 Diagnosing OpenAI vs Ollama selection on the server..."
echo "   SSH: $SERVER"
echo ""

ssh -o StrictHostKeyChecking=no "$SERVER" bash -s <<'ENDSSH'

INSTALL_DIR="$HOME/projects/Build.DDN.Semantic_Search"
VENV="$INSTALL_DIR/backend/venv"

echo "============================================================"
echo "  STEP 1: Check pm2 backend logs for OpenAI/Ollama messages"
echo "============================================================"
pm2 logs ddn-vss-backend --lines 80 --nostream 2>/dev/null | \
    grep -iE "(openai|ollama|LLM|enrichment|provider|OPENAI_API|key_set|fallback|✅|⚠️|❌|failed|error)" \
    | tail -40 || echo "  (no matching lines found)"

echo ""
echo "============================================================"
echo "  STEP 2: Check OPENAI_API_KEY in process environment"
echo "============================================================"
# Check via the live API endpoint
OPENAI_KEY_SET=$(curl -sf http://localhost:8001/api/config/llm 2>/dev/null | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print('KEY SET:', d.get('openai_key_set'), '| KEY:', d.get('openai_key_masked','?'), '| PROVIDER:', d.get('provider'), '| REACHABLE:', d.get('openai_reachable','N/A'))" \
    2>/dev/null) || OPENAI_KEY_SET="(API not responding)"
echo "  $OPENAI_KEY_SET"

echo ""
echo "============================================================"
echo "  STEP 3: Check persisted llm_config.json"
echo "============================================================"
LLM_JSON="$INSTALL_DIR/backend/data/llm_config.json"
if [ -f "$LLM_JSON" ]; then
    echo "  Found: $LLM_JSON"
    # Mask the API key for display
    cat "$LLM_JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
key = d.get('openai_api_key','')
if key:
    d['openai_api_key'] = key[:7] + '...' + key[-4:] if len(key) > 11 else '****'
print(json.dumps(d, indent=2))
"
else
    echo "  ❌ llm_config.json NOT FOUND at $LLM_JSON"
    echo "     (Key was never saved to disk — go to Configuration and click Save LLM Configuration)"
fi

echo ""
echo "============================================================"
echo "  STEP 4: Test OpenAI API connectivity directly from server"
echo "============================================================"
# Get the key from llm_config.json if it exists
OPENAI_KEY=""
if [ -f "$LLM_JSON" ]; then
    OPENAI_KEY=$(python3 -c "import json; d=json.load(open('$LLM_JSON')); print(d.get('openai_api_key',''))" 2>/dev/null)
fi
# Fallback to environment variable
if [ -z "$OPENAI_KEY" ]; then
    OPENAI_KEY="${OPENAI_API_KEY:-}"
fi

if [ -n "$OPENAI_KEY" ]; then
    echo "  Testing connection to api.openai.com..."
    HTTP_CODE=$(curl -s -o /tmp/openai_test.json -w "%{http_code}" \
        --max-time 10 \
        -H "Authorization: Bearer $OPENAI_KEY" \
        "https://api.openai.com/v1/models" 2>/dev/null)

    echo "  HTTP Status: $HTTP_CODE"
    if [ "$HTTP_CODE" = "200" ]; then
        echo "  ✅ OpenAI API is REACHABLE and key is VALID"
    elif [ "$HTTP_CODE" = "401" ]; then
        echo "  ❌ HTTP 401 — INVALID or EXPIRED API key"
        cat /tmp/openai_test.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Error:', d.get('error',{}).get('message','?'))" 2>/dev/null
    elif [ "$HTTP_CODE" = "429" ]; then
        echo "  ⚠️  HTTP 429 — RATE LIMITED or QUOTA EXCEEDED"
        cat /tmp/openai_test.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('  Error:', d.get('error',{}).get('message','?'))" 2>/dev/null
    elif [ "$HTTP_CODE" = "000" ]; then
        echo "  ❌ HTTP 000 — NO NETWORK CONNECTION to api.openai.com"
        echo "     (Server cannot reach internet — firewall or proxy issue)"
        echo "  Testing basic internet:"
        curl -sf --max-time 5 https://www.google.com -o /dev/null && echo "  ✅ Internet works (Google reachable)" || echo "  ❌ No internet at all"
    else
        echo "  ⚠️  Unexpected HTTP $HTTP_CODE"
        cat /tmp/openai_test.json 2>/dev/null | head -5
    fi
else
    echo "  ❌ No OpenAI API key found anywhere (env or disk)"
fi

echo ""
echo "============================================================"
echo "  STEP 5: Check if deploy_openai_fix.sh was ever deployed"
echo "============================================================"
# Look for our persist functions in the deployed routes.py
if grep -q "_save_llm_config_to_disk" "$INSTALL_DIR/backend/app/api/routes.py" 2>/dev/null; then
    echo "  ✅ Persistence fix IS deployed (routes.py has _save_llm_config_to_disk)"
else
    echo "  ❌ Persistence fix NOT deployed (routes.py is old version)"
    echo "     Run: ./deploy_openai_fix.sh from WSL to deploy"
fi

# Check main.py
if grep -q "_load_llm_config_from_disk" "$INSTALL_DIR/backend/main.py" 2>/dev/null; then
    echo "  ✅ Startup loader IS deployed (main.py calls _load_llm_config_from_disk)"
else
    echo "  ❌ Startup loader NOT deployed (main.py is old version)"
fi

echo ""
echo "============================================================"
echo "  SUMMARY"
echo "============================================================"
rm -f /tmp/openai_test.json
echo "  Done! Review the STEP 4 result — that tells you the exact reason."
ENDSSH

echo ""
echo "📋 Diagnosis complete. Key things to check:"
echo "   - STEP 4: Is OpenAI reachable? (401=bad key, 429=quota, 000=no internet)"
echo "   - STEP 3: Is llm_config.json present with your API key?"
echo "   - STEP 5: Is the persistence fix deployed?"
echo ""
