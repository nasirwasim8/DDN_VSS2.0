# Deployment Workflow — Build.DDN.Semantic_Search

## Environment Overview

| Item | Value |
|------|-------|
| **Local machine** | Windows (`NasirRTX`) |
| **Local project path** | `c:\DDN\AI-Dev\Projects\Build.DDN.Semantic_Search-main` |
| **Remote server** | Ubuntu WSL — `nwasim@172.20.146.6` |
| **Remote project path** | `~/projects/Build.DDN.Semantic_Search` |
| **Frontend URL** | `http://localhost:5175` (served via pm2) |
| **Backend URL** | `http://localhost:8001` |
| **SSH user** | `nwasim` |

## pm2 Process Names

| id | Name | Role |
|----|------|------|
| 0 | `ddn-vss-backend` | FastAPI backend (port 8001) |
| 1 | `ddn-vss-frontend` | Vite/serve frontend (port 5175) |
| 2 | `infinia-rag-backend` | RAG backend |
| 3 | `infinia-rag-frontend` | RAG frontend |

---

## Deploy Workflow

### Option A — Copy specific files via SCP (no git required)

Use this when `git` is not available in PowerShell. Run from **Git Bash** (`MINGW64`):

```bash
# Syntax:
scp "/c/DDN/AI-Dev/Projects/Build.DDN.Semantic_Search-main/<relative-file-path>" \
    nwasim@172.20.146.6:~/projects/Build.DDN.Semantic_Search/<relative-file-path>

# Example — copy a modified frontend component:
scp "/c/DDN/AI-Dev/Projects/Build.DDN.Semantic_Search-main/frontend/src/components/Header.tsx" \
    nwasim@172.20.146.6:~/projects/Build.DDN.Semantic_Search/frontend/src/components/Header.tsx

# Example — copy a static asset (image etc.):
scp "/c/DDN/AI-Dev/Projects/Build.DDN.Semantic_Search-main/frontend/public/vss-architecture.png" \
    nwasim@172.20.146.6:~/projects/Build.DDN.Semantic_Search/frontend/public/vss-architecture.png
```

Then rebuild on the server (see [Rebuild & Restart](#rebuild--restart) below).

---

### Option B — Push via Git + Pull on server

> ⚠️ `git` is **not** in Windows PowerShell PATH. Use **Git Bash** or **VS Code Source Control**.

**Step 1 — Commit & push (Git Bash or VS Code):**

```bash
# In Git Bash, navigate to the project first:
cd /c/DDN/AI-Dev/Projects/Build.DDN.Semantic_Search-main

git add <changed files>
git commit -m "your message"
git push
```

Or use **VS Code → Source Control panel (Ctrl+Shift+G)** → Stage → Commit → Sync.

**Step 2 — Pull on the Ubuntu server:**

```bash
ssh nwasim@172.20.146.6
cd ~/projects/Build.DDN.Semantic_Search
git pull
```

Then rebuild (see below).

---

## Rebuild & Restart

### Frontend only (most changes)
```bash
cd ~/projects/Build.DDN.Semantic_Search/frontend
npm run build
pm2 restart ddn-vss-frontend
```

### Backend only (Python changes)
```bash
pm2 restart ddn-vss-backend
```

### Both
```bash
cd ~/projects/Build.DDN.Semantic_Search/frontend
npm run build
pm2 restart ddn-vss-frontend
pm2 restart ddn-vss-backend
```

---

## Important Notes

- **VITE_API_URL** must be baked into the frontend build. The `.env.production` file sets it:
  ```
  VITE_API_URL=http://localhost:8001
  ```
  If missing, the GPU badge and health check will fail (frontend calls `/api/health` on port 5175 instead of 8001).

- **Static assets** (images, SVGs) go in `frontend/public/` — they are served at the root URL (e.g. `public/vss-architecture.png` → `/vss-architecture.png`).

- **Check logs** at any time:
  ```bash
  pm2 logs ddn-vss-backend --lines 50
  pm2 logs ddn-vss-frontend --lines 50
  ```
