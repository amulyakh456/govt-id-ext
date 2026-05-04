"""Helpers shared by the three model wrappers."""
import base64
import io
from typing import List, Dict, Any

import numpy as np
from PIL import Image


def list_repo_pt_files(repo_id: str) -> List[str]:
    """Return all .pt files in a HuggingFace repo so we can probe filenames."""
    from huggingface_hub import list_repo_files
    try:
        files = list_repo_files(repo_id)
        return [f for f in files if f.endswith(".pt") or f.endswith(".bin")]
    except Exception as e:
        print(f"  could not list files in {repo_id}: {e}")
        return []


def download_first_match(repo_id: str, candidates: List[str]) -> str:
    """Try a list of candidate filenames; return the local path to the first that downloads.

    If none match, raises with the repo's available files so the operator can update CANDIDATES.
    No silent fallback — quietly loading the wrong weights is worse than a hard failure.
    """
    from huggingface_hub import hf_hub_download
    for name in candidates:
        try:
            path = hf_hub_download(repo_id=repo_id, filename=name)
            print(f"  loaded {repo_id}:{name}")
            return path
        except Exception:
            continue
    available = list_repo_pt_files(repo_id)
    raise FileNotFoundError(
        f"None of the candidates {candidates} exist in {repo_id}. "
        f"Available .pt/.bin files: {available}. Update the CANDIDATES list with the right path."
    )


def image_to_base64(image: Image.Image) -> str:
    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def draw_bboxes(image: Image.Image, detections: List[Dict[str, Any]]) -> Image.Image:
    """Draw bounding boxes + labels on the image using supervision."""
    import supervision as sv
    arr = np.array(image.convert("RGB"))
    if not detections:
        return Image.fromarray(arr)

    xyxy = np.array([d["bbox"] for d in detections], dtype=np.float32)
    confidences = np.array([d.get("confidence", 0.0) for d in detections], dtype=np.float32)
    class_ids = np.arange(len(detections))

    sv_dets = sv.Detections(xyxy=xyxy, confidence=confidences, class_id=class_ids)
    box_annotator = sv.BoxAnnotator()
    label_annotator = sv.LabelAnnotator()

    labels = [f"{d['label']} {d.get('confidence', 0):.2f}" for d in detections]
    annotated = box_annotator.annotate(scene=arr.copy(), detections=sv_dets)
    annotated = label_annotator.annotate(scene=annotated, detections=sv_dets, labels=labels)
    return Image.fromarray(annotated)
