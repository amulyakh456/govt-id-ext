import { useState } from "react";
import { Copy, Eye, EyeOff, AlertCircle, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";

const SENSITIVE_FIELDS = new Set([
  "aadhaar_number", "pan_number", "dl_number", "passport_number", "voter_id_number",
]);

function FieldRow({ fieldKey, value, confidence, valid, validationReason, masked, onToggleMask }) {
  const isSensitive = SENSITIVE_FIELDS.has(fieldKey);
  const isNull = value == null || value === "";
  const display = isNull ? "—" : (isSensitive && masked ? maskValue(value) : String(value));
  const confPct = confidence == null ? null : Math.round(confidence * 100);

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="px-4 py-2 text-slate-500 w-1/3 align-top">
        <div className="flex items-center gap-1">
          {fieldKey.replace(/_/g, " ")}
          {isSensitive && (
            <span title="sensitive — masked by default" className="text-amber-600">
              <AlertCircle size={13} />
            </span>
          )}
        </div>
      </td>
      <td className={`px-4 py-2 ${isNull ? "text-slate-400 italic" : "text-slate-900"} font-mono text-sm break-all`}>
        <div className="flex items-center gap-2">
          <span>{display}</span>
          {isSensitive && !isNull && (
            <button onClick={onToggleMask} className="text-slate-400 hover:text-slate-700" title={masked ? "show" : "hide"}>
              {masked ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          )}
        </div>
        {!isNull && (
          <div className="text-[10px] uppercase tracking-wide flex items-center gap-2 mt-1 not-italic font-sans">
            {confPct != null && (
              <span className={confPct >= 70 ? "text-emerald-700" : confPct >= 40 ? "text-amber-700" : "text-red-700"}>
                conf {confPct}%
              </span>
            )}
            {valid != null && (
              <span className={valid ? "text-emerald-700" : "text-red-700"}>
                {valid ? <CheckCircle2 size={11} className="inline" /> : <AlertCircle size={11} className="inline" />}{" "}
                {valid ? "format ok" : `format: ${validationReason || "invalid"}`}
              </span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function maskValue(v) {
  const s = String(v);
  if (s.length <= 4) return "•".repeat(s.length);
  return "•".repeat(Math.max(0, s.length - 4)) + s.slice(-4);
}

export default function ResultsTable({ result, schemaFields }) {
  const [showRaw, setShowRaw] = useState(false);
  const [maskedFields, setMaskedFields] = useState(() => new Set(SENSITIVE_FIELDS));
  const fields = result?.fields || {};
  const orderedKeys = schemaFields && schemaFields.length
    ? schemaFields
    : Object.keys(fields);

  const toggleMask = (k) => {
    setMaskedFields((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const copyJson = () => {
    const stripped = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, v?.value ?? null])
    );
    navigator.clipboard.writeText(JSON.stringify(stripped, null, 2));
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-xs">{result.model || result.model_id}</span>
          {result.elapsedMs != null && <span className="text-slate-500">{(result.elapsedMs / 1000).toFixed(1)}s</span>}
        </div>
        <button onClick={copyJson} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
          <Copy size={14} /> Copy JSON
        </button>
      </div>

      <table className="w-full text-sm">
        <tbody>
          {orderedKeys.map((k) => {
            const f = fields[k] || {};
            return (
              <FieldRow
                key={k}
                fieldKey={k}
                value={f.value}
                confidence={f.confidence}
                valid={f.valid}
                validationReason={f.validation_reason}
                masked={maskedFields.has(k)}
                onToggleMask={() => toggleMask(k)}
              />
            );
          })}
        </tbody>
      </table>

      {result.raw_detections && (
        <div className="border-t border-slate-200">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1 px-4 py-2 text-xs text-slate-600 hover:text-slate-900 w-full text-left"
          >
            {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            View raw detections ({result.raw_detections.length})
          </button>
          {showRaw && (
            <pre className="px-4 pb-3 text-xs text-slate-700 bg-slate-50 overflow-x-auto whitespace-pre-wrap font-mono">
              {JSON.stringify(result.raw_detections, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
