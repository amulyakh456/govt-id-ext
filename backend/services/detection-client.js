const axios = require("axios");
const FormData = require("form-data");

class DetectionUnreachableError extends Error {
  constructor(msg) { super(msg); this.code = "DETECTION_UNREACHABLE"; }
}
class DetectionFailedError extends Error {
  constructor(msg, code = "DETECTION_FAILED") { super(msg); this.code = code; }
}

const DETECTION_URL = () => process.env.DETECTION_URL || "http://localhost:8005";
const TIMEOUT = () => parseInt(process.env.DETECTION_TIMEOUT_MS || "60000", 10);

async function callDetector(modelId, imageBuffer, mimeType, documentType = null) {
  const fd = new FormData();
  fd.append("file", imageBuffer, { filename: "id.jpg", contentType: mimeType });
  if (documentType) fd.append("document_type", documentType);

  try {
    const response = await axios.post(
      `${DETECTION_URL()}/detect/${modelId}`,
      fd,
      {
        headers: fd.getHeaders(),
        timeout: TIMEOUT(),
        maxContentLength: 50 * 1024 * 1024,
        maxBodyLength: 50 * 1024 * 1024,
      }
    );
    return response.data;
  } catch (err) {
    if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
      throw new DetectionUnreachableError(
        "Python detection-service not reachable. Start with: cd detection-service && bash start.sh"
      );
    }
    const status = err.response?.status;
    const detail = err.response?.data?.detail || err.message;
    throw new DetectionFailedError(`detect/${modelId} failed (${status || "?"}): ${detail}`);
  }
}

async function classifyDocument(imageBuffer, mimeType) {
  const fd = new FormData();
  fd.append("file", imageBuffer, { filename: "id.jpg", contentType: mimeType });
  try {
    const response = await axios.post(
      `${DETECTION_URL()}/classify`,
      fd,
      { headers: fd.getHeaders(), timeout: 10000 }
    );
    return response.data;
  } catch (err) {
    if (err.code === "ECONNREFUSED") throw new DetectionUnreachableError("Detection service down");
    throw new DetectionFailedError(`classify failed: ${err.message}`);
  }
}

async function checkDetectionHealth() {
  try {
    const res = await axios.get(`${DETECTION_URL()}/health`, { timeout: 2000 });
    return { reachable: true, ...(res.data || {}) };
  } catch {
    return { reachable: false };
  }
}

module.exports = {
  callDetector,
  classifyDocument,
  checkDetectionHealth,
  DetectionUnreachableError,
  DetectionFailedError,
};
