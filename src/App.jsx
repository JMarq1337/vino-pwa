import { useState, useEffect, useCallback, useRef } from "react";

/* ── SUPABASE ─────────────────────────────────────────────────── */
const SUPA_URL = "https://dfnvmwoacprkhxfbpybv.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbnZtd29hY3Bya2h4ZmJweWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTkwNTksImV4cCI6MjA4NzM5NTA1OX0.40VqzdfZ9zoJitgCTShNiMTOYheDRYgn84mZXX5ZECs";
const supa = t => `${SUPA_URL}/rest/v1/${t}`;
const BH = { "Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}` };
const UH = { ...BH, "Prefer":"resolution=merge-duplicates,return=minimal" };

const db = {
  async get(t) {
    try { const r = await fetch(`${supa(t)}?order=created_at`,{headers:BH}); return r.ok?await r.json():[]; }
    catch { return []; }
  },
  async upsert(t,row) {
    try { const r=await fetch(supa(t),{method:"POST",headers:UH,body:JSON.stringify(row)}); if(!r.ok)console.error("upsert fail",await r.text()); }
    catch(e){console.error(e);}
  },
  async del(t,id) {
    try { const r=await fetch(`${supa(t)}?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:BH}); if(!r.ok)console.error("del fail",await r.text()); }
    catch(e){console.error(e);}
  },
  async saveProfile(p) {
    try { await fetch(`${supa("profile")}?id=eq.1`,{method:"PATCH",headers:UH,body:JSON.stringify({name:p.name,description:p.description,avatar:p.avatar,surname:p.surname||"",cellar_name:p.cellarName||"",bio:p.bio||"",country:p.country||"",profile_bg:p.profileBg||""})}); }
    catch{}
  },
  async getProfile() {
    try { const r=await fetch(`${supa("profile")}?id=eq.1`,{headers:BH}); const d=r.ok?await r.json():[]; const p=d[0]||null; if(!p)return null; return{name:p.name,description:p.description,avatar:p.avatar||null,surname:p.surname||"",cellarName:p.cellar_name||"",bio:p.bio||"",country:p.country||"",profileBg:p.profile_bg||""}; }
    catch{return null;}
  }
};

const fromDb = {
  wine: r=>({ id:r.id,name:r.name,origin:r.origin,grape:r.grape,alcohol:r.alcohol,vintage:r.vintage,bottles:r.bottles,rating:r.rating,notes:r.notes,review:r.review,tastingNotes:r.tasting_notes,datePurchased:r.date_purchased,wishlist:r.wishlist,color:r.color,photo:r.photo,location:r.location,locationSlot:r.location_slot,wineType:r.wine_type }),
  note: r=>({ id:r.id,wineId:r.wine_id,title:r.title,content:r.content,date:r.date })
};
const toDb = {
  wine: w=>({ id:w.id,name:w.name,origin:w.origin,grape:w.grape,alcohol:w.alcohol,vintage:w.vintage,bottles:w.bottles,rating:w.rating,notes:w.notes,review:w.review,tasting_notes:w.tastingNotes,date_purchased:w.datePurchased,wishlist:w.wishlist||false,color:w.color,photo:w.photo,location:w.location,location_slot:w.locationSlot,wine_type:w.wineType }),
  note: n=>({ id:n.id,wine_id:n.wineId,title:n.title,content:n.content,date:n.date })
};

/* ── FONTS ────────────────────────────────────────────────────── */
const FONT = "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap";

/* ── WINE DB ──────────────────────────────────────────────────── */
const WINE_DB = [
  { name:"Penfolds Grange",origin:"Barossa Valley, Australia",grape:"Shiraz",alcohol:14.5,tastingNotes:"Dark plum, leather, cedar, dark chocolate",wineType:"Red" },
  { name:"Penfolds Bin 389",origin:"South Australia, Australia",grape:"Cabernet Shiraz",alcohol:14.5,tastingNotes:"Blackcurrant, plum, cedar, oak",wineType:"Red" },
  { name:"Henschke Hill of Grace",origin:"Eden Valley, Australia",grape:"Shiraz",alcohol:14.0,tastingNotes:"Blackberry, spice, earth, pepper",wineType:"Red" },
  { name:"Torbreck RunRig",origin:"Barossa Valley, Australia",grape:"Shiraz Viognier",alcohol:15.0,tastingNotes:"Dark fruit, violet, pepper, chocolate",wineType:"Red" },
  { name:"Yattarna Chardonnay",origin:"Multi-regional, Australia",grape:"Chardonnay",alcohol:13.0,tastingNotes:"White peach, citrus, flint, cashew",wineType:"White" },
  { name:"Cloudy Bay Sauvignon Blanc",origin:"Marlborough, New Zealand",grape:"Sauvignon Blanc",alcohol:13.0,tastingNotes:"Passionfruit, lime, cut grass, gooseberry",wineType:"White" },
  { name:"Leeuwin Estate Art Series Chardonnay",origin:"Margaret River, Australia",grape:"Chardonnay",alcohol:13.5,tastingNotes:"Grapefruit, nectarine, oak, toasty",wineType:"White" },
  { name:"Grosset Polish Hill Riesling",origin:"Clare Valley, Australia",grape:"Riesling",alcohol:12.0,tastingNotes:"Lime juice, slate, citrus blossom",wineType:"White" },
  { name:"Château Margaux",origin:"Bordeaux, France",grape:"Cabernet Sauvignon blend",alcohol:13.5,tastingNotes:"Blackcurrant, violet, tobacco, cedar",wineType:"Red" },
  { name:"Château Pétrus",origin:"Pomerol, France",grape:"Merlot",alcohol:14.0,tastingNotes:"Truffle, plum, chocolate, iron",wineType:"Red" },
  { name:"Château Lafite Rothschild",origin:"Pauillac, France",grape:"Cabernet Sauvignon blend",alcohol:13.0,tastingNotes:"Cassis, cedar, pencil shavings, rose",wineType:"Red" },
  { name:"Dom Pérignon",origin:"Champagne, France",grape:"Chardonnay / Pinot Noir",alcohol:12.5,tastingNotes:"Toast, cream, lemon, hazelnut",wineType:"Sparkling" },
  { name:"Krug Grande Cuvée",origin:"Champagne, France",grape:"Chardonnay / Pinot Noir / Meunier",alcohol:12.0,tastingNotes:"Brioche, apple, almond, ginger",wineType:"Sparkling" },
  { name:"Veuve Clicquot Yellow Label",origin:"Champagne, France",grape:"Pinot Noir / Chardonnay / Meunier",alcohol:12.0,tastingNotes:"Pear, peach, brioche, vanilla",wineType:"Sparkling" },
  { name:"Romanée-Conti DRC",origin:"Burgundy, France",grape:"Pinot Noir",alcohol:13.0,tastingNotes:"Violet, rose, earth, spice, red cherry",wineType:"Red" },
  { name:"Château d'Yquem",origin:"Sauternes, France",grape:"Sémillon / Sauvignon Blanc",alcohol:13.5,tastingNotes:"Honey, apricot, caramel, marmalade",wineType:"Dessert" },
  { name:"Whispering Angel Rosé",origin:"Provence, France",grape:"Grenache / Cinsault / Syrah",alcohol:13.0,tastingNotes:"Strawberry, peach, rose petal, citrus",wineType:"Rosé" },
  { name:"Miraval Rosé",origin:"Provence, France",grape:"Cinsault / Grenache",alcohol:13.0,tastingNotes:"Peach, strawberry, floral, mineral",wineType:"Rosé" },
  { name:"Château Cheval Blanc",origin:"Saint-Émilion, France",grape:"Cabernet Franc / Merlot",alcohol:14.0,tastingNotes:"Plum, iris, graphite, chocolate",wineType:"Red" },
  { name:"Barolo Monfortino Giacomo Conterno",origin:"Piedmont, Italy",grape:"Nebbiolo",alcohol:14.5,tastingNotes:"Rose petal, cherry, tar, tobacco, truffle",wineType:"Red" },
  { name:"Barbaresco Gaja",origin:"Piedmont, Italy",grape:"Nebbiolo",alcohol:14.0,tastingNotes:"Cherry, rose, tar, anise, chocolate",wineType:"Red" },
  { name:"Sassicaia",origin:"Bolgheri, Italy",grape:"Cabernet Sauvignon / Cabernet Franc",alcohol:13.5,tastingNotes:"Blackcurrant, cedar, tobacco, mint",wineType:"Red" },
  { name:"Ornellaia",origin:"Tuscany, Italy",grape:"Cabernet Sauvignon blend",alcohol:14.0,tastingNotes:"Black cherry, plum, coffee, graphite",wineType:"Red" },
  { name:"Vega Sicilia Único",origin:"Ribera del Duero, Spain",grape:"Tempranillo / Cabernet Sauvignon",alcohol:14.0,tastingNotes:"Blackberry, tobacco, vanilla, cedar",wineType:"Red" },
  { name:"Opus One",origin:"Napa Valley, USA",grape:"Cabernet Sauvignon blend",alcohol:14.5,tastingNotes:"Blackcurrant, cassis, cedar, dark chocolate",wineType:"Red" },
  { name:"Screaming Eagle",origin:"Napa Valley, USA",grape:"Cabernet Sauvignon",alcohol:14.5,tastingNotes:"Cassis, black cherry, pencil lead, graphite",wineType:"Red" },
  { name:"Harlan Estate",origin:"Napa Valley, USA",grape:"Cabernet Sauvignon blend",alcohol:14.5,tastingNotes:"Dark fruit, violet, chocolate, cedar",wineType:"Red" },
  { name:"Ridge Monte Bello",origin:"Santa Cruz Mountains, USA",grape:"Cabernet Sauvignon blend",alcohol:13.5,tastingNotes:"Blackberry, cedar, earth, tobacco",wineType:"Red" },
  { name:"Egon Müller Scharzhofberger Riesling TBA",origin:"Mosel, Germany",grape:"Riesling",alcohol:6.0,tastingNotes:"Honey, apricot, peach, mineral, petrol",wineType:"Dessert" },
  { name:"Taylor Fladgate Vintage Port",origin:"Douro, Portugal",grape:"Touriga Nacional blend",alcohol:20.0,tastingNotes:"Fig, plum, chocolate, nuts, toffee",wineType:"Fortified" },
  { name:"Catena Zapata Adrianna Vineyard",origin:"Mendoza, Argentina",grape:"Malbec / Cabernet Franc",alcohol:14.5,tastingNotes:"Violet, blueberry, tobacco, chocolate",wineType:"Red" },
  { name:"Almaviva",origin:"Maipo Valley, Chile",grape:"Cabernet Sauvignon blend",alcohol:14.5,tastingNotes:"Cassis, plum, cedar, tobacco",wineType:"Red" },
  { name:"Kanonkop Paul Sauer",origin:"Stellenbosch, South Africa",grape:"Cabernet Sauvignon blend",alcohol:14.0,tastingNotes:"Cassis, plum, cedar, tobacco, dark chocolate",wineType:"Red" },
];

const WINE_TYPE_COLORS = {
  Red:       { bg:"#FDF1F1", dot:"#B83232", text:"#8B1A1A" },
  White:     { bg:"#FDFAF0", dot:"#B89B32", text:"#7A6520" },
  Rosé:      { bg:"#FDF2F5", dot:"#C47A8A", text:"#8B3A4A" },
  Sparkling: { bg:"#F0F5FD", dot:"#4A7AC4", text:"#2A4A8B" },
  Dessert:   { bg:"#FDF6E8", dot:"#C4941A", text:"#8B6010" },
  Fortified: { bg:"#F5EEF8", dot:"#8B4AC4", text:"#5A1A8B" },
  Other:     { bg:"#F5F5F5", dot:"#888",    text:"#555" },
};

const guessWineType = (grape="",name="") => {
  const g=(grape+name).toLowerCase();
  if(g.includes("champagne")||g.includes("sparkling")||g.includes("prosecco")||g.includes("cava"))return"Sparkling";
  if(g.includes("ros"))return"Rosé";
  if(g.includes("port")||g.includes("sherry")||g.includes("madeira"))return"Fortified";
  if(g.includes("sauternes")||g.includes("tba")||g.includes("dessert"))return"Dessert";
  if(g.includes("chardonnay")||g.includes("sauvignon blanc")||g.includes("riesling")||g.includes("pinot gris")||g.includes("pinot grigio")||g.includes("viognier")||g.includes("chenin"))return"White";
  if(g.includes("pinot noir")||g.includes("cabernet")||g.includes("merlot")||g.includes("shiraz")||g.includes("syrah")||g.includes("malbec")||g.includes("tempranillo")||g.includes("nebbiolo")||g.includes("sangiovese")||g.includes("grenache")||g.includes("zinfandel"))return"Red";
  return"Other";
};

/* ── HELPERS ──────────────────────────────────────────────────── */
const uid = ()=>Math.random().toString(36).slice(2,9);
const fuzzySearch = q=>{
  if(!q||q.length<2)return[];
  const lq=q.toLowerCase();
  return WINE_DB.filter(w=>w.name.toLowerCase().includes(lq)||w.grape.toLowerCase().includes(lq)||w.origin.toLowerCase().includes(lq)).slice(0,7);
};
const LOCATIONS=["Rack A","Rack B","Rack C","Fridge Top","Fridge Bottom","Cellar Row 1","Cellar Row 2","Cellar Row 3","Living Room","Custom"];
const fmt=d=>d?new Date(d).toLocaleDateString("en-AU",{month:"short",year:"numeric"}):null;

/* ── SEED DATA ────────────────────────────────────────────────── */
const SEED_WINES=[
  {id:"s1",name:"Penfolds Grange",origin:"Barossa Valley, Australia",grape:"Shiraz",alcohol:14.5,vintage:2018,bottles:3,rating:5,notes:"Pairs beautifully with slow-roasted lamb.",review:"Absolutely extraordinary.",tastingNotes:"Dark plum, leather, cedar, dark chocolate",datePurchased:"2023-06-15",wishlist:false,color:"#8B1A1A",photo:null,location:"Cellar Row 1",locationSlot:"B3",wineType:"Red"},
  {id:"s2",name:"Château Margaux",origin:"Bordeaux, France",grape:"Cabernet Sauvignon blend",alcohol:13.5,vintage:2016,bottles:1,rating:5,notes:"Best with truffle risotto.",review:"Perfection in a glass.",tastingNotes:"Blackcurrant, violet, tobacco, cedar",datePurchased:"2022-12-01",wishlist:false,color:"#8B1A1A",photo:null,location:"Rack A",locationSlot:"A1",wineType:"Red"},
  {id:"s3",name:"Cloudy Bay Sauvignon Blanc",origin:"Marlborough, New Zealand",grape:"Sauvignon Blanc",alcohol:13.0,vintage:2022,bottles:6,rating:4,notes:"Amazing with fresh seafood.",review:"My go-to white.",tastingNotes:"Passionfruit, lime, cut grass, gooseberry",datePurchased:"2023-09-20",wishlist:false,color:"#8B7355",photo:null,location:"Fridge Top",locationSlot:null,wineType:"White"},
  {id:"s4",name:"Whispering Angel Rosé",origin:"Provence, France",grape:"Grenache / Cinsault",alcohol:13.0,vintage:2023,bottles:4,rating:4,notes:"Perfect for summer evenings.",review:"Elegant and refreshing.",tastingNotes:"Strawberry, peach, rose petal",datePurchased:"2023-11-10",wishlist:false,color:"#C47A8A",photo:null,location:"Fridge Bottom",locationSlot:null,wineType:"Rosé"},
];
const SEED_WISHLIST=[
  {id:"w1",name:"Opus One",origin:"Napa Valley, USA",grape:"Cabernet Sauvignon blend",alcohol:14.5,vintage:2019,notes:"Dream bottle.",wishlist:true,color:"#1A1A2E",photo:null,wineType:"Red"},
  {id:"w2",name:"Dom Pérignon",origin:"Champagne, France",grape:"Chardonnay / Pinot Noir",alcohol:12.5,vintage:2013,notes:"For a very special celebration.",wishlist:true,color:"#8B7355",photo:null,wineType:"Sparkling"},
];
const SEED_NOTES=[
  {id:"n1",wineId:"s1",title:"Christmas Dinner 2023",content:"Opened with family. Paired with slow-roasted lamb. Absolutely magical.",date:"2023-12-25"},
  {id:"n2",wineId:"s3",title:"Summer BBQ Pairings",content:"Incredible with fresh prawns on the barbie. Also tried with grilled snapper — even better.",date:"2023-11-12"},
];
const DEFAULT_PROFILE={name:"Neale",description:"Winemaker & Collector",avatar:null};

/* ── ICONS ────────────────────────────────────────────────────── */
const IC={
  wine:"M8 22h8M12 11v11M6 3h12l-2 7a4 4 0 01-8 0L6 3z",
  heart:"M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z",
  chat:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  note:"M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  user:"M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z",
  plus:"M12 5v14M5 12h14",
  send:"M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z",
  edit:"M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  trash:"M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  filter:"M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 7h6",
  x:"M18 6L6 18M6 6l12 12",
  chevR:"M9 18l6-6-6-6",
  sun:"M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 17a5 5 0 100-10 5 5 0 000 10z",
  moon:"M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  monitor:"M2 3h20a2 2 0 012 2v12a2 2 0 01-2 2H2a2 2 0 01-2-2V5a2 2 0 012-2zM8 21h8M12 17v4",
  export:"M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  camera:"M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2zM12 17a4 4 0 100-8 4 4 0 000 8z",
  location:"M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0zM12 13a3 3 0 100-6 3 3 0 000 6z",
  settings:"M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z",
  mappin:"M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10a1 1 0 100-2 1 1 0 000 2",
  globe:"M12 22a10 10 0 110-20 10 10 0 010 20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
  palette:"M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c.55 0 1-.45 1-1 0-.27-.1-.51-.25-.7a1 1 0 01.25-.7c0-.55.45-1 1-1h1.17C16.73 18.83 18 17.56 18 16c0-3.87-2.69-7.01-6-7z",
  winery:"M9 3h6l1 9a5 5 0 01-8 0L9 3zM6 21h12M12 12v9",
};

const Icon=({n,size=20,color="currentColor",fill="none",sw=1.5})=>{
  if(n==="star")return(<svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>);
  if(n==="search")return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>);
  return(<svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"><path d={IC[n]}/></svg>);
};

/* ── AI ───────────────────────────────────────────────────────── */
const callAI=async(msg,wines)=>{
  const sys=`You are Vino, a warm knowledgeable personal wine sommelier. User collection: ${JSON.stringify(wines.filter(w=>!w.wishlist).map(w=>({name:w.name,grape:w.grape,vintage:w.vintage,bottles:w.bottles,rating:w.rating})))}. Be concise, warm, expert. Max 3-4 sentences unless listing.`;
  try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,system:sys,messages:[{role:"user",content:msg}]})});const d=await r.json();return d.content?.[0]?.text||"Having a moment — try again.";}
  catch{return"Connection issue. Please try again.";}
};

/* ── THEME ────────────────────────────────────────────────────── */
const T=dark=>({
  bg:dark?"#0C0A0A":"#F7F4F2",
  surface:dark?"#161212":"#FFFFFF",
  card:dark?"#1E1818":"#FFFFFF",
  border:dark?"rgba(255,255,255,0.07)":"rgba(0,0,0,0.08)",
  text:dark?"#EDE6E0":"#1A1210",
  sub:dark?"#7A6A62":"#9A8880",
  inputBg:dark?"#201A1A":"#F5F2F0",
  shadow:dark?"rgba(0,0,0,0.6)":"rgba(0,0,0,0.08)",
});

const makeCSS=dark=>`
  @import url('${FONT}');
  *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
  ::-webkit-scrollbar{display:none;}
  body{background:${dark?"#0C0A0A":"#F7F4F2"};}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
  @keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes floatUp{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
  input,textarea,select{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;color:${dark?"#EDE6E0":"#1A1210"};background:${dark?"#201A1A":"#FFFFFF"};border:1.5px solid ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.12)"};border-radius:12px;padding:12px 14px;width:100%;outline:none;transition:border-color 0.2s,box-shadow 0.2s;-webkit-appearance:none;box-shadow:${dark?"none":"0 1px 4px rgba(0,0,0,0.06)"};}
  input:focus,textarea:focus,select:focus{border-color:#9B2335;}
  select option{background:${dark?"#201A1A":"#fff"};}
  button{cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;}
`;

/* ── PRIMITIVES ───────────────────────────────────────────────── */
const Stars=({value,onChange,size=17})=>(
  <div style={{display:"flex",gap:2}}>
    {[1,2,3,4,5].map(s=>(
      <button key={s} onClick={()=>onChange?.(s)} style={{background:"none",border:"none",padding:"2px",color:s<=value?"#E8A020":"var(--sub)",transition:"transform 0.1s"}}
        onMouseEnter={e=>{if(onChange)e.currentTarget.style.transform="scale(1.25)"}}
        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}>
        <Icon n="star" size={size} fill={s<=value?"currentColor":"none"} color={s<=value?"#E8A020":"var(--sub)"} sw={1.5}/>
      </button>
    ))}
  </div>
);

const WineTypePill=({type})=>{
  const c=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  return(<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,background:c.bg,color:c.text,fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:c.dot,flexShrink:0}}/>{type}</span>);
};

const Modal=({show,onClose,children,wide})=>{
  if(!show)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",animation:"fadeIn .2s"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxWidth:wide?520:420,background:"var(--surface)",borderRadius:24,maxHeight:"88vh",overflowY:"auto",animation:"modalIn .22s cubic-bezier(0.34,1.2,0.64,1)",boxShadow:"0 32px 80px rgba(0,0,0,0.4)"}}>
        <div style={{padding:"24px 24px 28px"}}>{children}</div>
      </div>
    </div>
  );
};

const ModalHeader=({title,onClose})=>(
  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:22}}>
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:700,color:"var(--text)",lineHeight:1}}>{title}</div>
    <button onClick={onClose} style={{background:"var(--inputBg)",border:"none",borderRadius:10,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)"}}><Icon n="x" size={15}/></button>
  </div>
);

const Field=({label,value,onChange,type="text",placeholder,rows,optional})=>(
  <div style={{marginBottom:14}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
      <label style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</label>
      {optional&&<span style={{fontSize:10,color:"var(--sub)",opacity:0.6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>optional</span>}
    </div>
    {rows?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{resize:"none"}}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}/>}
  </div>
);

const SelField=({label,value,onChange,options})=>(
  <div style={{marginBottom:14}}>
    {label&&<label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}</select>
  </div>
);

const Btn=({children,onClick,variant="primary",full,disabled,icon})=>{
  const s={
    primary:{background:"#9B2335",color:"#fff",border:"none",boxShadow:"0 4px 16px rgba(155,35,53,0.3)"},
    secondary:{background:"var(--inputBg)",color:"var(--text)",border:"1.5px solid var(--border)"},
    ghost:{background:"none",color:"var(--sub)",border:"none"},
    danger:{background:"rgba(200,50,50,0.1)",color:"#C43232",border:"1.5px solid rgba(200,50,50,0.2)"},
  };
  return(
    <button disabled={disabled} onClick={disabled?undefined:onClick}
      style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,padding:"13px 20px",borderRadius:12,fontSize:14,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",width:full?"100%":"auto",transition:"opacity 0.15s,transform 0.1s",opacity:disabled?0.4:1,...s[variant]}}
      onMouseEnter={e=>{if(!disabled){e.currentTarget.style.opacity="0.82";e.currentTarget.style.transform="scale(0.98)"}}}
      onMouseLeave={e=>{e.currentTarget.style.opacity="1";e.currentTarget.style.transform="scale(1)"}}>
      {icon&&<Icon n={icon} size={15} color="currentColor"/>}{children}
    </button>
  );
};

const PhotoPicker=({value,onChange,size=80,round})=>{
  const ref=useRef();
  const handle=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>onChange(ev.target.result);r.readAsDataURL(f);};
  return(
    <div onClick={()=>ref.current.click()} style={{width:size,height:size,borderRadius:round?"50%":14,background:"var(--inputBg)",border:"1.5px dashed var(--border)",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0,transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="#9B2335"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
      {value?<img src={value} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<div style={{textAlign:"center",color:"var(--sub)",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><Icon n="camera" size={20}/><span style={{fontSize:10,fontWeight:600}}>Photo</span></div>}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} style={{display:"none"}}/>
    </div>
  );
};

/* ── WINE CARD ────────────────────────────────────────────────── */
const WineCard=({wine,onClick})=>{
  const type=wine.wineType||guessWineType(wine.grape,wine.name);
  const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  return(
    <div onClick={onClick} style={{background:"var(--card)",borderRadius:20,padding:"16px",cursor:"pointer",border:"1px solid var(--border)",marginBottom:10,display:"flex",gap:14,alignItems:"flex-start",transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 2px 8px var(--shadow)"}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px var(--shadow)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)";}}>
      <div style={{width:60,height:72,borderRadius:13,background:tc.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {wine.photo?<img src={wine.photo} alt={wine.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="wine" size={24} color={tc.dot}/>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)",lineHeight:1.25,flex:1,paddingRight:8}}>{wine.name}{wine.vintage?` ${wine.vintage}`:""}</div>
          {!wine.wishlist&&wine.bottles>0&&<div style={{fontSize:12,color:"var(--sub)",fontWeight:500,flexShrink:0,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{wine.bottles} {wine.bottles===1?"btl":"btls"}</div>}
        </div>
        {wine.origin&&<div style={{fontSize:13,color:"var(--sub)",marginBottom:7,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{wine.origin.split(",")[0]}</div>}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <WineTypePill type={type}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {wine.origin&&<span style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:3}}><Icon n="location" size={11} color="var(--sub)"/>{wine.origin.split(",").pop()?.trim()}</span>}
            {wine.grape&&<span style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>· {wine.grape.split("/")[0].trim()}</span>}
          </div>
          {wine.rating>0&&<Stars value={wine.rating} size={12}/>}
        </div>
      </div>
    </div>
  );
};

/* ── WINE DETAIL ──────────────────────────────────────────────── */
const WineDetail=({wine,onEdit,onDelete,onMove})=>{
  const type=wine.wineType||guessWineType(wine.grape,wine.name);
  const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  return(
    <div>
      <div style={{borderRadius:16,background:tc.bg,padding:"20px",marginBottom:16,position:"relative",overflow:"hidden",minHeight:100}}>
        <div style={{position:"absolute",right:-8,bottom:-12,opacity:0.12,pointerEvents:"none"}}><Icon n="wine" size={100} color={tc.dot}/></div>
        <WineTypePill type={type}/>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"var(--text)",marginTop:8,lineHeight:1.2}}>{wine.name}</div>
        {wine.vintage&&<div style={{fontSize:14,color:"var(--sub)",marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{wine.vintage} · {wine.origin}</div>}
        {wine.rating>0&&<div style={{marginTop:10}}><Stars value={wine.rating} size={16}/></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
        {[["Grape",wine.grape],["Alcohol",wine.alcohol?`${wine.alcohol}%`:null],!wine.wishlist&&["Bottles",wine.bottles],!wine.wishlist&&["Location",wine.location?(wine.location+(wine.locationSlot?` · ${wine.locationSlot}`:"")):null],["Purchased",fmt(wine.datePurchased)]].filter(x=>x&&x[1]).map(([l,v])=>(
          <div key={l} style={{background:"var(--inputBg)",borderRadius:12,padding:"11px 13px"}}>
            <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
            <div style={{fontSize:14,color:"var(--text)",fontWeight:500,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{v}</div>
          </div>
        ))}
      </div>
      {[["Tasting Notes",wine.tastingNotes,false],["Review",wine.review,true],["Personal Notes",wine.notes,false]].map(([l,v,ital])=>v?(
        <div key={l} style={{background:"var(--inputBg)",borderRadius:12,padding:"12px 14px",marginBottom:8}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:5,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
          <div style={{fontSize:14,color:"var(--text)",lineHeight:1.65,fontStyle:ital?"italic":"normal",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{ital?`"${v}"`:v}</div>
        </div>
      ):null)}
      {wine.wishlist&&onMove&&<div style={{marginBottom:8}}><Btn full onClick={onMove}>Move to Collection</Btn></div>}
      <div style={{display:"flex",gap:8,marginTop:12}}>
        <Btn variant="secondary" onClick={onEdit} full icon="edit">Edit</Btn>
        <Btn variant="danger" onClick={onDelete} full icon="trash">Delete</Btn>
      </div>
    </div>
  );
};

/* ── WINE FORM ────────────────────────────────────────────────── */
const WineForm=({initial,onSave,onClose,isWishlist})=>{
  const blank={name:"",origin:"",grape:"",wineType:"Red",alcohol:"",vintage:"",bottles:"1",rating:0,notes:"",review:"",tastingNotes:"",datePurchased:"",wishlist:!!isWishlist,photo:null,location:"Rack A",locationSlot:""};
  const [f,setF]=useState(initial?{...blank,...initial,alcohol:initial.alcohol?.toString()||"",vintage:initial.vintage?.toString()||"",bottles:initial.bottles?.toString()||"",locationSlot:initial.locationSlot||"",wineType:initial.wineType||guessWineType(initial.grape||"",initial.name||"")}:blank);
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const [q,setQ]=useState(initial?.name||"");
  const [sugs,setSugs]=useState([]);
  const [showFields,setShowFields]=useState(!!initial);
  const handleQ=v=>{setQ(v);set("name",v);setSugs(v.length>=2?fuzzySearch(v):[]);};
  const pickSug=w=>{setF(p=>({...p,name:w.name,origin:w.origin||"",grape:w.grape||"",alcohol:w.alcohol?.toString()||"",tastingNotes:w.tastingNotes||"",wineType:w.wineType||guessWineType(w.grape||"",w.name)}));setQ(w.name);setSugs([]);setShowFields(true);};
  const save=()=>{
    if(!f.name)return;
    const wt=f.wineType||guessWineType(f.grape,f.name);
    const tc=WINE_TYPE_COLORS[wt]||WINE_TYPE_COLORS.Other;
    onSave({...f,id:f.id||uid(),alcohol:parseFloat(f.alcohol)||0,vintage:parseInt(f.vintage)||null,bottles:parseInt(f.bottles)||0,locationSlot:f.locationSlot||null,wineType:wt,color:tc.dot});
    onClose();
  };
  return(
    <div>
      <ModalHeader title={initial?"Edit Wine":isWishlist?"Add to Wishlist":"Add Wine"} onClose={onClose}/>
      <div style={{display:"flex",justifyContent:"center",marginBottom:18}}>
        <PhotoPicker value={f.photo} onChange={v=>set("photo",v)} size={76}/>
      </div>
      <div style={{marginBottom:14,position:"relative"}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Search wine database</label>
        <div style={{position:"relative"}}>
          <input value={q} onChange={e=>handleQ(e.target.value)} placeholder="Wine name, grape, or region…" style={{paddingLeft:38}} onBlur={()=>setTimeout(()=>setSugs([]),160)}/>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
        </div>
        {sugs.length>0&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",borderRadius:14,border:"1px solid var(--border)",zIndex:99,maxHeight:220,overflowY:"auto",boxShadow:"0 12px 40px rgba(0,0,0,0.2)",marginTop:4}}>
            {sugs.map((w,i)=>(
              <div key={i} onMouseDown={()=>pickSug(w)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<sugs.length-1?"1px solid var(--border)":"none"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--inputBg)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)"}}>{w.name}</div>
                <div style={{fontSize:12,color:"var(--sub)",marginTop:1}}>{w.grape} · {w.origin}</div>
              </div>
            ))}
            <div onMouseDown={()=>{setSugs([]);setShowFields(true);}} style={{padding:"10px 14px",cursor:"pointer",color:"#9B2335",fontSize:13,fontWeight:600,textAlign:"center",borderTop:"1px solid var(--border)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              Add "{q}" manually
            </div>
          </div>
        )}
        {!showFields&&!sugs.length&&q.length>=1&&(
          <button onMouseDown={()=>setShowFields(true)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"#9B2335",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Enter details manually
          </button>
        )}
      </div>
      {showFields&&(
        <div>
          <Field label="Wine Name" value={f.name} onChange={v=>set("name",v)} placeholder="e.g. Penfolds Grange"/>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10}}>
            <Field label="Origin" value={f.origin} onChange={v=>set("origin",v)} placeholder="Region, Country" optional/>
            <SelField label="Type" value={f.wineType} onChange={v=>set("wineType",v)} options={Object.keys(WINE_TYPE_COLORS).filter(k=>k!=="Other")}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <Field label="Grape" value={f.grape} onChange={v=>set("grape",v)} placeholder="Shiraz" optional/>
            <Field label="Vintage" value={f.vintage} onChange={v=>set("vintage",v)} type="number" placeholder="2019" optional/>
            <Field label="Alc %" value={f.alcohol} onChange={v=>set("alcohol",v)} type="number" placeholder="14.5" optional/>
          </div>
          {!isWishlist&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:10}}>
              <Field label="Bottles" value={f.bottles} onChange={v=>set("bottles",v)} type="number" placeholder="1" optional/>
              <SelField label="Location" value={f.location} onChange={v=>set("location",v)} options={LOCATIONS}/>
              <Field label="Slot" value={f.locationSlot} onChange={v=>set("locationSlot",v)} placeholder="A3" optional/>
            </div>
          )}
          <Field label="Tasting Notes" value={f.tastingNotes} onChange={v=>set("tastingNotes",v)} placeholder="Dark plum, cedar…" optional/>
          <Field label="Personal Notes" value={f.notes} onChange={v=>set("notes",v)} placeholder="Pairings, memories…" rows={2} optional/>
          {!isWishlist&&(
            <div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Rating</div>
                <Stars value={f.rating} onChange={v=>set("rating",v)} size={22}/>
              </div>
              <Field label="Review" value={f.review} onChange={v=>set("review",v)} placeholder="Your thoughts…" rows={2} optional/>
              <Field label="Date Purchased" value={f.datePurchased} onChange={v=>set("datePurchased",v)} type="date" optional/>
            </div>
          )}
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <Btn variant="secondary" onClick={onClose} full>Cancel</Btn>
            <Btn onClick={save} full disabled={!f.name}>Save Wine</Btn>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── FILTER PANEL ─────────────────────────────────────────────── */
const SORTS=[{value:"name",label:"Name A–Z"},{value:"rating",label:"Rating"},{value:"vintage",label:"Vintage"},{value:"bottles",label:"Bottles"},{value:"recent",label:"Recently Added"}];
const DEFAULT_FILTERS={sort:"name",type:"",minRating:0,location:""};
const hasFilters=f=>f.sort!=="name"||f.type||f.minRating>0||f.location;
const applyFilters=(wines,f,s)=>{
  let r=wines.filter(w=>!w.wishlist);
  if(s)r=r.filter(w=>`${w.name} ${w.grape} ${w.origin} ${w.location}`.toLowerCase().includes(s.toLowerCase()));
  if(f.minRating>0)r=r.filter(w=>(w.rating||0)>=f.minRating);
  if(f.type)r=r.filter(w=>(w.wineType||guessWineType(w.grape,w.name))===f.type);
  if(f.location)r=r.filter(w=>w.location===f.location);
  return r.sort((a,b)=>{
    if(f.sort==="rating")return(b.rating||0)-(a.rating||0);
    if(f.sort==="vintage")return(b.vintage||0)-(a.vintage||0);
    if(f.sort==="bottles")return(b.bottles||0)-(a.bottles||0);
    if(f.sort==="recent")return b.id.localeCompare(a.id);
    return a.name.localeCompare(b.name);
  });
};

const FilterPanel=({filters,setFilters,wines,onClose})=>{
  const col=wines.filter(w=>!w.wishlist);
  const locs=[...new Set(col.map(w=>w.location).filter(Boolean))].sort();
  const [local,setLocal]=useState({...filters});
  const chip=(active)=>({padding:"7px 13px",borderRadius:20,border:active?"1.5px solid #9B2335":"1.5px solid var(--border)",background:active?"rgba(155,35,53,0.1)":"var(--inputBg)",color:active?"#9B2335":"var(--text)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all 0.15s"});
  return(
    <div>
      <ModalHeader title="Filter & Sort" onClose={onClose}/>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Sort By</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {SORTS.map(o=><button key={o.value} onClick={()=>setLocal(p=>({...p,sort:o.value}))} style={chip(local.sort===o.value)}>{o.label}</button>)}
      </div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Min Rating</div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>
        {[0,1,2,3,4,5].map(r=><button key={r} onClick={()=>setLocal(p=>({...p,minRating:r}))} style={chip(local.minRating===r)}>{r===0?"Any":`${r}+`}</button>)}
      </div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Wine Type</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {Object.keys(WINE_TYPE_COLORS).filter(k=>k!=="Other").map(t=><button key={t} onClick={()=>setLocal(p=>({...p,type:p.type===t?"":t}))} style={chip(local.type===t)}>{t}</button>)}
      </div>
      {locs.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Location</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
            {locs.map(l=><button key={l} onClick={()=>setLocal(p=>({...p,location:p.location===l?"":l}))} style={chip(local.location===l)}>{l}</button>)}
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8}}>
        <Btn variant="secondary" onClick={()=>setLocal(DEFAULT_FILTERS)} full>Reset</Btn>
        <Btn onClick={()=>{setFilters(local);onClose();}} full>Apply</Btn>
      </div>
    </div>
  );
};

const Empty=({icon,text})=>(
  <div style={{textAlign:"center",padding:"56px 0",color:"var(--sub)"}}>
    <div style={{marginBottom:12,opacity:0.3}}><Icon n={icon} size={44} color="var(--sub)"/></div>
    <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:14}}>{text}</div>
  </div>
);
const Chip=({label,onX})=>(
  <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(155,35,53,0.1)",border:"1.5px solid rgba(155,35,53,0.25)"}}>
    <span style={{fontSize:12,color:"#9B2335",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{label}</span>
    <button onClick={onX} style={{background:"none",border:"none",color:"#9B2335",padding:0,lineHeight:1,display:"flex",cursor:"pointer"}}><Icon n="x" size={11}/></button>
  </div>
);

/* ── COLLECTION ───────────────────────────────────────────────── */
const CollectionScreen=({wines,onAdd,onUpdate,onDelete,desktop})=>{
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const [adding,setAdding]=useState(false);
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState(DEFAULT_FILTERS);
  const [filterOpen,setFilterOpen]=useState(false);
  const col=wines.filter(w=>!w.wishlist);
  const filt=applyFilters(wines,filters,search);
  const bottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const active=hasFilters(filters);
  return(
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>My Cellar</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1,letterSpacing:"-1px"}}>
            {col.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>wines</span>
          </div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,color:"var(--sub)"}}>{bottles} bottles</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wines, regions…" style={{paddingLeft:38,borderRadius:14}}/>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
        </div>
        <button onClick={()=>setFilterOpen(true)} style={{width:44,height:44,borderRadius:14,background:active?"rgba(155,35,53,0.12)":"var(--card)",border:active?"1.5px solid #9B2335":"1.5px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:active?"#9B2335":"var(--sub)",flexShrink:0,position:"relative",cursor:"pointer"}}>
          <Icon n="filter" size={17}/>
          {active&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:"#9B2335",border:"1.5px solid var(--bg)"}}/>}
        </button>
        <button onClick={()=>setAdding(true)} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",flexShrink:0,boxShadow:"0 4px 16px rgba(155,35,53,0.35)",cursor:"pointer"}}>
          <Icon n="plus" size={20}/>
        </button>
      </div>
      {active&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {filters.sort!=="name"&&<Chip label={SORTS.find(o=>o.value===filters.sort)?.label} onX={()=>setFilters(p=>({...p,sort:"name"}))}/>}
          {filters.minRating>0&&<Chip label={`${filters.minRating}+ stars`} onX={()=>setFilters(p=>({...p,minRating:0}))}/>}
          {filters.type&&<Chip label={filters.type} onX={()=>setFilters(p=>({...p,type:""}))}/>}
          {filters.location&&<Chip label={filters.location} onX={()=>setFilters(p=>({...p,location:""}))}/>}
          <button onClick={()=>setFilters(DEFAULT_FILTERS)} style={{padding:"4px 10px",borderRadius:20,border:"none",background:"none",color:"var(--sub)",fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:"underline"}}>Clear all</button>
        </div>
      )}
      {filt.length===0
        ? <Empty icon="wine" text={search||active?"No wines match your filters.":"Your cellar is empty. Add your first wine."}/>
        : <div style={{display:desktop?"grid":"block",gridTemplateColumns:desktop?"1fr 1fr":"none",gap:desktop?10:0}}>
            {filt.map(w=><WineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
          </div>
      }
      <Modal show={!!sel&&!editing} onClose={()=>setSel(null)} wide>
        {sel&&<WineDetail wine={sel} onEdit={()=>setEditing(true)} onDelete={()=>{onDelete(sel.id);setSel(null);}}/>}
      </Modal>
      <Modal show={editing} onClose={()=>setEditing(false)} wide>
        <WineForm initial={sel} onSave={w=>{onUpdate(w);setSel(w);setEditing(false);}} onClose={()=>setEditing(false)}/>
      </Modal>
      <Modal show={adding} onClose={()=>setAdding(false)} wide>
        <WineForm onSave={w=>{onAdd(w);setAdding(false);}} onClose={()=>setAdding(false)}/>
      </Modal>
      <Modal show={filterOpen} onClose={()=>setFilterOpen(false)}>
        <FilterPanel filters={filters} setFilters={setFilters} wines={wines} onClose={()=>setFilterOpen(false)}/>
      </Modal>
    </div>
  );
};

/* ── WISHLIST ─────────────────────────────────────────────────── */
const WishlistScreen=({wishlist,onAdd,onUpdate,onDelete,onMove,desktop})=>{
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const [adding,setAdding]=useState(false);
  return(
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Wishlist</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1,letterSpacing:"-1px"}}>
            {wishlist.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>to try</span>
          </div>
          <button onClick={()=>setAdding(true)} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",boxShadow:"0 4px 16px rgba(155,35,53,0.35)",cursor:"pointer"}}><Icon n="plus" size={20}/></button>
        </div>
      </div>
      {wishlist.length===0
        ? <Empty icon="heart" text="Add wines you dream of trying."/>
        : <div style={{display:desktop?"grid":"block",gridTemplateColumns:desktop?"1fr 1fr":"none",gap:desktop?10:0}}>
            {wishlist.map(w=><WineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
          </div>
      }
      <Modal show={!!sel&&!editing} onClose={()=>setSel(null)} wide>
        {sel&&<WineDetail wine={sel} onEdit={()=>setEditing(true)} onDelete={()=>{onDelete(sel.id);setSel(null);}} onMove={()=>{onMove(sel.id);setSel(null);}}/>}
      </Modal>
      <Modal show={editing} onClose={()=>setEditing(false)} wide>
        <WineForm initial={sel} isWishlist onSave={w=>{onUpdate(w);setSel(w);setEditing(false);}} onClose={()=>setEditing(false)}/>
      </Modal>
      <Modal show={adding} onClose={()=>setAdding(false)} wide>
        <WineForm isWishlist onSave={w=>{onAdd({...w,wishlist:true});setAdding(false);}} onClose={()=>setAdding(false)}/>
      </Modal>
    </div>
  );
};

/* ── AI ───────────────────────────────────────────────────────── */
const AIScreen=({wines})=>{
  const [msgs,setMsgs]=useState([{r:"a",t:"Hello. I'm Vino — your personal sommelier.\n\nAsk me anything about your collection, food pairings, what to open tonight, or recommendations."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const scrollRef=useRef();
  const chips=["What should I open tonight?","Best food pairings?","What's in my cellar?","Recommend a wine"];
  const send=useCallback(async msg=>{
    const txt=msg||input.trim();
    if(!txt||loading)return;
    setInput("");
    setMsgs(p=>[...p,{r:"u",t:txt}]);
    setLoading(true);
    const reply=await callAI(txt,wines);
    setMsgs(p=>[...p,{r:"a",t:reply}]);
    setLoading(false);
    setTimeout(()=>scrollRef.current?.scrollTo({top:99999,behavior:"smooth"}),80);
  },[input,wines,loading]);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 140px)"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Vino AI</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:28,fontWeight:800,color:"var(--text)",lineHeight:1}}>Sommelier</div>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{marginBottom:12,display:"flex",justifyContent:m.r==="u"?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
            {m.r==="a"&&<div style={{width:30,height:30,borderRadius:10,background:"#9B2335",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon n="wine" size={15} color="white"/></div>}
            <div style={{maxWidth:"80%",padding:"12px 15px",borderRadius:m.r==="u"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.r==="u"?"#9B2335":"var(--card)",color:m.r==="u"?"white":"var(--text)",fontSize:14,lineHeight:1.65,border:m.r==="a"?"1px solid var(--border)":"none",whiteSpace:"pre-wrap",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"0 2px 8px var(--shadow)"}}>{m.t}</div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
            <div style={{width:30,height:30,borderRadius:10,background:"#9B2335",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="wine" size={15} color="white"/></div>
            <div style={{padding:"14px 16px",borderRadius:"18px 18px 18px 4px",background:"var(--card)",border:"1px solid var(--border)",display:"flex",gap:5,alignItems:"center"}}>
              {[0,1,2].map(d=><div key={d} style={{width:6,height:6,borderRadius:"50%",background:"var(--sub)",animation:"blink 1.2s ease infinite",animationDelay:`${d*0.18}s`}}/>)}
            </div>
          </div>
        )}
      </div>
      {msgs.length<=1&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          {chips.map(c=>(
            <button key={c} onClick={()=>send(c)} style={{padding:"8px 13px",borderRadius:20,border:"1.5px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#9B2335"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>{c}</button>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:8,paddingTop:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask anything about wine…" style={{borderRadius:14}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading}
          style={{width:44,height:44,flexShrink:0,borderRadius:12,background:input.trim()&&!loading?"#9B2335":"var(--inputBg)",border:"none",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",color:input.trim()&&!loading?"white":"var(--sub)",transition:"all 0.18s"}}>
          <Icon n="send" size={17}/>
        </button>
      </div>
    </div>
  );
};

/* ── NOTES ────────────────────────────────────────────────────── */
const NotesScreen=({wines,notes,onAdd,onDelete})=>{
  const [adding,setAdding]=useState(false);
  const [sel,setSel]=useState(null);
  const [form,setForm]=useState({wineId:"",title:"",content:""});
  const col=wines.filter(w=>!w.wishlist);
  const getW=id=>col.find(w=>w.id===id);
  return(
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Journal</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1}}>
            {notes.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>notes</span>
          </div>
          <button onClick={()=>{setForm({wineId:col[0]?.id||"",title:"",content:""});setAdding(true);}} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",boxShadow:"0 4px 16px rgba(155,35,53,0.35)",cursor:"pointer"}}><Icon n="plus" size={20}/></button>
        </div>
      </div>
      {notes.length===0
        ? <Empty icon="note" text="Capture your tasting memories."/>
        : notes.map(n=>{
            const w=getW(n.wineId);
            const type=w?(w.wineType||guessWineType(w.grape,w.name)):"Other";
            const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
            return(
              <div key={n.id} onClick={()=>setSel(n)} style={{background:"var(--card)",borderRadius:18,padding:"16px",cursor:"pointer",border:"1px solid var(--border)",marginBottom:10,transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 2px 8px var(--shadow)"}}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px var(--shadow)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:16,fontWeight:700,color:"var(--text)",lineHeight:1.2,flex:1,paddingRight:8}}>{n.title}</div>
                  <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0}}>{n.date?new Date(n.date).toLocaleDateString("en-AU",{day:"numeric",month:"short"}):""}</div>
                </div>
                {w&&<div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:7,height:7,borderRadius:"50%",background:tc.dot}}/><span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{w.name}</span></div>}
                <div style={{fontSize:13,color:"var(--sub)",lineHeight:1.55,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{n.content}</div>
              </div>
            );
          })
      }
      <Modal show={adding} onClose={()=>setAdding(false)}>
        <ModalHeader title="New Note" onClose={()=>setAdding(false)}/>
        {col.length>0&&<SelField label="Wine" value={form.wineId} onChange={v=>setForm(p=>({...p,wineId:v}))} options={col.map(w=>({value:w.id,label:w.name}))}/>}
        <Field label="Title" value={form.title} onChange={v=>setForm(p=>({...p,title:v}))} placeholder="e.g. Christmas Dinner 2024"/>
        <Field label="Note" value={form.content} onChange={v=>setForm(p=>({...p,content:v}))} placeholder="Impressions, pairings, memories…" rows={4} optional/>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setAdding(false)} full>Cancel</Btn>
          <Btn onClick={()=>{if(form.title){onAdd({...form,id:uid(),date:new Date().toISOString().split("T")[0]});setAdding(false);}}} full disabled={!form.title}>Save Note</Btn>
        </div>
      </Modal>
      <Modal show={!!sel} onClose={()=>setSel(null)} wide>
        {sel&&(
          <div>
            <ModalHeader title={sel.title} onClose={()=>setSel(null)}/>
            {getW(sel.wineId)&&<div style={{fontSize:13,color:"#9B2335",marginBottom:8,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#9B2335"}}/>{getW(sel.wineId)?.name}</div>}
            <div style={{fontSize:12,color:"var(--sub)",marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{sel.date?new Date(sel.date).toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):""}</div>
            <div style={{fontSize:15,color:"var(--text)",lineHeight:1.75,marginBottom:24,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{sel.content}</div>
            <Btn variant="danger" onClick={()=>{onDelete(sel.id);setSel(null);}} full icon="trash">Delete Note</Btn>
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ── EXCEL EXPORT ─────────────────────────────────────────────── */
const TYPE_ORDER=["Red","White","Rosé","Sparkling","Dessert","Fortified","Other"];
const TYPE_FILL={Red:"FADDDD",White:"F5F0D0",Rosé:"F5D8E0",Sparkling:"D0E0F5",Dessert:"F5E8C0",Fortified:"E0D0F0",Other:"E5E5E5"};
const TYPE_HEADER={Red:"8B1A1A",White:"7A6520",Rosé:"8B3A4A",Sparkling:"2A4A8B",Dessert:"8B6010",Fortified:"5A1A8B",Other:"555555"};
const stars=n=>n?("★".repeat(n)+"☆".repeat(5-n)):"—";

const TYPE_STYLES={
  Red:      {hdr:"8B1A1A",row:"FDF1F1",alt:"F5E0E0"},
  White:    {hdr:"7A6520",row:"FDFAF0",alt:"F5F0DA"},
  Rosé:     {hdr:"8B3A4A",row:"FDF2F5",alt:"F5E2EA"},
  Sparkling:{hdr:"2A4A8B",row:"F0F5FD",alt:"DDE8FA"},
  Dessert:  {hdr:"8B6010",row:"FDF6E8",alt:"F5EAD0"},
  Fortified:{hdr:"5A1A8B",row:"F5EEF8",alt:"E8D8F5"},
  Other:    {hdr:"555555",row:"F5F5F5",alt:"EBEBEB"},
};
const TYPE_EMOJI={Red:"🍷",White:"🥂",Rosé:"🌸",Sparkling:"✨",Dessert:"🍯",Fortified:"🏰",Other:"🍾"};

const exportToExcel=async(wines,wishlist)=>{
  // Load SheetJS
  if(!window.XLSX){
    await new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      s.onload=res;s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  const X=window.XLSX;
  const wb=X.utils.book_new();
  const col=wines.filter(w=>!w.wishlist);
  const wish=wishlist;
  const today=new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  const totalBottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const rated=col.filter(w=>w.rating>0);
  const avgRating=rated.length?(rated.reduce((s,w)=>s+w.rating,0)/rated.length).toFixed(1):"-";

  // ── helpers ────────────────────────────────────────────────────
  const rgb=hex=>({r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16)});
  const fgStyle=(fgHex,bold=false,sz=10,italic=false)=>({
    font:{name:"Arial",sz,bold,italic,color:{rgb:fgHex}},
    alignment:{vertical:"center",wrapText:false}
  });
  const cellStyle=(bgHex,fgHex="1A1210",bold=false,sz=10,halign="left",wrap=false,italic=false)=>({
    font:{name:"Arial",sz,bold,italic,color:{rgb:fgHex}},
    fill:{patternType:"solid",fgColor:{rgb:bgHex}},
    alignment:{horizontal:halign,vertical:"center",wrapText:wrap},
    border:{bottom:{style:"thin",color:{rgb:"E8E0DC"}}}
  });

  const setRow=(ws,rowArr,rowIdx,styleArr)=>{
    rowArr.forEach((val,ci)=>{
      const addr=X.utils.encode_cell({r:rowIdx,c:ci});
      if(!ws[addr])ws[addr]={t:typeof val==="number"?"n":"s",v:val??""};
      else ws[addr].v=val??"";
      if(styleArr&&styleArr[ci])ws[addr].s=styleArr[ci];
    });
  };

  // ── SHEET 1: My Collection ────────────────────────────────────
  const ws1={};
  const COL_W=[{wch:34},{wch:24},{wch:22},{wch:10},{wch:9},{wch:8},{wch:9},{wch:9},{wch:14},{wch:8},{wch:16},{wch:38}];
  ws1["!cols"]=COL_W;
  let r=0;

  // Title row
  const NCOLS=11;
  for(let c=0;c<=NCOLS;c++){
    const addr=X.utils.encode_cell({r,c});
    ws1[addr]={t:"s",v:c===0?`My Wine Cellar — ${col.length} wines · ${totalBottles} bottles`:"",
      s:cellStyle("6B0A0A","FFFFFF",true,16,"left",false)};
  }
  ws1["!merges"]=[{s:{r,c:0},e:{r,c:NCOLS}}];
  r++;

  // Subtitle
  for(let c=0;c<=NCOLS;c++){
    const addr=X.utils.encode_cell({r,c});
    ws1[addr]={t:"s",v:c===0?`Exported ${today}`:"",
      s:cellStyle("8B1A1A","F0C0C0",false,9,"left",false,true)};
  }
  ws1["!merges"].push({s:{r,c:0},e:{r,c:NCOLS}});
  r++;

  // By type
  TYPE_ORDER.forEach(type=>{
    const tw=col.filter(w=>(w.wineType||"Other")===type);
    if(!tw.length)return;
    const tc=TYPE_STYLES[type]||TYPE_STYLES.Other;
    const em=TYPE_EMOJI[type]||"🍾";

    r++; // spacer

    // Section header
    for(let c=0;c<=NCOLS;c++){
      const addr=X.utils.encode_cell({r,c});
      ws1[addr]={t:"s",v:c===0?`${em}  ${type} Wines  (${tw.length} ${tw.length===1?"wine":"wines"}, ${tw.reduce((s,w)=>s+(w.bottles||0),0)} bottles)`:"",
        s:{font:{name:"Arial",sz:12,bold:true,color:{rgb:"FFFFFF"}},
          fill:{patternType:"solid",fgColor:{rgb:tc.hdr}},
          alignment:{horizontal:"left",vertical:"center",indent:1}}};
    }
    ws1["!merges"].push({s:{r,c:0},e:{r,c:NCOLS}});
    r++;

    // Column headers
    const HDRS=["Wine Name","Grape / Blend","Origin / Region","Type","Vintage","Bottles","Rating","Alc %","Location","Slot","Date Purchased","Tasting Notes"];
    HDRS.forEach((h,ci)=>{
      const addr=X.utils.encode_cell({r,c:ci});
      ws1[addr]={t:"s",v:h,s:{
        font:{name:"Arial",sz:9,bold:true,color:{rgb:tc.hdr}},
        fill:{patternType:"solid",fgColor:{rgb:tc.row}},
        alignment:{horizontal:"center",vertical:"center"},
        border:{bottom:{style:"medium",color:{rgb:tc.hdr}},top:{style:"thin",color:{rgb:tc.hdr}}}
      }};
    });
    r++;

    // Data rows
    const sorted=[...tw].sort((a,b)=>(b.rating||0)-(a.rating||0)||(a.name||"").localeCompare(b.name||""));
    sorted.forEach((w,idx)=>{
      const bg=idx%2===0?tc.row:tc.alt;
      const bs=cellStyle(bg);
      const dateFmt=w.datePurchased?new Date(w.datePurchased).toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"}):"-";
      const stars="★".repeat(w.rating||0)+"☆".repeat(5-(w.rating||0));
      const vals=[
        w.name||"",
        w.grape||"-",
        w.origin||"-",
        w.wineType||"-",
        w.vintage||"-",
        w.bottles||0,
        stars,
        w.alcohol?`${w.alcohol}%`:"-",
        w.location||"-",
        w.locationSlot||"-",
        dateFmt,
        w.tastingNotes||"-",
      ];
      vals.forEach((val,ci)=>{
        const addr=X.utils.encode_cell({r,c:ci});
        const isNum=typeof val==="number";
        let s={...cellStyle(bg,ci===0?"1A1210":ci===4?tc.hdr:"4A4040",ci===0,ci===0?10.5:9,ci>=5&&ci<=7?"center":"left",ci===11)};
        if(ci===4&&val!=="-")s.font={...s.font,bold:true,color:{rgb:tc.hdr}};
        if(ci===6)s.font={...s.font,color:{rgb:"C08010"}};
        ws1[addr]={t:isNum?"n":"s",v:val,s};
      });
      r++;
    });
  });

  // Totals
  r++;
  const totHdr="TOTAL — "+col.length+" wines, "+totalBottles+" bottles, avg rating "+avgRating+" ★";
  for(let c=0;c<=NCOLS;c++){
    const addr=X.utils.encode_cell({r,c});
    ws1[addr]={t:"s",v:c===0?totHdr:"",s:cellStyle("6B0A0A","FFFFFF",true,10)};
  }
  ws1["!merges"].push({s:{r,c:0},e:{r,c:NCOLS}});

  ws1["!ref"]=X.utils.encode_range({r:0,c:0},{r,c:NCOLS});
  X.utils.book_append_sheet(wb,ws1,"My Collection");

  // ── SHEET 2: Wishlist ─────────────────────────────────────────
  const ws2={};
  ws2["!cols"]=[{wch:34},{wch:24},{wch:22},{wch:12},{wch:9},{wch:9},{wch:40}];
  ws2["!merges"]=[];
  let r2=0;

  for(let c=0;c<=6;c++){
    const addr=X.utils.encode_cell({r:r2,c});
    ws2[addr]={t:"s",v:c===0?`Wine Wishlist — ${wish.length} ${wish.length===1?"wine":"wines"} to try`:"",
      s:cellStyle("3D1A5C","FFFFFF",true,16)};
  }
  ws2["!merges"].push({s:{r:r2,c:0},e:{r:r2,c:6}});
  r2++;

  for(let c=0;c<=6;c++){
    const addr=X.utils.encode_cell({r:r2,c});
    ws2[addr]={t:"s",v:c===0?`Exported ${today}`:"",s:cellStyle("4A2070","C0A0D0",false,9,"left",false,true)};
  }
  ws2["!merges"].push({s:{r:r2,c:0},e:{r:r2,c:6}});
  r2++;

  const wishByType={};
  TYPE_ORDER.forEach(t=>{wishByType[t]=wish.filter(w=>(w.wineType||"Other")===t);});

  TYPE_ORDER.forEach(type=>{
    const tw=wishByType[type];
    if(!tw.length)return;
    const tc=TYPE_STYLES[type]||TYPE_STYLES.Other;
    r2++;
    for(let c=0;c<=6;c++){
      const addr=X.utils.encode_cell({r:r2,c});
      ws2[addr]={t:"s",v:c===0?`${TYPE_EMOJI[type]||"🍾"}  ${type}`:"",
        s:{font:{name:"Arial",sz:11,bold:true,color:{rgb:"FFFFFF"}},fill:{patternType:"solid",fgColor:{rgb:tc.hdr}},alignment:{horizontal:"left",vertical:"center"}}};
    }
    ws2["!merges"].push({s:{r:r2,c:0},e:{r:r2,c:6}});
    r2++;

    ["Wine Name","Grape / Blend","Origin","Type","Vintage","Alc %","Notes"].forEach((h,ci)=>{
      const addr=X.utils.encode_cell({r:r2,c:ci});
      ws2[addr]={t:"s",v:h,s:{font:{name:"Arial",sz:9,bold:true,color:{rgb:tc.hdr}},fill:{patternType:"solid",fgColor:{rgb:tc.row}},alignment:{horizontal:"center",vertical:"center"},border:{bottom:{style:"medium",color:{rgb:tc.hdr}}}}};
    });
    r2++;

    tw.forEach((w,idx)=>{
      const bg=idx%2===0?tc.row:tc.alt;
      [w.name||"",w.grape||"-",w.origin||"-",w.wineType||"-",w.vintage||"-",w.alcohol?`${w.alcohol}%`:"-",w.notes||"-"].forEach((val,ci)=>{
        const addr=X.utils.encode_cell({r:r2,c:ci});
        let s=cellStyle(bg,ci===4?tc.hdr:"4A4040",ci===4,9,ci>=4&&ci<=5?"center":"left",ci===6);
        ws2[addr]={t:"s",v:val,s};
      });
      r2++;
    });
  });

  ws2["!ref"]=X.utils.encode_range({r:0,c:0},{r:r2,c:6});
  X.utils.book_append_sheet(wb,ws2,"Wishlist");

  // ── SHEET 3: Summary ──────────────────────────────────────────
  const ws3={};
  ws3["!cols"]=[{wch:4},{wch:24},{wch:14},{wch:4},{wch:14},{wch:4}];
  ws3["!merges"]=[];
  let r3=0;

  // Title
  for(let c=0;c<=5;c++){
    const addr=X.utils.encode_cell({r:r3,c});
    ws3[addr]={t:"s",v:c===0?"My Cellar at a Glance":"",s:cellStyle("6B0A0A","FFFFFF",true,18,"center")};
  }
  ws3["!merges"].push({s:{r:r3,c:0},e:{r:r3,c:5}});
  r3++;
  for(let c=0;c<=5;c++){
    const addr=X.utils.encode_cell({r:r3,c});
    ws3[addr]={t:"s",v:c===0?`Exported ${today}`:"",s:cellStyle("8B1A1A","F0C0C0",false,9,"center",false,true)};
  }
  ws3["!merges"].push({s:{r:r3,c:0},e:{r:r3,c:5}});
  r3+=2;

  // Stat cards
  const stats=[["WINES",col.length,"FDF1F1","8B1A1A"],["BOTTLES",totalBottles,"F0F5FD","2A4A8B"],["AVG RATING",avgRating+" ★","FDFAF0","7A6520"]];
  stats.forEach(([lbl,val,bg,fg],si)=>{
    const col2=si*2+1;
    [[lbl,9,false],[val,24,true]].forEach(([v,sz,bold],ri)=>{
      for(let c=col2;c<=col2+1;c++){
        const addr=X.utils.encode_cell({r:r3+ri,c});
        ws3[addr]={t:"s",v:c===col2?String(v):"",s:cellStyle(bg,fg,bold,sz,"center")};
      }
      ws3["!merges"].push({s:{r:r3+ri,c:col2},e:{r:r3+ri,c:col2+1}});
    });
  });
  r3+=3;

  // Breakdown table
  r3++;
  [["",1],["Wine Type",2],["Wines",4],["Bottles",5]].forEach(([h,c])=>{
    const addr=X.utils.encode_cell({r:r3,c});
    ws3[addr]={t:"s",v:h,s:cellStyle("9B2335","FFFFFF",true,10,"center")};
  });
  r3++;
  TYPE_ORDER.forEach((type,idx)=>{
    const tw=col.filter(w=>(w.wineType||"Other")===type);
    if(!tw.length)return;
    const tc=TYPE_STYLES[type]||TYPE_STYLES.Other;
    const bg=idx%2===0?tc.row:tc.alt;
    const bottles2=tw.reduce((s,w)=>s+(w.bottles||0),0);
    const addr1=X.utils.encode_cell({r:r3,c:2});
    ws3[addr1]={t:"s",v:`${TYPE_EMOJI[type]} ${type}`,s:cellStyle(bg,tc.hdr,true,10)};
    const addr2=X.utils.encode_cell({r:r3,c:4});
    ws3[addr2]={t:"n",v:tw.length,s:cellStyle(bg,"1A1210",false,10,"center")};
    const addr3=X.utils.encode_cell({r:r3,c:5});
    ws3[addr3]={t:"n",v:bottles2,s:cellStyle(bg,"1A1210",false,10,"center")};
    r3++;
  });
  // Total
  const totAddr1=X.utils.encode_cell({r:r3,c:2});
  ws3[totAddr1]={t:"s",v:"TOTAL",s:cellStyle("6B0A0A","FFFFFF",true,10)};
  const totAddr2=X.utils.encode_cell({r:r3,c:4});
  ws3[totAddr2]={t:"n",v:col.length,s:cellStyle("6B0A0A","FFFFFF",true,10,"center")};
  const totAddr3=X.utils.encode_cell({r:r3,c:5});
  ws3[totAddr3]={t:"n",v:totalBottles,s:cellStyle("6B0A0A","FFFFFF",true,10,"center")};

  ws3["!ref"]=X.utils.encode_range({r:0,c:0},{r:r3,c:5});
  X.utils.book_append_sheet(wb,ws3,"Summary");

  // Download
  X.writeFile(wb,`vino-cellar-${new Date().toISOString().slice(0,10)}.xlsx`,{bookSST:false,cellStyles:true});
};

/* ── WINE BOTTLE VIZ ──────────────────────────────────────────── */
const WineBottleViz=({types,total})=>{
  const ORDER=["Red","White","Rosé","Sparkling","Dessert","Fortified","Other"];
  const segments=ORDER.map(t=>({type:t,count:types[t]||0,pct:total?Math.round(((types[t]||0)/total)*100):0,color:WINE_TYPE_COLORS[t]?.dot||"#888"})).filter(s=>s.count>0);
  if(!segments.length)return null;
  // Build SVG bottle with stacked fill
  const H=180,W=70;
  let cumY=0;
  const fills=segments.map(s=>{
    const h=(s.pct/100)*H;
    const seg={...s,y:cumY,h};
    cumY+=h;
    return seg;
  });
  return(
    <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
      <div style={{flexShrink:0}}>
        <svg width={W} height={H+60} viewBox={`0 0 ${W} ${H+60}`}>
          <defs>
            <clipPath id="bottle">
              {/* bottle shape: neck then body */}
              <path d={`M28 0 L28 20 Q20 25 18 38 L14 50 Q10 55 10 62 L10 ${H+45} Q10 ${H+55} 20 ${H+55} L50 ${H+55} Q60 ${H+55} 60 ${H+45} L60 62 Q60 55 56 50 L52 38 Q50 25 42 20 L42 0 Z`}/>
            </clipPath>
          </defs>
          {/* Fills clipped to bottle shape */}
          <g clipPath="url(#bottle)">
            <rect x="0" y="0" width={W} height={H+60} fill="var(--inputBg)"/>
            {fills.map((s,i)=>(
              <rect key={i} x="0" y={H+55-s.y-s.h} width={W} height={s.h+1} fill={s.color} opacity="0.9"/>
            ))}
          </g>
          {/* Bottle outline */}
          <path d={`M28 0 L28 20 Q20 25 18 38 L14 50 Q10 55 10 62 L10 ${H+45} Q10 ${H+55} 20 ${H+55} L50 ${H+55} Q60 ${H+55} 60 ${H+45} L60 62 Q60 55 56 50 L52 38 Q50 25 42 20 L42 0 Z`}
            fill="none" stroke="var(--border)" strokeWidth="1.5"/>
          {/* Cork */}
          <rect x="26" y="0" width="18" height="6" rx="2" fill="#C4944A" opacity="0.8"/>
        </svg>
      </div>
      <div style={{flex:1,paddingTop:8}}>
        {segments.map(s=>(
          <div key={s.type} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:s.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.type}</span>
                <span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.count} · {s.pct}%</span>
              </div>
              <div style={{height:3,background:"var(--inputBg)",borderRadius:2}}>
                <div style={{height:"100%",width:`${s.pct}%`,background:s.color,borderRadius:2}}/>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── EXPLORE WINERIES ─────────────────────────────────────────── */
const ExploreWineries=({onBack})=>{
  const [state,setState]=useState("idle"); // idle | loading | results | error
  const [wineries,setWineries]=useState([]);
  const [locName,setLocName]=useState("");

  const findWineries=()=>{
    setState("loading");
    navigator.geolocation.getCurrentPosition(async pos=>{
      const {latitude:lat,longitude:lng}=pos.coords;
      // Use Google Places via a CORS-friendly public proxy approach — we call the Overpass API for wineries tagged in OpenStreetMap
      // Fallback: use Google Maps Embed for search
      try{
        // Reverse geocode to get area name
        const geoRes=await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
        const geoData=await geoRes.json();
        const city=geoData.address?.city||geoData.address?.town||geoData.address?.suburb||"your area";
        setLocName(city);
        // Overpass API: find wineries within 50km
        const r=50000; // 50km radius
        const query=`[out:json][timeout:25];(node["tourism"="winery"](around:${r},${lat},${lng});way["tourism"="winery"](around:${r},${lat},${lng});node["craft"="winery"](around:${r},${lat},${lng});way["craft"="winery"](around:${r},${lat},${lng});node["amenity"="winery"](around:${r},${lat},${lng}););out body center 30;`;
        const ovRes=await fetch(`https://overpass-api.de/api/interpreter`,{method:"POST",body:query});
        const ovData=await ovRes.json();
        const items=(ovData.elements||[]).map(el=>{
          const tags=el.tags||{};
          const wlat=el.lat||el.center?.lat;
          const wlng=el.lon||el.center?.lon;
          const dist=wlat&&wlng?Math.round(Math.sqrt((wlat-lat)**2+(wlng-lng)**2)*111):null;
          return{name:tags.name||"Unnamed Winery",address:tags["addr:full"]||tags["addr:street"]||tags["addr:city"]||"",website:tags.website||tags.url||"",phone:tags.phone||"",dist};
        }).filter(w=>w.name!=="Unnamed Winery").sort((a,b)=>(a.dist||999)-(b.dist||999));
        setWineries(items.slice(0,20));
        setState(items.length?"results":"noresults");
      }catch(e){setState("error");}
    },()=>setState("denied"),{timeout:10000});
  };

  const googleSearch=(name)=>{
    window.open(`https://www.google.com/maps/search/${encodeURIComponent(name+" winery")}+wine+reviews`,"_blank");
  };

  return(
    <div style={{animation:"fadeUp 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={onBack} style={{background:"var(--inputBg)",border:"none",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)",cursor:"pointer",flexShrink:0,fontSize:20}}>←</button>
        <div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"var(--text)"}}>Explore Wineries</div>
          {locName&&<div style={{fontSize:12,color:"var(--sub)",marginTop:1}}>Near {locName}</div>}
        </div>
      </div>
      {state==="idle"&&(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{marginBottom:16,opacity:0.3}}><Icon n="globe" size={56} color="var(--sub)"/></div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--text)",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Discover nearby wineries</div>
          <div style={{fontSize:13,color:"var(--sub)",marginBottom:28,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>We'll use your location to find the best rated wineries close to you.</div>
          <button onClick={findWineries} style={{background:"#9B2335",color:"white",border:"none",borderRadius:16,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:8,boxShadow:"0 6px 20px rgba(155,35,53,0.35)"}}>
            <Icon n="mappin" size={17} color="white"/> Find Wineries Near Me
          </button>
        </div>
      )}
      {state==="loading"&&(
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{marginBottom:12,animation:"spin 1.5s linear infinite",display:"inline-block"}}><Icon n="globe" size={36} color="#9B2335"/></div>
          <div style={{fontSize:14,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Finding wineries near you…</div>
        </div>
      )}
      {state==="denied"&&(
        <div style={{background:"var(--card)",borderRadius:16,padding:"20px",border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:14,color:"var(--text)",fontWeight:600,marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Location access needed</div>
          <div style={{fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>Please allow location access in your browser settings to discover nearby wineries.</div>
        </div>
      )}
      {state==="error"&&(
        <div style={{background:"var(--card)",borderRadius:16,padding:"20px",border:"1px solid var(--border)",textAlign:"center"}}>
          <div style={{fontSize:14,color:"var(--text)",fontWeight:600,marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Couldn't load wineries</div>
          <div style={{fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:16}}>Check your connection and try again.</div>
          <button onClick={findWineries} style={{background:"#9B2335",color:"white",border:"none",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Retry</button>
        </div>
      )}
      {state==="noresults"&&(
        <div style={{textAlign:"center",padding:"40px 0"}}>
          <div style={{fontSize:14,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:16}}>No wineries found within 50km — try searching on Google Maps.</div>
          <button onClick={()=>window.open("https://www.google.com/maps/search/wineries+near+me","_blank")} style={{background:"var(--card)",color:"var(--text)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Open Google Maps</button>
        </div>
      )}
      {state==="results"&&wineries.map((w,i)=>(
        <div key={i} style={{background:"var(--card)",borderRadius:16,padding:"14px 16px",border:"1px solid var(--border)",marginBottom:10,cursor:"pointer",transition:"transform 0.15s,box-shadow 0.15s"}}
          onClick={()=>googleSearch(w.name)}
          onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px var(--shadow)";}}
          onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)",marginBottom:3}}>{w.name}</div>
              {w.address&&<div style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:4}}><Icon n="mappin" size={11} color="var(--sub)"/>{w.address}</div>}
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0,paddingLeft:10}}>
              {w.dist!=null&&<div style={{fontSize:11,color:"#9B2335",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{w.dist}km</div>}
              <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:3}}><Icon n="globe" size={10} color="var(--sub)"/>View on Maps</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── SETTINGS PANEL ───────────────────────────────────────────── */
const BG_PRESETS=[
  {label:"Deep Wine",value:"linear-gradient(135deg,#4A0010 0%,#9B2335 100%)"},
  {label:"Midnight",value:"linear-gradient(135deg,#0D0D1A 0%,#1A1A3E 100%)"},
  {label:"Forest",value:"linear-gradient(135deg,#0A2A0A 0%,#1A5C2A 100%)"},
  {label:"Dusk",value:"linear-gradient(135deg,#2A1A0A 0%,#8B4A1A 100%)"},
  {label:"Slate",value:"linear-gradient(135deg,#0A1A2A 0%,#1A3A5C 100%)"},
  {label:"Rose",value:"linear-gradient(135deg,#3A0A1A 0%,#8B2A4A 100%)"},
  {label:"Charcoal",value:"linear-gradient(135deg,#1A1A1A 0%,#3A3A3A 100%)"},
  {label:"Plum",value:"linear-gradient(135deg,#2A0A3A 0%,#5C1A8B 100%)"},
];

const SettingsPanel=({onBack,profile,setProfile,theme,setTheme})=>{
  const THEMES=[{id:"system",label:"System",ic:"monitor"},{id:"light",label:"Light",ic:"sun"},{id:"dark",label:"Dark",ic:"moon"}];
  const COUNTRIES=["Australia","New Zealand","France","Italy","Spain","USA","Argentina","Chile","South Africa","Germany","Portugal","Austria","Other"];
  const [form,setForm]=useState({
    name:profile.name||"",
    surname:profile.surname||"",
    cellarName:profile.cellarName||"",
    bio:profile.bio||"",
    country:profile.country||"Australia",
    avatar:profile.avatar||null,
    profileBg:profile.profileBg||BG_PRESETS[0].value,
  });
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=()=>{if(form.name){setProfile({...profile,...form});onBack();}};
  return(
    <div style={{animation:"fadeUp 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={onBack} style={{background:"var(--inputBg)",border:"none",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)",cursor:"pointer",flexShrink:0,fontSize:20}}>←</button>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"var(--text)"}}>Settings</div>
      </div>
      {/* Avatar */}
      <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
        <PhotoPicker value={form.avatar} onChange={v=>set("avatar",v)} size={90} round/>
      </div>
      {/* Name */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>First Name</label>
          <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="First name"/>
        </div>
        <div>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Surname</label>
          <input value={form.surname} onChange={e=>set("surname",e.target.value)} placeholder="Surname"/>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cellar / Winery Name</label>
        <input value={form.cellarName} onChange={e=>set("cellarName",e.target.value)} placeholder="e.g. Château Moi, The Neale Cellar"/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Bio</label>
        <textarea value={form.bio} onChange={e=>set("bio",e.target.value)} placeholder="Wine lover, collector, aspiring sommelier…" rows={3} style={{resize:"none"}}/>
      </div>
      <div style={{marginBottom:20}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Country</label>
        <select value={form.country} onChange={e=>set("country",e.target.value)}>
          {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      {/* Profile card background */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Profile Card Background</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {BG_PRESETS.map(bg=>(
            <button key={bg.value} onClick={()=>set("profileBg",bg.value)}
              style={{height:44,borderRadius:12,background:bg.value,border:form.profileBg===bg.value?"2.5px solid #9B2335":"2px solid transparent",cursor:"pointer",position:"relative",transition:"transform 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.transform="scale(1.05)"}
              onMouseLeave={e=>e.currentTarget.style.transform="scale(1)"}>
              {form.profileBg===bg.value&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:8,height:8,borderRadius:"50%",background:"white"}}/></div>}
            </button>
          ))}
        </div>
        <div style={{marginTop:10}}>
          <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--sub)",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Or custom image URL</label>
          <input value={form.profileBg?.startsWith("url(")?form.profileBg.slice(4,-1):""} onChange={e=>set("profileBg",e.target.value?`url(${e.target.value})`:BG_PRESETS[0].value)} placeholder="https://…"/>
        </div>
      </div>
      {/* Theme */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>App Theme</div>
        <div style={{display:"flex",gap:8}}>
          {THEMES.map(t=>{
            const act=theme===t.id;
            return(
              <button key={t.id} onClick={()=>setTheme(t.id)} style={{flex:1,padding:"12px 8px",borderRadius:14,border:act?"2px solid #9B2335":"1.5px solid var(--border)",background:act?"rgba(155,35,53,0.08)":"var(--inputBg)",color:act?"#9B2335":"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,transition:"all 0.18s"}}>
                <Icon n={t.ic} size={17} color={act?"#9B2335":"var(--sub)"}/>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onBack} style={{flex:1,padding:"14px",borderRadius:14,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cancel</button>
        <button onClick={save} disabled={!form.name} style={{flex:2,padding:"14px",borderRadius:14,border:"none",background:form.name?"#9B2335":"var(--inputBg)",color:form.name?"white":"var(--sub)",fontSize:14,fontWeight:700,cursor:form.name?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all 0.18s",boxShadow:form.name?"0 4px 16px rgba(155,35,53,0.3)":"none"}}>Save Changes</button>
      </div>
    </div>
  );
};

/* ── PROFILE ──────────────────────────────────────────────────── */
const ProfileScreen=({wines,wishlist,notes,theme,setTheme,profile,setProfile})=>{
  const [view,setView]=useState("main"); // main | settings | explore
  const col=wines.filter(w=>!w.wishlist);
  const bottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const topWine=[...col].sort((a,b)=>(b.rating||0)-(a.rating||0))[0];
  const types=col.reduce((acc,w)=>{const t=w.wineType||guessWineType(w.grape,w.name);acc[t]=(acc[t]||0)+1;return acc;},{});
  const profileBg=profile.profileBg||"linear-gradient(135deg,#6B0A0A 0%,#9B2335 60%,#6B0A0A 100%)";
  const displayName=[profile.name,profile.surname].filter(Boolean).join(" ")||"Winemaker";

  if(view==="settings")return <SettingsPanel onBack={()=>setView("main")} profile={profile} setProfile={setProfile} theme={theme} setTheme={setTheme}/>;
  if(view==="explore")return <ExploreWineries onBack={()=>setView("main")}/>;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>My Winery</div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1}}>{profile.cellarName||"My Cellar"}</div>
        </div>
        <button onClick={()=>setView("settings")} style={{width:40,height:40,borderRadius:12,background:"var(--card)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)",cursor:"pointer",transition:"all 0.15s",flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(155,35,53,0.08)";e.currentTarget.style.color="#9B2335";}}
          onMouseLeave={e=>{e.currentTarget.style.background="var(--card)";e.currentTarget.style.color="var(--sub)";}}>
          <Icon n="settings" size={18}/>
        </button>
      </div>

      {/* Profile card */}
      <div style={{background:profileBg,borderRadius:22,padding:"22px",marginBottom:14,position:"relative",overflow:"hidden",backgroundSize:"cover",backgroundPosition:"center"}}>
        <div style={{position:"absolute",right:-20,top:-20,opacity:0.06,pointerEvents:"none"}}><Icon n="wine" size={160} color="white"/></div>
        <div style={{display:"flex",alignItems:"center",gap:14,position:"relative",zIndex:1}}>
          <div style={{width:66,height:66,borderRadius:"50%",background:"rgba(255,255,255,0.15)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.3)"}}>
            {profile.avatar?<img src={profile.avatar} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="user" size={28} color="rgba(255,255,255,0.8)"/>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:21,fontWeight:700,color:"white",lineHeight:1.1}}>{displayName}</div>
            {profile.bio&&<div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:4,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.5}}>{profile.bio}</div>}
            {!profile.bio&&profile.description&&<div style={{fontSize:12,color:"rgba(255,255,255,0.65)",marginTop:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{profile.description}</div>}
            {profile.country&&<div style={{fontSize:11,color:"rgba(255,255,255,0.5)",marginTop:4,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:4}}><Icon n="globe" size={11} color="rgba(255,255,255,0.5)"/>{profile.country}</div>}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
        {[["Wines",col.length],["Bottles",bottles],["Notes",notes.length]].map(([l,v])=>(
          <div key={l} style={{background:"var(--card)",borderRadius:16,padding:"14px 10px",textAlign:"center",border:"1px solid var(--border)"}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:26,fontWeight:800,color:"var(--text)",lineHeight:1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,marginTop:3,textTransform:"uppercase",letterSpacing:"0.7px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
          </div>
        ))}
      </div>

      {/* Wine bottle viz */}
      {Object.keys(types).length>0&&(
        <div style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"16px",marginBottom:10}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Collection Breakdown</div>
          <WineBottleViz types={types} total={col.length}/>
        </div>
      )}

      {/* Top wine */}
      {topWine&&(
        <div style={{background:"var(--card)",borderRadius:16,padding:"14px 16px",border:"1px solid var(--border)",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Top Rated</div>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)"}}>{topWine.name}</div>
            <div style={{fontSize:12,color:"var(--sub)",marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{topWine.origin}</div>
          </div>
          <Stars value={topWine.rating} size={14}/>
        </div>
      )}

      {/* Explore Wineries */}
      <div onClick={()=>setView("explore")}
        style={{background:"linear-gradient(135deg,rgba(155,35,53,0.08) 0%,rgba(155,35,53,0.04) 100%)",borderRadius:16,border:"1px solid rgba(155,35,53,0.2)",padding:"16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all 0.18s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(155,35,53,0.15) 0%,rgba(155,35,53,0.08) 100%)";}}
        onMouseLeave={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(155,35,53,0.08) 0%,rgba(155,35,53,0.04) 100%)";}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(155,35,53,0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="mappin" size={18} color="#9B2335"/></div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Explore Wineries</div>
            <div style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Discover top-rated wineries near you</div>
          </div>
        </div>
        <Icon n="chevR" size={16} color="#9B2335"/>
      </div>

      {/* Export */}
      <div onClick={()=>exportToExcel(wines,wishlist)}
        style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"14px 16px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"opacity 0.18s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><Icon n="export" size={16} color="var(--sub)"/><span style={{fontSize:14,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}}>Export to Excel (.xlsx)</span></div>
        <Icon n="chevR" size={16} color="var(--sub)"/>
      </div>
      <div style={{textAlign:"center",fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:0.6,marginBottom:8}}>Vino v6.0 · {displayName}</div>
    </div>
  );
};

/* ── TABS ─────────────────────────────────────────────────────── */
const TABS=[{id:"collection",label:"Cellar",ic:"wine"},{id:"wishlist",label:"Wishlist",ic:"heart"},{id:"ai",label:"Sommelier",ic:"chat"},{id:"notes",label:"Journal",ic:"note"},{id:"profile",label:"Winery",ic:"user"}];

/* ── APP ──────────────────────────────────────────────────────── */
export default function App(){
  const [themeMode,setThemeMode]=useState(()=>{try{return localStorage.getItem("vino_theme")||"system"}catch{return"system"}});
  const [sysDark,setSysDark]=useState(()=>window.matchMedia?.("(prefers-color-scheme:dark)").matches??false);
  const [tab,setTab]=useState("collection");
  const [wines,setWines]=useState([]);
  const [wishlist,setWishlist]=useState([]);
  const [notes,setNotes]=useState([]);
  const [profile,setProfileState]=useState(DEFAULT_PROFILE);
  const [ready,setReady]=useState(false);
  const [splashPhase,setSplashPhase]=useState("logo"); // logo | greet | onboard | done
  const [isDesktop,setIsDesktop]=useState(()=>window.innerWidth>=768);
  const [isNewUser,setIsNewUser]=useState(false);
  // Onboarding form
  const [oName,setOName]=useState("");
  const [oCellar,setOCellar]=useState("");

  useEffect(()=>{try{localStorage.setItem("vino_theme",themeMode)}catch{}},[themeMode]);
  useEffect(()=>{
    const mq=window.matchMedia?.("(prefers-color-scheme:dark)");
    const h=e=>setSysDark(e.matches);
    mq?.addEventListener("change",h);
    return()=>mq?.removeEventListener("change",h);
  },[]);
  useEffect(()=>{
    const h=()=>setIsDesktop(window.innerWidth>=768);
    window.addEventListener("resize",h);
    return()=>window.removeEventListener("resize",h);
  },[]);
  useEffect(()=>{
    async function load(){
      try{
        const [wineRows,noteRows,prof]=await Promise.all([db.get("wines"),db.get("tasting_notes"),db.getProfile()]);
        console.log("DB: wines",wineRows.length,"notes",noteRows.length);
        if(wineRows.length===0){
          await Promise.all([...SEED_WINES,...SEED_WISHLIST].map(w=>db.upsert("wines",toDb.wine(w))));
          await Promise.all(SEED_NOTES.map(n=>db.upsert("tasting_notes",toDb.note(n))));
          setWines(SEED_WINES);setWishlist(SEED_WISHLIST);setNotes(SEED_NOTES);
          setIsNewUser(true);
        }else{
          const all=wineRows.map(fromDb.wine);
          setWines(all.filter(w=>!w.wishlist));
          setWishlist(all.filter(w=>w.wishlist));
          setNotes(noteRows.map(fromDb.note));
          if(prof){
            setProfileState({name:prof.name,description:prof.description,avatar:prof.avatar||null,cellarName:prof.cellarName||"",bio:prof.bio||"",country:prof.country||"",surname:prof.surname||"",profileBg:prof.profileBg||""});
            // New user = profile name still matches the seed default or is empty
            setIsNewUser(!prof.name||(prof.name===DEFAULT_PROFILE.name&&!prof.cellarName));
          }else{
            setIsNewUser(true);
          }
        }
      }catch(e){
        console.error("Load error:",e);
        setWines(SEED_WINES);setWishlist(SEED_WISHLIST);setNotes(SEED_NOTES);
      }
      setReady(true);
    }
    load();
  },[]);

  // After 1.8s logo phase, move to greet
  useEffect(()=>{
    const t=setTimeout(()=>setSplashPhase(p=>p==="logo"?"greet":p),1800);
    return()=>clearTimeout(t);
  },[]);

  const dark=themeMode==="dark"||(themeMode==="system"&&sysDark);
  const th=T(dark);
  const cssVars={"--bg":th.bg,"--surface":th.surface,"--card":th.card,"--border":th.border,"--text":th.text,"--sub":th.sub,"--inputBg":th.inputBg,"--shadow":th.shadow};
  useEffect(()=>{
    Object.entries(cssVars).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
  });

  const addWine=async w=>{setWines(p=>[...p,w]);await db.upsert("wines",toDb.wine(w));};
  const updWine=async w=>{setWines(p=>p.map(x=>x.id===w.id?w:x));await db.upsert("wines",toDb.wine(w));};
  const delWine=async id=>{setWines(p=>p.filter(x=>x.id!==id));await db.del("wines",id);};
  const addWish=async w=>{setWishlist(p=>[...p,w]);await db.upsert("wines",toDb.wine(w));};
  const updWish=async w=>{setWishlist(p=>p.map(x=>x.id===w.id?w:x));await db.upsert("wines",toDb.wine(w));};
  const delWish=async id=>{setWishlist(p=>p.filter(x=>x.id!==id));await db.del("wines",id);};
  const moveToCol=async id=>{
    const w=wishlist.find(x=>x.id===id);if(!w)return;
    const m={...w,wishlist:false,bottles:1,rating:0};
    setWishlist(p=>p.filter(x=>x.id!==id));
    setWines(p=>[...p,m]);
    await db.upsert("wines",toDb.wine(m));
  };
  const addNote=async n=>{setNotes(p=>[...p,n]);await db.upsert("tasting_notes",toDb.note(n));};
  const delNote=async id=>{setNotes(p=>p.filter(x=>x.id!==id));await db.del("tasting_notes",id);};
  const setProfile=async p=>{setProfileState(p);await db.saveProfile(p);};

  const CSS=makeCSS(dark);

  const enterApp=async(name,cellar)=>{
    const p={...profile,name:name.trim()||profile.name,cellarName:cellar.trim()||`${name.trim()}'s Cellar`};
    setProfileState(p);
    await db.saveProfile(p);
    setSplashPhase("done");
  };

  // ── SPLASH / ONBOARDING ──────────────────────────────────────
  const SPLASH_BG={background:"linear-gradient(160deg,#0C0202 0%,#1A0808 50%,#0C0202 100%)",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative",overflow:"hidden"};

  // Decorative bubbles
  const Bubbles=()=>(
    <div style={{position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden"}}>
      {[{s:180,x:"-10%",y:"10%",o:0.03,d:0},{s:120,x:"80%",y:"5%",o:0.04,d:1},{s:80,x:"15%",y:"70%",o:0.04,d:2},{s:220,x:"70%",y:"65%",o:0.025,d:3},{s:60,x:"50%",y:"40%",o:0.05,d:4}].map((b,i)=>(
        <div key={i} style={{position:"absolute",left:b.x,top:b.y,width:b.s,height:b.s,borderRadius:"50%",background:"radial-gradient(circle,rgba(155,35,53,1) 0%,transparent 70%)",opacity:b.o,animation:`pulse 3s ${b.d}s ease-in-out infinite`}}/>
      ))}
    </div>
  );

  if(splashPhase==="logo"||splashPhase==="greet") return(
    <div style={SPLASH_BG}>
      <style>{CSS}</style>
      <Bubbles/>
      <div style={{textAlign:"center",position:"relative",zIndex:1,padding:"0 40px"}}>
        {/* Logo */}
        <div style={{marginBottom:20,animation:"floatUp 1s ease both"}}>
          <div style={{width:80,height:80,borderRadius:24,background:"rgba(155,35,53,0.15)",border:"1px solid rgba(155,35,53,0.3)",display:"inline-flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}>
            <Icon n="wine" size={40} color="#C47060"/>
          </div>
        </div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:58,fontWeight:800,color:"#EDE6E0",letterSpacing:"-2px",lineHeight:1,animation:"floatUp 1s 0.1s ease both"}}>Vino</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"rgba(237,230,224,0.3)",marginTop:8,letterSpacing:"6px",textTransform:"uppercase",animation:"floatUp 1s 0.2s ease both"}}>Personal Cellar</div>

        {/* Greeting + button — shown after logo phase */}
        {splashPhase==="greet"&&ready&&(
          <div style={{animation:"floatUp 0.8s 0.1s ease both"}}>
            <div style={{marginTop:32,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:18,fontWeight:400,color:"rgba(237,230,224,0.55)",lineHeight:1.5}}>
              Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}{profile.name&&profile.name!==DEFAULT_PROFILE.name?`, ${profile.name}`:""}
            </div>
            <div style={{marginTop:36}}>
              <button
                onClick={()=>{ if(isNewUser){setSplashPhase("onboard");}else{setSplashPhase("done");} }}
                style={{background:"#9B2335",color:"white",border:"none",borderRadius:20,padding:"16px 44px",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:"-0.3px",boxShadow:"0 8px 32px rgba(155,35,53,0.5)",transition:"transform 0.15s,box-shadow 0.15s",display:"inline-flex",alignItems:"center",gap:10}}
                onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.04)";e.currentTarget.style.boxShadow="0 12px 40px rgba(155,35,53,0.65)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 8px 32px rgba(155,35,53,0.5)";}}>
                <Icon n="wine" size={18} color="white"/>
                {isNewUser?"Let's Get Started":"Enter My Winery"}
              </button>
            </div>
            <div style={{marginTop:16,fontSize:12,color:"rgba(237,230,224,0.2)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {wines.length>0?`${wines.filter(w=>!w.wishlist).length} wines in your cellar`:"Building your cellar…"}
            </div>
          </div>
        )}
        {splashPhase==="greet"&&!ready&&(
          <div style={{marginTop:48,animation:"floatUp 0.6s ease both"}}>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"rgba(155,35,53,0.6)",animation:`blink 1.2s ${i*0.18}s ease infinite`}}/>)}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── ONBOARDING ───────────────────────────────────────────────
  if(splashPhase==="onboard") return(
    <div style={SPLASH_BG}>
      <style>{CSS}</style>
      <Bubbles/>
      <div style={{position:"relative",zIndex:1,width:"100%",maxWidth:400,padding:"0 32px",animation:"floatUp 0.6s ease both"}}>
        <div style={{textAlign:"center",marginBottom:40}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:28,fontWeight:800,color:"#EDE6E0",letterSpacing:"-1px"}}>Welcome to Vino</div>
          <div style={{fontSize:14,color:"rgba(237,230,224,0.45)",marginTop:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Tell us a little about yourself</div>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(237,230,224,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Your Name</div>
          <input
            value={oName} onChange={e=>setOName(e.target.value)}
            placeholder="e.g. Neale"
            autoFocus
            style={{background:"rgba(255,255,255,0.06)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"14px 16px",width:"100%",color:"#EDE6E0",fontSize:16,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}
            onFocus={e=>e.target.style.borderColor="rgba(155,35,53,0.7)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"}
          />
        </div>
        <div style={{marginBottom:36}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(237,230,224,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cellar Name <span style={{opacity:0.5,textTransform:"none",letterSpacing:0,fontSize:10}}>optional</span></div>
          <input
            value={oCellar} onChange={e=>setOCellar(e.target.value)}
            placeholder="e.g. The Neale Cellar, Château Moi"
            style={{background:"rgba(255,255,255,0.06)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"14px 16px",width:"100%",color:"#EDE6E0",fontSize:16,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}
            onFocus={e=>e.target.style.borderColor="rgba(155,35,53,0.7)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"}
            onKeyDown={e=>e.key==="Enter"&&oName&&enterApp(oName,oCellar)}
          />
        </div>
        <button
          onClick={()=>oName&&enterApp(oName,oCellar)}
          disabled={!oName}
          style={{width:"100%",background:oName?"#9B2335":"rgba(155,35,53,0.2)",color:oName?"white":"rgba(237,230,224,0.3)",border:"none",borderRadius:18,padding:"17px",fontSize:16,fontWeight:700,cursor:oName?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:oName?"0 8px 32px rgba(155,35,53,0.45)":"none",transition:"all 0.25s",letterSpacing:"-0.2px"}}
          onMouseEnter={e=>{if(oName){e.currentTarget.style.transform="scale(1.02)";e.currentTarget.style.boxShadow="0 12px 40px rgba(155,35,53,0.6)";}}}
          onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=oName?"0 8px 32px rgba(155,35,53,0.45)":"none";}}>
          Enter My Winery →
        </button>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"rgba(237,230,224,0.2)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>You can change this anytime in Settings</div>
      </div>
    </div>
  );

  const screens=(
    <>
      {tab==="collection"&&<CollectionScreen wines={wines} onAdd={addWine} onUpdate={updWine} onDelete={delWine} desktop={isDesktop}/>}
      {tab==="wishlist"&&<WishlistScreen wishlist={wishlist} onAdd={addWish} onUpdate={updWish} onDelete={delWish} onMove={moveToCol} desktop={isDesktop}/>}
      {tab==="ai"&&<AIScreen wines={wines}/>}
      {tab==="notes"&&<NotesScreen wines={wines} notes={notes} onAdd={addNote} onDelete={delNote}/>}
      {tab==="profile"&&<ProfileScreen wines={wines} wishlist={wishlist} notes={notes} theme={themeMode} setTheme={setThemeMode} profile={profile} setProfile={setProfile}/>}
    </>
  );

  const displayName=[profile.name,profile.surname].filter(Boolean).join(" ")||profile.name||"Winemaker";

  if(isDesktop) return(
    <div style={{...cssVars,background:"var(--bg)",height:"100vh",display:"flex",overflow:"hidden",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--text)"}}>
      <style>{CSS}</style>
      <div style={{width:220,flexShrink:0,background:dark?"#100C0C":"#1A0808",display:"flex",flexDirection:"column",padding:"28px 12px 24px"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36,paddingLeft:8}}>
          <Icon n="wine" size={20} color="#9B2335"/>
          <span style={{fontSize:20,fontWeight:800,color:"#EDE6E0",letterSpacing:"-0.5px"}}>Vino</span>
        </div>
        <nav style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {TABS.map(tb=>{
            const active=tab===tb.id;
            return(
              <button key={tb.id} onClick={()=>setTab(tb.id)} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 12px",borderRadius:11,border:"none",background:active?"rgba(155,35,53,0.18)":"transparent",color:active?"#F08090":"rgba(237,230,224,0.45)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:active?700:500,fontSize:14,cursor:"pointer",transition:"all 0.15s",textAlign:"left",width:"100%"}}>
                <Icon n={tb.ic} size={17} color={active?"#F08090":"rgba(237,230,224,0.35)"}/>
                {tb.label}
                {active&&<div style={{marginLeft:"auto",width:5,height:5,borderRadius:"50%",background:"#9B2335",flexShrink:0}}/>}
              </button>
            );
          })}
        </nav>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:16,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(155,35,53,0.3)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {profile.avatar?<img src={profile.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="user" size={15} color="#F08090"/>}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#EDE6E0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{displayName}</div>
            <div style={{fontSize:11,color:"rgba(237,230,224,0.35)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{profile.cellarName||profile.description||"My Cellar"}</div>
          </div>
        </div>
      </div>
      <div data-scroll="main" style={{flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch"}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"40px 48px 60px"}}>
          {screens}
        </div>
      </div>
    </div>
  );

  return(
    <div style={{...cssVars,background:"var(--bg)",height:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--text)",maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column",overflow:"hidden",position:"fixed",left:"50%",transform:"translateX(-50%)",width:"100%"}}>
      <style>{CSS}</style>
      <div data-scroll="main" style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"20px 20px 96px",WebkitOverflowScrolling:"touch"}}>
        {screens}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:dark?"rgba(12,10,10,0.94)":"rgba(247,244,242,0.94)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderTop:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)"}`,padding:"10px 0 22px",zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-around"}}>
          {TABS.map(tb=>{
            const active=tab===tb.id;
            return(
              <button key={tb.id} onClick={()=>setTab(tb.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",padding:"4px 12px",color:active?"#9B2335":"var(--sub)",transition:"color 0.18s",fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
                <div style={{transform:active?"scale(1.1)":"scale(1)",transition:"transform 0.18s"}}><Icon n={tb.ic} size={22} color={active?"#9B2335":"var(--sub)"}/></div>
                <span style={{fontSize:9.5,fontWeight:active?700:500,letterSpacing:"0.3px"}}>{tb.label}</span>
                <div style={{width:4,height:4,borderRadius:"50%",background:active?"#9B2335":"transparent",transition:"background 0.18s"}}/>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
