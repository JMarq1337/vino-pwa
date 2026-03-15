const { loginWithPin, setSessionCookie } = require("./_lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const result = await loginWithPin({ role: body.role, pin: body.pin });
    if (!result.ok) return res.status(401).json({ error: result.error || "Login failed" });
    setSessionCookie(res, { role: result.role, fingerprint: result.fingerprint });
    return res.status(200).json({ ok: true, role: result.role, profile: result.profile });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Login failed" });
  }
};
