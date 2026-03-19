const { requireSession } = require("./_lib/auth");
const {
  supabaseJson,
  getProfileRow,
  sanitizeProfile,
  profileWritePayload,
  saveProfilePayload,
} = require("./_lib/supabase");
const { getUserPinPreview, hasExternalPinStoreConfig } = require("./_lib/pin-store");

const UPSERT_TABLES = new Set(["wines", "tasting_notes", "audits", "grape_aliases", "cellar_events", "cellar_snapshots"]);
const DELETE_TABLES = new Set(["wines", "tasting_notes", "audits"]);
const CONFLICT_KEY = {
  wines: "id",
  tasting_notes: "id",
  audits: "id",
  grape_aliases: "alias",
  cellar_events: "id",
  cellar_snapshots: "id",
};
const withPinPreview = async profile => {
  if (!profile) return null;
  if (!hasExternalPinStoreConfig()) return profile;
  const preview = await getUserPinPreview();
  return {
    ...profile,
    pinEnabled: !!preview.pinEnabled,
    pinDigits: preview.pinDigits || null,
  };
};

const parseBody = req => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const session = await requireSession(req, res);
  if (!session) return;
  try {
    const body = parseBody(req);
    const action = String(body.action || "");

    if (action === "get") {
      const table = String(body.table || "");
      if (!["wines", "tasting_notes"].includes(table)) return res.status(400).json({ error: "Invalid table" });
      let out = await supabaseJson(table, { query: { order: "created_at" } });
      if (!out.res.ok) out = await supabaseJson(table);
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, rows: out.res.ok ? (out.json || []) : [], error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    if (action === "upsert") {
      const table = String(body.table || "");
      if (!UPSERT_TABLES.has(table)) return res.status(400).json({ error: "Invalid upsert table" });
      const out = await supabaseJson(table, {
        method: "POST",
        query: { on_conflict: CONFLICT_KEY[table] || "id" },
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: body.row || {},
      });
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    if (action === "delete") {
      const table = String(body.table || "");
      const id = String(body.id || "");
      if (!DELETE_TABLES.has(table) || !id) return res.status(400).json({ error: "Invalid delete request" });
      const out = await supabaseJson(table, {
        method: "DELETE",
        query: { id: `eq.${id}` },
      });
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    if (action === "getProfile") {
      const row = await getProfileRow();
      return res.status(200).json({ ok: true, profile: row ? await withPinPreview(sanitizeProfile(row)) : null });
    }

    if (action === "saveProfile") {
      const saved = await saveProfilePayload(profileWritePayload(body.profile || {}));
      return res.status(200).json({ ok: true, profile: await withPinPreview(sanitizeProfile(saved || body.profile || {})) });
    }

    if (action === "listAudits") {
      const out = await supabaseJson("audits", { query: { order: "updated_at.desc" } });
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, rows: out.res.ok ? (out.json || []) : [], error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    if (action === "listGrapeAliases") {
      const out = await supabaseJson("grape_aliases", { query: { select: "alias,wine_type" } });
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, rows: out.res.ok ? (out.json || []) : [], error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    if (action === "listCellarEvents") {
      const limit = Math.max(1, Math.min(5000, Number(body.limit || 500) || 500));
      const out = await supabaseJson("cellar_events", {
        query: {
          select: "id,entity,action,entity_id,payload,created_at",
          order: "created_at.desc",
          limit,
        },
      });
      return res.status(out.res.ok ? 200 : 400).json({ ok: out.res.ok, rows: out.res.ok ? (out.json || []) : [], error: out.res.ok ? "" : (out.text || `HTTP ${out.res.status}`) });
    }

    return res.status(400).json({ error: "Unknown db action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Database route failed" });
  }
};
