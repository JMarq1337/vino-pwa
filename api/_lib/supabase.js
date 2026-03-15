const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");

const SUPABASE_URL = trimSlash(process.env.SUPABASE_URL);
const SUPABASE_SERVICE_ROLE_KEY = trim(process.env.SUPABASE_SERVICE_ROLE_KEY);

const assertSupabaseConfig = () => {
  if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL.");
  if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");
};

const serviceHeaders = extra => ({
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  ...(extra || {}),
});

const normalizeAiMemoryList = value => {
  const src = Array.isArray(value)
    ? value
    : (typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return [];
          }
        })()
      : []);
  if (!Array.isArray(src)) return [];
  const seen = new Set();
  const out = [];
  src.forEach(item => {
    const text = (item || "").toString().trim().replace(/\s+/g, " ");
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(text);
  });
  return out.slice(0, 80);
};

const supabaseJson = async (path, { method = "GET", query, body, headers } = {}) => {
  assertSupabaseConfig();
  const url = new URL(`${SUPABASE_URL}/rest/v1/${path}`);
  if (query && typeof query === "object") {
    Object.entries(query).forEach(([key, value]) => {
      if (value == null || value === "") return;
      url.searchParams.set(key, String(value));
    });
  }
  const res = await fetch(url, {
    method,
    headers: serviceHeaders(headers),
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json, url: url.toString() };
};

const getProfileRow = async () => {
  const { res, json, text } = await supabaseJson("profile", {
    query: { id: "eq.1", select: "*" },
  });
  if (!res.ok) throw new Error(text || `Profile fetch failed (${res.status})`);
  return Array.isArray(json) ? (json[0] || null) : null;
};

const sanitizeProfile = row => ({
  name: row?.name || "",
  description: row?.description || "",
  avatar: row?.avatar || null,
  surname: row?.surname || "",
  cellarName: row?.cellar_name || "",
  bio: row?.bio || "",
  country: row?.country || "",
  profileBg: row?.profile_bg || "",
  aiMemory: normalizeAiMemoryList(row?.ai_memory),
  pinEnabled: !!((row?.pin_hash || "").trim() && (row?.pin_salt || "").trim()),
  pinDigits: [4, 6].includes(Number(row?.pin_digits)) ? Number(row.pin_digits) : null,
});

const sanitizeProfilePreview = row => ({
  name: row?.name || "",
  description: row?.description || "",
  cellarName: row?.cellar_name || "",
  profileBg: row?.profile_bg || "",
  pinEnabled: !!((row?.pin_hash || "").trim() && (row?.pin_salt || "").trim()),
  pinDigits: [4, 6].includes(Number(row?.pin_digits)) ? Number(row.pin_digits) : null,
});

const profileWritePayload = profile => ({
  name: profile?.name || "",
  description: profile?.description || "",
  avatar: profile?.avatar || null,
  surname: profile?.surname || "",
  cellar_name: profile?.cellarName || "",
  bio: profile?.bio || "",
  country: profile?.country || "",
  profile_bg: profile?.profileBg || "",
  ai_memory: normalizeAiMemoryList(profile?.aiMemory),
});

const saveProfilePayload = async payload => {
  const patchHeaders = { Prefer: "return=representation" };
  const patch = await supabaseJson("profile", {
    method: "PATCH",
    query: { id: "eq.1" },
    headers: patchHeaders,
    body: payload,
  });
  if (patch.res.ok) {
    const rows = Array.isArray(patch.json) ? patch.json : [];
    return rows[0] || null;
  }
  const post = await supabaseJson("profile", {
    method: "POST",
    query: { on_conflict: "id" },
    headers: patchHeaders,
    body: { id: 1, ...payload },
  });
  if (!post.res.ok) {
    throw new Error(`Profile write failed: ${patch.text || patch.res.status} | ${post.text || post.res.status}`);
  }
  const rows = Array.isArray(post.json) ? post.json : [];
  return rows[0] || null;
};

module.exports = {
  SUPABASE_URL,
  assertSupabaseConfig,
  serviceHeaders,
  supabaseJson,
  getProfileRow,
  sanitizeProfile,
  sanitizeProfilePreview,
  profileWritePayload,
  saveProfilePayload,
  normalizeAiMemoryList,
};
