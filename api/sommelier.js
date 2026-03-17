const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY = 24;
const { requireSession } = require("./_lib/auth");

const SYSTEM_PROMPT = `You are Vinology Sommelier, the cellar copilot for one private winery app.
You should feel like a real conversational assistant, but you must stay grounded in the supplied live data.
Rules:
- Use the provided cellar, audit, profile, and memory context as the factual source of truth.
- Never invent wines, locations, dates, bottle counts, prices, audits, or reviews.
- Treat memory as preference context only, never as proof of cellar facts.
- Use conversation history to resolve follow-up references like "it", "that one", "the second one", or small misspellings.
- Prefer answering directly when the likely meaning is clear. Do not ask for clarification unless multiple plausible answers remain and the supplied data cannot narrow it down.
- If you make a reasonable assumption from conversation context, state it briefly only when helpful.
- For yes/no questions, answer yes or no first.
- For list requests, return up to the requested count with exact cellar wine names.
- For location answers include location, section, and slot when available.
- For date answers give one exact date first, then short context.
- Keep the tone natural, precise, and helpful.
- Never say robotic phrases like "I can answer that from your live cellar data".`;
const RETRY_APPEND_PROMPT = `
Additional strict output requirements:
- If you provide a wine list, every numbered line must include an exact wine name from the provided cellar JSON.
- Do not output truncated lines.
- Prefer plain text (no markdown tables).
- If data is insufficient, say that clearly instead of guessing.
- Resolve follow-up references from conversation context instead of falling back to a generic clarification.`;
const INTENT_ROUTER_PROMPT = `You are an intent router for a wine cellar assistant.
Return ONLY compact JSON with:
{
  "intent": "one of the allowed intents",
  "wineName": "string or empty",
  "count": number or null,
  "targetYear": number or null,
  "confidence": 0..1
}
Allowed intents:
- list_ready_wines
- list_not_ready_wines
- list_past_peak_wines
- list_no_window_wines
- cellar_summary
- latest_added
- wine_location
- wine_purchase_date
- wine_added_date
- wine_bottle_counts
- list_wines
- audit_latest_status
- audit_missing
- journal_for_wine
- journal_with_notes
- journal_without_notes
- open_next
- forecast_past_peak_soon
- forecast_low_stock
- forecast_ready_in_year
- profile_memory
- unknown
Rules:
- Understand natural language and paraphrases.
- Prefer "list_*" intents for questions asking for wines + quantities.
- If user asks for "past peak / over peak / beyond peak / peaked already", map to list_past_peak_wines.
- Keep confidence realistic.
- Output JSON only; no markdown.`;

const clean = v => (v == null ? "" : String(v).trim());
const low = v => clean(v).toLowerCase();
const num = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const isArr = v => Array.isArray(v);
const safeArr = v => (Array.isArray(v) ? v : []);
const parseJsonObject = raw => {
  const txt = clean(raw);
  if (!txt) return null;
  try {
    return JSON.parse(txt);
  } catch {}
  const start = txt.indexOf("{");
  const end = txt.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const body = txt.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};
const clamp01 = n => Math.max(0, Math.min(1, Number(n) || 0));

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

const parsePositiveCount = (q, fallback = 10) => {
  const m = clean(q).match(/\b(\d{1,3})\b/);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(100, n);
};

const parseFutureYearFromQuery = q => {
  const txt = low(q);
  const currentYear = new Date().getFullYear();
  if (/\bnext year\b/.test(txt)) return currentYear + 1;
  const inYears = txt.match(/\bin\s+(\d{1,2})\s+years?\b/);
  if (inYears) return currentYear + Math.max(0, Number(inYears[1] || 0));
  const explicitYear = txt.match(/\b(20\d{2})\b/);
  if (explicitYear) return Number(explicitYear[1]);
  return null;
};

const parseOrdinalRef = q => {
  const txt = low(q);
  const ordinals = {
    first: 1, "1st": 1,
    second: 2, "2nd": 2,
    third: 3, "3rd": 3,
    fourth: 4, "4th": 4,
    fifth: 5, "5th": 5,
    sixth: 6, "6th": 6,
    seventh: 7, "7th": 7,
    eighth: 8, "8th": 8,
    ninth: 9, "9th": 9,
    tenth: 10, "10th": 10,
  };
  for (const [label, value] of Object.entries(ordinals)) {
    if (new RegExp(`\\b${label}\\b`).test(txt)) return value;
  }
  return null;
};

const readyToDrinkIntent = q => {
  const txt = low(q);
  const hasWineRef = /\bwines?\b|\bbottles?\b/.test(txt);
  const hasReady = /\bready\b/.test(txt);
  const hasDrinkWord = /\bdrink\b|\bdrinking\b|\bdrunk\b|\bopen\b/.test(txt);
  if (hasReady && hasDrinkWord) return true;
  if (/\bready to be drunk\b/.test(txt)) return true;
  if (/\bready now\b/.test(txt) && hasWineRef) return true;
  return false;
};

