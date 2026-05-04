import { ChevronDown } from "lucide-react";

const DOC_TYPES = [
  { id: "aadhaar",  label: "Aadhaar Card" },
  { id: "pan",      label: "PAN Card" },
  { id: "dl",       label: "Driving Licence" },
  { id: "passport", label: "Passport" },
  { id: "voter_id", label: "Voter ID Card" },
];

export default function DocumentTypePicker({ value, onChange, restrictTo }) {
  const list = restrictTo ? DOC_TYPES.filter((t) => restrictTo.includes(t.id)) : DOC_TYPES;

  return (
    <div className="space-y-2">
      <label htmlFor="document-type" className="text-sm font-medium text-slate-700 block">
        Document type
      </label>
      <div className="relative">
        <select
          id="document-type"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-md border border-slate-300 bg-white pl-3 pr-10 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-slate-500 cursor-pointer"
        >
          {!value && <option value="" disabled>Select a document type…</option>}
          {list.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        <ChevronDown
          size={16}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        />
      </div>
    </div>
  );
}

export { DOC_TYPES };
