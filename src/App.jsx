import { useState, useEffect, useCallback, useRef } from "react";

/* ── SUPABASE CONFIG ── */
const SUPA_URL = "https://dfnvmwoacprkhxfbpybv.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbnZtd29hY3Bya2h4ZmJweWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTkwNTksImV4cCI6MjA4NzM5NTA1OX0.40VqzdfZ9zoJitgCTShNiMTOYheDRYgn84mZXX5ZECs";
const supa = (table) => `${SUPA_URL}/rest/v1/${table}`;
const hdr = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation"
};

/* ── SUPABASE DB HELPERS ── */
const upsertHdr = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "resolution=merge-duplicates,return=minimal"
};
const baseHdr = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`
};

const db = {
  async get(table) {
    try {
      const res = await fetch(`${supa(table)}?order=created_at`, { headers: baseHdr });
      if (!res.ok) { console.error("GET failed", table, await res.text()); return []; }
      return await res.json();
    } catch(e) { console.error("GET error", e); return []; }
  },
  async upsert(table, row) {
    try {
      const res = await fetch(supa(table), {
        method: "POST",
        headers: upsertHdr,
        body: JSON.stringify(row)
      });
      if (!res.ok) console.error("UPSERT failed", table, await res.text());
    } catch(e) { console.error("UPSERT error", e); }
  },
  async delete(table, id) {
    try {
      const res = await fetch(`${supa(table)}?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: baseHdr
      });
      if (!res.ok) console.error("DELETE failed", table, id, await res.text());
    } catch(e) { console.error("DELETE error", e); }
  },
  async saveProfile(p) {
    try {
      const res = await fetch(`${supa("profile")}?id=eq.1`, {
        method: "PATCH",
        headers: upsertHdr,
        body: JSON.stringify({ name: p.name, description: p.description, avatar: p.avatar })
      });
      if (!res.ok) console.error("PROFILE save failed", await res.text());
    } catch(e) { console.error("PROFILE error", e); }
  },
  async getProfile() {
    try {
      const res = await fetch(`${supa("profile")}?id=eq.1`, { headers: baseHdr });
      const rows = res.ok ? await res.json() : [];
      return rows[0] || null;
    } catch { return null; }
  }
};

/* ── MAP DB ROW → APP OBJECT ── */
const fromDb = {
  wine: (r) => ({
    id: r.id, name: r.name, origin: r.origin, grape: r.grape,
    alcohol: r.alcohol, vintage: r.vintage, bottles: r.bottles,
    rating: r.rating, notes: r.notes, review: r.review,
    tastingNotes: r.tasting_notes, datePurchased: r.date_purchased,
    wishlist: r.wishlist, color: r.color, photo: r.photo,
    location: r.location, locationSlot: r.location_slot
  }),
  note: (r) => ({
    id: r.id, wineId: r.wine_id, title: r.title, content: r.content, date: r.date
  })
};

/* ── MAP APP OBJECT → DB ROW ── */
const toDb = {
  wine: (w) => ({
    id: w.id, name: w.name, origin: w.origin, grape: w.grape,
    alcohol: w.alcohol, vintage: w.vintage, bottles: w.bottles,
    rating: w.rating, notes: w.notes, review: w.review,
    tasting_notes: w.tastingNotes, date_purchased: w.datePurchased,
    wishlist: w.wishlist || false, color: w.color, photo: w.photo,
    location: w.location, location_slot: w.locationSlot
  }),
  note: (n) => ({
    id: n.id, wine_id: n.wineId, title: n.title, content: n.content, date: n.date
  })
};

const FONT = "https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap";

