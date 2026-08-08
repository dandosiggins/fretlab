import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";

/* ============================================================================
   SongChords — chord sheets for songs you're still working out by ear.

   Design premise: transcription is a process of narrowing down, not typing in.
   Every chord slot carries a confidence level and can hold rival candidates
   you can A/B by ear until one wins.

   Usage (controlled — recommended, so it rides your Supabase sync):
     <SongChords value={state.chordSheets} onChange={next => patch({ chordSheets: next })} />

   Usage (uncontrolled — falls back to localStorage):
     <SongChords />

   Optional: pass songs={[{ id, title, artist }]} from LessonLog to link a
   sheet to a song already in the pipeline.
   ========================================================================== */

/* ---------------------------------------------------------------- theory -- */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_ALIAS = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#",
  Cb: "B", Fb: "E", "E#": "F", "B#": "C",
};

const QUALITIES = {
  "": [0, 4, 7],
  maj: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  5: [0, 7],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  6: [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  mMaj7: [0, 3, 7, 11],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "7sus4": [0, 5, 7, 10],
  9: [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
  11: [0, 4, 7, 10, 14, 17],
  13: [0, 4, 7, 10, 21],
};

function normalizeRoot(raw) {
  if (!raw) return null;
  const r = raw.charAt(0).toUpperCase() + raw.slice(1);
  if (FLAT_ALIAS[r]) return FLAT_ALIAS[r];
  return SHARP.includes(r) ? r : null;
}

/** "F#m7/C#" -> { root, quality, bass, intervals } or null */
function parseChord(symbol) {
  if (!symbol || typeof symbol !== "string") return null;
  const [main, bassPart] = symbol.trim().split("/");
  const m = main.match(/^([A-Ga-g][#b]?)(.*)$/);
  if (!m) return null;
  const root = normalizeRoot(m[1]);
  if (!root) return null;
  let quality = (m[2] || "").trim();
  if (!(quality in QUALITIES)) {
    // tolerate common alternates
    const swaps = { "-": "m", "Δ": "maj7", "ø": "m7b5", "°": "dim", "+": "aug", "Maj7": "maj7" };
    quality = swaps[quality] ?? quality;
  }
  const intervals = QUALITIES[quality in QUALITIES ? quality : ""];
  return {
    root,
    quality: quality in QUALITIES ? quality : "",
    bass: bassPart ? normalizeRoot(bassPart) : null,
    intervals,
  };
}

function midiFor(root, interval, octave = 4) {
  return 12 * (octave + 1) + SHARP.indexOf(root) + interval;
}
const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MAJOR_QUALS = ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10];
const MINOR_QUALS = ["m7", "m7b5", "maj7", "m7", "m7", "maj7", "7"];
const MAJOR_NUM = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUM = ["i", "ii°", "III", "iv", "v", "VI", "VII"];

const FLATNAME = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Keys conventionally written with flats, so the palette doesn't read A#/D#/G#. */
const FLAT_MAJOR = new Set(["F", "A#", "D#", "G#", "C#", "F#"]);
const FLAT_MINOR = new Set(["D", "G", "C", "F", "A#", "D#"]);
const usesFlats = (tonic, mode) =>
  (mode === "minor" ? FLAT_MINOR : FLAT_MAJOR).has(normalizeRoot(tonic));

function transpose(root, semitones, preferFlat = false) {
  const i = SHARP.indexOf(normalizeRoot(root));
  const pc = (i + ((semitones % 12) + 12)) % 12;
  return preferFlat ? FLATNAME[pc] : SHARP[pc];
}

/** Is the diatonic chord at this degree a minor-third chord? */
const isMinorQuality = (q) => q.startsWith("m") && !q.startsWith("maj");

/** Chords worth auditioning in a key: diatonic, borrowed, secondary dominants. */
function paletteFor(tonic, mode) {
  const root = normalizeRoot(tonic) || "C";
  const steps = mode === "minor" ? MINOR_STEPS : MAJOR_STEPS;
  const quals = mode === "minor" ? MINOR_QUALS : MAJOR_QUALS;
  const nums = mode === "minor" ? MINOR_NUM : MAJOR_NUM;
  const flat = usesFlats(root, mode);
  const t = (semis, preferFlat = flat) => transpose(root, semis, preferFlat);

  const diatonic = steps.map((s, i) => ({
    symbol: t(s) + quals[i],
    numeral: nums[i],
    group: "diatonic",
  }));

  const borrowed =
    mode === "minor"
      ? [
          { symbol: t(7) + "7", numeral: "V7", group: "borrowed" },
          { symbol: t(5), numeral: "IV", group: "borrowed" },
          { symbol: t(9) + "m7b5", numeral: "vi°", group: "borrowed" },
        ]
      : [
          // flat-degree borrowings are always spelled with flats
          { symbol: t(5) + "m", numeral: "iv", group: "borrowed" },
          { symbol: t(10, true), numeral: "♭VII", group: "borrowed" },
          { symbol: t(8, true), numeral: "♭VI", group: "borrowed" },
          { symbol: t(3, true), numeral: "♭III", group: "borrowed" },
        ];

  const secondary =
    mode === "minor"
      ? [
          { symbol: t(2) + "7", numeral: "V/v", group: "secondary" },
          { symbol: t(10) + "7", numeral: "V/III", group: "secondary" },
        ]
      : [
          { symbol: t(9) + "7", numeral: "V/ii", group: "secondary" },
          { symbol: t(11) + "7", numeral: "V/iii", group: "secondary" },
          { symbol: t(0) + "7", numeral: "V/IV", group: "secondary" },
          { symbol: t(2) + "7", numeral: "V/V", group: "secondary" },
          { symbol: t(4) + "7", numeral: "V/vi", group: "secondary" },
        ];

  // de-dupe by symbol, first occurrence wins
  const seen = new Set();
  return [...diatonic, ...borrowed, ...secondary].filter((c) => {
    if (seen.has(c.symbol)) return false;
    seen.add(c.symbol);
    return true;
  });
}

/** Roman numeral for an arbitrary chord relative to a key — for the "does this fit?" readout. */
function analyze(symbol, tonic, mode) {
  const p = parseChord(symbol);
  if (!p) return null;
  const t = normalizeRoot(tonic) || "C";
  const semis = (SHARP.indexOf(p.root) - SHARP.indexOf(t) + 12) % 12;
  const steps = mode === "minor" ? MINOR_STEPS : MAJOR_STEPS;
  const nums = mode === "minor" ? MINOR_NUM : MAJOR_NUM;
  const quals = mode === "minor" ? MINOR_QUALS : MAJOR_QUALS;
  const idx = steps.indexOf(semis);
  if (idx === -1) {
    const CHROMATIC = { 1: "♭II", 3: "♭III", 6: "♯IV", 8: "♭VI", 10: "♭VII" };
    return { numeral: CHROMATIC[semis] || "?", fit: "outside" };
  }
  const minorish = p.intervals.includes(3) && !p.intervals.includes(4);
  const expectedMinor = isMinorQuality(quals[idx]);
  return {
    numeral: nums[idx],
    fit: minorish === expectedMinor ? "diatonic" : "altered",
  };
}

/* --------------------------------------------------------------- storage -- */

const safeStorage = {
  read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key, val) {
    try {
      window.localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* preview sandboxes block storage — in-memory is fine */
    }
  },
};

const uid = () => Math.random().toString(36).slice(2, 10);

const CONFIDENCE = {
  sure: { label: "Sure", mark: "", tint: "#e8b23a" },
  likely: { label: "Probably", mark: "~", tint: "#b98a3f" },
  guess: { label: "Guessing", mark: "?", tint: "#8a6f4a" },
};
const CONF_ORDER = ["sure", "likely", "guess"];

function newChord(symbol = "") {
  return { id: uid(), symbol, bass: "", beats: 4, confidence: "guess", alts: [], note: "" };
}
function newSection(name = "Verse") {
  return { id: uid(), name, repeat: 1, chords: [newChord()] };
}
function newSheet(title = "Untitled", opts = {}) {
  return {
    id: uid(),
    title,
    artist: opts.artist || "",
    tonic: opts.tonic || "C",
    mode: opts.mode || "major",
    tempo: opts.tempo || 90,
    songId: opts.songId || null,
    notes: "",
    sections: opts.sections || [newSection("Verse")],
    updatedAt: Date.now(),
  };
}

/* --------------------------------------------------------------- audio ---- */

function useAudio() {
  const ctxRef = useRef(null);
  const ensure = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const voice = useCallback((ctx, hz, at, dur, gain) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(2600, at);
    filt.frequency.exponentialRampToValueAtTime(900, at + dur);
    osc.type = "triangle";
    osc.frequency.setValueAtTime(hz, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(filt).connect(g).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }, []);

  /** Strum a chord symbol at a scheduled time. */
  const strum = useCallback(
    (symbol, bass, when = 0, dur = 1.4) => {
      const ctx = ensure();
      if (!ctx) return;
      const p = parseChord(symbol);
      if (!p) return;
      const at = when || ctx.currentTime;
      const notes = p.intervals.map((iv) => midiFor(p.root, iv, 4));
      const bassNote = bass || p.bass;
      if (bassNote) voice(ctx, freq(midiFor(bassNote, 0, 2)), at, dur * 1.1, 0.22);
      else voice(ctx, freq(midiFor(p.root, 0, 2)), at, dur * 1.1, 0.2);
      notes.forEach((n, i) => voice(ctx, freq(n), at + i * 0.022, dur, 0.13));
    },
    [ensure, voice]
  );

  const click = useCallback(
    (when, accent) => {
      const ctx = ensure();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(accent ? 1500 : 950, when);
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(accent ? 0.09 : 0.05, when + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
      osc.connect(g).connect(ctx.destination);
      osc.start(when);
      osc.stop(when + 0.08);
    },
    [ensure]
  );

  const now = useCallback(() => {
    const ctx = ensure();
    return ctx ? ctx.currentTime : 0;
  }, [ensure]);

  return { strum, click, now, ensure };
}

/* ----------------------------------------------------------------- ui ----- */

const C = {
  tolex: "#12100e",
  panel: "#1b1815",
  panelHi: "#241f1a",
  edge: "#3a322a",
  cream: "#efe3c8",
  creamDim: "#a99b81",
  amber: "#e8b23a",
  amberDeep: "#b8791c",
  red: "#c25b3a",
};

const mono = "'Roboto Mono', 'SF Mono', Menlo, Consolas, monospace";
const display = "'Oswald', 'Bebas Neue', 'Helvetica Neue', sans-serif";

const STYLE_ID = "songchords-styles";
const CSS = `
.sc-root { color: ${C.cream}; font-family: ${mono}; }
.sc-root *, .sc-root *::before, .sc-root *::after { box-sizing: border-box; }
.sc-root button { font-family: inherit; cursor: pointer; }
.sc-root button:focus-visible, .sc-root input:focus-visible, .sc-root select:focus-visible,
.sc-root textarea:focus-visible {
  outline: 2px solid ${C.amber}; outline-offset: 2px;
}
.sc-chip { transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
.sc-chip:hover { transform: translateY(-1px); border-color: ${C.amber}; }
@keyframes sc-breathe {
  0%,100% { box-shadow: 0 0 0 0 rgba(232,178,58,0); }
  50%     { box-shadow: 0 0 14px 1px rgba(232,178,58,.28); }
}
.sc-unsure { animation: sc-breathe 2.6s ease-in-out infinite; }
.sc-playing { box-shadow: 0 0 0 2px ${C.amber}, 0 0 22px 2px rgba(232,178,58,.45) !important; }
@media (prefers-reduced-motion: reduce) {
  .sc-root *, .sc-unsure { animation: none !important; transition: none !important; }
}
.sc-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
.sc-scroll::-webkit-scrollbar-thumb { background: ${C.edge}; border-radius: 4px; }
`;

function useStyles() {
  useEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = CSS;
    document.head.appendChild(el);
  }, []);
}

const panel = {
  background: `linear-gradient(180deg, ${C.panelHi}, ${C.panel})`,
  border: `1px solid ${C.edge}`,
  borderRadius: 6,
};

const input = {
  background: "#0d0b09",
  border: `1px solid ${C.edge}`,
  color: C.cream,
  borderRadius: 4,
  padding: "6px 8px",
  font: `13px ${mono}`,
};

function Btn({ children, onClick, tone = "quiet", title, style, disabled }) {
  const tones = {
    quiet: { background: "transparent", border: `1px solid ${C.edge}`, color: C.creamDim },
    lit: { background: `linear-gradient(180deg,${C.amber},${C.amberDeep})`, border: `1px solid ${C.amberDeep}`, color: "#1a1206" },
    danger: { background: "transparent", border: `1px solid #5a3128`, color: C.red },
  };
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...tones[tone],
        borderRadius: 4,
        padding: "6px 10px",
        fontSize: 12,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------ chord card -- */

function ChordCard({ chord, tonic, mode, isPlaying, onChange, onRemove, onAudition, onInsertAfter }) {
  const [open, setOpen] = useState(false);
  const conf = CONFIDENCE[chord.confidence] || CONFIDENCE.guess;
  const parsed = parseChord(chord.symbol);
  const info = chord.symbol ? analyze(chord.symbol, tonic, mode) : null;
  const unsure = chord.confidence !== "sure";

  const cycleConfidence = () => {
    const i = CONF_ORDER.indexOf(chord.confidence);
    onChange({ ...chord, confidence: CONF_ORDER[(i + 1) % CONF_ORDER.length] });
  };

  const promoteAlt = (alt) => {
    const rest = chord.alts.filter((a) => a !== alt);
    const keep = chord.symbol ? [...rest, chord.symbol] : rest;
    onChange({ ...chord, symbol: alt, alts: keep });
  };

  return (
    <div style={{ minWidth: 132 }}>
      <div
        className={`sc-chip ${unsure ? "sc-unsure" : ""} ${isPlaying ? "sc-playing" : ""}`}
        style={{
          ...panel,
          borderStyle: unsure ? "dashed" : "solid",
          borderColor: chord.symbol ? conf.tint : C.edge,
          padding: "10px 10px 8px",
          position: "relative",
        }}
      >
        {chord.symbol && (
          <button
            onClick={cycleConfidence}
            title={`${conf.label} — click to change`}
            style={{
              position: "absolute", top: 6, right: 6, width: 18, height: 18,
              borderRadius: "50%", border: `1px solid ${conf.tint}`,
              background: chord.confidence === "sure" ? conf.tint : "transparent",
              color: chord.confidence === "sure" ? "#1a1206" : conf.tint,
              fontSize: 11, lineHeight: 1, padding: 0, fontWeight: 700,
            }}
          >
            {chord.confidence === "sure" ? "✓" : conf.mark}
          </button>
        )}

        <input
          value={chord.symbol}
          placeholder="?"
          onChange={(e) => onChange({ ...chord, symbol: e.target.value })}
          onFocus={(e) => e.target.select()}
          style={{
            ...input,
            width: "100%",
            border: "none",
            background: "transparent",
            padding: 0,
            font: `600 26px/1.1 ${display}`,
            letterSpacing: ".02em",
            color: chord.symbol ? C.cream : C.edge,
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, minHeight: 16 }}>
          {chord.bass && <span style={{ fontSize: 11, color: C.creamDim }}>/{chord.bass}</span>}
          {info && (
            <span
              style={{
                fontSize: 10,
                letterSpacing: ".08em",
                color: info.fit === "diatonic" ? C.amber : info.fit === "altered" ? "#c9924a" : C.red,
              }}
            >
              {info.numeral}
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: C.creamDim }}>
            {chord.beats}♩
          </span>
        </div>

        {chord.alts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
            {chord.alts.map((a) => (
              <span key={a} style={{ display: "flex", border: `1px solid ${C.edge}`, borderRadius: 3 }}>
                <button
                  onClick={() => onAudition(a, chord.bass)}
                  title="Hear this candidate"
                  style={{ background: "transparent", border: "none", color: C.creamDim, fontSize: 11, padding: "2px 5px" }}
                >
                  {a}
                </button>
                <button
                  onClick={() => promoteAlt(a)}
                  title="Make this the chord"
                  style={{ background: "transparent", border: "none", borderLeft: `1px solid ${C.edge}`, color: C.amber, fontSize: 11, padding: "2px 5px" }}
                >
                  ↑
                </button>
              </span>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
          <button
            onClick={() => onAudition(chord.symbol, chord.bass)}
            disabled={!parsed}
            title="Hear it"
            style={{ ...input, padding: "2px 6px", fontSize: 11, color: parsed ? C.amber : C.edge, flex: 1 }}
          >
            ▶
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            title="Details"
            style={{ ...input, padding: "2px 6px", fontSize: 11, color: C.creamDim, flex: 1 }}
          >
            {open ? "▴" : "▾"}
          </button>
        </div>
      </div>

      {open && (
        <div style={{ ...panel, padding: 8, marginTop: 4, display: "grid", gap: 6 }}>
          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".08em" }}>
            BASS NOTE
            <input
              value={chord.bass}
              placeholder="e.g. B"
              onChange={(e) => onChange({ ...chord, bass: e.target.value })}
              style={{ ...input, width: "100%", marginTop: 3 }}
            />
          </label>
          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".08em" }}>
            BEATS
            <input
              type="number"
              min={1}
              max={16}
              value={chord.beats}
              onChange={(e) => onChange({ ...chord, beats: Math.max(1, Number(e.target.value) || 1) })}
              style={{ ...input, width: "100%", marginTop: 3 }}
            />
          </label>
          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".08em" }}>
            CANDIDATES (comma separated)
            <input
              value={chord.alts.join(", ")}
              placeholder="Am7, C/A"
              onChange={(e) =>
                onChange({ ...chord, alts: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
              }
              style={{ ...input, width: "100%", marginTop: 3 }}
            />
          </label>
          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".08em" }}>
            NOTE TO SELF
            <input
              value={chord.note}
              placeholder="bass walks down here"
              onChange={(e) => onChange({ ...chord, note: e.target.value })}
              style={{ ...input, width: "100%", marginTop: 3 }}
            />
          </label>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={onInsertAfter} style={{ flex: 1 }}>+ After</Btn>
            <Btn tone="danger" onClick={onRemove} style={{ flex: 1 }}>Delete</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- main ------ */

export default function SongChords({
  value,
  onChange,
  songs = [],
  storageKey = "fretlab-chord-sheets",
}) {
  useStyles();
  const audio = useAudio();

  const controlled = Array.isArray(value) && typeof onChange === "function";
  const [local, setLocal] = useState(() => safeStorage.read(storageKey, []));
  const sheets = controlled ? value : local;

  const [activeId, setActiveId] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState(null); // { sectionId, chordId }
  const [metronome, setMetronome] = useState(true);
  const [loopSection, setLoopSection] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const timersRef = useRef([]);

  const commit = useCallback(
    (next) => {
      if (controlled) onChange(next);
      else {
        setLocal(next);
        safeStorage.write(storageKey, next);
      }
    },
    [controlled, onChange, storageKey]
  );

  const sheet = useMemo(
    () => sheets.find((s) => s.id === activeId) || sheets[0] || null,
    [sheets, activeId]
  );

  useEffect(() => {
    if (!activeId && sheets.length) setActiveId(sheets[0].id);
  }, [sheets, activeId]);

  const patchSheet = useCallback(
    (patch) => {
      if (!sheet) return;
      commit(sheets.map((s) => (s.id === sheet.id ? { ...s, ...patch, updatedAt: Date.now() } : s)));
    },
    [sheet, sheets, commit]
  );

  const palette = useMemo(
    () => (sheet ? paletteFor(sheet.tonic, sheet.mode) : []),
    [sheet]
  );

  /* ---- playback ---- */

  const stop = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setPlaying(false);
    setCursor(null);
  }, []);

  useEffect(() => () => timersRef.current.forEach(clearTimeout), []);

  const play = useCallback(
    (sectionIdOrNull) => {
      if (!sheet) return;
      audio.ensure();
      stop();
      const secs = sectionIdOrNull
        ? sheet.sections.filter((s) => s.id === sectionIdOrNull)
        : sheet.sections;
      const spb = 60 / (sheet.tempo || 90);
      const start = audio.now() + 0.15;
      let t = 0;
      const timers = [];

      secs.forEach((section) => {
        for (let rep = 0; rep < Math.max(1, section.repeat); rep++) {
          section.chords.forEach((ch) => {
            const dur = ch.beats * spb;
            if (ch.symbol) audio.strum(ch.symbol, ch.bass, start + t, Math.min(dur * 0.95, 3));
            if (metronome) {
              for (let b = 0; b < ch.beats; b++) audio.click(start + t + b * spb, b === 0);
            }
            const ms = (start + t - audio.now()) * 1000;
            timers.push(
              setTimeout(() => setCursor({ sectionId: section.id, chordId: ch.id }), Math.max(0, ms))
            );
            t += dur;
          });
        }
      });

      timers.push(setTimeout(() => { setPlaying(false); setCursor(null); }, (start + t - audio.now()) * 1000));
      timersRef.current = timers;
      setPlaying(true);
    },
    [sheet, audio, metronome, stop]
  );

  /* ---- sheet ops ---- */

  const addSheet = (preset) => {
    const s = preset || newSheet("New song");
    commit([...sheets, s]);
    setActiveId(s.id);
  };

  const deleteSheet = () => {
    if (!sheet) return;
    if (!window.confirm(`Delete the chord sheet for "${sheet.title}"?`)) return;
    const next = sheets.filter((s) => s.id !== sheet.id);
    commit(next);
    setActiveId(next[0]?.id || null);
  };

  const patchSection = (sectionId, patch) =>
    patchSheet({
      sections: sheet.sections.map((s) => (s.id === sectionId ? { ...s, ...patch } : s)),
    });

  const patchChord = (sectionId, chordId, next) =>
    patchSection(sectionId, {
      chords: sheet.sections.find((s) => s.id === sectionId).chords.map((c) => (c.id === chordId ? next : c)),
    });

  const addChord = (sectionId, symbol = "", afterId = null) => {
    const section = sheet.sections.find((s) => s.id === sectionId);
    const ch = newChord(symbol);
    if (symbol) ch.confidence = "likely";
    const list = [...section.chords];
    const at = afterId ? list.findIndex((c) => c.id === afterId) + 1 : list.length;
    list.splice(at, 0, ch);
    patchSection(sectionId, { chords: list });
    return ch.id;
  };

  const removeChord = (sectionId, chordId) => {
    const section = sheet.sections.find((s) => s.id === sectionId);
    patchSection(sectionId, { chords: section.chords.filter((c) => c.id !== chordId) });
  };

  const moveSection = (sectionId, dir) => {
    const i = sheet.sections.findIndex((s) => s.id === sectionId);
    const j = i + dir;
    if (j < 0 || j >= sheet.sections.length) return;
    const list = [...sheet.sections];
    [list[i], list[j]] = [list[j], list[i]];
    patchSheet({ sections: list });
  };

  /* ---- export ---- */

  const asText = useMemo(() => {
    if (!sheet) return "";
    const head = [
      sheet.title + (sheet.artist ? ` — ${sheet.artist}` : ""),
      `Key: ${sheet.tonic} ${sheet.mode}   Tempo: ${sheet.tempo}`,
      "",
    ];
    const body = sheet.sections.flatMap((s) => {
      const line = s.chords
        .map((c) => {
          const sym = (c.symbol || "?") + (c.bass ? `/${c.bass}` : "");
          const mark = c.confidence === "sure" ? "" : CONFIDENCE[c.confidence].mark;
          return `| ${sym}${mark} `.padEnd(Math.max(12, c.beats * 3));
        })
        .join("");
      const alts = s.chords
        .filter((c) => c.alts.length)
        .map((c) => `    ${c.symbol || "?"} → also try: ${c.alts.join(", ")}`);
      return [
        `[${s.name}]${s.repeat > 1 ? ` ×${s.repeat}` : ""}`,
        line + "|",
        ...alts,
        "",
      ];
    });
    const legend = ["", "~ = probably   ? = still guessing"];
    return [...head, ...body, ...legend].join("\n");
  }, [sheet]);

  const asStrudel = useMemo(() => {
    if (!sheet) return "";
    const seq = sheet.sections
      .flatMap((s) =>
        Array.from({ length: Math.max(1, s.repeat) }).flatMap(() =>
          s.chords.filter((c) => c.symbol).map((c) => `${c.symbol}@${c.beats}`)
        )
      )
      .join(" ");
    return `// ${sheet.title}\nsetcpm(${sheet.tempo}/4)\nchord("<${seq}>")\n  .voicing()\n  .s("gm_electric_guitar_clean")\n  .room(.3)`;
  }, [sheet]);

  const copy = (text) => {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked */
    }
  };

  /* ---- empty state ---- */

  if (!sheet) {
    return (
      <div className="sc-root" style={{ ...panel, padding: 28, textAlign: "center", maxWidth: 560, margin: "0 auto" }}>
        <div style={{ font: `600 22px ${display}`, letterSpacing: ".08em", color: C.amber }}>
          NO CHORD SHEETS YET
        </div>
        <p style={{ color: C.creamDim, fontSize: 13, lineHeight: 1.6, margin: "10px 0 20px" }}>
          Start a sheet for whatever you're pulling apart by ear. Mark chords as sure,
          probably, or still guessing — and park rival candidates next to each other
          until one of them wins.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <Btn tone="lit" onClick={() => addSheet()}>Start a sheet</Btn>
          <Btn
            onClick={() =>
              addSheet(
                newSheet("Something", {
                  artist: "The Beatles",
                  tonic: "C",
                  mode: "major",
                  tempo: 66,
                  sections: [
                    newSection("Intro"),
                    newSection("Verse"),
                    newSection("Bridge"),
                    newSection("Solo"),
                    newSection("Outro"),
                  ],
                })
              )
            }
          >
            Start "Something"
          </Btn>
        </div>
      </div>
    );
  }

  /* ---- main ---- */

  return (
    <div className="sc-root" style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* faceplate header */}
      <div
        style={{
          ...panel,
          padding: "14px 16px",
          marginBottom: 12,
          background: `linear-gradient(180deg,#2a241d,#171410)`,
          boxShadow: "inset 0 1px 0 rgba(255,220,160,.08)",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 220px", minWidth: 180 }}>
            <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em" }}>SONG</div>
            <input
              value={sheet.title}
              onChange={(e) => patchSheet({ title: e.target.value })}
              style={{ ...input, width: "100%", font: `600 22px ${display}`, letterSpacing: ".04em", background: "transparent", border: "none", padding: "2px 0" }}
            />
            <input
              value={sheet.artist}
              placeholder="artist"
              onChange={(e) => patchSheet({ artist: e.target.value })}
              style={{ ...input, width: "100%", background: "transparent", border: "none", padding: 0, fontSize: 12, color: C.creamDim }}
            />
          </div>

          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em" }}>
            KEY
            <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
              <select value={sheet.tonic} onChange={(e) => patchSheet({ tonic: e.target.value })} style={input}>
                {SHARP.map((n, i) => (
                  <option key={n} value={n}>
                    {n === FLATNAME[i] ? n : `${n}/${FLATNAME[i]}`}
                  </option>
                ))}
              </select>
              <select value={sheet.mode} onChange={(e) => patchSheet({ mode: e.target.value })} style={input}>
                <option value="major">major</option>
                <option value="minor">minor</option>
              </select>
            </div>
          </label>

          <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em" }}>
            TEMPO
            <input
              type="number"
              min={30}
              max={240}
              value={sheet.tempo}
              onChange={(e) => patchSheet({ tempo: Number(e.target.value) || 90 })}
              style={{ ...input, width: 72, display: "block", marginTop: 3 }}
            />
          </label>

          {songs.length > 0 && (
            <label style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em" }}>
              LESSON SONG
              <select
                value={sheet.songId || ""}
                onChange={(e) => patchSheet({ songId: e.target.value || null })}
                style={{ ...input, display: "block", marginTop: 3, maxWidth: 180 }}
              >
                <option value="">— not linked —</option>
                {songs.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Btn tone={playing ? "danger" : "lit"} onClick={() => (playing ? stop() : play(loopSection))}>
            {playing ? "■ Stop" : loopSection ? "▶ Play section" : "▶ Play sheet"}
          </Btn>
          <Btn tone={metronome ? "lit" : "quiet"} onClick={() => setMetronome((v) => !v)}>Click</Btn>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <Btn onClick={() => setShowExport((v) => !v)}>Export</Btn>
            <Btn onClick={() => addSheet()}>+ Sheet</Btn>
            <Btn tone="danger" onClick={deleteSheet}>Delete</Btn>
          </div>
        </div>

        {sheets.length > 1 && (
          <div className="sc-scroll" style={{ display: "flex", gap: 6, marginTop: 10, overflowX: "auto", paddingBottom: 4 }}>
            {sheets.map((s) => (
              <button
                key={s.id}
                onClick={() => { stop(); setActiveId(s.id); setLoopSection(null); }}
                style={{
                  ...input,
                  whiteSpace: "nowrap",
                  fontSize: 11,
                  borderColor: s.id === sheet.id ? C.amber : C.edge,
                  color: s.id === sheet.id ? C.amber : C.creamDim,
                }}
              >
                {s.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* candidate palette */}
      <div style={{ ...panel, padding: "10px 12px", marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em", marginBottom: 8 }}>
          WHAT FITS IN {sheet.tonic.toUpperCase()} {sheet.mode.toUpperCase()} — click to hear, shift-click to append
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {palette.map((p) => (
            <button
              key={p.symbol}
              className="sc-chip"
              onClick={(e) => {
                audio.strum(p.symbol, null);
                if (e.shiftKey && sheet.sections[0]) {
                  const target = loopSection || sheet.sections[0].id;
                  addChord(target, p.symbol);
                }
              }}
              title={`${p.numeral} — ${p.group}`}
              style={{
                ...input,
                padding: "4px 8px",
                fontSize: 12,
                borderColor:
                  p.group === "diatonic" ? C.amberDeep : p.group === "borrowed" ? "#4a3b2a" : C.edge,
                color: p.group === "diatonic" ? C.cream : C.creamDim,
              }}
            >
              {p.symbol}
              <span style={{ fontSize: 9, color: C.creamDim, marginLeft: 5 }}>{p.numeral}</span>
            </button>
          ))}
        </div>
      </div>

      {/* sections */}
      {sheet.sections.map((section) => (
        <div key={section.id} style={{ ...panel, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
            <input
              value={section.name}
              onChange={(e) => patchSection(section.id, { name: e.target.value })}
              style={{ ...input, background: "transparent", border: "none", padding: 0, font: `600 15px ${display}`, letterSpacing: ".12em", color: C.amber, width: 150 }}
            />
            <label style={{ fontSize: 10, color: C.creamDim }}>
              ×
              <input
                type="number"
                min={1}
                max={16}
                value={section.repeat}
                onChange={(e) => patchSection(section.id, { repeat: Math.max(1, Number(e.target.value) || 1) })}
                style={{ ...input, width: 46, marginLeft: 4 }}
              />
            </label>
            <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
              <Btn onClick={() => { setLoopSection(section.id); play(section.id); }} title="Play just this section">▶</Btn>
              <Btn onClick={() => moveSection(section.id, -1)}>↑</Btn>
              <Btn onClick={() => moveSection(section.id, 1)}>↓</Btn>
              <Btn
                tone="danger"
                onClick={() => patchSheet({ sections: sheet.sections.filter((s) => s.id !== section.id) })}
              >
                ✕
              </Btn>
            </div>
          </div>

          <div className="sc-scroll" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
            {section.chords.map((ch) => (
              <ChordCard
                key={ch.id}
                chord={ch}
                tonic={sheet.tonic}
                mode={sheet.mode}
                isPlaying={cursor?.chordId === ch.id}
                onChange={(next) => patchChord(section.id, ch.id, next)}
                onRemove={() => removeChord(section.id, ch.id)}
                onInsertAfter={() => addChord(section.id, "", ch.id)}
                onAudition={(sym, bass) => audio.strum(sym, bass)}
              />
            ))}
            <button
              onClick={() => addChord(section.id)}
              style={{
                ...input,
                minWidth: 56,
                height: 92,
                fontSize: 22,
                color: C.edge,
                borderStyle: "dashed",
              }}
              title="Add a chord slot"
            >
              +
            </button>
          </div>
        </div>
      ))}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {["Intro", "Verse", "Pre-chorus", "Chorus", "Bridge", "Solo", "Outro"].map((n) => (
          <Btn key={n} onClick={() => patchSheet({ sections: [...sheet.sections, newSection(n)] })}>
            + {n}
          </Btn>
        ))}
      </div>

      <div style={{ ...panel, padding: 12, marginTop: 12 }}>
        <div style={{ fontSize: 10, color: C.creamDim, letterSpacing: ".14em", marginBottom: 6 }}>
          NOTES
        </div>
        <textarea
          value={sheet.notes}
          placeholder="Capo? Tuning? Which bit is still bugging you?"
          onChange={(e) => patchSheet({ notes: e.target.value })}
          style={{ ...input, width: "100%", minHeight: 64, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {showExport && (
        <div style={{ ...panel, padding: 12, marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <Btn onClick={() => copy(asText)}>Copy chart</Btn>
            <Btn onClick={() => copy(asStrudel)}>Copy Strudel</Btn>
            <Btn onClick={() => setShowExport(false)} style={{ marginLeft: "auto" }}>Close</Btn>
          </div>
          <pre
            className="sc-scroll"
            style={{ ...input, whiteSpace: "pre", overflowX: "auto", fontSize: 12, lineHeight: 1.6, maxHeight: 300 }}
          >
{asText}
{"\n"}
{asStrudel}
          </pre>
        </div>
      )}
    </div>
  );
}
