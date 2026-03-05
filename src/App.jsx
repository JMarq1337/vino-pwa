import { useState, useEffect, useCallback, useRef, useId } from "react";
import { wineHoldings2021 } from "./data/wineHoldings2021";

/* ── SUPABASE ─────────────────────────────────────────────────── */
const SUPA_URL = "https://dfnvmwoacprkhxfbpybv.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmbnZtd29hY3Bya2h4ZmJweWJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MTkwNTksImV4cCI6MjA4NzM5NTA1OX0.40VqzdfZ9zoJitgCTShNiMTOYheDRYgn84mZXX5ZECs";
const supa = t => `${SUPA_URL}/rest/v1/${t}`;
const BH = { "Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}` };
const UH = { ...BH, "Prefer":"resolution=merge-duplicates,return=minimal" };

const db = {
  async get(t) {
    try {
      let r = await fetch(`${supa(t)}?order=created_at`,{headers:BH});
      if(!r.ok) r = await fetch(supa(t),{headers:BH});
      return r.ok?await r.json():[];
    }
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
    try {
      // Try full payload first (for extended schema), then fall back to base schema.
      const fullPayload={name:p.name,description:p.description,avatar:p.avatar,surname:p.surname||"",cellar_name:p.cellarName||"",bio:p.bio||"",country:p.country||"",profile_bg:p.profileBg||""};
      const basePayload={name:p.name,description:p.description,avatar:p.avatar};
      const tryWrite = async payload => {
        const patchHeaders={...BH,"Prefer":"return=representation"};
        const rPatch=await fetch(`${supa("profile")}?id=eq.1`,{method:"PATCH",headers:patchHeaders,body:JSON.stringify(payload)});
        if(rPatch.ok){
          const rows=await rPatch.json().catch(()=>[]);
          if(Array.isArray(rows)&&rows.length>0) return true;
        }
        const patchErr=await rPatch.text();
        const rPost=await fetch(`${supa("profile")}?on_conflict=id`,{method:"POST",headers:patchHeaders,body:JSON.stringify({id:1,...payload})});
        if(rPost.ok) return true;
        const postErr=await rPost.text();
        console.error("saveProfile failed", { patchErr, postErr });
        return false;
      };

      if(await tryWrite(fullPayload)) return true;
      return await tryWrite(basePayload);
    }catch(e){console.error("saveProfile err",e);return false;}
  },
  async getProfile() {
    try {
      let r=await fetch(`${supa("profile")}?id=eq.1`,{headers:BH});
      const d=r.ok?await r.json():[]; const p=d[0]||null; if(!p)return null;
      return{name:p.name,description:p.description,avatar:p.avatar||null,surname:p.surname||"",cellarName:p.cellar_name||"",bio:p.bio||"",country:p.country||"",profileBg:p.profile_bg||""};
    }
    catch{return null;}
  },
  async listAudits(){
    try{
      const r=await fetch(`${supa("audits")}?order=updated_at.desc`,{headers:BH});
      if(!r.ok) return {ok:false,rows:[],error:await r.text()};
      return {ok:true,rows:await r.json()};
    }catch(e){
      return {ok:false,rows:[],error:String(e)};
    }
  },
  async upsertAudit(row){
    try{
      const r=await fetch(supa("audits"),{method:"POST",headers:UH,body:JSON.stringify(row)});
      if(!r.ok) return {ok:false,error:await r.text()};
      return {ok:true};
    }catch(e){
      return {ok:false,error:String(e)};
    }
  },
  async delAudit(id){
    try{
      const r=await fetch(`${supa("audits")}?id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:BH});
      if(!r.ok) return {ok:false,error:await r.text()};
      return {ok:true};
    }catch(e){
      return {ok:false,error:String(e)};
    }
  },
  async listGrapeAliases(){
    try{
      const r=await fetch(`${supa("grape_aliases")}?select=alias,wine_type`,{headers:BH});
      if(!r.ok) return {ok:false,rows:[],error:await r.text()};
      return {ok:true,rows:await r.json()};
    }catch(e){
      return {ok:false,rows:[],error:String(e)};
    }
  },
  async upsertGrapeAlias(row){
    try{
      const r=await fetch(supa("grape_aliases"),{method:"POST",headers:UH,body:JSON.stringify(row)});
      if(!r.ok) return {ok:false,error:await r.text()};
      return {ok:true};
    }catch(e){
      return {ok:false,error:String(e)};
    }
  }
};

const META_PREFIX = "[[VINO_META]]";
const EXCEL_IMPORT_FLAG = "vino_excel_seed_v1";
const EXCEL_RESTORE_FLAG = "vino_excel_restore_v1";
const CACHE_KEY = "vino_local_cache_v2";
const SAVED_LOCATIONS_KEY = "vino_saved_locations_v1";
const DELETED_WINES_KEY = "vino_deleted_wines_v1";
const AUDITS_KEY = "vino_audits_v1";
const ACCENTS = {
  wine:{id:"wine",label:"Wine Red",accent:"#9B2335",accentLight:"#F08FA0"},
  ocean:{id:"ocean",label:"Ocean Blue",accent:"#1E5BB8",accentLight:"#7EB6FF"},
  emerald:{id:"emerald",label:"Emerald",accent:"#1F7A55",accentLight:"#7FD3AF"},
  amber:{id:"amber",label:"Amber Gold",accent:"#A86A12",accentLight:"#E7B86A"},
  plum:{id:"plum",label:"Plum",accent:"#6A2E8D",accentLight:"#C29AE8"},
};
const COLOR_THEMES = [
  { id:"wine", label:"Wine Red", profileBg:"linear-gradient(135deg,#3A0813 0%,#9B2335 52%,#E05F77 100%)" },
  { id:"ocean", label:"Ocean Blue", profileBg:"linear-gradient(135deg,#0A1E4A 0%,#1E5BB8 52%,#77AFFF 100%)" },
  { id:"emerald", label:"Emerald", profileBg:"linear-gradient(135deg,#0C2E20 0%,#1F7A55 52%,#63C49A 100%)" },
  { id:"amber", label:"Amber Gold", profileBg:"linear-gradient(135deg,#3A2209 0%,#A86A12 52%,#E6B05A 100%)" },
  { id:"plum", label:"Plum", profileBg:"linear-gradient(135deg,#2D0F46 0%,#6A2E8D 52%,#B888DF 100%)" },
];
const THEME_BY_ID = Object.fromEntries(COLOR_THEMES.map(t=>[t.id,t]));
const detectAccentFromProfileBg = bg => COLOR_THEMES.find(t=>t.profileBg===bg)?.id || null;
const EXCEL_STORAGE_LOCATION_MAP = Object.fromEntries(
  (wineHoldings2021.storageLocations||[])
    .map(([code,label])=>[(code||"").toUpperCase(),(label||"").trim()])
);
const STORAGE_CODE_ALIASES = { K:"WS", O:"OWS" };
const PRESET_LOCATIONS = ["Home","Office","Kennards"];
const KENNARDS_SECTIONS = ["Cube","Top shelf","Bottom shelf"];
const labelForStorageCode = rawCode => {
  const code=(rawCode||"").trim().toUpperCase();
  if(!code)return "";
  return EXCEL_STORAGE_LOCATION_MAP[code] || EXCEL_STORAGE_LOCATION_MAP[STORAGE_CODE_ALIASES[code]||""] || "";
};
const canonicalLocationLabel = value => {
  const key=(value||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  if(!key) return "";
  if(["ws","k","wine storage unit","kennards","cellar"].includes(key)) return "Kennards";
  if(["o","ows","office"].includes(key)) return "Office";
  if(["h","home","home wine fridge","home fridge"].includes(key)) return "Home";
  return "";
};
const normalizeKennardsSection = value => {
  const cleaned=(value||"").trim().replace(/\s+/g," ");
  if(!cleaned)return "";
  const key=cleaned.toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  if(key.includes("cube")) return "Cube";
  if(key.includes("top")) return "Top shelf";
  if(key.includes("bottom")) return "Bottom shelf";
  return cleaned;
};
const safeNum = v => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const normalizeLocation = value => {
  const cleaned=(value||"").trim().replace(/\s+/g," ");
  if(!cleaned)return "";
  const mappedLabel=labelForStorageCode(cleaned);
  const normalized=(canonicalLocationLabel(mappedLabel||cleaned)||(mappedLabel||cleaned)).trim();
  if(normalized.toLowerCase()==="custom")return "";
  return normalized.length===1?normalized.toUpperCase():normalized;
};
const locationKey = value => normalizeLocation(value).toLowerCase();
const dedupeLocations = values => {
  const map=new Map();
  (values||[]).forEach(value=>{
    const label=normalizeLocation(value);
    if(!label)return;
    const key=locationKey(label);
    if(!map.has(key)) map.set(key,label);
  });
  return [...map.values()];
};
const canonicalLocation = (value,knownLocations=[]) => {
  const label=normalizeLocation(value);
  if(!label) return "";
  const key=locationKey(label);
  const existing=(knownLocations||[]).find(loc=>locationKey(loc)===key);
  return existing||label;
};
const formatWineLocation = wine => {
  const location=normalizeLocation(wine?.location||"");
  if(!location) return "";
  const section=location==="Kennards" ? normalizeKennardsSection(wine?.cellarMeta?.locationSection||"") : "";
  const slot=(wine?.locationSlot||"").toString().trim();
  return [location,section,slot].filter(Boolean).join(" · ");
};
const excelSerialToIso = serial => {
  const n=safeNum(serial);
  if(!n||n<=0) return "";
  const ms = Math.round((n-25569)*86400*1000);
  const d = new Date(ms);
  if(Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0,10);
};
const hexToRgb = hex => {
  const raw=(hex||"").replace("#","");
  if(raw.length!==6)return "155,35,53";
  const r=parseInt(raw.slice(0,2),16);
  const g=parseInt(raw.slice(2,4),16);
  const b=parseInt(raw.slice(4,6),16);
  return `${r},${g},${b}`;
};
const darkenHex = (hex, factor=0.55) => {
  const raw=(hex||"").replace("#","");
  if(raw.length!==6) return "#1D0C10";
  const clamp=v=>Math.max(0,Math.min(255,v));
  const r=clamp(Math.round(parseInt(raw.slice(0,2),16)*(1-factor)));
  const g=clamp(Math.round(parseInt(raw.slice(2,4),16)*(1-factor)));
  const b=clamp(Math.round(parseInt(raw.slice(4,6),16)*(1-factor)));
  return `#${[r,g,b].map(v=>v.toString(16).padStart(2,"0")).join("")}`;
};
const ratingFromHalliday = score => {
  const n = safeNum(score);
  if(!n) return 0;
  if(n>=96) return 5;
  if(n>=93) return 4;
  if(n>=90) return 3;
  if(n>=87) return 2;
  if(n>=84) return 1;
  return 0;
};
const parseWineMetaFromNotes = notes => {
  if(!notes || typeof notes!=="string" || !notes.startsWith(META_PREFIX)) return { plain: notes||"", meta: null };
  const nl = notes.indexOf("\n");
  const metaRaw = nl===-1 ? notes.slice(META_PREFIX.length) : notes.slice(META_PREFIX.length, nl);
  try{
    const meta = JSON.parse(metaRaw);
    const plain = nl===-1 ? "" : notes.slice(nl+1);
    return { plain, meta };
  }catch{
    return { plain: notes, meta: null };
  }
};
const encodeWineNotes = (plain,meta) => {
  const clean = plain||"";
  if(!meta) return clean;
  const hasMeta = Object.values(meta).some(v=>v!==null&&v!==""&&v!==undefined);
  if(!hasMeta) return clean;
  return `${META_PREFIX}${JSON.stringify(meta)}${clean?`\n${clean}`:""}`;
};
const REVIEWER_INITIALS_MAP = Object.fromEntries(
  (wineHoldings2021.reviewers||[])
    .slice(1)
    .map(row=>[(row?.[0]||"").toString().trim().toUpperCase(),(row?.[1]||"").toString().trim()])
    .filter(([k,v])=>k&&v)
);
const normalizeReviewEntry = entry => ({
  reviewer:(entry?.reviewer||"").toString().trim(),
  rating:(entry?.rating||"").toString().trim(),
  text:(entry?.text||"").toString().trim(),
});
const hasReviewEntryValue = entry => {
  const e=normalizeReviewEntry(entry);
  return !!(e.reviewer||e.rating||e.text);
};
const normalizeOtherReviews = entries => (entries||[]).map(normalizeReviewEntry).filter(hasReviewEntryValue);
const parseOtherRatingsString = raw => {
  const txt=(raw||"").toString().trim();
  if(!txt) return [];
  return txt
    .split(/\s*[;|]\s*/)
    .map(token=>token.trim())
    .filter(Boolean)
    .map(token=>{
      const dashMatch=token.match(/^(.+?)\s*-\s*(.+)$/);
      let rating="",reviewer="";
      if(dashMatch){
        rating=(dashMatch[1]||"").trim();
        reviewer=(dashMatch[2]||"").trim();
      }else{
        reviewer=token;
      }
      const upper=reviewer.toUpperCase();
      if(REVIEWER_INITIALS_MAP[upper]) reviewer=REVIEWER_INITIALS_MAP[upper];
      return normalizeReviewEntry({reviewer,rating,text:""});
    })
    .filter(hasReviewEntryValue);
};
const serializeOtherRatings = entries => normalizeOtherReviews(entries)
  .map(entry=>[entry.rating,entry.reviewer].filter(Boolean).join(" - "))
  .filter(Boolean)
  .join("; ");
const toJournalState = wine => {
  const primary=normalizeReviewEntry({
    reviewer:wine?.reviewPrimaryReviewer||"",
    rating:wine?.reviewPrimaryRating||"",
    text:wine?.review||"",
  });
  const otherReviews=normalizeOtherReviews(
    (Array.isArray(wine?.otherReviews)&&wine.otherReviews.length)
      ? wine.otherReviews
      : parseOtherRatingsString(wine?.tastingNotes||"")
  );
  const personalNotes=(wine?.notes||"").toString();
  return { primary, otherReviews, personalNotes };
};
const reviewerSuggestionsFromWines = wines => {
  const names=new Map();
  Object.values(REVIEWER_INITIALS_MAP).forEach(name=>{
    const v=(name||"").toString().trim();
    if(v) names.set(v.toLowerCase(),v);
  });
  (wines||[]).forEach(w=>{
    const journal=toJournalState(w);
    const primary=(journal.primary?.reviewer||"").toString().trim();
    if(primary) names.set(primary.toLowerCase(),primary);
    (journal.otherReviews||[]).forEach(r=>{
      const reviewer=(r?.reviewer||"").toString().trim();
      if(reviewer) names.set(reviewer.toLowerCase(),reviewer);
    });
  });
  return [...names.values()].sort((a,b)=>a.localeCompare(b));
};
const wineReadiness = w => {
  const currentYear = new Date().getFullYear();
  const m=w.cellarMeta||{};
  const s=safeNum(m.drinkStart);
  const e=safeNum(m.drinkEnd);
  if(!s&&!e) return {key:"none",label:"No window",color:"var(--sub)"};
  if(s&&currentYear<s) return {key:"early",label:`Wait until ${s}`,color:"#2A5AB8"};
  if(e&&currentYear>e) return {key:"late",label:`Past ${e}`,color:"#B83232"};
  return {key:"ready",label:"Ready to drink",color:"#2F855A"};
};
const getTotalPurchased = wine => {
  const left=Math.max(0,Math.round(safeNum(wine?.bottles)||0));
  const metaTotal=safeNum(wine?.cellarMeta?.totalPurchased);
  if(metaTotal==null) return left;
  return Math.max(left,Math.round(metaTotal));
};
const getConsumedBottles = wine => Math.max(0,getTotalPurchased(wine)-Math.max(0,Math.round(safeNum(wine?.bottles)||0)));
const wineAddedTimestamp = wine => {
  const raw=(wine?.cellarMeta?.addedDate||wine?.datePurchased||"").toString().slice(0,10);
  if(!raw) return 0;
  const ts=Date.parse(`${raw}T00:00:00`);
  return Number.isFinite(ts)?ts:0;
};
const todayIsoLocal = ()=>{
  const d=new Date();
  const y=d.getFullYear();
  const m=String(d.getMonth()+1).padStart(2,"0");
  const day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
};
const readCache=()=>{
  try{
    const raw=localStorage.getItem(CACHE_KEY);
    return raw?JSON.parse(raw):null;
  }catch{return null;}
};
const readSavedLocations=()=>{
  try{
    const raw=localStorage.getItem(SAVED_LOCATIONS_KEY);
    if(!raw)return[];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return dedupeLocations(parsed).filter(loc=>!PRESET_LOCATIONS.some(p=>locationKey(p)===locationKey(loc)));
  }catch{return[];}
};
const readDeletedWines=()=>{
  try{
    const raw=localStorage.getItem(DELETED_WINES_KEY);
    if(!raw)return[];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed
      .filter(item=>item&&item.wine&&item.wine.id)
      .map(item=>({wine:item.wine,deletedAt:item.deletedAt||""}));
  }catch{return[];}
};
const normalizeAuditItem = item => {
  if(!item||!item.wineId) return null;
  return {
    ...item,
    decision:item.decision==="present"||item.decision==="missing"?item.decision:"pending",
    countType:item.countType==="boxes"?"boxes":"bottles",
    countedAmount:Math.max(0,Math.round(safeNum(item.countedAmount)||0)),
    missingAction:item.missingAction==="remove"?"remove":"keep",
    synced:!!item.synced,
    beforeWine:item.beforeWine&&item.beforeWine.id?item.beforeWine:null,
  };
};
const normalizeAuditRecord = a => {
  const rawItems=Object.entries(a.items||{})
    .map(([key,item])=>[key,normalizeAuditItem(item)])
    .filter(([,item])=>!!item);
  return {
    id:a.id,
    name:a.name||"Audit",
    createdAt:a.createdAt||new Date().toISOString(),
    updatedAt:a.updatedAt||a.createdAt||new Date().toISOString(),
    completedAt:a.completedAt||"",
    status:a.status==="completed"?"completed":a.status==="revoked"?"revoked":"in_progress",
    realtimeSync:!!a.realtimeSync,
    locations:Array.isArray(a.locations)?dedupeLocations(a.locations):[],
    items:Object.fromEntries(rawItems),
  };
};
const fromDbAudit = row => normalizeAuditRecord({
  id:row.id,
  name:row.name,
  createdAt:row.created_at,
  updatedAt:row.updated_at,
  completedAt:row.completed_at||"",
  status:row.status,
  realtimeSync:!!row.realtime_sync,
  locations:Array.isArray(row.locations)?row.locations:[],
  items:row.items&&typeof row.items==="object"?row.items:{},
});
const toDbAudit = audit => ({
  id:audit.id,
  name:audit.name,
  status:audit.status,
  realtime_sync:!!audit.realtimeSync,
  locations:Array.isArray(audit.locations)?audit.locations:[],
  items:audit.items||{},
  created_at:audit.createdAt||new Date().toISOString(),
  updated_at:new Date().toISOString(),
  completed_at:audit.completedAt||null,
});
const readAudits=()=>{
  try{
    const raw=localStorage.getItem(AUDITS_KEY);
    if(!raw)return[];
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)) return [];
    return parsed
      .filter(a=>a&&a.id&&a.items&&typeof a.items==="object")
      .map(normalizeAuditRecord);
  }catch{return[];}
};

const fromDb = {
  wine: r=>{
    const parsed=parseWineMetaFromNotes(r.notes);
    const metaRaw={...(parsed.meta||{})};
    const journalRaw=metaRaw.journal||{};
    const legacyPrimaryRating = safeNum(metaRaw.hallidayScore);
    const legacyPrimaryReviewer = (legacyPrimaryRating!=null || (r.review||"").trim()) ? "Halliday" : "";
    const legacyOther = parseOtherRatingsString(r.tasting_notes||"");
    const meta={...metaRaw};
    delete meta.journal;
    if(!meta.addedDate){
      if(typeof r.date_purchased==="string"&&r.date_purchased.length>=10) meta.addedDate=r.date_purchased.slice(0,10);
      else if(typeof r.created_at==="string"&&r.created_at.length>=10) meta.addedDate=r.created_at.slice(0,10);
    }
    const primary=normalizeReviewEntry({
      reviewer:journalRaw?.primary?.reviewer||legacyPrimaryReviewer,
      rating:journalRaw?.primary?.rating||((legacyPrimaryRating!=null)?String(legacyPrimaryRating):""),
      text:journalRaw?.primary?.text||r.review||"",
    });
    const otherReviews=normalizeOtherReviews(
      Array.isArray(journalRaw?.otherReviews)&&journalRaw.otherReviews.length
        ? journalRaw.otherReviews
        : legacyOther
    );
    const personalNotes=(journalRaw?.personalNotes??parsed.plain??"").toString();
    return ({
      id:r.id,name:r.name,origin:r.origin,grape:r.grape,alcohol:r.alcohol,vintage:r.vintage,bottles:r.bottles,rating:r.rating,
      notes:personalNotes,cellarMeta:meta,review:primary.text,tastingNotes:r.tasting_notes,datePurchased:r.date_purchased,wishlist:r.wishlist,color:r.color,photo:r.photo,
      location:normalizeLocation(r.location),locationSlot:r.location_slot,wineType:r.wine_type,
      reviewPrimaryReviewer:primary.reviewer,reviewPrimaryRating:primary.rating,otherReviews
    });
  },
  note: r=>({ id:r.id,wineId:r.wine_id,title:r.title,content:r.content,date:r.date })
};
const toDb = {
  wine: w=>{
    const otherReviews=normalizeOtherReviews(w.otherReviews||[]);
    const meta={...(w.cellarMeta||{}),journal:{
      primary:normalizeReviewEntry({reviewer:w.reviewPrimaryReviewer||"",rating:w.reviewPrimaryRating||"",text:w.review||""}),
      otherReviews,
      personalNotes:w.notes||"",
    }};
    return {
      id:w.id,name:w.name,origin:w.origin,grape:w.grape,alcohol:w.alcohol,vintage:w.vintage,bottles:w.bottles,rating:w.rating,
      notes:encodeWineNotes(w.notes,meta),review:w.review,tasting_notes:serializeOtherRatings(otherReviews),date_purchased:w.datePurchased,wishlist:w.wishlist||false,
      color:w.color,photo:w.photo,location:normalizeLocation(w.location),location_slot:w.locationSlot,wine_type:w.wineType
    };
  },
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

const normalizeWineText = (text="") => (text||"")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g,"")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g," ")
  .trim();
const hasAnyHint = (text,hints=[]) => hints.some(h => text.includes(h));
const WINE_TYPES = ["Red","White","Rosé","Sparkling","Dessert","Fortified","Other"];
const WINE_TYPES_SET = new Set(WINE_TYPES);
let GRAPE_ALIAS_CACHE = {};
const setGrapeAliasCache = map => { GRAPE_ALIAS_CACHE = map||{}; };
const splitGrapeAliases = (raw="") => {
  const base=normalizeWineText(raw);
  if(!base) return [];
  const parts=base
    .split(/\s*\/\s*|\s*&\s*|\s*\+\s*|\s*,\s*|\s*;\s*|\sand\s|\swith\s/i)
    .map(s=>normalizeWineText(s))
    .filter(Boolean);
  return [...new Set([base,...parts].filter(Boolean))];
};
const buildAliasMapFromRows = rows => {
  const map={};
  (rows||[]).forEach(row=>{
    const alias=normalizeWineText(row?.alias||"");
    const type=(row?.wine_type||"").trim();
    if(!alias||!WINE_TYPES_SET.has(type)||type==="Other") return;
    map[alias]=type;
  });
  return map;
};
const deriveAliasMapFromWines = wines => {
  const map={};
  (wines||[]).forEach(w=>{
    const aliases=splitGrapeAliases(w?.grape||"");
    if(!aliases.length) return;
    const inferred=guessWineType(w?.grape||"",w?.name||"",map);
    if(!inferred||inferred==="Other") return;
    aliases.forEach(alias=>{if(!map[alias]) map[alias]=inferred;});
  });
  return map;
};
const aliasWineTypeFromMap = (grape="",name="",aliasMap={}) => {
  const map=aliasMap||{};
  const aliases=splitGrapeAliases(grape);
  if(normalizeWineText(name).includes("champagne")) aliases.push("champagne");
  for(const alias of aliases){
    const type=map[alias];
    if(WINE_TYPES_SET.has(type) && type!=="Other") return type;
  }
  return "";
};
const guessWineType = (grape="",name="",aliasMap=GRAPE_ALIAS_CACHE) => {
  const aliasType=aliasWineTypeFromMap(grape,name,aliasMap);
  if(aliasType) return aliasType;
  const g=normalizeWineText(`${grape} ${name}`);
  if(!g)return"Other";
  const sparklingHints=["champagne","sparkling","prosecco","cava","cremant","blanc de blancs","blanc de noirs"];
  const roseHints=[" rose "," rosee ","rosato","rosado"];
  const fortifiedHints=[" port ","vintage port","tawny","sherry","madeira","pedro ximinez","pedro ximenez","px"];
  const dessertHints=["sauternes","dessert","ice wine","late harvest","botrytis","tba","tokaji","muscat de beaumes de venise"];
  const whiteHints=["chardonnay","sauvignon blanc","riesling","pinot gris","pinot grigio","viognier","chenin","gruner veltliner","gruener veltliner","welschriesling","gewurztraminer","traminer","fiano","federspiel","wachau","semillon","albarino","albariño","soave","garganega","marsanne","roussanne","vermentino","arneis","picpoul"];
  const redHints=["pinot noir","cabernet","merlot","shiraz","syrah","malbec","tempranillo","nebbiolo","sangiovese","grenache","zinfandel","barolo","beaujolais","morgon","fronsac","petit verdot","primitivo","saint joseph","st joseph","chateauneuf du pape","chateau neuf du pape","gsm","red blend","hermitage","cotes du rousillon","cotes du roussillon","mangan","maclura","mont redon"];
  if(hasAnyHint(g,sparklingHints))return"Sparkling";
  if(hasAnyHint(` ${g} `,roseHints))return"Rosé";
  if(hasAnyHint(` ${g} `,fortifiedHints))return"Fortified";
  if(hasAnyHint(g,dessertHints))return"Dessert";
  if(hasAnyHint(g,whiteHints))return"White";
  if(hasAnyHint(g,redHints))return"Red";
  if(g.includes("muscat"))return"Dessert";
  if(g.includes("amber"))return"White";
  return"Other";
};
const resolveWineType = wine => (wine?.wineType && wine.wineType!=="Other")
  ? wine.wineType
  : guessWineType(wine?.grape||"",wine?.name||"");
const normalizeVarietal = (value="") => (value||"").replace(/\s+/g," ").trim();
const resolveVarietal = wine => {
  const hint=normalizeWineText(`${wine?.name||""} ${wine?.origin||""} ${wine?.grape||""}`);
  if(hint.includes("champagne")) return "Champagne";
  const grape=normalizeVarietal(wine?.grape||"");
  if(grape) return grape;
  const type=resolveWineType(wine);
  if(type==="Sparkling") return "Sparkling";
  if(type==="Rosé") return "Rosé";
  if(type==="Dessert") return "Dessert";
  if(type==="Fortified") return "Fortified";
  if(type==="Red") return "Red Blend";
  if(type==="White") return "White Blend";
  return "Unknown";
};
const wineIdentitySignature = wine => {
  const section = normalizeKennardsSection(wine?.cellarMeta?.locationSection||"");
  return [
    normalizeWineText(wine?.name||""),
    String(wine?.vintage||""),
    normalizeWineText(wine?.origin||""),
    normalizeWineText(resolveVarietal(wine)||wine?.grape||""),
    locationKey(wine?.location||""),
    normalizeWineText(section),
    normalizeWineText((wine?.locationSlot||"").toString()),
  ].join("|");
};

/* ── HELPERS ──────────────────────────────────────────────────── */
const uid = ()=>Math.random().toString(36).slice(2,9);
const fuzzySearch = q=>{
  if(!q||q.length<2)return[];
  const lq=q.toLowerCase();
  return WINE_DB.filter(w=>w.name.toLowerCase().includes(lq)||w.grape.toLowerCase().includes(lq)||w.origin.toLowerCase().includes(lq)).slice(0,7);
};
const LOCATIONS=PRESET_LOCATIONS;
const fmt=d=>d?new Date(d).toLocaleDateString("en-AU",{month:"short",year:"numeric"}):null;
const COUNTRY_SET=new Set(["Australia","Austria","France","Germany","Italy","Spain","Portugal","New Zealand","USA","Argentina","Chile","South Africa"]);
const COUNTRY_ALIAS_MAP={
  "United States":"USA",
  "United States of America":"USA",
  "US":"USA",
  "U.S.":"USA",
  "U.S.A.":"USA",
  "NZ":"New Zealand",
  "S. Africa":"South Africa",
};
const REGION_ALIAS_MAP={
  "Coonwarra":"Coonawarra",
  "Langhorne Creet":"Langhorne Creek",
  "Mornington":"Mornington Peninsula",
  "Bellarine":"Geelong",
  "Cotes du Rhone":"Cotes du Rhone",
  "Rhone Valley":"Rhone",
  "St Emilion":"Saint-Émilion",
  "Saint Emilion":"Saint-Émilion",
};
const REGION_COUNTRY_MAP={
  "Adelaide Hills":"Australia","Barossa":"Australia","Clare Valley":"Australia","Coonawarra":"Australia","Eden Valley":"Australia","Geelong":"Australia","Gippsland":"Australia","Grampians":"Australia","Great Southern":"Australia","Heathcote":"Australia","Hunter Valley":"Australia","Kangaroo Island":"Australia","King Valley":"Australia","Langhorne Creek":"Australia","Macedon Ranges":"Australia","Margaret River":"Australia","McLaren Vale":"Australia","Mornington Peninsula":"Australia","Mudgee":"Australia","Tasmania":"Australia","Yarra Valley":"Australia","3608":"Australia",
  "Bordeaux":"France","Pomerol":"France","Pauillac":"France","Saint-Émilion":"France","Burgundy":"France","Champagne":"France","Cotes du Rhone":"France","Rhone":"France","Pessac-Leognan":"France","Provence":"France","Sauternes":"France",
  "Marlborough":"New Zealand","Martinborough":"New Zealand","Central Otago":"New Zealand",
  "Wachau":"Austria",
  "Piedmont":"Italy","Tuscany":"Italy","Bolgheri":"Italy",
  "Rioja":"Spain","Ribera del Duero":"Spain",
  "Napa Valley":"USA","Santa Cruz Mountains":"USA",
  "Mendoza":"Argentina",
  "Maipo Valley":"Chile",
  "Mosel":"Germany",
  "Douro":"Portugal",
  "Stellenbosch":"South Africa",
};
const normalizeRegionName = (value="") => REGION_ALIAS_MAP[(value||"").trim()] || (value||"").trim();
const normalizeCountryName = (value="") => {
  const trimmed=(value||"").trim();
  if(!trimmed) return "";
  const canonical=COUNTRY_ALIAS_MAP[trimmed]||trimmed;
  return COUNTRY_SET.has(canonical)?canonical:"";
};
const splitOrigin = (origin="") => (origin||"").split(",").map(s=>s.trim()).filter(Boolean);
const deriveRegionCountry = (input="") => {
  const parts = splitOrigin(input);
  if(parts.length===0) return { region:"", country:"", origin:"" };
  const normalizedParts=parts.map(normalizeRegionName);
  const countries=normalizedParts.map(normalizeCountryName);
  const explicitCountry=countries.find(Boolean)||"";
  const firstCountry=countries[0]||"";

  let region=normalizedParts.find((part,idx)=>!countries[idx])||"";
  let country=(region?REGION_COUNTRY_MAP[region]:"")||explicitCountry;

  if(firstCountry && normalizedParts[1] && !countries[1]){
    region=normalizedParts[1];
    country=(REGION_COUNTRY_MAP[region]||firstCountry);
  }
  if(normalizeCountryName(region)){
    region="";
  }
  if(region && !country){
    country=REGION_COUNTRY_MAP[region]||"";
  }
  if(!region && !country){
    const one=normalizedParts[0]||"";
    const oneCountry=normalizeCountryName(one);
    if(oneCountry){
      country=oneCountry;
    }else{
      region=one;
      country=REGION_COUNTRY_MAP[one]||"";
    }
  }
  return { region, country, origin:[region,country].filter(Boolean).join(", ") };
};

/* ── SEED DATA ────────────────────────────────────────────────── */
const SOURCE_CELLAR_ROWS=(wineHoldings2021.cellar||[]).filter(r=>{
  const winery=(r.winery||"").trim();
  const label=(r.label||"").trim();
  const varietal=(r.varietal||"").trim();
  const remaining=Math.max(0,safeNum(r.remaining_num??r.remaining)||0);
  return !!(winery||label||varietal||remaining>0);
});
const SEED_WINES=SOURCE_CELLAR_ROWS.map((r,i)=>{
  const winery=(r.winery||"").trim();
  const label=(r.label||"").trim();
  const varietal=(r.varietal||"").trim();
  const year=safeNum(r.year_num??r.year);
  const remaining=Math.max(0,safeNum(r.remaining_num??r.remaining)||0);
  const consumedFromSheet=Math.max(0,safeNum(r.cons_num??r.cons)||0);
  const totalPurchasedSeed=Math.max(remaining,remaining+consumedFromSheet);
  const name=[winery,label].filter(Boolean).join(" ").trim()||[varietal,year||""].filter(Boolean).join(" ").trim()||`Wine ${i+1}`;
  const grape=varietal||"";
  const purchaseDate = r.p_date ? excelSerialToIso(r.p_date) : (r.acquired_date_iso||"");
  const wineType=guessWineType(grape,name);
  const typeColor=(WINE_TYPE_COLORS[wineType]||WINE_TYPE_COLORS.Other).dot;
  const hallidayScore=safeNum(r.halliday);
  const otherRatingsParsed=parseOtherRatingsString(r.other_ratings||"");
  const otherReviewTexts=[r.other_review_1||"",r.other_review_2||"",r.other_review_3||""].map(v=>v.toString().trim());
  const otherReviewCount=Math.max(otherRatingsParsed.length,otherReviewTexts.filter(Boolean).length);
  const otherReviews=Array.from({length:otherReviewCount}).map((_,idx)=>{
    const base=otherRatingsParsed[idx]||{};
    return normalizeReviewEntry({
      reviewer:base.reviewer||"",
      rating:base.rating||"",
      text:otherReviewTexts[idx]||"",
    });
  }).filter(hasReviewEntryValue);
  const cellarMeta={
    drinkStart:safeNum(r.drink_start_num??r.drinking_window_start),
    drinkEnd:safeNum(r.drink_end_num??r.drinking_window_end),
    pricePerBottle:safeNum(r.price_per_bottle_num??r.price_per_bottle??r.btl_price),
    rrp:safeNum(r.rrp_num??r.rrp??r.rrp_2),
    totalPaid:safeNum(r.total_paid_num??r.total_paid??r.total_cost),
    insuranceValue:safeNum(r.total_insurance_num??r.total_ins_value),
    supplier:r.supplier||r.from||"",
    sourceStorage:r.where_stored||"",
    hallidayScore,
    otherRatings:r.other_ratings||"",
    rawReviewLink:r.reviews||r.webpage||"",
    pDateRaw:r.p_date||"",
    locationSection:normalizeKennardsSection(r.field||""),
    totalPurchased:totalPurchasedSeed,
    addedDate:purchaseDate||todayIsoLocal(),
  };
  const geo = deriveRegionCountry(r.region||"");
  return{
    id:`xl-${r.row_index||i+1}`,
    name,
    origin:geo.origin,
    grape,
    alcohol:0,
    vintage:year||null,
    bottles:remaining,
    rating:ratingFromHalliday(r.halliday),
    notes:(r.notes||"").toString(),
    cellarMeta,
    review:r.halliday_review||"",
    reviewPrimaryReviewer:(hallidayScore!=null||((r.halliday_review||"").trim()))?"Halliday":"",
    reviewPrimaryRating:hallidayScore!=null?String(hallidayScore):"",
    otherReviews,
    tastingNotes:serializeOtherRatings(otherReviews),
    datePurchased:purchaseDate,
    wishlist:false,
    color:typeColor,
    photo:null,
    location:normalizeLocation(r.where_stored||"Kennards"),
    locationSlot:r.box_no||null,
    wineType,
  };
});
const SEED_WISHLIST=[
  {id:"w1",name:"Opus One",origin:"Napa Valley, USA",grape:"Cabernet Sauvignon blend",alcohol:14.5,vintage:2019,notes:"Dream bottle.",wishlist:true,color:"#1A1A2E",photo:null,wineType:"Red"},
  {id:"w2",name:"Dom Pérignon",origin:"Champagne, France",grape:"Chardonnay / Pinot Noir",alcohol:12.5,vintage:2013,notes:"For a very special celebration.",wishlist:true,color:"#8B7355",photo:null,wineType:"Sparkling"},
];
const SEED_TOTAL_BY_ID=Object.fromEntries(SEED_WINES.map(w=>[w.id,safeNum(w.cellarMeta?.totalPurchased)]));
const SEED_PRICING_BY_ID=Object.fromEntries(SEED_WINES.map(w=>[
  w.id,
  {
    paidPerBottle:safeNum(w.cellarMeta?.pricePerBottle),
    rrpPerBottle:safeNum(w.cellarMeta?.rrp),
    totalPaid:safeNum(w.cellarMeta?.totalPaid),
  }
]));
const SEED_NOTES=[
  {id:"n1",wineId:"s1",title:"Christmas Dinner 2023",content:"Opened with family. Paired with slow-roasted lamb. Absolutely magical.",date:"2023-12-25"},
  {id:"n2",wineId:"s3",title:"Summer BBQ Pairings",content:"Incredible with fresh prawns on the barbie. Also tried with grilled snapper — even better.",date:"2023-11-12"},
];
const DEFAULT_PROFILE={name:"Neale",description:"Winemaker & Collector",avatar:null,accent:"wine"};

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
  rewind:"M4 11H1l3-3m-3 3 3 3M4 11a8 8 0 1 1 2.4 5.6",
  audit:"M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
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

const BrandLogo=({size=42,variant="color"})=>{
  const uid=useId().replace(/[:]/g,"");
  const ids={
    berry:`gBerry-${uid}`,
    stem:`gStem-${uid}`,
    leaf:`gLeaf-${uid}`,
    drop:`gDrop-${uid}`,
  };
  const mono=variant==="mono";
  const stemStroke=mono?"rgba(255,255,255,0.74)":`url(#${ids.stem})`;
  const stemHighlight=mono?"rgba(255,255,255,0.26)":"rgba(255,244,220,0.28)";
  const vineStroke=mono?"rgba(255,255,255,0.66)":"#7A4A24";
  const leafFill=mono?"rgba(255,255,255,0.14)":`url(#${ids.leaf})`;
  const leafStroke=mono?"rgba(255,255,255,0.68)":"#2A6D2A";
  const leafVein=mono?"rgba(255,255,255,0.44)":"rgba(33,92,38,0.65)";
  const berries=[
    [22,29],[30,29],[38,29],[46,29],
    [26,36],[34,36],[42,36],
    [22,43],[30,43],[38,43],[46,43],
    [26,50],[34,50],[42,50],
    [30,57],[38,57],
    [34,64]
  ];
  return(
    <svg width={size} height={size} viewBox="0 0 72 72" aria-hidden="true">
      <defs>
        <radialGradient id={ids.berry} cx="32%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#C83B8C"/>
          <stop offset="52%" stopColor="#932E6B"/>
          <stop offset="100%" stopColor="#4A123A"/>
        </radialGradient>
        <linearGradient id={ids.stem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8A5B2D"/>
          <stop offset="100%" stopColor="#5E3A1A"/>
        </linearGradient>
        <linearGradient id={ids.leaf} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#65B33A"/>
          <stop offset="100%" stopColor="#2E7A2F"/>
        </linearGradient>
        <filter id={ids.drop} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.1" floodColor="#2A0D23" floodOpacity="0.3"/>
        </filter>
      </defs>

      <g filter={mono?undefined:`url(#${ids.drop})`}>
        <path d="M35 8.6c2.1 5.8 2.1 10.9 0 16.4" fill="none" stroke={stemStroke} strokeWidth="2.9" strokeLinecap="round"/>
        <path d="M35.7 9.9c.8 3.8.8 7.7-.2 11.2" fill="none" stroke={stemHighlight} strokeWidth="0.92" strokeLinecap="round"/>
        <path d="M35 16.4c6.2-4.7 13.3-4.7 18.9-.3 3.8 3 3.8 7 .4 9.5-3.2 2.3-7.6 1.9-10.3-.9-2.1-2.2-2-4.9.3-6.5 1.9-1.4 4.3-1.1 5.6.6" fill="none" stroke={vineStroke} strokeWidth="1.72" strokeLinecap="round"/>
        <path d="M35 17.1c-3.4-3.5-7.6-5.7-12.5-6.9" fill="none" stroke={stemStroke} strokeWidth="2.08" strokeLinecap="round"/>
        <path d="M20.1 12.1c3.1-2.1 7.2-2.2 10.4-.4 2.3 1.3 4 3.6 4.8 6.4-2.5-.3-4.8.2-6.8 1.5 1.3 1.1 2.3 2.5 3 4.2-3.4 1-6.7.6-9.6-1.1-3.8-2.2-5.4-6.4-1.8-10.6z" fill={leafFill} stroke={leafStroke} strokeWidth="1.1" strokeLinejoin="round"/>
        <path d="M14.2 14.6c3.9-3.1 9.4-3.5 13.8-1 3.1 1.8 5.3 4.8 6.1 8.4-3-.2-5.7.6-8 2.2 2 1.4 3.6 3.3 4.7 5.7-4.5 1.9-9.2 1.7-13.3-.7-4.7-2.8-7.3-7.9-3.3-14.6z" fill={leafFill} stroke={leafStroke} strokeWidth="1.18" strokeLinejoin="round"/>
        <path d="M18.8 16.1c2.3-1.2 5.1-1.3 7.4-.2 1.8.9 3.2 2.3 4.1 4.2-2 .1-3.8.6-5.3 1.6 1.3.8 2.3 1.9 3 3.3-2.6.8-5.1.6-7.3-.6-2.8-1.4-4.1-4.5-1.9-8.3z" fill={mono?"rgba(255,255,255,0.08)":"rgba(255,255,255,0.18)"}/>
        <path d="M24.8 17.9c-.4 3.1-.1 6 1.1 8.8M24.6 19.3c-2.4-.8-4.8-1.9-7.1-3.3M24.9 21.6c-3 1.1-6 1.7-9.2 1.9M25.7 24.2c-1.9 2-3.9 3.7-6.3 5.1" fill="none" stroke={leafVein} strokeWidth="0.92" strokeLinecap="round"/>
      </g>

      <g fill={mono?"rgba(255,255,255,0.14)":`url(#${ids.berry})`} stroke={mono?"rgba(255,255,255,0.65)":"#3E1733"} strokeWidth="1.1">
        {berries.map(([cx,cy],i)=><circle key={i} cx={cx} cy={cy} r="4.65"/>)}
      </g>
      <g fill={mono?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.28)"}>
        {berries.map(([cx,cy],i)=><circle key={`h-${i}`} cx={cx-1.5} cy={cy-1.7} r="1.15"/>)}
      </g>
    </svg>
  );
};

/* ── AI ───────────────────────────────────────────────────────── */
const callAI=async(msg,wines)=>{
  const sys=`You are Vinology, a warm knowledgeable personal wine sommelier. User collection: ${JSON.stringify(wines.filter(w=>!w.wishlist).map(w=>({name:w.name,grape:w.grape,vintage:w.vintage,bottles:w.bottles,rating:w.rating})))}. Be concise, warm, expert. Max 3-4 sentences unless listing.`;
  try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,system:sys,messages:[{role:"user",content:msg}]})});const d=await r.json();return d.content?.[0]?.text||"Having a moment — try again.";}
  catch{return"Connection issue. Please try again.";}
};

