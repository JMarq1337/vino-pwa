const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_HISTORY = 18;

const SYSTEM_PROMPT = `You are Vinology Sommelier, a practical assistant for one private cellar.
Rules:
- Use ONLY the provided cellar + audit data for facts.
- Never invent wines, locations, dates, prices, or bottle counts.
- Treat user memory as personalization only, never as a source of cellar facts.
- If data is missing, say exactly that.
- Follow conversation context: if user says "it/that one", resolve from recent chat context.
- Keep answers concise and structured.
- For location answers include location + section + slot when available.
- For date questions, return one exact date first, then short context if needed.
- If a question is ambiguous, ask one short clarifying question.`;
const RETRY_APPEND_PROMPT = `
Additional strict output requirements:
- If you provide a wine list, every numbered line must include an exact wine name from the provided cellar JSON.
- Do not output truncated lines.
- Prefer plain text (no markdown tables).
- If data is insufficient, say that clearly instead of guessing.`;

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
    /\btoo young\b|\bnot yet\b|\bwait\b|\bpast peak\b|\bover the hill\b/.test(txt);
  if (!asksReadiness) return "";

  if (
    /\bnot\s+ready\b|\bnot yet\b|\btoo\s+young\b|\bwait\b/.test(txt) ||
    /\baren't\s+ready\b|\baren't\s+yet\b|\bisn't\s+ready\b/.test(txt) ||
    /\bnot\b.{0,20}\bready\b/.test(txt)
  ) return "early";
  if (/\bpast\s+peak\b|\bover\s+the\s+hill\b|\bpast\b.*\bdrink\b/.test(txt)) return "late";
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
    const audits = compactAudits(body.audits);
    const memory = compactMemory(body.memory);
    const profile = compactProfile(body.profile);
    const history = clampHistory(body.history);
    if (!message) return res.status(400).json({ error: "Message is required." });

    const direct = deterministicAnswer({ message, cellar, audits, history, memory, profile });
    if (direct) return res.status(200).json({ text: direct });
    if (isDeterministicDataQuery(message)) {
      return res.status(200).json({
        text: "I can answer that from your live cellar data, but I need one clearer detail (wine name, date type, or location scope).",
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(DEFAULT_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const contextPayload = {
      cellar,
      audits,
      memory,
      profile,
      now: new Date().toISOString(),
    };

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

    const baseUserText = `Context JSON:\n${JSON.stringify(contextPayload)}\n\nUser question: ${message}`;
    const first = await runModel({
      systemText: SYSTEM_PROMPT,
      userText: baseUserText,
      temperature: 0.2,
      maxOutputTokens: 900,
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
        maxOutputTokens: 1000,
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
        text: "I couldn’t verify a reliable answer from the current cellar data for that request. Please ask a narrower question (wine name, location, date, or bottle count).",
      });
    }

    return res.status(200).json({ text: finalText });
  } catch (err) {
    return res.status(500).json({ error: `Sommelier error: ${err.message || "Unknown error"}` });
  }
};