const classifyReadinessQuery = q => {
  const txt = low(q).replace(/’/g, "'");
  const asksReadiness =
    /\bready\b/.test(txt) ||
    /\bdrink\b|\bdrinking\b|\bdrunk\b|\bopen\b/.test(txt) ||
    /\btoo young\b|\bnot yet\b|\bwait\b|\bpast peak\b|\bover the hill\b|\bpeak\b/.test(txt);
  if (!asksReadiness) return "";

  if (
    /\bnot\s+ready\b|\bnot yet\b|\btoo\s+young\b|\bwait\b/.test(txt) ||
    /\baren't\s+ready\b|\baren't\s+yet\b|\bisn't\s+ready\b/.test(txt) ||
    /\bnot\b.{0,20}\bready\b/.test(txt)
  ) return "early";
  if (
    /\bpast\s+peak\b|\bover\s+the\s+hill\b|\bpast\b.*\bdrink\b/.test(txt) ||
    /\bpast\b.{0,20}\bpeak\b|\bover\b.{0,20}\bpeak\b|\bbeyond\b.{0,20}\bpeak\b/.test(txt) ||
    /\bpeak\b.{0,20}\bpassed\b/.test(txt)
  ) return "late";
  if (/\bno\s+window\b|\bunknown\s+window\b/.test(txt)) return "none";
  if (readyToDrinkIntent(txt)) return "ready";
  return "";
};

const readinessState = wine => {
  const currentYear = new Date().getFullYear();
  const start = num(wine?.drinkFrom);
  const end = num(wine?.drinkBy);
  if (!start && !end) return "none";
  if (start && currentYear < start) return "early";
  if (end && currentYear > end) return "late";
  return "ready";
};

const journalHasContent = wine => {
  if (clean(wine?.review)) return true;
  if (clean(wine?.personalNotes)) return true;
  return safeArr(wine?.otherReviews).some(r => clean(r?.text) || clean(r?.reviewer) || clean(r?.rating));
};

const rrpValueForWine = wine => {
  const per = num(wine?.rrpPerBottle) || 0;
  const purchased = Math.max(0, Math.round(num(wine?.bottlesPurchased) || 0));
  return per * purchased;
};

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

