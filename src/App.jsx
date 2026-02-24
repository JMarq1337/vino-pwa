import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

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
    try { await fetch(`${supa("profile")}?id=eq.1`,{method:"PATCH",headers:UH,body:JSON.stringify({name:p.name,description:p.description,avatar:p.avatar})}); }
    catch{}
  },
  async getProfile() {
    try { const r=await fetch(`${supa("profile")}?id=eq.1`,{headers:BH}); const d=r.ok?await r.json():[]; return d[0]||null; }
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
  const content=(
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",animation:"fadeIn .2s"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxWidth:wide?520:420,background:"var(--surface)",borderRadius:24,maxHeight:"88vh",overflowY:"auto",animation:"modalIn .22s cubic-bezier(0.34,1.2,0.64,1)",boxShadow:"0 32px 80px rgba(0,0,0,0.4)"}}>
        <div style={{padding:"24px 24px 28px"}}>{children}</div>
      </div>
    </div>
  );
  return createPortal(content, document.body);
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
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px var(--shadow)"}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)"}}>
      <div style={{width:60,height:72,borderRadius:13,background:tc.bg,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
        {wine.photo?<img src={wine.photo} alt={wine.name} style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="wine" size={24} color={tc.dot}/>}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:3}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:16,fontWeight:700,color:"var(--text)",lineHeight:1.25,flex:1,paddingRight:8}}>{wine.name}{wine.vintage?` ${wine.vintage}`:""}</div>
          {!wine.wishlist&&wine.bottles>0&&<div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"var(--sub)",fontWeight:500,flexShrink:0}}>{wine.bottles} {wine.bottles===1?"btl":"btls"}</div>}
        </div>
        {wine.origin&&<div style={{fontSize:13,color:"var(--sub)",marginBottom:7,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{wine.origin.split(",")[0]}</div>}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <WineTypePill type={type}/>
          {wine.vintage&&<span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{wine.vintage}</span>}
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
        <div style={{position:"absolute",right:-8,bottom:-12,opacity:0.12}}><Icon n="wine" size={100} color={tc.dot}/></div>
        <WineTypePill type={type}/>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:24,fontWeight:700,color:"var(--text)",marginTop:8,lineHeight:1.2}}>{wine.name}</div>
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
  const pickSug=w=>{setF(p=>({...p,name:w.name,origin:w.origin,grape:w.grape,alcohol:w.alcohol?.toString()||"",tastingNotes:w.tastingNotes||"",wineType:w.wineType||guessWineType(w.grape,w.name)}));setQ(w.name);setSugs([]);setShowFields(true);};
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
        <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Search wine database</label>
        <div style={{position:"relative"}}>
          <input value={q} onChange={e=>handleQ(e.target.value)} placeholder="Wine name, grape, or region…" style={{paddingLeft:38}} onBlur={()=>setTimeout(()=>setSugs([]),160)}/>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
        </div>
        {sugs.length>0&&(
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",borderRadius:14,border:"1px solid var(--border)",zIndex:99,maxHeight:220,overflowY:"auto",boxShadow:"0 12px 40px var(--shadow)",marginTop:4}}>
            {sugs.map((w,i)=>(<div key={i} onMouseDown={()=>pickSug(w)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<sugs.length-1?"1px solid var(--border)":"none"}} onMouseEnter={e=>e.currentTarget.style.background="var(--inputBg)"} onMouseLeave={e=>e.currentTarget.style.background="transparent"}><div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:600,color:"var(--text)"}}>{w.name}</div><div style={{fontSize:12,color:"var(--sub)",marginTop:1}}>{w.grape} · {w.origin}</div></div>))}
            <div onMouseDown={()=>{setSugs([]);setShowFields(true);}} style={{padding:"10px 14px",cursor:"pointer",color:"#9B2335",fontSize:13,fontWeight:600,textAlign:"center",borderTop:"1px solid var(--border)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Add "{q}" manually</div>
          </div>
        )}
        {!showFields&&!sugs.length&&q.length>=1&&<button onMouseDown={()=>setShowFields(true)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"#9B2335",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Enter details manually</button>}
      </div>
      {showFields&&<>
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
        {!isWishlist&&<div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:10}}>
          <Field label="Bottles" value={f.bottles} onChange={v=>set("bottles",v)} type="number" placeholder="1" optional/>
          <SelField label="Location" value={f.location} onChange={v=>set("location",v)} options={LOCATIONS}/>
          <Field label="Slot" value={f.locationSlot} onChange={v=>set("locationSlot",v)} placeholder="A3" optional/>
        </div>}
        <Field label="Tasting Notes" value={f.tastingNotes} onChange={v=>set("tastingNotes",v)} placeholder="Dark plum, cedar, vanilla…" optional/>
        <Field label="Personal Notes" value={f.notes} onChange={v=>set("notes",v)} placeholder="Pairings, memories…" rows={2} optional/>
        {!isWishlist&&<>
          <div style={{marginBottom:14}}><div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Rating</div><Stars value={f.rating} onChange={v=>set("rating",v)} size={22}/></div>
          <Field label="Review" value={f.review} onChange={v=>set("review",v)} placeholder="Your thoughts…" rows={2} optional/>
          <Field label="Date Purchased" value={f.datePurchased} onChange={v=>set("datePurchased",v)} type="date" optional/>
        </>}
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={onClose} full>Cancel</Btn>
          <Btn onClick={save} full disabled={!f.name}>Save Wine</Btn>
        </div>
      </>}
    </div>
  );
};

