# Indian Government ID Extractor

Extracts structured fields (name, DOB, ID number, address, etc.) from photos of Indian government IDs — Aadhaar, PAN, Driving Licence, Passport, Voter ID — using a YOLO classifier + per-type field detectors + PaddleOCR pipeline.

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

## Deploying to Render

A `render.yaml` blueprint is committed at the repo root. After connecting this repo to Render:

1. **Create the blueprint** — Render reads `render.yaml` and provisions three services:
   - `govt-id-detection` (Python web, **Standard plan / 2 GB RAM** — model load needs ~1.5 GB)
   - `govt-id-backend` (Node web, Starter plan)
   - `govt-id-frontend` (static site, free)

2. **Wait for the first deploy.** Render needs the services to exist before they have public URLs.

3. **Wire up the cross-service URLs** in each service's Environment tab:

   | Service | Variable | Value |
   |---|---|---|
   | govt-id-backend | `DETECTION_URL` | `https://govt-id-detection.onrender.com` |
   | govt-id-backend | `CORS_ORIGIN` | `https://govt-id-frontend.onrender.com` |
   | govt-id-frontend | `VITE_API_URL` | `https://govt-id-backend.onrender.com` |

4. **Trigger a redeploy** on the backend and frontend so they pick up the URLs.

### Cost expectation

Render Standard ($25/mo) for detection + Starter ($7/mo) for backend + free static site = **~$32/mo**. The free/starter tiers (512 MB) **will OOM** on the detection service — its YOLO + PaddleOCR + 6 model load is around 1.5 GB at runtime.

### Cold-start behaviour

First request after a build takes ~60 seconds because the detection service has to load 6 YOLO models and PaddleOCR's recogniser/detector into memory. Steady-state per-request latency is 1–4 seconds depending on image size and rotation passes.

If you don't want to re-download model weights on every restart, attach a persistent disk to `govt-id-detection` and set `HF_HOME=/var/data/hf` (the `render.yaml` has a commented stub).

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
