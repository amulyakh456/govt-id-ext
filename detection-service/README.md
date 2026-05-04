# Detection service

FastAPI service hosting all three detection model pipelines. Runs on port 8005 by default (override with `DETECTION_PORT` env var).

## Endpoints

- `GET /health` — model load status
- `POST /detect/{a|b|c}` — multipart `file`; for model `c`, also a `document_type` form field (one of `aadhaar`, `pan`, `dl`, `passport`, `voter_id`)
- `POST /classify` — multipart `file`; uses Model C's classifier to predict document type

## Models

Loaded once at process start. If a model fails to load, the service still starts with the others available (`/health` will report which loaded).

- **Model A** — `arnabdhar/YOLOv8-nano-aadhar-card`
- **Model B** — `foduucom/pan-card-detection`
- **Model C** — `logasanjeev/indian-id-validator` (classifier + 5 type-specific detectors)

## File-name fallback

The Hugging Face repos have varying filename conventions. Each wrapper has a `CANDIDATES` list of likely names; if none match, it falls back to listing the repo and using the first `.pt` file. If all three models load successfully on your run, the candidates were correct. If a model fails with "no .pt found", check the wrapper's logs — it will print the available files in that repo, and you can update the `CANDIDATES` list with the actual filename.

## Running

```bash
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

## Memory footprint (resident, after warm-up)

| Component | Approx |
|---|---|
| Model A (YOLOv8 nano) | ~50 MB |
| Model B (YOLOv8s) | ~80 MB |
| Model C (classifier + 5 detectors) | ~200 MB |
| PaddleOCR | ~300 MB |
| Python + FastAPI overhead | ~500 MB |
| **Total** | **~1.2 GB** |

Comfortable on a 16 GB laptop.
