"""Model C: logasanjeev/indian-id-validator — unified classifier + per-type detectors + PaddleOCR."""
import json
from typing import Dict, List, Optional

import cv2
import numpy as np
from PIL import Image
from ultralytics import YOLO
from huggingface_hub import hf_hub_download

from .ocr import run_ocr_on_region
from ._common import download_first_match, list_repo_pt_files, draw_bboxes, image_to_base64


REPO_ID = "logasanjeev/indian-id-validator"

# Maps doc_type -> the key in config.json["models"] (which holds the authoritative
# class-name list). Needed because some detectors (notably Pan_Card) ship class
# names like "0","1","2","3","4" inside the .pt file, so we can't trust
# YOLO.names — only the config-supplied list.
DOC_TYPE_TO_CONFIG_KEY = {
    "aadhaar":  "Aadhaar",
    "pan":      "Pan_Card",
    "passport": "Passport",
    "dl":       "Driving_License",
    "voter_id": "Voter_Id",
}

# Maps each public doc-type to the classifier's class names that should match.
# (Classifier classes: aadhar_back, aadhar_front, driving_license_back,
#  driving_license_front, pan_card_front, passport, voter_id.)
DOC_TYPE_TO_CLASSIFIER_CLASSES = {
    "aadhaar":  {"aadhar_front", "aadhar_back"},
    "pan":      {"pan_card_front"},
    "passport": {"passport"},
    "dl":       {"driving_license_front", "driving_license_back"},
    "voter_id": {"voter_id"},
}

# Actual filenames in the logasanjeev/indian-id-validator repo (confirmed from list_repo_files):
#   models/Id_Classifier.pt, models/Aadhaar_Card.pt, models/Pan_Card.pt,
#   models/Passport.pt, models/Driving_License.pt, models/Voter_Id.pt
CLASSIFIER_CANDIDATES = ["models/Id_Classifier.pt", "Id_Classifier.pt"]

DETECTOR_CANDIDATES: Dict[str, list] = {
    "aadhaar":  ["models/Aadhaar_Card.pt",      "Aadhaar_Card.pt"],
    "pan":      ["models/Pan_Card.pt",          "Pan_Card.pt"],
    "passport": ["models/Passport.pt",          "Passport.pt"],
    "dl":       ["models/Driving_License.pt",   "Driving_License.pt"],
    "voter_id": ["models/Voter_Id.pt",          "Voter_Id.pt"],
}