const listMentionsFromText = (text, cellar) => {
  const out = [];
  const seen = new Set();
  clean(text)
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .forEach(line => {
      const numbered = line.replace(/^\d+\.\s+/, "");
      const found = pickExplicitWine(numbered, cellar);
      const key = clean(found?.name);
      if (found && key && !seen.has(key)) {
        seen.add(key);
        out.push(found);
      }
    });
  return out;
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

const pickOrdinalFromHistory = (message, history, cellar) => {
  const ordinal = parseOrdinalRef(message);
  if (!ordinal) return null;
  const msgs = safeArr(history).slice(-8).reverse();
  for (const h of msgs) {
    const refs = listMentionsFromText(h?.text || "", cellar);
    if (refs[ordinal - 1]) return refs[ordinal - 1];
  }
  return null;
};

const resolveWine = (message, cellar, history) => {
  const explicit = pickExplicitWine(message, cellar);
  if (explicit) return explicit;
  const q = low(message);
  const ordinal = pickOrdinalFromHistory(message, history, cellar);
  if (ordinal) return ordinal;
  if (/(latest|last|newest)\s+(wine|bottle|one)/.test(q)) return latestWine(cellar);
  if (/\b(it|that|this|the one|that wine|this wine)\b/.test(q)) return pickFromHistory(history, cellar);
  const words = clean(message).split(/\s+/).filter(Boolean).length;
  if (words <= 8 && /\b(when|where|date|location|how many|how much)\b/.test(q)) {
    return pickFromHistory(history, cellar);
  }
  return null;
};

const isListIntent = q => /\b(list|show|give me|top|which)\b/.test(low(q)) && /\bwines?\b/.test(low(q));
const isDeterministicDataQuery = q => {
  const txt = low(q);
  const inventorySignals =
    /\b(cellar|inventory|collection|summary|overview|journal|review|notes?|audit)\b/.test(txt) ||
    /\bready\b|\bdrink\b|\bpurchase|purchased|added\b|\blocation|stored|where\b/.test(txt) ||
    /\bforecast|predict|projection|run out|depletion|low stock|past peak|peak\b/.test(txt) ||
    /\bhow many\b|\bbottles?\b|\brrp\b|\bvalue\b/.test(txt) ||
    (/\b(list|show|which|what)\b/.test(txt) && /\bwines?\b/.test(txt));
  const creativeSignals =
    /\b(pair|pairing|food|dinner|menu|taste|decant|serving|temperature|recipe|occasion|gift|compare|blend)\b/.test(txt);
  return inventorySignals && !creativeSignals;
};

const validateModelAnswer = ({ message, text, cellar }) => {
  const out = clean(text);
  if (!out) return { ok: false, reason: "empty-response" };

  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || "";
  if (/,\s*\d{0,4}$/.test(last) || /[:\-–—]\s*$/.test(last) || /\(\s*\d{0,4}\s*$/.test(last)) {
    return { ok: false, reason: "truncated-ending" };
  }
  if (((out.match(/\*\*/g) || []).length % 2) === 1) {
    return { ok: false, reason: "unbalanced-markdown" };
  }
  if (((out.match(/\(/g) || []).length !== (out.match(/\)/g) || []).length)) {
    return { ok: false, reason: "unbalanced-parentheses" };
  }

  const numbered = lines.filter(l => /^\d+\.\s+/.test(l));
  const listExpected = isListIntent(message) || numbered.length >= 3;
  const askedCount = parsePositiveCount(message, 0);
  if (listExpected && askedCount > 0 && numbered.length > 0 && numbered.length < Math.min(askedCount, safeArr(cellar).length)) {
    return { ok: false, reason: "short-list" };
  }
  if (listExpected && numbered.length) {
    const badLines = numbered.filter(line => !pickExplicitWine(line, cellar));
    if (badLines.length > 0) {
      return { ok: false, reason: "list-items-not-matching-cellar" };
    }
  }
  return { ok: true, reason: "ok" };
};

const canonicalQuestionFromIntent = hint => {
  const intent = clean(hint?.intent);
  const wineName = clean(hint?.wineName);
  const count = Math.max(1, Math.min(100, Number(hint?.count) || 10));
  const year = Number(hint?.targetYear) || null;
  switch (intent) {
    case "list_ready_wines":
      return `give me ${count} wines that are ready to drink`;
    case "list_not_ready_wines":
      return `give me ${count} wines that are not ready to drink`;
    case "list_past_peak_wines":
      return `give me ${count} wines that are past peak`;
    case "list_no_window_wines":
      return `give me ${count} wines with no drink window`;
    case "cellar_summary":
      return "cellar summary";
    case "latest_added":
      return "latest wine added";
    case "wine_location":
      return wineName ? `where is ${wineName}` : "wine location";
    case "wine_purchase_date":
      return wineName ? `when did i purchase ${wineName}` : "wine purchase date";
    case "wine_added_date":
      return wineName ? `when was ${wineName} added to inventory` : "wine added date";
    case "wine_bottle_counts":
      return wineName ? `how many bottles left for ${wineName}` : "how many bottles do i have";
    case "list_wines":
      return `list ${count} wines in my cellar`;
    case "audit_latest_status":
      return "latest audit status";
    case "audit_missing":
      return `list ${count} missing wines from latest audit`;
    case "journal_for_wine":
      return wineName ? `journal for ${wineName}` : "journal";
    case "journal_with_notes":
      return `list ${count} wines with journal notes`;
    case "journal_without_notes":
      return `list ${count} wines with no journal notes`;
    case "open_next":
      return `what should i open next`;
    case "forecast_past_peak_soon":
      return `which wines may pass peak soon`;
    case "forecast_low_stock":
      return `which wines are low stock`;
    case "forecast_ready_in_year":
      return year ? `which wines become ready in ${year}` : `what will be ready next year`;
    case "profile_memory":
      return "what do you remember about me";
    default:
      return "";
  }
};

const timestampMs = raw => parseDate(raw)?.getTime() || -1;

const updatedWineTimestamp = wine => {
  const created = timestampMs(wine?.createdAt);
  const updated = timestampMs(wine?.updatedAt);
  const journal = timestampMs(wine?.journalUpdatedAt);
  const added = timestampMs(wine?.addedDate);
  return Math.max(created, updated, journal, added, sortableTimestamp(wine));
};

const summarizeWine = wine => {
  if (!wine) return null;
  return {
    name: clean(wine?.name),
    varietal: clean(wine?.varietal),
    wineType: clean(wine?.wineType),
    vintage: wine?.vintage ?? null,
    origin: clean(wine?.origin),
    location: clean(wine?.location),
    locationSection: clean(wine?.locationSection),
    locationSlot: clean(wine?.locationSlot),
    bottlesLeft: Math.max(0, Math.round(num(wine?.bottlesLeft) || 0)),
    bottlesPurchased: Math.max(0, Math.round(num(wine?.bottlesPurchased) || 0)),
    bottlesConsumed: Math.max(0, Math.round(num(wine?.bottlesConsumed) || 0)),
    datePurchased: clean(wine?.datePurchased),
    addedDate: clean(wine?.addedDate),
    createdAt: clean(wine?.createdAt),
    updatedAt: clean(wine?.updatedAt),
    journalUpdatedAt: clean(wine?.journalUpdatedAt),
    drinkFrom: clean(wine?.drinkFrom),
    drinkBy: clean(wine?.drinkBy),
    rrpPerBottle: num(wine?.rrpPerBottle),
    paidPerBottle: num(wine?.paidPerBottle),
    reviewPrimaryReviewer: clean(wine?.reviewPrimaryReviewer),
    reviewPrimaryRating: clean(wine?.reviewPrimaryRating),
    review: clean(wine?.review).slice(0, 280),
    personalNotes: clean(wine?.personalNotes).slice(0, 280),
    hasJournalContent: journalHasContent(wine),
  };
};

const cellarSummary = cellar => {
  const wines = safeArr(cellar);
  const totalWines = wines.length;
  const totalLeft = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w?.bottlesLeft) || 0)), 0);
  const totalPurchased = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w?.bottlesPurchased) || 0)), 0);
  const totalConsumed = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w?.bottlesConsumed) || 0)), 0);
  const totalRrp = wines.reduce((s, w) => s + rrpValueForWine(w), 0);
  const onHandRrp = wines.reduce((s, w) => s + ((num(w?.rrpPerBottle) || 0) * Math.max(0, Math.round(num(w?.bottlesLeft) || 0))), 0);
  const readiness = wines.reduce((acc, w) => {
    const key = readinessState(w);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, { ready: 0, early: 0, late: 0, none: 0 });
  const locationCounts = wines.reduce((acc, w) => {
    const key = clean(w?.location) || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const varietalCounts = wines.reduce((acc, w) => {
    const key = clean(w?.varietal) || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topLocations = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  const topVarietals = Object.entries(varietalCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
  return {
    totalWines,
    totalLeft,
    totalPurchased,
    totalConsumed,
    totalRrp: Number(totalRrp.toFixed(2)),
    onHandRrp: Number(onHandRrp.toFixed(2)),
    readiness,
    topLocations,
    topVarietals,
  };
};

const relevantTokens = text =>
  Array.from(
    new Set(
      normName(text)
        .split(" ")
        .filter(t => t && t.length > 2 && !["wine", "wines", "bottle", "bottles", "cellar", "inventory", "collection", "show", "list", "give", "ready", "drink", "drinking"].includes(t))
    )
  );

const scoreWineAgainstQuery = (wine, message, tokens) => {
  const q = normName(message);
  const name = normName(wine?.name);
  const varietal = normName(wine?.varietal);
  const type = normName(wine?.wineType);
  const origin = normName(wine?.origin);
  const location = normName([wine?.location, wine?.locationSection, wine?.locationSlot].filter(Boolean).join(" "));
  let score = 0;
  if (name && q.includes(name)) score += 220;
  if (varietal && q.includes(varietal)) score += 120;
  if (type && q.includes(type)) score += 80;
  if (origin && q.includes(origin)) score += 80;
  if (location && q.includes(location)) score += 120;
  tokens.forEach(token => {
    if (name.includes(token)) score += 24;
    if (varietal.includes(token)) score += 18;
    if (type.includes(token)) score += 14;
    if (origin.includes(token)) score += 16;
    if (location.includes(token)) score += 18;
    if (String(wine?.vintage || "").includes(token)) score += 10;
  });
  return score;
};

const collectFocusWines = ({ message, cellar, history, hint }) => {
  const wines = safeArr(cellar);
  const q = low(message);
  const tokens = relevantTokens(message);
  const resolved = resolveWine(message, wines, history);
  const recent = pickFromHistory(history, wines);
  const focus = new Map();
  const add = (wine, reason, score = 0) => {
    if (!wine) return;
    const key = clean(wine?.name) || `wine-${focus.size}`;
    const existing = focus.get(key) || { wine, score: 0, reasons: [] };
    existing.score += score;
    if (reason && !existing.reasons.includes(reason)) existing.reasons.push(reason);
    existing.wine = wine;
    focus.set(key, existing);
  };

  if (resolved) add(resolved, "resolved from question or follow-up", 1000);
  if (recent && (!resolved || clean(recent?.name) !== clean(resolved?.name))) add(recent, "recent conversation subject", 700);

  wines.forEach(w => {
    const score = scoreWineAgainstQuery(w, message, tokens);
    if (score > 0) add(w, "query match", score);
  });

  const want = Math.min(18, parsePositiveCount(message, 10));
  const readyState = classifyReadinessQuery(message);
  if (readyState) {
    wines
      .filter(w => readinessState(w) === readyState)
      .sort((a, b) => {
        const endA = num(a?.drinkBy) || 9999;
        const endB = num(b?.drinkBy) || 9999;
        if (endA !== endB) return endA - endB;
        return clean(a?.name).localeCompare(clean(b?.name));
      })
      .slice(0, want)
      .forEach(w => add(w, `${readyState} candidate`, 90));
  }

  if (hint?.intent === "latest_added" || (/\b(latest|newest|recent)\b/.test(q) && /\b(add|added|inventory)\b/.test(q))) {
    wines
      .slice()
      .sort((a, b) => sortableTimestamp(b) - sortableTimestamp(a))
      .slice(0, 12)
      .forEach(w => add(w, "recently added", 60));
  }

  if (/\b(updated|edited|changed|journal)\b/.test(q)) {
    wines
      .slice()
      .sort((a, b) => updatedWineTimestamp(b) - updatedWineTimestamp(a))
      .slice(0, 12)
      .forEach(w => add(w, "recently updated", 55));
  }

  if (/\blow stock|nearly out|almost out|run out|depletion\b/.test(q)) {
    wines
      .filter(w => {
        const left = Math.max(0, Math.round(num(w?.bottlesLeft) || 0));
        return left > 0 && left <= 2;
      })
      .sort((a, b) => (num(a?.bottlesLeft) || 0) - (num(b?.bottlesLeft) || 0))
      .slice(0, want)
      .forEach(w => add(w, "low stock", 70));
  }

  return [...focus.values()]
    .sort((a, b) => b.score - a.score || clean(a.wine?.name).localeCompare(clean(b.wine?.name)))
    .slice(0, 24)
    .map(entry => ({ ...summarizeWine(entry.wine), relevance: entry.reasons }));
};

const buildContextPayload = ({ message, cellar, audits, history, memory, profile, hint }) => {
  const wines = safeArr(cellar);
  const latest = latestWine(wines);
  const latestUpdated = wines.slice().sort((a, b) => updatedWineTimestamp(b) - updatedWineTimestamp(a))[0] || null;
  const resolved = resolveWine(message, wines, history);
  const recentSubject = pickFromHistory(history, wines);
  const latestAudit = safeArr(audits)
    .slice()
    .sort((a, b) => clean(b?.updatedAt || b?.completedAt || b?.createdAt).localeCompare(clean(a?.updatedAt || a?.completedAt || a?.createdAt)))[0] || null;
  return {
    now: new Date().toISOString(),
    query: {
      text: clean(message),
      requestedCount: parsePositiveCount(message, 10),
      readinessMode: classifyReadinessQuery(message) || null,
      targetYear: parseFutureYearFromQuery(message),
      deterministicHint: hint || null,
    },
    summary: cellarSummary(wines),
    resolvedWine: summarizeWine(resolved),
    recentConversationWine: summarizeWine(recentSubject),
    latestWine: summarizeWine(latest),
    latestUpdatedWine: summarizeWine(latestUpdated),
    focusedWines: collectFocusWines({ message, cellar: wines, history, hint }),
    latestAudit: latestAudit || null,
    profile,
    memory,
    cellar: wines,
    audits,
  };
};

const buildModelUserText = ({ message, contextPayload }) => [
  `User question: ${clean(message)}`,
  ``,
  `Grounding context JSON:`,
  JSON.stringify(contextPayload),
  ``,
  `Answer directly from the grounding context. Resolve follow-up references from the conversation when possible. If the question is yes/no, answer that first.`,
].join("\n");

const classifyDeterministicIntent = async ({ message, history, runModel }) => {
  const text = clean(message);
  if (!text) return null;
  const recentHistory = safeArr(history)
    .slice(-4)
    .map(h => `${h.role}: ${clean(h.text).slice(0, 180)}`)
    .join("\n");
  const userText = [
    `Conversation tail (optional):`,
    recentHistory || "(none)",
    ``,
    `User message: ${text}`,
  ].join("\n");
  const out = await runModel({
    systemText: INTENT_ROUTER_PROMPT,
    userText,
    temperature: 0,
    maxOutputTokens: 220,
  });
  if (!out?.aiRes?.ok) return null;
  const parsed = parseJsonObject(out.text);
  if (!parsed || typeof parsed !== "object") return null;
  const intent = clean(parsed.intent);
  if (!intent || intent === "unknown") return null;
  const confidence = clamp01(parsed.confidence);
  if (confidence < 0.4) return null;
  return {
    intent,
    wineName: clean(parsed.wineName),
    count: Number.isFinite(Number(parsed.count)) ? Number(parsed.count) : null,
    targetYear: Number.isFinite(Number(parsed.targetYear)) ? Number(parsed.targetYear) : null,
    confidence,
  };
};

const deterministicAnswer = ({ message, cellar, audits, history, memory, profile }) => {
  const q = low(message);
  const wines = safeArr(cellar);
  const target = resolveWine(message, wines, history);
  const latest = latestWine(wines);
  const latestAudit = safeArr(audits)
    .slice()
    .sort((a, b) => clean(b?.updatedAt).localeCompare(clean(a?.updatedAt)))[0];
  const currentYear = new Date().getFullYear();
  const mem = safeArr(memory).filter(Boolean);

  if (!wines.length) return "Your cellar is empty right now, so I do not have inventory data yet.";

  if (/\b(who am i|my profile|my cellar name|cellar name)\b/.test(q)) {
    const fullName = [clean(profile?.name), clean(profile?.surname)].filter(Boolean).join(" ");
    const cellarName = clean(profile?.cellarName);
    const title = clean(profile?.description);
    const lines = [
      fullName ? `Name: ${fullName}` : null,
      cellarName ? `Cellar: ${cellarName}` : null,
      title ? `Profile: ${title}` : null,
    ].filter(Boolean);
    return lines.length ? lines.join("\n") : "Profile details are not set yet.";
  }

  if (/\bwhat\b.*\bremember\b|\bmy preferences?\b|\bprofile\b/.test(q)) {
    if (!mem.length) return "I don’t have saved tasting preferences yet. Tell me something like: remember I prefer dry high-acid whites.";
    return `Saved memory:\n${mem.slice(0, 10).map((m, i) => `${i + 1}. ${m}`).join("\n")}`;
  }

  if (/\bsummary\b|\boverview\b|\bsnapshot\b|\bcellar value\b|\brrp value\b|\bcollection value\b|\bwinery value\b/.test(q)) {
    const totalWines = wines.length;
    const left = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w.bottlesLeft) || 0)), 0);
    const purchased = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w.bottlesPurchased) || 0)), 0);
    const consumed = wines.reduce((s, w) => s + Math.max(0, Math.round(num(w.bottlesConsumed) || 0)), 0);
    const rrpValue = wines.reduce((s, w) => s + rrpValueForWine(w), 0);
    const ready = wines.filter(w => readinessState(w) === "ready").length;
    const early = wines.filter(w => readinessState(w) === "early").length;
    const late = wines.filter(w => readinessState(w) === "late").length;
    const none = wines.filter(w => readinessState(w) === "none").length;
    const locCounts = wines.reduce((acc, w) => {
      const key = clean(w?.location) || "Unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topLoc = Object.entries(locCounts).sort((a, b) => b[1] - a[1])[0];
    return [
      `Cellar summary:`,
      `- Wines: ${totalWines}`,
      `- Bottles left: ${left}`,
      `- Bottles purchased: ${purchased}`,
      `- Bottles consumed: ${consumed}`,
      `- RRP value (purchased bottles): $${rrpValue.toFixed(2)}`,
      `- Readiness: ready ${ready}, not-ready ${early}, past-peak ${late}, no-window ${none}`,
      topLoc ? `- Most common location: ${topLoc[0]} (${topLoc[1]} wines)` : null,
    ].filter(Boolean).join("\n");
  }

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
  if (target && clean(message).split(/\s+/).filter(Boolean).length <= 8 && /\b(when|what date|date)\b/.test(q)) {
    const added = fmtDate(target.addedDate);
    const bought = fmtDate(target.datePurchased);
    if (added && bought && added !== bought) {
      return `${clean(target.name)} was added on ${added}, and purchased on ${bought}.`;
    }
    const best = added || bought;
    return best
      ? `${clean(target.name)} date on record: ${best}.`
      : `No date is recorded yet for ${clean(target.name)}.`;
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

  if (/\bjournal\b|\bnotes?\b|\breview(s)?\b|\bopinion(s)?\b/.test(q)) {
    if (target) {
      const primaryReviewer = clean(target?.reviewPrimaryReviewer);
      const primaryRating = clean(target?.reviewPrimaryRating);
      const primaryText = clean(target?.review);
      const others = safeArr(target?.otherReviews).filter(r => clean(r?.text) || clean(r?.reviewer) || clean(r?.rating));
      const notes = clean(target?.personalNotes);
      if (!primaryReviewer && !primaryRating && !primaryText && !others.length && !notes) {
        return `No journal content is saved yet for ${clean(target?.name)}.`;
      }
      return [
        `Journal for ${clean(target?.name)}:`,
        primaryReviewer || primaryRating || primaryText
          ? `- Primary review: ${[primaryReviewer, primaryRating].filter(Boolean).join(" · ")}${primaryText ? ` — ${primaryText}` : ""}`
          : null,
        ...others.slice(0, 3).map((r, idx) => `- Other review ${idx + 1}: ${[clean(r?.reviewer), clean(r?.rating)].filter(Boolean).join(" · ")}${clean(r?.text) ? ` — ${clean(r?.text)}` : ""}`),
        notes ? `- Personal notes: ${notes}` : null,
      ].filter(Boolean).join("\n");
    }

    const want = parsePositiveCount(q, 10);
    if (/\bwithout\b.*\bnotes?\b|\bno\s+notes?\b/.test(q)) {
      const noNotes = wines.filter(w => !journalHasContent(w)).slice(0, want);
      if (!noNotes.length) return "All wines currently have some journal content.";
      return `Here are ${noNotes.length} wines with no journal notes/reviews:\n${noNotes.map((w, i) => `${i + 1}. ${clean(w.name)}`).join("\n")}`;
    }
    const withNotes = wines.filter(journalHasContent).slice(0, want);
    if (!withNotes.length) return "No wines have journal content yet.";
    return `Here are ${withNotes.length} wines with journal content:\n${withNotes.map((w, i) => `${i + 1}. ${clean(w.name)}`).join("\n")}`;
  }

  const readinessMode = classifyReadinessQuery(q);
  if (readinessMode) {
    const want = parsePositiveCount(q, 10);
    const ready = wines
      .filter(w => readinessState(w) === readinessMode)
      .sort((a, b) => {
        const endA = num(a?.drinkBy) || 9999;
        const endB = num(b?.drinkBy) || 9999;
        if (endA !== endB) return endA - endB;
        return clean(a?.name).localeCompare(clean(b?.name));
      })
      .slice(0, want);

    if (!ready.length) {
      if (readinessMode === "ready") {
        return "No wines are currently flagged as ready to drink based on your drink window dates.";
      }
      if (readinessMode === "early") {
        return "No wines are currently flagged as not ready yet based on your drink window dates.";
      }
      if (readinessMode === "late") {
        return "No wines are currently flagged as past peak based on your drink window dates.";
      }
      return "No wines are currently flagged with missing drink windows.";
    }

    const lines = ready.map((w, idx) => {
      const name = clean(w?.name) || "Unnamed wine";
      const vintage = clean(w?.vintage);
      const varietal = clean(w?.varietal);
      const from = clean(w?.drinkFrom);
      const to = clean(w?.drinkBy);
      const windowTxt = (from || to) ? ` (${from || "?"}-${to || "?"})` : "";
      const sub = [vintage, varietal].filter(Boolean).join(" · ");
      const subTxt = sub ? ` — ${sub}` : "";
      return `${idx + 1}. ${name}${subTxt}${windowTxt}`;
    });

    const label =
      readinessMode === "ready" ? "ready-to-drink" :
      readinessMode === "early" ? "not-ready-yet" :
      readinessMode === "late" ? "past-peak" :
      "no-window";
    return `Here are ${ready.length} ${label} wines from your cellar:\n${lines.join("\n")}`;
  }

  if (/\b(what should i|what to)\b.*\b(open|drink)\b|\bdrink next\b|\bopen next\b/.test(q)) {
    const want = parsePositiveCount(q, 8);
    const picks = wines
      .filter(w => (num(w?.bottlesLeft) || 0) > 0 && readinessState(w) === "ready")
      .sort((a, b) => {
        const endA = num(a?.drinkBy) || 9999;
        const endB = num(b?.drinkBy) || 9999;
        if (endA !== endB) return endA - endB;
        return clean(a?.name).localeCompare(clean(b?.name));
      })
      .slice(0, want);
    if (!picks.length) return "No ready-to-drink wines are currently available with bottles left.";
    return `Best wines to open next (ready now, earliest drink-by first):\n${picks.map((w, i) => {
      const win = `(${clean(w?.drinkFrom) || "?"}-${clean(w?.drinkBy) || "?"})`;
      return `${i + 1}. ${clean(w?.name)} ${win} · ${locationLine(w)}`;
    }).join("\n")}`;
  }

  if (/\b(pass peak|past peak|expire|too late|over the hill)\b/.test(q) && /\bsoon|next|risk|which|list|show\b/.test(q)) {
    const want = parsePositiveCount(q, 10);
    const upperYear = currentYear + 1;
    const risky = wines
      .filter(w => {
        const end = num(w?.drinkBy);
        return end && end >= currentYear && end <= upperYear;
      })
      .sort((a, b) => (num(a?.drinkBy) || 9999) - (num(b?.drinkBy) || 9999))
      .slice(0, want);
    if (!risky.length) return "No wines are projected to pass peak within the next 12 months.";
    return `Wines at risk of passing peak soon:\n${risky.map((w, i) => `${i + 1}. ${clean(w?.name)} (${clean(w?.drinkFrom) || "?"}-${clean(w?.drinkBy) || "?"})`).join("\n")}`;
  }

  if (/\bready\b/.test(q) && (/\bnext year\b|\bin\s+\d+\s+years?\b|\b20\d{2}\b/.test(q))) {
    const targetYear = parseFutureYearFromQuery(q);
    if (targetYear) {
      const want = parsePositiveCount(q, 12);
      const list = wines
        .filter(w => {
          const start = num(w?.drinkFrom);
          return start && start === targetYear;
        })
        .sort((a, b) => clean(a?.name).localeCompare(clean(b?.name)))
        .slice(0, want);
      if (!list.length) return `No wines are scheduled to first become ready in ${targetYear}.`;
      return `Wines that first become ready in ${targetYear}:\n${list.map((w, i) => `${i + 1}. ${clean(w?.name)} (${clean(w?.drinkFrom) || "?"}-${clean(w?.drinkBy) || "?"})`).join("\n")}`;
    }
  }

  if (/\brun out|depletion|low stock|nearly out|almost out\b/.test(q)) {
    const want = parsePositiveCount(q, 10);
    const lowStock = wines
      .filter(w => {
        const left = Math.max(0, Math.round(num(w?.bottlesLeft) || 0));
        return left > 0 && left <= 2;
      })
      .sort((a, b) => (num(a?.bottlesLeft) || 0) - (num(b?.bottlesLeft) || 0))
      .slice(0, want);
    if (!lowStock.length) return "No wines are currently in low-stock state (1–2 bottles left).";
    return `Low-stock wines:\n${lowStock.map((w, i) => `${i + 1}. ${clean(w?.name)} — ${Math.max(0, Math.round(num(w?.bottlesLeft) || 0))} left`).join("\n")}`;
  }

  if (
    (/\b(cellar|collection|inventory)\b/.test(q) && /\b(list|show|what|which|all)\b/.test(q)) ||
    /\blist\b.*\bwines?\b/.test(q)
  ) {
    const want = parsePositiveCount(q, 10);
    const sorted = wines
      .slice()
      .sort((a, b) => {
        if (/\b(recent|latest|newest)\b/.test(q)) {
          return sortableTimestamp(b) - sortableTimestamp(a);
        }
        return clean(a?.name).localeCompare(clean(b?.name));
      })
      .slice(0, want);
    const lines = sorted.map((w, idx) => {
      const parts = [clean(w?.vintage), clean(w?.varietal)].filter(Boolean).join(" · ");
      return `${idx + 1}. ${clean(w?.name)}${parts ? ` — ${parts}` : ""} (${locationLine(w)})`;
    });
    return `Here are ${sorted.length} wines from your current cellar:\n${lines.join("\n")}`;
  }

  if (/\baudit\b/.test(q) && /(latest|last|recent|status)/.test(q)) {
    if (!latestAudit) return "No audit history found yet.";
    const status = clean(latestAudit.status || "in_progress").replace("_", " ");
    const when = fmtDate(latestAudit.updatedAt || latestAudit.completedAt || latestAudit.createdAt);
    const counts = `present ${num(latestAudit.present) || 0}, missing ${num(latestAudit.missing) || 0}, pending ${num(latestAudit.pending) || 0}`;
    return `Latest audit is "${clean(latestAudit.name || "Audit")}" (${status})${when ? `, updated ${when}` : ""}. Counts: ${counts}.`;
  }

  if (/\baudit\b/.test(q) && (/\bmissing\b|\bnot present\b|\babsent\b/.test(q))) {
    if (!latestAudit) return "No audit history found yet.";
    const names = safeArr(latestAudit.missingWineNames).filter(Boolean);
    if (!names.length) {
      return `Latest audit "${clean(latestAudit.name || "Audit")}" has no named missing-wine entries recorded.`;
    }
    const want = parsePositiveCount(q, 10);
    const list = names.slice(0, want).map((n, i) => `${i + 1}. ${n}`);
    return `Missing wines from latest audit "${clean(latestAudit.name || "Audit")}":\n${list.join("\n")}`;
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
    wineType: clean(w?.wineType),
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
    createdAt: clean(w?.createdAt),
    updatedAt: clean(w?.updatedAt),
    journalUpdatedAt: clean(w?.journalUpdatedAt),
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

const compactAudits = audits =>
  safeArr(audits)
    .slice(0, 20)
    .map(a => ({
      id: clean(a?.id),
      name: clean(a?.name),
      status: clean(a?.status),
      createdAt: clean(a?.createdAt),
      updatedAt: clean(a?.updatedAt),
      completedAt: clean(a?.completedAt),
      locations: safeArr(a?.locations).map(clean).filter(Boolean).slice(0, 20),
      present: num(a?.present) || 0,
      missing: num(a?.missing) || 0,
      pending: num(a?.pending) || 0,
      total: num(a?.total) || 0,
      missingWineNames: safeArr(a?.missingWineNames).map(clean).filter(Boolean).slice(0, 200),
      presentWineNames: safeArr(a?.presentWineNames).map(clean).filter(Boolean).slice(0, 200),
    }));

const compactMemory = memory =>
  safeArr(memory)
    .map(clean)
    .filter(Boolean)
    .slice(0, 80);

const compactProfile = profile => ({
  name: clean(profile?.name),
  surname: clean(profile?.surname),
  cellarName: clean(profile?.cellarName),
  country: clean(profile?.country),
  description: clean(profile?.description),
});

const extractGeminiText = data =>
  safeArr(data?.candidates)
    .flatMap(c => safeArr(c?.content?.parts))
    .map(p => clean(p?.text))
    .filter(Boolean)
    .join("\n")
    .trim();

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const session = await requireSession(req, res);
  if (!session) return;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY on server." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const message = clean(body.message);
    const cellar = compactCellar(body.cellar);
    const audits = compactAudits(body.audits);
    const memory = compactMemory(body.memory);
    const profile = compactProfile(body.profile);
    const history = clampHistory(body.history);
    if (!message) return res.status(400).json({ error: "Message is required." });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const runModel = async ({ systemText, userText, temperature = 0.2, maxOutputTokens = 900 }) => {
      const reqContents = [
        ...history.map(h => ({
          role: h.role,
          parts: [{ text: h.text }],
        })),
        {
          role: "user",
          parts: [{ text: userText }],
        },
      ];
      const aiRes = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemText }] },
          contents: reqContents,
          generationConfig: {
            temperature,
            maxOutputTokens,
            topP: 0.9,
          },
        }),
      });
      const data = await aiRes.json().catch(() => ({}));
      return { aiRes, data, text: extractGeminiText(data) };
    };

    const direct = deterministicAnswer({ message, cellar, audits, history, memory, profile });
    if (direct) return res.status(200).json({ text: direct });

    let hint = null;
    if (isDeterministicDataQuery(message)) {
      hint = await classifyDeterministicIntent({ message, history, runModel });
      const canonical = canonicalQuestionFromIntent(hint);
      if (canonical) {
        const rerouted = deterministicAnswer({ message: canonical, cellar, audits, history, memory, profile });
        if (rerouted) return res.status(200).json({ text: rerouted });
      }
    }

    const contextPayload = buildContextPayload({ message, cellar, audits, history, memory, profile, hint });
    const baseUserText = buildModelUserText({ message, contextPayload });
    const first = await runModel({
      systemText: SYSTEM_PROMPT,
      userText: baseUserText,
      temperature: isDeterministicDataQuery(message) ? 0.08 : 0.22,
      maxOutputTokens: 1100,
    });
    if (!first.aiRes.ok) {
      const err = first.data?.error?.message || "Gemini request failed.";
      return res.status(first.aiRes.status).json({ error: err });
    }

    let finalText = first.text || "";
    let validation = validateModelAnswer({ message, text: finalText, cellar });

    if (!validation.ok) {
      const retry = await runModel({
        systemText: `${SYSTEM_PROMPT}\n${RETRY_APPEND_PROMPT}`,
        userText: `${baseUserText}\n\nPrevious draft failed validation: ${validation.reason}. Rewrite from scratch.`,
        temperature: 0.1,
        maxOutputTokens: 1200,
      });
      if (retry.aiRes.ok) {
        const retryValidation = validateModelAnswer({ message, text: retry.text || "", cellar });
        if (retryValidation.ok) {
          finalText = retry.text || "";
          validation = retryValidation;
        }
      }
    }

    if (!finalText || !validation.ok) {
      return res.status(200).json({
        text: "I couldn’t verify a reliable answer from the current cellar data for that request. Ask it again in a slightly simpler way and I’ll answer from the live cellar, journal, audit, and profile context.",
      });
    }

    return res.status(200).json({ text: finalText });
  } catch (err) {
    return res.status(500).json({ error: `Sommelier error: ${err.message || "Unknown error"}` });
  }
};
