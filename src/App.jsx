import { useEffect, useMemo, useState } from "react";
import { wineHoldings2021 } from "./data/wineHoldings2021";

const STORAGE_KEY_CELLAR = "vino_cellar_data_v1";
const STORAGE_KEY_DRANK = "vino_drank_data_v1";
const STORAGE_KEY_OPENAI = "vino_openai_key_v1";
const APP_VERSION = "6.1";

const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "cellar", label: "Cellar" },
  { id: "drank", label: "Drank" },
  { id: "reference", label: "Reference" },
  { id: "ai", label: "Vino AI" },
];

function uid() {
  return Math.random().toString(36).slice(2, 11);
}

function asNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeWine(row) {
  return {
    id: row.id || `cellar-${row.row_index}-${uid()}`,
    no: row.no || "",
    cons: row.cons || "",
    remaining_num: asNum(row.remaining_num ?? row.remaining ?? 0, 0),
    year_num: asNum(row.year_num ?? row.year, 0),
    varietal: row.varietal || "",
    winery: row.winery || "",
    label: row.label || "",
    region: row.region || "",
    drinking_window_start: row.drinking_window_start || "",
    drinking_window_end: row.drinking_window_end || "",
    drink_start_num: asNum(row.drink_start_num ?? row.drinking_window_start, 0),
    drink_end_num: asNum(row.drink_end_num ?? row.drinking_window_end, 0),
    btl_price: row.btl_price || "",
    price_per_bottle_num: asNum(row.price_per_bottle_num ?? row.price_per_bottle ?? row.btl_price, 0),
    rrp: row.rrp || row.rrp_2 || "",
    rrp_num: asNum(row.rrp_num ?? row.rrp ?? row.rrp_2, 0),
    total_paid_num: asNum(row.total_paid_num ?? row.total_paid ?? row.total_cost, 0),
    total_insurance_num: asNum(row.total_insurance_num ?? row.total_ins_value, 0),
    when_acquired: row.when_acquired || row.p_date || "",
    acquired_date_iso: row.acquired_date_iso || "",
    from: row.from || row.supplier || "",
    where_stored: row.where_stored || "",
    box_no: row.box_no || "",
    halliday: row.halliday || "",
    other_ratings: row.other_ratings || "",
    reviews: row.reviews || "",
    halliday_review: row.halliday_review || "",
    notes: row.notes || "",
    webpage: row.webpage || "",
    raw: row,
  };
}

function normalizeDrank(row) {
  return {
    id: row.id || `arch-${row.row_index}-${uid()}`,
    no: row.no || "",
    year_num: asNum(row.year_num ?? row.year, 0),
    varietal: row.varietal || "",
    winery: row.winery || "",
    label: row.label || "",
    region: row.region || "",
    drink_start_num: asNum(row.drink_start_num ?? row.drinking_window_start, 0),
    drink_end_num: asNum(row.drink_end_num ?? row.drinking_window_end, 0),
    halliday: row.halliday || "",
    other_ratings: row.other_ratings || "",
    reviews: row.reviews || "",
    price_per_bottle_num: asNum(row.price_per_bottle_num ?? row.price_per_bottle, 0),
    total_paid_num: asNum(row.total_paid_num ?? row.total_paid, 0),
    total_insurance_num: asNum(row.total_insurance_num ?? row.total_ins_value, 0),
    when_acquired: row.when_acquired || "",
    from: row.from || "",
    where_stored: row.where_stored || "",
    box_no: row.box_no || "",
    consumed_date: row.consumed_date || "",
    halliday_review: row.halliday_review || "",
    notes: row.notes || "",
    raw: row,
  };
}

function wineName(w) {
  const parts = [w.winery, w.label].filter(Boolean).join(" ").trim();
  if (parts) {
    return `${parts}${w.year_num ? ` ${w.year_num}` : ""}`.trim();
  }
  return [w.varietal || "Wine", w.year_num || ""].join(" ").trim();
}

function readiness(w, yearNow) {
  const start = w.drink_start_num;
  const end = w.drink_end_num;
  if (!start && !end) return { key: "unknown", label: "No window", color: "#6b7280" };
  if (start && yearNow < start) {
    if (start - yearNow <= 1) return { key: "soon", label: "Drink soon", color: "#0f766e" };
    return { key: "early", label: "Too early", color: "#2563eb" };
  }
  if (end && yearNow > end) return { key: "past", label: "Past peak", color: "#b91c1c" };
  return { key: "ready", label: "Ready now", color: "#15803d" };
}

