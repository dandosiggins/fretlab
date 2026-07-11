import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabase";

/* ============================================================
   GEAR VAULT — gear inventory module for FretLab (v2)
   Local-first, same philosophy as FretLab sync.
   v2 adds: serial numbers, total-value readout, JSON
   export/import backup, and a Signal Chain view for
   pedalboard order.
   Status jewel: grey local · amber saving · green synced · red error.
   ============================================================ */

const LS_DATA = "fretlab-gear";
const lsImgKey = (id) => `fretlab-gear-img-${id}`;
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

const LED_COLORS = ["#E03A2F", "#3FA34D", "#2E86C1", "#D4A017", "#8E44AD", "#E67E22", "#16A085", "#C0392B"];

const DEFAULT_CATEGORIES = [
  { id: "cat_guitars", name: "Guitars", color: "#E03A2F", types: ["Electric", "Acoustic", "Bass"] },
  { id: "cat_pedals", name: "Pedals", color: "#3FA34D", types: ["Overdrive", "Distortion", "Fuzz", "Delay", "Reverb", "Modulation", "Compressor", "Tuner"] },
  { id: "cat_amps", name: "Amps", color: "#D4A017", types: ["Tube", "Solid State", "Modeling"] },
  { id: "cat_accessories", name: "Accessories", color: "#2E86C1", types: ["Cables", "Straps", "Cases", "Strings"] },
];

