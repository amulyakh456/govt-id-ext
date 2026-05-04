import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getHealth } from "../lib/api.js";

export default function HealthBanner({ onHealth }) {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const h = await getHealth();
        if (active) { setHealth(h); setError(null); onHealth?.(h); }
      } catch (err) {
        if (active) setError(err.message || "health check failed");
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { active = false; clearInterval(id); };
  }, [onHealth]);

  if (error) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-800 flex items-center gap-2">
        <AlertTriangle size={16} /> Backend unreachable. Is the Node server on :3011 running?
      </div>
    );
  }
  if (!health) return null;

  if (!health.detection_reachable) {
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-2 text-sm text-red-800 flex items-center gap-2">
        <AlertTriangle size={16} /> Python detection-service on :8005 not reachable. Start with{" "}
        <code className="bg-red-100 px-1 rounded">cd detection-service && bash start.sh</code>
      </div>
    );
  }

  const m = health.detection_models || {};
  if (!m.model_c_unified) {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 text-sm text-amber-800 flex items-center gap-2">
        <AlertTriangle size={16} /> Detection model failed to load — check detection-service logs.
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2 text-sm text-emerald-800 flex items-center gap-2">
      <CheckCircle2 size={16} /> Detector ready · supports: {(health.model_c_supported_types || []).join(", ") || "(none yet)"}
    </div>
  );
}
