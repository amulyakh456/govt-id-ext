import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play } from "lucide-react";
import DocumentTypePicker from "./DocumentTypePicker.jsx";
import UploadZone from "./UploadZone.jsx";
import ResultsTable from "./ResultsTable.jsx";
import DetectionVisualization from "./DetectionVisualization.jsx";
import { extractDocument } from "../lib/api.js";

const MODEL_LABEL = "Unified pipeline (logasanjeev)";

export default function ExtractTab({ health }) {
  const [docType, setDocType] = useState("aadhaar");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const intervalRef = useRef(null);

  const startTimer = () => {
    const start = Date.now();
    setElapsedMs(0);
    intervalRef.current = setInterval(() => setElapsedMs(Date.now() - start), 100);
  };
  const stopTimer = () => { if (intervalRef.current) clearInterval(intervalRef.current); intervalRef.current = null; };
  useEffect(() => () => stopTimer(), []);

  const onRun = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    startTimer();
    try {
      const res = await extractDocument({ file, model: "c", type: docType });
      setResult(res);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "extract failed");
    } finally {
      stopTimer();
      setBusy(false);
    }
  };

  const schemaFields = useMemo(() => health?.schemas?.[docType]?.fields || [], [health, docType]);

  return (
    <div className="space-y-4">
      <DocumentTypePicker value={docType} onChange={setDocType} />

      <UploadZone file={file} onFile={setFile} />

      <button
        onClick={onRun}
        disabled={!file || busy}
        className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
        {busy ? "Running..." : "Extract"}
      </button>

      {busy && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 text-sm text-slate-700 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <span>Detection + OCR · elapsed {(elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg p-3">{error}</div>
      )}

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4">
          <ResultsTable result={result} schemaFields={schemaFields} />
          <DetectionVisualization annotatedB64={result.annotated_image_b64} label={`${MODEL_LABEL} — annotated`} />
        </div>
      )}
    </div>
  );
}