/* ── FILTER ───────────────────────────────────────────────────── */
const SORTS=[{value:"name",label:"Name A–Z"},{value:"rating",label:"Rating"},{value:"vintage",label:"Vintage"},{value:"bottles",label:"Bottles"},{value:"recent",label:"Recently Added"}];
const DEFAULT_FILTERS={sort:"name",type:"",minRating:0,location:""};
const hasFilters=f=>f.sort!=="name"||f.type||f.minRating>0||f.location;
const applyFilters=(wines,f,s)=>{
  let r=wines.filter(w=>!w.wishlist);
  if(s)r=r.filter(w=>`${w.name} ${w.grape} ${w.origin} ${w.location}`.toLowerCase().includes(s.toLowerCase()));
  if(f.minRating>0)r=r.filter(w=>(w.rating||0)>=f.minRating);
  if(f.type)r=r.filter(w=>(w.wineType||guessWineType(w.grape,w.name))===f.type);
  if(f.location)r=r.filter(w=>w.location===f.location);
  return r.sort((a,b)=>{if(f.sort==="rating")return(b.rating||0)-(a.rating||0);if(f.sort==="vintage")return(b.vintage||0)-(a.vintage||0);if(f.sort==="bottles")return(b.bottles||0)-(a.bottles||0);if(f.sort==="recent")return b.id.localeCompare(a.id);return a.name.localeCompare(b.name);});
};

const FilterPanel=({filters,setFilters,wines,onClose})=>{
  const col=wines.filter(w=>!w.wishlist);
  const locs=[...new Set(col.map(w=>w.location).filter(Boolean))].sort();
  const [local,setLocal]=useState({...filters});
  const toggle=(k,v)=>setLocal(p=>({...p,[k]:p[k]===v?"":v}));
  const chipStyle=(active)=>({padding:"7px 13px",borderRadius:20,border:active?"1.5px solid #9B2335":"1.5px solid var(--border)",background:active?"rgba(155,35,53,0.1)":"var(--inputBg)",color:active?"#9B2335":"var(--text)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all 0.15s"});
  return(
    <div>
      <ModalHeader title="Filter & Sort" onClose={onClose}/>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Sort By</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>{SORTS.map(o=><button key={o.value} onClick={()=>setLocal(p=>({...p,sort:o.value}))} style={chipStyle(local.sort===o.value)}>{o.label}</button>)}</div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Min Rating</div>
      <div style={{display:"flex",gap:6,marginBottom:18}}>{[0,1,2,3,4,5].map(r=><button key={r} onClick={()=>setLocal(p=>({...p,minRating:r}))} style={chipStyle(local.minRating===r)}>{r===0?"Any":`${r}+`}</button>)}</div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Wine Type</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>{Object.keys(WINE_TYPE_COLORS).filter(k=>k!=="Other").map(t=><button key={t} onClick={()=>toggle("type",t)} style={chipStyle(local.type===t)}>{t}</button>)}</div>
      {locs.length>0&&<><div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Location</div><div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>{locs.map(l=><button key={l} onClick={()=>toggle("location",l)} style={chipStyle(local.location===l)}>{l}</button>)}</div></>}
      <div style={{display:"flex",gap:8}}><Btn variant="secondary" onClick={()=>setLocal(DEFAULT_FILTERS)} full>Reset</Btn><Btn onClick={()=>{setFilters(local);onClose();}} full>Apply</Btn></div>
    </div>
  );
};

