#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";
import { gunzipSync } from "node:zlib";

const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");
const normalize = v => trim(v).toLowerCase().replace(/\s+/g, " ");
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const parseArgs = argv => {
  const args = { backupFile: "", apply: false, chunkSize: 200 };
  for (let i = 2; i < argv.length; i += 1) {
    const v = argv[i];
    if (v === "--backup-file") {
      args.backupFile = trim(argv[i + 1]);
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
  console.error("Missing Supabase key. Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY.");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "x-app-version": APP_VERSION,
};

const makeSig = row =>
  [
    normalize(row?.name),
    normalize(row?.vintage),
    normalize(row?.origin),
    normalize(row?.location),
    normalize(row?.location_slot),
  ].join("|");

const loadBackup = async backupFileArg => {
  let target = trim(backupFileArg);
  if (!target) {
    const backupsDir = path.resolve("backups");
    const entries = await fs.readdir(backupsDir, { withFileTypes: true });
    const candidates = entries
      .filter(e => e.isDirectory() && e.name.startsWith("vinology-"))
      .map(e => path.join(backupsDir, e.name, "backup.json.gz"));
    for (const p of candidates.sort().reverse()) {
      try {
        await fs.access(p);
        target = p;
        break;
      } catch {}
    }
  }

  if (!target) throw new Error("No backup file found. Pass --backup-file.");
  const resolved = path.resolve(target);
  const raw = await fs.readFile(resolved);
  const txt = resolved.endsWith(".gz") ? gunzipSync(raw).toString("utf8") : raw.toString("utf8");
  const parsed = JSON.parse(txt);
  const rows = Array.isArray(parsed?.tables?.wines?.rows)
    ? parsed.tables.wines.rows
    : Array.isArray(parsed?.tables?.wines)
      ? parsed.tables.wines
      : [];
  return { file: resolved, rows };
};

const backup = await loadBackup(args.backupFile);
const backupById = new Map();
const backupBySig = new Map();

for (const row of backup.rows) {
  if (!row || !trim(row.photo)) continue;
  if (row.id) backupById.set(row.id, row);
  const sig = makeSig(row);
  if (!backupBySig.has(sig)) backupBySig.set(sig, []);
  backupBySig.get(sig).push(row);
}

const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/wines?select=*`, { headers });
if (!currentRes.ok) {
  const err = await currentRes.text();
  console.error(`Failed to fetch wines (${currentRes.status}): ${err}`);
  process.exit(1);
}
const currentRows = await currentRes.json();

const updates = [];
const changed = [];
for (const row of currentRows) {
  if (!row || trim(row.photo)) continue;
  let match = null;
  if (row.id && backupById.has(row.id)) match = backupById.get(row.id);
  if (!match) {
    const sig = makeSig(row);
    const list = backupBySig.get(sig) || [];
    if (list.length) match = list[0];
  }
  if (!match || !trim(match.photo)) continue;
  updates.push({ ...row, photo: match.photo });
  changed.push({
    id: row.id,
    name: row.name || "",
    vintage: row.vintage || "",
    origin: row.origin || "",
    location: row.location || "",
  });
}

const currentWithPhoto = currentRows.filter(r => trim(r?.photo)).length;
const targetWithPhoto = currentWithPhoto + updates.length;

console.log(`Backup source: ${backup.file}`);
console.log(`Backup wines with photo: ${backupById.size}`);
console.log(`Current wines: ${currentRows.length}`);
console.log(`Current wines with photo: ${currentWithPhoto}`);
console.log(`Recoverable missing photos: ${updates.length}`);
console.log(`Projected wines with photo after restore: ${targetWithPhoto}`);
console.log("\nPhoto restore candidates:");
changed.slice(0, 200).forEach(item => {
  const loc = [item.origin, item.location].filter(Boolean).join(" · ");
  console.log(`- ${item.name} (${item.vintage || "nill"}) [${loc || "nill"}]`);
});
if (changed.length > 200) console.log(`... and ${changed.length - 200} more`);

if (!args.apply) {
  console.log("\nDry run complete. Re-run with --apply to restore missing photos.");
  process.exit(0);
}

if (!updates.length) {
  console.log("\nNo photo updates needed.");
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
    console.error(`Photo restore write failed (${res.status}): ${err}`);
    process.exit(1);
  }
  written += part.length;
}

console.log(`\nApplied photo restore to ${written} wines.`);
