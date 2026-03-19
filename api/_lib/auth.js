const crypto = require("node:crypto");
const {
  getProfileRow,
  sanitizeProfile,
  sanitizeProfilePreview,
  saveProfilePayload,
} = require("./supabase");
const {
  hasExternalPinStoreConfig,
  getUserPinRecord,
  saveUserPinRecord,
} = require("./pin-store");

const COOKIE_NAME = "vinology_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
const ADMIN_PIN_DIGITS = Number(process.env.ADMIN_PIN_DIGITS) || 8;

const trim = v => (v == null ? "" : String(v).trim());
const normalizeUserPinDigits = value => (Number(value) === 6 ? 6 : 4);
const normalizePinInput = (value, digits) => (value || "").toString().replace(/\D/g, "").slice(0, Math.max(1, Number(digits) || 0));
const toHex = buffer => Buffer.from(buffer).toString("hex");
const base64url = value => Buffer.from(value).toString("base64url");
const unbase64url = value => Buffer.from(String(value || ""), "base64url").toString("utf8");
const safeEqualText = (a, b) => {
  const aBuf = Buffer.from(String(a || ""));
  const bBuf = Buffer.from(String(b || ""));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

const generatePinSalt = () => crypto.randomBytes(16).toString("hex");
const hashPinValue = (pin, salt) => crypto.pbkdf2Sync(
  String(pin || ""),
  `vinology:${String(salt || "")}`,
  120000,
  32,
  "sha256"
).toString("hex");

const hasConfiguredProfilePin = row => !!((row?.pin_hash || "").trim() && (row?.pin_salt || "").trim());

const createUserPinRecord = (pin, digits) => {
  const pinDigits = normalizeUserPinDigits(digits);
  const salt = generatePinSalt();
  return {
    pin_hash: hashPinValue(pin, salt),
    pin_salt: salt,
    pin_digits: pinDigits,
  };
};

const verifyUserPin = (row, pin) => {
  if (!hasConfiguredProfilePin(row)) return false;
  const expected = String(row.pin_hash || "");
  const actual = hashPinValue(pin, row.pin_salt || "");
  return safeEqualText(actual, expected);
};
const normalizeExternalPinRecord = record => {
  if (!record) return null;
  return {
    pin_hash: String(record.pin_hash || ""),
    pin_salt: String(record.pin_salt || ""),
    pin_digits: normalizeUserPinDigits(record.pin_digits),
    updated_at: record.updated_at || new Date().toISOString(),
  };
};
const resolveUserPinState = async profileRow => {
  if (!hasExternalPinStoreConfig()) {
    return {
      source: "profile",
      record: hasConfiguredProfilePin(profileRow) ? {
        pin_hash: String(profileRow.pin_hash || ""),
        pin_salt: String(profileRow.pin_salt || ""),
        pin_digits: normalizeUserPinDigits(profileRow.pin_digits),
      } : null,
    };
  }
  const externalRecord = normalizeExternalPinRecord(await getUserPinRecord());
  if (externalRecord) return { source: "external", record: externalRecord };
  if (hasConfiguredProfilePin(profileRow)) {
    const migrated = normalizeExternalPinRecord({
      pin_hash: profileRow.pin_hash,
      pin_salt: profileRow.pin_salt,
      pin_digits: profileRow.pin_digits,
      updated_at: new Date().toISOString(),
    });
    await saveUserPinRecord(migrated);
    return { source: "external", record: migrated, migrated: true };
  }
  return { source: "external", record: null };
};
const attachPinState = async sanitizedProfile => {
  const pinState = await resolveUserPinState(null).catch(() => null);
  if (!pinState) return sanitizedProfile;
  return {
    ...sanitizedProfile,
    pinEnabled: !!pinState.record,
    pinDigits: pinState.record?.pin_digits || null,
  };
};

const adminConfig = () => ({
  plain: trim(process.env.ADMIN_PIN),
  hash: trim(process.env.ADMIN_PIN_HASH),
  salt: trim(process.env.ADMIN_PIN_SALT),
  digits: ADMIN_PIN_DIGITS,
});

const verifyAdminPin = pin => {
  const cfg = adminConfig();
  const entered = normalizePinInput(pin, cfg.digits);
  if (cfg.hash && cfg.salt) return safeEqualText(hashPinValue(entered, cfg.salt), cfg.hash);
  if (cfg.plain) return safeEqualText(entered, cfg.plain);
  return false;
};

const sessionSecret = () => {
  const secret = trim(process.env.SESSION_SECRET);
  if (!secret) throw new Error("Missing SESSION_SECRET.");
  return secret;
};

const parseCookies = cookieHeader => {
  const out = {};
  String(cookieHeader || "")
    .split(";")
    .map(v => v.trim())
    .filter(Boolean)
    .forEach(part => {
      const idx = part.indexOf("=");
      if (idx === -1) return;
      out[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
    });
  return out;
};

const signPayload = payload => {
  const body = base64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
};

const verifySignedPayload = raw => {
  const token = String(raw || "");
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  if (!safeEqualText(sig, expected)) return null;
  try {
    return JSON.parse(unbase64url(body));
  } catch {
    return null;
  }
};

const sessionCookieParts = value => [
  `${COOKIE_NAME}=${value}`,
  "Path=/",
  "HttpOnly",
  "Secure",
  "SameSite=Strict",
  `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
];

const setSessionCookie = (res, payload) => {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const token = signPayload({ ...payload, exp: expiresAt });
  res.setHeader("Set-Cookie", sessionCookieParts(encodeURIComponent(token)).join("; "));
};

const clearSessionCookie = res => {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`);
};

const sessionFingerprintForProfile = pinRecord => String(pinRecord?.pin_hash || "");
const sessionFingerprintForAdmin = () => {
  const cfg = adminConfig();
  if (cfg.hash) return cfg.hash;
  if (cfg.plain) return hashPinValue(cfg.plain, "admin-fallback");
  return "";
};

const readSession = req => {
  const cookies = parseCookies(req?.headers?.cookie || "");
  const token = cookies[COOKIE_NAME];
  if (!token) return null;
  const parsed = verifySignedPayload(decodeURIComponent(token));
  if (!parsed || !parsed.exp || Date.now() > Number(parsed.exp)) return null;
  return parsed;
};

const resolveSession = async req => {
  const parsed = readSession(req);
  if (!parsed) return { authenticated: false, role: "user", profile: null };
  if (parsed.role === "admin") {
    if (!safeEqualText(parsed.fingerprint || "", sessionFingerprintForAdmin())) {
      return { authenticated: false, role: "user", profile: null };
    }
    const profileRow = await getProfileRow().catch(() => null);
    return {
      authenticated: true,
      role: "admin",
      profile: profileRow ? sanitizeProfile(profileRow) : null,
      profileRow,
    };
  }
  const profileRow = await getProfileRow().catch(() => null);
  if (!profileRow) return { authenticated: false, role: "user", profile: null };
  const pinState = await resolveUserPinState(profileRow).catch(() => null);
  const activePinRecord = pinState?.record || null;
  if (!activePinRecord) return { authenticated: false, role: "user", profile: null };
  if (!safeEqualText(parsed.fingerprint || "", sessionFingerprintForProfile(activePinRecord))) {
    return { authenticated: false, role: "user", profile: null };
  }
  return {
    authenticated: true,
    role: "user",
    profile: {
      ...sanitizeProfile(profileRow),
      pinEnabled: true,
      pinDigits: activePinRecord.pin_digits,
    },
    profileRow,
  };
};

const requireSession = async (req, res) => {
  const session = await resolveSession(req);
  if (!session.authenticated) {
    clearSessionCookie(res);
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  return session;
};

const bootstrapPayload = async req => {
  const profileRow = await getProfileRow().catch(() => null);
  const session = await resolveSession(req);
  const pinState = await resolveUserPinState(profileRow).catch(() => null);
  return {
    profile: profileRow ? {
      ...sanitizeProfilePreview(profileRow),
      pinEnabled: !!pinState?.record,
      pinDigits: pinState?.record?.pin_digits || null,
    } : {
      name: "",
      description: "",
      cellarName: "",
      profileBg: "",
      pinEnabled: !!pinState?.record,
      pinDigits: pinState?.record?.pin_digits || null,
    },
    authenticated: session.authenticated,
    role: session.authenticated ? session.role : "user",
    adminEnabled: !!(adminConfig().plain || (adminConfig().hash && adminConfig().salt)),
  };
};

const loginWithPin = async ({ role, pin }) => {
  const selectedRole = role === "admin" ? "admin" : "user";
  if (selectedRole === "admin") {
    if (!verifyAdminPin(pin)) return { ok: false, error: "Admin PIN did not match." };
    const profileRow = await getProfileRow().catch(() => null);
    return {
      ok: true,
      role: "admin",
      profile: profileRow ? sanitizeProfile(profileRow) : null,
      fingerprint: sessionFingerprintForAdmin(),
    };
  }
  const profileRow = await getProfileRow().catch(() => null);
  const pinState = await resolveUserPinState(profileRow).catch(err => ({ error: err }));
  if (pinState?.error) return { ok: false, error: "Winery security is temporarily unavailable." };
  if (!profileRow || !pinState?.record) return { ok: false, error: "This winery PIN is not configured yet." };
  const digits = normalizeUserPinDigits(pinState.record.pin_digits);
  const entered = normalizePinInput(pin, digits);
  if (entered.length !== digits || !verifyUserPin(pinState.record, entered)) {
    return { ok: false, error: "PIN did not match this winery." };
  }
  return {
    ok: true,
    role: "user",
    profile: {
      ...sanitizeProfile(profileRow),
      pinEnabled: true,
      pinDigits: pinState.record.pin_digits,
    },
    fingerprint: sessionFingerprintForProfile(pinState.record),
  };
};

const setupOrChangeUserPin = async ({ ownerName = "", cellarName = "", nextPin = "", digits = 4, currentPin = "", allowBootstrap = false, role = "user" }) => {
  const profileRow = await getProfileRow().catch(() => null);
  const pinState = await resolveUserPinState(profileRow);
  const hasExistingPin = !!pinState?.record;
  const pinDigits = normalizeUserPinDigits(digits);
  const cleanNext = normalizePinInput(nextPin, pinDigits);
  if (cleanNext.length !== pinDigits) {
    return { ok: false, error: `Enter a ${pinDigits}-digit PIN.` };
  }
  if (hasExistingPin && role !== "admin") {
    const currentDigits = normalizeUserPinDigits(pinState.record.pin_digits);
    const cleanCurrent = normalizePinInput(currentPin, currentDigits);
    if (!verifyUserPin(pinState.record, cleanCurrent)) {
      return { ok: false, error: "Current PIN did not match." };
    }
  }
  if (!hasExistingPin && !allowBootstrap && role !== "admin") {
    return { ok: false, error: "Initial PIN setup requires bootstrap mode." };
  }
  const pinRecord = createUserPinRecord(cleanNext, pinDigits);
  const payload = {
    ...(profileRow || { id: 1 }),
    name: trim(ownerName) || profileRow?.name || "",
    cellar_name: trim(cellarName) || profileRow?.cellar_name || "",
  };
  const savedRow = await saveProfilePayload(payload);
  if (hasExternalPinStoreConfig()) {
    await saveUserPinRecord({
      pin_hash: pinRecord.pin_hash,
      pin_salt: pinRecord.pin_salt,
      pin_digits: pinRecord.pin_digits,
      updated_at: new Date().toISOString(),
    });
  } else {
    await saveProfilePayload({
      ...payload,
      pin_hash: pinRecord.pin_hash,
      pin_salt: pinRecord.pin_salt,
      pin_digits: pinRecord.pin_digits,
    });
  }
  return {
    ok: true,
    profile: {
      ...sanitizeProfile(savedRow || payload),
      pinEnabled: true,
      pinDigits: pinRecord.pin_digits,
    },
    fingerprint: pinRecord.pin_hash,
  };
};

module.exports = {
  ADMIN_PIN_DIGITS,
  normalizeUserPinDigits,
  normalizePinInput,
  sanitizeProfile,
  sanitizeProfilePreview,
  createUserPinRecord,
  verifyUserPin,
  verifyAdminPin,
  setSessionCookie,
  clearSessionCookie,
  resolveSession,
  requireSession,
  bootstrapPayload,
  loginWithPin,
  setupOrChangeUserPin,
};
