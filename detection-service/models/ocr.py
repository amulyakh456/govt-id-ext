"""Shared PaddleOCR instance for reading text from cropped detection regions."""
import logging
import cv2
import numpy as np
from PIL import Image
from paddleocr import PaddleOCR

logging.getLogger("ppocr").setLevel(logging.WARNING)
logging.getLogger("paddle").setLevel(logging.WARNING)

_ocr = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)


def _enhance_for_ocr(bgr: np.ndarray, scale: int = 2) -> np.ndarray:
    """Upscale + sharpen + denoise + CLAHE — same chain as the upstream
    logasanjeev/indian-id-validator inference.py. Empirically gives ~30%+
    higher OCR recall on small ID-card field crops."""
    if bgr.size == 0:
        return bgr
    if scale > 1:
        bgr = cv2.resize(
            bgr,
            (bgr.shape[1] * scale, bgr.shape[0] * scale),
            interpolation=cv2.INTER_CUBIC,
        )
    sharp_kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
    bgr = cv2.filter2D(bgr, -1, sharp_kernel)
    bgr = cv2.fastNlMeansDenoisingColored(bgr, None, 10, 10, 7, 21)
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(l)
    return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)


def _center_on_canvas(crop_bgr: np.ndarray, canvas_h: int, canvas_w: int) -> np.ndarray:
    """Drop the (already-enhanced) crop into the centre of a same-sized black
    canvas. PaddleOCR's detector has been trained on full-page layouts; tiny
    isolated crops can confuse the layout step. Padding mimics that context."""
    h, w = crop_bgr.shape[:2]
    if h > canvas_h or w > canvas_w:
        ratio = min(canvas_h / h, canvas_w / w)
        crop_bgr = cv2.resize(crop_bgr, (max(1, int(w * ratio)), max(1, int(h * ratio))))
        h, w = crop_bgr.shape[:2]
    canvas = np.zeros((canvas_h, canvas_w, 3), dtype=np.uint8)
    top = max(0, (canvas_h - h) // 2)
    left = max(0, (canvas_w - w) // 2)
    canvas[top:top + h, left:left + w] = crop_bgr
    return canvas


def run_ocr_on_region(image_or_array, min_conf: float = 0.4, enhance: bool = False,
                      canvas_size=None) -> str:
    """Run OCR on a cropped image region and return concatenated text.

    For very small crops (single field on an ID), upsample slightly so PaddleOCR
    has enough pixels to recognise small/stylised characters.

    enhance=True applies the upstream model's full preprocessing pipeline.
    canvas_size=(h, w) drops the enhanced crop onto a black canvas of that
    size — mimicking the upstream inference path that produces best results.
    """
    if isinstance(image_or_array, Image.Image):
        img = image_or_array
        if img.size[0] < 200 or img.size[1] < 50:
            scale = max(2, 200 // max(1, img.size[0]))
            img = img.resize((img.size[0] * scale, img.size[1] * scale))
        rgb = np.array(img.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    else:
        # Assume numpy array is already BGR
        bgr = image_or_array

    if enhance:
        bgr = _enhance_for_ocr(bgr)
    if canvas_size is not None:
        bgr = _center_on_canvas(bgr, canvas_size[0], canvas_size[1])

    result = _ocr.ocr(bgr, cls=True)
    if not result or not result[0]:
        return ""

    # PaddleOCR returns one entry per detected text line:
    #   line = (bbox_as_4_corners, (text, conf)).
    # A field crop typically contains the *value* (the data we want) and a
    # smaller adjacent *label* (e.g. Hindi नाम, English "Name", "Father's
    # Name"). The label's bbox is much smaller than the value's. Rather than
    # concatenating all recognised text and trying to clean it downstream, we
    # filter here by relative bbox size: keep only lines whose bbox area is
    # within a factor of the dominant line. This drops "OWON/EIE", "aTA",
    # "/Name" etc. without any pattern-matching against specific OCR garbage.
    lines = []
    for line in result[0]:
        text, conf = line[1]
        if conf < min_conf:
            continue
        bbox = line[0]
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        area = (max(xs) - min(xs)) * (max(ys) - min(ys))
        # cy used as a stable read-order key when areas are similar (top→bottom).
        cy = (min(ys) + max(ys)) / 2.0
        lines.append({"text": text, "conf": conf, "area": area, "cy": cy})

    if not lines:
        return ""

    max_area = max(l["area"] for l in lines)
    # Tunable: 0.35 keeps multi-line addresses (where line areas vary by
    # roughly font-height ratios) while excluding tiny adjacent labels which
    # are typically <20% of the value's height.
    AREA_KEEP_RATIO = 0.35
    kept = [l for l in lines if l["area"] >= max_area * AREA_KEEP_RATIO]
    kept.sort(key=lambda l: l["cy"])
    return " ".join(l["text"] for l in kept).strip()
