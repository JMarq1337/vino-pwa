const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY = 18;

const SYSTEM_PROMPT = `You are Vinology Sommelier, a practical assistant for one private cellar.
Rules:
- Use ONLY the provided cellar + audit data for facts.
- Never invent wines, locations, dates, prices, or bottle counts.
- If data is missing, say exactly that.
- Follow conversation context: if user says "it/that one", resolve from recent chat context.
- Keep answers concise and structured.
- For location answers include location + section + slot when available.
- For date questions, return one exact date first, then short context if needed.
- If a question is ambiguous, ask one short clarifying question.`;

const clean = v => (v == null ? "" : String(v).trim());
const low = v => clean(v).toLowerCase();
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isArr = v => Array.isArray(v);
const safeArr = v => (Array.isArray(v) ? v : []);

const parseDate = raw => {
  const txt = clean(raw);
  if (!txt) return null;
  const d = new Date(txt);
  if (!Number.isNaN(d.getTime())) return d;
  const m = txt.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const alt = new Date(year, month - 1, day);
    if (!Number.isNaN(alt.getTime())) return alt;
  }
  return null;
};

const fmtDate = raw => {
  const d = parseDate(raw);
  if (!d) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
};

const normName = name =>
  low(name)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sortableTimestamp = wine => {
  const a = parseDate(wine?.addedDate)?.getTime() || -1;
  const p = parseDate(wine?.datePurchased)?.getTime() || -1;
  const c = parseDate(wine?.createdAt)?.getTime() || -1;
  return Math.max(a, p, c);
};

const latestWine = cellar =>
  safeArr(cellar)
    .slice()
    .sort((x, y) => sortableTimestamp(y) - sortableTimestamp(x))[0] || null;

const locationLine = wine => {
  const parts = [clean(wine?.location), clean(wine?.locationSection), clean(wine?.locationSlot)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Location not recorded";
};

const pickExplicitWine = (message, cellar) => {
  const q = normName(message);
  if (!q) return null;
  let best = null;
  let bestScore = 0;
  for (const wine of safeArr(cellar)) {
    const wn = normName(wine?.name);
    if (!wn) continue;
    if (q.includes(wn)) {
      const score = 100 + wn.length;
      if (score > bestScore) {
        best = wine;
        bestScore = score;
      }
      continue;
    }
    const toks = wn.split(" ").filter(Boolean);
    const hit = toks.filter(t => t.length > 2 && q.includes(t)).length;
    if (hit >= 2 || (hit === 1 && toks.length === 1)) {
      const score = hit * 10 + wn.length;
      if (score > bestScore) {
        best = wine;
        bestScore = score;
      }
    }
  }
  return best;
};

const pickFromHistory = (history, cellar) => {
  const msgs = safeArr(history).slice(-10).reverse();
  for (const h of msgs) {
    const txt = normName(h?.text || "");
    if (!txt) continue;
    const m = pickExplicitWine(txt, cellar);
    if (m) return m;
  }
  return null;
};

const resolveWine = (message, cellar, history) => {
  const explicit = pickExplicitWine(message, cellar);
  if (explicit) return explicit;
  const q = low(message);
  if (/(latest|last|newest)\s+(wine|bottle|one)/.test(q)) return latestWine(cellar);
  if (/\b(it|that|this|the one)\b/.test(q)) return pickFromHistory(history, cellar);
  return null;
};

const deterministicAnswer = ({ message, cellar, audits, history }) => {
  const q = low(message);
  const wines = safeArr(cellar);
  const target = resolveWine(message, wines, history);
  const latest = latestWine(wines);
  const latestAudit = safeArr(audits)
    .slice()
    .sort((a, b) => clean(b?.updatedAt).localeCompare(clean(a?.updatedAt)))[0];

  if (!wines.length) return "Your cellar is empty right now, so I do not have inventory data yet.";

  if (/(latest|last|newest).*(wine|added|bottle)/.test(q)) {
    if (!latest) return "I could not determine a latest wine because no added or purchase date is recorded.";
    const when = fmtDate(latest.addedDate || latest.datePurchased);
    const whenTxt = when ? ` on ${when}` : "";
    return `Latest wine added appears to be ${clean(latest.name)}${whenTxt}. Location: ${locationLine(latest)}.`;
  }

  if (/\bwhere\b|\blocation\b|\bstored?\b/.test(q)) {
    if (!target) return "Tell me the wine name and I’ll give you the exact storage location.";
    return `${clean(target.name)} is stored at ${locationLine(target)}.`;
  }

  if (/\bwhen\b.*\b(buy|bought|purchase|purchased)\b/.test(q)) {
    if (!target) return "Tell me which wine you mean, and I’ll check its purchase date.";
    const dt = fmtDate(target.datePurchased);
    return dt
      ? `You purchased ${clean(target.name)} on ${dt}.`
      : `Purchase date for ${clean(target.name)} is not recorded.`;
  }

  if (/\bwhen\b.*\b(add|added|inventory|cellar)\b/.test(q)) {
    if (!target) return "Tell me which wine you mean, and I’ll check when it was added.";
    const dt = fmtDate(target.addedDate || target.datePurchased);
    return dt
      ? `${clean(target.name)} was added to inventory on ${dt}.`
      : `Added date for ${clean(target.name)} is not recorded.`;
  }

  if (/\bhow many\b|\bcount\b|\bbottles?\b.*\b(left|remaining|have)\b/.test(q)) {
    if (target) {
      const left = Math.max(0, Math.round(num(target.bottlesLeft) || 0));
      const purchased = Math.max(0, Math.round(num(target.bottlesPurchased) || 0));
      const consumed = Math.max(0, Math.round(num(target.bottlesConsumed) || 0));
      return `${clean(target.name)}: ${left} left, ${consumed} consumed, ${purchased} purchased total.`;
    }
    const totalLeft = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w.bottlesLeft) || 0)), 0);
    return `You currently have ${totalLeft} bottles left across ${wines.length} wines.`;
  }

  if (/\baudit\b/.test(q) && /(latest|last|recent|status)/.test(q)) {
    if (!latestAudit) return "No audit history found yet.";
    const status = clean(latestAudit.status || "in_progress").replace("_", " ");
    const when = fmtDate(latestAudit.updatedAt || latestAudit.completedAt || latestAudit.createdAt);
    const counts = `present ${num(latestAudit.present) || 0}, missing ${num(latestAudit.missing) || 0}, pending ${num(latestAudit.pending) || 0}`;
    return `Latest audit is "${clean(latestAudit.name || "Audit")}" (${status})${when ? `, updated ${when}` : ""}. Counts: ${counts}.`;
  }

  return null;
};