/* ---------- price parsing ---------- */
function parsePrice(p) {
  const n = parseFloat(String(p || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function formatMoney(n) {
  return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/* ---------- local storage (quota-safe) ---------- */
function readLocal() {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt or unavailable */ }
  return null;
}
function writeLocal(items, categories, catsUpdatedAt, chain) {
  try {
    localStorage.setItem(LS_DATA, JSON.stringify({ items, categories, catsUpdatedAt, chain }));
  } catch (e) { console.warn("Local save failed", e); }
}
function readLocalImg(id) {
  try { return localStorage.getItem(lsImgKey(id)); } catch (e) { return null; }
}
function writeLocalImg(id, dataUrl) {
  try { localStorage.setItem(lsImgKey(id), dataUrl); }
  catch (e) { /* quota exceeded — cloud copy (if any) still exists */ }
}
function removeLocalImg(id) {
  try { localStorage.removeItem(lsImgKey(id)); } catch (e) { /* fine */ }
}

/* ---------- image compression ---------- */
function compressImage(file, maxDim = 720, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const s = maxDim / Math.max(width, height);
          width = Math.round(width * s);
          height = Math.round(height * s);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function dataUrlToBlob(dataUrl) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)[1];
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/* ---------- cloud helpers (all no-ops when signed out) ---------- */
const imgPath = (userId, itemId) => `${userId}/${itemId}.jpg`;

async function cloudUpsertItem(userId, item) {
  const { error } = await supabase.from("gear_items").upsert({
    id: item.id, user_id: userId, name: item.name, brand: item.brand,
    category_id: item.categoryId, type: item.type, price: item.price,
    year: item.year, serial: item.serial || "", notes: item.notes,
    has_image: item.hasImage, updated_at: item.updatedAt,
  });
  if (error) throw error;
}
async function cloudDeleteItem(userId, itemId) {
  const { error } = await supabase.from("gear_items").delete().eq("id", itemId);
  if (error) throw error;
  await supabase.storage.from("gear-images").remove([imgPath(userId, itemId)]);
}
async function cloudUpsertMeta(userId, categories, chain, updatedAt) {
  const { error } = await supabase.from("gear_categories").upsert({
    user_id: userId, data: categories, chain: chain, updated_at: updatedAt,
  });
  if (error) throw error;
}
async function cloudUploadImage(userId, itemId, dataUrl) {
  const { error } = await supabase.storage.from("gear-images")
    .upload(imgPath(userId, itemId), dataUrlToBlob(dataUrl), { upsert: true, contentType: "image/jpeg" });
  if (error) throw error;
}
async function cloudDownloadImage(userId, itemId) {
  const { data, error } = await supabase.storage.from("gear-images").download(imgPath(userId, itemId));
  if (error || !data) return null;
  return blobToDataUrl(data);
}

/* ---------- styles ---------- */
const S = {
  wrap: { color: "#E8DFC8", fontFamily: "'Helvetica Neue', Arial, sans-serif", paddingBottom: 50 },
  bar: {
    display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center",
    padding: "18px 20px 0", maxWidth: 1080, margin: "0 auto",
  },
  heading: {
    fontFamily: "'Arial Narrow', Impact, sans-serif", fontSize: 20, fontWeight: 700,
    letterSpacing: "0.2em", textTransform: "uppercase", margin: 0, display: "flex",
    alignItems: "center", gap: 10,
  },
  jewel: (state) => {
    const map = { local: "#6E6250", saving: "#D9A63B", synced: "#3FA34D", error: "#E03A2F" };
    const c = map[state] || map.local;
    return {
      width: 12, height: 12, borderRadius: "50%", background: c, flexShrink: 0,
      boxShadow: state !== "local" ? `0 0 8px 1px ${c}99` : "inset 0 1px 2px rgba(0,0,0,0.6)",
      transition: "background 0.3s, box-shadow 0.3s",
    };
  },
  jewelLabel: { fontSize: 9, letterSpacing: "0.18em", color: "#7A6E58", textTransform: "uppercase" },
  search: {
    flex: "1 1 180px", minWidth: 150, padding: "9px 13px", background: "#26211E",
    border: "1px solid #4A3F32", borderRadius: 6, color: "#E8DFC8", fontSize: 14, outline: "none",
  },
  btn: (primary) => ({
    padding: "9px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase",
    border: primary ? "1px solid #D4A73B" : "1px solid #4A3F32",
    background: primary ? "linear-gradient(180deg, #D9AE45, #B8902E)" : "#2B2622",
    color: primary ? "#211B10" : "#CDBFA5",
  }),
  viewToggle: (active) => ({
    padding: "9px 14px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase",
    border: active ? "1px solid #D4A73B" : "1px solid #4A3F32",
    background: active ? "#3A3125" : "#2B2622",
    color: active ? "#E8D8A8" : "#8A7E66",
  }),
  chipRow: { maxWidth: 1080, margin: "14px auto 0", padding: "0 20px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  chip: (active, color) => ({
    display: "flex", alignItems: "center", gap: 7, padding: "6px 13px", borderRadius: 20,
    cursor: "pointer", fontSize: 12, userSelect: "none",
    border: active ? `1px solid ${color}` : "1px solid #3B342C",
    background: active ? "#2E2823" : "#221E1A", color: active ? "#F0E8D2" : "#9C8F76",
  }),
  led: (color, on) => ({
    width: 9, height: 9, borderRadius: "50%", background: on ? color : "#3B342C",
    boxShadow: on ? `0 0 7px 1px ${color}88` : "inset 0 1px 1px rgba(0,0,0,0.6)",
  }),
  statsLine: {
    maxWidth: 1080, margin: "12px auto 0", padding: "0 20px",
    fontSize: 12, color: "#9C8F76", letterSpacing: "0.06em",
  },
  grid: {
    maxWidth: 1080, margin: "16px auto 0", padding: "0 20px",
    display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16,
  },
  card: {
    background: "#262120", border: "1px solid #3B342C", borderRadius: 8, overflow: "hidden",
    display: "flex", flexDirection: "column", boxShadow: "0 3px 10px rgba(0,0,0,0.35)",
  },
  cardImg: { width: "100%", height: 150, objectFit: "cover", display: "block", background: "#1B1715" },
  cardImgEmpty: {
    width: "100%", height: 150, display: "flex", alignItems: "center", justifyContent: "center",
    background: "#1B1715", color: "#4A4136", fontSize: 34,
  },
  cardBody: { padding: "12px 14px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 5 },
  cardName: { fontSize: 15, fontWeight: 700, color: "#F0E8D2", margin: 0 },
  cardMeta: { fontSize: 12, color: "#9C8F76" },
  serial: { fontSize: 10, color: "#7A6E58", fontFamily: "monospace", letterSpacing: "0.06em" },
  badge: {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700,
    letterSpacing: "0.1em", textTransform: "uppercase", color: "#CDBFA5", marginTop: 2,
  },
  cardActions: { display: "flex", gap: 8, marginTop: 10 },
  smallBtn: (danger) => ({
    flex: 1, padding: "6px 0", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em",
    textTransform: "uppercase", borderRadius: 5, cursor: "pointer",
    border: danger ? "1px solid #6E332C" : "1px solid #4A3F32",
    background: "transparent", color: danger ? "#D8776C" : "#CDBFA5",
  }),
  /* signal chain */
  chainWrap: { maxWidth: 760, margin: "18px auto 0", padding: "0 20px" },
  chainRow: {
    display: "flex", alignItems: "center", gap: 12, background: "#262120",
    border: "1px solid #3B342C", borderRadius: 8, padding: "10px 14px", marginBottom: 8,
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  },
  chainIndex: {
    fontFamily: "'Arial Narrow', Impact, sans-serif", fontSize: 16, fontWeight: 700,
    color: "#D4A73B", width: 26, textAlign: "right", flexShrink: 0,
  },
  chainThumb: { width: 44, height: 44, objectFit: "cover", borderRadius: 6, background: "#1B1715", flexShrink: 0, border: "1px solid #3B342C" },
  chainThumbEmpty: {
    width: 44, height: 44, borderRadius: 6, background: "#1B1715", flexShrink: 0,
    border: "1px solid #3B342C", display: "flex", alignItems: "center", justifyContent: "center",
    color: "#4A4136", fontSize: 18,
  },
  chainBtn: {
    width: 30, height: 26, borderRadius: 5, cursor: "pointer", fontSize: 12,
    border: "1px solid #4A3F32", background: "#2B2622", color: "#CDBFA5", padding: 0,
  },
  chainCable: {
    width: 2, height: 12, background: "#4A3F32", margin: "0 auto 8px", borderRadius: 1,
    marginLeft: 45,
  },
  endpoint: {
    display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", marginBottom: 8,
    fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
    color: "#7A6E58", border: "1px dashed #3B342C", borderRadius: 8,
  },
  overlay: {
    position: "fixed", inset: 0, background: "rgba(12,10,9,0.78)", display: "flex",
    alignItems: "flex-start", justifyContent: "center", overflowY: "auto", zIndex: 50, padding: "40px 16px",
  },
  modal: {
    background: "#2A2522", border: "1px solid #4A3F32", borderRadius: 10, width: "100%",
    maxWidth: 520, padding: 24, boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
  },
  modalTitle: {
    fontFamily: "'Arial Narrow', Impact, sans-serif", fontSize: 17, fontWeight: 700,
    letterSpacing: "0.18em", textTransform: "uppercase", color: "#E8DFC8",
    margin: "0 0 18px", borderBottom: "1px solid #4A3F32", paddingBottom: 12,
  },
  label: {
    display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.16em",
    textTransform: "uppercase", color: "#9C8F76", marginBottom: 5, marginTop: 14,
  },
  input: {
    width: "100%", boxSizing: "border-box", padding: "9px 12px", background: "#1F1B18",
    border: "1px solid #4A3F32", borderRadius: 6, color: "#E8DFC8", fontSize: 14, outline: "none",
  },
  empty: {
    maxWidth: 1080, margin: "50px auto", padding: "0 20px", textAlign: "center",
    color: "#7A6E58", fontSize: 14, lineHeight: 1.7,
  },
};

/* ---------- item form modal ---------- */
function ItemModal({ item, categories, onSave, onCancel }) {
  const [name, setName] = useState(item?.name || "");
  const [brand, setBrand] = useState(item?.brand || "");
  const [categoryId, setCategoryId] = useState(item?.categoryId || categories[0]?.id || "");
  const [type, setType] = useState(item?.type || "");
  const [price, setPrice] = useState(item?.price || "");
  const [year, setYear] = useState(item?.year || "");
  const [serial, setSerial] = useState(item?.serial || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [imgPreview, setImgPreview] = useState(item?.imgData || null);
  const [imgChanged, setImgChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const cat = categories.find((c) => c.id === categoryId);
  const types = cat?.types || [];

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImage(file);
      setImgPreview(dataUrl);
      setImgChanged(true);
    } catch (err) { console.error(err); }
    setBusy(false);
  };

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: item?.id || uid(),
      name: name.trim(), brand: brand.trim(), categoryId,
      type, price: price.trim(), year: year.trim(),
      serial: serial.trim(), notes: notes.trim(),
      hasImage: !!imgPreview,
      updatedAt: new Date().toISOString(),
    }, imgChanged ? imgPreview : undefined);
  };

  return (
    <div style={S.overlay} onClick={onCancel}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={S.modalTitle}>{item ? "Edit item" : "Add item"}</h2>

        <label style={S.label}>Name *</label>
        <input style={S.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Big Muff Pi" autoFocus />

        <label style={S.label}>Brand</label>
        <input style={S.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Electro-Harmonix" />

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Category</label>
            <select style={S.input} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setType(""); }}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Type</label>
            <select style={S.input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">—</option>
              {types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Price</label>
            <input style={S.input} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={S.label}>Year</label>
            <input style={S.input} value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2021" />
          </div>
        </div>

        <label style={S.label}>Serial number</label>
        <input style={S.input} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="For insurance / registration" />

        <label style={S.label}>Notes</label>
        <textarea style={{ ...S.input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }}
          value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Mods, where you got it…" />

        <label style={S.label}>Photo</label>
        {imgPreview && (
          <img src={imgPreview} alt="preview"
            style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 6, marginBottom: 8, border: "1px solid #4A3F32" }} />
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn(false)} onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? "Processing…" : imgPreview ? "Replace photo" : "Upload photo"}
          </button>
          {imgPreview && (
            <button style={S.smallBtn(true)} onClick={() => { setImgPreview(null); setImgChanged(true); }}>Remove</button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button style={{ ...S.btn(true), flex: 1, opacity: name.trim() ? 1 : 0.5 }} onClick={submit} disabled={!name.trim()}>
            {item ? "Save changes" : "Add to inventory"}
          </button>
          <button style={{ ...S.btn(false), flex: 1 }} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- category manager modal ---------- */
function CategoryModal({ categories, items, onSave, onClose }) {
  const [cats, setCats] = useState(() => JSON.parse(JSON.stringify(categories)));
  const [newCat, setNewCat] = useState("");
  const [typeInputs, setTypeInputs] = useState({});

  const addCategory = () => {
    const name = newCat.trim();
    if (!name || cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCats([...cats, { id: "cat_" + uid(), name, color: LED_COLORS[cats.length % LED_COLORS.length], types: [] }]);
    setNewCat("");
  };
  const renameCategory = (id, name) => setCats(cats.map((c) => (c.id === id ? { ...c, name } : c)));
  const removeCategory = (id) => {
    const count = items.filter((i) => i.categoryId === id).length;
    if (count > 0 && !window.confirm(`${count} item(s) use this category. They'll be left uncategorized. Remove anyway?`)) return;
    setCats(cats.filter((c) => c.id !== id));
  };
  const addType = (id) => {
    const val = (typeInputs[id] || "").trim();
    if (!val) return;
    setCats(cats.map((c) => (c.id === id && !c.types.includes(val) ? { ...c, types: [...c.types, val] } : c)));
    setTypeInputs({ ...typeInputs, [id]: "" });
  };
  const removeType = (id, t) => setCats(cats.map((c) => (c.id === id ? { ...c, types: c.types.filter((x) => x !== t) } : c)));

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={S.modalTitle}>Manage categories</h2>

        {cats.map((c) => (
          <div key={c.id} style={{ border: "1px solid #3B342C", borderRadius: 8, padding: 14, marginBottom: 12, background: "#241F1C" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={S.led(c.color, true)} />
              <input style={{ ...S.input, flex: 1, fontWeight: 700 }} value={c.name} onChange={(e) => renameCategory(c.id, e.target.value)} />
              <button style={S.smallBtn(true)} onClick={() => removeCategory(c.id)}>Delete</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {c.types.map((t) => (
                <span key={t} style={{ ...S.chip(false, c.color), cursor: "default", padding: "5px 10px" }}>
                  {t}
                  <span style={{ cursor: "pointer", color: "#D8776C", marginLeft: 4, fontWeight: 700 }} onClick={() => removeType(c.id, t)}>×</span>
                </span>
              ))}
              {c.types.length === 0 && <span style={{ fontSize: 12, color: "#7A6E58" }}>No types yet</span>}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input style={{ ...S.input, flex: 1 }} placeholder="Add a type (e.g. Overdrive)"
                value={typeInputs[c.id] || ""}
                onChange={(e) => setTypeInputs({ ...typeInputs, [c.id]: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && addType(c.id)} />
              <button style={S.btn(false)} onClick={() => addType(c.id)}>Add type</button>
            </div>
          </div>
        ))}

        <label style={S.label}>New category</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input style={{ ...S.input, flex: 1 }} placeholder="e.g. Recording gear" value={newCat}
            onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory()} />
          <button style={S.btn(false)} onClick={addCategory}>Add</button>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button style={{ ...S.btn(true), flex: 1 }} onClick={() => onSave(cats)}>Save categories</button>
          <button style={{ ...S.btn(false), flex: 1 }} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- main module ---------- */
export default function GearVault() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [catsUpdatedAt, setCatsUpdatedAt] = useState(null);
  const [chain, setChain] = useState([]); // ordered item ids
  const [images, setImages] = useState({});
  const [userId, setUserId] = useState(null);
  const [sync, setSync] = useState("local");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState(null);
  const [view, setView] = useState("inventory"); // inventory | chain
  const [editing, setEditing] = useState(null);
  const [showCats, setShowCats] = useState(false);
  const [chainPick, setChainPick] = useState("");
  const mergedRef = useRef(false);
  const importRef = useRef(null);

  const runCloud = useCallback(async (fn) => {
    if (!supabase || !userId) return;
    setSync("saving");
    try { await fn(); setSync("synced"); }
    catch (e) { console.error("Gear sync error", e); setSync("error"); }
  }, [userId]);

  /* --- load local immediately --- */
  useEffect(() => {
    const local = readLocal();
    if (local) {
      setItems(local.items || []);
      if (local.categories?.length) setCategories(local.categories);
      setCatsUpdatedAt(local.catsUpdatedAt || null);
      setChain(Array.isArray(local.chain) ? local.chain : []);
      const imgs = {};
      for (const it of local.items || []) {
        if (it.hasImage) {
          const d = readLocalImg(it.id);
          if (d) imgs[it.id] = d;
        }
      }
      setImages(imgs);
    }
  }, []);

  /* --- watch auth session (FretLab's SYNC jewel handles sign-in) --- */
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUserId(data?.session?.user?.id || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id || null);
      mergedRef.current = false;
    });
    return () => sub?.subscription?.unsubscribe();
  }, []);

  /* --- on sign-in: merge cloud and local, newest wins per item --- */
  useEffect(() => {
    if (!supabase || !userId || mergedRef.current) return;
    mergedRef.current = true;
    (async () => {
      setSync("saving");
      try {
        const [{ data: cloudItems, error: e1 }, { data: cloudMeta, error: e2 }] = await Promise.all([
          supabase.from("gear_items").select("*"),
          supabase.from("gear_categories").select("*").maybeSingle(),
        ]);
        if (e1) throw e1;
        if (e2 && e2.code !== "PGRST116") throw e2;

        const local = readLocal() || { items: [], categories: null, catsUpdatedAt: null, chain: [] };
        const localItems = local.items || [];
        const localById = Object.fromEntries(localItems.map((i) => [i.id, i]));
        const merged = {};
        const toUpload = [];

        for (const li of localItems) merged[li.id] = li;
        for (const ci of cloudItems || []) {
          const asLocal = {
            id: ci.id, name: ci.name, brand: ci.brand, categoryId: ci.category_id,
            type: ci.type, price: ci.price, year: ci.year, serial: ci.serial || "",
            notes: ci.notes, hasImage: ci.has_image, updatedAt: ci.updated_at,
          };
          const li = localById[ci.id];
          if (!li || new Date(ci.updated_at) >= new Date(li.updatedAt || 0)) merged[ci.id] = asLocal;
        }
        for (const li of localItems) {
          const ci = (cloudItems || []).find((c) => c.id === li.id);
          if (!ci || new Date(li.updatedAt || 0) > new Date(ci.updated_at)) toUpload.push(li);
        }

        const mergedItems = Object.values(merged).sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

        let mergedCats = local.categories?.length ? local.categories : DEFAULT_CATEGORIES;
        let mergedChain = Array.isArray(local.chain) ? local.chain : [];
        let mergedCatsAt = local.catsUpdatedAt;
        if (cloudMeta && (!mergedCatsAt || new Date(cloudMeta.updated_at) >= new Date(mergedCatsAt))) {
          mergedCats = cloudMeta.data;
          mergedChain = Array.isArray(cloudMeta.chain) ? cloudMeta.chain : [];
          mergedCatsAt = cloudMeta.updated_at;
        } else if (local.categories?.length) {
          await cloudUpsertMeta(userId, mergedCats, mergedChain, mergedCatsAt || new Date().toISOString());
        }

        setItems(mergedItems);
        setCategories(mergedCats);
        setChain(mergedChain);
        setCatsUpdatedAt(mergedCatsAt);
        writeLocal(mergedItems, mergedCats, mergedCatsAt, mergedChain);

        for (const li of toUpload) {
          await cloudUpsertItem(userId, li);
          if (li.hasImage) {
            const d = readLocalImg(li.id);
            if (d) await cloudUploadImage(userId, li.id, d);
          }
        }

        for (const it of mergedItems) {
          if (it.hasImage && !readLocalImg(it.id)) {
            const d = await cloudDownloadImage(userId, it.id);
            if (d) {
              writeLocalImg(it.id, d);
              setImages((prev) => ({ ...prev, [it.id]: d }));
            }
          } else if (it.hasImage) {
            const d = readLocalImg(it.id);
            if (d) setImages((prev) => ({ ...prev, [it.id]: d }));
          }
        }
        setSync("synced");
      } catch (e) {
        console.error("Gear merge failed", e);
        setSync("error");
      }
    })();
  }, [userId]);

  /* --- save / delete --- */
  const handleSaveItem = async (item, newImgData) => {
    if (newImgData === null) {
      removeLocalImg(item.id);
      setImages((prev) => { const p = { ...prev }; delete p[item.id]; return p; });
      item.hasImage = false;
    } else if (typeof newImgData === "string") {
      writeLocalImg(item.id, newImgData);
      setImages((prev) => ({ ...prev, [item.id]: newImgData }));
      item.hasImage = true;
    }
    const exists = items.some((i) => i.id === item.id);
    const newItems = exists ? items.map((i) => (i.id === item.id ? item : i)) : [item, ...items];
    setItems(newItems);
    writeLocal(newItems, categories, catsUpdatedAt, chain);
    setEditing(null);

    runCloud(async () => {
      await cloudUpsertItem(userId, item);
      if (typeof newImgData === "string") await cloudUploadImage(userId, item.id, newImgData);
      if (newImgData === null) await supabase.storage.from("gear-images").remove([imgPath(userId, item.id)]);
    });
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Remove "${item.name}" from your inventory?`)) return;
    removeLocalImg(item.id);
    const newItems = items.filter((i) => i.id !== item.id);
    const newChain = chain.filter((id) => id !== item.id);
    setItems(newItems);
    setChain(newChain);
    setImages((prev) => { const p = { ...prev }; delete p[item.id]; return p; });
    writeLocal(newItems, categories, catsUpdatedAt, newChain);
    runCloud(async () => {
      await cloudDeleteItem(userId, item.id);
      if (newChain.length !== chain.length) {
        await cloudUpsertMeta(userId, categories, newChain, new Date().toISOString());
      }
    });
  };

  const handleSaveCategories = (newCats) => {
    const validIds = new Set(newCats.map((c) => c.id));
    const newItems = items.map((i) => (validIds.has(i.categoryId) ? i : { ...i, categoryId: "", type: "" }));
    const stamp = new Date().toISOString();
    setCategories(newCats);
    setItems(newItems);
    setCatsUpdatedAt(stamp);
    if (filterCat && !validIds.has(filterCat)) setFilterCat(null);
    writeLocal(newItems, newCats, stamp, chain);
    setShowCats(false);
    runCloud(() => cloudUpsertMeta(userId, newCats, chain, stamp));
  };

  /* --- signal chain --- */
  const saveChain = (newChain) => {
    const stamp = new Date().toISOString();
    setChain(newChain);
    setCatsUpdatedAt(stamp);
    writeLocal(items, categories, stamp, newChain);
    runCloud(() => cloudUpsertMeta(userId, categories, newChain, stamp));
  };
  const moveInChain = (idx, dir) => {
    const j = idx + dir;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[idx], next[j]] = [next[j], next[idx]];
    saveChain(next);
  };
  const addToChain = (id) => {
    if (!id || chain.includes(id)) return;
    saveChain([...chain, id]);
    setChainPick("");
  };
  const removeFromChain = (id) => saveChain(chain.filter((x) => x !== id));

  /* --- export / import --- */
  const handleExport = () => {
    const imgs = {};
    for (const it of items) {
      if (it.hasImage) {
        const d = readLocalImg(it.id) || images[it.id];
        if (d) imgs[it.id] = d;
      }
    }
    const payload = {
      app: "fretlab-gear", version: 2, exportedAt: new Date().toISOString(),
      items, categories, chain, images: imgs,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fretlab-gear-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* --- spreadsheet export (insurance / selling) --- */
  const CURRENCY = '"$"#,##0.00';
  const handleSpreadsheet = () => {
    const catName = (i) => catById[i.categoryId]?.name || "Uncategorized";
    const sorted = [...items].sort((a, b) =>
      catName(a).localeCompare(catName(b)) || (a.name || "").localeCompare(b.name || ""));

    /* Sheet 1 — full inventory detail */
    const header = ["Name", "Brand", "Category", "Type", "Year", "Serial Number", "Price (as entered)", "Value", "Notes"];
    const rows = sorted.map((i) => [
      i.name, i.brand, catName(i), i.type, i.year, i.serial || "",
      i.price, parsePrice(i.price) || null, i.notes,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const n = rows.length;
    for (let r = 2; r <= n + 1; r++) {
      const c = ws[`H${r}`];
      if (c && c.t === "n") c.z = CURRENCY;
    }
    const grandTotal = sorted.reduce((s2, i) => s2 + parsePrice(i.price), 0);
    ws[`A${n + 2}`] = { t: "s", v: "TOTAL" };
    ws[`H${n + 2}`] = { t: "n", v: grandTotal, f: `SUM(H2:H${n + 1})`, z: CURRENCY };
    ws["!ref"] = `A1:I${n + 2}`;
    ws["!cols"] = [
      { wch: 28 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 8 },
      { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 42 },
    ];

    /* Sheet 2 — summary by category (live formulas against the detail sheet) */
    const catNames = [...new Set(sorted.map(catName))];
    const sumAoa = [
      ["Gear Inventory Summary"],
      [`Generated ${new Date().toLocaleDateString()}`],
      [],
      ["Category", "Items", "Value"],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(sumAoa);
    catNames.forEach((name, idx) => {
      const r = 5 + idx;
      const catItems = sorted.filter((i) => catName(i) === name);
      const catValue = catItems.reduce((s2, i) => s2 + parsePrice(i.price), 0);
      ws2[`A${r}`] = { t: "s", v: name };
      ws2[`B${r}`] = { t: "n", v: catItems.length, f: `COUNTIF(Inventory!$C$2:$C$${n + 1},$A${r})` };
      ws2[`C${r}`] = { t: "n", v: catValue, f: `SUMIF(Inventory!$C$2:$C$${n + 1},$A${r},Inventory!$H$2:$H$${n + 1})`, z: CURRENCY };
    });
    const totalR = 5 + catNames.length + 1;
    ws2[`A${totalR}`] = { t: "s", v: "TOTAL" };
    ws2[`B${totalR}`] = { t: "n", v: sorted.length, f: `SUM(B5:B${totalR - 2})` };
    ws2[`C${totalR}`] = { t: "n", v: grandTotal, f: `SUM(C5:C${totalR - 2})`, z: CURRENCY };
    ws2["!ref"] = `A1:C${totalR}`;
    ws2["!cols"] = [{ wch: 22 }, { wch: 8 }, { wch: 14 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, `gear-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.items)) throw new Error("Not a Gear Vault backup file");
      if (!window.confirm(`Replace your current inventory with this backup (${data.items.length} items)? Current data will be overwritten locally and in the cloud.`)) return;

      const stamp = new Date().toISOString();
      const cats = data.categories?.length ? data.categories : DEFAULT_CATEGORIES;
      const chainArr = Array.isArray(data.chain) ? data.chain : [];
      setItems(data.items);
      setCategories(cats);
      setChain(chainArr);
      setCatsUpdatedAt(stamp);
      const imgs = {};
      for (const [id, d] of Object.entries(data.images || {})) {
        writeLocalImg(id, d);
        imgs[id] = d;
      }
      setImages(imgs);
      writeLocal(data.items, cats, stamp, chainArr);

      runCloud(async () => {
        await cloudUpsertMeta(userId, cats, chainArr, stamp);
        for (const it of data.items) await cloudUpsertItem(userId, it);
        for (const [id, d] of Object.entries(data.images || {})) await cloudUploadImage(userId, id, d);
      });
    } catch (err) {
      window.alert("Import failed: " + err.message);
    }
  };

  const catById = useMemo(() => Object.fromEntries(categories.map((c) => [c.id, c])), [categories]);
  const itemById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filterCat && i.categoryId !== filterCat) return false;
      if (!q) return true;
      return [i.name, i.brand, i.type, i.serial, i.notes].some((f) => (f || "").toLowerCase().includes(q));
    });
  }, [items, search, filterCat]);

  const visibleValue = useMemo(() => visible.reduce((s, i) => s + parsePrice(i.price), 0), [visible]);
  const totalValue = useMemo(() => items.reduce((s, i) => s + parsePrice(i.price), 0), [items]);

  const chainItems = chain.map((id) => itemById[id]).filter(Boolean);
  const notInChain = items.filter((i) => !chain.includes(i.id));

  const syncLabel = { local: "local", saving: "saving", synced: "synced", error: "sync error" }[sync];

  return (
    <div style={S.wrap}>
      <div style={S.bar}>
        <h2 style={S.heading}>
          Gear Vault
          <span style={S.jewel(sync)} title={userId ? `Cloud: ${syncLabel}` : "Local only — sign in via the SYNC jewel to back up gear"} />
          <span style={S.jewelLabel}>{userId ? syncLabel : "local"}</span>
        </h2>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button style={S.viewToggle(view === "inventory")} onClick={() => setView("inventory")}>Inventory</button>
          <button style={S.viewToggle(view === "chain")} onClick={() => setView("chain")}>Signal chain</button>
          <button style={S.btn(true)} onClick={() => setEditing("new")}>+ Add item</button>
          <button style={S.btn(false)} onClick={() => setShowCats(true)}>Categories</button>
          <button style={S.btn(false)} onClick={handleSpreadsheet} title="Download an Excel copy for insurance or selling">Spreadsheet</button>
          <button style={S.btn(false)} onClick={handleExport} title="Download a JSON backup of everything, photos included">Backup</button>
          <button style={S.btn(false)} onClick={() => importRef.current?.click()} title="Restore from a JSON backup">Restore</button>
          <input ref={importRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={handleImportFile} />
        </div>
      </div>

      {view === "inventory" && (
        <>
          <div style={S.chipRow}>
            <input style={S.search} placeholder="Search name, brand, type, serial, notes…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <span style={S.chip(filterCat === null, "#D4A73B")} onClick={() => setFilterCat(null)}>
              <span style={S.led("#D4A73B", filterCat === null)} /> All
            </span>
            {categories.map((c) => {
              const active = filterCat === c.id;
              return (
                <span key={c.id} style={S.chip(active, c.color)} onClick={() => setFilterCat(active ? null : c.id)}>
                  <span style={S.led(c.color, active)} /> {c.name}
                  <span style={{ color: "#6E6250", fontSize: 11 }}>{items.filter((i) => i.categoryId === c.id).length}</span>
                </span>
              );
            })}
          </div>

          <div style={S.statsLine}>
            {visible.length} item{visible.length !== 1 ? "s" : ""}
            {visibleValue > 0 && <> · <span style={{ color: "#D4A73B", fontWeight: 700 }}>{formatMoney(visibleValue)}</span></>}
            {(filterCat || search) && totalValue > 0 && totalValue !== visibleValue && (
              <span style={{ color: "#7A6E58" }}> (collection total {formatMoney(totalValue)})</span>
            )}
          </div>

          {visible.length === 0 ? (
            <div style={S.empty}>
              {items.length === 0
                ? <>Your inventory is empty.<br />Hit <strong style={{ color: "#D4A73B" }}>+ Add item</strong> to log your first piece of gear.</>
                : "Nothing matches that search or filter."}
            </div>
          ) : (
            <div style={S.grid}>
              {visible.map((item) => {
                const cat = catById[item.categoryId];
                const img = images[item.id];
                return (
                  <div key={item.id} style={S.card}>
                    {img
                      ? <img src={img} alt={item.name} style={S.cardImg} />
                      : <div style={S.cardImgEmpty}>{item.hasImage ? "…" : "♪"}</div>}
                    <div style={S.cardBody}>
                      <h3 style={S.cardName}>{item.name}</h3>
                      {(item.brand || item.year) && (
                        <div style={S.cardMeta}>{[item.brand, item.year].filter(Boolean).join(" · ")}</div>
                      )}
                      <div style={S.badge}>
                        <span style={S.led(cat?.color || "#555", true)} />
                        {cat ? cat.name : "Uncategorized"}{item.type ? ` / ${item.type}` : ""}
                      </div>
                      {item.price && <div style={{ ...S.cardMeta, color: "#D4A73B", fontWeight: 700 }}>{item.price}</div>}
                      {item.serial && <div style={S.serial}>S/N {item.serial}</div>}
                      {item.notes && <div style={{ ...S.cardMeta, fontSize: 11, lineHeight: 1.5, marginTop: 2 }}>{item.notes}</div>}
                      <div style={S.cardActions}>
                        <button style={S.smallBtn(false)} onClick={() => setEditing({ ...item, imgData: images[item.id] || null })}>Edit</button>
                        <button style={S.smallBtn(true)} onClick={() => handleDeleteItem(item)}>Remove</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "chain" && (
        <div style={S.chainWrap}>
          <div style={S.statsLine}>
            Signal order, input to output. Reorder with the arrows — it syncs like everything else.
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={S.endpoint}><span style={S.led("#E03A2F", true)} /> Guitar in</div>
            {chainItems.length === 0 && (
              <div style={{ ...S.empty, margin: "24px auto" }}>
                Nothing in the chain yet. Add gear below — pedals in the order the signal hits them.
              </div>
            )}
            {chainItems.map((item, idx) => {
              const cat = catById[item.categoryId];
              const img = images[item.id];
              return (
                <div key={item.id}>
                  <div style={S.chainRow}>
                    <span style={S.chainIndex}>{idx + 1}</span>
                    {img ? <img src={img} alt={item.name} style={S.chainThumb} /> : <div style={S.chainThumbEmpty}>♪</div>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#F0E8D2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <div style={{ ...S.badge, marginTop: 3 }}>
                        <span style={S.led(cat?.color || "#555", true)} />
                        {cat ? cat.name : "Uncategorized"}{item.type ? ` / ${item.type}` : ""}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                      <button style={{ ...S.chainBtn, opacity: idx === 0 ? 0.3 : 1 }} onClick={() => moveInChain(idx, -1)} disabled={idx === 0} title="Move earlier in chain">▲</button>
                      <button style={{ ...S.chainBtn, opacity: idx === chainItems.length - 1 ? 0.3 : 1 }} onClick={() => moveInChain(idx, 1)} disabled={idx === chainItems.length - 1} title="Move later in chain">▼</button>
                      <button style={{ ...S.chainBtn, color: "#D8776C", borderColor: "#6E332C" }} onClick={() => removeFromChain(item.id)} title="Remove from chain">×</button>
                    </div>
                  </div>
                  <div style={S.chainCable} />
                </div>
              );
            })}
            <div style={S.endpoint}><span style={S.led("#D4A017", true)} /> Amp out</div>
          </div>

          {notInChain.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
              <select style={{ ...S.input, flex: 1 }} value={chainPick} onChange={(e) => setChainPick(e.target.value)}>
                <option value="">Add gear to the chain…</option>
                {notInChain.map((i) => {
                  const cat = catById[i.categoryId];
                  return <option key={i.id} value={i.id}>{cat ? `[${cat.name}] ` : ""}{i.name}</option>;
                })}
              </select>
              <button style={S.btn(true)} onClick={() => addToChain(chainPick)} disabled={!chainPick}>Add</button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <ItemModal
          item={editing === "new" ? null : editing}
          categories={categories}
          onSave={handleSaveItem}
          onCancel={() => setEditing(null)}
        />
      )}
      {showCats && (
        <CategoryModal categories={categories} items={items} onSave={handleSaveCategories} onClose={() => setShowCats(false)} />
      )}
    </div>
  );
}
