# Dockerfile for the detection service. Built for Hugging Face Spaces (Docker
# SDK), which expects a non-root user and serves on $PORT (default 7860).
#
# Strategy: bake the YOLO + PaddleOCR weights into the image at build time so
# the running container starts in a few seconds instead of waiting on a fresh
# HF Hub download on every cold-start. HF_HUB_OFFLINE at runtime ensures the
# service never tries to reach the network for weights.

FROM python:3.11-slim

# HF Spaces runs the container as a non-root user with UID 1000.
RUN useradd -m -u 1000 user

# Native libs PaddleOCR + OpenCV link against.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
    && rm -rf /var/lib/apt/lists/*

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    HF_HOME=/home/user/.cache/huggingface
WORKDIR /home/user/app

# Python deps. Do this before copying app code so dep changes don't bust the
# layer cache when only Python source changes.
#
# Install CPU-only PyTorch FIRST — without this, ultralytics' transitive
# `torch>=1.8.0` constraint resolves to the default GPU build, which pulls
# ~3 GB of CUDA toolkit wheels we don't need (HF Spaces free tier is CPU-only).
# Pinning here means pip already has torch satisfied when it gets to
# requirements.txt.
COPY --chown=user:user detection-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --user --upgrade pip \
 && pip install --no-cache-dir --user \
        --index-url https://download.pytorch.org/whl/cpu \
        torch==2.4.1 torchvision==0.19.1 \
 && pip install --no-cache-dir --user -r requirements.txt

# Pre-download the YOLO model weights so they're embedded in the image and the
# first request after a cold start is fast (no HF Hub round-trip).
RUN python -c "\
from huggingface_hub import hf_hub_download;\
files = ['config.json',\
 'models/Id_Classifier.pt',\
 'models/Aadhaar_Card.pt',\
 'models/Pan_Card.pt',\
 'models/Driving_License.pt',\
 'models/Passport.pt',\
 'models/Voter_Id.pt'];\
[hf_hub_download('logasanjeev/indian-id-validator', f) for f in files]"

# Pre-warm PaddleOCR — instantiating it once triggers download of the PP-OCRv4
# detector + recognizer + classifier weights (~60MB) into ~/.paddleocr.
RUN python -c "from paddleocr import PaddleOCR; PaddleOCR(use_angle_cls=True, lang='en', show_log=False)"

# App source.
COPY --chown=user:user detection-service/ ./detection-service/
WORKDIR /home/user/app/detection-service

# Runtime env. HF Spaces injects PORT=7860; main.py reads it.
ENV HOST=0.0.0.0 \
    PORT=7860 \
    HF_HUB_OFFLINE=1

EXPOSE 7860

CMD ["python", "main.py"]