const toGeminiRole = role => (role === "assistant" ? "model" : "user");

const clampHistory = history =>
  safeArr(history)
    .slice(-MAX_HISTORY)
    .map(h => ({
      role: toGeminiRole(h?.role),
      text: clean(h?.text).slice(0, 2200),
    }))
    .filter(h => h.text);

const compactCellar = cellar =>
  safeArr(cellar).map(w => ({
    name: clean(w?.name),
    varietal: clean(w?.varietal),
    vintage: w?.vintage ?? null,
    origin: clean(w?.origin),
    location: clean(w?.location),
    locationSection: clean(w?.locationSection),
    locationSlot: clean(w?.locationSlot),
    bottlesLeft: Math.max(0, Math.round(num(w?.bottlesLeft) || 0)),
    bottlesPurchased: Math.max(0, Math.round(num(w?.bottlesPurchased) || 0)),
    bottlesConsumed: Math.max(0, Math.round(num(w?.bottlesConsumed) || 0)),
    datePurchased: clean(w?.datePurchased),
    addedDate: clean(w?.addedDate),
    drinkFrom: clean(w?.drinkFrom),
    drinkBy: clean(w?.drinkBy),
    rrpPerBottle: num(w?.rrpPerBottle),
    paidPerBottle: num(w?.paidPerBottle),
    reviewPrimaryReviewer: clean(w?.reviewPrimaryReviewer),
    reviewPrimaryRating: clean(w?.reviewPrimaryRating),
    review: clean(w?.review).slice(0, 800),
    personalNotes: clean(w?.personalNotes).slice(0, 800),
    otherReviews: safeArr(w?.otherReviews).slice(0, 3).map(r => ({
      reviewer: clean(r?.reviewer),
      rating: clean(r?.rating),
      text: clean(r?.text).slice(0, 260),
    })),
  }));

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY on server." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = clean(body.message);
    const cellar = compactCellar(body.cellar);
    const audits = safeArr(body.audits).slice(0, 20);
    const history = clampHistory(body.history);
    if (!message) return res.status(400).json({ error: "Message is required." });

    const direct = deterministicAnswer({ message, cellar, audits, history });
    if (direct) return res.status(200).json({ text: direct });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contextPayload = {
      cellar,
      audits,
      now: new Date().toISOString(),
    };

    const contents = [
      ...history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
      {
        role: "user",
        parts: [
          {
            text: `Context JSON:\n${JSON.stringify(contextPayload)}\n\nUser question: ${message}`,
          },
        ],
      },
    ];

    const aiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 700,
          topP: 0.9,
        },
      }),
    });

    const data = await aiRes.json().catch(() => ({}));
    if (!aiRes.ok) {
      const err = data?.error?.message || "Gemini request failed.";
      return res.status(aiRes.status).json({ error: err });
    }

    const text = safeArr(data?.candidates)
      .flatMap(c => safeArr(c?.content?.parts))
      .map(p => clean(p?.text))
      .filter(Boolean)
      .join("\n")
      .trim();

    return res.status(200).json({ text: text || "I could not generate an answer from the current cellar data." });
  } catch (err) {
    return res.status(500).json({ error: `Sommelier error: ${err.message || "Unknown error"}` });
  }
};
