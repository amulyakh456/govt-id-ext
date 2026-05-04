const express = require("express");
const { checkDetectionHealth } = require("../services/detection-client");
const { SCHEMAS, MODEL_INFO } = require("../services/schemas");

const router = express.Router();

router.get("/health", async (req, res) => {
  const detection = await checkDetectionHealth();
  res.json({
    ok: true,
    detection_reachable: detection.reachable,
    detection_models: detection.models || {},
    model_c_supported_types: detection.model_c_supported_types || [],
    schemas: Object.fromEntries(
      Object.entries(SCHEMAS).map(([k, v]) => [k, { label: v.label, supported_by: v.supported_by, fields: v.fields }])
    ),
    models: MODEL_INFO,
  });
});

module.exports = router;
