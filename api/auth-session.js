const { resolveSession } = require("./_lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const session = await resolveSession(req);
    return res.status(200).json({
      authenticated: session.authenticated,
      role: session.authenticated ? session.role : "user",
      profile: session.authenticated ? session.profile : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Session check failed" });
  }
};
