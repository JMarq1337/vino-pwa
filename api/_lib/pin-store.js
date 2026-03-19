const trim = v => (v == null ? "" : String(v).trim());
const trimSlash = v => trim(v).replace(/\/+$/, "");

const PIN_STORE_URL = trimSlash(process.env.UPSTASH_REDIS_REST_URL);
const PIN_STORE_TOKEN = trim(process.env.UPSTASH_REDIS_REST_TOKEN);
const PIN_STORE_KEY = trim(process.env.PIN_STORE_KEY) || "vinology:user_pin";

const hasExternalPinStoreConfig = () => !!(PIN_STORE_URL && PIN_STORE_TOKEN);

const pinStoreHeaders = extra => ({
  Authorization: `Bearer ${PIN_STORE_TOKEN}`,
  ...(extra || {}),
});

const pinStoreUrl = path => `${PIN_STORE_URL}${path.startsWith("/") ? path : `/${path}`}`;

const pinStoreRequest = async (path, { method = "GET", body, headers } = {}) => {
  if (!hasExternalPinStoreConfig()) return { ok: false, skipped: true, error: "PIN store not configured" };
  const res = await fetch(pinStoreUrl(path), {
    method,
    headers: pinStoreHeaders(headers),
    body,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { ok: res.ok, res, text, json };
};

const normalizePinRecord = value => {
  if (!value || typeof value !== "object") return null;
  const hash = trim(value.pin_hash || value.pinHash);
  const salt = trim(value.pin_salt || value.pinSalt);
  const digits = [4, 6].includes(Number(value.pin_digits)) ? Number(value.pin_digits)
    : ([4, 6].includes(Number(value.pinDigits)) ? Number(value.pinDigits) : null);
  if (!hash || !salt || !digits) return null;
  return {
    pin_hash: hash,
    pin_salt: salt,
    pin_digits: digits,
    updated_at: trim(value.updated_at || value.updatedAt) || new Date().toISOString(),
  };
};

const getUserPinRecord = async () => {
  if (!hasExternalPinStoreConfig()) return null;
  const out = await pinStoreRequest(`/get/${encodeURIComponent(PIN_STORE_KEY)}`);
  if (!out.ok) throw new Error(out.text || `PIN store read failed (${out.res?.status || "unknown"})`);
  const raw = out.json?.result;
  if (!raw) return null;
  try {
    return normalizePinRecord(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return null;
  }
};

const saveUserPinRecord = async record => {
  if (!hasExternalPinStoreConfig()) throw new Error("PIN store not configured");
  const normalized = normalizePinRecord(record);
  if (!normalized) throw new Error("Invalid PIN record");
  const out = await pinStoreRequest(`/set/${encodeURIComponent(PIN_STORE_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(normalized),
  });
  if (!out.ok) throw new Error(out.text || `PIN store write failed (${out.res?.status || "unknown"})`);
  return normalized;
};

const getUserPinPreview = async () => {
  const record = await getUserPinRecord();
  return {
    pinEnabled: !!record,
    pinDigits: record?.pin_digits || null,
  };
};

module.exports = {
  hasExternalPinStoreConfig,
  getUserPinRecord,
  saveUserPinRecord,
  getUserPinPreview,
};
