export default function DetectionVisualization({ annotatedB64, label }) {
  if (!annotatedB64) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 text-sm font-medium text-slate-700">
        {label || "Detected regions"}
      </div>
      <img
        src={`data:image/jpeg;base64,${annotatedB64}`}
        alt="annotated"
        className="w-full h-auto"
      />
    </div>
  );
}
