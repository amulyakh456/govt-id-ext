import { useState } from "react";
import HealthBanner from "./components/HealthBanner.jsx";
import ExtractTab from "./components/ExtractTab.jsx";
import ModelsTab from "./components/ModelsTab.jsx";

export default function App() {
  const [tab, setTab] = useState("extract");
  const [health, setHealth] = useState(null);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-slate-900">Indian ID Extractor</h1>
          <p className="text-sm text-slate-500">Aadhaar / PAN / DL / Passport / Voter ID — unified pipeline</p>
        </div>
      </header>

      <HealthBanner onHealth={setHealth} />

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-1 border-b border-slate-200 mb-4">
          {[
            { id: "extract", label: "Extract" },
            { id: "models",  label: "Model" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md ${
                tab === t.id
                  ? "bg-white border border-b-white border-slate-200 text-slate-900"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "extract" && <ExtractTab health={health} />}
        {tab === "models"  && <ModelsTab  health={health} />}
      </main>
    </div>
  );
}
