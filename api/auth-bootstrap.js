const { bootstrapPayload } = require("./_lib/auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    return res.status(200).json(await bootstrapPayload(req));
  } catch (err) {
    return res.status(500).json({ error: err.message || "Bootstrap failed" });
  }
};
