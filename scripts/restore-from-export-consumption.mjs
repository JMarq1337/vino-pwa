#!/usr/bin/env node
import { execSync } from "node:child_process";
import process from "node:process";

const META_PREFIX = "[[VINO_META]]";

const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");
const normalize = v => (v || "").toString().trim();
const norm = v => normalize(v).toLowerCase().replace(/\s+/g, " ");
const normNil = v => {
  const t = norm(v);
  return t === "nill" || t === "nil" || t === "n/a" ? "" : t;
};
const safeNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const parseArgs = argv => {
  const args = { file: "", apply: false, chunkSize: 200 };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--file") {
      args.file = trim(argv[i + 1]);
      i += 1;
      continue;
    }
    if (v === "--apply") {
      args.apply = true;
      continue;
    }
    if (v === "--chunk-size") {
      args.chunkSize = Math.max(50, Math.min(1000, Number(argv[i + 1]) || 200));
      i += 1;
      continue;
    }
  }
  return args;
};

const decodeXmlText = s =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"");

const parseMetaFromNotes = notes => {
  if (typeof notes !== "string" || !notes.startsWith(META_PREFIX)) return { plain: notes || "", meta: {} };
  const body = notes.slice(META_PREFIX.length);
  const nl = body.indexOf("\n");
  const metaRaw = (nl === -1 ? body : body.slice(0, nl)).trim();
  const plain = nl === -1 ? "" : body.slice(nl + 1);
  try {
    return { plain, meta: metaRaw ? JSON.parse(metaRaw) : {} };
  } catch {
    return { plain: notes || "", meta: {} };
  }
};

const encodeNotes = (plain, meta) => {
  const clean = plain || "";
  const hasMeta = Object.values(meta || {}).some(v => v !== null && v !== "" && v !== undefined);
  if (!hasMeta) return clean;
  return `${META_PREFIX}${JSON.stringify(meta)}${clean ? `\n${clean}` : ""}`;
};

const parseSharedStrings = xlsx => {
  const xml = execSync(`unzip -p '${xlsx}' xl/sharedStrings.xml`, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 120,
  });
  const sst = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]);
    sst.push(decodeXmlText(parts.join("")));
  }
  return sst;
};

const parseSheetRows = (xlsx, sheetName, sst) => {
  const xml = execSync(`unzip -p '${xlsx}' xl/worksheets/${sheetName}.xml`, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 120,
  });
  const rows = {};
  for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = Number(rm[1]);
    const rowXml = rm[2];
    const obj = {};
    for (const cm of rowXml.matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = cm[1];
      const attrs = cm[2] || "";
      const body = cm[3] || "";
      const t = (attrs.match(/\bt="([^"]+)"/) || [])[1] || "";
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      const is = (body.match(/<is>([\s\S]*?)<\/is>/) || [])[1];
      let value = "";
      if (is) value = decodeXmlText(is);
      else if (v != null) value = t === "s" ? sst[Number(v)] || "" : v;
      obj[col] = value;
    }
    rows[row] = obj;
  }
  return rows;
};

const parseExportCellar = xlsx => {
  const sst = parseSharedStrings(xlsx);
  const rows = parseSheetRows(xlsx, "sheet2", sst);
  const header = rows[4] || {};
  const colByLabel = {};
  Object.entries(header).forEach(([col, label]) => {
    colByLabel[label] = col;
  });
  const required = [
    "Wine Name",
    "Vintage",
    "Origin (Raw)",
    "Location",
    "Section",
    "Slot / Box",
    "Bottles Purchased",
    "Bottles Left",
    "Bottles Consumed",
  ];
  for (const req of required) {
    if (!colByLabel[req]) throw new Error(`Missing header in export: ${req}`);
  }
  const out = [];
  for (const rowNum of Object.keys(rows).map(Number).sort((a, b) => a - b)) {
    if (rowNum <= 4) continue;
    const row = rows[rowNum];
    const name = normalize(row[colByLabel["Wine Name"]]);
    if (!name || name === "nill" || name === "No data") continue;
    out.push({
      name,
      vintage: normalize(row[colByLabel["Vintage"]]),
      origin: normalize(row[colByLabel["Origin (Raw)"]]),
      location: normalize(row[colByLabel["Location"]]),
      section: normalize(row[colByLabel["Section"]]),
      slot: normalize(row[colByLabel["Slot / Box"]]),
      purchased: Math.max(0, Math.round(safeNum(row[colByLabel["Bottles Purchased"]]) || 0)),
      left: Math.max(0, Math.round(safeNum(row[colByLabel["Bottles Left"]]) || 0)),
      consumed: Math.max(0, Math.round(safeNum(row[colByLabel["Bottles Consumed"]]) || 0)),
    });
  }
  return out;
};

const keyFns = [
  x => [norm(x.name), norm(x.vintage), norm(x.origin), normNil(x.location), normNil(x.section), normNil(x.slot)].join("|"),
  x => [norm(x.name), norm(x.vintage), norm(x.origin), normNil(x.location)].join("|"),
  x => [norm(x.name), norm(x.vintage), norm(x.origin)].join("|"),
  x => [norm(x.name), norm(x.vintage)].join("|"),
  x => norm(x.name),
];

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const args = parseArgs(process.argv);
if (!args.file) {
  console.error("Usage: node scripts/restore-from-export-consumption.mjs --file /path/to/vinology-export-YYYY-MM-DD.xlsx [--apply]");
  process.exit(1);
}

