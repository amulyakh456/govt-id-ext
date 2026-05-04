"""FastAPI service hosting the unified Indian ID detection pipeline (Model C)."""
import io
import os
import time
import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image, ImageOps

logging.getLogger("ppocr").setLevel(logging.WARNING)
logging.getLogger("paddle").setLevel(logging.WARNING)

# Render injects PORT for web services; fall back to DETECTION_PORT for local
# dev (start.sh uses 8005), then a sane default.
PORT = int(os.environ.get("PORT") or os.environ.get("DETECTION_PORT") or "8005")
HOST = os.environ.get("HOST", "127.0.0.1")


print("Loading Model C: logasanjeev/indian-id-validator ...", flush=True)
from models.model_c_unified import ModelCUnified
model_c = None
try:
    model_c = ModelCUnified()
except Exception as e:
    print(f"  failed to load Model C: {e}", flush=True)

print("Detection service ready.", flush=True)

app = FastAPI(title="ID Extract — Detection Service")


def _load_image(raw: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(raw))
    img = ImageOps.exif_transpose(img).convert("RGB")
    if max(img.size) > 2000:
        ratio = 2000 / max(img.size)
        img = img.resize((int(img.size[0] * ratio), int(img.size[1] * ratio)))
    return img


@app.get("/health")
async def health():
    return {
        "ok": True,
        "models": {
            "model_c_unified": bool(model_c and model_c.is_loaded()),
        },
        "model_c_supported_types": model_c.supported_types() if model_c else [],
    }


@app.post("/classify")
async def classify(file: UploadFile = File(...)):
    if model_c is None:
        raise HTTPException(503, "Model C (unified classifier) not loaded")
    raw = await file.read()
    image = _load_image(raw)
    started = time.time()
    out = model_c.classify(image)
    out["elapsedMs"] = int((time.time() - started) * 1000)
    return out


@app.post("/detect/{model_id}")
async def detect(model_id: str, file: UploadFile = File(...), document_type: str = Form(None)):
    if not file:
        raise HTTPException(400, "no file uploaded")
    if model_id != "c":
        raise HTTPException(400, f"unknown model_id: {model_id} (only 'c' is supported)")
    if model_c is None:
        raise HTTPException(503, "Model C not loaded")
    if not document_type:
        raise HTTPException(400, "document_type form-field required")

    raw = await file.read()
    image = _load_image(raw)

    started = time.time()
    out = model_c.extract(image, document_type)
    out["elapsedMs"] = int((time.time() - started) * 1000)
    return out


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, log_level="warning")
