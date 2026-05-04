const express = require("express");
const { callDetector } = require("../services/detection-client");
const { applyValidation } = require("../services/validator");
const { normalizeFields } = require("../services/normalizer");
const { SCHEMAS } = require("../services/schemas");

const router = express.Router();

router.post("/extract", async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, error: "no document uploaded", code: "NO_DOCUMENT" });

  // Only the unified Model C pipeline is supported now. Field kept for
  // back-compat with older frontends, but anything other than 'c' is rejected.
  const modelId = String(req.body?.model || "c").toLowerCase();
  const docType = String(req.body?.type || "").toLowerCase();

  if (modelId !== "c") {
    return res.status(400).json({ success: false, error: "only model 'c' is supported", code: "INVALID_MODEL" });
  }
  const schema = SCHEMAS[docType];
  if (!schema) {
    return res.status(400).json({ success: false, error: `unknown document type: ${docType}`, code: "INVALID_TYPE" });
  }

  try {
    const detection = await callDetector(
      modelId,
      req.file.buffer,
      req.file.mimetype,
      docType
    );

    const normalized = normalizeFields(detection.fields || {});
    const validated = applyValidation(normalized, schema);

    return res.json({
      success: true,
      model: detection.model,
      model_id: detection.model_id || modelId,
      document_type: detection.document_type || docType,
      fields: validated,
      raw_detections: detection.raw_detections,
      annotated_image_b64: detection.annotated_image_b64,
      elapsedMs: detection.elapsedMs,
    });
  } catch (err) {
    const status = err.code === "DETECTION_UNREACHABLE" ? 503 : 500;
    console.error(`[EXTRACT] ${err.code || "FAILED"}: ${err.message}`);
    return res.status(status).json({ success: false, error: err.message, code: err.code || "EXTRACTION_FAILED" });
  }
});

module.exports = router;