function currency(n) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n || 0);
}

function Metric({ label, value, hint }) {
  return (
    <div className="metric-card">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {hint ? <div className="metric-hint">{hint}</div> : null}
    </div>
  );
}

function WineFormModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial || null);

  useEffect(() => {
    setForm(initial || {
      id: `new-${uid()}`,
      no: "1",
      remaining_num: 1,
      year_num: new Date().getFullYear(),
      varietal: "",
      winery: "",
      label: "",
      region: "",
      drink_start_num: new Date().getFullYear(),
      drink_end_num: new Date().getFullYear() + 8,
      price_per_bottle_num: 0,
      rrp_num: 0,
      total_paid_num: 0,
      total_insurance_num: 0,
      from: "",
      where_stored: "",
      box_no: "",
      halliday: "",
      other_ratings: "",
      reviews: "",
      halliday_review: "",
      notes: "",
      webpage: "",
      when_acquired: "",
      acquired_date_iso: "",
      cons: "",
      raw: {},
    });
  }, [initial, open]);

  if (!open || !form) return null;

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{initial ? "Edit wine" : "Add wine"}</h3>
        <div className="grid two">
          <label>Winery<input value={form.winery} onChange={(e) => set("winery", e.target.value)} /></label>
          <label>Label<input value={form.label} onChange={(e) => set("label", e.target.value)} /></label>
        </div>
        <div className="grid three">
          <label>Year<input type="number" value={form.year_num || ""} onChange={(e) => set("year_num", asNum(e.target.value, 0))} /></label>
          <label>Varietal<input value={form.varietal} onChange={(e) => set("varietal", e.target.value)} /></label>
          <label>Region<input value={form.region} onChange={(e) => set("region", e.target.value)} /></label>
        </div>
        <div className="grid three">
          <label>Remaining bottles<input type="number" value={form.remaining_num || 0} onChange={(e) => set("remaining_num", Math.max(0, asNum(e.target.value, 0)))} /></label>
          <label>Drink from (year)<input type="number" value={form.drink_start_num || ""} onChange={(e) => set("drink_start_num", asNum(e.target.value, 0))} /></label>
          <label>Drink by (year)<input type="number" value={form.drink_end_num || ""} onChange={(e) => set("drink_end_num", asNum(e.target.value, 0))} /></label>
        </div>
        <div className="grid four">
          <label>Price / bottle<input type="number" value={form.price_per_bottle_num || 0} onChange={(e) => set("price_per_bottle_num", asNum(e.target.value, 0))} /></label>
          <label>RRP<input type="number" value={form.rrp_num || 0} onChange={(e) => set("rrp_num", asNum(e.target.value, 0))} /></label>
          <label>Total paid<input type="number" value={form.total_paid_num || 0} onChange={(e) => set("total_paid_num", asNum(e.target.value, 0))} /></label>
          <label>Insurance<input type="number" value={form.total_insurance_num || 0} onChange={(e) => set("total_insurance_num", asNum(e.target.value, 0))} /></label>
        </div>
        <div className="grid three">
          <label>Stored at<input value={form.where_stored} onChange={(e) => set("where_stored", e.target.value)} /></label>
          <label>Box no<input value={form.box_no} onChange={(e) => set("box_no", e.target.value)} /></label>
          <label>From<input value={form.from} onChange={(e) => set("from", e.target.value)} /></label>
        </div>
        <label>Notes<textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></label>
        <div className="actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            onClick={() => {
              if (!form.winery && !form.label && !form.varietal) return;
              onSave(form);
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function RawDetailsModal({ wine, onClose }) {
  if (!wine) return null;
  const rows = Object.entries(wine.raw || {}).filter(([k]) => !["id", "row_index"].includes(k));
  return (
    <div className="modal-wrap" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h3>All source fields: {wineName(wine)}</h3>
        <div className="raw-grid">
          {rows.map(([k, v]) => (
            <div className="raw-item" key={k}>
              <div className="raw-key">{k}</div>
              <div className="raw-val">{String(v || "")}</div>
            </div>
          ))}
        </div>
        <div className="actions">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

async function askOpenAI({ apiKey, prompt, wines }) {
  const context = wines.slice(0, 150).map((w) => ({
    name: wineName(w),
    varietal: w.varietal,
    region: w.region,
    bottles: w.remaining_num,
    drink_from: w.drink_start_num,
    drink_by: w.drink_end_num,
    price: w.price_per_bottle_num,
  }));

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: "You are Vino, an expert wine assistant. Keep answers concise and practical.",
        },
        {
          role: "user",
          content: `Cellar data: ${JSON.stringify(context)}\n\nQuestion: ${prompt}`,
        },
      ],
      max_output_tokens: 700,
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI request failed: ${res.status} ${txt}`);
  }

  const data = await res.json();
  return data.output_text || "No response text returned.";
}

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [cellar, setCellar] = useState([]);
  const [drank, setDrank] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [editingWine, setEditingWine] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [detailWine, setDetailWine] = useState(null);

  const [apiKey, setApiKey] = useState("");
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMessages, setAiMessages] = useState([
    { role: "assistant", text: "Vino AI is now wired for OpenAI. Add your API key below, then ask about pairings or what to drink now." },
  ]);

  const yearNow = new Date().getFullYear();

  useEffect(() => {
    const savedCellar = localStorage.getItem(STORAGE_KEY_CELLAR);
    const savedDrank = localStorage.getItem(STORAGE_KEY_DRANK);
    const savedKey = localStorage.getItem(STORAGE_KEY_OPENAI);

    if (savedCellar) {
      try {
        setCellar(JSON.parse(savedCellar));
      } catch {
        setCellar(wineHoldings2021.cellar.map(normalizeWine));
      }
    } else {
      setCellar(wineHoldings2021.cellar.map(normalizeWine));
    }

    if (savedDrank) {
      try {
        setDrank(JSON.parse(savedDrank));
      } catch {
        setDrank(wineHoldings2021.archived.map(normalizeDrank));
      }
    } else {
      setDrank(wineHoldings2021.archived.map(normalizeDrank));
    }

    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (cellar.length) localStorage.setItem(STORAGE_KEY_CELLAR, JSON.stringify(cellar));
  }, [cellar]);

  useEffect(() => {
    if (drank.length) localStorage.setItem(STORAGE_KEY_DRANK, JSON.stringify(drank));
  }, [drank]);

  const filteredCellar = useMemo(() => {
    return cellar
      .filter((w) => {
        if (!search.trim()) return true;
        const hay = `${wineName(w)} ${w.varietal} ${w.region} ${w.where_stored}`.toLowerCase();
        return hay.includes(search.toLowerCase());
      })
      .filter((w) => {
        if (filter === "all") return true;
        return readiness(w, yearNow).key === filter;
      })
      .sort((a, b) => {
        const ra = readiness(a, yearNow).key === "ready" ? 0 : 1;
        const rb = readiness(b, yearNow).key === "ready" ? 0 : 1;
        if (ra !== rb) return ra - rb;
        return wineName(a).localeCompare(wineName(b));
      });
  }, [cellar, search, filter, yearNow]);

  const summary = useMemo(() => {
    const bottles = cellar.reduce((s, w) => s + asNum(w.remaining_num), 0);
    const ready = cellar.filter((w) => readiness(w, yearNow).key === "ready").length;
    const soon = cellar.filter((w) => readiness(w, yearNow).key === "soon").length;
    const past = cellar.filter((w) => readiness(w, yearNow).key === "past").length;
    const value = cellar.reduce((s, w) => s + asNum(w.price_per_bottle_num) * asNum(w.remaining_num), 0);
    return { bottles, ready, soon, past, value };
  }, [cellar, yearNow]);

  function saveWine(wine) {
    if (cellar.some((x) => x.id === wine.id)) {
      setCellar((prev) => prev.map((x) => (x.id === wine.id ? { ...x, ...wine } : x)));
    } else {
      setCellar((prev) => [{ ...wine, id: wine.id || `manual-${uid()}` }, ...prev]);
    }
    setShowAdd(false);
    setEditingWine(null);
  }

  function removeWine(id) {
    setCellar((prev) => prev.filter((x) => x.id !== id));
  }

  function markDrankOne(id) {
    setCellar((prev) => {
      const idx = prev.findIndex((w) => w.id === id);
      if (idx < 0) return prev;
      const target = prev[idx];
      const consumed = {
        id: `drank-${uid()}`,
        no: "1",
        year_num: target.year_num,
        varietal: target.varietal,
        winery: target.winery,
        label: target.label,
        region: target.region,
        drink_start_num: target.drink_start_num,
        drink_end_num: target.drink_end_num,
        halliday: target.halliday,
        other_ratings: target.other_ratings,
        reviews: target.reviews,
        price_per_bottle_num: target.price_per_bottle_num,
        total_paid_num: target.price_per_bottle_num,
        total_insurance_num: target.price_per_bottle_num,
        when_acquired: target.when_acquired,
        from: target.from,
        where_stored: target.where_stored,
        box_no: target.box_no,
        consumed_date: new Date().toISOString().slice(0, 10),
        halliday_review: target.halliday_review,
        notes: target.notes,
        raw: target.raw,
      };
      setDrank((d) => [consumed, ...d]);

      const next = [...prev];
      const newRemaining = asNum(target.remaining_num) - 1;
      if (newRemaining > 0) {
        next[idx] = { ...target, remaining_num: newRemaining };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  }

  async function sendAI() {
    if (!aiInput.trim() || aiLoading) return;
    const prompt = aiInput.trim();
    setAiInput("");
    setAiMessages((m) => [...m, { role: "user", text: prompt }]);

    if (!apiKey.trim()) {
      setAiMessages((m) => [...m, { role: "assistant", text: "Add an OpenAI API key first. This replaces the broken old Vino AI setup." }]);
      return;
    }

    setAiLoading(true);
    try {
      const answer = await askOpenAI({ apiKey: apiKey.trim(), prompt, wines: cellar });
      setAiMessages((m) => [...m, { role: "assistant", text: answer }]);
    } catch (err) {
      setAiMessages((m) => [...m, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="app">
      <style>{`
        :root { color-scheme: light; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background: #f4f1ea; color: #1f2937; }
        .app { min-height: 100vh; background: radial-gradient(circle at 10% 0%, #fff9f0 0%, #f4f1ea 45%, #ece7dd 100%); padding: 20px; }
        .shell { max-width: 1200px; margin: 0 auto; }
        .title { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-bottom:14px; }
        .title h1 { margin:0; font-size: 30px; line-height:1; }
        .title .sub { color:#6b7280; font-size:13px; margin-top:6px; }
        .tabs { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px; }
        .tab { border:1px solid #d1d5db; background:#fff; color:#374151; border-radius:999px; padding:8px 14px; font-weight:600; cursor:pointer; }
        .tab.active { background:#7f1d1d; border-color:#7f1d1d; color:#fff; }
        .panel { background:#ffffffd9; border:1px solid #ddd6c8; border-radius:18px; padding:16px; box-shadow: 0 8px 30px rgba(66, 32, 8, 0.08); }
        .metrics { display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap:10px; margin-bottom:14px; }
        .metric-card { background:#fff; border:1px solid #ebe4d8; border-radius:14px; padding:12px; }
        .metric-value { font-size:24px; font-weight:800; line-height:1; }
        .metric-label { margin-top:6px; font-size:12px; text-transform:uppercase; letter-spacing:0.04em; color:#6b7280; font-weight:700; }
        .metric-hint { margin-top:4px; font-size:12px; color:#6b7280; }
        .ready-list { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
        .quick-card { background:#fffbf3; border:1px solid #f2e8d5; border-radius:12px; padding:10px; }
        .quick-top { display:flex; justify-content:space-between; align-items:start; gap:8px; }
        .name { font-weight:700; }
        .tiny { color:#6b7280; font-size:12px; }
        .badge { display:inline-flex; align-items:center; border-radius:999px; padding:3px 8px; font-size:11px; font-weight:700; color:white; }

        .toolbar { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
        .toolbar input, .toolbar select { padding:9px 10px; border:1px solid #d1d5db; border-radius:10px; background:#fff; }
        .toolbar .grow { flex:1; min-width:210px; }

        .wine-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:10px; }
        .wine-card { background:#fff; border:1px solid #ebe4d8; border-radius:14px; padding:12px; }
        .wine-header { display:flex; justify-content:space-between; gap:8px; margin-bottom:8px; }
        .wine-meta { font-size:12px; color:#6b7280; line-height:1.45; }
        .price-row { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; margin:10px 0; }
        .price-cell { background:#faf7f0; border:1px solid #eee6d7; border-radius:9px; padding:6px; }
        .price-key { font-size:11px; color:#6b7280; text-transform:uppercase; }
        .price-val { font-weight:700; font-size:12px; }
        .row-actions { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }

        .btn { border:none; border-radius:10px; padding:8px 11px; background:#7f1d1d; color:#fff; font-weight:700; cursor:pointer; }
        .btn.small { padding:6px 9px; font-size:12px; }
        .btn.ghost { background:#fff; color:#111827; border:1px solid #d1d5db; }
        .btn.warn { background:#065f46; }
        .btn.danger { background:#991b1b; }

        .list { display:grid; grid-template-columns:1fr; gap:8px; }
        .row { background:#fff; border:1px solid #ebe4d8; border-radius:12px; padding:10px; display:flex; justify-content:space-between; gap:10px; align-items:center; }

        .modal-wrap { position:fixed; inset:0; background:rgba(17,24,39,0.45); display:flex; align-items:center; justify-content:center; padding:14px; z-index:50; }
        .modal { width:min(860px, 100%); max-height:90vh; overflow:auto; background:#fff; border-radius:14px; border:1px solid #d1d5db; padding:14px; }
        .modal.wide { width:min(1020px, 100%); }
        .modal h3 { margin:0 0 12px 0; }
        .grid { display:grid; gap:10px; margin-bottom:10px; }
        .grid.two { grid-template-columns: repeat(2, minmax(0,1fr)); }
        .grid.three { grid-template-columns: repeat(3, minmax(0,1fr)); }
        .grid.four { grid-template-columns: repeat(4, minmax(0,1fr)); }
        label { display:block; font-size:12px; color:#374151; font-weight:600; }
        input, textarea { width:100%; margin-top:4px; padding:9px 10px; border-radius:10px; border:1px solid #d1d5db; }
        .actions { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }

        .raw-grid { display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:6px; }
        .raw-item { border:1px solid #e5e7eb; border-radius:9px; padding:8px; background:#fafafa; }
        .raw-key { font-size:11px; text-transform:uppercase; color:#6b7280; }
        .raw-val { margin-top:4px; font-size:13px; color:#111827; word-break:break-word; }

        .chat { background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:10px; height:420px; overflow:auto; }
        .msg { max-width:80%; margin:6px 0; padding:8px 10px; border-radius:10px; white-space:pre-wrap; }
        .msg.user { margin-left:auto; background:#7f1d1d; color:white; }
        .msg.assistant { background:#f3f4f6; color:#111827; }

        @media (max-width: 980px) {
          .metrics { grid-template-columns: repeat(2, minmax(0,1fr)); }
          .ready-list, .wine-grid, .raw-grid { grid-template-columns: 1fr; }
          .grid.two, .grid.three, .grid.four { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="shell">
        <div className="title">
          <div>
            <h1>Vino Cellar v{APP_VERSION}</h1>
            <div className="sub">Imported from <b>{wineHoldings2021.meta.source_file}</b> • {cellar.length} active rows • {drank.length} drank/archive rows</div>
          </div>
        </div>

        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="panel">
          {tab === "dashboard" ? (
            <>
              <div className="metrics">
                <Metric label="Cellar rows" value={cellar.length} hint="Imported + manual" />
                <Metric label="Bottles left" value={summary.bottles} hint="Remaining quantity" />
                <Metric label="Ready now" value={summary.ready} hint="Inside drink window" />
                <Metric label="Past peak" value={summary.past} hint="Past drink-by year" />
                <Metric label="Current value" value={currency(summary.value)} hint="Bottle price x remaining" />
              </div>
              <h3 style={{ marginTop: 0 }}>Ready to drink now</h3>
              <div className="ready-list">
                {cellar.filter((w) => readiness(w, yearNow).key === "ready").slice(0, 12).map((w) => {
                  const r = readiness(w, yearNow);
                  return (
                    <div className="quick-card" key={w.id}>
                      <div className="quick-top">
                        <div>
                          <div className="name">{wineName(w)}</div>
                          <div className="tiny">{w.region || "Unknown region"} • {w.varietal || "Unknown varietal"}</div>
                        </div>
                        <span className="badge" style={{ background: r.color }}>{r.label}</span>
                      </div>
                      <div className="tiny" style={{ marginTop: 8 }}>
                        Drink window: {w.drink_start_num || "?"} - {w.drink_end_num || "?"} • Remaining: {w.remaining_num} • Price: {currency(w.price_per_bottle_num)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === "cellar" ? (
            <>
              <div className="toolbar">
                <input className="grow" placeholder="Search winery, label, varietal, region, storage" value={search} onChange={(e) => setSearch(e.target.value)} />
                <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All readiness</option>
                  <option value="ready">Ready now</option>
                  <option value="soon">Drink soon</option>
                  <option value="early">Too early</option>
                  <option value="past">Past peak</option>
                  <option value="unknown">No window</option>
                </select>
                <button className="btn" onClick={() => setShowAdd(true)}>Add wine</button>
              </div>
              <div className="wine-grid">
                {filteredCellar.map((w) => {
                  const r = readiness(w, yearNow);
                  return (
                    <div key={w.id} className="wine-card">
                      <div className="wine-header">
                        <div>
                          <div className="name">{wineName(w)}</div>
                          <div className="wine-meta">{w.varietal || "-"} • {w.region || "-"}</div>
                        </div>
                        <span className="badge" style={{ background: r.color }}>{r.label}</span>
                      </div>

                      <div className="wine-meta">
                        Drink: {w.drink_start_num || "?"} - {w.drink_end_num || "?"} • Remaining: {w.remaining_num}
                      </div>
                      <div className="wine-meta">
                        Stored: {w.where_stored || "-"}{w.box_no ? ` • Box ${w.box_no}` : ""}
                      </div>

                      <div className="price-row">
                        <div className="price-cell"><div className="price-key">Price</div><div className="price-val">{currency(w.price_per_bottle_num)}</div></div>
                        <div className="price-cell"><div className="price-key">RRP</div><div className="price-val">{currency(w.rrp_num)}</div></div>
                        <div className="price-cell"><div className="price-key">Total paid</div><div className="price-val">{currency(w.total_paid_num)}</div></div>
                      </div>

                      <div className="row-actions">
                        <button className="btn small warn" onClick={() => markDrankOne(w.id)}>Mark drank</button>
                        <button className="btn small ghost" onClick={() => setEditingWine(w)}>Edit</button>
                        <button className="btn small ghost" onClick={() => setDetailWine(w)}>Details</button>
                        <button className="btn small danger" onClick={() => removeWine(w.id)}>Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}

          {tab === "drank" ? (
            <div className="list">
              {drank.slice(0, 200).map((w) => (
                <div className="row" key={w.id}>
                  <div>
                    <div className="name">{wineName(w)}</div>
                    <div className="tiny">
                      {w.varietal || "-"} • {w.region || "-"} • Consumed: {w.consumed_date || "(from old archive)"}
                    </div>
                  </div>
                  <div className="tiny">{currency(w.price_per_bottle_num)}</div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "reference" ? (
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <h3>Workbook totals tab</h3>
                <div className="list">
                  {wineHoldings2021.totals.map((r, i) => (
                    <div className="row" key={`t-${i}`}>
                      <div className="name">{r[0]}</div>
                      <div className="tiny">{r.slice(1).join(" • ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>Storage location tab</h3>
                <div className="list">
                  {wineHoldings2021.storageLocations.map((r, i) => (
                    <div className="row" key={`s-${i}`}>
                      <div className="name">{r[0]}</div>
                      <div className="tiny">{r[1] || ""}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>Reviewers tab</h3>
                <div className="list">
                  {wineHoldings2021.reviewers.slice(0, 12).map((r, i) => (
                    <div className="row" key={`r-${i}`}>
                      <div className="name">{r[1] || r[0]}</div>
                      <div className="tiny">{r.filter(Boolean).join(" • ")}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3>Regions tab</h3>
                <div className="tiny">{wineHoldings2021.regions.join(", ")}</div>
              </div>
            </div>
          ) : null}

          {tab === "ai" ? (
            <>
              <div className="tiny" style={{ marginBottom: 8 }}>
                Vino AI now uses OpenAI. Yes, you need an API key for live answers.
              </div>
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <input
                  className="grow"
                  type="password"
                  placeholder="OpenAI API key (sk-...)"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    localStorage.setItem(STORAGE_KEY_OPENAI, e.target.value);
                  }}
                />
              </div>
              <div className="chat">
                {aiMessages.map((m, i) => (
                  <div key={i} className={`msg ${m.role}`}>{m.text}</div>
                ))}
                {aiLoading ? <div className="msg assistant">Thinking…</div> : null}
              </div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                <input className="grow" value={aiInput} onChange={(e) => setAiInput(e.target.value)} placeholder="Ask: Which wines are ideal this year for steak?" onKeyDown={(e) => e.key === "Enter" && sendAI()} />
                <button className="btn" onClick={sendAI}>Send</button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <WineFormModal open={showAdd || !!editingWine} initial={editingWine} onClose={() => { setShowAdd(false); setEditingWine(null); }} onSave={saveWine} />
      <RawDetailsModal wine={detailWine} onClose={() => setDetailWine(null)} />
    </div>
  );
}