const SUPABASE_URL = trimSlash(process.env.SUPABASE_URL);
const SUPABASE_KEY =
  trim(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
  trim(process.env.SUPABASE_ANON_KEY) ||
  trim(process.env.SUPABASE_KEY);
const APP_VERSION = trim(process.env.APP_VERSION) || "7.57";
if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL.");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  process.exit(1);
}

const exportRows = parseExportCellar(args.file);

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "x-app-version": APP_VERSION,
};

const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/wines?select=*`, { headers });
if (!currentRes.ok) {
  const err = await currentRes.text();
  console.error(`Failed to fetch wines (${currentRes.status}): ${err}`);
  process.exit(1);
}
const currentRows = await currentRes.json();
const current = currentRows.map(w => {
  const { plain, meta } = parseMetaFromNotes(w.notes || "");
  const left = Math.max(0, Math.round(safeNum(w.bottles) || 0));
  const purchased = Math.max(left, Math.round(safeNum(meta.totalPurchased) ?? left));
  return {
    row: w,
    plain,
    meta,
    id: w.id,
    name: normalize(w.name),
    vintage: normalize(w.vintage),
    origin: normalize(w.origin),
    location: normalize(w.location),
    section: normalize(meta.locationSection),
    slot: normalize(w.location_slot),
    left,
    purchased,
    consumed: Math.max(0, purchased - left),
  };
});

const maps = keyFns.map(() => new Map());
for (const c of current) {
  keyFns.forEach((fn, i) => {
    const k = fn(c);
    if (!maps[i].has(k)) maps[i].set(k, []);
    maps[i].get(k).push(c);
  });
}

const used = new Set();
const unmatched = [];
const updates = [];
const resetList = [];
for (const e of exportRows) {
  let pick = null;
  for (let i = 0; i < keyFns.length && !pick; i += 1) {
    const key = keyFns[i](e);
    const list = (maps[i].get(key) || []).filter(x => !used.has(x.id));
    if (!list.length) continue;
    list.sort(
      (a, b) =>
        Math.abs(a.left - e.left) +
        Math.abs(a.purchased - e.purchased) -
        (Math.abs(b.left - e.left) + Math.abs(b.purchased - e.purchased))
    );
    pick = list[0];
  }
  if (!pick) {
    unmatched.push(e);
    continue;
  }
  used.add(pick.id);

  if (e.consumed <= pick.consumed) continue;

  const nextMeta = { ...pick.meta, totalPurchased: Math.max(e.left, e.purchased) };
  const patchedRow = {
    ...pick.row,
    bottles: e.left,
    notes: encodeNotes(pick.plain, nextMeta),
  };
  updates.push(patchedRow);
  resetList.push({
    id: pick.id,
    name: e.name,
    vintage: e.vintage,
    location: e.location,
    section: e.section,
    slot: e.slot,
    consumedNow: pick.consumed,
    consumedFromExport: e.consumed,
    leftNow: pick.left,
    leftFromExport: e.left,
  });
}

const sumExportConsumed = exportRows.reduce((s, x) => s + x.consumed, 0);
const sumCurrentConsumed = current.reduce((s, x) => s + x.consumed, 0);
const delta = resetList.reduce((s, x) => s + (x.consumedFromExport - x.consumedNow), 0);

console.log(`Export wines: ${exportRows.length}`);
console.log(`Current wines: ${current.length}`);
console.log(`Unmatched rows: ${unmatched.length}`);
console.log(`Reset wines identified: ${resetList.length}`);
console.log(`Current consumed total: ${sumCurrentConsumed}`);
console.log(`Export consumed total: ${sumExportConsumed}`);
console.log(`Recoverable delta from updates: +${delta}`);
console.log("\nReset wines:");
resetList
  .sort((a, b) => (b.consumedFromExport - b.consumedNow) - (a.consumedFromExport - a.consumedNow) || a.name.localeCompare(b.name))
  .forEach(item => {
    const loc = [item.location, item.section, item.slot].filter(Boolean).join(" · ");
    console.log(`- ${item.name} (${item.vintage || "nill"}) [${loc || "nill"}] ${item.consumedNow} -> ${item.consumedFromExport}`);
  });

if (!args.apply) {
  console.log("\nDry run complete. Re-run with --apply to write these updates.");
  process.exit(0);
}

if (!updates.length) {
  console.log("\nNo updates needed.");
  process.exit(0);
}

const upsertHeaders = {
  ...headers,
  Prefer: "resolution=merge-duplicates,return=minimal",
};

let written = 0;
for (const part of chunk(updates, args.chunkSize)) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/wines`);
  url.searchParams.set("on_conflict", "id");
  const res = await fetch(url, {
    method: "POST",
    headers: upsertHeaders,
    body: JSON.stringify(part),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Restore write failed (${res.status}): ${err}`);
    process.exit(1);
  }
  written += part.length;
}

console.log(`\nApplied updates to ${written} wines.`);