/* ── THEME ────────────────────────────────────────────────────── */
const T=dark=>({
  bg:dark?"#0D0A0B":"#F4F0EA",
  surface:dark?"#191315":"#FFFCF8",
  card:dark?"#221A1D":"#FFFFFF",
  border:dark?"rgba(255,255,255,0.08)":"rgba(109,78,58,0.16)",
  text:dark?"#F4ECE6":"#221812",
  sub:dark?"#98877F":"#8A7569",
  inputBg:dark?"#2A2023":"#F7F3EE",
  shadow:dark?"rgba(0,0,0,0.58)":"rgba(74,44,24,0.10)",
});

const makeCSS=dark=>`
  @import url('${FONT}');
  *,*::before,*::after{box-sizing:border-box;-webkit-tap-highlight-color:transparent;margin:0;padding:0;}
  ::-webkit-scrollbar{width:9px;height:9px;}
  ::-webkit-scrollbar-thumb{background:${dark?"rgba(255,255,255,.15)":"rgba(109,78,58,.2)"};border-radius:20px;}
  ::-webkit-scrollbar-track{background:transparent;}
  body{background:${dark?"#0D0A0B":"#F4F0EA"};}
  @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes modalIn{from{opacity:0;transform:scale(0.94)}to{opacity:1;transform:scale(1)}}
  @keyframes blink{0%,80%,100%{opacity:.2;transform:scale(.7)}40%{opacity:1;transform:scale(1)}}
  @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  @keyframes floatUp{0%{opacity:0;transform:translateY(30px)}100%{opacity:1;transform:translateY(0)}}
  @keyframes pulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.05)}}
  @keyframes heroGlassIn{from{opacity:0;transform:translateY(14px) scale(0.985)}to{opacity:1;transform:translateY(0) scale(1)}}
  @keyframes heroPhotoFloat{0%{transform:translateY(12px) scale(0.98)}100%{transform:translateY(0) scale(1)}}
  input,textarea,select{font-family:'Plus Jakarta Sans',sans-serif;font-size:15px;color:${dark?"#F4ECE6":"#221812"};background:${dark?"#241C1E":"#FFFFFF"};border:1.5px solid ${dark?"rgba(255,255,255,0.09)":"rgba(103,75,57,0.16)"};border-radius:13px;padding:12px 14px;width:100%;outline:none;transition:border-color 0.2s,box-shadow 0.2s,transform .12s;-webkit-appearance:none;box-shadow:${dark?"0 2px 10px rgba(0,0,0,.25)":"0 2px 8px rgba(81,45,19,.07)"};}
  input:focus,textarea:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 4px ${dark?"rgba(var(--accentRgb),.2)":"rgba(var(--accentRgb),.12)"};}
  select option{background:${dark?"#201A1A":"#fff"};}
  button{cursor:pointer;font-family:'Plus Jakarta Sans',sans-serif;transition:all .16s ease;}
`;

/* ── PRIMITIVES ───────────────────────────────────────────────── */
const Stars=({value,onChange,size=17})=>(
  <div style={{display:"flex",gap:2}}>
    {[1,2,3,4,5].map(s=>(
      <button key={s} onClick={()=>onChange?.(s===value?0:s)} style={{background:"none",border:"none",padding:"2px",color:s<=value?"#E8A020":"var(--sub)",transition:"transform 0.1s"}}
        onMouseEnter={e=>{if(onChange)e.currentTarget.style.transform="scale(1.25)"}}
        onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)"}}>
        <Icon n="star" size={size} fill={s<=value?"currentColor":"none"} color={s<=value?"#E8A020":"var(--sub)"} sw={1.5}/>
      </button>
    ))}
  </div>
);

const WineTypePill=({type,label})=>{
  const c=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  return(<span style={{display:"inline-flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,background:c.bg,color:c.text,fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",flexShrink:0}}><span style={{width:6,height:6,borderRadius:"50%",background:c.dot,flexShrink:0}}/>{label||type}</span>);
};

