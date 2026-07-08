#!/bin/bash
# Quick diagnostic for Infinia 404 + GPU badge issues
SERVER="nwasim@172.20.146.6"

ssh -o StrictHostKeyChecking=no "$SERVER" bash -s <<'ENDSSH'

echo "============================================"
echo "  1. HEALTH ENDPOINT (GPU badge source)"
echo "============================================"
curl -sf http://localhost:8001/api/health | python3 -m json.tool 2>/dev/null || echo "  ❌ Health endpoint not responding"

echo ""
echo "============================================"
echo "  2. INFINIA STORAGE CONFIG (saved on disk)"
echo "============================================"
CFG="$HOME/projects/Build.DDN.Semantic_Search/backend/data/storage_config.json"
if [ -f "$CFG" ]; then
    python3 - "$CFG" <<'PYEOF'
import sys, json
d = json.load(open(sys.argv[1]))
ddn = d.get('ddn', {})
print("  endpoint_url :", ddn.get('endpoint_url', '(empty)'))
print("  bucket_name  :", ddn.get('bucket_name', '(empty)'))
print("  region       :", ddn.get('region', '(empty)'))
print("  access_key   :", 'SET' if ddn.get('access_key') else '(empty)')
print("  secret_key   :", 'SET' if ddn.get('secret_key') else '(empty)')
PYEOF
else
    echo "  ❌ storage_config.json NOT FOUND at $CFG"
    echo "     (Config was never saved to disk — need to re-enter in UI)"
fi

echo ""
echo "============================================"
echo "  3. TEST INFINIA BUCKET DIRECTLY"
echo "============================================"
python3 - <<'PYEOF'
import json, os
cfg_path = os.path.expanduser("~/projects/Build.DDN.Semantic_Search/backend/data/storage_config.json")
if not os.path.exists(cfg_path):
    print("  Cannot test — no storage_config.json")
else:
    d = json.load(open(cfg_path))
    ddn = d.get('ddn', {})
    endpoint = ddn.get('endpoint_url','')
    bucket   = ddn.get('bucket_name','')
    key      = ddn.get('access_key','')
    secret   = ddn.get('secret_key','')
    if not all([endpoint, bucket, key, secret]):
        print("  ❌ Missing config fields — cannot test")
    else:
        try:
            import boto3
            from botocore.client import Config
            s3 = boto3.client(
                's3',
                endpoint_url=endpoint,
                aws_access_key_id=key,
                aws_secret_access_key=secret,
                config=Config(signature_version='s3v4'),
                region_name=ddn.get('region','us-east-1')
            )
            s3.head_bucket(Bucket=bucket)
            print(f"  ✅ Bucket '{bucket}' found at {endpoint}")
        except Exception as e:
            print(f"  ❌ Error: {e}")
            # List buckets to find correct name
            try:
                resp = s3.list_buckets()
                buckets = [b['Name'] for b in resp.get('Buckets',[])]
                print(f"  Available buckets: {buckets}")
            except Exception as e2:
                print(f"  Could not list buckets: {e2}")
PYEOF

echo ""
echo "============================================"
echo "  4. WHICH ROUTES FILE IS MAIN.PY USING?"
echo "============================================"
grep -E "from app|import" ~/projects/Build.DDN.Semantic_Search/backend/main.py | head -10

echo ""
echo "============================================"
echo "  5. GPU DEVICE CHECK"
echo "============================================"
cd ~/projects/Build.DDN.Semantic_Search/backend
./venv/bin/python3 -c "
import torch
print('  CUDA available:', torch.cuda.is_available())
if torch.cuda.is_available():
    print('  GPU:', torch.cuda.get_device_name(0))
" 2>/dev/null || echo "  Could not check GPU via torch"

ENDSSH