/* ── SVG ICON SYSTEM (no emojis) ─────────────────────────────── */
const Svg = ({ children, size = 20, stroke = "currentColor", fill = "none", sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);
const IC = {
  wine:    <><path d="M8 22h8M12 11v11M6 3h12l-2 7a4 4 0 01-8 0L6 3z"/></>,
  heart:   <><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></>,
  spark:   <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19l.75 2.25L8 22l-2.25.75L5 25l-.75-2.25L2 22l2.25-.75L5 19z" strokeWidth="1.1"/></>,
  note:    <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8"/></>,
  user:    <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/></>,
  plus:    <><path d="M12 5v14M5 12h14"/></>,
  send:    <><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></>,
  edit:    <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></>,
  trash:   <><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></>,
  search:  <><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></>,
  filter:  <><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/></>,
  map:     <><path d="M1 6l7-3 8 3 7-3v15l-7 3-8-3-7 3V6z"/><path d="M8 3v15M16 6v15"/></>,
  camera:  <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></>,
  star:    (filled) => <><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" fill={filled ? "currentColor" : "none"}/></>,
  check:   <><path d="M20 6L9 17l-5-5"/></>,
  x:       <><path d="M18 6L6 18M6 6l12 12"/></>,
  chevron: <><path d="M9 18l6-6-6-6"/></>,
  bottle:  <><path d="M9 3h6M10 3v3.5a4 4 0 00-4 4v8a2 2 0 002 2h8a2 2 0 002-2v-8a4 4 0 00-4-4V3M7 15h10"/></>,
  rack:    <><rect x="2" y="3" width="20" height="4" rx="1"/><rect x="2" y="10" width="20" height="4" rx="1"/><rect x="2" y="17" width="20" height="4" rx="1"/><circle cx="7" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="17" cy="5" r="1" fill="currentColor"/><circle cx="7" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="17" cy="12" r="1" fill="currentColor"/></>,
  export:  <><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></>,
  sun:     <><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></>,
  moon:    <><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></>,
  system:  <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  sort:    <><path d="M3 6h18M6 12h12M10 18h4"/></>,
};

const Icon = ({ ic, size = 20, color }) => (
  <Svg size={size} stroke={color || "currentColor"}>{typeof ic === "function" ? ic(false) : IC[ic]}</Svg>
);

/* ── WINE DATABASE ────────────────────────────────────────────── */
const WINE_DB = [
  { name: "Penfolds Grange", origin: "Barossa Valley, Australia", grape: "Shiraz", alcohol: 14.5, tastingNotes: "Dark plum, leather, cedar, dark chocolate", color: "#7B2D8B" },
  { name: "Penfolds Bin 389", origin: "South Australia, Australia", grape: "Cabernet Shiraz", alcohol: 14.5, tastingNotes: "Blackcurrant, plum, cedar, oak", color: "#8B1A1A" },
  { name: "Penfolds RWT Shiraz", origin: "Barossa Valley, Australia", grape: "Shiraz", alcohol: 14.0, tastingNotes: "Licorice, dark berry, mocha, clove", color: "#7B2D8B" },
  { name: "Henschke Hill of Grace", origin: "Eden Valley, Australia", grape: "Shiraz", alcohol: 14.0, tastingNotes: "Blackberry, spice, earth, pepper", color: "#5D0F0F" },
  { name: "Torbreck RunRig", origin: "Barossa Valley, Australia", grape: "Shiraz Viognier", alcohol: 15.0, tastingNotes: "Dark fruit, violet, pepper, chocolate", color: "#6B1F6B" },
  { name: "d'Arenberg The Dead Arm", origin: "McLaren Vale, Australia", grape: "Shiraz", alcohol: 14.5, tastingNotes: "Plum jam, mint, leather, dark chocolate", color: "#8B1A1A" },
  { name: "Yattarna Chardonnay", origin: "Multi-regional, Australia", grape: "Chardonnay", alcohol: 13.0, tastingNotes: "White peach, citrus, flint, cashew", color: "#C8A850" },
  { name: "Cloudy Bay Sauvignon Blanc", origin: "Marlborough, New Zealand", grape: "Sauvignon Blanc", alcohol: 13.0, tastingNotes: "Passionfruit, lime, cut grass, gooseberry", color: "#D4AF37" },
  { name: "Villa Maria Reserve Sauvignon Blanc", origin: "Marlborough, New Zealand", grape: "Sauvignon Blanc", alcohol: 12.5, tastingNotes: "Tropical fruit, lime, herbs", color: "#BFA830" },
  { name: "Leeuwin Estate Art Series Chardonnay", origin: "Margaret River, Australia", grape: "Chardonnay", alcohol: 13.5, tastingNotes: "Grapefruit, nectarine, oak, toasty", color: "#C8A040" },
  { name: "Moss Wood Cabernet Sauvignon", origin: "Margaret River, Australia", grape: "Cabernet Sauvignon", alcohol: 14.0, tastingNotes: "Blackcurrant, cedar, tobacco, mint", color: "#8B1A1A" },
  { name: "Grosset Polish Hill Riesling", origin: "Clare Valley, Australia", grape: "Riesling", alcohol: 12.0, tastingNotes: "Lime juice, slate, citrus blossom", color: "#E8D080" },
  { name: "Two Hands Ares Shiraz", origin: "Barossa Valley, Australia", grape: "Shiraz", alcohol: 14.5, tastingNotes: "Dark plum, chocolate, vanilla, spice", color: "#7B2D8B" },
  { name: "Rockford Basket Press Shiraz", origin: "Barossa Valley, Australia", grape: "Shiraz", alcohol: 14.5, tastingNotes: "Dark berry, leather, earth, spice", color: "#8B1A1A" },
  { name: "Wolf Blass Black Label", origin: "Barossa Valley, Australia", grape: "Cabernet Shiraz", alcohol: 14.0, tastingNotes: "Dark cherry, cedar, oak, chocolate", color: "#1A1A1A" },
  { name: "Wynns John Riddoch Cabernet", origin: "Coonawarra, Australia", grape: "Cabernet Sauvignon", alcohol: 14.5, tastingNotes: "Blackcurrant, cedar, mint, dark chocolate", color: "#8B1A1A" },
  { name: "Cullen Diana Madeline", origin: "Margaret River, Australia", grape: "Cabernet Sauvignon / Merlot", alcohol: 14.0, tastingNotes: "Cassis, cedar, plum, tobacco", color: "#8B1A1A" },
  { name: "Château Margaux", origin: "Bordeaux, France", grape: "Cabernet Sauvignon blend", alcohol: 13.5, tastingNotes: "Blackcurrant, violet, tobacco, cedar", color: "#8B1A1A" },
  { name: "Château Pétrus", origin: "Pomerol, France", grape: "Merlot", alcohol: 14.0, tastingNotes: "Truffle, plum, chocolate, iron", color: "#6B0A0A" },
  { name: "Château Lafite Rothschild", origin: "Pauillac, France", grape: "Cabernet Sauvignon blend", alcohol: 13.0, tastingNotes: "Cassis, cedar, pencil shavings, rose", color: "#7B1515" },
  { name: "Château Mouton Rothschild", origin: "Pauillac, France", grape: "Cabernet Sauvignon blend", alcohol: 13.5, tastingNotes: "Blackberry, mint, cigar box, graphite", color: "#8B1A1A" },
  { name: "Château Latour", origin: "Pauillac, France", grape: "Cabernet Sauvignon blend", alcohol: 13.5, tastingNotes: "Black fruit, iron, tobacco, earth", color: "#5D0F0F" },
  { name: "Château Haut-Brion", origin: "Pessac-Léognan, France", grape: "Cabernet Sauvignon blend", alcohol: 13.5, tastingNotes: "Smoke, coffee, blackcurrant, leather", color: "#8B1A1A" },
  { name: "Dom Pérignon", origin: "Champagne, France", grape: "Chardonnay / Pinot Noir", alcohol: 12.5, tastingNotes: "Toast, cream, lemon, hazelnut", color: "#C0A060" },
  { name: "Krug Grande Cuvée", origin: "Champagne, France", grape: "Chardonnay / Pinot Noir / Meunier", alcohol: 12.0, tastingNotes: "Brioche, apple, almond, ginger", color: "#D4AF37" },
  { name: "Bollinger Special Cuvée", origin: "Champagne, France", grape: "Pinot Noir / Chardonnay / Meunier", alcohol: 12.0, tastingNotes: "Apple, pear, brioche, almond", color: "#D4AF37" },
  { name: "Veuve Clicquot Yellow Label", origin: "Champagne, France", grape: "Pinot Noir / Chardonnay / Meunier", alcohol: 12.0, tastingNotes: "Pear, peach, brioche, vanilla", color: "#D4B030" },
  { name: "Romanée-Conti DRC", origin: "Burgundy, France", grape: "Pinot Noir", alcohol: 13.0, tastingNotes: "Violet, rose, earth, spice, red cherry", color: "#C0392B" },
  { name: "Château d'Yquem", origin: "Sauternes, France", grape: "Sémillon / Sauvignon Blanc", alcohol: 13.5, tastingNotes: "Honey, apricot, caramel, marmalade", color: "#E8C040" },
  { name: "Hermitage La Chapelle Jaboulet", origin: "Northern Rhône, France", grape: "Syrah", alcohol: 14.0, tastingNotes: "Pepper, olive, violet, smoked meat", color: "#7B2D2D" },
  { name: "Whispering Angel Rosé", origin: "Provence, France", grape: "Grenache / Cinsault / Syrah", alcohol: 13.0, tastingNotes: "Strawberry, peach, rose petal, citrus", color: "#E8A0A0" },
  { name: "Château Cheval Blanc", origin: "Saint-Émilion, France", grape: "Cabernet Franc / Merlot", alcohol: 14.0, tastingNotes: "Plum, iris, graphite, chocolate", color: "#8B1A1A" },
  { name: "Barolo Brunate", origin: "Piedmont, Italy", grape: "Nebbiolo", alcohol: 14.0, tastingNotes: "Rose, tar, cherry, tobacco, earth", color: "#C0392B" },
  { name: "Barolo Monfortino Giacomo Conterno", origin: "Piedmont, Italy", grape: "Nebbiolo", alcohol: 14.5, tastingNotes: "Rose petal, cherry, tar, tobacco, truffle", color: "#8B1A1A" },
  { name: "Barbaresco Gaja", origin: "Piedmont, Italy", grape: "Nebbiolo", alcohol: 14.0, tastingNotes: "Cherry, rose, tar, anise, chocolate", color: "#C0392B" },
  { name: "Amarone della Valpolicella Quintarelli", origin: "Veneto, Italy", grape: "Corvina blend", alcohol: 16.5, tastingNotes: "Dried cherry, fig, chocolate, leather", color: "#6B0A0A" },
  { name: "Sassicaia", origin: "Bolgheri, Italy", grape: "Cabernet Sauvignon / Cabernet Franc", alcohol: 13.5, tastingNotes: "Blackcurrant, cedar, tobacco, mint", color: "#8B1A1A" },
  { name: "Ornellaia", origin: "Tuscany, Italy", grape: "Cabernet Sauvignon blend", alcohol: 14.0, tastingNotes: "Black cherry, plum, coffee, graphite", color: "#7B1515" },
  { name: "Masseto", origin: "Tuscany, Italy", grape: "Merlot", alcohol: 14.5, tastingNotes: "Dark plum, chocolate, coffee, truffle", color: "#6B0A0A" },
  { name: "Brunello di Montalcino Biondi Santi", origin: "Tuscany, Italy", grape: "Sangiovese Grosso", alcohol: 14.0, tastingNotes: "Cherry, leather, earth, tobacco, dried herb", color: "#C0392B" },
  { name: "Vega Sicilia Único", origin: "Ribera del Duero, Spain", grape: "Tempranillo / Cabernet Sauvignon", alcohol: 14.0, tastingNotes: "Blackberry, tobacco, vanilla, cedar", color: "#8B1A1A" },
  { name: "Pingus", origin: "Ribera del Duero, Spain", grape: "Tempranillo", alcohol: 15.0, tastingNotes: "Dark plum, chocolate, leather, earth", color: "#6B0A0A" },
  { name: "La Rioja Alta Gran Reserva 904", origin: "Rioja, Spain", grape: "Tempranillo blend", alcohol: 13.5, tastingNotes: "Red cherry, vanilla, tobacco, leather", color: "#C0392B" },
  { name: "Alvaro Palacios L'Ermita", origin: "Priorat, Spain", grape: "Garnacha blend", alcohol: 15.5, tastingNotes: "Dark fruit, mineral, earth, spice", color: "#5D0F0F" },
  { name: "Opus One", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon blend", alcohol: 14.5, tastingNotes: "Blackcurrant, cassis, cedar, dark chocolate", color: "#1A1A2E" },
  { name: "Screaming Eagle", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon", alcohol: 14.5, tastingNotes: "Cassis, black cherry, pencil lead, graphite", color: "#0D0D1F" },
  { name: "Harlan Estate", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon blend", alcohol: 14.5, tastingNotes: "Dark fruit, violet, chocolate, cedar", color: "#1A0A1A" },
  { name: "Ridge Monte Bello", origin: "Santa Cruz Mountains, USA", grape: "Cabernet Sauvignon blend", alcohol: 13.5, tastingNotes: "Blackberry, cedar, earth, tobacco", color: "#8B1A1A" },
  { name: "Caymus Special Selection", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon", alcohol: 14.5, tastingNotes: "Black cherry, chocolate, vanilla, mocha", color: "#7B1515" },
  { name: "Dominus Estate", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon blend", alcohol: 14.5, tastingNotes: "Cassis, tobacco, earth, cedar", color: "#6B0A0A" },
  { name: "Kistler Cuvée Cathleen Chardonnay", origin: "Sonoma, USA", grape: "Chardonnay", alcohol: 14.5, tastingNotes: "Pear, hazelnut, toasty oak, butterscotch", color: "#D4B040" },
  { name: "Flowers Sonoma Coast Pinot Noir", origin: "Sonoma Coast, USA", grape: "Pinot Noir", alcohol: 13.5, tastingNotes: "Cherry, raspberry, spice, earth", color: "#C0392B" },
  { name: "Egon Müller Scharzhofberger Riesling TBA", origin: "Mosel, Germany", grape: "Riesling", alcohol: 6.0, tastingNotes: "Honey, apricot, peach, mineral, petrol", color: "#E8D080" },
  { name: "Taylor Fladgate Vintage Port", origin: "Douro, Portugal", grape: "Touriga Nacional blend", alcohol: 20.0, tastingNotes: "Fig, plum, chocolate, nuts, toffee", color: "#5D0A0A" },
  { name: "Achaval Ferrer Malbec Quimera", origin: "Mendoza, Argentina", grape: "Malbec blend", alcohol: 14.5, tastingNotes: "Blueberry, violet, chocolate, spice", color: "#6B1F6B" },
  { name: "Catena Zapata Adrianna Vineyard", origin: "Mendoza, Argentina", grape: "Malbec / Cabernet Franc", alcohol: 14.5, tastingNotes: "Violet, blueberry, tobacco, chocolate", color: "#7B2D7B" },
  { name: "Almaviva", origin: "Maipo Valley, Chile", grape: "Cabernet Sauvignon blend", alcohol: 14.5, tastingNotes: "Cassis, plum, cedar, tobacco", color: "#8B1A1A" },
  { name: "Kanonkop Paul Sauer", origin: "Stellenbosch, South Africa", grape: "Cabernet Sauvignon blend", alcohol: 14.0, tastingNotes: "Cassis, plum, cedar, tobacco, dark chocolate", color: "#8B1A1A" },
  { name: "Eben Sadie Columella", origin: "Swartland, South Africa", grape: "Syrah / Mourvèdre", alcohol: 14.5, tastingNotes: "Olive, pepper, leather, dark fruit", color: "#7B2D2D" },
];

/* ── HELPERS ──────────────────────────────────────────────────── */
const uid = () => Math.random().toString(36).slice(2, 9);
const WINE_COLORS = ["#8B1A1A","#C0392B","#7B2D8B","#1A1A2E","#2C3E50","#8B4513","#C8A040","#4A235A","#1A3A2A","#2D2D1A","#7B2D2D","#1A2A3A"];
const LOCATIONS = ["Rack A", "Rack B", "Rack C", "Fridge Top", "Fridge Bottom", "Cellar Row 1", "Cellar Row 2", "Cellar Row 3", "Living Room", "Custom"];

const getGreeting = () => {
  const h = new Date().getHours();
  const pools = {
    m: ["Good morning", "Rise and shine", "Morning"],
    d: ["Welcome back", "Hello", "G'day", "Howdy"],
    e: ["Good evening", "Evening", "Welcome back"],
  };
  const key = h < 12 ? "m" : h < 18 ? "d" : "e";
  const p = pools[key];
  return p[Math.floor(Math.random() * p.length)];
};

const fuzzySearch = q => {
  if (!q || q.length < 2) return [];
  const lq = q.toLowerCase();
  return WINE_DB.filter(w =>
    w.name.toLowerCase().includes(lq) ||
    w.grape.toLowerCase().includes(lq) ||
    w.origin.toLowerCase().includes(lq)
  ).slice(0, 8);
};

/* ── SEED DATA ────────────────────────────────────────────────── */
const SEED_WINES = [
  { id: "1", name: "Penfolds Grange", origin: "Barossa Valley, Australia", grape: "Shiraz", alcohol: 14.5, vintage: 2018, bottles: 3, rating: 5, notes: "Pairs beautifully with aged cheddar and slow-roasted lamb.", review: "Absolutely extraordinary. Every sip tells a story.", tastingNotes: "Dark plum, leather, cedar, dark chocolate", datePurchased: "2023-06-15", wishlist: false, color: "#7B2D8B", photo: null, location: "Cellar Row 1", locationSlot: "B3" },
  { id: "2", name: "Château Margaux", origin: "Bordeaux, France", grape: "Cabernet Sauvignon blend", alcohol: 13.5, vintage: 2016, bottles: 1, rating: 5, notes: "The queen of Bordeaux. Silky tannins. Best with truffle risotto.", review: "Perfection in a glass.", tastingNotes: "Blackcurrant, violet, tobacco, cedar", datePurchased: "2022-12-01", wishlist: false, color: "#8B1A1A", photo: null, location: "Rack A", locationSlot: "A1" },
  { id: "3", name: "Cloudy Bay Sauvignon Blanc", origin: "Marlborough, New Zealand", grape: "Sauvignon Blanc", alcohol: 13.0, vintage: 2022, bottles: 6, rating: 4, notes: "Perfect summer wine. Amazing with fresh seafood and oysters.", review: "My go-to white for warm evenings.", tastingNotes: "Passionfruit, lime, cut grass, gooseberry", datePurchased: "2023-09-20", wishlist: false, color: "#D4AF37", photo: null, location: "Fridge Top", locationSlot: null },
  { id: "4", name: "Barolo Brunate", origin: "Piedmont, Italy", grape: "Nebbiolo", alcohol: 14.0, vintage: 2017, bottles: 2, rating: 4, notes: "Needs time to breathe. Perfect with osso buco.", review: "Worth every penny.", tastingNotes: "Rose, tar, cherry, tobacco, earth", datePurchased: "2023-03-10", wishlist: false, color: "#C0392B", photo: null, location: "Cellar Row 2", locationSlot: "C1" },
];
const SEED_WISHLIST = [
  { id: "w1", name: "Opus One", origin: "Napa Valley, USA", grape: "Cabernet Sauvignon blend", alcohol: 14.5, vintage: 2019, notes: "The pinnacle of Napa. Dream bottle.", wishlist: true, color: "#1A1A2E", photo: null },
  { id: "w2", name: "Dom Pérignon", origin: "Champagne, France", grape: "Chardonnay / Pinot Noir", alcohol: 12.5, vintage: 2013, notes: "For a very special celebration.", wishlist: true, color: "#C0A060", photo: null },
];
const SEED_NOTES = [
  { id: "n1", wineId: "1", title: "Christmas Dinner 2023", content: "Opened with Mum and Dad. Paired with slow-roasted lamb. Absolutely magical.", date: "2023-12-25" },
  { id: "n2", wineId: "3", title: "Summer BBQ Pairings", content: "Incredible with fresh prawns on the barbie. Also tried with grilled snapper — even better.", date: "2023-11-12" },
];
const DEFAULT_PROFILE = { name: "Neale", description: "Winemaker & Collector", avatar: null };

/* ── AI ───────────────────────────────────────────────────────── */
const callAI = async (msg, wines, wishlist) => {
  const col = wines.filter(w => !w.wishlist);
  const sys = `You are Vino, a warm knowledgeable personal wine assistant. Collection: ${JSON.stringify(col.map(w => ({ name: w.name, origin: w.origin, grape: w.grape, alcohol: w.alcohol, vintage: w.vintage, bottles: w.bottles, rating: w.rating, location: w.location })))}. Wishlist: ${JSON.stringify(wishlist.map(w => w.name))}. Be concise and helpful. Max 3-4 sentences unless listing items.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: sys, messages: [{ role: "user", content: msg }] }) });
    const d = await res.json();
    return d.content?.[0]?.text || "Having a little trouble — try again.";
  } catch { return "Connection issue. Please try again."; }
};

/* ── PRIMITIVES ───────────────────────────────────────────────── */
const Stars = ({ value, onChange, size = 18 }) => (
  <div style={{ display: "flex", gap: 2 }}>
    {[1,2,3,4,5].map(s => (
      <button key={s} onClick={() => onChange?.(s)} style={{ background: "none", border: "none", padding: 2, cursor: onChange ? "pointer" : "default", color: s <= value ? "#C8432A" : "var(--muted)", transition: "transform 0.1s" }}
        onMouseEnter={e => { if (onChange) e.currentTarget.style.transform = "scale(1.3)"; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}>
        <Svg size={size}>{IC.star(s <= value)}</Svg>
      </button>
    ))}
  </div>
);

const Btn = ({ children, onClick, v = "p", full, sm, danger, disabled }) => {
  const styles = {
    p: { background: disabled ? "var(--border)" : "linear-gradient(135deg, #C8432A, #9E3220)", color: "#fff", border: "none", boxShadow: disabled ? "none" : "0 4px 16px rgba(200,67,42,0.35)" },
    g: { background: "var(--card2)", color: danger ? "#C8432A" : "var(--text)", border: "1.5px solid var(--border)" },
    t: { background: "none", color: "var(--muted)", border: "none" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ padding: sm ? "7px 14px" : "12px 20px", borderRadius: 11, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: sm ? 13 : 14, width: full ? "100%" : "auto", transition: "opacity 0.15s", letterSpacing: "0.1px", ...styles[v] }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.opacity = "0.82"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
      {children}
    </button>
  );
};

const Field = ({ label, value, onChange, type = "text", placeholder, rows }) => (
  <div style={{ marginBottom: 14 }}>
    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
    {rows
      ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
          style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card2)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: "none", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
      : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card2)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
    }
  </div>
);

const Select = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: 14 }}>
    {label && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>}
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", padding: "11px 13px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card2)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box" }}
      onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"}>
      {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
    </select>
  </div>
);

const Sheet = ({ show, onClose, children, tall }) => {
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.58)", backdropFilter: "blur(5px)", animation: "fadeIn .2s" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 480, background: "var(--bg)", borderRadius: "26px 26px 0 0", maxHeight: tall ? "95vh" : "88vh", overflowY: "auto", animation: "sheetUp .3s cubic-bezier(.34,1.2,.64,1)" }}>
        <div style={{ position: "sticky", top: 0, background: "var(--bg)", paddingTop: 14, paddingBottom: 6, zIndex: 1, borderRadius: "26px 26px 0 0" }}>
          <div style={{ width: 38, height: 4, background: "var(--border)", borderRadius: 2, margin: "0 auto 12px" }} />
        </div>
        <div style={{ padding: "0 22px 50px" }}>{children}</div>
      </div>
    </div>
  );
};

const PhotoPicker = ({ value, onChange, size = 80, label = "Add Photo", round }) => {
  const ref = useRef();
  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div onClick={() => ref.current.click()} style={{ width: size, height: size, borderRadius: round ? "50%" : 14, background: "var(--card2)", border: "1.5px dashed var(--border)", cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", transition: "border-color 0.2s" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "#C8432A"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
        {value
          ? <img src={value} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ textAlign: "center", color: "var(--muted)", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Icon ic="camera" size={22} />
              <div style={{ fontSize: 10, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
            </div>}
        {value && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: "all 0.2s" }}
            onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.background = "rgba(0,0,0,0.45)"; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = "0"; e.currentTarget.style.background = "transparent"; }}>
            <span style={{ color: "white", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>Change</span>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
};

/* ── WINE FORM ────────────────────────────────────────────────── */
const WineForm = ({ initial, onSave, onClose, isWishlist }) => {
  const blank = { name: "", origin: "", grape: "", alcohol: "", vintage: "", bottles: isWishlist ? "" : "1", rating: 0, notes: "", review: "", tastingNotes: "", datePurchased: "", color: WINE_COLORS[0], wishlist: !!isWishlist, photo: null, location: "Rack A", locationSlot: "" };
  const [f, setF] = useState(initial ? { ...blank, ...initial, alcohol: initial.alcohol?.toString() || "", vintage: initial.vintage?.toString() || "", bottles: initial.bottles?.toString() || "", locationSlot: initial.locationSlot || "" } : blank);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const [query, setQuery] = useState(initial?.name || "");
  const [sugs, setSugs] = useState([]);
  const [showFields, setShowFields] = useState(!!initial);

  const handleQ = v => { setQuery(v); set("name", v); setSugs(v.length >= 2 ? fuzzySearch(v) : []); };
  const pickSug = w => { setF(p => ({ ...p, name: w.name, origin: w.origin, grape: w.grape, alcohol: w.alcohol?.toString() || "", tastingNotes: w.tastingNotes || "", color: w.color || p.color })); setQuery(w.name); setSugs([]); setShowFields(true); };
  const save = () => {
    if (!f.name) return;
    onSave({ ...f, id: f.id || uid(), alcohol: parseFloat(f.alcohol) || 0, vintage: parseInt(f.vintage) || null, bottles: parseInt(f.bottles) || 0, locationSlot: f.locationSlot || null });
    onClose();
  };

  return (
    <div>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 18 }}>{initial ? "Edit Wine" : isWishlist ? "Add to Wishlist" : "Add Wine"}</div>
      <div style={{ marginBottom: 18, display: "flex", justifyContent: "center" }}>
        <PhotoPicker value={f.photo} onChange={v => set("photo", v)} size={88} label="Wine photo" />
      </div>
      {/* DB Search */}
      <div style={{ marginBottom: 14, position: "relative" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Search wine database</div>
        <div style={{ position: "relative" }}>
          <input value={query} onChange={e => handleQ(e.target.value)} placeholder="Type wine name, grape, or region…"
            style={{ width: "100%", padding: "11px 13px 11px 38px", borderRadius: 10, border: "1.5px solid var(--border)", background: "var(--card2)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
            onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => setTimeout(() => setSugs([]), 160)} />
          <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}><Icon ic="search" size={16} /></div>
        </div>
        {sugs.length > 0 && (
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", zIndex: 99, maxHeight: 240, overflowY: "auto", boxShadow: "0 8px 30px var(--shadow)", marginTop: 4 }}>
            {sugs.map((w, i) => (
              <div key={i} onMouseDown={() => pickSug(w)} style={{ padding: "10px 14px", cursor: "pointer", borderBottom: i < sugs.length - 1 ? "1px solid var(--border)" : "none", transition: "background 0.12s" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--card2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{w.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{w.grape} · {w.origin}</div>
              </div>
            ))}
            <div onMouseDown={() => { setSugs([]); setShowFields(true); }} style={{ padding: "10px 14px", cursor: "pointer", color: "#C8432A", fontSize: 13, fontWeight: 600, textAlign: "center", fontFamily: "'DM Sans', sans-serif", borderTop: "1px solid var(--border)" }}>
              Add "{query}" manually
            </div>
          </div>
        )}
        {!showFields && !sugs.length && query.length >= 1 && (
          <button onMouseDown={() => setShowFields(true)} style={{ marginTop: 8, width: "100%", padding: "9px", borderRadius: 10, border: "1.5px dashed var(--border)", background: "none", color: "#C8432A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Enter details manually
          </button>
        )}
      </div>

      {showFields && (
        <>
          <Field label="Wine Name" value={f.name} onChange={v => set("name", v)} placeholder="e.g. Penfolds Grange" />
          <Field label="Origin / Region" value={f.origin} onChange={v => set("origin", v)} placeholder="e.g. Barossa Valley, Australia" />
          <Field label="Grape Variety" value={f.grape} onChange={v => set("grape", v)} placeholder="e.g. Shiraz" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Alcohol %" value={f.alcohol} onChange={v => set("alcohol", v)} type="number" placeholder="14.5" />
            <Field label="Vintage" value={f.vintage} onChange={v => set("vintage", v)} type="number" placeholder="2019" />
          </div>
          {!isWishlist && (
            <>
              <Field label="Bottles" value={f.bottles} onChange={v => set("bottles", v)} type="number" placeholder="1" />
              {/* Storage location */}
              <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 10 }}>
                <Select label="Storage Location" value={f.location} onChange={v => set("location", v)} options={LOCATIONS} />
                <Field label="Slot / Row" value={f.locationSlot} onChange={v => set("locationSlot", v)} placeholder="e.g. A3" />
              </div>
            </>
          )}
          <Field label="Tasting Notes" value={f.tastingNotes} onChange={v => set("tastingNotes", v)} placeholder="e.g. Dark plum, cedar, vanilla" />
          <Field label="Personal Notes / Pairings" value={f.notes} onChange={v => set("notes", v)} placeholder="Meal pairings, memories…" rows={3} />
          {!isWishlist && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Rating</div>
                <Stars value={f.rating} onChange={v => set("rating", v)} size={24} />
              </div>
              <Field label="Review" value={f.review} onChange={v => set("review", v)} placeholder="Your thoughts on this wine…" rows={2} />
              <Field label="Date Purchased" value={f.datePurchased} onChange={v => set("datePurchased", v)} type="date" />
            </>
          )}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Label Colour</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {WINE_COLORS.map(c => (
                <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 8, background: c, cursor: "pointer", border: f.color === c ? "2.5px solid var(--text)" : "2.5px solid transparent", transition: "transform 0.12s", transform: f.color === c ? "scale(1.18)" : "scale(1)" }} />
              ))}
            </div>
          </div>
        </>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <Btn v="g" onClick={onClose}>Cancel</Btn>
        <Btn full onClick={save} disabled={!f.name && showFields}>Save Wine</Btn>
      </div>
    </div>
  );
};

/* ── WINE DETAIL ──────────────────────────────────────────────── */
const WineDetail = ({ wine, onEdit, onDelete, onMove }) => (
  <div>
    <div style={{ height: 150, borderRadius: 18, background: `linear-gradient(140deg, ${wine.color}EE 0%, ${wine.color}66 100%)`, marginBottom: 16, overflow: "hidden", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      {wine.photo
        ? <img src={wine.photo} alt={wine.name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.72 }} />
        : <div style={{ position: "absolute", right: -12, bottom: -12, opacity: 0.1 }}><Icon ic="bottle" size={130} /></div>}
      <div style={{ position: "relative", textAlign: "center", color: "white", padding: "0 16px", textShadow: "0 2px 8px rgba(0,0,0,0.4)" }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 21, fontWeight: 700, lineHeight: 1.2 }}>{wine.name}</div>
        <div style={{ fontSize: 13, opacity: 0.88, marginTop: 4 }}>{wine.vintage ? `${wine.vintage} · ` : ""}{wine.origin}</div>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
      {[["Grape", wine.grape], ["Alcohol", wine.alcohol ? `${wine.alcohol}%` : "—"], !wine.wishlist && ["Bottles", wine.bottles ?? "—"], !wine.wishlist && ["Location", wine.location ? `${wine.location}${wine.locationSlot ? " · " + wine.locationSlot : ""}` : "—"], ["Purchased", wine.datePurchased ? new Date(wine.datePurchased).toLocaleDateString("en-AU", { month: "short", year: "numeric" }) : "—"]].filter(Boolean).map(([l, v]) => (
        <div key={l} style={{ background: "var(--card2)", borderRadius: 11, padding: "10px 13px", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 3, fontFamily: "'DM Sans', sans-serif" }}>{l}</div>
          <div style={{ fontSize: 14, color: "var(--text)", fontWeight: 600, fontFamily: "'Outfit', sans-serif" }}>{v || "—"}</div>
        </div>
      ))}
    </div>
    {wine.rating > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6, fontFamily: "'DM Sans', sans-serif" }}>Rating</div><Stars value={wine.rating} size={19} /></div>}
    {[["Tasting Notes", wine.tastingNotes, false], ["Review", wine.review, true], ["Personal Notes", wine.notes, false]].map(([l, v, ital]) => v ? (
      <div key={l} style={{ background: "var(--card2)", borderRadius: 11, padding: "11px 13px", border: "1px solid var(--border)", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 5, fontFamily: "'DM Sans', sans-serif" }}>{l}</div>
        <div style={{ fontSize: 14, color: "var(--text)", lineHeight: 1.6, fontStyle: ital ? "italic" : "normal", fontFamily: "'DM Sans', sans-serif" }}>{ital ? `"${v}"` : v}</div>
      </div>
    ) : null)}
    {wine.wishlist && onMove && <div style={{ marginBottom: 10 }}><Btn full onClick={onMove}>Move to Collection</Btn></div>}
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <Btn v="g" onClick={onEdit} full>Edit</Btn>
      <Btn v="g" onClick={onDelete} full danger>Delete</Btn>
    </div>
  </div>
);

/* ── FILTER PANEL ─────────────────────────────────────────────── */
const SORT_OPTIONS = [
  { value: "name", label: "Name A–Z" },
  { value: "rating", label: "Rating" },
  { value: "vintage", label: "Vintage" },
  { value: "bottles", label: "Bottles" },
  { value: "recent", label: "Recently Added" },
];

const FilterPanel = ({ filters, setFilters, wines, onClose }) => {
  const col = wines.filter(w => !w.wishlist);
  const allGrapes = [...new Set(col.map(w => w.grape).filter(Boolean))].sort();
  const allRegions = [...new Set(col.map(w => w.origin?.split(",").pop()?.trim()).filter(Boolean))].sort();
  const allLocations = [...new Set(col.map(w => w.location).filter(Boolean))].sort();
  const [local, setLocal] = useState({ ...filters });
  const set = (k, v) => setLocal(p => ({ ...p, [k]: v }));
  const toggle = (k, v) => setLocal(p => ({ ...p, [k]: p[k] === v ? "" : v }));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)" }}>Filter & Sort</div>
        <button onClick={() => setLocal({ sort: "name", grape: "", region: "", location: "", minRating: 0 })} style={{ background: "none", border: "none", color: "#C8432A", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Reset</button>
      </div>
      {/* Sort */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Sort By</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {SORT_OPTIONS.map(o => (
          <button key={o.value} onClick={() => set("sort", o.value)} style={{ padding: "6px 12px", borderRadius: 20, border: local.sort === o.value ? "1.5px solid #C8432A" : "1.5px solid var(--border)", background: local.sort === o.value ? "rgba(200,67,42,0.1)" : "var(--card2)", color: local.sort === o.value ? "#C8432A" : "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", transition: "all 0.15s" }}>
            {o.label}
          </button>
        ))}
      </div>
      {/* Min rating */}
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Min Rating</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[0,1,2,3,4,5].map(r => (
          <button key={r} onClick={() => set("minRating", r)} style={{ padding: "6px 12px", borderRadius: 20, border: local.minRating === r ? "1.5px solid #C8432A" : "1.5px solid var(--border)", background: local.minRating === r ? "rgba(200,67,42,0.1)" : "var(--card2)", color: local.minRating === r ? "#C8432A" : "var(--text)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            {r === 0 ? "Any" : `${r}+`}
          </button>
        ))}
      </div>
      {/* Grape */}
      {allGrapes.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Grape</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {allGrapes.map(g => (
            <button key={g} onClick={() => toggle("grape", g)} style={{ padding: "6px 12px", borderRadius: 20, border: local.grape === g ? "1.5px solid #C8432A" : "1.5px solid var(--border)", background: local.grape === g ? "rgba(200,67,42,0.1)" : "var(--card2)", color: local.grape === g ? "#C8432A" : "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              {g}
            </button>
          ))}
        </div>
      </>}
      {/* Region */}
      {allRegions.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Region</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {allRegions.map(r => (
            <button key={r} onClick={() => toggle("region", r)} style={{ padding: "6px 12px", borderRadius: 20, border: local.region === r ? "1.5px solid #C8432A" : "1.5px solid var(--border)", background: local.region === r ? "rgba(200,67,42,0.1)" : "var(--card2)", color: local.region === r ? "#C8432A" : "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              {r}
            </button>
          ))}
        </div>
      </>}
      {/* Location */}
      {allLocations.length > 0 && <>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Storage Location</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {allLocations.map(l => (
            <button key={l} onClick={() => toggle("location", l)} style={{ padding: "6px 12px", borderRadius: 20, border: local.location === l ? "1.5px solid #C8432A" : "1.5px solid var(--border)", background: local.location === l ? "rgba(200,67,42,0.1)" : "var(--card2)", color: local.location === l ? "#C8432A" : "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              {l}
            </button>
          ))}
        </div>
      </>}
      <Btn full onClick={() => { setFilters(local); onClose(); }}>Apply Filters</Btn>
    </div>
  );
};

/* ── CELLAR MAP SCREEN ────────────────────────────────────────── */
const CellarMapScreen = ({ wines, onWinePress }) => {
  const col = wines.filter(w => !w.wishlist && w.location);
  const [locSearch, setLocSearch] = useState("");
  const [selLoc, setSelLoc] = useState(null);

  // Group wines by location
  const byLoc = col.reduce((acc, w) => {
    const loc = w.location || "Unknown";
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(w);
    return acc;
  }, {});

  const filteredLocs = Object.entries(byLoc).filter(([loc]) =>
    !locSearch || loc.toLowerCase().includes(locSearch.toLowerCase())
  );

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>Cellar Map</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{col.length} bottles across {Object.keys(byLoc).length} locations</div>
      </div>
      {/* Location search */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <input value={locSearch} onChange={e => setLocSearch(e.target.value)} placeholder="Search by location…"
          style={{ width: "100%", padding: "11px 13px 11px 38px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
        <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}><Icon ic="search" size={16} /></div>
      </div>
      {filteredLocs.length === 0
        ? <div style={{ textAlign: "center", padding: "50px 0", color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ marginBottom: 12, opacity: 0.4 }}><Icon ic="rack" size={48} /></div>
            {locSearch ? "No locations match your search." : "No wines with locations assigned yet. Edit wines to add storage locations."}
          </div>
        : filteredLocs.map(([loc, locWines]) => (
          <div key={loc} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ color: "var(--muted)" }}><Icon ic="rack" size={16} /></div>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{loc}</div>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>{locWines.length} bottle{locWines.length !== 1 ? "s" : ""}</div>
            </div>
            {/* Visual grid */}
            <div style={{ background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)", padding: 14, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 8 }}>
              {locWines.map(w => (
                <div key={w.id} onClick={() => onWinePress(w)} style={{ cursor: "pointer", borderRadius: 12, overflow: "hidden", border: "1.5px solid var(--border)", transition: "transform 0.15s, box-shadow 0.15s", background: "var(--card2)" }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 6px 20px var(--shadow)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                  {/* Bottle visual */}
                  <div style={{ height: 56, background: w.photo ? "transparent" : w.color || "#8B1A1A", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {w.photo
                      ? <img src={w.photo} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ color: "rgba(255,255,255,0.6)" }}><Icon ic="bottle" size={22} /></div>}
                    {w.locationSlot && (
                      <div style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.5)", borderRadius: 5, padding: "1px 5px", fontSize: 9, color: "white", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{w.locationSlot}</div>
                    )}
                  </div>
                  <div style={{ padding: "7px 7px 8px" }}>
                    <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 11, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{w.name}</div>
                    {w.vintage && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{w.vintage}</div>}
                    <div style={{ fontSize: 10, color: "#C8432A", fontWeight: 600, marginTop: 1, fontFamily: "'DM Sans', sans-serif" }}>{w.bottles} btl</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  );
};

/* ── COLLECTION SCREEN ────────────────────────────────────────── */
const applyFilters = (wines, filters, search) => {
  let res = wines.filter(w => !w.wishlist);
  if (search) res = res.filter(w => `${w.name} ${w.grape} ${w.origin} ${w.location}`.toLowerCase().includes(search.toLowerCase()));
  if (filters.minRating > 0) res = res.filter(w => (w.rating || 0) >= filters.minRating);
  if (filters.grape) res = res.filter(w => w.grape === filters.grape);
  if (filters.region) res = res.filter(w => w.origin?.split(",").pop()?.trim() === filters.region);
  if (filters.location) res = res.filter(w => w.location === filters.location);
  return res.sort((a, b) => {
    if (filters.sort === "rating") return (b.rating || 0) - (a.rating || 0);
    if (filters.sort === "vintage") return (b.vintage || 0) - (a.vintage || 0);
    if (filters.sort === "bottles") return (b.bottles || 0) - (a.bottles || 0);
    if (filters.sort === "recent") return b.id.localeCompare(a.id);
    return a.name.localeCompare(b.name);
  });
};

const DEFAULT_FILTERS = { sort: "name", grape: "", region: "", location: "", minRating: 0 };
const hasActiveFilters = f => f.sort !== "name" || f.grape || f.region || f.location || f.minRating > 0;

const CollectionScreen = ({ wines, onAdd, onUpdate, onDelete }) => {
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [view, setView] = useState("list"); // "list" | "map"

  const col = wines.filter(w => !w.wishlist);
  const filt = applyFilters(wines, filters, search);
  const bottles = col.reduce((s, w) => s + (w.bottles || 0), 0);
  const avgR = col.filter(w => w.rating).length
    ? (col.filter(w => w.rating).reduce((s, w) => s + w.rating, 0) / col.filter(w => w.rating).length).toFixed(1)
    : "—";
  const active = hasActiveFilters(filters);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>My Cellar</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{col.length} wines · {bottles} bottles</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* View toggle */}
          <button onClick={() => setView(v => v === "list" ? "map" : "list")} style={{ width: 38, height: 38, borderRadius: 11, background: view === "map" ? "rgba(200,67,42,0.12)" : "var(--card2)", border: view === "map" ? "1.5px solid #C8432A" : "1.5px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: view === "map" ? "#C8432A" : "var(--muted)" }}>
            <Icon ic={view === "map" ? "sort" : "map"} size={17} />
          </button>
          {/* Filter */}
          <button onClick={() => setFilterOpen(true)} style={{ width: 38, height: 38, borderRadius: 11, background: active ? "rgba(200,67,42,0.12)" : "var(--card2)", border: active ? "1.5px solid #C8432A" : "1.5px solid var(--border)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: active ? "#C8432A" : "var(--muted)", position: "relative" }}>
            <Icon ic="filter" size={16} />
            {active && <div style={{ position: "absolute", top: -3, right: -3, width: 8, height: 8, borderRadius: "50%", background: "#C8432A", border: "2px solid var(--bg)" }} />}
          </button>
          {/* Add */}
          <button onClick={() => setAdding(true)} style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg, #C8432A, #9E3220)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 4px 14px rgba(200,67,42,0.38)" }}>
            <Icon ic="plus" size={18} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16 }}>
        {[["Wines", col.length], ["Bottles", bottles], ["Avg", avgR], ["Regions", new Set(col.map(w => w.origin?.split(",").pop()?.trim())).size]].map(([l, v]) => (
          <div key={l} style={{ background: "var(--card)", borderRadius: 13, padding: "11px 6px", textAlign: "center", border: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>{v}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, marginTop: 3, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>{l}</div>
          </div>
        ))}
      </div>

      {view === "map" ? (
        <CellarMapScreen wines={wines} onWinePress={w => setSel(w)} />
      ) : (
        <>
          {/* Search */}
          <div style={{ position: "relative", marginBottom: active ? 8 : 14 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search wines, grapes, locations…"
              style={{ width: "100%", padding: "11px 13px 11px 38px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
              onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
            <div style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }}><Icon ic="search" size={16} /></div>
          </div>
          {/* Active filter chips */}
          {active && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {filters.sort !== "name" && <FilterChip label={`Sort: ${SORT_OPTIONS.find(o => o.value === filters.sort)?.label}`} onRemove={() => setFilters(p => ({ ...p, sort: "name" }))} />}
              {filters.minRating > 0 && <FilterChip label={`${filters.minRating}+ stars`} onRemove={() => setFilters(p => ({ ...p, minRating: 0 }))} />}
              {filters.grape && <FilterChip label={filters.grape} onRemove={() => setFilters(p => ({ ...p, grape: "" }))} />}
              {filters.region && <FilterChip label={filters.region} onRemove={() => setFilters(p => ({ ...p, region: "" }))} />}
              {filters.location && <FilterChip label={filters.location} onRemove={() => setFilters(p => ({ ...p, location: "" }))} />}
              <button onClick={() => setFilters(DEFAULT_FILTERS)} style={{ padding: "4px 10px", borderRadius: 20, border: "1.5px solid var(--border)", background: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Clear all</button>
            </div>
          )}
          {filt.length === 0
            ? <div style={{ textAlign: "center", padding: "50px 0", color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>
                <div style={{ marginBottom: 10, opacity: 0.35 }}><Icon ic="wine" size={44} /></div>
                {search || active ? "No wines match your filters." : "Your cellar is empty. Add your first wine."}
              </div>
            : filt.map(w => (
              <div key={w.id} onClick={() => setSel(w)} style={{ background: "var(--card)", borderRadius: 16, padding: "13px 15px", cursor: "pointer", border: "1px solid var(--border)", marginBottom: 8, display: "flex", gap: 13, alignItems: "center", transition: "transform 0.16s, box-shadow 0.16s" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 6px 22px var(--shadow)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
                <div style={{ width: 50, height: 50, borderRadius: 13, background: w.color || "#8B1A1A", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 3px 10px ${w.color}44` }}>
                  {w.photo ? <img src={w.photo} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ color: "rgba(255,255,255,0.7)" }}><Icon ic="bottle" size={20} /></div>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 3, fontFamily: "'DM Sans', sans-serif" }}>{w.grape} · {w.origin?.split(",").pop()?.trim()}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {w.rating > 0 && <Stars value={w.rating} size={11} />}
                    {w.location && <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>{w.location}{w.locationSlot ? ` ${w.locationSlot}` : ""}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {w.bottles > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#C8432A", fontFamily: "'Outfit', sans-serif" }}>{w.bottles}</div>}
                  {w.vintage && <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>{w.vintage}</div>}
                </div>
              </div>
            ))}
        </>
      )}

      <Sheet show={!!sel && !editing} onClose={() => setSel(null)} tall>
        {sel && <WineDetail wine={sel} onEdit={() => setEditing(true)} onDelete={() => { onDelete(sel.id); setSel(null); }} />}
      </Sheet>
      <Sheet show={editing} onClose={() => setEditing(false)} tall>
        <WineForm initial={sel} onSave={w => { onUpdate(w); setSel(w); setEditing(false); }} onClose={() => setEditing(false)} />
      </Sheet>
      <Sheet show={adding} onClose={() => setAdding(false)} tall>
        <WineForm onSave={w => { onAdd(w); setAdding(false); }} onClose={() => setAdding(false)} />
      </Sheet>
      <Sheet show={filterOpen} onClose={() => setFilterOpen(false)} tall>
        <FilterPanel filters={filters} setFilters={setFilters} wines={wines} onClose={() => setFilterOpen(false)} />
      </Sheet>
    </div>
  );
};

