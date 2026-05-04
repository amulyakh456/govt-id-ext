export default function ModelsTab({ health }) {
  const m = health?.models?.c;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Backend extraction is exposed at{" "}
        <code className="text-xs bg-slate-100 px-1 rounded">/api/extract</code>.
      </p>

      {!m && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-md p-3">
          Health endpoint returned no model info. Is the backend up?
        </div>
      )}

      {m && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2">
          <h3 className="font-semibold text-slate-900">{m.name}</h3>
          <div className="text-sm text-slate-700 space-y-1">
            <div>
              <span className="text-slate-500">Repository: </span>
              <a href={m.repo_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">{m.repo}</a>
            </div>
            <div><span className="text-slate-500">Architecture: </span>{m.architecture}</div>
            <div>
              <span className="text-slate-500">Supports: </span>
              {m.supports.map((s) => (
                <span key={s} className="inline-block bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded mr-1">{s}</span>
              ))}
            </div>
            <div>
              <span className="text-slate-500">Detects: </span>
              {Array.isArray(m.detects)
                ? m.detects.join(", ")
                : <span className="italic text-slate-500">{m.detects}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
