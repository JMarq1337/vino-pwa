#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};
const parseArgs = argv => {
  const args = { file: "", chunkSize: 500, tables: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--file") {
      args.file = trim(argv[i + 1]);
      i += 1;
      continue;
    }
    if (v === "--chunk-size") {
      args.chunkSize = Math.max(50, Math.min(2000, Number(argv[i + 1]) || 500));
      i += 1;
      continue;
    }
    if (v === "--tables") {
      const raw = trim(argv[i + 1]);
      args.tables = raw
        .split(",")
        .map(x => trim(x))
        .filter(Boolean);
      i += 1;
      continue;
    }
  }
  return args;
};

const args = parseArgs(process.argv);
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
  console.error("Missing SUPABASE key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (!args.file) {
  console.error("Usage: node scripts/restore-supabase-rest.mjs --file backups/vinology-.../backup.json.gz [--tables wines,profile]");
  process.exit(1);
}

const filePath = path.resolve(args.file);
const raw = await fs.readFile(filePath);
const content = filePath.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
let parsed;
try {
  parsed = JSON.parse(content);
} catch (e) {
  console.error(`Invalid backup JSON: ${e.message}`);
  process.exit(1);
}

const tableMap = parsed?.tables && typeof parsed.tables === "object" ? parsed.tables : {};
const tableOrder = ["profile", "wines", "audits", "tasting_notes", "grape_aliases", "cellar_events", "cellar_snapshots", "app_guard_config"];
const orderedTables = [
  ...tableOrder.filter(t => Object.prototype.hasOwnProperty.call(tableMap, t)),
  ...Object.keys(tableMap).filter(t => !tableOrder.includes(t)),
];
if (!orderedTables.length) {
  console.error("Backup file has no tables.");
  process.exit(1);
}

const conflictKeyByTable = {
  profile: "id",
  wines: "id",
  audits: "id",
  tasting_notes: "id",
  grape_aliases: "alias",
  cellar_events: "id",
  cellar_snapshots: "id",
  app_guard_config: "id",
};

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "x-app-version": APP_VERSION,
  Prefer: "resolution=merge-duplicates,return=minimal",
};

const upsertRows = async (table, rows, conflictKey) => {
  const parts = chunk(rows, args.chunkSize);
  let done = 0;
  for (const part of parts) {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
    if (conflictKey) url.searchParams.set("on_conflict", conflictKey);
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(part),
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 404) {
        console.warn(`Skipping table '${table}' (not found).`);
        return done;
      }
      throw new Error(`Restore failed for '${table}' (${res.status}): ${text}`);
    }
    done += part.length;
  }
  return done;
};

console.log(`Restoring from: ${filePath}`);
let totalRows = 0;
const selectedTables = args.tables.length
  ? orderedTables.filter(t => args.tables.includes(t))
  : orderedTables;
if (args.tables.length && !selectedTables.length) {
  console.error(`No matching tables found for --tables ${args.tables.join(",")}. Available: ${orderedTables.join(", ")}`);
  process.exit(1);
}
for (const table of selectedTables) {
  const entry = tableMap[table];
  const rows = Array.isArray(entry)
    ? entry
    : Array.isArray(entry?.rows)
      ? entry.rows
      : [];
  if (!rows.length) {
    console.log(`Skipping '${table}' (0 rows).`);
    continue;
  }
  const conflictKey = conflictKeyByTable[table] || "id";
  console.log(`Upserting '${table}' (${rows.length} rows)...`);
  const done = await upsertRows(table, rows, conflictKey);
  totalRows += done;
}
console.log(`Restore complete. Rows processed: ${totalRows}`);
