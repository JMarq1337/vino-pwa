const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const SYSTEM_PROMPT = `You are Vinology Sommelier, a concise and practical cellar assistant.
Rules:
- Use only the provided cellar JSON data for inventory facts.
- If data is missing, say that directly.
- Prefer short, actionable answers.
- For "where is X" include location, section, and slot/box when present.
- For "when did I buy X" use datePurchased; if missing, say not recorded.
- Never invent wines or numbers.`;

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY on server." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const message = (body.message || "").toString().trim();
    const cellar = Array.isArray(body.cellar) ? body.cellar : [];
    if (!message) return res.status(400).json({ error: "Message is required." });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const userPrompt = `Question: ${message}\n\nCellar JSON:\n${JSON.stringify(cellar)}`;

    const aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 650
        }
      })
    });

    const data = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      const err = data?.error?.message || "Gemini request failed.";
      return res.status(aiRes.status).json({ error: err });
    }

    const text = (data?.candidates || [])
      .flatMap(c => c?.content?.parts || [])
      .map(p => p?.text || "")
      .join("\n")
      .trim();

    return res.status(200).json({ text: text || "No response from model." });
  } catch (err) {
    return res.status(500).json({ error: `Sommelier error: ${err.message || "Unknown error"}` });
  }
};