const Modal=({show,onClose,children,wide})=>{
  if(!show)return null;
  return(
    <div style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}} onClick={onClose}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",animation:"fadeIn .2s"}}/>
      <div onClick={e=>e.stopPropagation()} style={{position:"relative",width:"100%",maxWidth:wide?560:440,background:"var(--surface)",borderRadius:26,maxHeight:"88vh",overflowY:"auto",animation:"modalIn .22s cubic-bezier(0.34,1.2,0.64,1)",boxShadow:"0 32px 90px rgba(0,0,0,0.38)",border:"1px solid var(--border)"}}>
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
const ReviewerInput=({label,value,onChange,suggestions=[]})=>{
  const query=(value||"").trim().toLowerCase();
  const matches=(suggestions||[])
    .filter(name=>query&&name.toLowerCase().includes(query)&&name.toLowerCase()!==query)
    .slice(0,6);
  return(
    <div style={{marginBottom:10}}>
      <label style={{display:"block",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</label>
      <input value={value||""} onChange={e=>onChange(e.target.value)} placeholder="Reviewer name"/>
      {matches.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:7}}>
          {matches.map(name=>(
            <button key={name} type="button" onClick={()=>onChange(name)} style={{padding:"4px 10px",borderRadius:999,border:"1px solid var(--border)",background:"var(--inputBg)",color:"var(--sub)",fontSize:11,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
const ReviewEntryEditor=({title,entry,onChange,suggestions=[],onRemove})=>(
  <div style={{background:"var(--card)",borderRadius:12,padding:"10px 12px",marginBottom:10,border:"1px solid var(--border)"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:8}}>
      <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.7px",textTransform:"uppercase",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{title}</div>
      {onRemove&&<button type="button" onClick={onRemove} style={{border:"none",background:"none",color:"var(--sub)",fontSize:18,lineHeight:1}}>×</button>}
    </div>
    <div style={{display:"grid",gridTemplateColumns:"1.4fr 0.8fr",gap:8}}>
      <ReviewerInput label="Reviewer" value={entry?.reviewer||""} onChange={v=>onChange("reviewer",v)} suggestions={suggestions}/>
      <Field label="Rating" value={entry?.rating||""} onChange={v=>onChange("rating",v)} placeholder="e.g. 96 or A+" optional/>
    </div>
    <Field label="Review" value={entry?.text||""} onChange={v=>onChange("text",v)} placeholder="Write review..." rows={3} optional/>
  </div>
);

const Btn=({children,onClick,variant="primary",full,disabled,icon})=>{
  const s={
    primary:{background:"linear-gradient(135deg,var(--accent) 0%,#7F1A2A 100%)",color:"#fff",border:"none",boxShadow:"0 8px 20px rgba(var(--accentRgb),0.25)"},
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

const PHOTO_RENDER_CACHE = new Map();
const PHOTO_RENDER_PROMISES = new Map();
const loadImageForPhoto = src => new Promise((resolve,reject)=>{
  const img=new Image();
  img.decoding="async";
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error("image-load-failed"));
  img.src=src;
});
const isLightNeutral = (r,g,b) => (r>210&&g>210&&b>210&&(Math.max(r,g,b)-Math.min(r,g,b))<36);
const removeWhiteBackground = async src => {
  if(!src) return src;
  try{
    const img=await loadImageForPhoto(src);
    const maxDim=1200;
    const scale=Math.min(1,maxDim/Math.max(img.width||1,img.height||1));
    const w=Math.max(1,Math.round((img.width||1)*scale));
    const h=Math.max(1,Math.round((img.height||1)*scale));
    const canvas=document.createElement("canvas");
    canvas.width=w;
    canvas.height=h;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});
    if(!ctx) return src;
    ctx.drawImage(img,0,0,w,h);
    const imageData=ctx.getImageData(0,0,w,h);
    const px=imageData.data;
    const idx=(x,y)=>(y*w+x);
    const edgeSeed=(x,y)=>{
      const i=idx(x,y)*4;
      const a=px[i+3];
      if(a<20) return true;
      return isLightNeutral(px[i],px[i+1],px[i+2]);
    };

    let edgeSamples=0;
    let edgeWhite=0;
    for(let x=0;x<w;x++){
      edgeSamples+=2;
      if(edgeSeed(x,0)) edgeWhite++;
      if(edgeSeed(x,h-1)) edgeWhite++;
    }
    for(let y=1;y<h-1;y++){
      edgeSamples+=2;
      if(edgeSeed(0,y)) edgeWhite++;
      if(edgeSeed(w-1,y)) edgeWhite++;
    }
    if(edgeSamples===0 || (edgeWhite/edgeSamples)<0.28) return src;

    const bgMask=new Uint8Array(w*h);
    const qx=new Int32Array(w*h);
    const qy=new Int32Array(w*h);
    let head=0,tail=0;
    const push=(x,y)=>{
      const p=idx(x,y);
      if(bgMask[p]) return;
      const i=p*4;
      const a=px[i+3];
      if(a<16 || isLightNeutral(px[i],px[i+1],px[i+2])){
        bgMask[p]=1;
        qx[tail]=x;
        qy[tail]=y;
        tail++;
      }
    };
    for(let x=0;x<w;x++){push(x,0);push(x,h-1);}
    for(let y=1;y<h-1;y++){push(0,y);push(w-1,y);}
    while(head<tail){
      const x=qx[head],y=qy[head];head++;
      if(x>0) push(x-1,y);
      if(x<w-1) push(x+1,y);
      if(y>0) push(x,y-1);
      if(y<h-1) push(x,y+1);
    }

    let changed=false;
    for(let p=0;p<bgMask.length;p++){
      const i=p*4;
      const r=px[i],g=px[i+1],b=px[i+2],a=px[i+3];
      if(a===0) continue;
      const hi=Math.max(r,g,b);
      const lo=Math.min(r,g,b);
      const neutral=(hi-lo)<28;
      if(bgMask[p]){
        if(hi>238 && neutral){
          px[i+3]=0;
          changed=true;
          continue;
        }
        if(hi>224 && neutral){
          const next=Math.round(a*Math.max(0.08,Math.min(0.88,(245-hi)/22)));
          if(next!==a){px[i+3]=next;changed=true;}
        }
      }else if(hi>242 && neutral){
        const next=Math.round(a*0.82);
        if(next!==a){px[i+3]=next;changed=true;}
      }
    }
    if(!changed) return src;
    ctx.putImageData(imageData,0,0);
    return canvas.toDataURL("image/png");
  }catch{
    return src;
  }
};
const getPreparedPhotoSrc = async src => {
  if(!src) return src;
  if(PHOTO_RENDER_CACHE.has(src)) return PHOTO_RENDER_CACHE.get(src);
  if(PHOTO_RENDER_PROMISES.has(src)) return PHOTO_RENDER_PROMISES.get(src);
  const p=(async()=>{
    const processed=await removeWhiteBackground(src);
    PHOTO_RENDER_CACHE.set(src,processed||src);
    PHOTO_RENDER_PROMISES.delete(src);
    return processed||src;
  })();
  PHOTO_RENDER_PROMISES.set(src,p);
  return p;
};
const WinePhotoImage=({src,alt,style={}})=>{
  const [displaySrc,setDisplaySrc]=useState(()=>PHOTO_RENDER_CACHE.get(src)||null);
  useEffect(()=>{
    let alive=true;
    const cached=PHOTO_RENDER_CACHE.get(src);
    if(cached){
      setDisplaySrc(cached);
      return()=>{alive=false;};
    }
    // Avoid flashing the unprocessed source on first paint (can create square shadow artifacts).
    setDisplaySrc(null);
    getPreparedPhotoSrc(src).then(next=>{if(alive&&next)setDisplaySrc(next);});
    return()=>{alive=false;};
  },[src]);
  if(!displaySrc){
    return <div aria-hidden="true" style={{...style,opacity:0}}/>;
  }
  return <img src={displaySrc} alt={alt} style={{...style,transform:`${style?.transform?`${style.transform} `:""}translateZ(0)`,backfaceVisibility:"hidden",WebkitBackfaceVisibility:"hidden",willChange:"transform"}}/>;
};

const PhotoPicker=({value,onChange,size=80,round})=>{
  const ref=useRef();
  const handle=e=>{
    const f=e.target.files[0];
    if(!f) return;
    const r=new FileReader();
    r.onload=async ev=>{
      const raw=ev?.target?.result;
      if(typeof raw!=="string"){onChange(raw);return;}
      const cleaned=await getPreparedPhotoSrc(raw);
      onChange(cleaned||raw);
    };
    r.readAsDataURL(f);
  };
  return(
    <div onClick={()=>ref.current.click()} style={{width:size,height:size,borderRadius:round?"50%":14,background:"var(--inputBg)",border:"1.5px dashed var(--border)",cursor:"pointer",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",position:"relative",flexShrink:0,transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
      onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
      {value?<WinePhotoImage src={value} alt="" style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center",padding:4,background:"linear-gradient(180deg,rgba(255,255,255,0.16),rgba(0,0,0,0.04))"}}/>:<div style={{textAlign:"center",color:"var(--sub)",display:"flex",flexDirection:"column",alignItems:"center",gap:4}}><Icon n="camera" size={20}/><span style={{fontSize:10,fontWeight:600}}>Photo</span></div>}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={handle} style={{display:"none"}}/>
    </div>
  );
};

const BottleGlyph=({color="#8B1A1A"})=>{
  return(
    <svg width="56" height="72" viewBox="0 0 56 72" aria-hidden="true">
      <path
        d="M20 4c4-2 12-2 16 0v3c0 1 0 2 1 3v13c0 3 2 6 4 9 4 5 6 10 6 16v16c0 5-5 7-19 7S9 69 9 64V48c0-6 2-11 6-16 2-3 4-6 4-9V10c1-1 1-2 1-3V4z"
        fill="none"
        stroke="#121216"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M19 30.5c6 1 12 1 18 0" stroke="#121216" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M19 48c6 1 12 1 18 0" stroke="#121216" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      <path d="M20 14h16" stroke="#121216" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
};

const WineThumbVisual=({wine,tc})=>{
  const bottleRgb=hexToRgb(tc.dot)||"139,26,26";
  return(
    <div style={{width:60,height:76,borderRadius:14,background:`linear-gradient(170deg,${tc.bg} 0%,rgba(${bottleRgb},0.28) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",border:"1px solid rgba(18,18,22,0.2)",boxShadow:"inset 0 1px 5px rgba(255,255,255,0.22)",alignSelf:"center",position:"relative"}}>
      {wine.photo?(
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,255,255,0.06) 46%,rgba(0,0,0,0.08))",isolation:"isolate"}}>
          <WinePhotoImage src={wine.photo} alt={wine.name} style={{width:"100%",height:"100%",objectFit:"contain",objectPosition:"center",padding:"3px",filter:"drop-shadow(0 2px 6px rgba(0,0,0,0.22))"}}/>
        </div>
      ):<BottleGlyph color={tc.dot}/>}
    </div>
  );
};

/* ── WINE CARD ────────────────────────────────────────────────── */
const WineCard=({wine,onClick})=>{
  const type=resolveWineType(wine);
  const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  const varietal=resolveVarietal(wine);
  const ready=wineReadiness(wine);
  const geo=deriveRegionCountry(wine.origin||"");
  const yearTag=wine.vintage?String(wine.vintage):null;
  const locationTag=formatWineLocation(wine)||null;
  const addedTag=!wine.wishlist&&wine.cellarMeta?.addedDate?(fmt(wine.cellarMeta.addedDate)?`Added ${fmt(wine.cellarMeta.addedDate)}`:null):null;
  const paidPerBottle=safeNum(wine.cellarMeta?.pricePerBottle);
  const rrpPerBottle=safeNum(wine.cellarMeta?.rrp);
  const readinessTag=!wine.wishlist&&ready.key!=="none"?ready.label:null;
  const rrpText=!wine.wishlist&&rrpPerBottle!=null&&rrpPerBottle>0?`RRP $${rrpPerBottle.toFixed(2)}`:null;
  const paidText=!wine.wishlist&&paidPerBottle!=null&&paidPerBottle>0?`Paid $${paidPerBottle.toFixed(2)}`:null;
  const footerText=[locationTag||geo.country,addedTag].filter(Boolean).join(" · ");
  const quickTagStyle={padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:700,color:"var(--text)",background:"var(--inputBg)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap"};
  return(
    <div onClick={onClick} style={{background:"linear-gradient(180deg,var(--card),var(--inputBg))",borderRadius:20,padding:"16px",cursor:"pointer",border:"1px solid var(--border)",marginBottom:10,display:"grid",gridTemplateColumns:"60px 1fr",gap:14,alignItems:"start",transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 2px 10px var(--shadow)",minHeight:112}}
      onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 28px var(--shadow)";}}
      onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)";}}>
      <WineThumbVisual wine={wine} tc={tc}/>
      <div style={{minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,minWidth:0}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)",lineHeight:1.25,display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",overflow:"hidden",minWidth:0}}>{wine.name}</div>
          {!wine.wishlist&&wine.bottles>0&&<div style={{fontSize:12,color:"var(--sub)",fontWeight:600,flexShrink:0,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap"}}>{wine.bottles} {wine.bottles===1?"btl":"btls"}</div>}
        </div>
        {(geo.region||geo.country)&&(
          <div style={{fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {geo.region||geo.country}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
          <WineTypePill type={type} label={varietal}/>
          {yearTag&&<span style={quickTagStyle}>{yearTag}</span>}
          {rrpText&&<span style={{...quickTagStyle,background:"rgba(var(--accentRgb),0.13)",color:"var(--accent)",fontWeight:800}}>{rrpText}</span>}
          {paidText&&<span style={{...quickTagStyle,background:"var(--card)",border:"1px solid var(--border)"}}>{paidText}</span>}
          {readinessTag&&<span style={{...quickTagStyle,color:"#fff",background:ready.color}}>{ready.key==="ready"?"Ready":ready.label}</span>}
        </div>
        {footerText&&(
          <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
            {footerText}
          </div>
        )}
      </div>
    </div>
  );
};

/* ── WINE DETAIL ──────────────────────────────────────────────── */
const WineDetail=({wine,onEdit,onDelete,onMove,onAdjustConsumption})=>{
  const type=resolveWineType(wine);
  const varietal=resolveVarietal(wine);
  const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  const ready=wineReadiness(wine);
  const geo=deriveRegionCountry(wine.origin||"");
  const m=wine.cellarMeta||{};
  const purchasedTotal=getTotalPurchased(wine);
  const bottlesLeft=Math.max(0,Math.round(safeNum(wine.bottles)||0));
  const consumedCount=getConsumedBottles(wine);
  const addedDateText=(()=>{
    const raw=(m.addedDate||"").toString().trim();
    if(!raw)return null;
    const d=new Date(`${raw.slice(0,10)}T00:00:00`);
    if(Number.isNaN(d.getTime())) return raw;
    return d.toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  })();
  const drinkWindow=(m.drinkStart||m.drinkEnd)?`${m.drinkStart||"?"} - ${m.drinkEnd||"?"}`:null;
  const paidPerBottle=safeNum(m.pricePerBottle);
  const rrpPerBottle=safeNum(m.rrp);
  const hasPhoto=!!wine.photo;
  const [isMobile,setIsMobile]=useState(()=>window.innerWidth<760);
  useEffect(()=>{
    const onResize=()=>setIsMobile(window.innerWidth<760);
    window.addEventListener("resize",onResize);
    return()=>window.removeEventListener("resize",onResize);
  },[]);
  const desktopFloatingAside=hasPhoto&&!isMobile;
  const titleCard=(
    <div style={{borderRadius:16,background:`linear-gradient(140deg,${tc.dot} 0%,rgba(0,0,0,.24) 90%)`,padding:"20px",position:"relative",overflow:"hidden",minHeight:108,boxShadow:"inset 0 1px 0 rgba(255,255,255,.2)",animation:"heroGlassIn .25s ease-out"}}>
      <div style={{position:"absolute",right:-18,bottom:-18,opacity:0.12,pointerEvents:"none"}}><BrandLogo size={120} variant="mono"/></div>
      <div style={{position:"relative",zIndex:1}}>
        <WineTypePill type={type} label={varietal}/>
      </div>
      <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"#fff",marginTop:8,lineHeight:1.2,position:"relative",zIndex:1,textShadow:"0 2px 10px rgba(0,0,0,.28)"}}>{wine.name}</div>
      {(wine.vintage||geo.region||geo.country)&&<div style={{fontSize:14,color:"rgba(255,255,255,.86)",marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif",position:"relative",zIndex:1}}>{[wine.vintage,geo.region||geo.country,geo.country&&geo.region?geo.country:null].filter(Boolean).join(" · ")}</div>}
    </div>
  );
  return(
    <div style={desktopFloatingAside?{maxWidth:760,margin:"0 auto",display:"grid",gridTemplateColumns:"190px minmax(0,1fr)",gap:14,alignItems:"start"}:{}}>
      {desktopFloatingAside&&(
        <div style={{height:518,pointerEvents:"none",zIndex:3,display:"flex",alignItems:"flex-end",justifyContent:"center",position:"relative"}}>
          <WinePhotoImage src={wine.photo} alt={wine.name} style={{width:"100%",height:"100%",maxHeight:500,objectFit:"contain",objectPosition:"center",filter:"drop-shadow(0 18px 22px rgba(0,0,0,.34)) drop-shadow(0 4px 8px rgba(0,0,0,.22))",animation:"heroPhotoFloat .3s ease-out both"}}/>
        </div>
      )}
      <div style={desktopFloatingAside?{background:"var(--card)",border:"1px solid var(--border)",borderRadius:20,padding:14,boxShadow:"0 10px 28px var(--shadow)"}:{}}>
        {desktopFloatingAside?(
          <div style={{marginBottom:16}}>{titleCard}</div>
        ):(
          hasPhoto&&isMobile?(
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:10,display:"grid",gridTemplateColumns:"124px minmax(0,1fr)",gap:10,alignItems:"stretch",marginBottom:16,boxShadow:"0 6px 18px rgba(0,0,0,0.05)"}}>
              <div style={{borderRadius:12,position:"relative",display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 3px"}}>
                <WinePhotoImage src={wine.photo} alt={wine.name} style={{width:"100%",height:"100%",maxHeight:176,objectFit:"contain",objectPosition:"center",filter:"drop-shadow(0 12px 15px rgba(0,0,0,.24)) drop-shadow(0 2px 6px rgba(0,0,0,.17))",animation:"heroPhotoFloat .3s ease-out both"}}/>
              </div>
              {titleCard}
            </div>
          ):(
            <div style={{marginBottom:16}}>
              {titleCard}
            </div>
          )
        )}
        {!wine.wishlist&&(
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
            {[["Purchased",purchasedTotal],["Left",bottlesLeft],["Consumed",consumedCount]].map(([label,val])=>(
              <div key={label} style={{background:"var(--inputBg)",borderRadius:12,padding:"10px 11px",border:"1px solid var(--border)"}}>
                <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
                <div style={{fontSize:17,color:"var(--text)",fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.15}}>{val}</div>
              </div>
            ))}
          </div>
        )}
        {!wine.wishlist&&onAdjustConsumption&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,background:"var(--card)",borderRadius:12,border:"1px solid var(--border)",padding:"10px 12px",marginBottom:12}}>
            <div>
              <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Consumption Log</div>
              <div style={{fontSize:13,color:"var(--text)",fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{consumedCount} consumed · {bottlesLeft} left</div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button disabled={consumedCount<=0} onClick={()=>onAdjustConsumption(-1)} style={{width:30,height:30,borderRadius:10,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:18,lineHeight:1,cursor:consumedCount>0?"pointer":"default",opacity:consumedCount>0?1:0.4}}>−</button>
              <button disabled={bottlesLeft<=0} onClick={()=>onAdjustConsumption(1)} style={{padding:"8px 12px",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:bottlesLeft>0?"pointer":"default",opacity:bottlesLeft>0?1:0.45}}>Drank +1</button>
            </div>
          </div>
        )}
        {!wine.wishlist&&addedDateText&&(
          <div style={{fontSize:13,color:"var(--sub)",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Added to inventory on: <span style={{color:"var(--text)",fontWeight:700}}>{addedDateText}</span>
          </div>
        )}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
          {[["Varietal",varietal],["Alcohol",wine.alcohol?`${wine.alcohol}%`:null],!wine.wishlist&&["Readiness",ready.label],!wine.wishlist&&["Drink Window",drinkWindow],!wine.wishlist&&["RRP / Bottle",rrpPerBottle?`$${rrpPerBottle.toFixed(2)}`:null],!wine.wishlist&&["Paid / Bottle",paidPerBottle?`$${paidPerBottle.toFixed(2)}`:null],!wine.wishlist&&["Location",formatWineLocation(wine)||null],["Purchased Date",fmt(wine.datePurchased)]].filter(x=>x&&x[1]).map(([l,v])=>(
            <div key={l} style={{background:"var(--inputBg)",borderRadius:12,padding:"11px 13px"}}>
              <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
              <div style={{fontSize:14,color:"var(--text)",fontWeight:500,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{v}</div>
            </div>
          ))}
        </div>
        {wine.wishlist&&onMove&&<div style={{marginBottom:8}}><Btn full onClick={onMove}>Move to Collection</Btn></div>}
        <div style={{display:"flex",gap:8,marginTop:12}}>
          <Btn variant="secondary" onClick={onEdit} full icon="edit">Edit</Btn>
          <Btn variant="danger" onClick={onDelete} full icon="trash">Delete</Btn>
        </div>
      </div>
    </div>
  );
};

/* ── WINE FORM ────────────────────────────────────────────────── */
const CUSTOM_LOCATION_OPTION = "__custom_location__";
const WineForm=({initial,onSave,onClose,isWishlist,locationOptions=[],savedLocations=[],onSaveLocation,onRemoveLocation,reviewerSuggestions=[]})=>{
  const knownLocations=dedupeLocations([...LOCATIONS,...locationOptions,...savedLocations,initial?.location]);
  const defaultLocation=knownLocations[0]||LOCATIONS[0]||"Kennards";
  const initialLocation=canonicalLocation(initial?.location||defaultLocation,knownLocations)||defaultLocation;
  const inferredPriceForBottles=(()=>{
    if(!initial) return "1";
    const paid=safeNum(initial.cellarMeta?.totalPaid);
    const perBottle=safeNum(initial.cellarMeta?.pricePerBottle);
    if(paid&&perBottle){
      const calc=Math.max(1,Math.round(paid/perBottle));
      if(Number.isFinite(calc)) return String(calc);
    }
    const purchased=getTotalPurchased(initial);
    return purchased>0?String(purchased):"";
  })();
  const blank={name:"",origin:"",grape:"",alcohol:"",vintage:"",bottles:"1",addPurchased:"",rating:0,notes:"",review:"",reviewPrimaryReviewer:"",reviewPrimaryRating:"",otherReviews:[normalizeReviewEntry({})],tastingNotes:"",datePurchased:"",addedDate:todayIsoLocal(),wishlist:!!isWishlist,photo:null,location:defaultLocation,locationSlot:"",locationSection:"",drinkStart:"",drinkEnd:"",pricePerBottle:"",rrp:"",totalPaid:"",priceForBottles:"1",insuranceValue:"",supplier:""};
  const [f,setF]=useState(initial?{
    ...blank,...initial,
    reviewPrimaryReviewer:(initial.reviewPrimaryReviewer||"").toString(),
    reviewPrimaryRating:(initial.reviewPrimaryRating||"").toString(),
    otherReviews:normalizeOtherReviews(initial.otherReviews||[]).length?normalizeOtherReviews(initial.otherReviews||[]):[normalizeReviewEntry({})],
    location:initialLocation,alcohol:initial.alcohol?.toString()||"",vintage:initial.vintage?.toString()||"",bottles:initial.bottles?.toString()||"",addPurchased:"",
    locationSlot:initial.locationSlot||"",locationSection:normalizeKennardsSection(initial.cellarMeta?.locationSection||""),drinkStart:initial.cellarMeta?.drinkStart?.toString()||"",drinkEnd:initial.cellarMeta?.drinkEnd?.toString()||"",
    pricePerBottle:initial.cellarMeta?.pricePerBottle?.toString()||"",rrp:initial.cellarMeta?.rrp?.toString()||"",totalPaid:initial.cellarMeta?.totalPaid?.toString()||"",priceForBottles:inferredPriceForBottles,insuranceValue:initial.cellarMeta?.insuranceValue?.toString()||"",supplier:initial.cellarMeta?.supplier||"",addedDate:initial.cellarMeta?.addedDate||todayIsoLocal()
  }:blank);
  const [locationMode,setLocationMode]=useState("preset");
  const [customLocation,setCustomLocation]=useState("");
  const [rememberLocation,setRememberLocation]=useState(false);
  const [priceBottlesManual,setPriceBottlesManual]=useState(false);
  const isTwoStepNewCellar=!initial&&!isWishlist;
  const [step,setStep]=useState("details");
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const setOtherReview=(idx,key,value)=>setF(p=>({
    ...p,
    otherReviews:(p.otherReviews||[]).map((entry,i)=>i===idx?normalizeReviewEntry({...entry,[key]:value}):entry)
  }));
  const addOtherReviewSlot=()=>setF(p=>({...p,otherReviews:[...(p.otherReviews||[]),normalizeReviewEntry({})]}));
  const removeOtherReviewSlot=idx=>setF(p=>{
    const next=(p.otherReviews||[]).filter((_,i)=>i!==idx);
    return {...p,otherReviews:next.length?next:[normalizeReviewEntry({})]};
  });
  const handleBottlesChange=v=>{
    const clean=v.replace(/[^0-9]/g,"");
    setF(p=>({
      ...p,
      bottles:clean,
      priceForBottles:(!initial&&!priceBottlesManual)?clean:p.priceForBottles
    }));
  };
  const handlePriceForBottlesChange=v=>{
    setPriceBottlesManual(true);
    set("priceForBottles",v.replace(/[^0-9]/g,""));
  };
  const [q,setQ]=useState(initial?.name||"");
  const [sugs,setSugs]=useState([]);
  const [showFields,setShowFields]=useState(!!initial);
  const selectableLocations=dedupeLocations([...knownLocations,f.location]);
  const selectedLocationValue=locationMode==="custom"
    ? CUSTOM_LOCATION_OPTION
    : (canonicalLocation(f.location,selectableLocations)||selectableLocations[0]||defaultLocation);
  const currentLocationRaw=locationMode==="custom"?customLocation:(selectedLocationValue===CUSTOM_LOCATION_OPTION?"":selectedLocationValue);
  const isKennardsLocation=canonicalLocation(currentLocationRaw,selectableLocations)==="Kennards";
  const leftInput=Math.max(0,parseInt(f.bottles)||0);
  const addPurchased=Math.max(0,parseInt(f.addPurchased)||0);
  const basePurchased=initial?getTotalPurchased(initial):leftInput;
  const projectedLeft=leftInput+addPurchased;
  const projectedPurchased=Math.max(basePurchased+addPurchased,projectedLeft);
  const projectedConsumed=Math.max(0,projectedPurchased-projectedLeft);
  const paidAmount=safeNum(f.totalPaid);
  const paidForBottles=Math.max(0,parseInt(f.priceForBottles)||0);
  const calculatedPricePerBottle=(paidAmount!=null&&paidAmount>0&&paidForBottles>0)
    ? Number((paidAmount/paidForBottles).toFixed(2))
    : null;
  const existingPaidPerBottle=safeNum(initial?.cellarMeta?.pricePerBottle);
  const existingRrpPerBottle=safeNum(initial?.cellarMeta?.rrp);
  const existingTotalPaid=safeNum(initial?.cellarMeta?.totalPaid);
  const manualRrp=safeNum(f.rrp);
  const finalPricePerBottle=calculatedPricePerBottle??existingPaidPerBottle??null;
  const autoRrpPerBottle=calculatedPricePerBottle??finalPricePerBottle;
  const finalRrp=(manualRrp!=null&&manualRrp>0)?manualRrp:(autoRrpPerBottle??existingRrpPerBottle??null);
  const finalTotalPaid=(paidAmount!=null&&paidAmount>0)
    ? paidAmount
    : (existingTotalPaid!=null&&existingTotalPaid>0
      ? existingTotalPaid
      : (finalPricePerBottle!=null&&paidForBottles>0?Number((finalPricePerBottle*paidForBottles).toFixed(2)):null));
  const invalidCustomLocation=!isWishlist&&locationMode==="custom"&&!normalizeLocation(customLocation);
  const canSubmit=!!f.name&&!invalidCustomLocation;
  const showDetailsStep=!isTwoStepNewCellar||step==="details";
  const showJournalStep=isTwoStepNewCellar&&step==="journal";
  const handleQ=v=>{setQ(v);set("name",v);setSugs(v.length>=2?fuzzySearch(v):[]);};
  const pickSug=w=>{setF(p=>({...p,name:w.name,origin:w.origin||"",grape:w.grape||"",alcohol:w.alcohol?.toString()||"",tastingNotes:w.tastingNotes||""}));setQ(w.name);setSugs([]);setShowFields(true);};
  const handleLocationSelect=value=>{
    if(value===CUSTOM_LOCATION_OPTION){
      setLocationMode("custom");
      setRememberLocation(false);
      return;
    }
    setLocationMode("preset");
    setRememberLocation(false);
    set("location",canonicalLocation(value,selectableLocations));
  };
  const save=()=>{
    if(!f.name)return;
    if(!isWishlist&&locationMode==="custom"&&!normalizeLocation(customLocation))return;
    const locationSource=locationMode==="custom"?customLocation:f.location;
    const finalLocation=canonicalLocation(locationSource,selectableLocations)||LOCATIONS[0]||"Kennards";
    const finalSection=finalLocation==="Kennards"?(normalizeKennardsSection(f.locationSection)||"Cube"):"";
    const finalAddedDate=f.addedDate||initial?.cellarMeta?.addedDate||todayIsoLocal();
    const wt=guessWineType(f.grape,f.name);
    const tc=WINE_TYPE_COLORS[wt]||WINE_TYPE_COLORS.Other;
    const normalizedOtherReviews=normalizeOtherReviews(f.otherReviews||[]);
    const reviewPrimaryRating=(f.reviewPrimaryRating||"").toString().trim();
    const hallidayNumeric=safeNum(reviewPrimaryRating);
    const computedStars=hallidayNumeric!=null?ratingFromHalliday(hallidayNumeric):(f.rating||0);
    const {addPurchased:_addIgnore,locationSection:_locSectionIgnore,addedDate:_addedIgnore,priceForBottles:_priceCountIgnore,pricePerBottle:_pricePerBottleIgnore,...payload}=f;
    if(!isWishlist&&locationMode==="custom"&&rememberLocation&&finalLocation){
      onSaveLocation?.(finalLocation);
    }
    onSave({
      ...payload,id:f.id||uid(),alcohol:parseFloat(f.alcohol)||0,vintage:parseInt(f.vintage)||null,bottles:projectedLeft,location:finalLocation,locationSlot:f.locationSlot||null,wineType:wt,color:tc.dot,
      rating:computedStars,
      reviewPrimaryReviewer:(f.reviewPrimaryReviewer||"").toString().trim(),
      reviewPrimaryRating:reviewPrimaryRating,
      otherReviews:normalizedOtherReviews,
      tastingNotes:serializeOtherRatings(normalizedOtherReviews),
      cellarMeta:{...(initial?.cellarMeta||{}),drinkStart:parseInt(f.drinkStart)||null,drinkEnd:parseInt(f.drinkEnd)||null,pricePerBottle:finalPricePerBottle,rrp:finalRrp,totalPaid:finalTotalPaid,insuranceValue:parseFloat(f.insuranceValue)||null,supplier:f.supplier||"",locationSection:finalSection,totalPurchased:projectedPurchased,addedDate:finalAddedDate}
    });
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
          <div style={{position:"absolute",top:"100%",left:0,right:0,background:"var(--surface)",borderRadius:14,border:"1px solid var(--border)",zIndex:99,maxHeight:300,overflowY:"auto",overscrollBehavior:"contain",boxShadow:"0 12px 40px rgba(0,0,0,0.2)",marginTop:4}}
            onWheel={e=>e.stopPropagation()}>
            {sugs.map((w,i)=>(
              <div key={i} onMouseDown={()=>pickSug(w)} style={{padding:"10px 14px",cursor:"pointer",borderBottom:i<sugs.length-1?"1px solid var(--border)":"none"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--inputBg)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15,fontWeight:700,color:"var(--text)"}}>{w.name}</div>
                <div style={{fontSize:12,color:"var(--sub)",marginTop:1}}>{w.grape} · {w.origin}</div>
              </div>
            ))}
            <div onMouseDown={()=>{setSugs([]);setShowFields(true);}} style={{padding:"10px 14px",cursor:"pointer",color:"var(--accent)",fontSize:13,fontWeight:600,textAlign:"center",borderTop:"1px solid var(--border)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              Add "{q}" manually
            </div>
          </div>
        )}
        {!showFields&&!sugs.length&&q.length>=1&&(
          <button onMouseDown={()=>setShowFields(true)} style={{marginTop:8,width:"100%",padding:"9px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"var(--accent)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Enter details manually
          </button>
        )}
      </div>
      {showFields&&(
        <div>
          {isTwoStepNewCellar&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}}>
              <button type="button" onClick={()=>setStep("details")} style={{padding:"8px 10px",borderRadius:10,border:step==="details"?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:step==="details"?"rgba(var(--accentRgb),0.1)":"var(--inputBg)",color:step==="details"?"var(--accent)":"var(--sub)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>1. Wine Details</button>
              <button type="button" onClick={()=>setStep("journal")} disabled={!canSubmit} style={{padding:"8px 10px",borderRadius:10,border:step==="journal"?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:step==="journal"?"rgba(var(--accentRgb),0.1)":"var(--inputBg)",color:step==="journal"?"var(--accent)":"var(--sub)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:canSubmit?1:0.5}}>2. Journal Notes</button>
            </div>
          )}
          {showDetailsStep&&(
            <>
              <Field label="Wine Name" value={f.name} onChange={v=>set("name",v)} placeholder="e.g. Penfolds Grange"/>
              <Field label="Origin" value={f.origin} onChange={v=>set("origin",v)} placeholder="Region, Country" optional/>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                <Field label="Varietal" value={f.grape} onChange={v=>set("grape",v)} placeholder="Shiraz" optional/>
                <Field label="Vintage" value={f.vintage} onChange={v=>set("vintage",v)} type="number" placeholder="2019" optional/>
                <Field label="Alc %" value={f.alcohol} onChange={v=>set("alcohol",v)} type="number" placeholder="14.5" optional/>
              </div>
              {!isWishlist&&(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 2fr 1fr",gap:10}}>
                    <Field label="Bottles" value={f.bottles} onChange={handleBottlesChange} type="number" placeholder="1" optional/>
                    <SelField
                      label="Location"
                      value={selectedLocationValue}
                      onChange={handleLocationSelect}
                      options={[...selectableLocations.map(loc=>({value:loc,label:loc})),{value:CUSTOM_LOCATION_OPTION,label:"Custom location…"}]}
                    />
                    <Field label={isKennardsLocation?"Box No.":"Slot"} value={f.locationSlot} onChange={v=>set("locationSlot",v)} placeholder={isKennardsLocation?"e.g. 12":"A3"} optional/>
                  </div>
                  {isKennardsLocation&&(
                    <SelField
                      label="Kennards Placement"
                      value={normalizeKennardsSection(f.locationSection)||"Cube"}
                      onChange={v=>set("locationSection",normalizeKennardsSection(v))}
                      options={KENNARDS_SECTIONS}
                    />
                  )}
                  {locationMode==="custom"&&(
                    <div style={{marginBottom:12,marginTop:-4,padding:"10px 11px",borderRadius:12,background:"var(--card)",border:"1px solid var(--border)"}}>
                      <Field label="Custom Location" value={customLocation} onChange={setCustomLocation} placeholder="e.g. Events Cellar" optional/>
                      <button type="button" onClick={()=>setRememberLocation(v=>!v)}
                        style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"8px 2px 2px",border:"none",background:"transparent",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"var(--text)",fontWeight:600,width:"100%",cursor:"pointer"}}>
                        <span style={{color:"var(--sub)"}}>Save this location for future wines</span>
                        <span style={{width:40,height:22,borderRadius:999,background:rememberLocation?"var(--accent)":"var(--inputBg)",border:rememberLocation?"1.5px solid rgba(var(--accentRgb),0.55)":"1.5px solid var(--border)",position:"relative",transition:"all .16s",display:"inline-flex"}}>
                          <span style={{position:"absolute",top:2,left:rememberLocation?20:2,width:16,height:16,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,.28)",transition:"left .16s"}}/>
                        </span>
                      </button>
                    </div>
                  )}
                  <div style={{background:"var(--card)",borderRadius:12,padding:"10px 12px",marginBottom:12,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Bottle Tracker</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:8}}>
                      {[["Purchased",projectedPurchased],["Left",projectedLeft],["Consumed",projectedConsumed]].map(([label,val])=>(
                        <div key={label} style={{background:"var(--inputBg)",borderRadius:10,padding:"7px 8px",border:"1px solid var(--border)"}}>
                          <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:1,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{label}</div>
                          <div style={{fontSize:15,color:"var(--text)",fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.2}}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {initial&&<Field label="Add Newly Purchased Bottles" value={f.addPurchased} onChange={v=>set("addPurchased",v.replace(/[^0-9]/g,""))} type="number" placeholder="0" optional/>}
                  </div>
                  {savedLocations.length>0&&(
                    <div style={{marginBottom:14,marginTop:-4}}>
                      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Saved Locations</div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        {savedLocations.map(loc=>(
                          <button
                            key={loc}
                            type="button"
                            onClick={()=>onRemoveLocation?.(loc)}
                            style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:20,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:12,fontWeight:600,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}
                          >
                            <span>{loc}</span>
                            <span style={{color:"var(--sub)",lineHeight:1}}>×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {!isWishlist&&(
                <>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
                    <Field label="Drink From" value={f.drinkStart} onChange={v=>set("drinkStart",v)} type="number" placeholder="2026" optional/>
                    <Field label="Drink By" value={f.drinkEnd} onChange={v=>set("drinkEnd",v)} type="number" placeholder="2034" optional/>
                    <Field label="Supplier" value={f.supplier} onChange={v=>set("supplier",v)} placeholder="WS / Local shop" optional/>
                  </div>
                  <div style={{background:"var(--card)",borderRadius:12,padding:"10px 12px",marginBottom:12,border:"1px solid var(--border)"}}>
                    <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Price Setup</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                      <Field label="Amount Paid" value={f.totalPaid} onChange={v=>set("totalPaid",v)} type="number" placeholder="179.5" optional/>
                      <Field label="Bottles Paid For" value={f.priceForBottles} onChange={handlePriceForBottlesChange} type="number" placeholder="6" optional/>
                    </div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:2,marginBottom:10}}>
                      <span style={{padding:"4px 9px",borderRadius:16,background:"var(--inputBg)",border:"1px solid var(--border)",fontSize:12,color:"var(--text)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        Calculated paid/bottle: {(calculatedPricePerBottle??existingPaidPerBottle)!=null?`$${Number(calculatedPricePerBottle??existingPaidPerBottle).toFixed(2)}`:"—"}
                      </span>
                      <span style={{padding:"4px 9px",borderRadius:16,background:"rgba(var(--accentRgb),0.12)",border:"1px solid rgba(var(--accentRgb),0.22)",fontSize:12,color:"var(--accent)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                        Calculated RRP/bottle: {autoRrpPerBottle!=null?`$${Number(autoRrpPerBottle).toFixed(2)}`:"—"}
                      </span>
                    </div>
                    <Field label="RRP / Bottle (optional override)" value={f.rrp} onChange={v=>set("rrp",v)} type="number" placeholder="40" optional/>
                    <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.55}}>
                      If RRP is left blank, it will use the calculated paid per bottle automatically.
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                    <Field label="Date Purchased" value={f.datePurchased} onChange={v=>set("datePurchased",v)} type="date" optional/>
                    <Field label="Added to Inventory" value={f.addedDate} onChange={v=>set("addedDate",v)} type="date" optional/>
                  </div>
                </>
              )}
            </>
          )}
          {showJournalStep&&(
            <>
              <div style={{background:"var(--card)",borderRadius:12,padding:"10px 12px",marginBottom:12,border:"1px solid var(--border)"}}>
                <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Journal (Optional)</div>
                <div style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Set critic reviews and personal notes now, or leave blank and edit later in Journal.</div>
              </div>
              <ReviewEntryEditor
                title="Review"
                entry={{reviewer:f.reviewPrimaryReviewer,rating:f.reviewPrimaryRating,text:f.review}}
                onChange={(k,v)=>set(k==="text"?"review":k==="reviewer"?"reviewPrimaryReviewer":"reviewPrimaryRating",v)}
                suggestions={reviewerSuggestions}
              />
              <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Other Reviews</div>
              {(f.otherReviews||[]).map((entry,idx)=>(
                <ReviewEntryEditor
                  key={idx}
                  title={`Other Review ${idx+1}`}
                  entry={entry}
                  onChange={(k,v)=>setOtherReview(idx,k,v)}
                  suggestions={reviewerSuggestions}
                  onRemove={(f.otherReviews||[]).length>1?()=>removeOtherReviewSlot(idx):undefined}
                />
              ))}
              <button type="button" onClick={addOtherReviewSlot} style={{width:"100%",marginBottom:12,padding:"8px 10px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"var(--accent)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                + Add Another Review
              </button>
              <Field label="Personal Notes" value={f.notes} onChange={v=>set("notes",v)} placeholder="Your own notes..." rows={3} optional/>
            </>
          )}
          {!showJournalStep&&!isTwoStepNewCellar&&!initial&&(
            <>
              {!isWishlist&&(
                <>
                  <ReviewEntryEditor
                    title="Review"
                    entry={{reviewer:f.reviewPrimaryReviewer,rating:f.reviewPrimaryRating,text:f.review}}
                    onChange={(k,v)=>set(k==="text"?"review":k==="reviewer"?"reviewPrimaryReviewer":"reviewPrimaryRating",v)}
                    suggestions={reviewerSuggestions}
                  />
                  <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Other Reviews</div>
                  {(f.otherReviews||[]).map((entry,idx)=>(
                    <ReviewEntryEditor
                      key={idx}
                      title={`Other Review ${idx+1}`}
                      entry={entry}
                      onChange={(k,v)=>setOtherReview(idx,k,v)}
                      suggestions={reviewerSuggestions}
                      onRemove={(f.otherReviews||[]).length>1?()=>removeOtherReviewSlot(idx):undefined}
                    />
                  ))}
                  <button type="button" onClick={addOtherReviewSlot} style={{width:"100%",marginBottom:12,padding:"8px 10px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"var(--accent)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                    + Add Another Review
                  </button>
                  <Field label="Personal Notes" value={f.notes} onChange={v=>set("notes",v)} placeholder="Your own notes..." rows={3} optional/>
                </>
              )}
            </>
          )}
          {isTwoStepNewCellar&&step==="details"&&(
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn variant="secondary" onClick={onClose} full>Cancel</Btn>
              <Btn onClick={()=>setStep("journal")} full disabled={!canSubmit}>Continue</Btn>
            </div>
          )}
          {isTwoStepNewCellar&&step==="journal"&&(
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn variant="secondary" onClick={()=>setStep("details")} full>Back</Btn>
              <Btn onClick={save} full disabled={!canSubmit}>Save Wine</Btn>
            </div>
          )}
          {!isTwoStepNewCellar&&(
            <div style={{display:"flex",gap:8,marginTop:4}}>
              <Btn variant="secondary" onClick={onClose} full>Cancel</Btn>
              <Btn onClick={save} full disabled={!canSubmit}>Save Wine</Btn>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ── FILTER PANEL ─────────────────────────────────────────────── */
const SORTS=[
  {value:"name",label:"Name A–Z"},
  {value:"vintage",label:"Vintage"},
  {value:"bottles",label:"Bottles"},
  {value:"costDesc",label:"Most Expensive"},
  {value:"costAsc",label:"Least Expensive"},
  {value:"recent",label:"Recently Added"},
];
const DEFAULT_FILTERS={sort:"name",varietal:"",location:"",section:"",readiness:"",region:"",country:"",priceBand:""};
const hasFilters=f=>f.sort!=="name"||f.varietal||f.location||f.section||f.readiness||f.region||f.country||f.priceBand;
const applyFilters=(wines,f,s)=>{
  let r=wines.filter(w=>!w.wishlist);
  if(s)r=r.filter(w=>`${w.name} ${w.grape} ${resolveVarietal(w)} ${w.origin} ${w.location} ${w.cellarMeta?.locationSection||""} ${w.locationSlot||""}`.toLowerCase().includes(s.toLowerCase()));
  if(f.varietal)r=r.filter(w=>resolveVarietal(w)===f.varietal);
  if(f.location)r=r.filter(w=>locationKey(w.location)===locationKey(f.location));
  if(f.section)r=r.filter(w=>normalizeKennardsSection(w.cellarMeta?.locationSection||"")===f.section);
  if(f.region)r=r.filter(w=>deriveRegionCountry(w.origin||"").region===f.region);
  if(f.country)r=r.filter(w=>deriveRegionCountry(w.origin||"").country===f.country);
  if(f.readiness){
    r=r.filter(w=>{
      const st=wineReadiness(w).key;
      if(f.readiness==="ready")return st==="ready";
      if(f.readiness==="notReady")return st==="early";
      if(f.readiness==="past")return st==="late";
      if(f.readiness==="noWindow")return st==="none";
      return true;
    });
  }
  if(f.priceBand){
    r=r.filter(w=>{
      const p=safeNum(w.cellarMeta?.pricePerBottle)||0;
      if(f.priceBand==="budget")return p>0&&p<25;
      if(f.priceBand==="mid")return p>=25&&p<60;
      if(f.priceBand==="premium")return p>=60&&p<120;
      if(f.priceBand==="luxury")return p>=120;
      return true;
    });
  }
  return r.sort((a,b)=>{
    if(f.sort==="vintage")return(b.vintage||0)-(a.vintage||0);
    if(f.sort==="bottles")return(b.bottles||0)-(a.bottles||0);
    if(f.sort==="costDesc")return (safeNum(b.cellarMeta?.pricePerBottle)||0)-(safeNum(a.cellarMeta?.pricePerBottle)||0);
    if(f.sort==="costAsc")return (safeNum(a.cellarMeta?.pricePerBottle)||0)-(safeNum(b.cellarMeta?.pricePerBottle)||0);
    if(f.sort==="recent"){
      const delta=wineAddedTimestamp(b)-wineAddedTimestamp(a);
      if(delta!==0) return delta;
      return (b.name||"").localeCompare(a.name||"");
    }
    return a.name.localeCompare(b.name);
  });
};

const FilterPanel=({filters,setFilters,wines,onClose})=>{
  const col=wines.filter(w=>!w.wishlist);
  const locs=dedupeLocations(col.map(w=>w.location));
  const sections=dedupeLocations(
    col
      .filter(w=>normalizeLocation(w.location)==="Kennards")
      .map(w=>normalizeKennardsSection(w.cellarMeta?.locationSection||""))
      .filter(Boolean)
  );
  const varietals=[...new Set(col.map(resolveVarietal).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  const regions=[...new Set(col
    .map(w=>deriveRegionCountry(w.origin||"").region)
    .filter(Boolean)
    .filter(r=>!normalizeCountryName(r))
  )].sort();
  const countries=[...new Set(col.map(w=>deriveRegionCountry(w.origin||"").country).filter(Boolean))].sort();
  const [local,setLocal]=useState({...filters});
  const chip=(active)=>({padding:"7px 13px",borderRadius:20,border:active?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:active?"rgba(var(--accentRgb),0.1)":"var(--inputBg)",color:active?"var(--accent)":"var(--text)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all 0.15s"});
  return(
    <div>
      <ModalHeader title="Filter & Sort" onClose={onClose}/>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Sort By</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {SORTS.map(o=><button key={o.value} onClick={()=>setLocal(p=>({...p,sort:o.value}))} style={chip(local.sort===o.value)}>{o.label}</button>)}
      </div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Varietal</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {varietals.map(v=>(
          <button key={v} onClick={()=>setLocal(p=>({...p,varietal:p.varietal===v?"":v}))} style={chip(local.varietal===v)}>
            {v}
          </button>
        ))}
      </div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Drink Readiness</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {[{id:"ready",label:"Ready"},{id:"notReady",label:"Not Ready"},{id:"past",label:"Past Peak"},{id:"noWindow",label:"No Window"}].map(o=><button key={o.id} onClick={()=>setLocal(p=>({...p,readiness:p.readiness===o.id?"":o.id}))} style={chip(local.readiness===o.id)}>{o.label}</button>)}
      </div>
      <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Price Band</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
        {[{id:"budget",label:"<$25"},{id:"mid",label:"$25-$59"},{id:"premium",label:"$60-$119"},{id:"luxury",label:"$120+"}].map(o=><button key={o.id} onClick={()=>setLocal(p=>({...p,priceBand:p.priceBand===o.id?"":o.id}))} style={chip(local.priceBand===o.id)}>{o.label}</button>)}
      </div>
      {regions.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Origin Region</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
            {regions.map(rg=><button key={rg} onClick={()=>setLocal(p=>({...p,region:p.region===rg?"":rg}))} style={chip(local.region===rg)}>{rg}</button>)}
          </div>
        </div>
      )}
      {countries.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Country</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
            {countries.map(c=><button key={c} onClick={()=>setLocal(p=>({...p,country:p.country===c?"":c}))} style={chip(local.country===c)}>{c}</button>)}
          </div>
        </div>
      )}
      {locs.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Location</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
            {locs.map(l=><button key={l} onClick={()=>setLocal(p=>{const next=p.location===l?"":l;return{...p,location:next,section:next==="Kennards"?p.section:""};})} style={chip(local.location===l)}>{l}</button>)}
          </div>
        </div>
      )}
      {local.location==="Kennards"&&sections.length>0&&(
        <div>
          <div style={{fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Kennards Placement</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:18}}>
            {sections.map(sec=><button key={sec} onClick={()=>setLocal(p=>({...p,section:p.section===sec?"":sec}))} style={chip(local.section===sec)}>{sec}</button>)}
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
  <div style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:20,background:"rgba(var(--accentRgb),0.1)",border:"1.5px solid rgba(var(--accentRgb),0.25)"}}>
    <span style={{fontSize:12,color:"var(--accent)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600}}>{label}</span>
    <button onClick={onX} style={{background:"none",border:"none",color:"var(--accent)",padding:0,lineHeight:1,display:"flex",cursor:"pointer"}}><Icon n="x" size={11}/></button>
  </div>
);

/* ── COLLECTION ───────────────────────────────────────────────── */
const CollectionScreen=({wines,onAdd,onUpdate,onDelete,onAdjustConsumption,desktop,savedLocations,onSaveLocation,onRemoveLocation,deletedWines=[],onRestoreDeleted,onDismissDeleted})=>{
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const [adding,setAdding]=useState(false);
  const [rewindOpen,setRewindOpen]=useState(false);
  const [recentDelete,setRecentDelete]=useState(null);
  const [search,setSearch]=useState("");
  const [filters,setFilters]=useState(DEFAULT_FILTERS);
  const [filterOpen,setFilterOpen]=useState(false);
  const col=wines.filter(w=>!w.wishlist);
  const locationOptions=dedupeLocations(col.map(w=>w.location));
  const reviewerSuggestions=reviewerSuggestionsFromWines(col);
  const filt=applyFilters(wines,filters,search);
  const bottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const active=hasFilters(filters);
  useEffect(()=>{
    if(!recentDelete)return;
    const t=setTimeout(()=>setRecentDelete(null),10000);
    return()=>clearTimeout(t);
  },[recentDelete]);
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
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wines, regions, countries…" style={{paddingLeft:38,borderRadius:14}}/>
          <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
        </div>
        <button onClick={()=>setRewindOpen(true)} style={{width:44,height:44,borderRadius:14,background:deletedWines.length?"rgba(var(--accentRgb),0.1)":"var(--card)",border:deletedWines.length?"1.5px solid rgba(var(--accentRgb),0.4)":"1.5px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:deletedWines.length?"var(--accent)":"var(--sub)",flexShrink:0,position:"relative",cursor:"pointer"}} title="Rewind deleted wines">
          <Icon n="rewind" size={17}/>
          {deletedWines.length>0&&<div style={{position:"absolute",top:-3,right:-3,minWidth:16,height:16,padding:"0 4px",borderRadius:999,background:"var(--accent)",color:"#fff",fontSize:10,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid var(--bg)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{Math.min(99,deletedWines.length)}</div>}
        </button>
        <button onClick={()=>setFilterOpen(true)} style={{width:44,height:44,borderRadius:14,background:active?"rgba(var(--accentRgb),0.12)":"var(--card)",border:active?"1.5px solid var(--accent)":"1.5px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:active?"var(--accent)":"var(--sub)",flexShrink:0,position:"relative",cursor:"pointer"}}>
          <Icon n="filter" size={17}/>
          {active&&<div style={{position:"absolute",top:-2,right:-2,width:7,height:7,borderRadius:"50%",background:"var(--accent)",border:"1.5px solid var(--bg)"}}/>}
        </button>
        <button onClick={()=>setAdding(true)} style={{width:44,height:44,borderRadius:14,background:"var(--accent)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",color:"white",flexShrink:0,boxShadow:"0 4px 16px rgba(var(--accentRgb),0.35)",cursor:"pointer"}}>
          <Icon n="plus" size={20}/>
        </button>
      </div>
      {active&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
          {filters.sort!=="name"&&<Chip label={SORTS.find(o=>o.value===filters.sort)?.label} onX={()=>setFilters(p=>({...p,sort:"name"}))}/>}
          {filters.varietal&&<Chip label={filters.varietal} onX={()=>setFilters(p=>({...p,varietal:""}))}/>}
          {filters.readiness&&<Chip label={{ready:"Ready",notReady:"Not Ready",past:"Past Peak",noWindow:"No Window"}[filters.readiness]||filters.readiness} onX={()=>setFilters(p=>({...p,readiness:""}))}/>}
          {filters.priceBand&&<Chip label={{budget:"<$25",mid:"$25-$59",premium:"$60-$119",luxury:"$120+"}[filters.priceBand]||filters.priceBand} onX={()=>setFilters(p=>({...p,priceBand:""}))}/>}
          {filters.region&&<Chip label={filters.region} onX={()=>setFilters(p=>({...p,region:""}))}/>}
          {filters.country&&<Chip label={filters.country} onX={()=>setFilters(p=>({...p,country:""}))}/>}
          {filters.location&&<Chip label={filters.location} onX={()=>setFilters(p=>({...p,location:"",section:""}))}/>}
          {filters.section&&<Chip label={`Kennards: ${filters.section}`} onX={()=>setFilters(p=>({...p,section:""}))}/>}
          <button onClick={()=>setFilters(DEFAULT_FILTERS)} style={{padding:"4px 10px",borderRadius:20,border:"none",background:"none",color:"var(--sub)",fontSize:12,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",textDecoration:"underline"}}>Clear all</button>
        </div>
      )}
      {recentDelete&&(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 12px",marginBottom:12,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:12,color:"var(--text)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{recentDelete.name} deleted</div>
            <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Use undo or open rewind history from the top button.</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
            <button onClick={async()=>{await onRestoreDeleted?.(recentDelete.id);setRecentDelete(null);}} style={{padding:"7px 10px",borderRadius:10,border:"1.5px solid var(--accent)",background:"rgba(var(--accentRgb),0.1)",color:"var(--accent)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Undo</button>
          </div>
        </div>
      )}
      {filt.length===0
        ? <Empty icon="wine" text={search||active?"No wines match your filters.":"Your cellar is empty. Add your first wine."}/>
        : <div style={{display:desktop?"grid":"block",gridTemplateColumns:desktop?"repeat(auto-fill,minmax(290px,1fr))":"none",gap:desktop?12:0}}>
            {filt.map(w=><WineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
          </div>
      }
      <Modal show={!!sel&&!editing} onClose={()=>setSel(null)} wide>
        {sel&&<WineDetail wine={sel} onEdit={()=>setEditing(true)} onDelete={async()=>{const deletedId=await onDelete(sel.id);setRecentDelete({id:deletedId||sel.id,name:sel.name||"Wine"});setSel(null);}} onAdjustConsumption={async delta=>{const updated=await onAdjustConsumption?.(sel.id,delta);if(updated)setSel(updated);}}/>}
      </Modal>
      <Modal show={editing} onClose={()=>setEditing(false)} wide>
        <WineForm
          initial={sel}
          onSave={w=>{onUpdate(w);setSel(w);setEditing(false);}}
          onClose={()=>setEditing(false)}
          locationOptions={locationOptions}
          savedLocations={savedLocations}
          onSaveLocation={onSaveLocation}
          onRemoveLocation={onRemoveLocation}
          reviewerSuggestions={reviewerSuggestions}
        />
      </Modal>
      <Modal show={adding} onClose={()=>setAdding(false)} wide>
        <WineForm
          onSave={w=>{onAdd(w);setAdding(false);}}
          onClose={()=>setAdding(false)}
          locationOptions={locationOptions}
          savedLocations={savedLocations}
          onSaveLocation={onSaveLocation}
          onRemoveLocation={onRemoveLocation}
          reviewerSuggestions={reviewerSuggestions}
        />
      </Modal>
      <Modal show={filterOpen} onClose={()=>setFilterOpen(false)}>
        <FilterPanel filters={filters} setFilters={setFilters} wines={wines} onClose={()=>setFilterOpen(false)}/>
      </Modal>
      <Modal show={rewindOpen} onClose={()=>setRewindOpen(false)} wide>
        <ModalHeader title="Rewind Deleted Wines" onClose={()=>setRewindOpen(false)}/>
        {deletedWines.length===0?(
          <div style={{background:"var(--inputBg)",borderRadius:12,padding:"14px",border:"1px solid var(--border)",fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            No deleted wines in rewind history.
          </div>
        ):(
          <div style={{display:"grid",gap:8}}>
            {deletedWines.map(entry=>{
              const w=entry.wine||{};
              const when=entry.deletedAt?new Date(entry.deletedAt).toLocaleString("en-AU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
              return(
                <div key={w.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 12px",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{w.name||"Wine"}</div>
                    <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{[w.vintage,resolveVarietal(w),w.origin].filter(Boolean).join(" · ")||"Deleted wine entry"}{when?` · ${when}`:""}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                    <button onClick={async()=>{await onRestoreDeleted?.(w.id);setRecentDelete(null);}} style={{padding:"7px 10px",borderRadius:10,border:"1.5px solid var(--accent)",background:"rgba(var(--accentRgb),0.1)",color:"var(--accent)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Restore</button>
                    <button onClick={()=>onDismissDeleted?.(w.id)} style={{width:30,height:30,borderRadius:10,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--sub)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="x" size={13}/></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
};

/* ── AUDIT ────────────────────────────────────────────────────── */
const AuditScreen=({wines,desktop,onSetWineBottles,onRemoveWine,onRevokeAudit})=>{
  const col=wines.filter(w=>!w.wishlist);
  const locations=dedupeLocations(col.map(w=>w.location));
  const [audits,setAudits]=useState(()=>readAudits());
  const [activeId,setActiveId]=useState(null);
  const [showIntro,setShowIntro]=useState(true);
  const [syncState,setSyncState]=useState("checking"); // checking | ready | unavailable
  const [setupOpen,setSetupOpen]=useState(false);
  const [setupName,setSetupName]=useState("");
  const [setupAll,setSetupAll]=useState(true);
  const [setupRealtime,setSetupRealtime]=useState(false);
  const [setupLocations,setSetupLocations]=useState([]);
  const [entryEditor,setEntryEditor]=useState(null);
  const [completeOpen,setCompleteOpen]=useState(false);
  const [applyOnComplete,setApplyOnComplete]=useState(false);
  const [actionAuditId,setActionAuditId]=useState(null);
  const [confirmDeleteId,setConfirmDeleteId]=useState(null);
  const [confirmRevokeId,setConfirmRevokeId]=useState(null);
  const [busy,setBusy]=useState(false);
  const [statusMsg,setStatusMsg]=useState("");

  const fmtAuditDate=iso=>{
    if(!iso) return "";
    const d=new Date(iso);
    if(Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-AU",{day:"numeric",month:"short",year:"numeric"});
  };
  const nowAuditLabel=()=>{
    const d=new Date();
    return `Audit ${d.toLocaleDateString("en-AU",{day:"2-digit",month:"short",year:"numeric"})}`;
  };
  const locationTextFromItem=item=>[
    normalizeLocation(item.location||""),
    normalizeKennardsSection(item.locationSection||""),
    (item.locationSlot||"").toString().trim(),
  ].filter(Boolean).join(" · ");
  const itemSummary=item=>{
    if(item.decision==="present"){
      const amt=Math.max(0,Math.round(safeNum(item.countedAmount)||0));
      return item.countType==="boxes"?`${amt} boxes recorded`:`${amt} bottles confirmed`;
    }
    if(item.decision==="missing"){
      return item.missingAction==="remove"?"Marked missing · remove from cellar":"Marked missing · keep in cellar";
    }
    return "Pending check";
  };

  useEffect(()=>{
    try{localStorage.setItem(AUDITS_KEY,JSON.stringify(audits.slice(0,60)))}catch{}
  },[audits]);
  useEffect(()=>{
    let cancelled=false;
    const localAudits=readAudits();
    setAudits(localAudits);
    async function loadRemote(){
      const res=await db.listAudits();
      if(cancelled) return;
      if(!res.ok){
        setSyncState("unavailable");
        return;
      }
      setSyncState("ready");
      const remote=(res.rows||[]).map(fromDbAudit).filter(a=>a&&a.id);
      const mergedById=new Map(remote.map(a=>[a.id,a]));
      const localOnly=localAudits.filter(a=>!mergedById.has(a.id));
      if(localOnly.length){
        await Promise.all(localOnly.map(a=>db.upsertAudit(toDbAudit(a))));
        localOnly.forEach(a=>mergedById.set(a.id,a));
      }
      if(cancelled) return;
      const merged=[...mergedById.values()].sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
      setAudits(merged);
    }
    loadRemote();
    return()=>{cancelled=true;};
  },[]);
  useEffect(()=>{
    if(activeId&&!audits.some(a=>a.id===activeId)) setActiveId(null);
  },[audits,activeId]);
  useEffect(()=>{
    if(!statusMsg) return;
    const t=setTimeout(()=>setStatusMsg(""),5000);
    return()=>clearTimeout(t);
  },[statusMsg]);

  const syncAuditRow=async audit=>{
    if(syncState!=="ready") return;
    const res=await db.upsertAudit(toDbAudit(audit));
    if(!res.ok){
      console.error("audit sync failed",res.error);
      setSyncState("unavailable");
    }
  };
  const upsertAudit=(auditId,updater)=>{
    setAudits(prev=>{
      let changed=null;
      const next=prev.map(a=>{
        if(a.id!==auditId) return a;
        changed=normalizeAuditRecord(updater(a));
        return changed;
      });
      if(changed){
        Promise.resolve().then(()=>syncAuditRow(changed));
      }
      return next;
    });
  };
  const patchAuditItem=(auditId,wineId,patch)=>{
    upsertAudit(auditId,audit=>{
      const nextItem={...(audit.items?.[wineId]||{}),...patch,updatedAt:new Date().toISOString()};
      return{
        ...audit,
        updatedAt:new Date().toISOString(),
        items:{...(audit.items||{}),[wineId]:nextItem},
      };
    });
  };

  const activeAudit=audits.find(a=>a.id===activeId)||null;
  const wineById=Object.fromEntries(col.map(w=>[w.id,w]));
  const auditRows=activeAudit
    ? Object.values(activeAudit.items||{})
      .map(item=>({item,wine:wineById[item.wineId]||null}))
      .sort((a,b)=>{
        const locA=locationTextFromItem(a.item);
        const locB=locationTextFromItem(b.item);
        if(locA!==locB) return locA.localeCompare(locB);
        return (a.item.wineName||"").localeCompare(b.item.wineName||"");
      })
    : [];
  const auditsSorted=[...audits].sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""));
  const latestAuditId=auditsSorted[0]?.id||null;
  const actionAudit=audits.find(a=>a.id===actionAuditId)||null;
  const totalRows=auditRows.length;
  const checkedRows=auditRows.filter(r=>r.item.decision&&r.item.decision!=="pending").length;
  const pendingUnsyncedCount=activeAudit
    ? Object.values(activeAudit.items||{}).filter(item=>item&&item.decision!=="pending"&&!item.synced).length
    : 0;

  const openStartAudit=()=>{
    setSetupName(nowAuditLabel());
    setSetupAll(true);
    setSetupRealtime(false);
    setSetupLocations(locations);
    setSetupOpen(true);
  };
  const toggleSetupLocation=loc=>{
    setSetupLocations(prev=>{
      const key=locationKey(loc);
      const has=prev.some(x=>locationKey(x)===key);
      if(has) return prev.filter(x=>locationKey(x)!==key);
      return dedupeLocations([...prev,loc]);
    });
  };
  const createAudit=()=>{
    const chosen=setupAll?locations:dedupeLocations(setupLocations);
    const chosenKeys=new Set(chosen.map(locationKey));
    const scope=col.filter(w=>setupAll||chosenKeys.has(locationKey(w.location)));
    if(scope.length===0){
      setStatusMsg("No wines found for the selected locations.");
      return;
    }
    const stamp=new Date().toISOString();
    const items=Object.fromEntries(scope.map(w=>[
      w.id,
      {
        wineId:w.id,
        wineName:w.name||"Wine",
        origin:w.origin||"",
        varietal:resolveVarietal(w),
        vintage:w.vintage||null,
        location:normalizeLocation(w.location||""),
        locationSection:normalizeKennardsSection(w.cellarMeta?.locationSection||""),
        locationSlot:w.locationSlot||"",
        expectedBottles:Math.max(0,Math.round(safeNum(w.bottles)||0)),
        decision:"pending",
        countType:"bottles",
        countedAmount:Math.max(0,Math.round(safeNum(w.bottles)||0)),
        missingAction:"keep",
        synced:false,
        beforeWine:{...w,cellarMeta:{...(w.cellarMeta||{})}},
        updatedAt:stamp,
      }
    ]));
    const created={
      id:`audit-${uid()}`,
      name:(setupName||"").trim()||nowAuditLabel(),
      createdAt:stamp,
      updatedAt:stamp,
      completedAt:"",
      status:"in_progress",
      realtimeSync:!!setupRealtime,
      locations:chosen,
      items,
    };
    setAudits(prev=>[created,...prev]);
    syncAuditRow(created);
    setActiveId(created.id);
    setSetupOpen(false);
    setStatusMsg(`Started ${created.name}.`);
  };
  const deleteAudit=async()=>{
    if(!confirmDeleteId) return;
    setAudits(prev=>prev.filter(a=>a.id!==confirmDeleteId));
    if(activeId===confirmDeleteId) setActiveId(null);
    if(syncState==="ready"){
      const res=await db.delAudit(confirmDeleteId);
      if(!res.ok){
        console.error("audit delete sync failed",res.error);
        setSyncState("unavailable");
      }
    }
    setStatusMsg("Audit deleted.");
    setConfirmDeleteId(null);
  };
  const revokeAudit=async()=>{
    if(!confirmRevokeId||busy) return;
    const target=audits.find(a=>a.id===confirmRevokeId);
    if(!target){setConfirmRevokeId(null);return;}
    const latestId=[...audits].sort((a,b)=>(b.updatedAt||"").localeCompare(a.updatedAt||""))[0]?.id;
    if(target.id!==latestId){
      setConfirmRevokeId(null);
      setStatusMsg("Only the most recent audit can be revoked.");
      return;
    }
    setBusy(true);
    const result=await onRevokeAudit?.(target);
    setBusy(false);
    upsertAudit(target.id,a=>({...a,status:"revoked",updatedAt:new Date().toISOString()}));
    setStatusMsg(`Audit revoked${result?.restored?` · ${result.restored} wines restored`:""}.`);
    setConfirmRevokeId(null);
  };

  const syncAuditItem=async item=>{
    if(item.decision==="present"){
      if(item.countType!=="bottles") return {kind:"skip"};
      const amt=Math.max(0,Math.round(safeNum(item.countedAmount)||0));
      const updated=await onSetWineBottles?.(item.wineId,amt);
      return updated?{kind:"applied"}:{kind:"missing"};
    }
    if(item.decision==="missing"){
      if(item.missingAction==="remove"){
        const removed=await onRemoveWine?.(item.wineId);
        return removed?{kind:"applied"}:{kind:"missing"};
      }
      return {kind:"noop"};
    }
    return {kind:"noop"};
  };

  const saveEntryEditor=async()=>{
    if(!activeAudit||!entryEditor||busy) return;
    const base=activeAudit.items?.[entryEditor.wineId];
    if(!base) return;
    const next={
      ...base,
      decision:entryEditor.mode==="present"?"present":"missing",
      countType:entryEditor.mode==="present"?(entryEditor.countType||"bottles"):(base.countType||"bottles"),
      countedAmount:entryEditor.mode==="present"?Math.max(0,Math.round(safeNum(entryEditor.countedAmount)||0)):(base.countedAmount||0),
      missingAction:entryEditor.mode==="missing"?(entryEditor.missingAction||"keep"):(base.missingAction||"keep"),
      synced:false,
    };
    patchAuditItem(activeAudit.id,entryEditor.wineId,next);
    setEntryEditor(null);
    if(!activeAudit.realtimeSync){
      setStatusMsg("Audit entry saved.");
      return;
    }
    setBusy(true);
    const res=await syncAuditItem(next);
    setBusy(false);
    if(res.kind==="applied"||res.kind==="noop"){
      patchAuditItem(activeAudit.id,next.wineId,{synced:true});
      setStatusMsg(res.kind==="applied"?"Cellar updated in real time.":"Audit entry saved.");
    }else if(res.kind==="skip"){
      setStatusMsg("Saved. Box counts are recorded in audit only.");
    }else{
      setStatusMsg("Wine no longer exists in cellar; saved in audit history.");
    }
  };

  const applyAuditChanges=async(audit,{markCompleted=false}={})=>{
    if(!audit||busy) return;
    const items=Object.values(audit.items||{});
    if(items.length===0){
      if(markCompleted){
        upsertAudit(audit.id,a=>({...a,status:"completed",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
      }
      return;
    }
    setBusy(true);
    let applied=0,skipped=0,missing=0;
    const syncedIds=[];
    for(const item of items){
      if(!item||item.decision==="pending"||item.synced) continue;
      const res=await syncAuditItem(item);
      if(res.kind==="applied"){applied+=1;syncedIds.push(item.wineId);}
      else if(res.kind==="noop"){syncedIds.push(item.wineId);}
      else if(res.kind==="skip"){skipped+=1;}
      else{missing+=1;}
    }
    upsertAudit(audit.id,a=>{
      const nextItems={...(a.items||{})};
      syncedIds.forEach(id=>{
        if(nextItems[id]) nextItems[id]={...nextItems[id],synced:true,updatedAt:new Date().toISOString()};
      });
      return{
        ...a,
        items:nextItems,
        status:markCompleted?"completed":a.status,
        completedAt:markCompleted?new Date().toISOString():a.completedAt,
        updatedAt:new Date().toISOString(),
      };
    });
    setBusy(false);
    const parts=[`${applied} updated`];
    if(skipped) parts.push(`${skipped} box entries kept in audit only`);
    if(missing) parts.push(`${missing} already missing`);
    setStatusMsg(parts.join(" · "));
  };

  const completeAudit=async()=>{
    if(!activeAudit||busy) return;
    if(applyOnComplete){
      await applyAuditChanges(activeAudit,{markCompleted:true});
    }else{
      upsertAudit(activeAudit.id,a=>({...a,status:"completed",completedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}));
      setStatusMsg("Audit completed without changing cellar.");
    }
    setCompleteOpen(false);
    setActiveId(null);
  };

  return(
    <div>
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Inventory Control</div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:10}}>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1}}>
            Audit <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>{audits.length} saved</span>
          </div>
          <button onClick={openStartAudit} style={{padding:"10px 14px",borderRadius:12,border:"none",background:"var(--accent)",color:"#fff",fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"0 6px 18px rgba(var(--accentRgb),0.28)",cursor:"pointer",whiteSpace:"nowrap"}}>
            Start New Audit
          </button>
        </div>
      </div>

      {statusMsg&&(
        <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:12,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
          {statusMsg}
        </div>
      )}
      {syncState!=="ready"&&(
        <div style={{background:"rgba(184,50,50,0.08)",border:"1px solid rgba(184,50,50,0.22)",borderRadius:12,padding:"10px 12px",marginBottom:12,fontSize:12,color:"#9C2B2B",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.55}}>
          {syncState==="checking"
            ? "Checking audit cloud sync…"
            : "Audit cloud sync is unavailable. Audits are saving locally on this device until the Supabase audits table is configured."}
        </div>
      )}

      {!activeAudit&&(
        <>
          {auditsSorted.length===0?(
            <div style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:16,padding:"18px"}}>
              <div style={{fontSize:15,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:6}}>No audits yet</div>
              <div style={{fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>
                Start an audit to verify cellar stock location-by-location and optionally sync the results back to your inventory.
              </div>
            </div>
          ):(
            <div style={{display:"grid",gap:9}}>
              {auditsSorted.map(a=>{
                const rows=Object.values(a.items||{});
                const done=rows.filter(it=>it.decision&&it.decision!=="pending").length;
                const pct=rows.length?Math.round((done/rows.length)*100):0;
                const statusBg=a.status==="completed"?"rgba(47,133,90,0.12)":a.status==="revoked"?"rgba(88,88,88,0.18)":"rgba(var(--accentRgb),0.12)";
                const statusColor=a.status==="completed"?"#2F855A":a.status==="revoked"?"#5A5A5A":"var(--accent)";
                return(
                  <div key={a.id} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"12px 13px",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",overflow:"hidden"}}>
                    <div style={{minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:4}}>
                        <div style={{fontSize:14,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{a.name}</div>
                        <span style={{padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700,background:statusBg,color:statusColor,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                          {a.status==="completed"?"Completed":a.status==="revoked"?"Revoked":"In progress"}
                        </span>
                      </div>
                      <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:5}}>
                        {fmtAuditDate(a.createdAt)} · {done}/{rows.length} checked · {pct}%
                      </div>
                      <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                        {(a.locations||[]).join(" · ")||"All locations"}
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                      <button onClick={()=>setActionAuditId(a.id)} style={{width:30,height:30,borderRadius:10,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--sub)",fontSize:18,lineHeight:1,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} aria-label="Audit actions">⋯</button>
                      <button onClick={()=>setActiveId(a.id)} style={{padding:"7px 10px",borderRadius:10,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",whiteSpace:"nowrap"}}>
                        Open
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeAudit&&(
        <div>
          <div style={{background:"linear-gradient(145deg,#1D1715 0%,#2C201C 55%,#1C1614 100%)",border:"1px solid rgba(255,255,255,0.14)",borderRadius:16,padding:"14px",marginBottom:12,boxShadow:"0 10px 26px rgba(0,0,0,0.26)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:10}}>
              <button onClick={()=>setActiveId(null)} style={{padding:"7px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,0.2)",background:"rgba(255,255,255,0.08)",color:"#F6EEE8",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer",whiteSpace:"nowrap"}}>
                ← Back to Audits
              </button>
              <div style={{padding:"4px 9px",borderRadius:999,background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.16)",fontSize:11,fontWeight:700,color:"#EADFD8",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                {checkedRows}/{totalRows} Verified
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:8}}>
              <div style={{minWidth:0}}>
                <div style={{fontSize:18,fontWeight:800,color:"#FFFFFF",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.2}}>{activeAudit.name}</div>
                <div style={{fontSize:12,color:"rgba(255,255,255,0.72)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2}}>
                  {fmtAuditDate(activeAudit.createdAt)} · {activeAudit.realtimeSync?"Real-time Sync":"Manual Sync"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {(activeAudit.locations||[]).map(loc=><span key={loc} style={{padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:700,color:"#FAF2EC",background:"rgba(255,255,255,0.12)",border:"1px solid rgba(255,255,255,0.16)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{loc}</span>)}
            </div>
            {!activeAudit.realtimeSync&&(
              <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9,flexWrap:"wrap"}}>
                <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:999,background:"rgba(255,255,255,0.08)",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",border:"1px solid rgba(255,255,255,0.16)"}}>
                  <span style={{fontSize:10.5,fontWeight:800,letterSpacing:"0.6px",textTransform:"uppercase",color:"#FFF7F2",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Manual Sync</span>
                </div>
                <div style={{fontSize:11.5,color:"rgba(255,255,255,0.82)",fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.45}}>
                  {pendingUnsyncedCount>0?`${pendingUnsyncedCount} pending update${pendingUnsyncedCount===1?"":"s"}`:"No pending updates"}
                </div>
              </div>
            )}
            <div style={{display:"flex",flexWrap:"wrap",gap:7,justifyContent:"flex-end"}}>
              {!activeAudit.realtimeSync&&(
                <button disabled={busy||pendingUnsyncedCount===0} onClick={()=>applyAuditChanges(activeAudit)} style={{padding:"7px 10px",borderRadius:10,border:"1px solid rgba(255,255,255,0.24)",background:"rgba(255,255,255,0.08)",color:"#FFF7F3",fontSize:11.5,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:(busy||pendingUnsyncedCount===0)?"default":"pointer",opacity:(busy||pendingUnsyncedCount===0)?0.45:1,whiteSpace:"nowrap"}}>
                  Apply Pending Updates {pendingUnsyncedCount>0?`(${pendingUnsyncedCount})`:""}
                </button>
              )}
              <button disabled={busy} onClick={()=>{setApplyOnComplete(false);setCompleteOpen(true);}} style={{padding:"7px 11px",borderRadius:10,border:"none",background:"var(--accent)",color:"#fff",fontSize:11.5,fontWeight:800,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:busy?"default":"pointer",opacity:busy?0.7:1,boxShadow:"0 6px 16px rgba(var(--accentRgb),0.35)",whiteSpace:"nowrap"}}>
                Complete Audit
              </button>
            </div>
          </div>

          {auditRows.length===0?(
            <Empty icon="audit" text="No wines are scoped in this audit."/>
          ):(
            <div style={{display:"grid",gridTemplateColumns:desktop?"repeat(2,minmax(0,1fr))":"1fr",gap:8,overflow:"hidden"}}>
              {auditRows.map(({item,wine})=>{
                const statusLabel=item.decision==="present"?"Present":item.decision==="missing"?"Missing":"Pending";
                const statusColor=item.decision==="present"?"#2F855A":item.decision==="missing"?"#B83232":"var(--sub)";
                const statusBg=item.decision==="present"?"rgba(47,133,90,0.12)":item.decision==="missing"?"rgba(184,50,50,0.12)":"var(--inputBg)";
                const type=resolveWineType(wine||{grape:item.varietal,name:item.wineName});
                const varietalLabel=item.varietal||resolveVarietal(wine||{});
                const vintageLabel=item.vintage||wine?.vintage;
                return(
                  <div key={item.wineId} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:14,padding:"10px 11px",overflow:"hidden",boxShadow:"0 2px 8px var(--shadow)"}}>
                    <div style={{display:"flex",justifyContent:"space-between",gap:10}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontSize:14.5,fontWeight:800,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {wine?.name||item.wineName}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginTop:5}}>
                          <WineTypePill type={type} label={varietalLabel}/>
                          {vintageLabel&&<span style={{padding:"2px 7px",borderRadius:20,fontSize:10,fontWeight:700,color:"var(--text)",background:"var(--inputBg)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{vintageLabel}</span>}
                        </div>
                        <div style={{fontSize:10.8,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {item.origin||wine?.origin||""}
                        </div>
                        <div style={{fontSize:10.8,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                          {locationTextFromItem(item)||formatWineLocation(wine)||"No location"}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{display:"inline-flex",alignItems:"center",justifyContent:"center",padding:"3px 9px",minHeight:20,minWidth:64,borderRadius:20,fontSize:10,fontWeight:700,color:statusColor,background:statusBg,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>
                          {statusLabel}
                        </div>
                        <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                          Expected {Math.max(0,Math.round(safeNum(wine?.bottles)||safeNum(item.expectedBottles)||0))}
                        </div>
                      </div>
                    </div>
                    <div style={{fontSize:10.8,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginTop:6,marginBottom:7}}>
                      {itemSummary(item)}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                      <button disabled={busy} onClick={()=>setEntryEditor({wineId:item.wineId,mode:"present",countType:item.countType||"bottles",countedAmount:String(Math.max(0,Math.round(safeNum(item.countedAmount)||safeNum(wine?.bottles)||safeNum(item.expectedBottles)||0)))})} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid rgba(47,133,90,0.35)",background:item.decision==="present"?"rgba(47,133,90,0.12)":"var(--inputBg)",color:"#2F855A",fontSize:11.5,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:busy?"default":"pointer",opacity:busy?0.6:1}}>
                        ✓ Present
                      </button>
                      <button disabled={busy} onClick={()=>setEntryEditor({wineId:item.wineId,mode:"missing",missingAction:item.missingAction||"keep"})} style={{padding:"7px 9px",borderRadius:10,border:"1.5px solid rgba(184,50,50,0.35)",background:item.decision==="missing"?"rgba(184,50,50,0.12)":"var(--inputBg)",color:"#B83232",fontSize:11.5,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:busy?"default":"pointer",opacity:busy?0.6:1}}>
                        ✕ Missing
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <Modal show={showIntro} onClose={()=>setShowIntro(false)} wide>
        <ModalHeader title="How Audit Mode Works" onClose={()=>setShowIntro(false)}/>
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:800,letterSpacing:"1.1px",textTransform:"uppercase",color:"var(--accent)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:4}}>Audit Flow</div>
          <div style={{fontSize:25,fontWeight:900,color:"var(--text)",lineHeight:1.1,fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:"0.5px",marginBottom:6}}>
            VERIFY YOUR STOCK
          </div>
          <div style={{fontSize:13.5,color:"var(--sub)",lineHeight:1.55,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Check what is physically in your cellar and keep inventory accurate.
          </div>
        </div>
        <div style={{position:"relative",marginBottom:15}}>
          {[
            ["Select Locations","Choose one location or audit your full cellar."],
            ["Mark Each Wine","Set each item as Present or Missing and record quantity."],
            ["Apply & Save","Finish the audit and choose if inventory should update."],
          ].map(([title,desc],idx)=>(
            <div key={title} style={{display:"grid",gridTemplateColumns:"22px 1fr",gap:10,alignItems:"center",padding:idx<2?"0 0 10px":"0"}}>
              <div style={{position:"relative",width:22,minHeight:22,height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                {idx>0&&<div style={{position:"absolute",left:"50%",top:-10,bottom:"50%",width:2,transform:"translateX(-50%)",borderRadius:2,background:"rgba(var(--accentRgb),0.28)"}}/>}
                {idx<2&&<div style={{position:"absolute",left:"50%",top:"50%",bottom:-10,width:2,transform:"translateX(-50%)",borderRadius:2,background:"rgba(var(--accentRgb),0.28)"}}/>}
                <div style={{width:22,height:22,borderRadius:"50%",background:"var(--accent)",color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Plus Jakarta Sans',sans-serif",position:"relative",zIndex:1,boxShadow:"0 2px 8px rgba(var(--accentRgb),0.35)"}}>
                  {idx+1}
                </div>
              </div>
              <div style={{padding:"9px 10px",borderRadius:12,background:"linear-gradient(140deg,rgba(var(--accentRgb),0.15) 0%,rgba(var(--accentRgb),0.05) 100%)",border:"1px solid rgba(var(--accentRgb),0.22)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.25)"}}>
                <div style={{fontSize:12.2,fontWeight:800,letterSpacing:"0.55px",textTransform:"uppercase",color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:2}}>
                  {title}
                </div>
                <div style={{fontSize:12.5,color:"var(--sub)",lineHeight:1.55,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                  {desc}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:16}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)",display:"inline-block",flexShrink:0}}/>
          <span style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            <strong style={{color:"var(--text)"}}>Autosave ON.</strong> Close anytime and continue later.
          </span>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setShowIntro(false)} full>Close</Btn>
          <Btn onClick={()=>{setShowIntro(false);openStartAudit();}} full>Start Audit</Btn>
        </div>
      </Modal>

      <Modal show={setupOpen} onClose={()=>setSetupOpen(false)} wide>
        <ModalHeader title="Start New Audit" onClose={()=>setSetupOpen(false)}/>
        <Field label="Audit Name" value={setupName} onChange={setSetupName} placeholder={nowAuditLabel()}/>
        <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Locations</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
          <button onClick={()=>setSetupAll(v=>{const next=!v;if(next)setSetupLocations(locations);return next;})} style={{padding:"7px 12px",borderRadius:20,border:setupAll?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:setupAll?"rgba(var(--accentRgb),0.12)":"var(--inputBg)",color:setupAll?"var(--accent)":"var(--text)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
            All Locations
          </button>
          {locations.map(loc=>{
            const active=setupLocations.some(x=>locationKey(x)===locationKey(loc));
            return(
              <button key={loc} onClick={()=>{if(setupAll){setSetupAll(false);setSetupLocations([loc]);return;}toggleSetupLocation(loc);}} style={{padding:"7px 12px",borderRadius:20,border:active?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:active?"rgba(var(--accentRgb),0.12)":"var(--inputBg)",color:active?"var(--accent)":"var(--text)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
                {loc}
              </button>
            );
          })}
        </div>
        <div onClick={()=>setSetupRealtime(v=>!v)} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setSetupRealtime(v=>!v);}}}
          style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"11px 12px",borderRadius:12,border:"1.5px solid var(--border)",background:"var(--card)",width:"100%",marginBottom:16,cursor:"pointer"}}>
          <div>
            <div style={{fontSize:13,color:"var(--text)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Real-time Cellar Updates</div>
            <div style={{fontSize:11,color:"var(--sub)",marginTop:2,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Apply each audit check to inventory instantly</div>
          </div>
          <div style={{width:40,height:22,borderRadius:999,background:setupRealtime?"var(--accent)":"var(--inputBg)",border:setupRealtime?"1.5px solid rgba(var(--accentRgb),0.6)":"1.5px solid var(--border)",position:"relative",transition:"all .16s"}}>
            <div style={{position:"absolute",top:2,left:setupRealtime?20:2,width:16,height:16,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px rgba(0,0,0,.28)",transition:"left .16s"}}/>
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setSetupOpen(false)} full>Cancel</Btn>
          <Btn onClick={createAudit} full>Create Audit</Btn>
        </div>
      </Modal>

      <Modal show={!!entryEditor} onClose={()=>setEntryEditor(null)}>
        <ModalHeader title={entryEditor?.mode==="missing"?"Mark Missing":"Confirm Present"} onClose={()=>setEntryEditor(null)}/>
        {entryEditor?.mode==="present"?(
          <>
            <SelField label="Count Type" value={entryEditor.countType||"bottles"} onChange={v=>setEntryEditor(p=>({...p,countType:v}))} options={[{value:"bottles",label:"Bottles"},{value:"boxes",label:"Boxes"}]}/>
            <Field label="Counted Amount" value={entryEditor.countedAmount||""} onChange={v=>setEntryEditor(p=>({...p,countedAmount:v.replace(/[^0-9]/g,"")}))} type="number" placeholder="0"/>
            {entryEditor.countType==="boxes"&&(
              <div style={{fontSize:12,color:"var(--sub)",marginBottom:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
                Box counts are saved in audit history and not converted to bottles automatically.
              </div>
            )}
          </>
        ):(
          <>
            <div style={{fontSize:12,color:"var(--sub)",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Choose what should happen if this wine is not physically present:</div>
            <div style={{display:"grid",gap:8,marginBottom:14}}>
              <button onClick={()=>setEntryEditor(p=>({...p,missingAction:"keep"}))} style={{padding:"10px 12px",borderRadius:11,border:entryEditor?.missingAction==="keep"?"1.5px solid var(--accent)":"1.5px solid var(--border)",background:entryEditor?.missingAction==="keep"?"rgba(var(--accentRgb),0.08)":"var(--inputBg)",fontSize:13,fontWeight:700,color:entryEditor?.missingAction==="keep"?"var(--accent)":"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Keep wine in cellar, mark missing in audit</button>
              <button onClick={()=>setEntryEditor(p=>({...p,missingAction:"remove"}))} style={{padding:"10px 12px",borderRadius:11,border:entryEditor?.missingAction==="remove"?"1.5px solid rgba(184,50,50,0.5)":"1.5px solid var(--border)",background:entryEditor?.missingAction==="remove"?"rgba(184,50,50,0.1)":"var(--inputBg)",fontSize:13,fontWeight:700,color:entryEditor?.missingAction==="remove"?"#B83232":"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Remove wine from cellar</button>
            </div>
          </>
        )}
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setEntryEditor(null)} full>Cancel</Btn>
          <Btn onClick={saveEntryEditor} full disabled={busy}>Save</Btn>
        </div>
      </Modal>

      <Modal show={completeOpen} onClose={()=>setCompleteOpen(false)}>
        <ModalHeader title="Complete Audit" onClose={()=>setCompleteOpen(false)}/>
        <button onClick={()=>setApplyOnComplete(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${applyOnComplete?"var(--accent)":"var(--border)"}`,background:applyOnComplete?"rgba(var(--accentRgb),0.08)":"var(--inputBg)",width:"100%",marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:13,color:"var(--text)",fontWeight:600,cursor:"pointer"}}>
          <span>Update cellar quantities based on this audit</span>
          <span style={{fontSize:15,color:applyOnComplete?"var(--accent)":"var(--sub)"}}>{applyOnComplete?"✓":"○"}</span>
        </button>
        <div style={{fontSize:12,color:"var(--sub)",marginBottom:16,fontFamily:"'Plus Jakarta Sans',sans-serif",lineHeight:1.6}}>
          {applyOnComplete
            ?"Bottle counts and remove-actions will sync to your cellar."
            :"Audit results will be saved as history only."}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setCompleteOpen(false)} full>Cancel</Btn>
          <Btn onClick={completeAudit} full disabled={busy}>Complete</Btn>
        </div>
      </Modal>
      <Modal show={!!actionAudit} onClose={()=>setActionAuditId(null)}>
        <ModalHeader title="Audit Options" onClose={()=>setActionAuditId(null)}/>
        {actionAudit&&(
          <>
            <div style={{fontSize:12,color:"var(--sub)",marginBottom:12,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {actionAudit.name} · {fmtAuditDate(actionAudit.createdAt)}
            </div>
            <div style={{display:"grid",gap:8}}>
              <button onClick={()=>{setActionAuditId(null);setConfirmDeleteId(actionAudit.id);}} style={{padding:"11px 12px",borderRadius:12,border:"1.5px solid rgba(184,50,50,0.4)",background:"rgba(184,50,50,0.1)",color:"#B83232",fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",textAlign:"left",cursor:"pointer"}}>
                Delete Audit
              </button>
              <button
                disabled={actionAudit.id!==latestAuditId}
                onClick={()=>{if(actionAudit.id!==latestAuditId)return;setActionAuditId(null);setConfirmRevokeId(actionAudit.id);}}
                style={{padding:"11px 12px",borderRadius:12,border:"1.5px solid var(--border)",background:actionAudit.id===latestAuditId?"var(--inputBg)":"rgba(0,0,0,0.03)",color:actionAudit.id===latestAuditId?"var(--text)":"var(--sub)",fontSize:13,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif",textAlign:"left",cursor:actionAudit.id===latestAuditId?"pointer":"default",opacity:actionAudit.id===latestAuditId?1:0.55}}
              >
                Revoke Audit
                <div style={{fontSize:11,fontWeight:500,marginTop:2,color:"var(--sub)"}}>
                  {actionAudit.id===latestAuditId?"Restore inventory to state before this audit":"Only available for the most recent audit"}
                </div>
              </button>
            </div>
          </>
        )}
      </Modal>
      <Modal show={!!confirmDeleteId} onClose={()=>setConfirmDeleteId(null)}>
        <ModalHeader title="Delete Audit?" onClose={()=>setConfirmDeleteId(null)}/>
        <div style={{fontSize:13,color:"var(--text)",lineHeight:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:16}}>
          This removes the audit history entry permanently. It does not change cellar stock.
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setConfirmDeleteId(null)} full>Cancel</Btn>
          <Btn variant="danger" onClick={deleteAudit} full>Delete</Btn>
        </div>
      </Modal>
      <Modal show={!!confirmRevokeId} onClose={()=>setConfirmRevokeId(null)}>
        <ModalHeader title="Revoke Audit?" onClose={()=>setConfirmRevokeId(null)}/>
        <div style={{fontSize:13,color:"var(--text)",lineHeight:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif",marginBottom:16}}>
          This will restore cellar data to how it was before this audit started. Only the latest audit can be revoked to keep data consistent.
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setConfirmRevokeId(null)} full>Cancel</Btn>
          <Btn onClick={revokeAudit} full disabled={busy}>Revoke</Btn>
        </div>
      </Modal>
    </div>
  );
};

/* ── AI ───────────────────────────────────────────────────────── */
const AIScreen=({wines})=>{
  const [msgs,setMsgs]=useState([{r:"a",t:"Hello. I'm Vinology — your personal sommelier.\n\nAsk me anything about your collection, food pairings, what to open tonight, or recommendations."}]);
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
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Vinology AI</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:28,fontWeight:800,color:"var(--text)",lineHeight:1}}>Sommelier</div>
      </div>
      <div ref={scrollRef} style={{flex:1,overflowY:"auto",paddingBottom:8}}>
        {msgs.map((m,i)=>(
          <div key={i} style={{marginBottom:12,display:"flex",justifyContent:m.r==="u"?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
            {m.r==="a"&&<div style={{width:30,height:30,borderRadius:10,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon n="wine" size={15} color="white"/></div>}
            <div style={{maxWidth:"80%",padding:"12px 15px",borderRadius:m.r==="u"?"18px 18px 4px 18px":"18px 18px 18px 4px",background:m.r==="u"?"var(--accent)":"var(--card)",color:m.r==="u"?"white":"var(--text)",fontSize:14,lineHeight:1.65,border:m.r==="a"?"1px solid var(--border)":"none",whiteSpace:"pre-wrap",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:"0 2px 8px var(--shadow)"}}>{m.t}</div>
          </div>
        ))}
        {loading&&(
          <div style={{display:"flex",alignItems:"flex-end",gap:8}}>
            <div style={{width:30,height:30,borderRadius:10,background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="wine" size={15} color="white"/></div>
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
              onMouseEnter={e=>e.currentTarget.style.borderColor="var(--accent)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>{c}</button>
          ))}
        </div>
      )}
      <div style={{display:"flex",gap:8,paddingTop:8}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask anything about wine…" style={{borderRadius:14}}/>
        <button onClick={()=>send()} disabled={!input.trim()||loading}
          style={{width:44,height:44,flexShrink:0,borderRadius:12,background:input.trim()&&!loading?"var(--accent)":"var(--inputBg)",border:"none",cursor:input.trim()&&!loading?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",color:input.trim()&&!loading?"white":"var(--sub)",transition:"all 0.18s"}}>
          <Icon n="send" size={17}/>
        </button>
      </div>
    </div>
  );
};

/* ── JOURNAL ──────────────────────────────────────────────────── */
const JournalWineCard=({wine,onClick})=>{
  const type=resolveWineType(wine);
  const varietal=resolveVarietal(wine);
  const tc=WINE_TYPE_COLORS[type]||WINE_TYPE_COLORS.Other;
  const geo=deriveRegionCountry(wine.origin||"");
  const journal=toJournalState(wine);
  const hasJournalText=hasReviewEntryValue(journal.primary)||journal.otherReviews.length>0||journal.personalNotes.trim();
  const journalStatusStyle={
    border:"1px solid var(--border)",
    background:"var(--surface)",
    color:"var(--text)",
    opacity:0.88
  };
  return(
    <div onClick={onClick} style={{background:"var(--card)",borderRadius:18,padding:"14px 16px",cursor:"pointer",border:"1px solid var(--border)",marginBottom:10,transition:"transform 0.15s,box-shadow 0.15s",boxShadow:"0 2px 8px var(--shadow)"}} onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px var(--shadow)";}} onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="0 2px 8px var(--shadow)";}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:7}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:16,fontWeight:700,color:"var(--text)",lineHeight:1.2}}>{wine.name}</div>
        {wine.vintage&&<span style={{padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:700,color:"var(--text)",background:"var(--inputBg)",fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"nowrap"}}>{wine.vintage}</span>}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:8}}>
        <WineTypePill type={type} label={varietal}/>
        {hasJournalText&&(
          <div
            title="Journal entry exists"
            aria-label="Journal entry exists"
            style={{width:24,height:24,borderRadius:999,display:"inline-flex",alignItems:"center",justifyContent:"center",...journalStatusStyle}}
          >
            <Icon n="note" size={13} color="currentColor"/>
          </div>
        )}
      </div>
      {(geo.region||geo.country)&&<div style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{geo.region||geo.country}</div>}
      <div style={{marginTop:10,height:2,borderRadius:2,background:tc.dot,opacity:0.45}}/>
    </div>
  );
};

const JournalWineDetail=({wine,onEdit})=>{
  const type=resolveWineType(wine);
  const varietal=resolveVarietal(wine);
  const geo=deriveRegionCountry(wine.origin||"");
  const journal=toJournalState(wine);
  const primary=normalizeReviewEntry(journal.primary);
  const otherReviews=normalizeOtherReviews(journal.otherReviews);
  const personalNotes=(journal.personalNotes||"").trim();
  const hasContent=hasReviewEntryValue(primary)||otherReviews.length>0||!!personalNotes;
  return(
    <div>
      <div style={{borderRadius:16,background:"linear-gradient(135deg,rgba(var(--accentRgb),0.2) 0%,rgba(var(--accentRgb),0.08) 100%)",padding:"18px 18px",marginBottom:14,border:"1px solid rgba(var(--accentRgb),0.2)"}}>
        <WineTypePill type={type} label={varietal}/>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:22,fontWeight:800,color:"var(--text)",marginTop:8,lineHeight:1.2}}>{wine.name}</div>
        {(wine.vintage||geo.region||geo.country)&&<div style={{fontSize:13,color:"var(--sub)",marginTop:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{[wine.vintage,geo.region||geo.country,geo.country&&geo.region?geo.country:null].filter(Boolean).join(" · ")}</div>}
      </div>
      {!hasContent&&(
        <div style={{background:"var(--inputBg)",borderRadius:13,padding:"14px",marginBottom:12,border:"1px solid var(--border)",fontSize:13,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
          No review notes yet for this wine.
        </div>
      )}
      {hasReviewEntryValue(primary)&&(
        <div style={{background:"linear-gradient(180deg,var(--inputBg),rgba(var(--accentRgb),0.03))",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Review</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
            {primary.reviewer&&<span style={{padding:"3px 8px",borderRadius:999,background:"var(--card)",border:"1px solid var(--border)",fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{primary.reviewer}</span>}
            {primary.rating&&<span style={{padding:"3px 8px",borderRadius:999,background:"rgba(var(--accentRgb),0.12)",border:"1px solid rgba(var(--accentRgb),0.22)",fontSize:11,fontWeight:700,color:"var(--accent)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{primary.rating}</span>}
          </div>
          {!!primary.text&&<div style={{fontSize:14,color:"var(--text)",lineHeight:1.7,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"pre-wrap"}}>{primary.text}</div>}
        </div>
      )}
      {otherReviews.length>0&&(
        <div style={{background:"linear-gradient(180deg,var(--inputBg),rgba(var(--accentRgb),0.02))",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Other Reviews</div>
          <div style={{display:"grid",gap:8}}>
            {otherReviews.map((entry,idx)=>(
              <div key={idx} style={{background:"var(--card)",border:"1px solid var(--border)",borderRadius:10,padding:"9px 10px"}}>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:4}}>
                  {entry.reviewer&&<span style={{padding:"2px 7px",borderRadius:999,background:"var(--inputBg)",fontSize:11,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{entry.reviewer}</span>}
                  {entry.rating&&<span style={{padding:"2px 7px",borderRadius:999,background:"rgba(var(--accentRgb),0.12)",color:"var(--accent)",fontSize:11,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{entry.rating}</span>}
                </div>
                {!!entry.text&&<div style={{fontSize:13,color:"var(--text)",lineHeight:1.65,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"pre-wrap"}}>{entry.text}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      {!!personalNotes&&(
        <div style={{background:"linear-gradient(180deg,var(--inputBg),rgba(var(--accentRgb),0.02))",borderRadius:14,padding:"12px 14px",marginBottom:8,border:"1px solid var(--border)"}}>
          <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Personal Notes</div>
          <div style={{fontSize:14,color:"var(--text)",lineHeight:1.7,fontFamily:"'Plus Jakarta Sans',sans-serif",whiteSpace:"pre-wrap"}}>{personalNotes}</div>
        </div>
      )}
      <Btn onClick={onEdit} full icon="edit">Edit Journal Notes</Btn>
    </div>
  );
};

const JournalNoteForm=({wine,onSave,onClose,reviewerSuggestions=[]})=>{
  const initialJournal=toJournalState(wine);
  const [form,setForm]=useState({
    primary:normalizeReviewEntry(initialJournal.primary),
    otherReviews:normalizeOtherReviews(initialJournal.otherReviews).length?normalizeOtherReviews(initialJournal.otherReviews):[normalizeReviewEntry({})],
    personalNotes:initialJournal.personalNotes||"",
  });
  const setPrimary=(k,v)=>setForm(p=>({...p,primary:normalizeReviewEntry({...p.primary,[k]:v})}));
  const setOther=(idx,k,v)=>setForm(p=>({...p,otherReviews:(p.otherReviews||[]).map((entry,i)=>i===idx?normalizeReviewEntry({...entry,[k]:v}):entry)}));
  const addOther=()=>setForm(p=>({...p,otherReviews:[...(p.otherReviews||[]),normalizeReviewEntry({})]}));
  const removeOther=idx=>setForm(p=>{
    const next=(p.otherReviews||[]).filter((_,i)=>i!==idx);
    return {...p,otherReviews:next.length?next:[normalizeReviewEntry({})]};
  });
  const save=()=>{
    const primary=normalizeReviewEntry(form.primary);
    const otherReviews=normalizeOtherReviews(form.otherReviews);
    const numericRating=safeNum(primary.rating);
    const stars=numericRating!=null?ratingFromHalliday(numericRating):(wine.rating||0);
    onSave({
      ...wine,
      review:primary.text,
      reviewPrimaryReviewer:primary.reviewer,
      reviewPrimaryRating:primary.rating,
      otherReviews,
      notes:form.personalNotes||"",
      tastingNotes:serializeOtherRatings(otherReviews),
      rating:stars,
    });
  };
  return(
    <div>
      <ModalHeader title="Edit Journal Notes" onClose={onClose}/>
      <div style={{fontSize:12,color:"var(--sub)",marginBottom:14,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{wine.name}</div>
      <ReviewEntryEditor
        title="Review"
        entry={form.primary}
        onChange={setPrimary}
        suggestions={reviewerSuggestions}
      />
      <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Other Reviews</div>
      {(form.otherReviews||[]).map((entry,idx)=>(
        <ReviewEntryEditor
          key={idx}
          title={`Other Review ${idx+1}`}
          entry={entry}
          onChange={(k,v)=>setOther(idx,k,v)}
          suggestions={reviewerSuggestions}
          onRemove={(form.otherReviews||[]).length>1?()=>removeOther(idx):undefined}
        />
      ))}
      <button type="button" onClick={addOther} style={{width:"100%",marginBottom:12,padding:"8px 10px",borderRadius:10,border:"1.5px dashed var(--border)",background:"none",color:"var(--accent)",fontSize:12,fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
        + Add Another Review
      </button>
      <Field label="Personal Notes" value={form.personalNotes} onChange={v=>setForm(p=>({...p,personalNotes:v}))} placeholder="Memories, pairings, context..." rows={3} optional/>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="secondary" onClick={onClose} full>Cancel</Btn>
        <Btn onClick={save} full>Save Notes</Btn>
      </div>
    </div>
  );
};

const JournalScreen=({wines,onUpdate,desktop})=>{
  const [search,setSearch]=useState("");
  const [sel,setSel]=useState(null);
  const [editing,setEditing]=useState(false);
  const col=wines.filter(w=>!w.wishlist);
  const reviewerSuggestions=reviewerSuggestionsFromWines(col);
  const filtered=col
    .filter(w=>{
      if(!search.trim()) return true;
      const journal=toJournalState(w);
      const haystack=[
        w.name,w.grape,resolveVarietal(w),w.origin,w.vintage?.toString()||"",
        journal.primary.reviewer,journal.primary.rating,journal.primary.text,journal.personalNotes,
        ...journal.otherReviews.flatMap(r=>[r.reviewer,r.rating,r.text])
      ].join(" ").toLowerCase();
      return haystack.includes(search.trim().toLowerCase());
    })
    .sort((a,b)=>a.name.localeCompare(b.name));
  return(
    <div>
      <div style={{marginBottom:20}}>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Journal</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1}}>
          {col.length} <span style={{fontSize:18,color:"var(--sub)",fontWeight:400}}>wines</span>
        </div>
      </div>
      <div style={{marginBottom:14,position:"relative"}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search wines, varietal, origin, or notes..." style={{paddingLeft:38}}/>
        <div style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"var(--sub)",pointerEvents:"none"}}><Icon n="search" size={16}/></div>
      </div>
      {filtered.length===0
        ? <Empty icon="note" text={search.trim()?"No journal wines match your search.":"Your cellar has no wines yet."}/>
        : <div style={{display:desktop?"grid":"block",gridTemplateColumns:desktop?"repeat(auto-fill,minmax(290px,1fr))":"none",gap:desktop?12:0}}>
            {filtered.map(w=><JournalWineCard key={w.id} wine={w} onClick={()=>{setSel(w);setEditing(false);}}/>)}
          </div>
      }
      <Modal show={!!sel&&!editing} onClose={()=>setSel(null)} wide>
        {sel&&(
          <div>
            <ModalHeader title="Wine Journal" onClose={()=>setSel(null)}/>
            <JournalWineDetail wine={sel} onEdit={()=>setEditing(true)}/>
          </div>
        )}
      </Modal>
      <Modal show={!!sel&&editing} onClose={()=>setEditing(false)} wide>
        {sel&&<JournalNoteForm wine={sel} reviewerSuggestions={reviewerSuggestions} onClose={()=>setEditing(false)} onSave={w=>{onUpdate(w);setSel(w);setEditing(false);}}/>}
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

const exportToExcel=async(wines,wishlist,notes,{includeWishlist=true,includeNotes=false}={})=>{
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
  const wish=includeWishlist?wishlist:[];
  const today=new Date().toLocaleDateString("en-AU",{day:"numeric",month:"long",year:"numeric"});
  const totalBottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const rated=col.filter(w=>w.rating>0);
  const avgRating=rated.length?(rated.reduce((s,w)=>s+w.rating,0)/rated.length).toFixed(1):"-";
  const styleTypeFor = rows => {
    const counts={};
    rows.forEach(w=>{
      const t=resolveWineType(w);
      counts[t]=(counts[t]||0)+1;
    });
    return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0]||"Other";
  };
  const varietalGroups=[...new Set(col.map(resolveVarietal).filter(Boolean))]
    .map(varietal=>({varietal,wines:col.filter(w=>resolveVarietal(w)===varietal)}))
    .sort((a,b)=>b.wines.length-a.wines.length||a.varietal.localeCompare(b.varietal));

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
  const COL_W=[{wch:34},{wch:24},{wch:22},{wch:10},{wch:9},{wch:8},{wch:9},{wch:9},{wch:10},{wch:10},{wch:12},{wch:10},{wch:11},{wch:11},{wch:14},{wch:14},{wch:14},{wch:10},{wch:38}];
  ws1["!cols"]=COL_W;
  let r=0;

  // Title row
  const NCOLS=18;
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

  // By varietal
  varietalGroups.forEach(group=>{
    const tw=group.wines;
    if(!tw.length)return;
    const styleType=styleTypeFor(tw);
    const tc=TYPE_STYLES[styleType]||TYPE_STYLES.Other;
    const em=TYPE_EMOJI[styleType]||"🍾";

    r++; // spacer

    // Section header
    for(let c=0;c<=NCOLS;c++){
      const addr=X.utils.encode_cell({r,c});
      ws1[addr]={t:"s",v:c===0?`${em}  ${group.varietal}  (${tw.length} ${tw.length===1?"wine":"wines"}, ${tw.reduce((s,w)=>s+(w.bottles||0),0)} bottles)`:"",
        s:{font:{name:"Arial",sz:12,bold:true,color:{rgb:"FFFFFF"}},
          fill:{patternType:"solid",fgColor:{rgb:tc.hdr}},
          alignment:{horizontal:"left",vertical:"center",indent:1}}};
    }
    ws1["!merges"].push({s:{r,c:0},e:{r,c:NCOLS}});
    r++;

    // Column headers
    const HDRS=["Wine Name","Varietal / Blend","Origin / Region","Varietal","Vintage","Bottles","Rating","Alc %","Drink From","Drink By","Paid/Btl","RRP/Btl","Total Paid","Insured","Supplier","Location","Section","Box","Tasting Notes"];
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
      const stars="★".repeat(w.rating||0)+"☆".repeat(5-(w.rating||0));
      const m=w.cellarMeta||{};
      const vals=[
        w.name||"",
        resolveVarietal(w)||"-",
        w.origin||"-",
        resolveVarietal(w)||"-",
        w.vintage||"-",
        w.bottles||0,
        stars,
        w.alcohol?`${w.alcohol}%`:"-",
        m.drinkStart||"-",
        m.drinkEnd||"-",
        m.pricePerBottle!=null?m.pricePerBottle:"-",
        m.rrp!=null?m.rrp:"-",
        m.totalPaid!=null?m.totalPaid:"-",
        m.insuranceValue!=null?m.insuranceValue:"-",
        m.supplier||"-",
        normalizeLocation(w.location)||"-",
        normalizeKennardsSection(m.locationSection)||"-",
        w.locationSlot||"-",
        w.tastingNotes||"-",
      ];
      vals.forEach((val,ci)=>{
        const addr=X.utils.encode_cell({r,c:ci});
        const isNum=typeof val==="number";
        let s={...cellStyle(bg,ci===0?"1A1210":ci===4?tc.hdr:"4A4040",ci===0,ci===0?10.5:9,[5,6,7,8,9,10,11,12,13].includes(ci)?"center":"left",ci===18)};
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
  if(includeWishlist){
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

  const wishVarietalGroups=[...new Set(wish.map(resolveVarietal).filter(Boolean))]
    .map(varietal=>({varietal,wines:wish.filter(w=>resolveVarietal(w)===varietal)}))
    .sort((a,b)=>b.wines.length-a.wines.length||a.varietal.localeCompare(b.varietal));

  wishVarietalGroups.forEach(group=>{
    const tw=group.wines;
    if(!tw.length)return;
    const styleType=styleTypeFor(tw);
    const tc=TYPE_STYLES[styleType]||TYPE_STYLES.Other;
    r2++;
    for(let c=0;c<=6;c++){
      const addr=X.utils.encode_cell({r:r2,c});
      ws2[addr]={t:"s",v:c===0?`${TYPE_EMOJI[styleType]||"🍾"}  ${group.varietal}`:"",
        s:{font:{name:"Arial",sz:11,bold:true,color:{rgb:"FFFFFF"}},fill:{patternType:"solid",fgColor:{rgb:tc.hdr}},alignment:{horizontal:"left",vertical:"center"}}};
    }
    ws2["!merges"].push({s:{r:r2,c:0},e:{r:r2,c:6}});
    r2++;

    ["Wine Name","Varietal / Blend","Origin","Varietal","Vintage","Alc %","Notes"].forEach((h,ci)=>{
      const addr=X.utils.encode_cell({r:r2,c:ci});
      ws2[addr]={t:"s",v:h,s:{font:{name:"Arial",sz:9,bold:true,color:{rgb:tc.hdr}},fill:{patternType:"solid",fgColor:{rgb:tc.row}},alignment:{horizontal:"center",vertical:"center"},border:{bottom:{style:"medium",color:{rgb:tc.hdr}}}}};
    });
    r2++;

    tw.forEach((w,idx)=>{
      const bg=idx%2===0?tc.row:tc.alt;
      [w.name||"",resolveVarietal(w)||"-",w.origin||"-",resolveVarietal(w)||"-",w.vintage||"-",w.alcohol?`${w.alcohol}%`:"-",w.notes||"-"].forEach((val,ci)=>{
        const addr=X.utils.encode_cell({r:r2,c:ci});
        let s=cellStyle(bg,ci===4?tc.hdr:"4A4040",ci===4,9,ci>=4&&ci<=5?"center":"left",ci===6);
        ws2[addr]={t:"s",v:val,s};
      });
      r2++;
    });
  });

    ws2["!ref"]=X.utils.encode_range({r:0,c:0},{r:r2,c:6});
    X.utils.book_append_sheet(wb,ws2,"Wishlist");
  }

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
  [["",1],["Varietal",2],["Wines",4],["Bottles",5]].forEach(([h,c])=>{
    const addr=X.utils.encode_cell({r:r3,c});
    ws3[addr]={t:"s",v:h,s:cellStyle("9B2335","FFFFFF",true,10,"center")};
  });
  r3++;
  varietalGroups.forEach((group,idx)=>{
    const tw=group.wines;
    if(!tw.length)return;
    const styleType=styleTypeFor(tw);
    const tc=TYPE_STYLES[styleType]||TYPE_STYLES.Other;
    const bg=idx%2===0?tc.row:tc.alt;
    const bottles2=tw.reduce((s,w)=>s+(w.bottles||0),0);
    const addr1=X.utils.encode_cell({r:r3,c:2});
    ws3[addr1]={t:"s",v:`${TYPE_EMOJI[styleType]||"🍾"} ${group.varietal}`,s:cellStyle(bg,tc.hdr,true,10)};
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

  // ── SHEET 4: Notes (optional) ────────────────────────────────
  if(includeNotes){
    const ws4={};
    const notesRows=(notes||[]).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||""));
    ws4["!cols"]=[{wch:16},{wch:36},{wch:26},{wch:90}];
    ws4["!merges"]=[];
    let r4=0;
    for(let c=0;c<=3;c++){
      const addr=X.utils.encode_cell({r:r4,c});
      ws4[addr]={t:"s",v:c===0?`Tasting Journal — ${notesRows.length} notes`:"",s:cellStyle("213547","FFFFFF",true,15)};
    }
    ws4["!merges"].push({s:{r:r4,c:0},e:{r:r4,c:3}});
    r4++;
    ["Date","Title","Wine","Note"].forEach((h,ci)=>{
      const addr=X.utils.encode_cell({r:r4,c:ci});
      ws4[addr]={t:"s",v:h,s:cellStyle("EAF0F6","213547",true,10,"center")};
    });
    r4++;
    notesRows.forEach((n,idx)=>{
      const wineName=(col.find(w=>w.id===n.wineId)?.name)||"-";
      const bg=idx%2===0?"FFFFFF":"F7F9FC";
      [n.date||"-",n.title||"-",wineName,n.content||""].forEach((v,ci)=>{
        const addr=X.utils.encode_cell({r:r4,c:ci});
        ws4[addr]={t:"s",v,s:cellStyle(bg,"1F2937",false,9,"left",ci===3)};
      });
      r4++;
    });
    ws4["!ref"]=X.utils.encode_range({r:0,c:0},{r:r4,c:3});
    X.utils.book_append_sheet(wb,ws4,"Notes");
  }

  // Download
  X.writeFile(wb,`vino-cellar-${new Date().toISOString().slice(0,10)}.xlsx`,{bookSST:false,cellStyles:true});
};

/* ── WINE BOTTLE VIZ ──────────────────────────────────────────── */
const WineBottleViz=({types,total})=>{
  const ORDER=["Red","White","Rosé","Sparkling","Dessert","Fortified","Other"];
  const segments=ORDER.map(t=>({type:t,count:types[t]||0,pct:total?Math.round(((types[t]||0)/total)*100):0,color:WINE_TYPE_COLORS[t]?.dot||"#888"})).filter(s=>s.count>0);
  if(!segments.length)return null;
  const bottlePath="M41 6c6-3 20-3 26 0v4c0 1 0 2 1 3v27c0 5 3 10 7 16 6 8 9 18 9 28v112c0 7-7 11-30 11s-30-4-30-11V84c0-10 3-20 9-28 4-6 7-11 7-16V13c1-1 1-2 1-3V6z";
  const fillTop=34;
  const fillBottom=208;
  const fillHeight=fillBottom-fillTop;
  let cursor=fillBottom;
  const fills=segments.map((s,idx)=>{
    const remaining=segments.length-idx;
    const raw=Math.round((s.count/total)*fillHeight);
    const minH=5;
    const maxForThis=cursor-fillTop-(remaining-1)*minH;
    const h=Math.max(minH,Math.min(raw,maxForThis));
    const y=cursor-h;
    cursor=y;
    return {...s,y,h};
  });
  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-start",flexWrap:"wrap"}}>
      <div style={{flexShrink:0}}>
        <svg width="108" height="216" viewBox="0 0 108 216" role="img" aria-label="Collection breakdown bottle">
          <defs>
            <clipPath id="winery-bottle-fill">
              <path d={bottlePath}/>
            </clipPath>
            <linearGradient id="winery-glass-base" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.98)"/>
              <stop offset="45%" stopColor="rgba(248,248,250,0.96)"/>
              <stop offset="100%" stopColor="rgba(238,238,242,0.95)"/>
            </linearGradient>
            <linearGradient id="winery-gloss-left" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(255,255,255,0.34)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </linearGradient>
            <linearGradient id="winery-shade-right" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(0,0,0,0)"/>
              <stop offset="100%" stopColor="rgba(0,0,0,0.14)"/>
            </linearGradient>
            {fills.map((s,idx)=>(
              <linearGradient key={s.type} id={`winery-seg-${idx}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity="0.98"/>
                <stop offset="100%" stopColor={s.color} stopOpacity="0.72"/>
              </linearGradient>
            ))}
          </defs>
          <g clipPath="url(#winery-bottle-fill)">
            <rect x="0" y="0" width="108" height="216" fill="url(#winery-glass-base)"/>
            {fills.map((s,idx)=>(
              <rect key={s.type} x="0" y={s.y} width="108" height={s.h} fill={`url(#winery-seg-${idx})`} opacity="0.9"/>
            ))}
            <rect x="16" y="8" width="22" height="198" fill="url(#winery-gloss-left)"/>
            <rect x="64" y="8" width="24" height="198" fill="url(#winery-shade-right)"/>
          </g>
          <path
            d={bottlePath}
            fill="none"
            stroke="#121216"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M25 88c17 3 41 3 58 0" stroke="#121216" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M25 149c17 3 41 3 58 0" stroke="#121216" strokeWidth="2" fill="none" strokeLinecap="round"/>
          <path d="M40 34h28" stroke="#121216" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{flex:1,minWidth:170,paddingTop:2}}>
        {segments.map(s=>(
          <div key={s.type} style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <div style={{width:9,height:9,borderRadius:"50%",background:s.color,flexShrink:0}}/>
            <div style={{flex:1}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                <span style={{fontSize:12,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.type}</span>
                <span style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{s.count} · {s.pct}%</span>
              </div>
              <div style={{height:3,background:"var(--inputBg)",borderRadius:3}}>
                <div style={{height:"100%",width:`${s.pct}%`,background:s.color,borderRadius:3}}/>
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
          <button onClick={findWineries} style={{background:"var(--accent)",color:"white",border:"none",borderRadius:16,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"inline-flex",alignItems:"center",gap:8,boxShadow:"0 6px 20px rgba(var(--accentRgb),0.35)"}}>
            <Icon n="mappin" size={17} color="white"/> Find Wineries Near Me
          </button>
        </div>
      )}
      {state==="loading"&&(
        <div style={{textAlign:"center",padding:"60px 0"}}>
          <div style={{marginBottom:12,animation:"spin 1.5s linear infinite",display:"inline-block"}}><Icon n="globe" size={36} color="var(--accent)"/></div>
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
          <button onClick={findWineries} style={{background:"var(--accent)",color:"white",border:"none",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Retry</button>
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
              {w.dist!=null&&<div style={{fontSize:11,color:"var(--accent)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{w.dist}km</div>}
              <div style={{fontSize:11,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",display:"flex",alignItems:"center",gap:3}}><Icon n="globe" size={10} color="var(--sub)"/>View on Maps</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/* ── SETTINGS PANEL ───────────────────────────────────────────── */
const BG_PRESETS = COLOR_THEMES.map(t=>({label:t.label,value:t.profileBg,accentId:t.id}));

const SettingsPanel=({onBack,profile,setProfile,theme,setTheme})=>{
  const THEMES=[{id:"system",label:"System",ic:"monitor"},{id:"light",label:"Light",ic:"sun"},{id:"dark",label:"Dark",ic:"moon"}];
  const COUNTRIES=["Australia","New Zealand","France","Italy","Spain","USA","Argentina","Chile","South Africa","Germany","Portugal","Austria","Other"];
  const [form,setForm]=useState({
    name:profile.name||"",
    description:profile.description||"",
    surname:profile.surname||"",
    cellarName:profile.cellarName||"",
    bio:profile.bio||"",
    country:profile.country||"Australia",
    avatar:profile.avatar||null,
    profileBg:profile.profileBg||THEME_BY_ID[(profile.accent||"wine")]?.profileBg||BG_PRESETS[0].value,
    accent:detectAccentFromProfileBg(profile.profileBg||"")||profile.accent||DEFAULT_PROFILE.accent,
  });
  const set=(k,v)=>setForm(p=>({...p,[k]:v}));
  const setColorTheme=(accentId,profileBg)=>setForm(p=>({...p,accent:accentId,profileBg}));
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
        <label style={{display:"block",fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Title</label>
        <input value={form.description} onChange={e=>set("description",e.target.value)} placeholder="e.g. Winemaker & Collector"/>
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
      {/* Unified App Color */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>App Color</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8}}>
          {BG_PRESETS.map(bg=>(
            <button key={bg.value} onClick={()=>setColorTheme(bg.accentId,bg.value)}
              style={{
                height:44,
                borderRadius:12,
                background:"var(--inputBg)",
                border:form.profileBg===bg.value?"2px solid var(--accent)":"1.5px solid var(--border)",
                cursor:"pointer",
                position:"relative",
                outline:"none",
                boxShadow:"none",
                overflow:"hidden",
                padding:2,
                display:"block",
                appearance:"none",
                WebkitAppearance:"none",
                MozAppearance:"none"
              }}>
              <div style={{width:"100%",height:"100%",borderRadius:9,background:bg.value}}/>
              {form.profileBg===bg.value&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:9,height:9,borderRadius:"50%",background:"#fff",boxShadow:"0 0 0 1.5px rgba(0,0,0,.22)"}}/></div>}
            </button>
          ))}
        </div>
      </div>
      <div style={{marginBottom:24}}>
        <div style={{fontSize:11,fontWeight:700,color:"var(--sub)",letterSpacing:"0.8px",textTransform:"uppercase",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>App Theme</div>
        <div style={{display:"flex",gap:8}}>
          {THEMES.map(t=>{
            const act=theme===t.id;
            return(
              <button key={t.id} onClick={()=>setTheme(t.id)} style={{flex:1,padding:"12px 8px",borderRadius:14,border:act?"2px solid var(--accent)":"1.5px solid var(--border)",background:act?"rgba(var(--accentRgb),0.08)":"var(--inputBg)",color:act?"var(--accent)":"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:700,fontSize:12,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:6,transition:"all 0.18s"}}>
                <Icon n={t.ic} size={17} color={act?"var(--accent)":"var(--sub)"}/>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{display:"flex",gap:10}}>
        <button onClick={onBack} style={{flex:1,padding:"14px",borderRadius:14,border:"1.5px solid var(--border)",background:"var(--inputBg)",color:"var(--text)",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cancel</button>
        <button onClick={save} disabled={!form.name} style={{flex:2,padding:"14px",borderRadius:14,border:"none",background:form.name?"var(--accent)":"var(--inputBg)",color:form.name?"white":"var(--sub)",fontSize:14,fontWeight:700,cursor:form.name?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",transition:"all 0.18s",boxShadow:form.name?"0 4px 16px rgba(var(--accentRgb),0.3)":"none"}}>Save Changes</button>
      </div>
    </div>
  );
};

/* ── PROFILE ──────────────────────────────────────────────────── */
const ProfileScreen=({wines,notes,theme,setTheme,profile,setProfile})=>{
  const [view,setView]=useState("main"); // main | settings | explore
  const [exportOpen,setExportOpen]=useState(false);
  const [includeNotesExport,setIncludeNotesExport]=useState(false);
  const col=wines.filter(w=>!w.wishlist);
  const bottles=col.reduce((s,w)=>s+(w.bottles||0),0);
  const topWine=[...col].sort((a,b)=>(b.rating||0)-(a.rating||0))[0];
  const types=col.reduce((acc,w)=>{const t=resolveWineType(w);acc[t]=(acc[t]||0)+1;return acc;},{});
  const rrpValue=col.reduce((s,w)=>s+((safeNum(w.cellarMeta?.rrp)||0)*getTotalPurchased(w)),0);
  const readyCount=col.filter(w=>wineReadiness(w).key==="ready").length;
  const consumedBottles=col.reduce((s,w)=>s+getConsumedBottles(w),0);
  const regionStats=col.reduce((acc,w)=>{
    const geo=deriveRegionCountry(w.origin||"");
    const key=geo.region||geo.country;
    if(key)acc[key]=(acc[key]||0)+1;
    return acc;
  },{});
  const topRegion=Object.entries(regionStats).sort((a,b)=>b[1]-a[1])[0]?.[0]||"—";
  const avgBottle=bottles?rrpValue/bottles:0;
  const profileBg=profile.profileBg||THEME_BY_ID[(profile.accent||"wine")]?.profileBg||THEME_BY_ID.wine.profileBg;
  const displayName=[profile.name,profile.surname].filter(Boolean).join(" ")||"Winemaker";

  if(view==="settings")return <SettingsPanel onBack={()=>setView("main")} profile={profile} setProfile={setProfile} theme={theme} setTheme={setTheme}/>;
  if(view==="explore")return <ExploreWineries onBack={()=>setView("main")}/>;

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:20}}>
        <div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:11,fontWeight:600,color:"var(--sub)",letterSpacing:"2px",textTransform:"uppercase",marginBottom:4}}>Summary</div>
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:34,fontWeight:800,color:"var(--text)",lineHeight:1}}>{profile.cellarName||"My Cellar"}</div>
        </div>
        <button onClick={()=>setView("settings")} style={{width:40,height:40,borderRadius:12,background:"var(--card)",border:"1px solid var(--border)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--sub)",cursor:"pointer",transition:"all 0.15s",flexShrink:0}}
          onMouseEnter={e=>{e.currentTarget.style.background="rgba(var(--accentRgb),0.08)";e.currentTarget.style.color="var(--accent)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="var(--card)";e.currentTarget.style.color="var(--sub)";}}>
          <Icon n="settings" size={18}/>
        </button>
      </div>

      {/* Profile card */}
      <div style={{background:profileBg,borderRadius:22,padding:"22px",marginBottom:14,position:"relative",overflow:"hidden",backgroundSize:"cover",backgroundPosition:"center"}}>
        <div style={{position:"absolute",right:-22,top:-20,opacity:0.1,pointerEvents:"none"}}><BrandLogo size={150} variant="mono"/></div>
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
        {[["Wines",col.length],["Bottles",bottles],["Ready",readyCount]].map(([l,v])=>(
          <div key={l} style={{background:"var(--card)",borderRadius:16,padding:"14px 10px",textAlign:"center",border:"1px solid var(--border)"}}>
            <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:26,fontWeight:800,color:"var(--text)",lineHeight:1}}>{v}</div>
            <div style={{fontSize:10,color:"var(--sub)",fontWeight:600,marginTop:3,textTransform:"uppercase",letterSpacing:"0.7px",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"14px 16px",marginBottom:10}}>
        <div style={{fontSize:10,color:"var(--sub)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.7px",marginBottom:10,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Winery Summary</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
          {[["RRP Value",`$${rrpValue.toLocaleString(undefined,{maximumFractionDigits:2})}`],["Most Common Origin",topRegion],["Ready to Drink",`${readyCount} wines`],["Consumed Bottles",consumedBottles],["Avg Bottle RRP",`$${avgBottle.toLocaleString(undefined,{maximumFractionDigits:2})}`]].map(([k,v])=>(
            <div key={k} style={{background:"var(--inputBg)",borderRadius:12,padding:"10px 11px",border:"1px solid var(--border)"}}>
              <div style={{fontSize:10,color:"var(--sub)",textTransform:"uppercase",fontWeight:700,letterSpacing:"0.7px",marginBottom:3,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{k}</div>
              <div style={{fontSize:14,color:"var(--text)",fontWeight:700,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>{v}</div>
            </div>
          ))}
        </div>
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
        style={{background:"linear-gradient(135deg,rgba(var(--accentRgb),0.08) 0%,rgba(var(--accentRgb),0.04) 100%)",borderRadius:16,border:"1px solid rgba(var(--accentRgb),0.2)",padding:"16px",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"all 0.18s"}}
        onMouseEnter={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(var(--accentRgb),0.15) 0%,rgba(var(--accentRgb),0.08) 100%)";}}
        onMouseLeave={e=>{e.currentTarget.style.background="linear-gradient(135deg,rgba(var(--accentRgb),0.08) 0%,rgba(var(--accentRgb),0.04) 100%)";}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:36,height:36,borderRadius:10,background:"rgba(var(--accentRgb),0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><Icon n="mappin" size={18} color="var(--accent)"/></div>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Explore Wineries</div>
            <div style={{fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Discover top-rated wineries near you</div>
          </div>
        </div>
        <Icon n="chevR" size={16} color="var(--accent)"/>
      </div>

      {/* Export */}
      <div onClick={()=>setExportOpen(true)}
        style={{background:"var(--card)",borderRadius:16,border:"1px solid var(--border)",padding:"14px 16px",marginBottom:24,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",transition:"opacity 0.18s"}}
        onMouseEnter={e=>e.currentTarget.style.opacity="0.7"} onMouseLeave={e=>e.currentTarget.style.opacity="1"}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><Icon n="export" size={16} color="var(--sub)"/><span style={{fontSize:14,color:"var(--text)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:500}}>Export to Excel (.xlsx)</span></div>
        <Icon n="chevR" size={16} color="var(--sub)"/>
      </div>
      <div style={{textAlign:"center",fontSize:12,color:"var(--sub)",fontFamily:"'Plus Jakarta Sans',sans-serif",opacity:0.6,marginBottom:8}}>Vinology v6.81 · {displayName}</div>
      <Modal show={exportOpen} onClose={()=>setExportOpen(false)}>
        <ModalHeader title="Export Cellar Data" onClose={()=>setExportOpen(false)}/>
        <div style={{display:"grid",gap:10,marginBottom:16}}>
          <button onClick={()=>setIncludeNotesExport(v=>!v)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"10px 12px",borderRadius:12,border:`1.5px solid ${includeNotesExport?"var(--accent)":"var(--border)"}`,background:includeNotesExport?"rgba(var(--accentRgb),0.08)":"var(--inputBg)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:14,color:"var(--text)",fontWeight:600}}>
            <span>Include tasting notes sheet</span><span style={{fontSize:16,color:includeNotesExport?"var(--accent)":"var(--sub)"}}>{includeNotesExport?"✓":"○"}</span>
          </button>
          <div style={{fontSize:12,color:"var(--sub)",lineHeight:1.6,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
            Export always includes your full cellar with detailed wine fields and clean summary formatting.
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="secondary" onClick={()=>setExportOpen(false)} full>Cancel</Btn>
          <Btn onClick={()=>{exportToExcel(wines,[],notes,{includeWishlist:false,includeNotes:includeNotesExport});setExportOpen(false);}} full icon="export">Export</Btn>
        </div>
      </Modal>
    </div>
  );
};

/* ── TABS ─────────────────────────────────────────────────────── */
const TABS=[{id:"collection",label:"Cellar",ic:"wine"},{id:"audit",label:"Audit",ic:"audit"},{id:"ai",label:"Sommelier",ic:"chat"},{id:"notes",label:"Journal",ic:"note"},{id:"profile",label:"Summary",ic:"user"}];

/* ── APP ──────────────────────────────────────────────────────── */
export default function App(){
  const [themeMode,setThemeMode]=useState(()=>{try{return localStorage.getItem("vino_theme")||"system"}catch{return"system"}});
  const [sysDark,setSysDark]=useState(()=>window.matchMedia?.("(prefers-color-scheme:dark)").matches??false);
  const [tab,setTab]=useState("collection");
  const [wines,setWines]=useState([]);
  const [notes,setNotes]=useState([]);
  const [grapeAliasMap,setGrapeAliasMap]=useState({});
  const grapeAliasMapRef=useRef({});
  const aliasSyncEnabledRef=useRef(false);
  const [deletedWines,setDeletedWines]=useState(()=>readDeletedWines());
  const [profile,setProfileState]=useState(DEFAULT_PROFILE);
  const [savedLocations,setSavedLocations]=useState(()=>readSavedLocations());
  const [ready,setReady]=useState(false);
  const [splashPhase,setSplashPhase]=useState("logo"); // logo | greet | onboard | done
  const [isDesktop,setIsDesktop]=useState(()=>window.innerWidth>=768);
  const [isNewUser,setIsNewUser]=useState(false);
  // Onboarding form
  const [oName,setOName]=useState("");
  const [oCellar,setOCellar]=useState("");

  useEffect(()=>{try{localStorage.setItem("vino_theme",themeMode)}catch{}},[themeMode]);
  useEffect(()=>{try{localStorage.setItem(SAVED_LOCATIONS_KEY,JSON.stringify(savedLocations))}catch{}},[savedLocations]);
  useEffect(()=>{try{localStorage.setItem(DELETED_WINES_KEY,JSON.stringify(deletedWines.slice(0,40)))}catch{}},[deletedWines]);
  useEffect(()=>{
    grapeAliasMapRef.current=grapeAliasMap||{};
    setGrapeAliasCache(grapeAliasMapRef.current);
  },[grapeAliasMap]);
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
      const cache=readCache();
      const normalizeLegacyWineRows=rows=>(rows||[]).map(w=>{
        if(!w || !w.wishlist) return w;
        const legacyBottles=Math.max(1,Math.round(safeNum(w.bottles)||0)||1);
        return {...w,wishlist:false,bottles:legacyBottles};
      });
      try{
        const [wineRows,noteRows,prof,aliasRes]=await Promise.all([db.get("wines"),db.get("tasting_notes"),db.getProfile(),db.listGrapeAliases()]);
        const builtInAliasMap=deriveAliasMapFromWines(SEED_WINES);
        const learnedAliasMap=deriveAliasMapFromWines(normalizeLegacyWineRows(wineRows.map(fromDb.wine)));
        const remoteAliasMap=aliasRes.ok?buildAliasMapFromRows(aliasRes.rows||[]):{};
        const mergedAliasMap={...builtInAliasMap,...learnedAliasMap,...remoteAliasMap};
        setGrapeAliasMap(mergedAliasMap);
        grapeAliasMapRef.current=mergedAliasMap;
        setGrapeAliasCache(mergedAliasMap);
        aliasSyncEnabledRef.current=!!aliasRes.ok;
        if(aliasRes.ok && !Object.keys(remoteAliasMap).length && Object.keys(builtInAliasMap).length){
          await Promise.all(Object.entries(builtInAliasMap).map(([alias,wine_type])=>db.upsertGrapeAlias({alias,wine_type,source:"bootstrap"})));
        }
        console.log("DB: wines",wineRows.length,"notes",noteRows.length);
        if(wineRows.length===0){
          if(cache?.wines?.length){
            const cachedWines=normalizeLegacyWineRows([...(cache.wines||[]),...(cache.wishlist||[])]);
            const cachedNotes=cache.notes||[];
            setWines(cachedWines);
            setNotes(cachedNotes);
            if(cache.profile)setProfileState(cache.profile);
            setIsNewUser(!(cache.profile?.name));
            // Supabase can be accidentally reset. If we still have local cache, restore it remotely.
            await Promise.all(cachedWines.map(w=>db.upsert("wines",toDb.wine({...w,wishlist:false}))));
            if(cachedNotes.length){
              await Promise.all(cachedNotes.map(n=>db.upsert("tasting_notes",toDb.note(n))));
            }
            if(cache.profile){
              await db.saveProfile({
                ...DEFAULT_PROFILE,
                ...cache.profile,
                accent:detectAccentFromProfileBg(cache.profile.profileBg||"")||cache.profile.accent||DEFAULT_PROFILE.accent,
              });
            }
            try{
              localStorage.setItem(EXCEL_IMPORT_FLAG,"1");
              localStorage.setItem(EXCEL_RESTORE_FLAG,"1");
            }catch{}
          }else{
            await Promise.all(SEED_WINES.map(w=>db.upsert("wines",toDb.wine(w))));
            await Promise.all(SEED_NOTES.map(n=>db.upsert("tasting_notes",toDb.note(n))));
            setWines(SEED_WINES);setNotes(SEED_NOTES);
            try{localStorage.setItem(EXCEL_IMPORT_FLAG,"1");}catch{}
            setIsNewUser(true);
          }
        }else{
          let all=normalizeLegacyWineRows(wineRows.map(fromDb.wine));
          {
            // Always run non-destructive reconciliation so missing seed wines are restored.
            const ids=new Set(all.map(w=>w.id));
            const signatures=new Set(all.filter(w=>!w.wishlist).map(wineIdentitySignature));
            const toImport=SEED_WINES.filter(w=>!ids.has(w.id)&&!signatures.has(wineIdentitySignature(w)));
            if(toImport.length){
              await Promise.all(toImport.map(w=>db.upsert("wines",toDb.wine(w))));
              all=[...all,...toImport];
            }
            try{localStorage.setItem(EXCEL_IMPORT_FLAG,"1");}catch{}
          }
          // Repair older imports:
          // 1) Remove empty placeholder rows from the old spreadsheet conversion.
          // 2) Reclassify wines that were previously persisted as "Other".
          const toReclassify=all.filter(w=>{
            const inferred=guessWineType(w?.grape||"",w?.name||"",grapeAliasMapRef.current);
            if(!inferred||inferred==="Other") return false;
            return (w.wineType||"Other")!==inferred;
          });
          if(toReclassify.length){
            const repaired=toReclassify.map(w=>{
              const inferred=guessWineType(w?.grape||"",w?.name||"",grapeAliasMapRef.current);
              const tc=WINE_TYPE_COLORS[inferred]||WINE_TYPE_COLORS.Other;
              return {...w,wineType:inferred,color:tc.dot};
            });
            await Promise.all(repaired.map(w=>db.upsert("wines",toDb.wine(w))));
            const repairedById=Object.fromEntries(repaired.map(w=>[w.id,{wineType:w.wineType,color:w.color}]));
            all=all.map(w=>repairedById[w.id]?{...w,wineType:repairedById[w.id].wineType,color:repairedById[w.id].color}:w);
          }
          const toNormalizeLocation=all.filter(w=>normalizeLocation(w.location)!==(w.location||""));
          if(toNormalizeLocation.length){
            const repairedLoc=toNormalizeLocation.map(w=>({...w,location:normalizeLocation(w.location)}));
            await Promise.all(repairedLoc.map(w=>db.upsert("wines",toDb.wine(w))));
            const locById=Object.fromEntries(repairedLoc.map(w=>[w.id,w.location]));
            all=all.map(w=>locById[w.id]?{...w,location:locById[w.id]}:w);
          }
          const toRepairOriginCountry=all.filter(w=>{
            const raw=(w.origin||"").toString().trim();
            if(!raw) return false;
            const normalized=deriveRegionCountry(raw).origin||raw;
            return normalized!==raw;
          });
          if(toRepairOriginCountry.length){
            const repairedOrigins=toRepairOriginCountry.map(w=>{
              const raw=(w.origin||"").toString().trim();
              return {...w,origin:deriveRegionCountry(raw).origin||raw};
            });
            await Promise.all(repairedOrigins.map(w=>db.upsert("wines",toDb.wine(w))));
            const byId=Object.fromEntries(repairedOrigins.map(w=>[w.id,w.origin]));
            all=all.map(w=>byId[w.id]?{...w,origin:byId[w.id]}:w);
          }
          const toRepairBottleTotals=all.filter(w=>{
            const left=Math.max(0,safeNum(w.bottles)||0);
            const storedTotal=safeNum(w.cellarMeta?.totalPurchased);
            return storedTotal==null || storedTotal<left;
          });
          if(toRepairBottleTotals.length){
            const repairedTotals=toRepairBottleTotals.map(w=>({
              ...w,
              cellarMeta:{...(w.cellarMeta||{}),totalPurchased:Math.max(0,safeNum(w.bottles)||0,safeNum(w.cellarMeta?.totalPurchased)||0,SEED_TOTAL_BY_ID[w.id]||0)}
            }));
            await Promise.all(repairedTotals.map(w=>db.upsert("wines",toDb.wine(w))));
            const byId=Object.fromEntries(repairedTotals.map(w=>[w.id,w.cellarMeta]));
            all=all.map(w=>byId[w.id]?{...w,cellarMeta:byId[w.id]}:w);
          }
          const toRepairPricing=all.filter(w=>{
            const seed=SEED_PRICING_BY_ID[w.id];
            if(!seed) return false;
            const paid=safeNum(w.cellarMeta?.pricePerBottle);
            const rrp=safeNum(w.cellarMeta?.rrp);
            const totalPaid=safeNum(w.cellarMeta?.totalPaid);
            const needsPaid=(paid==null||paid<=0) && (seed.paidPerBottle||0)>0;
            const needsRrp=(rrp==null||rrp<=0) && (seed.rrpPerBottle||0)>0;
            const needsTotal=(totalPaid==null||totalPaid<=0) && (seed.totalPaid||0)>0;
            return needsPaid||needsRrp||needsTotal;
          });
          if(toRepairPricing.length){
            const repairedPricing=toRepairPricing.map(w=>{
              const seed=SEED_PRICING_BY_ID[w.id]||{};
              const m=w.cellarMeta||{};
              const paid=safeNum(m.pricePerBottle);
              const rrp=safeNum(m.rrp);
              const totalPaid=safeNum(m.totalPaid);
              return{
                ...w,
                cellarMeta:{
                  ...m,
                  pricePerBottle:(paid==null||paid<=0)?(seed.paidPerBottle??m.pricePerBottle):m.pricePerBottle,
                  rrp:(rrp==null||rrp<=0)?(seed.rrpPerBottle??m.rrp):m.rrp,
                  totalPaid:(totalPaid==null||totalPaid<=0)?(seed.totalPaid??m.totalPaid):m.totalPaid,
                }
              };
            });
            await Promise.all(repairedPricing.map(w=>db.upsert("wines",toDb.wine(w))));
            const byId=Object.fromEntries(repairedPricing.map(w=>[w.id,w.cellarMeta]));
            all=all.map(w=>byId[w.id]?{...w,cellarMeta:byId[w.id]}:w);
          }
          const toAlignImportedAddedDate=all.filter(w=>{
            if(!String(w.id||"").startsWith("xl-")) return false;
            const purchased=(w.datePurchased||"").toString().slice(0,10);
            if(!purchased) return false;
            const added=((w.cellarMeta||{}).addedDate||"").toString().slice(0,10);
            return added!==purchased;
          });
          if(toAlignImportedAddedDate.length){
            const repairedImported=toAlignImportedAddedDate.map(w=>({
              ...w,
              cellarMeta:{...(w.cellarMeta||{}),addedDate:(w.datePurchased||"").toString().slice(0,10)}
            }));
            await Promise.all(repairedImported.map(w=>db.upsert("wines",toDb.wine(w))));
            const byId=Object.fromEntries(repairedImported.map(w=>[w.id,w.cellarMeta]));
            all=all.map(w=>byId[w.id]?{...w,cellarMeta:byId[w.id]}:w);
          }
          const toRepairAddedDate=all.filter(w=>!(w.cellarMeta||{}).addedDate);
          if(toRepairAddedDate.length){
            const repairedAdded=toRepairAddedDate.map(w=>({
              ...w,
              cellarMeta:{...(w.cellarMeta||{}),addedDate:w.datePurchased||todayIsoLocal()}
            }));
            await Promise.all(repairedAdded.map(w=>db.upsert("wines",toDb.wine(w))));
            const byId=Object.fromEntries(repairedAdded.map(w=>[w.id,w.cellarMeta]));
            all=all.map(w=>byId[w.id]?{...w,cellarMeta:byId[w.id]}:w);
          }
          const restoredFromExcel=(()=>{try{return localStorage.getItem(EXCEL_RESTORE_FLAG)==="1";}catch{return false;}})();
          if(!restoredFromExcel){
            const byId=new Map(all.map(w=>[w.id,w]));
            const signatures=new Set(all.filter(w=>!w.wishlist).map(wineIdentitySignature));
            const repaired=[];
            for(const seed of SEED_WINES){
              const existing=byId.get(seed.id);
              if(!existing){
                const seedSig=wineIdentitySignature(seed);
                if(signatures.has(seedSig)) continue;
                repaired.push(seed);
                all.push(seed);
                byId.set(seed.id,seed);
                signatures.add(seedSig);
                continue;
              }
              const needsBottleRestore=(safeNum(existing.bottles)||0)<(safeNum(seed.bottles)||0);
              const existingTotal=safeNum(existing.cellarMeta?.totalPurchased);
              const seedTotal=safeNum(seed.cellarMeta?.totalPurchased);
              const fallbackTotal=(existingTotal??seedTotal??safeNum(existing.bottles)??0);
              const mergedTotal=Math.max(safeNum(existing.bottles)||0,fallbackTotal||0);
              const merged={
                ...existing,
                origin:existing.origin||seed.origin,
                grape:existing.grape||seed.grape,
                vintage:existing.vintage||seed.vintage,
                location:normalizeLocation(existing.location||seed.location),
                locationSlot:existing.locationSlot||seed.locationSlot||null,
                wineType:resolveWineType(existing),
                bottles:needsBottleRestore?(safeNum(seed.bottles)||0):(safeNum(existing.bottles)||0),
                cellarMeta:{...(existing.cellarMeta||{}),totalPurchased:mergedTotal},
                wishlist:false,
              };
              const changed=
                merged.bottles!==existing.bottles||
                merged.origin!==existing.origin||
                merged.grape!==existing.grape||
                merged.vintage!==existing.vintage||
                merged.location!==existing.location||
                merged.locationSlot!==existing.locationSlot||
                merged.wineType!==existing.wineType||
                safeNum(existing.cellarMeta?.totalPurchased)!==mergedTotal||
                existing.wishlist===true;
              if(changed){
                repaired.push(merged);
                const idx=all.findIndex(w=>w.id===merged.id);
                if(idx>=0)all[idx]=merged;
              }
            }
            if(repaired.length){
              await Promise.all(repaired.map(w=>db.upsert("wines",toDb.wine(w))));
            }
            try{localStorage.setItem(EXCEL_RESTORE_FLAG,"1");}catch{}
          }
          setWines(all.filter(w=>!w.wishlist));
          setNotes(noteRows.length?noteRows.map(fromDb.note):(cache?.notes||[]));
          if(prof){
            // Remote profile is authoritative for cross-device sync.
            const bgAccent=detectAccentFromProfileBg(prof.profileBg||"");
            const remoteProfile={name:prof.name,description:prof.description,avatar:prof.avatar||null,cellarName:prof.cellarName||"",bio:prof.bio||"",country:prof.country||"",surname:prof.surname||"",profileBg:prof.profileBg||"",accent:bgAccent||cache?.profile?.accent||DEFAULT_PROFILE.accent};
            setProfileState(remoteProfile);
            // New user = profile name still matches the seed default or is empty
            setIsNewUser(!prof.name||(prof.name===DEFAULT_PROFILE.name&&!prof.cellarName));
          }else if(cache?.profile && wineRows.length===0){
            // Offline-only fallback.
            setProfileState(cache.profile);
            setIsNewUser(!(cache.profile?.name));
          }else{
            setIsNewUser(true);
          }
        }
      }catch(e){
        console.error("Load error:",e);
        if(cache?.wines?.length){
          setWines(normalizeLegacyWineRows([...(cache.wines||[]),...(cache.wishlist||[])]));setNotes(cache.notes||[]);
          if(cache.profile)setProfileState(cache.profile);
        }else{
          setWines(SEED_WINES);setNotes(SEED_NOTES);
        }
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
  const accentFromBg=detectAccentFromProfileBg(profile.profileBg||"");
  const accent=ACCENTS[accentFromBg||profile.accent]||ACCENTS.wine;
  const navSolid=darkenHex(accent.accent,0.66);
  const cssVars={"--bg":th.bg,"--surface":th.surface,"--card":th.card,"--border":th.border,"--text":th.text,"--sub":th.sub,"--inputBg":th.inputBg,"--shadow":th.shadow,"--accent":accent.accent,"--accentLight":accent.accentLight,"--accentRgb":hexToRgb(accent.accent)};
  useEffect(()=>{
    Object.entries(cssVars).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
  });
  useEffect(()=>{
    try{
      localStorage.setItem(CACHE_KEY,JSON.stringify({wines,notes,profile}));
    }catch{}
  },[wines,notes,profile]);

  const applyWineTypeAndLearnAliases = useCallback(async wineInput=>{
    const inferred=guessWineType(wineInput?.grape||"",wineInput?.name||"",grapeAliasMapRef.current);
    const finalType=inferred||"Other";
    const color=(WINE_TYPE_COLORS[finalType]||WINE_TYPE_COLORS.Other).dot;
    const nextWine={...wineInput,wineType:finalType,color};
    const aliases=splitGrapeAliases(wineInput?.grape||"");
    if(finalType==="Other"||aliases.length===0) return nextWine;
    let nextAliasMap=grapeAliasMapRef.current;
    let changed=false;
    aliases.forEach(alias=>{
      if(!nextAliasMap[alias]){
        if(!changed) nextAliasMap={...nextAliasMap};
        nextAliasMap[alias]=finalType;
        changed=true;
      }
    });
    if(changed){
      grapeAliasMapRef.current=nextAliasMap;
      setGrapeAliasMap(nextAliasMap);
      setGrapeAliasCache(nextAliasMap);
      if(aliasSyncEnabledRef.current){
        await Promise.all(aliases.map(alias=>db.upsertGrapeAlias({alias,wine_type:finalType,source:"app"})));
      }
    }
    return nextWine;
  },[]);

  const addWine=async w=>{
    const next=await applyWineTypeAndLearnAliases(w);
    setWines(p=>[...p,next]);
    await db.upsert("wines",toDb.wine(next));
  };
  const updWine=async w=>{
    const next=await applyWineTypeAndLearnAliases(w);
    setWines(p=>p.map(x=>x.id===next.id?next:x));
    await db.upsert("wines",toDb.wine(next));
  };
  const delWine=async id=>{
    let removed=null;
    setWines(prev=>{
      removed=prev.find(x=>x.id===id)||null;
      return prev.filter(x=>x.id!==id);
    });
    if(!removed) return null;
    setDeletedWines(prev=>[{wine:removed,deletedAt:new Date().toISOString()},...prev.filter(entry=>entry?.wine?.id!==id)].slice(0,40));
    await db.del("wines",id);
    return id;
  };
  const restoreDeletedWine=async id=>{
    let found=null;
    setDeletedWines(prev=>{
      found=prev.find(entry=>entry?.wine?.id===id)||null;
      return prev.filter(entry=>entry?.wine?.id!==id);
    });
    if(!found?.wine) return null;
    setWines(prev=>prev.some(w=>w.id===id)?prev:[found.wine,...prev]);
    await db.upsert("wines",toDb.wine(found.wine));
    return found.wine;
  };
  const dismissDeletedWine=id=>setDeletedWines(prev=>prev.filter(entry=>entry?.wine?.id!==id));
  const adjustWineConsumption=async(id,delta)=>{
    let updated=null;
    setWines(prev=>prev.map(w=>{
      if(w.id!==id) return w;
      const total=getTotalPurchased(w);
      const currentConsumed=getConsumedBottles(w);
      const nextConsumed=Math.max(0,Math.min(total,currentConsumed+delta));
      const nextLeft=Math.max(0,total-nextConsumed);
      updated={...w,bottles:nextLeft,cellarMeta:{...(w.cellarMeta||{}),totalPurchased:total}};
      return updated;
    }));
    if(updated) await db.upsert("wines",toDb.wine(updated));
    return updated;
  };
  const setWineBottleCount=async(id,count)=>{
    let updated=null;
    setWines(prev=>prev.map(w=>{
      if(w.id!==id) return w;
      const nextLeft=Math.max(0,Math.round(safeNum(count)||0));
      const nextTotal=Math.max(nextLeft,getTotalPurchased(w));
      updated={...w,bottles:nextLeft,cellarMeta:{...(w.cellarMeta||{}),totalPurchased:nextTotal}};
      return updated;
    }));
    if(updated) await db.upsert("wines",toDb.wine(updated));
    return updated;
  };
  const revokeAuditSnapshot=async audit=>{
    const snapshots=Object.values(audit?.items||{})
      .map(item=>item?.beforeWine)
      .filter(w=>w&&w.id);
    if(!snapshots.length) return {restored:0};
    const unique=[...new Map(snapshots.map(w=>[w.id,w])).values()];
    setWines(prev=>{
      const map=new Map(prev.map(w=>[w.id,w]));
      unique.forEach(w=>map.set(w.id,w));
      return [...map.values()];
    });
    await Promise.all(unique.map(w=>db.upsert("wines",toDb.wine(w))));
    return {restored:unique.length};
  };
  const addSavedLocation=loc=>setSavedLocations(prev=>{
    const normalized=normalizeLocation(loc);
    if(!normalized) return prev;
    if(LOCATIONS.some(l=>locationKey(l)===locationKey(normalized))) return prev;
    return dedupeLocations([...prev,normalized]);
  });
  const removeSavedLocation=loc=>setSavedLocations(prev=>prev.filter(x=>locationKey(x)!==locationKey(loc)));
  const addNote=async n=>{setNotes(p=>[...p,n]);await db.upsert("tasting_notes",toDb.note(n));};
  const delNote=async id=>{setNotes(p=>p.filter(x=>x.id!==id));await db.del("tasting_notes",id);};
  const setProfile=async p=>{
    const syncedAccent=detectAccentFromProfileBg(p.profileBg||"")||p.accent||DEFAULT_PROFILE.accent;
    const next={...p,accent:syncedAccent};
    setProfileState(next);
    const ok=await db.saveProfile(next);
    if(ok){
      const fresh=await db.getProfile();
      if(fresh){
        const finalAccent=detectAccentFromProfileBg(fresh.profileBg||"")||next.accent||DEFAULT_PROFILE.accent;
        setProfileState(prev=>({...prev,...fresh,accent:finalAccent}));
      }
    }
  };

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
        <div key={i} style={{position:"absolute",left:b.x,top:b.y,width:b.s,height:b.s,borderRadius:"50%",background:"radial-gradient(circle,rgba(var(--accentRgb),1) 0%,transparent 70%)",opacity:b.o,animation:`pulse 3s ${b.d}s ease-in-out infinite`}}/>
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
          <div style={{width:84,height:84,borderRadius:24,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.14)",display:"inline-flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)"}}>
            <BrandLogo size={56}/>
          </div>
        </div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:58,fontWeight:800,color:"#EDE6E0",letterSpacing:"-2px",lineHeight:1,animation:"floatUp 1s 0.1s ease both"}}>Vinology</div>
        <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12,color:"rgba(237,230,224,0.3)",marginTop:16,letterSpacing:"6px",textTransform:"uppercase",animation:"floatUp 1s 0.2s ease both"}}>Personal Cellar</div>

        {/* Greeting + button — shown after logo phase */}
        {splashPhase==="greet"&&ready&&(
          <div style={{animation:"floatUp 0.8s 0.1s ease both"}}>
            <div style={{marginTop:32,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:18,fontWeight:400,color:"rgba(237,230,224,0.55)",lineHeight:1.5}}>
              Good {new Date().getHours()<12?"morning":new Date().getHours()<18?"afternoon":"evening"}{profile.name?`, ${profile.name}`:""}
            </div>
            <div style={{marginTop:36}}>
              <button
                onClick={()=>{ if(isNewUser){setSplashPhase("onboard");}else{setSplashPhase("done");} }}
                style={{background:"var(--accent)",color:"white",border:"none",borderRadius:20,padding:"16px 44px",fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"'Plus Jakarta Sans',sans-serif",letterSpacing:"-0.3px",boxShadow:"0 8px 32px rgba(var(--accentRgb),0.5)",transition:"transform 0.15s,box-shadow 0.15s",display:"inline-flex",alignItems:"center",gap:10}}
                onMouseEnter={e=>{e.currentTarget.style.transform="scale(1.04)";e.currentTarget.style.boxShadow="0 12px 40px rgba(var(--accentRgb),0.65)";}}
                onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow="0 8px 32px rgba(var(--accentRgb),0.5)";}}>
                <Icon n="chevR" size={18} color="white"/>
                {isNewUser?"Let's Get Started":"Enter My Winery"}
              </button>
            </div>
            <div style={{marginTop:16,fontSize:12,color:"rgba(237,230,224,0.2)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>
              {wines.length>0?`${wines.length} wines in your cellar`:"Building your cellar…"}
            </div>
          </div>
        )}
        {splashPhase==="greet"&&!ready&&(
          <div style={{marginTop:48,animation:"floatUp 0.6s ease both"}}>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"rgba(var(--accentRgb),0.6)",animation:`blink 1.2s ${i*0.18}s ease infinite`}}/>)}
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
          <div style={{fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:28,fontWeight:800,color:"#EDE6E0",letterSpacing:"-1px"}}>Welcome to Vinology</div>
          <div style={{fontSize:14,color:"rgba(237,230,224,0.45)",marginTop:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Tell us a little about yourself</div>
        </div>
        <div style={{marginBottom:18}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(237,230,224,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Your Name</div>
          <input
            value={oName} onChange={e=>setOName(e.target.value)}
            placeholder="e.g. Neale"
            autoFocus
            style={{background:"rgba(255,255,255,0.06)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"14px 16px",width:"100%",color:"#EDE6E0",fontSize:16,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}
            onFocus={e=>e.target.style.borderColor="rgba(var(--accentRgb),0.7)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"}
          />
        </div>
        <div style={{marginBottom:36}}>
          <div style={{fontSize:11,fontWeight:700,color:"rgba(237,230,224,0.4)",letterSpacing:"1px",textTransform:"uppercase",marginBottom:8,fontFamily:"'Plus Jakarta Sans',sans-serif"}}>Cellar Name <span style={{opacity:0.5,textTransform:"none",letterSpacing:0,fontSize:10}}>optional</span></div>
          <input
            value={oCellar} onChange={e=>setOCellar(e.target.value)}
            placeholder="e.g. The Neale Cellar, Château Moi"
            style={{background:"rgba(255,255,255,0.06)",border:"1.5px solid rgba(255,255,255,0.12)",borderRadius:14,padding:"14px 16px",width:"100%",color:"#EDE6E0",fontSize:16,fontFamily:"'Plus Jakarta Sans',sans-serif",outline:"none",backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)"}}
            onFocus={e=>e.target.style.borderColor="rgba(var(--accentRgb),0.7)"}
            onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.12)"}
            onKeyDown={e=>e.key==="Enter"&&oName&&enterApp(oName,oCellar)}
          />
        </div>
        <button
          onClick={()=>oName&&enterApp(oName,oCellar)}
          disabled={!oName}
          style={{width:"100%",background:oName?"var(--accent)":"rgba(var(--accentRgb),0.2)",color:oName?"white":"rgba(237,230,224,0.3)",border:"none",borderRadius:18,padding:"17px",fontSize:16,fontWeight:700,cursor:oName?"pointer":"default",fontFamily:"'Plus Jakarta Sans',sans-serif",boxShadow:oName?"0 8px 32px rgba(var(--accentRgb),0.45)":"none",transition:"all 0.25s",letterSpacing:"-0.2px"}}
          onMouseEnter={e=>{if(oName){e.currentTarget.style.transform="scale(1.02)";e.currentTarget.style.boxShadow="0 12px 40px rgba(var(--accentRgb),0.6)";}}}
          onMouseLeave={e=>{e.currentTarget.style.transform="scale(1)";e.currentTarget.style.boxShadow=oName?"0 8px 32px rgba(var(--accentRgb),0.45)":"none";}}>
          Enter My Winery →
        </button>
        <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"rgba(237,230,224,0.2)",fontFamily:"'Plus Jakarta Sans',sans-serif"}}>You can change this anytime in Settings</div>
      </div>
    </div>
  );

  const screens=(
    <>
      {tab==="collection"&&<CollectionScreen wines={wines} onAdd={addWine} onUpdate={updWine} onDelete={delWine} onAdjustConsumption={adjustWineConsumption} desktop={isDesktop} savedLocations={savedLocations} onSaveLocation={addSavedLocation} onRemoveLocation={removeSavedLocation} deletedWines={deletedWines} onRestoreDeleted={restoreDeletedWine} onDismissDeleted={dismissDeletedWine}/>}
      {tab==="audit"&&<AuditScreen wines={wines} desktop={isDesktop} onSetWineBottles={setWineBottleCount} onRemoveWine={delWine} onRevokeAudit={revokeAuditSnapshot}/>}
      {tab==="ai"&&<AIScreen wines={wines}/>}
      {tab==="notes"&&<JournalScreen wines={wines} onUpdate={updWine} desktop={isDesktop}/>}
      {tab==="profile"&&<ProfileScreen wines={wines} notes={notes} theme={themeMode} setTheme={setThemeMode} profile={profile} setProfile={setProfile}/>}
    </>
  );

  const displayName=[profile.name,profile.surname].filter(Boolean).join(" ")||profile.name||"Winemaker";

  if(isDesktop) return(
    <div style={{...cssVars,background:"radial-gradient(circle at 10% -10%,rgba(var(--accentRgb),.09),transparent 35%), var(--bg)",height:"100vh",display:"flex",overflow:"hidden",fontFamily:"'Plus Jakarta Sans',sans-serif",color:"var(--text)"}}>
      <style>{CSS}</style>
      <div style={{width:236,flexShrink:0,background:navSolid,display:"flex",flexDirection:"column",padding:"30px 14px 24px",borderRight:"1px solid rgba(255,255,255,.08)"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:36,paddingLeft:8}}>
          <BrandLogo size={28}/>
          <span style={{fontSize:20,fontWeight:800,color:"#EDE6E0",letterSpacing:"-0.5px"}}>Vinology</span>
        </div>
        <nav style={{flex:1,display:"flex",flexDirection:"column",gap:2}}>
          {TABS.map(tb=>{
            const active=tab===tb.id;
            return(
              <button key={tb.id} onClick={()=>setTab(tb.id)} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 12px",borderRadius:11,border:"none",background:active?"rgba(255,255,255,0.14)":"transparent",color:active?"#FFFFFF":"rgba(255,255,255,0.82)",fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:active?700:500,fontSize:14,cursor:"pointer",transition:"all 0.15s",textAlign:"left",width:"100%"}}>
                <Icon n={tb.ic} size={17} color={active?"#FFFFFF":"rgba(255,255,255,0.78)"}/>
                {tb.label}
                {active&&<div style={{marginLeft:"auto",width:5,height:5,borderRadius:"50%",background:"#FFFFFF",flexShrink:0}}/>}
              </button>
            );
          })}
        </nav>
        <div style={{borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:16,display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:34,height:34,borderRadius:"50%",background:"rgba(var(--accentRgb),0.3)",overflow:"hidden",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>
            {profile.avatar?<img src={profile.avatar} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>:<Icon n="user" size={15} color="var(--accentLight)"/>}
          </div>
          <div style={{minWidth:0}}>
            <div style={{fontSize:13,fontWeight:700,color:"#FFFFFF",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textShadow:"0 1px 8px rgba(0,0,0,.35)"}}>{displayName}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.78)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{profile.cellarName||profile.description||"My Cellar"}</div>
          </div>
        </div>
      </div>
      <div data-scroll="main" style={{flex:1,overflowY:"auto",overflowX:"hidden",WebkitOverflowScrolling:"touch"}}>
        <div style={{maxWidth:1280,margin:"0 auto",padding:"34px 52px 64px"}}>
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
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:480,background:navSolid,backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderTop:"1px solid rgba(255,255,255,0.12)",padding:"10px 0 22px",zIndex:100}}>
        <div style={{display:"flex",justifyContent:"space-around"}}>
          {TABS.map(tb=>{
            const active=tab===tb.id;
            return(
              <button key={tb.id} onClick={()=>setTab(tb.id)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,background:"none",border:"none",padding:"4px 12px",color:active?"#FFFFFF":"rgba(255,255,255,0.78)",transition:"color 0.18s",fontFamily:"'Plus Jakarta Sans',sans-serif",cursor:"pointer"}}>
                <div style={{transform:active?"scale(1.1)":"scale(1)",transition:"transform 0.18s"}}><Icon n={tb.ic} size={22} color={active?"#FFFFFF":"rgba(255,255,255,0.72)"}/></div>
                <span style={{fontSize:9.5,fontWeight:active?700:500,letterSpacing:"0.3px"}}>{tb.label}</span>
                <div style={{width:4,height:4,borderRadius:"50%",background:active?"#FFFFFF":"transparent",transition:"background 0.18s"}}/>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
