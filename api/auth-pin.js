module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({ error: "PIN access has been removed." });
};