const FilterChip = ({ label, onRemove }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 20, background: "rgba(200,67,42,0.1)", border: "1.5px solid #C8432A" }}>
    <span style={{ fontSize: 12, color: "#C8432A", fontFamily: "'DM Sans', sans-serif", fontWeight: 600 }}>{label}</span>
    <button onClick={onRemove} style={{ background: "none", border: "none", cursor: "pointer", color: "#C8432A", padding: 0, lineHeight: 1, display: "flex" }}><Icon ic="x" size={12} /></button>
  </div>
);

/* ── WISHLIST SCREEN ──────────────────────────────────────────── */
const WishlistScreen = ({ wishlist, onAdd, onUpdate, onDelete, onMoveToCollection }) => {
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>Wishlist</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{wishlist.length} wines to try</div>
        </div>
        <button onClick={() => setAdding(true)} style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg, #C8432A, #9E3220)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 4px 14px rgba(200,67,42,0.38)" }}>
          <Icon ic="plus" size={18} />
        </button>
      </div>
      {wishlist.length === 0
        ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ marginBottom: 10, opacity: 0.35 }}><Icon ic="heart" size={44} /></div>
            Add wines you dream of trying.
          </div>
        : wishlist.map(w => (
          <div key={w.id} onClick={() => setSel(w)} style={{ background: "var(--card)", borderRadius: 16, padding: "13px 15px", cursor: "pointer", border: "1px solid var(--border)", marginBottom: 8, display: "flex", gap: 13, alignItems: "center", transition: "transform 0.16s" }}
            onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
            onMouseLeave={e => e.currentTarget.style.transform = "none"}>
            <div style={{ width: 50, height: 50, borderRadius: 13, background: w.color || "#4A235A", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 3px 10px ${w.color}44` }}>
              {w.photo ? <img src={w.photo} alt={w.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ color: "rgba(255,255,255,0.7)" }}><Icon ic="bottle" size={20} /></div>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>{w.grape} · {w.origin?.split(",").pop()?.trim()}</div>
            </div>
            {w.vintage && <div style={{ fontSize: 13, color: "var(--muted)", flexShrink: 0, fontFamily: "'Outfit', sans-serif", fontWeight: 500 }}>{w.vintage}</div>}
          </div>
        ))}
      <Sheet show={!!sel && !editing} onClose={() => setSel(null)} tall>
        {sel && <WineDetail wine={sel} onEdit={() => setEditing(true)} onDelete={() => { onDelete(sel.id); setSel(null); }} onMove={() => { onMoveToCollection(sel.id); setSel(null); }} />}
      </Sheet>
      <Sheet show={editing} onClose={() => setEditing(false)} tall>
        <WineForm initial={sel} isWishlist onSave={w => { onUpdate(w); setSel(w); setEditing(false); }} onClose={() => setEditing(false)} />
      </Sheet>
      <Sheet show={adding} onClose={() => setAdding(false)} tall>
        <WineForm isWishlist onSave={w => { onAdd({ ...w, wishlist: true }); setAdding(false); }} onClose={() => setAdding(false)} />
      </Sheet>
    </div>
  );
};

/* ── AI SCREEN ────────────────────────────────────────────────── */
const AIScreen = ({ wines, wishlist }) => {
  const [msgs, setMsgs] = useState([{ r: "a", t: "Hello! I'm Vino, your personal wine assistant.\n\nAsk me anything — meal pairings, what's in your cellar, tasting notes, or what to open tonight." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef();
  const chips = ["Pair with beef tenderloin", "What's in my cellar?", "Best wine I own?", "What to open tonight?"];
  const send = useCallback(async msg => {
    const txt = msg || input.trim();
    if (!txt || loading) return;
    setInput("");
    setMsgs(p => [...p, { r: "u", t: txt }]);
    setLoading(true);
    const reply = await callAI(txt, wines, wishlist);
    setMsgs(p => [...p, { r: "a", t: reply }]);
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }), 80);
  }, [input, wines, wishlist, loading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 160px)" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>Vino AI</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>Your personal sommelier</div>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.r === "u" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 8 }}>
            {m.r === "a" && (
              <div style={{ width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg, #C8432A, #9E3220)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon ic="wine" size={14} color="white" />
              </div>
            )}
            <div style={{ maxWidth: "78%", padding: "11px 14px", borderRadius: m.r === "u" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: m.r === "u" ? "linear-gradient(135deg, #C8432A, #9E3220)" : "var(--card)", color: m.r === "u" ? "white" : "var(--text)", fontSize: 14, lineHeight: 1.65, border: m.r === "a" ? "1px solid var(--border)" : "none", whiteSpace: "pre-wrap", fontFamily: "'DM Sans', sans-serif" }}>
              {m.t}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 9, background: "linear-gradient(135deg, #C8432A, #9E3220)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon ic="wine" size={14} color="white" />
            </div>
            <div style={{ padding: "12px 16px", borderRadius: "16px 16px 16px 4px", background: "var(--card)", border: "1px solid var(--border)", display: "flex", gap: 4 }}>
              {[0,1,2].map(d => <div key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--muted)", animation: "blink 1.2s ease infinite", animationDelay: `${d * 0.18}s` }} />)}
            </div>
          </div>
        )}
      </div>
      {msgs.length <= 1 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, marginTop: 8 }}>
          {chips.map(c => (
            <button key={c} onClick={() => send(c)} style={{ padding: "7px 13px", borderRadius: 20, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif", fontWeight: 500, transition: "border-color 0.18s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "#C8432A"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "var(--border)"}>
              {c}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="Ask anything…"
          style={{ flex: 1, padding: "12px 15px", borderRadius: 12, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14, fontFamily: "'DM Sans', sans-serif", outline: "none", transition: "border-color 0.2s" }}
          onFocus={e => e.target.style.borderColor = "#C8432A"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
        <button onClick={() => send()} disabled={!input.trim() || loading}
          style={{ width: 44, height: 44, borderRadius: 12, background: input.trim() && !loading ? "linear-gradient(135deg, #C8432A, #9E3220)" : "var(--card2)", border: "1.5px solid var(--border)", cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", color: input.trim() && !loading ? "white" : "var(--muted)", transition: "all 0.18s", boxShadow: input.trim() && !loading ? "0 4px 14px rgba(200,67,42,0.3)" : "none" }}>
          <Icon ic="send" size={17} />
        </button>
      </div>
    </div>
  );
};

/* ── NOTES SCREEN ─────────────────────────────────────────────── */
const NotesScreen = ({ wines, notes, onAdd, onDelete }) => {
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ wineId: "", title: "", content: "" });
  const col = wines.filter(w => !w.wishlist);
  const getW = id => col.find(w => w.id === id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", lineHeight: 1 }}>Tasting Notes</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4, fontFamily: "'DM Sans', sans-serif" }}>{notes.length} entries</div>
        </div>
        <button onClick={() => { setForm({ wineId: col[0]?.id || "", title: "", content: "" }); setAdding(true); }}
          style={{ width: 38, height: 38, borderRadius: 11, background: "linear-gradient(135deg, #C8432A, #9E3220)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "white", boxShadow: "0 4px 14px rgba(200,67,42,0.38)" }}>
          <Icon ic="plus" size={18} />
        </button>
      </div>
      {notes.length === 0
        ? <div style={{ textAlign: "center", padding: "60px 0", color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>
            <div style={{ marginBottom: 10, opacity: 0.35 }}><Icon ic="note" size={44} /></div>
            Capture your wine memories.
          </div>
        : notes.map(n => {
          const w = getW(n.wineId);
          return (
            <div key={n.id} onClick={() => setSel(n)} style={{ background: "var(--card)", borderRadius: 16, padding: 16, cursor: "pointer", border: "1px solid var(--border)", marginBottom: 8, transition: "transform 0.16s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseLeave={e => e.currentTarget.style.transform = "none"}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{n.title}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>{n.date ? new Date(n.date).toLocaleDateString("en-AU", { day: "numeric", month: "short" }) : ""}</div>
              </div>
              {w && <div style={{ fontSize: 12, color: "#C8432A", marginBottom: 6, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{w.name}</div>}
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", fontFamily: "'DM Sans', sans-serif" }}>{n.content}</div>
            </div>
          );
        })}
      <Sheet show={adding} onClose={() => setAdding(false)}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 18 }}>New Note</div>
        <Select label="Wine" value={form.wineId} onChange={v => setForm(p => ({ ...p, wineId: v }))} options={col.map(w => ({ value: w.id, label: w.name }))} />
        <Field label="Title" value={form.title} onChange={v => setForm(p => ({ ...p, title: v }))} placeholder="e.g. Christmas Dinner 2024" />
        <Field label="Note" value={form.content} onChange={v => setForm(p => ({ ...p, content: v }))} placeholder="Impressions, pairings, memories…" rows={4} />
        <div style={{ display: "flex", gap: 8 }}>
          <Btn v="g" onClick={() => setAdding(false)}>Cancel</Btn>
          <Btn full onClick={() => { if (form.title && form.content) { onAdd({ ...form, id: uid(), date: new Date().toISOString().split("T")[0] }); setAdding(false); } }}>Save Note</Btn>
        </div>
      </Sheet>
      <Sheet show={!!sel} onClose={() => setSel(null)} tall>
        {sel && (
          <div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>{sel.title}</div>
            {getW(sel.wineId) && <div style={{ fontSize: 13, color: "#C8432A", marginBottom: 6, fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{getW(sel.wineId)?.name}</div>}
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16, fontFamily: "'DM Sans', sans-serif" }}>{sel.date ? new Date(sel.date).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}</div>
            <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.75, marginBottom: 24, fontFamily: "'DM Sans', sans-serif" }}>{sel.content}</div>
            <Btn v="g" onClick={() => { onDelete(sel.id); setSel(null); }} full danger>Delete Note</Btn>
          </div>
        )}
      </Sheet>
    </div>
  );
};

/* ── PROFILE SCREEN ───────────────────────────────────────────── */
const ProfileScreen = ({ wines, wishlist, notes, theme, setTheme, profile, setProfile }) => {
  const [editingProfile, setEditingProfile] = useState(false);
  const [pForm, setPForm] = useState(() => ({ name: profile.name, description: profile.description, avatar: profile.avatar || null }));

  const col = wines.filter(w => !w.wishlist);
  const bottles = col.reduce((s, w) => s + (w.bottles || 0), 0);
  const topWine = [...col].sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];
  const grapes = col.reduce((acc, w) => { if (w.grape) acc[w.grape] = (acc[w.grape] || 0) + 1; return acc; }, {});
  const topGrape = Object.entries(grapes).sort((a, b) => b[1] - a[1])[0];

  const openEdit = () => {
    // Always sync from latest profile prop when opening
    setPForm({ name: profile.name, description: profile.description, avatar: profile.avatar || null });
    setEditingProfile(true);
  };
  const saveProfile = async () => {
    const updated = { name: pForm.name || profile.name, description: pForm.description || profile.description, avatar: pForm.avatar || null };
    await setProfile(updated);  // this triggers handleSetProfile which saves to Supabase
    setEditingProfile(false);
  };

  const exportData = () => {
    const b = new Blob([JSON.stringify({ wines, wishlist, notes, profile, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "my-winery.json";
    a.click();
  };

  const themeOpts = [
    { id: "system", label: "System", ic: "system" },
    { id: "light", label: "Light", ic: "sun" },
    { id: "dark", label: "Dark", ic: "moon" },
  ];

  return (
    <div>
      <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 28, fontWeight: 800, color: "var(--text)", marginBottom: 18 }}>My Winery</div>

      {/* Profile card */}
      <div style={{ background: "linear-gradient(140deg, #7A1414 0%, #C8432A 65%, #7A1414 100%)", borderRadius: 20, padding: 20, marginBottom: 14, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", right: -16, top: -16, opacity: 0.07 }}><Icon ic="bottle" size={120} color="white" /></div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(255,255,255,0.15)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.3)" }}>
            {profile.avatar
              ? <img src={profile.avatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <Icon ic="user" size={28} color="rgba(255,255,255,0.8)" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 800, color: "white", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{profile.description}</div>
          </div>
          <button onClick={openEdit} style={{ flexShrink: 0, background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 10, padding: "8px 14px", color: "white", fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "background 0.2s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.28)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.18)"}>
            <Icon ic="edit" size={14} color="white" /> Edit
          </button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[["Wines", col.length], ["Bottles", bottles], ["Notes", notes.length]].map(([l, v]) => (
          <div key={l} style={{ background: "var(--card)", borderRadius: 14, padding: "13px 8px", textAlign: "center", border: "1px solid var(--border)" }}>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 800, color: "var(--text)" }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, marginTop: 2, fontFamily: "'DM Sans', sans-serif", textTransform: "uppercase", letterSpacing: "0.5px" }}>{l}</div>
          </div>
        ))}
      </div>

      {topWine && (
        <div style={{ background: "var(--card)", borderRadius: 14, padding: "13px 15px", border: "1px solid var(--border)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>Top Rated</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{topWine.name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{topWine.origin}</div>
          </div>
          <Stars value={topWine.rating} size={14} />
        </div>
      )}
      {topGrape && (
        <div style={{ background: "var(--card)", borderRadius: 14, padding: "13px 15px", border: "1px solid var(--border)", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 4, fontFamily: "'DM Sans', sans-serif" }}>Favourite Grape</div>
            <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{topGrape[0]}</div>
          </div>
          <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 22, fontWeight: 800, color: "#C8432A" }}>{topGrape[1]}×</div>
        </div>
      )}

      {/* Theme */}
      <div style={{ background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)", padding: "13px 15px", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 12, fontFamily: "'DM Sans', sans-serif" }}>Appearance</div>
        <div style={{ display: "flex", gap: 8 }}>
          {themeOpts.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)}
              style={{ flex: 1, padding: "10px 6px", borderRadius: 11, border: theme === t.id ? "2px solid #C8432A" : "1.5px solid var(--border)", background: theme === t.id ? "rgba(200,67,42,0.1)" : "var(--card2)", color: theme === t.id ? "#C8432A" : "var(--text)", fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 12, cursor: "pointer", transition: "all 0.18s", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <Icon ic={t.ic} size={17} color={theme === t.id ? "#C8432A" : "var(--muted)"} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Export */}
      <div onClick={exportData} style={{ background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)", padding: "13px 15px", marginBottom: 18, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "opacity 0.18s" }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.7"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Icon ic="export" size={17} color="var(--muted)" />
          <span style={{ fontSize: 14, color: "var(--text)", fontFamily: "'DM Sans', sans-serif", fontWeight: 500 }}>Export Collection</span>
        </div>
        <Icon ic="chevron" size={16} color="var(--muted)" />
      </div>

      <div style={{ textAlign: "center", fontSize: 12, color: "var(--muted)", fontFamily: "'DM Sans', sans-serif" }}>Vino v3.0 · Crafted for {profile.name}</div>

      {/* Edit Profile Sheet */}
      <Sheet show={editingProfile} onClose={() => setEditingProfile(false)}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 20, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>Edit Profile</div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 10, fontFamily: "'DM Sans', sans-serif" }}>Profile Photo</div>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <PhotoPicker value={pForm.avatar} onChange={v => setPForm(p => ({ ...p, avatar: v }))} size={88} label="Profile photo" round />
          </div>
        </div>
        <Field label="Name" value={pForm.name} onChange={v => setPForm(p => ({ ...p, name: v }))} placeholder="Your name" />
        <Field label="Description" value={pForm.description} onChange={v => setPForm(p => ({ ...p, description: v }))} placeholder="e.g. Winemaker & Collector" />
        <div style={{ display: "flex", gap: 10 }}>
          <Btn v="g" onClick={() => setEditingProfile(false)}>Cancel</Btn>
          <Btn full onClick={saveProfile}>Save Profile</Btn>
        </div>
      </Sheet>
    </div>
  );
};

/* ── ROOT APP ─────────────────────────────────────────────────── */
const TABS = [
  { id: "collection", label: "Cellar", ic: "wine" },
  { id: "wishlist",   label: "Wishlist", ic: "heart" },
  { id: "ai",         label: "Vino AI",  ic: "spark" },
  { id: "notes",      label: "Notes",   ic: "note" },
  { id: "profile",    label: "Winery",  ic: "user" },
];

/* ── localStorage for theme only ── */
function loadTheme() {
  try { return localStorage.getItem("vino_theme") || "system"; } catch { return "system"; }
}
function saveTheme(v) {
  try { localStorage.setItem("vino_theme", v); } catch {}
}

export default function App() {
  const [themeMode, setThemeMode] = useState(loadTheme);
  const [sysDark, setSysDark] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false);
  const [tab, setTab] = useState("collection");
  const [wines, setWines]       = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [notes, setNotes]       = useState([]);
  const [profile, setProfile]   = useState(DEFAULT_PROFILE);
  const [splashDone, setSplashDone] = useState(false);
  const [syncing, setSyncing]   = useState(true);
  const [greeting] = useState(getGreeting);

  // Save theme locally (no need to sync this to DB)
  useEffect(() => { saveTheme(themeMode); }, [themeMode]);

  // Load all data from Supabase on mount
  useEffect(() => {
    async function fetchAll() {
      setSyncing(true);
      try {
        const [wineRows, noteRows, prof] = await Promise.all([
          db.get("wines"),
          db.get("tasting_notes"),
          db.getProfile()
        ]);
        const allWines = wineRows.map(fromDb.wine);
        setWines(allWines.filter(w => !w.wishlist));
        setWishlist(allWines.filter(w => w.wishlist));
        setNotes(noteRows.map(fromDb.note));
        if (prof) setProfile({ name: prof.name, description: prof.description, avatar: prof.avatar });
      } catch {}
      setSyncing(false);
    }
    fetchAll();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const h = e => setSysDark(e.matches);
    mq?.addEventListener("change", h);
    return () => mq?.removeEventListener("change", h);
  }, []);

  const dark = themeMode === "dark" || (themeMode === "system" && sysDark);

  useEffect(() => { const t = setTimeout(() => setSplashDone(true), 2200); return () => clearTimeout(t); }, []);

  const theme = {
    "--bg":     dark ? "#0D0A0A" : "#F3EEEC",
    "--card":   dark ? "#181212" : "#FFFFFF",
    "--card2":  dark ? "#201818" : "#EBE4E0",
    "--border": dark ? "#2A1E1E" : "#DDD3CE",
    "--text":   dark ? "#EDE0D8" : "#1A0F0F",
    "--muted":  dark ? "#6A5050" : "#9A8080",
    "--shadow": dark ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.06)",
  };

  const CSS = `
    @import url('${FONT}');
    @keyframes fadeUp   { from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:none } }
    @keyframes fadeIn   { from { opacity:0 } to { opacity:1 } }
    @keyframes sheetUp  { from { transform:translateY(48px); opacity:0 } to { transform:none; opacity:1 } }
    @keyframes blink    { 0%,80%,100% { transform:scale(0); opacity:.4 } 40% { transform:scale(1); opacity:1 } }
    @keyframes glow     { 0%,100% { opacity:.7 } 50% { opacity:1 } }
    @keyframes shimmer { 0% { background-position:200% 0 } 100% { background-position:-200% 0 } }
    * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    ::-webkit-scrollbar { width:0; }
    select, option { background: var(--card2); color: var(--text); }
  `;

  /* ── Splash ── */
  if (!splashDone) return (
    <div style={{ ...theme, background: "linear-gradient(150deg, #0D0202 0%, #280707 55%, #0D0202 100%)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style>
      <div style={{ animation: "fadeUp .9s ease forwards", textAlign: "center" }}>
        <div style={{ marginBottom: 20, animation: "glow 2s ease infinite", display: "inline-block" }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#C8432A" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 22h8M12 11v11M6 3h12l-2 7a4 4 0 01-8 0L6 3z"/>
          </svg>
        </div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 46, fontWeight: 900, color: "#EDE0D8", letterSpacing: "-1.5px", lineHeight: 1 }}>Vino</div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "rgba(237,224,216,0.38)", marginTop: 6, marginBottom: 42, letterSpacing: "4px", textTransform: "uppercase" }}>Personal Cellar</div>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: 24, color: "rgba(237,224,216,0.8)", fontWeight: 400, animation: "fadeUp 1s .5s ease both" }}>
          {greeting}, <span style={{ color: "#E07060", fontWeight: 700 }}>{DEFAULT_PROFILE.name}</span>
        </div>
      </div>
    </div>
  );

  /* ── Supabase-wired handlers ── */
  const handleAddWine = async (w) => {
    setWines(p => [...p, w]);
    await db.upsert("wines", toDb.wine(w));
  };
  const handleUpdateWine = async (w) => {
    setWines(p => p.map(x => x.id === w.id ? w : x));
    await db.upsert("wines", toDb.wine(w));
  };
  const handleDeleteWine = async (id) => {
    setWines(p => p.filter(x => x.id !== id));
    await db.delete("wines", id);
  };
  const handleAddWishlist = async (w) => {
    setWishlist(p => [...p, w]);
    await db.upsert("wines", toDb.wine(w));
  };
  const handleUpdateWishlist = async (w) => {
    setWishlist(p => p.map(x => x.id === w.id ? w : x));
    await db.upsert("wines", toDb.wine(w));
  };
  const handleDeleteWishlist = async (id) => {
    setWishlist(p => p.filter(x => x.id !== id));
    await db.delete("wines", id);
  };
  const handleMoveToCollection = async (id) => {
    const w = wishlist.find(x => x.id === id);
    if (!w) return;
    const moved = { ...w, wishlist: false, bottles: 1, rating: 0 };
    setWishlist(p => p.filter(x => x.id !== id));
    setWines(p => [...p, moved]);
    await db.upsert("wines", toDb.wine(moved));
  };
  const handleAddNote = async (n) => {
    setNotes(p => [...p, n]);
    await db.upsert("tasting_notes", toDb.note(n));
  };
  const handleDeleteNote = async (id) => {
    setNotes(p => p.filter(x => x.id !== id));
    await db.delete("tasting_notes", id);
  };
  const handleSetProfile = async (p) => {
    setProfile(p);
    await db.saveProfile(p);
  };

  /* ── Main ── */
  return (
    <div style={{ ...theme, background: "var(--bg)", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "var(--text)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      <style>{CSS}</style>
      {/* Sync indicator */}
      {syncing && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 999, background: "linear-gradient(90deg, #C8432A, #E07060, #C8432A)", backgroundSize: "200% 100%", animation: "shimmer 1.2s linear infinite" }} />
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "28px 18px 96px", animation: "fadeUp .3s ease" }}>
        {tab === "collection" && <CollectionScreen wines={wines} onAdd={handleAddWine} onUpdate={handleUpdateWine} onDelete={handleDeleteWine} />}
        {tab === "wishlist"   && <WishlistScreen wishlist={wishlist} onAdd={handleAddWishlist} onUpdate={handleUpdateWishlist} onDelete={handleDeleteWishlist} onMoveToCollection={handleMoveToCollection} />}
        {tab === "ai"         && <AIScreen wines={wines} wishlist={wishlist} />}
        {tab === "notes"      && <NotesScreen wines={wines} notes={notes} onAdd={handleAddNote} onDelete={handleDeleteNote} />}
        {tab === "profile"    && <ProfileScreen wines={wines} wishlist={wishlist} notes={notes} theme={themeMode} setTheme={setThemeMode} profile={profile} setProfile={handleSetProfile} />}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: dark ? "rgba(13,10,10,0.94)" : "rgba(243,238,236,0.94)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderTop: "1px solid var(--border)", padding: "8px 0 20px", zIndex: 50 }}>
        <div style={{ display: "flex", justifyContent: "space-around" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "none", border: "none", cursor: "pointer", padding: "3px 10px", color: tab === t.id ? "#C8432A" : "var(--muted)", transition: "color 0.18s, transform 0.14s", transform: tab === t.id ? "scale(1.08)" : "scale(1)", fontFamily: "'DM Sans', sans-serif" }}>
              <Icon ic={t.ic} size={21} />
              <span style={{ fontSize: 9.5, fontWeight: tab === t.id ? 700 : 500 }}>{t.label}</span>
              <div style={{ width: 3, height: 3, borderRadius: "50%", background: tab === t.id ? "#C8432A" : "transparent", transition: "background 0.18s" }} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
