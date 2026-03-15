const { requireSession, setupOrChangeUserPin, setSessionCookie } = require("./_lib/auth");
const { getProfileRow } = require("./_lib/supabase");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const action = String(body.action || "");
    if (action === "setup") {
      const profileRow = await getProfileRow().catch(() => null);
      const hasPin = !!((profileRow?.pin_hash || "").trim() && (profileRow?.pin_salt || "").trim());
      if (hasPin) return res.status(409).json({ error: "Winery PIN already exists." });
      const result = await setupOrChangeUserPin({
        ownerName: body.ownerName,
        cellarName: body.cellarName,
        nextPin: body.nextPin,
        digits: body.digits,
        allowBootstrap: true,
      });
      if (!result.ok) return res.status(400).json({ error: result.error || "PIN setup failed" });
      setSessionCookie(res, { role: "user", fingerprint: result.fingerprint });
      return res.status(200).json({ ok: true, role: "user", profile: result.profile });
    }
    const session = await requireSession(req, res);
    if (!session) return;
    if (action === "change") {
      const result = await setupOrChangeUserPin({
        currentPin: body.currentPin,
        nextPin: body.nextPin,
        digits: body.digits,
        role: session.role,
      });
      if (!result.ok) return res.status(400).json({ error: result.error || "PIN update failed" });
      if (session.role === "user") {
        setSessionCookie(res, { role: "user", fingerprint: result.fingerprint });
      }
      return res.status(200).json({ ok: true, role: session.role, profile: result.profile });
    }
    return res.status(400).json({ error: "Unknown PIN action" });
  } catch (err) {
    return res.status(500).json({ error: err.message || "PIN route failed" });
  }
};
