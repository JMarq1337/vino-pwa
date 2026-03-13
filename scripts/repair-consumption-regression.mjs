#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const META_PREFIX = "[[VINO_META]]";
const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");

const parseArgs = argv => {
  const args = { backup: "", apply: false, chunkSize: 200 };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--backup") {
      args.backup = trim(argv[i + 1]);
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

const parseMeta = notes => {
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

const safeNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const wineStats = row => {
  const { meta, plain } = parseMeta(row.notes || "");
  const left = Math.max(0, Math.round(safeNum(row.bottles) || 0));
  const totalRaw = safeNum(meta.totalPurchased);
  const purchased = totalRaw == null ? left : Math.max(left, Math.round(totalRaw));
  const consumed = Math.max(0, purchased - left);
  return { meta, plain, left, purchased, consumed };
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const args = parseArgs(process.argv);
if (!args.backup) {
  console.error("Usage: node scripts/repair-consumption-regression.mjs --backup backups/vinology-.../backup.json.gz [--apply]");
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

const backupPath = path.resolve(args.backup);
const rawBackup = await fs.readFile(backupPath);
const backupJsonText = backupPath.endsWith(".gz") ? gunzipSync(rawBackup).toString("utf8") : rawBackup.toString("utf8");
let backup;
try {
  backup = JSON.parse(backupJsonText);
} catch (e) {
  console.error(`Invalid backup JSON: ${e.message}`);
  process.exit(1);
}

const backupRows = Array.isArray(backup?.tables?.wines?.rows)
  ? backup.tables.wines.rows
  : Array.isArray(backup?.tables?.wines)
    ? backup.tables.wines
    : [];
if (!backupRows.length) {
  console.error("Backup contains no wines table rows.");
  process.exit(1);
}

const backupById = new Map(backupRows.map(row => [row.id, row]));

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "x-app-version": APP_VERSION,
};
const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/wines?select=*`, { headers });
if (!currentRes.ok) {
  const err = await currentRes.text();
  console.error(`Failed to read current wines (${currentRes.status}): ${err}`);
  process.exit(1);
}
const currentRows = await currentRes.json();

const patches = [];
for (const cur of currentRows) {
  const old = backupById.get(cur.id);
  if (!old) continue;

  const oldStats = wineStats(old);
  const curStats = wineStats(cur);

  const consumedDropped = oldStats.consumed > curStats.consumed;
  const leftIncreased = curStats.left >= oldStats.left;
  const purchasedDropped = curStats.purchased <= oldStats.purchased;
  const suspicious = consumedDropped && leftIncreased && purchasedDropped;
  if (!suspicious) continue;

  const nextMeta = { ...curStats.meta, totalPurchased: oldStats.purchased };
  patches.push({
    ...cur,
    bottles: oldStats.left,
    notes: encodeNotes(curStats.plain, nextMeta),
  });
}

console.log(`Found ${patches.length} suspicious wines.`);
if (patches.length) {
  patches.slice(0, 20).forEach(row => {
    const old = backupById.get(row.id);
    const oldStats = wineStats(old);
    const curStats = wineStats(currentRows.find(r => r.id === row.id) || {});
    console.log(
      `- ${row.name || row.id}: consumed ${curStats.consumed} -> ${oldStats.consumed}, left ${curStats.left} -> ${oldStats.left}`
    );
  });
}

if (!args.apply) {
  console.log("Dry run complete. Re-run with --apply to write patches.");
  process.exit(0);
}

if (!patches.length) {
  console.log("Nothing to patch.");
  process.exit(0);
}

const upsertHeaders = {
  ...headers,
  Prefer: "resolution=merge-duplicates,return=minimal",
};

let written = 0;
for (const part of chunk(patches, args.chunkSize)) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/wines`);
  url.searchParams.set("on_conflict", "id");
  const res = await fetch(url, {
    method: "POST",
    headers: upsertHeaders,
    body: JSON.stringify(part),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`Patch write failed (${res.status}): ${err}`);
    process.exit(1);
  }
  written += part.length;
}

console.log(`Patched ${written} wine rows.`);
