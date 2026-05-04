---
title: Indian Government ID Extractor
emoji: 🪪
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Indian Government ID Extractor

Extracts structured fields (name, DOB, ID number, address, etc.) from photos of Indian government IDs — Aadhaar, PAN, Driving Licence, Passport, Voter ID — using a YOLO classifier + per-type field detectors + PaddleOCR pipeline.

The YAML block above is the Hugging Face Spaces config — when this repo is connected to a Space (Docker SDK), the Space builds the [Dockerfile](Dockerfile) at the root, which packages the **detection service** as a self-contained inference API.

## Architecture

```
[Browser]
   ↓ HTTPS
[Node backend]              normalises / validates / cleans OCR text
   ↓ HTTP
[Python detection-service]  YOLO + PaddleOCR, auto-rotation, layout fixes
```

Three services. In dev they run on `5176` (frontend), `3011` (backend), `8005` (detection). In production they're separate Render web services connected by HTTPS.

The detection pipeline (`logasanjeev/indian-id-validator`):

1. Auto-rotation: detects the upright orientation by running the per-type detector at 0/90/180/270° and picking the one with the most "good" field bboxes.
2. Field detection: a per-type YOLO model (`Voter_Id.pt`, `Pan_Card.pt`, etc.) finds field bboxes.
3. Layout corrections: doc-type-specific spatial rules fix systematic mislabels (e.g. on a Driving Licence, a "name" detection that lands in the bottom S/O zone gets relabeled as `father_name`).
4. OCR: PaddleOCR reads each crop on a centred black canvas; small adjacent label lines get filtered out by relative bbox area.
5. Field normalisation: backend regexes pull canonical PAN / Aadhaar / DL formats out of OCR-noisy strings; document labels (`Permanent Account Number Card`, `Date of Birth`, …) are stripped wholesale.

## Local development

Requires Python 3.11 (PaddlePaddle has no wheels for 3.12+).

```bash
# Python detection service (slow first install — ~3 GB of deps)
cd detection-service
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd ..

# Node deps
(cd backend && npm install)
(cd frontend && npm install)

bash start.sh   # boots all three; opens http://localhost:5176
```

First boot downloads ~500 MB of model weights from Hugging Face. Subsequent boots are fast.

## Deploying — free path (Hugging Face Spaces + Render)

The detection service is heavy (PyTorch + PaddleOCR + 6 YOLO models, ~1.5 GB RAM). Render's free tier (512 MB) will OOM on it; HF Spaces' free CPU Basic tier (16 GB RAM, 2 vCPU) is purpose-built for this kind of model-serving workload, so we host detection there. The lightweight Node backend and static frontend live on Render's free tier.

```
[Browser]
   ↓ HTTPS
[Render — frontend (static, free)]
   ↓ HTTPS
[Render — backend (Node, free web service)]
   ↓ HTTPS
[Hugging Face Space — detection (Docker, free CPU Basic)]
```

**Total cost: $0/month.**

### Step 1 — Push this repo to GitHub

(Already done if you're reading this from GitHub.)

### Step 2 — Create the Hugging Face Space

1. Go to https://huggingface.co/new-space
2. Owner: your HF username. Name: `govt-id-detection` (or whatever).
3. SDK: **Docker** → "Blank"
4. Visibility: Public or Private (both are free).
5. Hardware: leave default ("CPU basic — 2 vCPU, 16 GB").
6. Create.
7. On the new Space's page, click **Settings → Repository → "Link to a GitHub repo"** and link your `govt-id-extraction` repo. (Alternatively, you can `git push` the repo's contents to the Space's git URL directly — `https://huggingface.co/spaces/<you>/govt-id-detection.git`.)
8. The Space will build the root [Dockerfile](Dockerfile) — first build takes ~10 minutes (PyTorch + PaddleOCR + model weight downloads bake into the image). Subsequent restarts boot in seconds.
9. Note the Space's public URL: `https://<you>-govt-id-detection.hf.space`. That's your `DETECTION_URL`.

### Step 3 — Deploy backend + frontend to Render

`render.yaml` provisions both as free services.

1. Go to https://dashboard.render.com/blueprints → **New Blueprint** → connect your GitHub repo.
2. Render reads `render.yaml` and creates two services: `govt-id-backend` (Node web, free) and `govt-id-frontend` (static, free).
3. Wait for the first deploy. URLs become available after.
4. Set env vars in each service's Environment tab:

   | Service | Variable | Value |
   |---|---|---|
   | govt-id-backend | `DETECTION_URL` | `https://<you>-govt-id-detection.hf.space` |
   | govt-id-backend | `CORS_ORIGIN` | `https://govt-id-frontend.onrender.com` |
   | govt-id-frontend | `VITE_API_URL` | `https://govt-id-backend.onrender.com` |

5. Manual Deploy → Clear build cache & deploy on both services so they pick up the URLs.

### Cold-start behaviour (free tier)

Free Render and HF Spaces both sleep after inactivity:
- Render free web service: sleeps after ~15 min idle, ~50s wake.
- HF Space free: sleeps after ~48 h idle, ~30s wake.
- A truly cold "first hit": ~60–90s for both to wake + the detection service to finish loading models. Subsequent requests are fast (~2–4s).

If you need always-on for production traffic, upgrade only the bottleneck — typically the HF Space ($0.05/hr CPU Upgrade, ~$36/mo for always-on).

### Security note

The HF Space is a public HTTPS endpoint with no auth. The Node backend talks to it server-to-server with a Render IP, but the URL is reachable from anywhere. For a demo this is fine; for production add an auth header (e.g. an API key check in `detection-service/main.py`) and pass it from the backend.

## Supported document types

| Document | Detected fields |
|---|---|
| Aadhaar | full_name, dob, gender, aadhaar_number, address, father_name, husband_name |
| PAN | full_name, father_name, dob, pan_number |
| Driving Licence | full_name, dob, dl_number, address, date_of_issue, date_of_expiry, blood_group |
| Passport | full_name, given_names, surname, dob, place_of_birth, gender, passport_number, date_of_issue, date_of_expiry, place_of_issue |
| Voter ID | full_name, father_name, dob, gender, voter_id_number, address |

## Honest expectations

- This is detection + OCR, not an LLM. Accuracy is bounded by image quality and the upstream YOLO models.
- The unified detector occasionally mislabels regions (e.g. tags S/O text as "name" on some DL layouts). The pipeline applies layout-based corrections for known cases, but novel layouts may slip through.
- For best results, use upright photos with the card filling most of the frame. The auto-rotator handles 90/180/270° rotations but can't recover from severe perspective skew.
- PaddleOCR is English-only by default. Hindi labels printed on the cards are treated as noise and filtered out — values themselves should be in English-script Indian text.

## Project layout

```
detection-service/      Python FastAPI + YOLO + PaddleOCR
  models/
    model_c_unified.py  Classifier + 5 type-specific detectors, auto-rotation, layout fixes
    ocr.py              Shared PaddleOCR with crop-prep and bbox-area filtering
  main.py               FastAPI app
backend/                Node/Express thin gateway
  routes/extract.js     Single endpoint: POST /api/extract
  services/
    normalizer.js       Field-specific value cleanup (regex extraction, label stripping)
    validator.js        Format validation per schema
    schemas.js          Per-doc-type field list + format regexes
frontend/               React + Vite + Tailwind
render.yaml             Render deployment blueprint
```
