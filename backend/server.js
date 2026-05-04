require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");

const extractRoute = require("./routes/extract");
const healthRoute = require("./routes/health");

const PORT = parseInt(process.env.PORT || "3011", 10);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_MB = parseInt(process.env.MAX_IMAGE_SIZE_MB || "10", 10);

// CORS_ORIGIN can be a comma-separated list of allowed origins; falls back to
// the local Vite dev server. In production set it to the deployed frontend URL.
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "http://localhost:5176")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(cors({ origin: CORS_ORIGINS.length === 1 ? CORS_ORIGINS[0] : CORS_ORIGINS }));
app.use(express.json({ limit: "12mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(Object.assign(new Error("unsupported image type"), { code: "INVALID_DOCUMENT" }));
  },
});

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
});

app.use("/api", healthRoute);
app.use("/api", upload.single("document"), extractRoute);

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ success: false, error: `image too large (max ${MAX_MB}MB)`, code: "INVALID_DOCUMENT" });
  }
  if (err.code === "INVALID_DOCUMENT") {
    return res.status(400).json({ success: false, error: err.message, code: "INVALID_DOCUMENT" });
  }
  console.error("[ERROR]", err);
  res.status(500).json({ success: false, error: err.message || "internal error", code: "INTERNAL" });
});

app.listen(PORT, HOST, () => {
  console.log(`Backend listening on http://${HOST}:${PORT}`);
  console.log(`  Detection service: ${process.env.DETECTION_URL || "http://localhost:8005"}`);
  console.log(`  CORS origins: ${CORS_ORIGINS.join(", ")}`);
});
