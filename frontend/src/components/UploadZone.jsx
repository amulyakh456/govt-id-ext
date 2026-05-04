import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";

export default function UploadZone({ file, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = (files) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      alert("File too large (max 10MB)");
      return;
    }
    onFile(f);
  };

  const previewUrl = file ? URL.createObjectURL(file) : null;

  return (
    <div>
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-slate-500 bg-slate-50" : "border-slate-300 bg-white hover:border-slate-400"
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
      >
        <Upload className="mx-auto text-slate-400 mb-2" size={32} />
        <div className="text-sm text-slate-700 font-medium">{file ? file.name : "Drag an ID image here"}</div>
        <div className="text-xs text-slate-500 mt-1">
          {file ? `${(file.size / 1024).toFixed(0)} KB` : "or click to browse · JPG / PNG / WebP / HEIC · max 10MB"}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {file && (
        <div className="mt-3 flex items-start gap-3 bg-white border border-slate-200 rounded-lg p-3">
          <img src={previewUrl} alt="preview" className="w-20 h-20 object-cover rounded border border-slate-200" />
          <div className="flex-1 text-sm">
            <div className="font-medium text-slate-900">{file.name}</div>
            <div className="text-slate-500 text-xs">{(file.size / 1024).toFixed(0)} KB · {file.type}</div>
          </div>
          <button onClick={() => onFile(null)} className="text-slate-400 hover:text-slate-600" aria-label="remove">
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