/* ── HELPERS ──────────────────────────────────────────────────── */
const Empty=({icon,text})=>(<div style={{textAlign:"center",padding:"56px 0",color:"var(--sub)"}}><div style={{marginBottom:12,opacity:0.3}}><Icon n={icon} size={44} color="var(--sub)"/></div><div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:14}}>{text}</div></div>);
const Chip=({label,onX})=>(<div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(155,35,53,0.1)",border:"1.5px solid rgba(155,35,53,0.25)"}}><span style={{fontSize:12,color:"#9B2335",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{label}</span><button onClick={onX} style={{background:"none",border:"none",color:"#9B2335",padding:0,lineHeight:1,display:"flex",cursor:"pointer"}}><Icon n="x" size={11}/></button></div>);

/* ── COLLECTION SCREEN ────────────────────────────────────────── */
const CollectionScreen=({wines,onAdd,onUpdate,onDelete})=>{
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
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:36,fontWeight:700,color:"var(--text)",lineHeight:1,letterSpacing:"-1px"}}>{col.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>wines</span></div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,color:"var(--sub)"}}>{bottles} bottles</div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:16,alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wines, regions…" style={{paddingLeft:38,borderRadius:14}}/>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
        </div>
        <button onClick={()=>setFilterOpen(true)} style={{width:44,height:44,borderRadius:14,background:active?"rgba(155,35,53,0.12)":"var(--card)",border:active?"1.5px solid #9B2335":"1.5px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:active?"#9B2335":"var(--sub)",flexShrink:0,position:"relative"}}>
          <Icon n="filter" size={17}/>
          {active&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:"#9B2335",border:"1.5px solid var(--bg)"}}/>}
        </button>
        <button onClick={()=>setAdding(true)} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",flexShrink:0,boxShadow:"0 4px 16px rgba(155,35,53,0.35)"}}>
          <Icon n="plus" size={20}/>
        </button>
      </div>
      {active&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {filters.sort!=="name"&&<Chip label={SORTS.find(o=>o.value===filters.sort)?.label} onX={()=>setFilters(p=>({...p,sort:"name"}))}/>}
        {filters.minRating>0&&<Chip label={`${filters.minRating}+ stars`} onX={()=>setFilters(p=>({...p,minRating:0}))}/>}
        {filters.type&&<Chip label={filters.type} onX={()=>setFilters(p=>({...p,type:""}))}/>}
        {filters.location&&<Chip label={filters.location} onX={()=>setFilters(p=>({...p,location:""}))}/>}
        <button onClick={()=>setFilters(DEFAULT_FILTERS)} style={{padding:"4px 10px",borderRadius:20,border:"none",background:"none",color:"var(--sub)",fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:"underline"}}>Clear all</button>
      </div>}
      {filt.length===0?<Empty icon="wine" text={search||active?"No wines match your filters.":"Your cellar is empty. Add your first wine."}/>:filt.map(w=><WineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
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
const WishlistScreen=({wishlist,onAdd,onUpdate,onDelete,onMove})=>{
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const [adding,setAdding]=useState(false);
  return(
    <div>
      <div style={{marginBottom:24}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Wishlist</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:36,fontWeight:700,color:"var(--text)",lineHeight:1,letterSpacing:"-1px"}}>{wishlist.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>to try</span></div>
          <button onClick={()=>setAdding(true)} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",boxShadow:"0 4px 16px rgba(155,35,53,0.35)"}}><Icon n="plus" size={20}/></button>
        </div>
      </div>
      {wishlist.length===0?<Empty icon="heart" text="Add wines you dream of trying."/>:wishlist.map(w=><WineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
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

/* ── AI SCREEN ────────────────────────────────────────────────── */
const AIScreen=({wines})=>{
  const [msgs,setMsgs]=useState([{r:"a",t:"Hello. I'm Vino — your personal sommelier.\n\nAsk me anything about your collection, food pairings, what to open tonight, or recommendations."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const scrollRef=useRef();
  const chips=["What should I open tonight?","Best food pairings?","What's in my cellar?","Recommend a wine"];
  const send=useCallback(async msg=>{
    const txt=msg||input.trim();
    if(!txt||loading)return;
    setInput("");setMsgs(p=>[...p,{r:"u",t:txt}]);setLoading(true);
    const reply=await callAI(txt,wines);
    setMsgs(p=>[...p,{r:"a",t:reply}]);setLoading(false);
    setTimeout(()=>scrollRef.current?.scrollTo({top:99999,behavior:"smooth"}),80);
  },[input,wines,loading]);
  return(
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 140px)"}}>
      <div style={{marginBottom:18}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Vino AI</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:30,fontWeight:700,color:"var(--text)",lineHeight:1}}>Sommelier</div>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{marginBottom:12,display:"flex",justifyContent:m.r==="u"?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
            {m.r==="a"&&<div style={{width:30,height:30,borderRadius:10,background:"#9B2335",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon n="wine" size={15} color="white"/></div>}
            <div style={{maxWidth:"80%",padding:"12px 15px",borderRadius:m.r==="u"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.r==="u"?"#9B2335":"var(--card)",color:m.r==="u"?"white":"var(--text)",fontSize:14,lineHeight:1.65,border:m.r==="a"?"1px solid var(--border)":"none",whiteSpace:"pre-wrap",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"0 2px 8px var(--shadow)"}}>{m.t}</div>
          </div>
        ))}
        {loading&&<div style={{display:"flex",alignItems:"flex-end",gap:8}}><div style={{width:30,height:30,borderRadius:10,background:"#9B2335",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="wine" size={15} color="white"/></div><div style={{padding:"14px 16px",borderRadius:"18px 18px 18px 4px",background:"var(--card)",border:"1px solid var(--border)",display:"flex",gap:5,alignItems:"center"}}>{[0,1,2].map(d=><div key={d} style={{width:6,height:6,borderRadius:"50%",background:"var(--sub)",animation:"blink 1.2s ease infinite",animationDelay:`${d*0.18}s`}}/>)}</div></div>}
      </div>
      {msgs.length<=1&&<div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>{chips.map(c=><button key={c} onClick={()=>send(c)} style={{padding:"8px 13px",borderRadius:20,border:"1.5px solid var(--border)",background:"var(--card)",color:"var(--text)",fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}} onMouseEnter={e=>e.currentTarget.style.borderColor="#9B2335"} onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>{c}</button>)}</div>}
      <div style={{display:"flex",gap:8,paddingTop:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask anything about wine…" style={{borderRadius:14}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading} style={{width:44,height:44,flexShrink:0,borderRadius:12,background:input.trim()&&!loading?"#9B2335":"var(--inputBg)",border:"none",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",color:input.trim()&&!loading?"white":"var(--sub)",boxShadow:input.trim()&&!loading?"0 4px 14px rgba(155,35,53,0.3)":"none",transition:"all 0.18s"}}><Icon n="send" size={17}/></button>
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
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:36,fontWeight:700,color:"var(--text)",lineHeight:1}}>{notes.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>notes</span></div>
          <button onClick={()=>{setForm({wineId:col[0]?.id||"",title:"",content:""});setAdding(true);}} style={{width:44,height:44,borderRadius:14,background:"#9B2335",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",boxShadow:"0 4px 16px rgba(155,35,53,0.35)"}}><Icon n="plus" size={20}/></button>
        </div>
      </div>
      {notes.length===0?<Empty icon="note" text="Capture your tasting memories."/>:notes.map(n=>{
        const w=getW(n.wineId);
        const type=w?(w.wineType||guessWineType(w.grape,w.name)):"Other";
        const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
        return(
          <div key={n.id} onClick={()=>setSel(n)} style={{background:"var(--card)",borderRadius:18,padding:"16px",cursor:"pointer",border:"1px solid var(--border)",marginBottom:10,transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 2px 8px var(--shadow)"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px var(--shadow)"}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:17,fontWeight:700,color:"var(--text)",lineHeight:1.2,flex:1,paddingRight:8}}>{n.title}</div>
              <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0}}>{n.date?new Date(n.date).toLocaleDateString("en-AU",{day:"numeric",month:"short"}):""}</div>
            </div>
            {w&&<div style={{display:"inline-flex",alignItems:"center",gap:6,marginBottom:8}}><div style={{width:7,height:7,borderRadius:"50%",background:tc.dot}}/><span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{w.name}</span></div>}
            <div style={{fontSize:13,color:"var(--sub)",lineHeight:1.55,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{n.content}</div>
          </div>
        );
      })}
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
        {sel&&<div>
          <ModalHeader title={sel.title} onClose={()=>setSel(null)}/>
          {getW(sel.wineId)&&<div style={{fontSize:13,color:"#9B2335",marginBottom:8,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:6}}><div style={{width:7,height:7,borderRadius:"50%",background:"#9B2335"}}/>{getW(sel.wineId)?.name}</div>}
          <div style={{fontSize:12,color:"var(--sub)",marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{sel.date?new Date(sel.date).toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"long",year:"numeric"}):""}</div>
          <div style={{fontSize:15,color:"var(--text)",lineHeight:1.75,marginBottom:24,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{sel.content}</div>
          <Btn variant="danger" onClick={()=>{onDelete(sel.id);setSel(null);}} full icon="trash">Delete Note</Btn>
        </div>}
      </Modal>
    </div>
  );
};

/* ── PROFILE ──────────────────────────────────────────────────── */
const ProfileScreen=({wines,wishlist,notes,theme,setTheme,profile,setProfile})=>{
  const [editing,setEditing]=useState(false);
  const [pForm,setPForm]=useState({name:"",description:"",avatar:null});
  const col=wines.filter(w=>!w.wishlist);
  const bottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const topWine=[...col].sort((a,b)=>(b.rating||0)-(a.rating||0))[0];
  const types=col.reduce((acc,w)=>{const t=w.wineType||guessWineType(w.grape,w.name);acc[t]=(acc[t]||0)+1;return acc;},{});
  const THEMES=[{id:"system",label:"System",ic:"monitor"},{id:"light",label:"Light",ic:"sun"},{id:"dark",label:"Dark",ic:"moon"}];

  const openEdit=()=>{
    setPForm({name:profile.name||"",description:profile.description||"",avatar:profile.avatar||null});
    setEditing(true);
  };

  /* ── EDIT VIEW ── */
  if(editing) return(
    <div style={{animation:"fadeUp 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <button onClick={()=>setEditing(false)} style={{background:"var(--inputBg)",border:"none",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)",cursor:"pointer",flexShrink:0}}>
          <Icon n="chevR" size={18} color="var(--sub)" style={{transform:"rotate(180deg)"}}/>
        </button>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"var(--text)"}}>Edit Profile</div>
      </div>
      <div style={{display:"flex",justifyContent:"center",marginBottom:24}}>
        <PhotoPicker value={pForm.avatar} onChange={v=>setPForm(p=>({...p,avatar:v}))} size={100} round/>
      </div>
      <div style={{marginBottom:14}}>
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Name</label>
        <input value={pForm.name} onChange={e=>setPForm(p=>({...p,name:e.target.value}))} placeholder="Your name"/>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <label style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Description</label>
          <span style={{fontSize:10,color:"var(--sub)",opacity:0.6}}>optional</span>
        </div>
        <input value={pForm.description} onChange={e=>setPForm(p=>({...p,description:e.target.value}))} placeholder="Winemaker & Collector"/>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={()=>setEditing(false)} style={{flex:1,padding:"14px",borderRadius:12,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cancel</button>
        <button onClick={()=>{if(pForm.name){setProfile({...pForm});setEditing(false);}}} disabled={!pForm.name} style={{flex:1,padding:"14px",borderRadius:12,border:"none",background:pForm.name?"#9B2335":"var(--inputBg)",color:pForm.name?"white":"var(--sub)",fontSize:14,fontWeight:700,cursor:pForm.name?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:pForm.name?"0 4px 16px rgba(155,35,53,0.3)":"none",transition:"all 0.18s"}}>Save</button>
      </div>
    </div>
  );

  /* ── MAIN VIEW ── */
  return(
    <div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>My Winery</div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:36,fontWeight:800,color:"var(--text)",lineHeight:1,marginBottom:20}}>Profile</div>
      <div style={{background:"linear-gradient(135deg,#6B0A0A 0%,#9B2335 60%,#6B0A0A 100%)",borderRadius:22,padding:"20px",marginBottom:14,position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-20,top:-20,opacity:0.06}}><Icon n="wine" size={160} color="white"/></div>
        <div style={{display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:66,height:66,borderRadius:"50%",background:"rgba(255,255,255,0.15)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.25)"}}>
            {profile.avatar?<img src={profile.avatar} alt="avatar" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="user" size={28} color="rgba(255,255,255,0.8)"/>}
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:700,color:"white",lineHeight:1.1}}>{profile.name}</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,0.65)",marginTop:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{profile.description}</div>
          </div>
          <button onClick={openEdit} style={{flexShrink:0,background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.35)",borderRadius:11,padding:"9px 16px",color:"white",fontSize:13,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            <Icon n="edit" size={13} color="white"/> Edit
          </button>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
        {[["Wines",col.length],["Bottles",bottles],["Notes",notes.length]].map(([l,v])=>(
          <div key={l} style={{background:"var(--card)",borderRadius:16,padding:"14px 10px",textAlign:"center",border:"1px solid var(--border)"}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:26,fontWeight:800,color:"var(--text)",lineHeight:1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,marginTop:3,textTransform:"uppercase",letterSpacing:"0.7px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
          </div>
        ))}
      </div>
      {Object.keys(types).length>0&&(
        <div style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"14px 16px",marginBottom:10}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Collection Breakdown</div>
          {Object.entries(types).sort((a,b)=>b[1]-a[1]).map(([t,ct])=>{
            const tc=WINE_TYPE_COLORS[t]||WINE_TYPE_COLORS.Other;
            const pct=Math.round((ct/col.length)*100);
            return(<div key={t} style={{marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontSize:13,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}}>{t}</span><span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{ct} · {pct}%</span></div><div style={{height:4,background:"var(--inputBg)",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:tc.dot,borderRadius:2}}/></div></div>);
          })}
        </div>
      )}
      {topWine&&<div style={{background:"var(--card)",borderRadius:16,padding:"14px 16px",border:"1px solid var(--border)",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:4,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Top Rated</div><div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)"}}>{topWine.name}</div><div style={{fontSize:12,color:"var(--sub)",marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{topWine.origin}</div></div><Stars value={topWine.rating} size={14}/></div>}
      <div style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"16px",marginBottom:10}}>
        <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Theme</div>
        <div style={{display:"flex",gap:8}}>
          {THEMES.map(t=>{const act=theme===t.id;return(
            <button key={t.id} onClick={()=>setTheme(t.id)} style={{flex:1,padding:"14px 8px",borderRadius:14,border:act?"2px solid #9B2335":"1.5px solid var(--border)",background:act?"rgba(155,35,53,0.08)":"var(--inputBg)",color:act?"#9B2335":"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8,transition:"all 0.18s"}}>
              <div style={{width:32,height:32,borderRadius:10,background:act?"rgba(155,35,53,0.15)":"var(--border)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <Icon n={t.ic} size={18} color={act?"#9B2335":"var(--sub)"}/>
              </div>
              {t.label}
            </button>
          );})}
        </div>
      </div>
      <div onClick={()=>{const b=new Blob([JSON.stringify({wines,wishlist,notes,profile,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="my-winery.json";a.click();}} style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"14px 16px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"opacity 0.18s"}} onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><Icon n="export" size={16} color="var(--sub)"/><span style={{fontSize:14,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}}>Export Collection</span></div>
        <Icon n="chevR" size={16} color="var(--sub)"/>
      </div>
      <div style={{textAlign:"center",fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:0.6,marginBottom:8}}>Vino v4.5 · {profile.name}</div>
    </div>
  );
};

/* ── TABS ─────────────────────────────────────────────────────── */
const TABS=[{id:"collection",label:"Cellar",ic:"wine"},{id:"wishlist",label:"Wishlist",ic:"heart"},{id:"ai",label:"Sommelier",ic:"chat"},{id:"notes",label:"Journal",ic:"note"},{id:"profile",label:"Winery",ic:"user"}];

/* ── APP ──────────────────────────────────────────────────────── */
export default function App() {
  const [themeMode,setThemeMode]=useState(()=>{try{return localStorage.getItem("vino_theme")||"system"}catch{return"system"}});
  const [sysDark,setSysDark]=useState(()=>window.matchMedia?.("(prefers-color-scheme:dark)").matches??false);
  const [tab,setTab]=useState("collection");
  const [wines,setWines]=useState([]);
  const [wishlist,setWishlist]=useState([]);
  const [notes,setNotes]=useState([]);
  const [profile,setProfileState]=useState(DEFAULT_PROFILE);
  const [ready,setReady]=useState(false);
  const [splashDone,setSplashDone]=useState(false);

  useEffect(()=>{try{localStorage.setItem("vino_theme",themeMode)}catch{}},[themeMode]);
  useEffect(()=>{const mq=window.matchMedia?.("(prefers-color-scheme:dark)");const h=e=>setSysDark(e.matches);mq?.addEventListener("change",h);return()=>mq?.removeEventListener("change",h);},[]);

  useEffect(()=>{
    async function load(){
      try{
        const [wineRows,noteRows,prof]=await Promise.all([db.get("wines"),db.get("tasting_notes"),db.getProfile()]);
        console.log("DB: wines",wineRows.length,"notes",noteRows.length);
        if(wineRows.length===0){
          await Promise.all([...SEED_WINES,...SEED_WISHLIST].map(w=>db.upsert("wines",toDb.wine(w))));
          await Promise.all(SEED_NOTES.map(n=>db.upsert("tasting_notes",toDb.note(n))));
          setWines(SEED_WINES);setWishlist(SEED_WISHLIST);setNotes(SEED_NOTES);
        }else{
          const all=wineRows.map(fromDb.wine);
          setWines(all.filter(w=>!w.wishlist));setWishlist(all.filter(w=>w.wishlist));
          setNotes(noteRows.map(fromDb.note));
          if(prof)setProfileState({name:prof.name,description:prof.description,avatar:prof.avatar||null});
        }
      }catch(e){console.error("Load error:",e);setWines(SEED_WINES);setWishlist(SEED_WISHLIST);setNotes(SEED_NOTES);}
      setReady(true);
    }
    load();
  },[]);

  useEffect(()=>{const t=setTimeout(()=>setSplashDone(true),2400);return()=>clearTimeout(t);},[]);

  const dark=themeMode==="dark"||(themeMode==="system"&&sysDark);
  const th=T(dark);
  const cssVars={"--bg":th.bg,"--surface":th.surface,"--card":th.card,"--border":th.border,"--text":th.text,"--sub":th.sub,"--inputBg":th.inputBg,"--shadow":th.shadow};

  const addWine=async w=>{setWines(p=>[...p,w]);await db.upsert("wines",toDb.wine(w));};
  const updWine=async w=>{setWines(p=>p.map(x=>x.id===w.id?w:x));await db.upsert("wines",toDb.wine(w));};
  const delWine=async id=>{setWines(p=>p.filter(x=>x.id!==id));await db.del("wines",id);};
  const addWish=async w=>{setWishlist(p=>[...p,w]);await db.upsert("wines",toDb.wine(w));};
  const updWish=async w=>{setWishlist(p=>p.map(x=>x.id===w.id?w:x));await db.upsert("wines",toDb.wine(w));};
  const delWish=async id=>{setWishlist(p=>p.filter(x=>x.id!==id));await db.del("wines",id);};
  const moveToCol=async id=>{const w=wishlist.find(x=>x.id===id);if(!w)return;const m={...w,wishlist:false,bottles:1,rating:0};setWishlist(p=>p.filter(x=>x.id!==id));setWines(p=>[...p,m]);await db.upsert("wines",toDb.wine(m));};
  const addNote=async n=>{setNotes(p=>[...p,n]);await db.upsert("tasting_notes",toDb.note(n));};
  const delNote=async id=>{setNotes(p=>p.filter(x=>x.id!==id));await db.del("tasting_notes",id);};
  const setProfile=async p=>{setProfileState(p);await db.saveProfile(p);};

  const CSS=makeCSS(dark);

  if(!splashDone)return(
    <div style={{...cssVars,background:"#0C0202",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <style>{CSS}</style>
      <div style={{textAlign:"center",animation:"fadeUp 1s ease"}}>
        <div style={{marginBottom:16,opacity:0.9}}><Icon n="wine" size={52} color="#9B2335"/></div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:58,fontWeight:800,color:"#EDE6E0",letterSpacing:"-2px",lineHeight:1}}>Vino</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,color:"rgba(237,230,224,0.35)",marginTop:8,letterSpacing:"5px",textTransform:"uppercase"}}>Personal Cellar</div>
        {ready&&<div style={{marginTop:40,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:20,fontWeight:500,color:"rgba(237,230,224,0.7)",animation:"fadeUp 0.8s 0.3s ease both"}}>Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}, <span style={{color:"#C47060"}}>{DEFAULT_PROFILE.name}</span></div>}
      </div>
    </div>
  );

  return(
    <div style={{...cssVars,background:"var(--bg)",height:"100vh",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--text)",maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column",overflow:"hidden",position:"fixed",left:"50%",transform:"translateX(-50%)",width:"100%"}}>
      <style>{CSS}</style>
      <div style={{flex:1,overflowY:"auto",overflowX:"hidden",padding:"52px 20px 96px",animation:"fadeUp 0.3s ease",WebkitOverflowScrolling:"touch"}}>
        {tab==="collection"&&<CollectionScreen wines={wines} onAdd={addWine} onUpdate={updWine} onDelete={delWine}/>}
        {tab==="wishlist"&&<WishlistScreen wishlist={wishlist} onAdd={addWish} onUpdate={updWish} onDelete={delWish} onMove={moveToCol}/>}
        {tab==="ai"&&<AIScreen wines={wines}/>}
        {tab==="notes"&&<NotesScreen wines={wines} notes={notes} onAdd={addNote} onDelete={delNote}/>}
        {tab==="profile"&&<ProfileScreen wines={wines} wishlist={wishlist} notes={notes} theme={themeMode} setTheme={setThemeMode} profile={profile} setProfile={setProfile}/>}
      </div>
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:dark?"rgba(12,10,10,0.92)":"rgba(247,244,242,0.92)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderTop:`1px solid ${dark?"rgba(255,255,255,0.06)":"rgba(0,0,0,0.07)"}`,padding:"10px 0 22px",zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-around"}}>
          {TABS.map(tb=>{const active=tab===tb.id;return(
            <button key={tb.id} onClick={()=>setTab(tb.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",padding:"4px 12px",color:active?"#9B2335":"var(--sub)",transition:"color 0.18s",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              <div style={{transform:active?"scale(1.1)":"scale(1)",transition:"transform 0.18s"}}><Icon n={tb.ic} size={22} color={active?"#9B2335":"var(--sub)"}/></div>
              <span style={{fontSize:9.5,fontWeight:active?700:500,letterSpacing:"0.3px"}}>{tb.label}</span>
              <div style={{width:4,height:4,borderRadius:"50%",background:active?"#9B2335":"transparent",transition:"background 0.18s"}}/>
            </button>
          );})}
        </div>
      </div>
    </div>
  );
}
