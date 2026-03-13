#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { gzipSync } from "node:zlib";

const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");
const nowIso = () => new Date().toISOString().replace(/:/g, "-").replace(/\.\d+Z$/, "Z");
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const SUPABASE_URL = trimSlash(process.env.SUPABASE_URL);
const SUPABASE_KEY =
  trim(process.env.SUPABASE_SERVICE_ROLE_KEY) ||
  trim(process.env.SUPABASE_ANON_KEY) ||
  trim(process.env.SUPABASE_KEY);
const APP_VERSION = trim(process.env.APP_VERSION) || "7.57";
const BACKUP_OUT_DIR = trim(process.env.BACKUP_OUT_DIR) || "backups";
const PAGE_SIZE = Math.max(100, Math.min(5000, Number(process.env.BACKUP_PAGE_SIZE) || 1000));
const BACKUP_TABLES = (trim(process.env.BACKUP_TABLES) || "wines,profile,audits,tasting_notes,grape_aliases,cellar_events,cellar_snapshots,app_guard_config")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL.");
  process.exit(1);
}
if (!SUPABASE_KEY) {
  console.error("Missing SUPABASE key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  process.exit(1);
}
if (!BACKUP_TABLES.length) {
  console.error("No backup tables configured.");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "x-app-version": APP_VERSION,
  Prefer: "count=exact",
};

const fetchTablePage = async (table, limit, offset) => {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set("select", "*");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const res = await fetch(url, { headers });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : [];
  } catch {
    data = text;
  }
  return { res, data, text };
};

const fetchTableAllRows = async table => {
  let offset = 0;
  let rows = [];
  for (;;) {
    const { res, data, text } = await fetchTablePage(table, PAGE_SIZE, offset);
    if (!res.ok) {
      if (res.status === 404) {
        return { rows: [], warning: `Table '${table}' not found (404)` };
      }
      if (typeof text === "string" && text.toLowerCase().includes("relation") && text.toLowerCase().includes("does not exist")) {
        return { rows: [], warning: `Table '${table}' does not exist` };
      }
      throw new Error(`Failed table '${table}' (${res.status}): ${typeof text === "string" ? text : JSON.stringify(text)}`);
    }
    if (!Array.isArray(data)) {
      throw new Error(`Unexpected response for table '${table}': expected array`);
    }
    rows = rows.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += data.length;
  }
  return { rows, warning: "" };
};

const timestamp = nowIso();
const backupDir = path.join(BACKUP_OUT_DIR, `vinology-${timestamp}`);
await fs.mkdir(backupDir, { recursive: true });

const tableResults = {};
const warnings = [];
for (const table of BACKUP_TABLES) {
  process.stdout.write(`Backing up '${table}'... `);
  const result = await fetchTableAllRows(table);
  if (result.warning) {
    warnings.push(result.warning);
    process.stdout.write(`skipped (${result.warning})\n`);
    tableResults[table] = { rowCount: 0, warning: result.warning, rows: [] };
    continue;
  }
  process.stdout.write(`${result.rows.length} rows\n`);
  tableResults[table] = { rowCount: result.rows.length, rows: result.rows };
}

const nonEmptyTables = Object.values(tableResults).filter(t => Array.isArray(t.rows) && t.rows.length > 0).length;
if (!nonEmptyTables) {
  throw new Error("Backup produced no rows across all tables.");
}

const backup = {
  meta: {
    generatedAt: new Date().toISOString(),
    projectUrl: SUPABASE_URL,
    pageSize: PAGE_SIZE,
    tablesRequested: BACKUP_TABLES,
    gitSha: trim(process.env.GITHUB_SHA),
    warnings,
  },
  tables: tableResults,
};

const json = JSON.stringify(backup, null, 2);
const jsonPath = path.join(backupDir, "backup.json");
const gzPath = path.join(backupDir, "backup.json.gz");
const summaryPath = path.join(backupDir, "summary.txt");

await fs.writeFile(jsonPath, json, "utf8");
await fs.writeFile(gzPath, gzipSync(Buffer.from(json, "utf8")));

const sha = buffer => crypto.createHash("sha256").update(buffer).digest("hex");
const jsonSha = sha(Buffer.from(json, "utf8"));
const gzSha = sha(await fs.readFile(gzPath));

const summaryLines = [
  `generated_at=${backup.meta.generatedAt}`,
  `project_url=${SUPABASE_URL}`,
  `tables=${BACKUP_TABLES.join(",")}`,
  ...Object.entries(tableResults).map(([table, info]) => `${table}=${info.rowCount}`),
  `backup_json_sha256=${jsonSha}`,
  `backup_json_gz_sha256=${gzSha}`,
  ...(warnings.length ? ["warnings:", ...warnings.map(w => `- ${w}`)] : []),
];
await fs.writeFile(summaryPath, `${summaryLines.join("\n")}\n`, "utf8");

console.log(`Backup complete: ${backupDir}`);
