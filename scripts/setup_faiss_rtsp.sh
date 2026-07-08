#!/bin/bash
# DDN VSS — FAISS + RTSP Server Setup Script
# Run this on the Ubuntu server (172.20.146.6) after pulling the latest code
# Usage: bash ~/projects/Build.DDN.Semantic_Search/scripts/setup_faiss_rtsp.sh

set -e

PROJECT_DIR="$HOME/projects/Build.DDN.Semantic_Search"
BACKEND_DIR="$PROJECT_DIR/backend"
VENV_PYTHON="$BACKEND_DIR/venv/bin/python"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║   DDN VSS — FAISS + RTSP Setup                          ║"
echo "╚══════════════════════════════════════════════════════════╝"

# ── 1. Pull latest code ────────────────────────────────────────────────────
echo ""
echo "📦 [1/6] Pulling latest code from GitHub..."
cd "$PROJECT_DIR"
git remote add vss2 https://github.com/nasirwasim8/DDN_VSS2.0.git 2>/dev/null || true
git fetch vss2
git merge vss2/main --no-edit || git pull vss2 main
echo "✅ Code updated"

# ── 2. Detect CUDA version ──────────────────────────────────────────────────
echo ""
echo "🔍 [2/6] Detecting CUDA version..."
CUDA_VERSION=""
if command -v nvcc &>/dev/null; then
    CUDA_VERSION=$(nvcc --version | grep "release" | awk '{print $5}' | cut -d',' -f1)
    echo "  CUDA: $CUDA_VERSION"
elif [ -f /usr/local/cuda/version.txt ]; then
    CUDA_VERSION=$(cat /usr/local/cuda/version.txt | awk '{print $3}')
    echo "  CUDA (from version.txt): $CUDA_VERSION"
else
    echo "  ⚠️  nvcc not found — will install faiss-cpu"
fi

# ── 3. Install FAISS ────────────────────────────────────────────────────────
echo ""
echo "📐 [3/6] Installing FAISS..."

# Activate venv if it exists
PYTHON_CMD="python3"
if [ -f "$VENV_PYTHON" ]; then
    PYTHON_CMD="$VENV_PYTHON"
    echo "  Using venv: $VENV_PYTHON"
fi

# Try faiss-gpu first (matches CUDA), fall back to faiss-cpu
if [ -n "$CUDA_VERSION" ]; then
    echo "  Attempting faiss-gpu install..."
    if $PYTHON_CMD -m pip install faiss-gpu 2>/dev/null; then
        echo "  ✅ faiss-gpu installed"
    else
        echo "  ⚠️  faiss-gpu failed (CUDA version mismatch) — falling back to faiss-cpu"
        $PYTHON_CMD -m pip install faiss-cpu>=1.7.4
        echo "  ✅ faiss-cpu installed"
    fi
else
    $PYTHON_CMD -m pip install faiss-cpu>=1.7.4
    echo "  ✅ faiss-cpu installed"
fi

# Verify
$PYTHON_CMD -c "import faiss; idx=faiss.IndexFlatIP(512); print(f'  FAISS OK — GPUs={faiss.get_num_gpus()}, dim test OK')"

# ── 4. Install other new dependencies ───────────────────────────────────────
echo ""
echo "📦 [4/6] Installing other new dependencies..."
$PYTHON_CMD -m pip install requests>=2.31.0 --quiet
echo "  ✅ requests installed"

# ── 5. Install mediamtx (RTSP server) ──────────────────────────────────────
echo ""
echo "📡 [5/6] Installing mediamtx RTSP server..."
MEDIAMTX_VERSION="1.9.3"
MEDIAMTX_URL="https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_amd64.tar.gz"

if ! command -v mediamtx &>/dev/null; then
    cd /tmp
    echo "  Downloading mediamtx v${MEDIAMTX_VERSION}..."
    wget -q "$MEDIAMTX_URL" -O mediamtx.tar.gz
    tar -xzf mediamtx.tar.gz mediamtx
    sudo mv mediamtx /usr/local/bin/mediamtx
    rm -f mediamtx.tar.gz
    echo "  ✅ mediamtx installed at /usr/local/bin/mediamtx"
else
    echo "  ✅ mediamtx already installed: $(mediamtx --version 2>&1 | head -1)"
fi

cd "$PROJECT_DIR"

# ── 6. Create FAISS data directory + Restart PM2 ───────────────────────────
echo ""
echo "🚀 [6/6] Creating data dirs and restarting backend..."
mkdir -p "$BACKEND_DIR/data/faiss"
echo "  ✅ backend/data/faiss/ created"

pm2 restart backend --update-env 2>/dev/null || echo "  ⚠️  PM2 restart failed — may need manual restart"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✅ Setup Complete!                                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Wait ~30 seconds for backend to start"
echo "  2. Test FAISS: curl http://localhost:8001/api/search/index/stats"
echo "  3. Re-index existing assets: curl -X POST http://localhost:8001/api/search/reindex"
echo "  4. Upload a video and search to verify vector search works"
echo ""