LABEL_NORMALIZE = {
    # Generic
    "name": "full_name", "person_name": "full_name",
    "father": "father_name",
    "father_name": "father_name", "fathers_name": "father_name",
    "husband": "husband_name",
    "husband_name": "husband_name", "husbands_name": "husband_name",
    "spouse_name": "husband_name",
    "guardian_name": "father_name", "guardian": "father_name",
    "relation_with": "father_name",  # DL detector class name
    "s_o": "father_name", "s/o": "father_name",
    "w_o": "husband_name", "w/o": "husband_name",
    "dob": "dob", "date_of_birth": "dob",
    "date": "dob",  # Voter_Id detector emits bare "date" for DOB
    "gender": "gender", "sex": "gender",
    "address": "address", "add": "address",  # DL detector uses "add"
    "aadhaar_number": "aadhaar_number", "aadhar_number": "aadhaar_number",
    "pan_number": "pan_number",
    "passport_number": "passport_number", "code": "passport_number",
    "given_names": "given_names",
    "surname": "surname",
    "place_of_birth": "place_of_birth", "pob": "place_of_birth",
    "date_of_issue": "date_of_issue", "issue_date": "date_of_issue",
    "doi": "date_of_issue",
    "date_of_expiry": "date_of_expiry", "validity_date": "date_of_expiry",
    "exp": "date_of_expiry",
    "place_of_issue": "place_of_issue", "poi": "place_of_issue",
    "dl_number": "dl_number", "dl_no": "dl_number",
    "blood_group": "blood_group",
    "voter_id_number": "voter_id_number", "epic_number": "voter_id_number",
    "voter_id": "voter_id_number",  # Voter_Id detector emits "voter_id" for the EPIC number
    "aadhaar": "aadhaar_number", "aadhar": "aadhaar_number",  # bare class names
    "pan": "pan_number",

    # logasanjeev's actual class names — these are emitted by the type-specific detectors
    # Aadhaar
    "aadhaar_name": "full_name", "aadhar_name": "full_name",
    "aadhaar_dob": "dob", "aadhar_dob": "dob",
    "aadhaar_gender": "gender", "aadhar_gender": "gender",
    "aadhaar_address": "address", "aadhar_address": "address",
    "aadhaar_father_name": "father_name", "aadhaar_husband_name": "husband_name",
    "aadhaar_guardian_name": "father_name",
    # PAN
    "pan_name": "full_name", "pan_card_name": "full_name",
    "pan_father_name": "father_name", "pan_fathers_name": "father_name",
    "pan_dob": "dob", "pan_card_dob": "dob",
    "pan_card_number": "pan_number",
    # Passport
    "passport_name": "full_name", "passport_given_names": "given_names",
    "passport_surname": "surname", "passport_dob": "dob",
    "passport_gender": "gender", "passport_place_of_birth": "place_of_birth",
    "passport_date_of_issue": "date_of_issue",
    "passport_date_of_expiry": "date_of_expiry",
    "passport_place_of_issue": "place_of_issue",
    # DL
    "dl_name": "full_name", "dl_dob": "dob", "dl_address": "address",
    "dl_blood_group": "blood_group",
    "dl_date_of_issue": "date_of_issue", "dl_validity": "date_of_expiry",
    "dl_date_of_expiry": "date_of_expiry",
    "driving_license_name": "full_name", "driving_license_dob": "dob",
    "driving_license_address": "address",
    # Voter ID
    "voter_name": "full_name", "voter_father_name": "father_name",
    "voter_husband_name": "husband_name",
    "voter_dob": "dob", "voter_gender": "gender", "voter_address": "address",
    "voter_id_no": "voter_id_number",
    "voter_card_number": "voter_id_number",
}

# Detector classes that are not text fields (whole-card outlines, photos, emblems,
# layout markers). These are useful for visualisation but should not be written
# into the extracted fields output. Names listed here are matched after
# _canonicalize() — so list the underscored / lowercased form.
IGNORED_LABELS = {
    "portrait", "photo", "signature", "sign",
    "point", "symbol", "election", "idcard", "id_card",
    "age", "age_as_on",  # voter cards: age numerals, not part of the schema
    "rto", "state", "vehicle_type",  # DL: not in schema
    "nation", "nationality",  # passport: not in schema
    "mrz1", "mrz2",  # passport machine-readable zone, not user-facing
    # Whole-card outlines emitted by per-type detectors. The raw classes have
    # both "card_voterid_1_front" (.pt-embedded) and "card_voter_id_1_front"
    # (config.json) variants — list both.
    "card_voterid_1_front", "card_voterid_1_back",
    "card_voterid_2_front", "card_voterid_2_back",
    "card_voterid_3_front", "card_voterid_3_back",
    "card_voter_id_1_front", "card_voter_id_1_back",
    "card_voter_id_2_front", "card_voter_id_2_back",
    "card_voter_id_3_front", "card_voter_id_3_back",
    "pan_card",   # PAN detector's whole-card class
    "aadhaar",    # Aadhaar detector's whole-card class (no, this is the number — see below)
}
# Note: "aadhaar" alone is the Aadhaar number class (config: "Aadhaar" -> emit "aadhaar"),
# so don't ignore it. Remove the accidental entry above.
IGNORED_LABELS.discard("aadhaar")


def _canonicalize(label: str) -> str:
    """Lowercase a class name, drop apostrophes, then replace whitespace and
    other separators with underscores. Apostrophes are *removed* (not replaced)
    so 'Father's Name' canonicalises to 'fathers_name' rather than
    'father_s_name', matching the LABEL_NORMALIZE keys."""
    lo = label.lower().strip()
    for ch in ("'", "’", "`"):
        lo = lo.replace(ch, "")
    for ch in (" ", "-", "/", "."):
        lo = lo.replace(ch, "_")
    while "__" in lo:
        lo = lo.replace("__", "_")
    return lo.strip("_")


def _normalize_label(label: str) -> str:
    if label in LABEL_NORMALIZE:
        return LABEL_NORMALIZE[label]
    canon = _canonicalize(label)
    return LABEL_NORMALIZE.get(canon, canon)


class ModelCUnified:
    def __init__(self):
        # Discover what files are actually in the repo so we can be flexible with naming.
        repo_files = list_repo_pt_files(REPO_ID)
        if repo_files:
            print(f"  files in {REPO_ID}: {repo_files}")

        # Load the config so we know the authoritative class-name list per detector.
        # Fixes Pan_Card whose .pt embeds names "0".."4" rather than the real labels.
        try:
            config_path = hf_hub_download(repo_id=REPO_ID, filename="config.json")
            with open(config_path) as f:
                self._config = json.load(f)
        except Exception as e:
            print(f"  could not load config.json from {REPO_ID}: {e}")
            self._config = {"models": {}}

        self.classifier = YOLO(download_first_match(REPO_ID, CLASSIFIER_CANDIDATES))

        self.detectors: Dict[str, YOLO] = {}
        for doc_type, candidates in DETECTOR_CANDIDATES.items():
            try:
                path = download_first_match(REPO_ID, candidates)
                self.detectors[doc_type] = YOLO(path)
            except Exception as e:
                print(f"  could not load detector for {doc_type}: {e}")
        self._loaded = True

    def _class_names_for(self, doc_type: str, fallback: Dict[int, str]) -> Dict[int, str]:
        """Return {class_id -> name} for a detector. Prefers config.json's class
        list (authoritative); only falls back to the YOLO-embedded names if the
        config doesn't cover this doc_type."""
        cfg_key = DOC_TYPE_TO_CONFIG_KEY.get(doc_type)
        cfg_classes: Optional[List[str]] = None
        if cfg_key:
            cfg_classes = self._config.get("models", {}).get(cfg_key, {}).get("classes")
        if cfg_classes:
            return {i: name for i, name in enumerate(cfg_classes)}
        return dict(fallback)

    def is_loaded(self):
        return self._loaded and bool(self.detectors)

    def supported_types(self):
        return list(self.detectors.keys())

    def classify(self, image: Image.Image):
        results = self.classifier(image, verbose=False)
        result = results[0]
        if result.probs is None:
            return {"predicted_type": None, "confidence": 0.0, "all_scores": {}}
        top = int(result.probs.top1)
        conf = float(result.probs.top1conf)
        names = result.names
        all_scores = {names[i]: float(p) for i, p in enumerate(result.probs.data.tolist())}
        return {
            "predicted_type": names.get(top, str(top)),
            "confidence": conf,
            "all_scores": all_scores,
        }

    def _rotation_score(self, result, doc_type: str, image_area: int) -> tuple:
        """Return (good_box_count, sum_confidence) — a tuple sorted as a
        compound key. We count detections that look like real fields:
          - the class is not in IGNORED_LABELS (skip portraits, card outlines,
            symbols, etc.),
          - confidence ≥ 0.5,
          - bbox area < 30% of the image (a properly-rotated card has tight
            field bboxes; sideways cards produce one huge sweep covering
            most of the card, which we want to discount).
        Tie on count? Higher confidence sum wins."""
        class_names = self._class_names_for(doc_type, result.names)
        good_count = 0
        sum_conf = 0.0
        for box in result.boxes:
            cls_id = int(box.cls[0])
            label = class_names.get(cls_id, f"class_{cls_id}")
            if _canonicalize(label) in IGNORED_LABELS:
                continue
            confidence = float(box.conf[0])
            if confidence < 0.5:
                continue
            x0, y0, x1, y1 = [float(v) for v in box.xyxy[0].tolist()]
            area_frac = max(0.0, (x1 - x0) * (y1 - y0)) / max(1, image_area)
            if area_frac > 0.30:
                continue
            good_count += 1
            sum_conf += confidence
        return (good_count, sum_conf)

    def _detect_with_auto_rotation(self, image: Image.Image, document_type: str,
                                   conf: float):
        """Run the per-type detector at 0° first; only try the other three
        orientations if 0° doesn't already look upright. Then bias the choice
        toward 0° — only flip if a rotation is meaningfully better, since
        the YOLO detectors for some doc types (notably PAN) are partly
        rotation-invariant and will fire confident boxes at 180° too. Without
        this bias the user sees their already-upright card flipped to 180°
        in the annotation, which is confusing even though the OCR values
        come back correct (PaddleOCR auto-rotates text per line)."""
        detector = self.detectors[document_type]
        w, h = image.size
        img_area = w * h

        def _run(img):
            return detector(img, conf=conf, verbose=False)[0]

        result0 = _run(image)
        score0 = self._rotation_score(result0, document_type, img_area)

        # Fast path: 0° already looks upright. Most clean phone photos hit
        # this, and we save 3 detector passes (~600ms).
        if score0[0] >= 4:
            print(
                f"  [model_c/{document_type}] auto-rotation 0={score0[0]}b/{score0[1]:.2f}c "
                f"(good enough, skipping rotations)",
                flush=True,
            )
            return image, result0

        # Need to consider rotations.
        scored = [(0, image, result0, score0)]
        for deg in (90, 180, 270):
            rotated = image.rotate(deg, expand=True)
            r = _run(rotated)
            scored.append((deg, rotated, r, self._rotation_score(r, document_type, img_area)))

        # Bias toward keeping the original orientation: a rotation only wins
        # if it strictly beats 0° in good-box count, OR matches the count but
        # has at least 0.5 more confidence summed. Tie/close → keep deg 0.
        def beats_zero(deg, score):
            if deg == 0:
                return False
            cnt, conf_sum = score
            cnt0, conf0 = score0
            if cnt > cnt0:
                return True
            if cnt == cnt0 and conf_sum >= conf0 + 0.5:
                return True
            return False

        contenders = [s for s in scored if beats_zero(s[0], s[3])]
        if contenders:
            best_deg, best_image, best_result, best_score = max(contenders, key=lambda x: x[3])
        else:
            best_deg, best_image, best_result, best_score = scored[0]

        print(
            "  [model_c/{}] auto-rotation good_boxes,conf: {} -> picked={}deg".format(
                document_type,
                ", ".join(f"{d}={s[0]}b/{s[1]:.2f}c" for d, _, _, s in scored),
                best_deg,
            ),
            flush=True,
        )
        return best_image, best_result

    def _apply_layout_corrections(self, document_type: str, best_per_class: Dict[int, Dict]):
        """Fix systematic mislabels by the upstream detectors using spatial
        rules from the standardised Indian document layouts.

        Currently handles:

        - Driving Licence "name" mislabel. Indian DL layout (Form 7) places
          the holder's NAME in the top zone next to DL No / DOB / VALID
          TILL — all on the same horizontal band. The S/O block sits in the
          bottom half of the card, just above ADDRESS. The upstream
          Driving_License.pt detector sometimes tags the S/O text as "name"
          while missing the real top-zone name. We use DL No (or DOB) as
          a top-zone anchor: if a "name" detection's centre y is more than
          ~4 anchor-heights below the anchor, it's in the bottom S/O zone
          and is relabeled as `relation_with` (which maps to father_name)."""

        if document_type != "dl":
            return

        by_canon = {_canonicalize(e["label"]): e for e in best_per_class.values()}
        name_e = by_canon.get("name")
        top_e = by_canon.get("dl_no") or by_canon.get("dob")
        addr_e = by_canon.get("address") or by_canon.get("add")
        # Need a top anchor + an address anchor to triangulate. If either is
        # missing we can't tell which zone Name is in, so leave it alone.
        if name_e is None or top_e is None or addr_e is None:
            return

        cy = lambda b: (b[1] + b[3]) / 2.0
        name_y = cy(name_e["bbox"])
        top_y = cy(top_e["bbox"])
        addr_y = cy(addr_e["bbox"])

        # Real top-zone NAME sits much closer to DL No than to the address.
        # If Name is closer to address than to DL No, it's in the S/O block.
        if abs(name_y - addr_y) < abs(name_y - top_y):
            print(
                f"  [model_c/dl] layout fix: 'name' (y={name_y:.0f}) is closer "
                f"to address (y={addr_y:.0f}) than to {top_e['label']} "
                f"(y={top_y:.0f}); relabeling as 'relation_with' (father).",
                flush=True,
            )
            # 'relation_with' is in LABEL_NORMALIZE -> 'father_name'.
            name_e["label"] = "relation_with"

    def extract(self, image: Image.Image, document_type: str, conf: float = 0.25):
        if document_type not in self.detectors:
            raise ValueError(
                f"Unsupported document type for unified model: {document_type}. "
                f"Available: {list(self.detectors.keys())}"
            )

        image, result = self._detect_with_auto_rotation(image, document_type, conf)
        class_names = self._class_names_for(document_type, result.names)

        # Step 1 — pick the highest-conf box per class id (mirrors upstream
        # inference.py). Without this, two boxes for the same class can both
        # write to extracted[] and the lower-conf one may win the OCR battle.
        best_per_class: Dict[int, Dict] = {}
        for box in result.boxes:
            cls_id = int(box.cls[0])
            confidence = float(box.conf[0])
            xyxy = [float(v) for v in box.xyxy[0].tolist()]
            existing = best_per_class.get(cls_id)
            if existing is None or existing["confidence"] < confidence:
                best_per_class[cls_id] = {
                    "cls_id": cls_id,
                    "label": class_names.get(cls_id, f"class_{cls_id}"),
                    "confidence": confidence,
                    "bbox": xyxy,
                }

        # Step 1b — doc-type-specific layout fix-ups. The upstream YOLO
        # detectors occasionally label the wrong region (e.g. the S/O block on
        # a Driving Licence is sometimes tagged as "name"). Apply spatial rules
        # rooted in the standardised Indian document layout — these are real
        # layout invariants, not OCR-text guesswork.
        self._apply_layout_corrections(document_type, best_per_class)

        # Step 2 — OCR the surviving crops on a centred black canvas the size
        # of the original image (the trick used by the upstream model).
        rgb = np.array(image.convert("RGB"))
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        h, w = bgr.shape[:2]

        detections = []
        extracted = {}

        for entry in best_per_class.values():
            cls_id = entry["cls_id"]
            confidence = entry["confidence"]
            xyxy = entry["bbox"]
            label = entry["label"]
            is_ignored = _canonicalize(label) in IGNORED_LABELS

            text = ""
            if not is_ignored:
                x_min, y_min, x_max, y_max = (max(0, int(xyxy[0])), max(0, int(xyxy[1])),
                                              min(w, int(xyxy[2])), min(h, int(xyxy[3])))
                if x_max > x_min and y_max > y_min:
                    crop = bgr[y_min:y_max, x_min:x_max]
                    text = run_ocr_on_region(crop, enhance=True, canvas_size=(h, w))

            det = {"label": label, "confidence": confidence, "bbox": xyxy, "text": text}
            detections.append(det)

            if is_ignored:
                continue

            field_key = _normalize_label(label)
            if field_key in IGNORED_LABELS:
                continue
            existing = extracted.get(field_key)
            if existing is None or existing["confidence"] < confidence:
                extracted[field_key] = {"value": text, "confidence": confidence}

        print(f"  [model_c/{document_type}] detections: "
              + ", ".join(f"{d['label']}({d['confidence']:.2f})='{d['text']}'" for d in detections),
              flush=True)

        annotated = draw_bboxes(image, detections)
        return {
            "model": REPO_ID,
            "model_id": "c",
            "document_type": document_type,
            "fields": extracted,
            "raw_detections": detections,
            "annotated_image_b64": image_to_base64(annotated),
        }
