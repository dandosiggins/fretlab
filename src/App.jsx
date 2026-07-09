import { useState, useRef, useMemo, useEffect } from "react";
import { supabase } from "./supabase.js";

/* ============================================================
   FRETLAB — Guitar Theory Workstation
   Vintage tube-amp aesthetic. Interactive fretboard with audio.
   ============================================================ */

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLATS = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
const INTERVALS = ["R", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"];

const disp = (note, useFlats) => (useFlats && FLATS[note] ? FLATS[note] : note);

const TUNINGS = {
  "Standard (EADGBE)": [40, 45, 50, 55, 59, 64],
  "Drop D": [38, 45, 50, 55, 59, 64],
  "D Standard": [38, 43, 48, 53, 57, 62],
  "Drop C": [36, 43, 48, 53, 57, 62],
  "DADGAD": [38, 45, 50, 55, 57, 62],
  "Open G": [38, 43, 50, 55, 59, 62],
};

const SCALES = {
  "— Modes of the Major Scale —": null,
  "Major (Ionian)": [0, 2, 4, 5, 7, 9, 11],
  "Dorian": [0, 2, 3, 5, 7, 9, 10],
  "Phrygian": [0, 1, 3, 5, 7, 8, 10],
  "Lydian": [0, 2, 4, 6, 7, 9, 11],
  "Mixolydian": [0, 2, 4, 5, 7, 9, 10],
  "Natural Minor (Aeolian)": [0, 2, 3, 5, 7, 8, 10],
  "Locrian": [0, 1, 3, 5, 6, 8, 10],
  "— Pentatonic & Blues —": null,
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Blues": [0, 3, 5, 6, 7, 10],
  "— Minor Variants —": null,
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Phrygian Dominant": [0, 1, 4, 5, 7, 8, 10],
  "— Exotic —": null,
  "Hungarian Minor": [0, 2, 3, 6, 7, 8, 11],
  "Whole Tone": [0, 2, 4, 6, 8, 10],
  "Diminished (W-H)": [0, 2, 3, 5, 6, 8, 9, 11],
};

const SCALE_NOTES_TIPS = {
  "Major (Ionian)": "The home base. Every mode below is this scale started from a different degree.",
  "Dorian": "Minor with a bright natural 6. Santana, funk, and 'So What'. Try it over a im7–IV7 vamp.",
  "Phrygian": "The b2 gives it that Spanish / menacing flavor. A metal staple riffed off the low root.",
  "Lydian": "Major with a raised 4 — floating, cinematic. Vai and Satriani territory.",
  "Mixolydian": "Major with a b7. The sound of dominant chords, blues-rock, and AC/DC riffs.",
  "Natural Minor (Aeolian)": "The relative minor. Shares every note with the major scale 3 semitones up.",
  "Locrian": "b2 and b5 — unstable by design. Lives over m7b5 chords.",
  "Minor Pentatonic": "Five notes, zero wrong ones. Box 1 at the root fret is the universal rock shape.",
  "Major Pentatonic": "Same shapes as minor pentatonic, 3 frets down. Sweet, country-tinged.",
  "Blues": "Minor pentatonic plus the b5 'blue note' — a passing tone, not a resting place.",
  "Harmonic Minor": "Natural minor with a raised 7. The b6→7 gap is the neoclassical sound (Yngwie).",
  "Melodic Minor": "Minor with a natural 6 and 7. Jazz's favorite minor; smooth ascent to the root.",
  "Phrygian Dominant": "5th mode of harmonic minor. Phrygian with a major 3rd — flamenco meets metal.",
  "Hungarian Minor": "Harmonic minor with a #4. Two augmented-second leaps. Deeply gothic.",
  "Whole Tone": "All whole steps. No resolution anywhere — dream sequences and Debussy.",
  "Diminished (W-H)": "Symmetric 8-note scale. Repeats every 3 frets; great over dim7 chords.",
};

/* -------- Mode lens -------- */
const MODE_ORDER = [
  "Major (Ionian)", "Dorian", "Phrygian", "Lydian",
  "Mixolydian", "Natural Minor (Aeolian)", "Locrian",
];
const MODE_SHORT = ["Ionian", "Dorian", "Phrygian", "Lydian", "Mixolydian", "Aeolian", "Locrian"];
const MAJOR_IVS = [0, 2, 4, 5, 7, 9, 11];
const BRIGHTNESS = [3, 0, 4, 1, 5, 2, 6]; // Lydian → Locrian, brightest to darkest
const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];
const MODE_CHAR = {
  0: { iv: 11, why: "the leading tone — the pull toward home" },
  1: { iv: 9, why: "the natural 6 — light inside a minor sound" },
  2: { iv: 1, why: "the ♭2 — instant menace, one fret above the root" },
  3: { iv: 6, why: "the ♯4 — the float" },
  4: { iv: 10, why: "the ♭7 — major, but bluesy and unresolved" },
  5: { iv: 8, why: "the ♭6 — the classic minor darkness" },
  6: { iv: 6, why: "the ♭5 — the instability at its core" },
};

const CHORDS = {
  "Power (5)": [0, 7],
  "Major": [0, 4, 7],
  "Minor": [0, 3, 7],
  "Diminished": [0, 3, 6],
  "Augmented": [0, 4, 8],
  "sus2": [0, 2, 7],
  "sus4": [0, 5, 7],
  "Major 7": [0, 4, 7, 11],
  "Dominant 7": [0, 4, 7, 10],
  "Minor 7": [0, 3, 7, 10],
  "m7b5 (half-dim)": [0, 3, 6, 10],
  "Diminished 7": [0, 3, 6, 9],
  "minor-Major 7": [0, 3, 7, 11],
  "6": [0, 4, 7, 9],
  "m6": [0, 3, 7, 9],
  "add9": [0, 4, 7, 14],
  "Major 9": [0, 4, 7, 11, 14],
  "Minor 9": [0, 3, 7, 10, 14],
  "7#9 (Hendrix)": [0, 4, 7, 10, 15],
};

const STEP_NAMES = { 1: "H", 2: "W", 3: "W+H" };
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

/* CAGED position windows: fret offsets relative to the root's fret
   on the 6th string. Adjacent shapes overlap by design — that's the seam. */
const FRETS = 15;
const CAGED_WINDOWS = { E: [-1, 3], D: [1, 5], C: [4, 8], A: [6, 10], G: [9, 13] };
const CAGED_ORDER = ["C", "A", "G", "E", "D"];
const PENT_BOX = { E: 1, D: 2, C: 3, A: 4, G: 5 };
const CAGED_TUNINGS = ["Standard (EADGBE)", "D Standard"];
/* Shapes ascend the neck in the order the acronym spells: C→A→G→E→D→C… */
const CAGED_NEXT = { C: "A", A: "G", G: "E", E: "D", D: "C" };
const CAGED_INFO = {
  C: "Roots on strings 5 and 2 — the open-C grip moved up the neck.",
  A: "Roots on strings 5 and 3 — barre form of the open A chord.",
  G: "Roots on strings 6, 3, and 1 — the big open-G grip.",
  E: "Roots on strings 6, 4, and 1 — the workhorse barre shape. Minor pentatonic Box 1 lives here.",
  D: "Roots on strings 4 and 2 — the compact top-string voicing.",
};

/* -------- Ear trainer -------- */
const IV_SHORT = ["m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8"];
const IV_LONG = [
  "Minor 2nd", "Major 2nd", "Minor 3rd", "Major 3rd", "Perfect 4th", "Tritone",
  "Perfect 5th", "Minor 6th", "Major 6th", "Minor 7th", "Major 7th", "Octave",
];
const EAR_SONGS = {
  1: "Jaws theme — that creeping half-step",
  2: "Happy Birthday (first two notes)",
  3: "Iron Man — the riff's opening move",
  4: "Oh When the Saints (first two notes)",
  5: "Here Comes the Bride",
  6: "Black Sabbath — the devil's interval itself",
  7: "Star Wars main theme, or any power chord",
  8: "Love Story theme (the first leap)",
  9: "The NBC chimes",
  10: "Star Trek (original series) theme",
  11: "Take On Me — that chorus leap",
  12: "Somewhere Over the Rainbow (some-WHERE)",
};
const EAR_POOLS = {
  STARTER: [4, 5, 7, 12],
  WORKING: [2, 3, 4, 5, 7, 9, 10, 12],
  "FULL CHROMATIC": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
};

/* -------- Progression builder -------- */
const TRIAD_IVS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
const SEVENTH_IVS = {
  "maj7": [0, 4, 7, 11], "7": [0, 4, 7, 10], "m7": [0, 3, 7, 10],
  "m7♭5": [0, 3, 6, 10], "°7": [0, 3, 6, 9], "m(maj7)": [0, 3, 7, 11],
  "+maj7": [0, 4, 8, 11], "+7": [0, 4, 8, 10],
};
const PROG_PRESETS = [
  { name: "THE AXIS", pattern: "1·5·6·4", degs: [0, 4, 5, 3] },
  { name: "DOO-WOP", pattern: "1·6·4·5", degs: [0, 5, 3, 4] },
  { name: "CAMPFIRE", pattern: "1·4·1·5", degs: [0, 3, 0, 4] },
  { name: "ANDALUSIAN", pattern: "1·7·6·5", degs: [0, 6, 5, 4] },
  { name: "DOOM", pattern: "1·6·7", degs: [0, 5, 6] },
  { name: "EPIC", pattern: "6·4·1·5", degs: [5, 3, 0, 4] },
];

// Circle of fifths: [major pc, major label, minor label]
const CIRCLE = [
  [0, "C", "Am"], [7, "G", "Em"], [2, "D", "Bm"], [9, "A", "F#m"],
  [4, "E", "C#m"], [11, "B", "G#m"], [6, "F#", "Ebm"], [1, "Db", "Bbm"],
  [8, "Ab", "Fm"], [3, "Eb", "Cm"], [10, "Bb", "Gm"], [5, "F", "Dm"],
];
const KEY_SIGS = ["—", "1♯", "2♯", "3♯", "4♯", "5♯", "6♯ / 6♭", "5♭", "4♭", "3♭", "2♭", "1♭"];

const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* -------- Pitch detection (ACF2+ autocorrelation) -------- */
function autoCorrelate(buf, sampleRate) {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++)
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++)
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }

  const b2 = buf.slice(r1, r2);
  SIZE = b2.length;
  const c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++)
    for (let j = 0; j < SIZE - i; j++) c[i] += b2[j] * b2[j + i];

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++)
    if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  if (maxpos <= 0) return -1;

  let T0 = maxpos;
  const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 = T0 - bb / (2 * a);
  return sampleRate / T0;
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/* -------- Persistence -------- */
const STORAGE_KEY = "fretlab-v1";
const loadSaved = () => {
  try {
    if (typeof localStorage === "undefined") return {};
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
};
const SAVED = loadSaved();
const persist = (obj) => {
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* private mode / quota — run stateless */
  }
};

function triadQuality(a, b) {
  if (a === 4 && b === 3) return { q: "", cls: "maj" };
  if (a === 3 && b === 4) return { q: "m", cls: "min" };
  if (a === 3 && b === 3) return { q: "°", cls: "dim" };
  if (a === 4 && b === 4) return { q: "+", cls: "aug" };
  return { q: "?", cls: "min" };
}
function seventhQuality(ints) {
  const k = ints.join(",");
  const map = {
    "4,3,4": "maj7", "4,3,3": "7", "3,4,3": "m7", "3,3,4": "m7♭5",
    "3,3,3": "°7", "3,4,4": "m(maj7)", "4,4,3": "+maj7", "4,4,2": "+7",
  };
  return map[k] || "";
}

export default function FretLab() {
  const [tab, setTab] = useState("scales");
  const [root, setRoot] = useState(SAVED.root ?? 4); // E — of course
  const [scaleName, setScaleName] = useState(
    SCALES[SAVED.scaleName] ? SAVED.scaleName : "Minor Pentatonic"
  );
  const [chordName, setChordName] = useState(
    CHORDS[SAVED.chordName] ? SAVED.chordName : "Power (5)"
  );
  const [tuningName, setTuningName] = useState(
    TUNINGS[SAVED.tuningName] ? SAVED.tuningName : "Standard (EADGBE)"
  );
  const [labelMode, setLabelMode] = useState(SAVED.labelMode ?? "notes");
  const [useFlats, setUseFlats] = useState(SAVED.useFlats ?? false);
  const [circleMode, setCircleMode] = useState("major");
  const [powerOn, setPowerOn] = useState(true);
  const [cagedShape, setCagedShape] = useState(null);
  const [cagedConnect, setCagedConnect] = useState(false);
  const [playhead, setPlayhead] = useState(null);
  const runTimersRef = useRef([]);
  const ctxRef = useRef(null);

  const tuning = TUNINGS[tuningName];
  const cagedOk = CAGED_TUNINGS.includes(tuningName);

  // All visible occurrences of a shape's fret window (may wrap at the octave)
  const winsFor = (shape) => {
    if (!shape || !cagedOk) return null;
    const rootFret6 = (root - (TUNINGS[tuningName][0] % 12) + 12) % 12;
    const [a, b] = CAGED_WINDOWS[shape];
    const wins = [];
    for (const k of [-12, 0, 12]) {
      const lo = rootFret6 + a + k;
      const hi = rootFret6 + b + k;
      if (hi >= 0 && lo <= FRETS) wins.push([Math.max(lo, 0), Math.min(hi, FRETS)]);
    }
    return wins;
  };

  const cagedWins = useMemo(
    () => winsFor(cagedShape),
    [cagedShape, cagedOk, root, tuningName] // eslint-disable-line
  );
  const nextShape = cagedShape ? CAGED_NEXT[cagedShape] : null;
  const connWins = useMemo(
    () => (cagedConnect ? winsFor(nextShape) : null),
    [cagedConnect, nextShape, cagedOk, root, tuningName] // eslint-disable-line
  );

  const inA = (f) => cagedWins?.some(([lo, hi]) => f >= lo && f <= hi) || false;
  const inB = (f) => connWins?.some(([lo, hi]) => f >= lo && f <= hi) || false;
  const inWin = (fret) => !cagedWins || inA(fret) || inB(fret);

  const clearRun = () => {
    runTimersRef.current.forEach(clearTimeout);
    runTimersRef.current = [];
    setPlayhead(null);
  };
  useEffect(() => clearRun, []);
  useEffect(() => { clearRun(); }, [tab, root, tuningName, cagedShape, cagedConnect]); // eslint-disable-line

  // Position run: every in-window scale tone, string by string, low to high
  const playRun = (intervalsSet) => {
    clearRun();
    const cells = [];
    tuning.forEach((openMidi, sIdx) => {
      for (let f = 0; f <= FRETS; f++) {
        if (!intervalsSet.has((openMidi + f) % 12)) continue;
        if (cagedWins && !(inA(f) || inB(f))) continue;
        cells.push({ s: sIdx, f, midi: openMidi + f });
      }
    });
    cells.forEach((c, i) => {
      pluck(midiFreq(c.midi), i * 0.22, 0.26);
      runTimersRef.current.push(
        setTimeout(() => setPlayhead(`${c.s}-${c.f}`), i * 220)
      );
    });
    runTimersRef.current.push(
      setTimeout(() => setPlayhead(null), cells.length * 220 + 400)
    );
  };

  /* -------- Ear trainer state & logic -------- */
  const [earMode, setEarMode] = useState(SAVED.earMode ?? "asc");
  const [earPoolName, setEarPoolName] = useState(
    EAR_POOLS[SAVED.earPoolName] ? SAVED.earPoolName : "STARTER"
  );
  const [earQ, setEarQ] = useState(null);
  const [earPicked, setEarPicked] = useState(null);
  const [earStats, setEarStats] = useState(SAVED.earStats ?? {});
  const [earScore, setEarScore] = useState(
    SAVED.earScore ?? { correct: 0, total: 0, streak: 0, best: 0 }
  );

  const playEarQ = (q) => {
    if (!q) return;
    if (earInput === "guitar") {
      pluck(midiFreq(q.root), 0, 0.32); // root only — the player supplies the answer
      return;
    }
    const second = q.dir === "desc" ? q.root - q.iv : q.root + q.iv;
    if (q.dir === "harm") {
      pluck(midiFreq(q.root), 0, 0.22);
      pluck(midiFreq(second), 0.02, 0.22);
    } else {
      pluck(midiFreq(q.root), 0, 0.3);
      pluck(midiFreq(second), 0.6, 0.3);
    }
  };

  const nextEarQ = () => {
    const pool = EAR_POOLS[earPoolName];
    const iv = pool[Math.floor(Math.random() * pool.length)];
    const dir =
      earInput === "guitar"
        ? "asc"
        : earMode === "mix"
        ? Math.random() < 0.5 ? "asc" : "desc"
        : earMode;
    const rootMidi = 45 + Math.floor(Math.random() * 17); // A2–C#4
    const q = { root: rootMidi, iv, dir };
    qTimeRef.current = Date.now();
    holdRef.current = { pc: null, count: 0 };
    setEarQ(q);
    setEarPicked(null);
    playEarQ(q);
  };

  const answerEar = (iv) => {
    if (!earQ || earPicked !== null) return;
    setEarPicked(iv);
    const ok = iv === earQ.iv;
    setEarStats((s) => ({
      ...s,
      [earQ.iv]: {
        asked: (s[earQ.iv]?.asked || 0) + 1,
        correct: (s[earQ.iv]?.correct || 0) + (ok ? 1 : 0),
      },
    }));
    setEarScore((sc) => {
      const streak = ok ? sc.streak + 1 : 0;
      return {
        correct: sc.correct + (ok ? 1 : 0),
        total: sc.total + 1,
        streak,
        best: Math.max(sc.best, streak),
      };
    });
  };

  const resetEarSession = (fn) => {
    fn();
    setEarQ(null);
    setEarPicked(null);
  };

  /* -------- Progression builder state & logic -------- */
  const [prog, setProg] = useState(Array.isArray(SAVED.prog) ? SAVED.prog : []);
  const [progSeventh, setProgSeventh] = useState(SAVED.progSeventh ?? false);
  const [bpm, setBpm] = useState(SAVED.bpm ?? 90);
  const [progIdx, setProgIdx] = useState(null);
  const [progPlaying, setProgPlaying] = useState(false);
  const [savedProgs, setSavedProgs] = useState(
    Array.isArray(SAVED.savedProgs) ? SAVED.savedProgs : []
  );
  const [progName, setProgName] = useState("");
  const progTimersRef = useRef([]);

  /* -------- Cloud sync (Supabase) + local persistence -------- */
  const [user, setUser] = useState(null);
  const [syncStatus, setSyncStatus] = useState("local"); // local | saving | synced | error
  const [syncOpen, setSyncOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMsg, setAuthMsg] = useState(null);
  const userRef = useRef(null);
  const cloudTimerRef = useRef(null);
  const hydratingRef = useRef(false);
  const firstPersistRef = useRef(true);
  useEffect(() => { userRef.current = user; }, [user]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null)
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // Apply a state blob to the app (validating against what exists)
  const applyState = (d) => {
    if (!d || typeof d !== "object") return;
    hydratingRef.current = true;
    if (typeof d.root === "number" && d.root >= 0 && d.root < 12) setRoot(d.root);
    if (SCALES[d.scaleName]) setScaleName(d.scaleName);
    if (CHORDS[d.chordName]) setChordName(d.chordName);
    if (TUNINGS[d.tuningName]) setTuningName(d.tuningName);
    if (["notes", "intervals", "degrees"].includes(d.labelMode)) setLabelMode(d.labelMode);
    setUseFlats(!!d.useFlats);
    if (typeof d.bpm === "number") setBpm(Math.max(60, Math.min(160, d.bpm)));
    setProgSeventh(!!d.progSeventh);
    if (Array.isArray(d.prog)) setProg(d.prog);
    if (Array.isArray(d.savedProgs)) setSavedProgs(d.savedProgs);
    if (["asc", "desc", "harm", "mix"].includes(d.earMode)) setEarMode(d.earMode);
    if (EAR_POOLS[d.earPoolName]) setEarPoolName(d.earPoolName);
    if (d.earStats && typeof d.earStats === "object") setEarStats(d.earStats);
    if (d.earScore && typeof d.earScore === "object") setEarScore(d.earScore);
    setTimeout(() => { hydratingRef.current = false; }, 0);
  };

  const scheduleCloudSave = (blob) => {
    if (!supabase || !userRef.current) return;
    setSyncStatus("saving");
    clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current = setTimeout(async () => {
      const { error } = await supabase.from("fretlab_state").upsert({
        user_id: userRef.current.id,
        data: blob,
        updated_at: new Date().toISOString(),
      });
      setSyncStatus(error ? "error" : "synced");
    }, 1500);
  };

  // On sign-in: merge cloud vs local, newest wins
  useEffect(() => {
    if (!supabase) return;
    if (!user) { setSyncStatus("local"); return; }
    (async () => {
      const { data: row, error } = await supabase
        .from("fretlab_state")
        .select("data")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) { setSyncStatus("error"); return; }
      const local = loadSaved();
      const cloudTs = row?.data?._ts || 0;
      const localTs = local?._ts || 0;
      if (row && cloudTs > localTs) {
        applyState(row.data);
        persist(row.data); // mirror the winner locally
        setSyncStatus("synced");
      } else {
        const blob = { ...local, _ts: localTs || Date.now() };
        const { error: upErr } = await supabase.from("fretlab_state").upsert({
          user_id: user.id,
          data: blob,
          updated_at: new Date().toISOString(),
        });
        setSyncStatus(upErr ? "error" : "synced");
      }
    })();
    // eslint-disable-next-line
  }, [user]);

  const sendMagicLink = async () => {
    setAuthMsg(null);
    const email = authEmail.trim();
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setAuthMsg(error ? error.message : "Link sent — check your email, then return here.");
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(loadSaved(), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fretlab-backup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJSON = (file) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        const blob = { ...d, _ts: Date.now() };
        applyState(blob);
        persist(blob);
        scheduleCloudSave(blob);
        setAuthMsg("Backup imported.");
      } catch {
        setAuthMsg("That file didn't parse as a FretLab backup.");
      }
    };
    r.readAsText(file);
  };

  /* -------- Persist everything worth keeping -------- */
  useEffect(() => {
    if (firstPersistRef.current) { firstPersistRef.current = false; return; }
    if (hydratingRef.current) return;
    const blob = {
      root, scaleName, chordName, tuningName, labelMode, useFlats,
      bpm, progSeventh, prog, savedProgs,
      earMode, earPoolName, earStats, earScore,
      _ts: Date.now(),
    };
    persist(blob);
    scheduleCloudSave(blob);
    // eslint-disable-next-line
  }, [
    root, scaleName, chordName, tuningName, labelMode, useFlats,
    bpm, progSeventh, prog, savedProgs,
    earMode, earPoolName, earStats, earScore,
  ]);

  const saveCurrentProg = () => {
    const name = progName.trim();
    if (!name || prog.length === 0) return;
    setSavedProgs([
      ...savedProgs.filter((p) => p.name !== name),
      { name, degs: prog, root, scaleName, seventh: progSeventh },
    ]);
    setProgName("");
  };

  const loadSavedProg = (p) => {
    setProg(p.degs);
    setRoot(p.root);
    if (SCALES[p.scaleName]) setScaleName(p.scaleName);
    setProgSeventh(!!p.seventh);
  };

  const chordIvsFor = (ch) =>
    progSeventh
      ? SEVENTH_IVS[ch.seventh] || TRIAD_IVS[ch.quality.cls]
      : TRIAD_IVS[ch.quality.cls];

  const strum = (ch) => {
    const bass = 48 + ch.rootPc;
    const ivs = chordIvsFor(ch);
    ivs.forEach((iv, i) => pluck(midiFreq(bass + iv), i * 0.038, 0.2));
    pluck(midiFreq(bass + 12), ivs.length * 0.038, 0.13);
  };

  const stopProg = () => {
    progTimersRef.current.forEach(clearTimeout);
    progTimersRef.current = [];
    setProgIdx(null);
    setProgPlaying(false);
  };
  useEffect(() => stopProg, []);

  const playProg = () => {
    stopProg();
    if (!diatonic || prog.length === 0) return;
    setPowerOn(true);
    setProgPlaying(true);
    const chordMs = (60 / bpm) * 2 * 1000; // two beats per chord
    prog.forEach((deg, i) => {
      progTimersRef.current.push(
        setTimeout(() => {
          setProgIdx(i);
          strum(diatonic[deg]);
        }, i * chordMs)
      );
    });
    progTimersRef.current.push(
      setTimeout(() => {
        setProgIdx(null);
        setProgPlaying(false);
      }, prog.length * chordMs + 400)
    );
  };

  const addToProg = (deg) => {
    if (!diatonic) return;
    if (prog.length < 12) setProg([...prog, deg]);
    strum(diatonic[deg]);
  };

  /* -------- Shared mic engine (tuner + ear trainer play mode) -------- */
  const [micOn, setMicOn] = useState(false);
  const [micUser, setMicUser] = useState(null); // 'tuner' | 'ear'
  const [pitch, setPitch] = useState(null); // {freq, note, octave, cents, midi}
  const [micErr, setMicErr] = useState(null);
  const micStreamRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const recentRef = useRef([]);
  const frameRef = useRef(0);
  const onReadingRef = useRef(null);

  const stopMic = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    analyserRef.current = null;
    recentRef.current = [];
    onReadingRef.current = null;
    setMicOn(false);
    setMicUser(null);
    setPitch(null);
    setEarLive(null);
  };

  const startMic = async (user, onReading) => {
    setMicErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });
      micStreamRef.current = stream;
      const ctx = ensureCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      onReadingRef.current = onReading;
      setMicOn(true);
      setMicUser(user);

      const buf = new Float32Array(analyser.fftSize);
      const loop = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(buf);
        const freq = autoCorrelate(buf, ctx.sampleRate);
        if (freq > 55 && freq < 1600) {
          recentRef.current.push(freq);
          if (recentRef.current.length > 7) recentRef.current.shift();
        }
        frameRef.current++;
        if (frameRef.current % 4 === 0) {
          if (recentRef.current.length >= 3) {
            const f = median(recentRef.current);
            const midiFloat = 69 + 12 * Math.log2(f / 440);
            const nearest = Math.round(midiFloat);
            onReadingRef.current?.({
              freq: f,
              midi: nearest,
              note: NOTES[((nearest % 12) + 12) % 12],
              octave: Math.floor(nearest / 12) - 1,
              cents: Math.max(-50, Math.min(50, (midiFloat - nearest) * 100)),
            });
          } else if (freq === -1) {
            recentRef.current = [];
            onReadingRef.current?.(null);
          }
        }
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e) {
      setMicErr(
        e.name === "NotAllowedError"
          ? "Microphone access was denied — allow it in your browser's site settings and try again."
          : `Couldn't open the microphone (${e.name}).`
      );
    }
  };

  /* -------- Ear trainer play mode (answer with your guitar) -------- */
  const [earInput, setEarInput] = useState("buttons"); // 'buttons' | 'guitar'
  const [earLive, setEarLive] = useState(null);
  const earQRef = useRef(null);
  const earPickedRef = useRef(null);
  const answerEarRef = useRef(null);
  const holdRef = useRef({ pc: null, count: 0 });
  const qTimeRef = useRef(0);
  useEffect(() => { earQRef.current = earQ; }, [earQ]);
  useEffect(() => { earPickedRef.current = earPicked; }, [earPicked]);
  answerEarRef.current = answerEar;

  const onEarReading = (r) => {
    setEarLive(r);
    const q = earQRef.current;
    if (!r || !q || earPickedRef.current !== null) {
      holdRef.current = { pc: null, count: 0 };
      return;
    }
    if (Date.now() - qTimeRef.current < 1200) return; // ignore the prompt's own audio
    if (Math.abs(r.cents) > 35) return; // pitch not settled
    const pc = ((r.midi % 12) + 12) % 12;
    const rootPc = ((q.root % 12) + 12) % 12;
    const targetPc = (rootPc + q.iv) % 12;
    if (pc === rootPc && targetPc !== rootPc) {
      holdRef.current = { pc: null, count: 0 }; // they're finding the root; not an answer
      return;
    }
    if (holdRef.current.pc === pc) holdRef.current.count++;
    else holdRef.current = { pc, count: 1 };
    if (holdRef.current.count >= 5) {
      let played = (pc - rootPc + 12) % 12;
      if (played === 0) played = 12;
      answerEarRef.current(played);
      holdRef.current = { pc: null, count: 0 };
    }
  };

  const setEarInputMode = (mode) => {
    setEarInput(mode);
    setEarQ(null);
    setEarPicked(null);
    if (mode === "guitar") startMic("ear", onEarReading);
    else if (micUser === "ear") stopMic();
  };

  useEffect(() => {
    if (tab !== "tuner" && tab !== "ear") stopMic();
    if (tab !== "ear" && earInput === "guitar") setEarInput("buttons");
    // eslint-disable-next-line
  }, [tab]);
  useEffect(() => stopMic, []); // eslint-disable-line
  const activeIntervals = tab === "chords" ? CHORDS[chordName] : SCALES[scaleName];
  const pcs = useMemo(
    () => new Set(activeIntervals.map((i) => (root + i) % 12)),
    [activeIntervals, root]
  );
  const scaleNotes = activeIntervals.map((i) => NOTES[(root + i) % 12]);

  const ensureCtx = () => {
    if (!ctxRef.current)
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    if (ctxRef.current.state === "suspended") ctxRef.current.resume();
    return ctxRef.current;
  };

  const pluck = (freq, delay = 0, vol = 0.3) => {
    if (!powerOn) return;
    const ctx = ensureCtx();
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(Math.min(freq * 8, 8000), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.6, 200), t + 0.7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(f); f.connect(g); g.connect(ctx.destination);
    osc.start(t); osc.stop(t + 1.2);
  };

  const playSequence = () => {
    const base = 48 + ((root - 0 + 12) % 12); // root around C3–B3
    const seq = [...activeIntervals.map((i) => base + i), base + 12];
    seq.forEach((m, idx) => pluck(midiFreq(m), idx * 0.26, 0.28));
  };

  // Diatonic chords (7-note scales only)
  const diatonic = useMemo(() => {
    const ivs = SCALES[scaleName];
    if (!ivs || ivs.length !== 7) return null;
    return ivs.map((_, d) => {
      const get = (n) => (root + ivs[(d + n) % 7] + (d + n >= 7 ? 12 : 0)) % 12;
      const r = get(0), third = get(2), fifth = get(4), sev = get(6);
      const a = (third - r + 12) % 12, b = (fifth - third + 12) % 12, c = (sev - fifth + 12) % 12;
      const tri = triadQuality(a, b);
      const sevQ = seventhQuality([a, b, c]);
      const numeral = tri.cls === "min" || tri.cls === "dim"
        ? ROMAN[d].toLowerCase() + tri.q
        : ROMAN[d] + tri.q;
      return { note: NOTES[r], quality: tri, numeral, seventh: sevQ, rootPc: r };
    });
  }, [scaleName, root]);

  // Mode lens: active when the current scale is one of the seven major-scale modes
  const modeInfo = useMemo(() => {
    const d = MODE_ORDER.indexOf(scaleName);
    if (tab !== "scales" || d < 0) return null;
    const parentPc = (root - MAJOR_IVS[d] + 12) % 12;
    return {
      d,
      parentPc,
      charIv: MODE_CHAR[d].iv,
      charPc: (root + MODE_CHAR[d].iv) % 12,
      why: MODE_CHAR[d].why,
    };
  }, [scaleName, root, tab]);

  const steps = useMemo(() => {
    const ivs = activeIntervals;
    const out = [];
    for (let i = 0; i < ivs.length; i++) {
      const next = i + 1 < ivs.length ? ivs[i + 1] : 12;
      out.push(STEP_NAMES[next - ivs[i]] || `${next - ivs[i]}`);
    }
    return out;
  }, [activeIntervals]);

  const jumpToChord = (rootPc, quality) => {
    const map = { maj: "Major", min: "Minor", dim: "Diminished", aug: "Augmented" };
    setRoot(rootPc);
    setChordName(map[quality] || "Major");
    setTab("chords");
  };

  const inlays = { 3: 1, 5: 1, 7: 1, 9: 1, 12: 2, 15: 1 };

  const labelFor = (pc) => {
    const iv = (pc - root + 12) % 12;
    if (labelMode === "intervals") return INTERVALS[iv];
    if (labelMode === "degrees") {
      const idx = activeIntervals.indexOf(iv);
      return idx >= 0 ? String(idx + 1) : "";
    }
    return disp(NOTES[pc], useFlats);
  };

  return (
    <div className="fl-root">
      <style>{CSS}</style>

      {/* ============ AMP HEAD FACEPLATE ============ */}
      <header className="faceplate">
        <div className="fp-left">
          <div className="logo-script">FretLab</div>
          <div className="logo-sub">MODEL GT-59 · ALL-TUBE THEORY HEAD</div>
        </div>
        <nav className="fp-tabs">
          {[
            ["scales", "SCALES & MODES"],
            ["chords", "CHORDS"],
            ["prog", "PROGRESSIONS"],
            ["circle", "CIRCLE OF 5THS"],
            ["ear", "EAR TRAINER"],
            ["tuner", "TUNER"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`fp-tab ${tab === id ? "on" : ""}`}
              onClick={() => {
                setTab(id);
                if (id === "ear") setPowerOn(true);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className={`sync-btn s-${syncStatus}`}
          onClick={() => setSyncOpen(!syncOpen)}
          title="Sync & backup"
        >
          <span className="sync-dot" />
          <span className="power-label">
            {syncStatus === "synced" ? "SYNCED" : syncStatus === "saving" ? "SAVING" : syncStatus === "error" ? "SYNC ERR" : "SYNC"}
          </span>
        </button>
        <button
          className={`power ${powerOn ? "lit" : ""}`}
          onClick={() => setPowerOn(!powerOn)}
          title="Sound on/off"
          aria-label="Toggle sound"
        >
          <span className="jewel" />
          <span className="power-label">SOUND</span>
        </button>
      </header>

      {/* ============ SYNC & BACKUP PANEL ============ */}
      {syncOpen && (
        <section className="sync-panel">
          {supabase ? (
            user ? (
              <div className="sync-row">
                <span className="sync-info">
                  ☁ Syncing as <strong>{user.email}</strong> — changes save to the
                  cloud automatically and follow you to any device.
                </span>
                <button className="play-btn" onClick={() => supabase.auth.signOut()}>
                  SIGN OUT
                </button>
              </div>
            ) : (
              <div className="sync-row">
                <span className="sync-info">
                  Sign in to sync your stats, progressions, and settings across devices.
                  No password — we email you a link.
                </span>
                <input
                  className="prog-name-input sync-email"
                  type="email"
                  placeholder="you@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
                />
                <button className="play-btn" onClick={sendMagicLink} disabled={!authEmail.trim()}>
                  SEND SIGN-IN LINK
                </button>
              </div>
            )
          ) : (
            <div className="sync-row">
              <span className="sync-info">
                Cloud sync isn't configured on this build (set VITE_SUPABASE_URL and
                VITE_SUPABASE_ANON_KEY). Local saving still works, and you can move
                data between devices with the backup buttons.
              </span>
            </div>
          )}
          <div className="sync-row backup-row">
            <span className="chip-label">BACKUP</span>
            <button className="play-btn" onClick={exportJSON}>⬇ EXPORT JSON</button>
            <label className="play-btn import-label">
              ⬆ IMPORT JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => { importJSON(e.target.files[0]); e.target.value = ""; }}
                hidden
              />
            </label>
            {authMsg && <span className="sync-msg">{authMsg}</span>}
          </div>
        </section>
      )}

      {(tab === "scales" || tab === "chords") && (
        <>
          {/* ============ CONTROL PANEL ============ */}
          <section className="panel">
            <div className="ctl">
              <label>ROOT</label>
              <div className="root-row">
                {NOTES.map((n, i) => (
                  <button
                    key={n}
                    className={`root-btn ${root === i ? "on" : ""}`}
                    onClick={() => setRoot(i)}
                  >
                    {disp(n, useFlats)}
                  </button>
                ))}
              </div>
            </div>

            <div className="ctl">
              <label>{tab === "chords" ? "CHORD" : "SCALE"}</label>
              {tab === "chords" ? (
                <select value={chordName} onChange={(e) => setChordName(e.target.value)}>
                  {Object.keys(CHORDS).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              ) : (
                <select value={scaleName} onChange={(e) => setScaleName(e.target.value)}>
                  {Object.entries(SCALES).map(([name, v]) =>
                    v === null ? (
                      <option key={name} disabled>{name}</option>
                    ) : (
                      <option key={name} value={name}>{name}</option>
                    )
                  )}
                </select>
              )}
            </div>

            <div className="ctl">
              <label>TUNING</label>
              <select value={tuningName} onChange={(e) => setTuningName(e.target.value)}>
                {Object.keys(TUNINGS).map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="ctl">
              <label>LABELS</label>
              <div className="seg">
                {[["notes", "NOTES"], ["intervals", "INTERVALS"], ["degrees", "DEGREES"]].map(
                  ([id, lab]) => (
                    <button
                      key={id}
                      className={labelMode === id ? "on" : ""}
                      onClick={() => setLabelMode(id)}
                    >
                      {lab}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="ctl">
              <label>CAGED POSITION</label>
              <div className="seg">
                <button
                  className={!cagedShape ? "on" : ""}
                  onClick={() => { setCagedShape(null); setCagedConnect(false); }}
                >
                  OFF
                </button>
                {CAGED_ORDER.map((s) => (
                  <button
                    key={s}
                    disabled={!cagedOk}
                    className={cagedShape === s ? "on" : ""}
                    onClick={() => setCagedShape(s)}
                    title={cagedOk ? CAGED_INFO[s] : "CAGED assumes standard-interval tuning"}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {cagedShape && cagedOk && (
                <button
                  className={`connect-btn ${cagedConnect ? "on" : ""}`}
                  onClick={() => setCagedConnect(!cagedConnect)}
                >
                  {cagedConnect
                    ? `⛓ CONNECTED: ${cagedShape} + ${nextShape}`
                    : `+ CONNECT NEXT SHAPE (${CAGED_NEXT[cagedShape]})`}
                </button>
              )}
              {!cagedOk && (
                <div className="ctl-note">needs Standard or D Standard tuning</div>
              )}
            </div>

            <div className="ctl">
              <label>ACCIDENTALS</label>
              <div className="seg">
                <button className={!useFlats ? "on" : ""} onClick={() => setUseFlats(false)}>♯</button>
                <button className={useFlats ? "on" : ""} onClick={() => setUseFlats(true)}>♭</button>
              </div>
            </div>

            <div className="ctl">
              <label>&nbsp;</label>
              <button className="play-btn" onClick={playSequence}>
                ▶ PLAY {tab === "chords" ? "ARPEGGIO" : "SCALE"}
              </button>
            </div>
          </section>

          {/* ============ FRETBOARD ============ */}
          <section className="board-wrap">
            <div className="board-scroll">
              <div className="board">
                {/* fret numbers */}
                <div className="fretnums">
                  <div className="fn nut-col" />
                  {Array.from({ length: FRETS }, (_, f) => (
                    <div key={f} className="fn">{f + 1}</div>
                  ))}
                </div>

                <div className="neck">
                  {/* inlays */}
                  <div className="inlay-layer">
                    <div className="nut-col" />
                    {Array.from({ length: FRETS }, (_, i) => {
                      const f = i + 1;
                      return (
                        <div key={f} className="inlay-cell">
                          {inlays[f] === 1 && <span className="dot" />}
                          {inlays[f] === 2 && (
                            <>
                              <span className="dot d12a" />
                              <span className="dot d12b" />
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* CAGED position zones (A = amber, B = moonlight, seam = both) */}
                  {cagedWins && (
                    <div className="zone-layer">
                      {Array.from({ length: FRETS + 1 }, (_, f) => {
                        const a = inA(f), b = inB(f);
                        const cls = a && b ? "seam" : a ? "zon" : b ? "zonB" : "";
                        return (
                          <div
                            key={f}
                            className={`zcell ${f === 0 ? "nut-col" : ""} ${cls}`}
                          />
                        );
                      })}
                    </div>
                  )}

                  {/* strings, high E on top */}
                  {[...tuning].reverse().map((openMidi, sIdx) => {
                    const gauge = 1 + sIdx * 0.55;
                    const origIdx = tuning.length - 1 - sIdx;
                    return (
                      <div className="string-row" key={sIdx}>
                        <div className="string-line" style={{ height: gauge }} />
                        {Array.from({ length: FRETS + 1 }, (_, fret) => {
                          const midi = openMidi + fret;
                          const pc = midi % 12;
                          const active = pcs.has(pc);
                          const isRoot = pc === root;
                          const isNow = playhead === `${origIdx}-${fret}`;
                          return (
                            <div
                              key={fret}
                              className={`cell ${fret === 0 ? "nut-col open-cell" : ""}`}
                              onClick={() => pluck(midiFreq(midi))}
                            >
                              {active && (
                                <span
                                  className={`marker ${isRoot ? "root" : ""} ${
                                    cagedWins && !inWin(fret) ? "dim" : ""
                                  } ${isNow ? "now" : ""} ${
                                    modeInfo && pc === modeInfo.charPc ? "char" : ""
                                  }`}
                                >
                                  {labelFor(pc)}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                <div className="board-hint">Click any fret to hear it · open strings at left of the nut</div>
              </div>
            </div>
          </section>

          {/* ============ INFO PANEL ============ */}
          <section className="info">
            <div className="info-card">
              <div className="info-head">
                {disp(NOTES[root], useFlats)}{" "}
                {tab === "chords" ? chordName : scaleName}
              </div>

              {cagedShape && cagedWins && (
                <div className="caged-line">
                  <span className="caged-tag">
                    {cagedConnect ? `${cagedShape} + ${nextShape} SHAPES` : `${cagedShape} SHAPE`}
                    {!cagedConnect &&
                      tab === "scales" &&
                      (scaleName.includes("Pentatonic") || scaleName === "Blues") &&
                      ` · BOX ${PENT_BOX[cagedShape]}`}
                    {cagedConnect &&
                      tab === "scales" &&
                      (scaleName.includes("Pentatonic") || scaleName === "Blues") &&
                      ` · BOXES ${PENT_BOX[cagedShape]}+${PENT_BOX[nextShape]}`}
                  </span>
                  <span className="caged-frets">
                    frets{" "}
                    {cagedWins
                      .map(([a, b]) => (a === b ? a : `${a}–${b}`))
                      .join("  &  ")}
                    {connWins &&
                      "  ⛓  " +
                        connWins
                          .map(([a, b]) => (a === b ? a : `${a}–${b}`))
                          .join("  &  ")}
                  </span>
                  <span className="caged-desc">
                    {cagedConnect
                      ? "The overlap is the seam — shift positions there, sliding with your 1st or 4th finger."
                      : CAGED_INFO[cagedShape]}
                  </span>
                  <button className="play-btn run-btn" onClick={() => playRun(pcs)}>
                    ▶ PLAY THE RUN
                  </button>
                </div>
              )}

              <div className="chip-row">
                <span className="chip-label">SPELLING</span>
                {scaleNotes.map((n, i) => (
                  <button
                    key={i}
                    className={`chip ${i === 0 ? "root" : ""} ${
                      modeInfo && NOTES.indexOf(n) === modeInfo.charPc ? "char-chip" : ""
                    }`}
                    onClick={() => pluck(midiFreq(48 + ((NOTES.indexOf(n) - 0 + 12) % 12) + (NOTES.indexOf(n) < root ? 12 : 0)))}
                  >
                    {disp(n, useFlats)}
                    <em>{INTERVALS[(NOTES.indexOf(n) - root + 12) % 12]}</em>
                  </button>
                ))}
              </div>

              {tab === "scales" && (
                <div className="chip-row">
                  <span className="chip-label">STEPS</span>
                  {steps.map((s, i) => (
                    <span key={i} className="step">{s}</span>
                  ))}
                </div>
              )}

              {tab === "scales" && SCALE_NOTES_TIPS[scaleName] && (
                <p className="tip">{SCALE_NOTES_TIPS[scaleName]}</p>
              )}

              {modeInfo && (
                <div className="mode-lens">
                  <div className="dia-label lens-title">MODE LENS</div>

                  <div className="lens-row">
                    <span className="lens-fact">
                      Same notes as{" "}
                      <strong>{disp(NOTES[modeInfo.parentPc], useFlats)} Major</strong>
                      , started from its {ORD[modeInfo.d]} degree.
                    </span>
                    {modeInfo.d !== 0 && (
                      <button
                        className="lens-btn"
                        onClick={() => {
                          setRoot(modeInfo.parentPc);
                          setScaleName(MODE_ORDER[0]);
                        }}
                      >
                        VIEW {disp(NOTES[modeInfo.parentPc], useFlats)} MAJOR →
                      </button>
                    )}
                  </div>

                  <div className="lens-row">
                    <span className="lens-fact">
                      Characteristic tone:{" "}
                      <strong className="char-text">
                        {disp(NOTES[modeInfo.charPc], useFlats)} ({INTERVALS[modeInfo.charIv]})
                      </strong>{" "}
                      — {modeInfo.why}. It glows blue on the neck; lean on it when
                      you solo, or the mode collapses back into plain major/minor.
                    </span>
                  </div>

                  <div className="lens-strip">
                    <span className="chip-label">PARALLEL · SAME ROOT, BRIGHT → DARK</span>
                    <div className="lens-chips">
                      {BRIGHTNESS.map((di) => (
                        <button
                          key={di}
                          className={`lens-chip ${di === modeInfo.d ? "on" : ""}`}
                          onClick={() => setScaleName(MODE_ORDER[di])}
                        >
                          {MODE_SHORT[di]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="lens-strip">
                    <span className="chip-label">RELATIVE · SAME NOTES, NEW HOME</span>
                    <div className="lens-chips">
                      {MODE_ORDER.map((m, di) => {
                        const r = (modeInfo.parentPc + MAJOR_IVS[di]) % 12;
                        return (
                          <button
                            key={m}
                            className={`lens-chip ${di === modeInfo.d ? "on" : ""}`}
                            onClick={() => {
                              setRoot(r);
                              setScaleName(m);
                            }}
                          >
                            {disp(NOTES[r], useFlats)} {MODE_SHORT[di]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {tab === "scales" && diatonic && (
                <div className="diatonic">
                  <div className="dia-label">DIATONIC CHORDS — click one to see it on the neck</div>
                  <div className="dia-row">
                    {diatonic.map((c, i) => (
                      <button
                        key={i}
                        className={`dia-chip ${c.quality.cls}`}
                        onClick={() => jumpToChord(c.rootPc, c.quality.cls)}
                      >
                        <span className="dia-num">{c.numeral}</span>
                        <span className="dia-name">
                          {disp(c.note, useFlats)}{c.quality.q}
                        </span>
                        <span className="dia-7">{disp(c.note, useFlats)}{c.seventh}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* ============ CIRCLE OF FIFTHS ============ */}
      {tab === "circle" && (
        <section className="circle-wrap">
          <div className="circle-panel">
            <div className="seg circle-seg">
              <button className={circleMode === "major" ? "on" : ""} onClick={() => setCircleMode("major")}>
                MAJOR KEYS
              </button>
              <button className={circleMode === "minor" ? "on" : ""} onClick={() => setCircleMode("minor")}>
                MINOR KEYS
              </button>
            </div>

            <div className="circle-svg-wrap">
              <svg viewBox="0 0 340 340" className="circle-svg">
                <circle cx="170" cy="170" r="158" className="c-ring-outer" />
                <circle cx="170" cy="170" r="100" className="c-ring-inner" />
                <circle cx="170" cy="170" r="52" className="c-hub" />
                {CIRCLE.map(([pc, maj, min], i) => {
                  const ang = (i * 30 - 90) * (Math.PI / 180);
                  const ox = 170 + Math.cos(ang) * 130;
                  const oy = 170 + Math.sin(ang) * 130;
                  const ix = 170 + Math.cos(ang) * 77;
                  const iy = 170 + Math.sin(ang) * 77;
                  const minPc = (pc + 9) % 12;
                  const majActive = circleMode === "major" && root === pc;
                  const minActive = circleMode === "minor" && root === minPc;
                  return (
                    <g key={maj}>
                      <g
                        className={`c-key ${majActive ? "on" : ""}`}
                        onClick={() => {
                          setRoot(pc);
                          setCircleMode("major");
                          setScaleName("Major (Ionian)");
                          setUseFlats(maj.includes("b") || ["F", "Db", "Ab", "Eb", "Bb"].includes(maj));
                        }}
                      >
                        <circle cx={ox} cy={oy} r="24" />
                        <text x={ox} y={oy + 6}>{maj}</text>
                      </g>
                      <g
                        className={`c-key minor ${minActive ? "on" : ""}`}
                        onClick={() => {
                          setRoot(minPc);
                          setCircleMode("minor");
                          setScaleName("Natural Minor (Aeolian)");
                          setUseFlats(min.includes("b"));
                        }}
                      >
                        <circle cx={ix} cy={iy} r="17" />
                        <text x={ix} y={iy + 5}>{min}</text>
                      </g>
                    </g>
                  );
                })}
                <text x="170" y="163" className="hub-key">
                  {disp(NOTES[root], useFlats)}
                  {circleMode === "minor" ? "m" : ""}
                </text>
                <text x="170" y="185" className="hub-sig">
                  {(() => {
                    const idx = circleMode === "major"
                      ? CIRCLE.findIndex(([pc]) => pc === root)
                      : CIRCLE.findIndex(([pc]) => (pc + 9) % 12 === root);
                    return idx >= 0 ? KEY_SIGS[idx] : "";
                  })()}
                </text>
              </svg>
            </div>

            <div className="circle-notes">
              <p>
                Clockwise = up a fifth (add a sharp). Counter-clockwise = up a fourth
                (add a flat). Neighbors share 6 of 7 notes, which is why moving one
                step sounds smooth and jumping across the circle sounds distant.
              </p>
              <p>
                The inner ring shows each key's <strong>relative minor</strong> — same
                notes, different home base. Click any key to load it on the fretboard.
              </p>
              <button
                className="play-btn"
                onClick={() => setTab("scales")}
              >
                → VIEW {disp(NOTES[root], useFlats)}{circleMode === "minor" ? " MINOR" : " MAJOR"} ON THE NECK
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ============ EAR TRAINER ============ */}
      {tab === "ear" && (
        <section className="ear-wrap">
          <div className="ear-panel">
            <div className="ear-controls">
              <div className="ctl">
                <label>ANSWER WITH</label>
                <div className="seg">
                  <button
                    className={earInput === "buttons" ? "on" : ""}
                    onClick={() => setEarInputMode("buttons")}
                  >
                    BUTTONS
                  </button>
                  <button
                    className={earInput === "guitar" ? "on" : ""}
                    onClick={() => setEarInputMode("guitar")}
                  >
                    🎸 GUITAR (MIC)
                  </button>
                </div>
              </div>
              {earInput === "buttons" && (
                <div className="ctl">
                  <label>DIRECTION</label>
                  <div className="seg">
                    {[["asc", "ASC"], ["desc", "DESC"], ["harm", "HARMONIC"], ["mix", "MIX"]].map(
                      ([id, lab]) => (
                        <button
                          key={id}
                          className={earMode === id ? "on" : ""}
                          onClick={() => resetEarSession(() => setEarMode(id))}
                        >
                          {lab}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
              <div className="ctl">
                <label>INTERVAL POOL</label>
                <div className="seg">
                  {Object.keys(EAR_POOLS).map((p) => (
                    <button
                      key={p}
                      className={earPoolName === p ? "on" : ""}
                      onClick={() => resetEarSession(() => setEarPoolName(p))}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ear-score">
                <div className="meter-box">
                  <span className="meter-num">
                    {earScore.total ? Math.round((100 * earScore.correct) / earScore.total) : "—"}
                  </span>
                  <span className="meter-lab">% HIT</span>
                </div>
                <div className="meter-box">
                  <span className="meter-num">{earScore.correct}/{earScore.total}</span>
                  <span className="meter-lab">SCORE</span>
                </div>
                <div className="meter-box">
                  <span className="meter-num">{earScore.streak}</span>
                  <span className="meter-lab">STREAK</span>
                </div>
                <div className="meter-box">
                  <span className="meter-num">{earScore.best}</span>
                  <span className="meter-lab">BEST</span>
                </div>
              </div>
            </div>

            <div className="ear-stage">
              {micErr && tab === "ear" && <p className="tip mic-err">{micErr}</p>}

              {!earQ ? (
                <button className="ear-big" onClick={nextEarQ}>
                  {earInput === "guitar" ? "▶ PLAY FIRST ROOT" : "▶ PLAY FIRST INTERVAL"}
                </button>
              ) : (
                <div className="ear-live">
                  <button className="ear-replay" onClick={() => playEarQ(earQ)}>↻ REPLAY</button>
                  {earInput === "guitar" ? (
                    <span className="ear-prompt">
                      ROOT {NOTES[((earQ.root % 12) + 12) % 12]}
                      {Math.floor(earQ.root / 12) - 1} — PLAY A{" "}
                      <strong>{IV_LONG[earQ.iv - 1].toUpperCase()}</strong> ABOVE IT
                    </span>
                  ) : (
                    <span className="ear-dir">
                      {earQ.dir === "harm" ? "PLAYED TOGETHER" : earQ.dir === "desc" ? "DESCENDING" : "ASCENDING"}
                    </span>
                  )}
                </div>
              )}

              {earInput === "guitar" && micOn && (
                <div className={`live-pill ${earLive ? "hot" : ""}`}>
                  {earLive
                    ? `HEARING: ${earLive.note}${earLive.octave}`
                    : "listening…"}
                </div>
              )}

              {earQ && (
                <div className="ear-answers">
                  {EAR_POOLS[earPoolName].map((iv) => {
                    let cls = "";
                    if (earPicked !== null) {
                      if (iv === earQ.iv) cls = "good";
                      else if (iv === earPicked) cls = "bad";
                      else cls = "off";
                    }
                    return (
                      <button
                        key={iv}
                        className={`ear-ans ${cls}`}
                        onClick={() => answerEar(iv)}
                        disabled={earPicked !== null && iv !== earQ.iv && iv !== earPicked}
                      >
                        <span className="ea-short">{IV_SHORT[iv - 1]}</span>
                        <span className="ea-long">{IV_LONG[iv - 1]}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {earPicked !== null && earQ && (
                <div className={`ear-verdict ${earPicked === earQ.iv ? "yes" : "no"}`}>
                  <div className="ev-head">
                    {earPicked === earQ.iv
                      ? "NAILED IT."
                      : `NOT QUITE — that was a ${IV_LONG[earQ.iv - 1]}.`}
                  </div>
                  {earInput === "guitar" && earPicked !== earQ.iv && (
                    <div className="ev-played">
                      You played a {IV_LONG[earPicked - 1]} — any octave counts, so
                      check the pitch class you landed on.
                    </div>
                  )}
                  <div className="ev-song">
                    Reference (ascending): {EAR_SONGS[earQ.iv]}
                  </div>
                  <button className="play-btn" onClick={nextEarQ}>NEXT INTERVAL →</button>
                </div>
              )}
            </div>

            {Object.keys(earStats).length > 0 && (
              <div className="ear-stats">
                <div className="stats-head">
                  <div className="dia-label">ACCURACY BY INTERVAL — your weak spots reveal themselves</div>
                  <button
                    className="reset-stats"
                    onClick={() => {
                      setEarStats({});
                      setEarScore({ correct: 0, total: 0, streak: 0, best: 0 });
                    }}
                  >
                    RESET STATS
                  </button>
                </div>
                {Object.entries(earStats)
                  .sort((a, b) => Number(a[0]) - Number(b[0]))
                  .map(([iv, s]) => {
                    const pct = Math.round((100 * s.correct) / s.asked);
                    return (
                      <div className="stat-row" key={iv}>
                        <span className="stat-name">
                          {IV_SHORT[iv - 1]} · {IV_LONG[iv - 1]}
                        </span>
                        <span className="stat-bar">
                          <span className="stat-fill" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="stat-pct">
                          {pct}% <em>({s.correct}/{s.asked})</em>
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ============ PROGRESSION BUILDER ============ */}
      {tab === "prog" && (
        <section className="prog-wrap">
          <div className="prog-panel">
            <div className="ear-controls">
              <div className="ctl">
                <label>KEY</label>
                <div className="root-row">
                  {NOTES.map((n, i) => (
                    <button
                      key={n}
                      className={`root-btn ${root === i ? "on" : ""}`}
                      onClick={() => setRoot(i)}
                    >
                      {disp(n, useFlats)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ctl">
                <label>SCALE</label>
                <select
                  value={diatonic ? scaleName : ""}
                  onChange={(e) => setScaleName(e.target.value)}
                >
                  {!diatonic && <option value="">— pick a 7-note scale —</option>}
                  {Object.entries(SCALES)
                    .filter(([, v]) => v && v.length === 7)
                    .map(([name]) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                </select>
              </div>
              <div className="ctl">
                <label>VOICING</label>
                <div className="seg">
                  <button className={!progSeventh ? "on" : ""} onClick={() => setProgSeventh(false)}>TRIADS</button>
                  <button className={progSeventh ? "on" : ""} onClick={() => setProgSeventh(true)}>7THS</button>
                </div>
              </div>
              <div className="ctl">
                <label>TEMPO · {bpm} BPM</label>
                <input
                  type="range" min="60" max="160" value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  className="bpm-slider"
                />
              </div>
            </div>

            {!diatonic ? (
              <p className="tip">
                Progressions need a full seven-note scale to harmonize — pick one
                above and the chord palette appears.
              </p>
            ) : (
              <>
                <div className="dia-label">CHORD PALETTE — tap to audition & add</div>
                <div className="dia-row">
                  {diatonic.map((c, i) => (
                    <button
                      key={i}
                      className={`dia-chip ${c.quality.cls}`}
                      onClick={() => addToProg(i)}
                    >
                      <span className="dia-num">{c.numeral}</span>
                      <span className="dia-name">
                        {progSeventh
                          ? `${disp(c.note, useFlats)}${c.seventh}`
                          : `${disp(c.note, useFlats)}${c.quality.q}`}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="dia-label preset-label">OR START FROM A CLASSIC</div>
                <div className="preset-row">
                  {PROG_PRESETS.map((p) => (
                    <button key={p.name} className="preset-btn" onClick={() => setProg(p.degs)}>
                      <span>{p.name}</span>
                      <em>{p.pattern}</em>
                    </button>
                  ))}
                </div>

                <div className="prog-strip">
                  {prog.length === 0 ? (
                    <span className="prog-empty">Your progression is empty — add chords above.</span>
                  ) : (
                    prog.map((deg, i) => {
                      const c = diatonic[deg];
                      return (
                        <span key={i} className={`prog-slot ${progIdx === i ? "now" : ""}`}>
                          <span className="ps-num">{c.numeral}</span>
                          <span className="ps-name">
                            {progSeventh
                              ? `${disp(c.note, useFlats)}${c.seventh}`
                              : `${disp(c.note, useFlats)}${c.quality.q}`}
                          </span>
                          <button
                            className="ps-x"
                            aria-label="Remove chord"
                            onClick={() => setProg(prog.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>

                <div className="prog-actions">
                  {progPlaying ? (
                    <button className="play-btn" onClick={stopProg}>■ STOP</button>
                  ) : (
                    <button className="ear-big prog-play" onClick={playProg} disabled={prog.length === 0}>
                      ▶ PLAY PROGRESSION
                    </button>
                  )}
                  {prog.length > 0 && !progPlaying && (
                    <>
                      <button className="play-btn" onClick={() => setProg([])}>CLEAR</button>
                      <input
                        className="prog-name-input"
                        placeholder="name it…"
                        value={progName}
                        maxLength={28}
                        onChange={(e) => setProgName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && saveCurrentProg()}
                      />
                      <button
                        className="play-btn"
                        onClick={saveCurrentProg}
                        disabled={!progName.trim()}
                      >
                        ⬇ SAVE
                      </button>
                    </>
                  )}
                </div>

                {savedProgs.length > 0 && (
                  <>
                    <div className="dia-label preset-label">YOUR SAVED PROGRESSIONS</div>
                    <div className="preset-row">
                      {savedProgs.map((p) => (
                        <span key={p.name} className="saved-prog">
                          <button className="preset-btn" onClick={() => loadSavedProg(p)}>
                            <span>{p.name}</span>
                            <em>
                              {disp(NOTES[p.root], useFlats)} · {p.degs.length} chords
                              {p.seventh ? " · 7ths" : ""}
                            </em>
                          </button>
                          <button
                            className="ps-x saved-x"
                            aria-label={`Delete ${p.name}`}
                            onClick={() =>
                              setSavedProgs(savedProgs.filter((s) => s.name !== p.name))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </>
                )}

                <p className="tip prog-tip">
                  Chords ring for two beats each. Switch keys or scales and the same
                  numerals re-spell themselves — that's the whole point of thinking
                  in Roman numerals.
                </p>
              </>
            )}
          </div>
        </section>
      )}

      {/* ============ TUNER ============ */}
      {tab === "tuner" && (
        <section className="tuner-wrap">
          <div className="tuner-panel">
            <div className="ear-controls">
              <div className="ctl">
                <label>TUNING</label>
                <select value={tuningName} onChange={(e) => setTuningName(e.target.value)}>
                  {Object.keys(TUNINGS).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="ctl">
                <label>&nbsp;</label>
                {micOn && micUser === "tuner" ? (
                  <button className="play-btn" onClick={stopMic}>■ STOP MIC</button>
                ) : (
                  <button
                    className="ear-big tuner-start"
                    onClick={() => startMic("tuner", (r) => setPitch(r))}
                  >
                    ● START TUNER
                  </button>
                )}
              </div>
              <div className={`intune-lamp ${pitch && Math.abs(pitch.cents) <= 5 ? "lit" : ""}`}>
                <span className="jewel green" />
                <span className="power-label">IN TUNE</span>
              </div>
            </div>

            {micErr && <p className="tip mic-err">{micErr}</p>}

            {/* VU dial */}
            <div className="vu-wrap">
              <svg viewBox="0 0 320 190" className="vu">
                <rect x="8" y="8" width="304" height="174" rx="8" className="vu-face" />
                {/* in-tune zone */}
                <path
                  d={(() => {
                    const cx = 160, cy = 168, r = 128;
                    const a1 = (-90 - 6) * (Math.PI / 180), a2 = (-90 + 6) * (Math.PI / 180);
                    const x1 = cx + Math.cos(a1) * r, y1 = cy + Math.sin(a1) * r;
                    const x2 = cx + Math.cos(a2) * r, y2 = cy + Math.sin(a2) * r;
                    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
                  })()}
                  className="vu-zone"
                />
                {/* ticks every 10 cents */}
                {[-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50].map((c) => {
                  const ang = (c * 1.2 - 90) * (Math.PI / 180);
                  const cx = 160, cy = 168;
                  const r1 = 118, r2 = c % 50 === 0 || c === 0 ? 100 : 108;
                  return (
                    <g key={c}>
                      <line
                        x1={cx + Math.cos(ang) * r2} y1={cy + Math.sin(ang) * r2}
                        x2={cx + Math.cos(ang) * r1} y2={cy + Math.sin(ang) * r1}
                        className={c === 0 ? "vu-tick zero" : "vu-tick"}
                      />
                      <text
                        x={cx + Math.cos(ang) * 90} y={cy + Math.sin(ang) * 90 + 4}
                        className="vu-num"
                      >
                        {c === 0 ? "0" : Math.abs(c)}
                      </text>
                    </g>
                  );
                })}
                <text x="42" y="172" className="vu-flat">♭</text>
                <text x="270" y="172" className="vu-sharp">♯</text>
                {/* needle */}
                <line
                  x1="160" y1="168"
                  x2={160 + Math.cos(((pitch ? pitch.cents : 0) * 1.2 - 90) * (Math.PI / 180)) * 120}
                  y2={168 + Math.sin(((pitch ? pitch.cents : 0) * 1.2 - 90) * (Math.PI / 180)) * 120}
                  className={`vu-needle ${pitch ? "" : "idle"}`}
                />
                <circle cx="160" cy="168" r="9" className="vu-hub" />
              </svg>

              <div className="tuner-readout">
                <span className="tr-note">
                  {pitch ? disp(pitch.note, useFlats) : "—"}
                  <em>{pitch ? pitch.octave : ""}</em>
                </span>
                <span className="tr-detail">
                  {pitch
                    ? `${pitch.freq.toFixed(1)} Hz · ${pitch.cents > 0 ? "+" : ""}${pitch.cents.toFixed(0)} cents`
                    : micOn && micUser === "tuner"
                    ? "listening… pluck a string"
                    : "mic is off"}
                </span>
              </div>
            </div>

            {/* open string targets */}
            <div className="dia-label">OPEN STRING TARGETS — {tuningName}</div>
            <div className="target-row">
              {tuning.map((m, i) => {
                const isNear =
                  pitch && Math.abs(pitch.midi - m) < 2 &&
                  (tuning.findIndex((x) => Math.abs(pitch.midi - x) < 2) === i);
                return (
                  <button
                    key={i}
                    className={`target-chip ${isNear ? "near" : ""}`}
                    onClick={() => pluck(midiFreq(m), 0, 0.3)}
                    title="Click to hear the reference pitch"
                  >
                    <span className="tc-str">STR {6 - i}</span>
                    <span className="tc-note">
                      {disp(NOTES[m % 12], useFlats)}
                      <em>{Math.floor(m / 12) - 1}</em>
                    </span>
                    <span className="tc-hz">{midiFreq(m).toFixed(1)} Hz</span>
                    {isNear && pitch && (
                      <span className="tc-hint">
                        {Math.abs(pitch.cents) <= 5
                          ? "✓ in tune"
                          : pitch.cents < 0
                          ? "▲ tune up"
                          : "▼ tune down"}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <p className="tip">
              Works best plugged into a quiet room — pluck one string at a time and
              let it ring. Click any target chip to hear the reference pitch. The
              needle steadies as the note sustains; chase the amber zone.
            </p>
          </div>
        </section>
      )}

      <footer className="foot">
        HAND-WIRED IN THE THEORY DEPARTMENT · NO TRANSISTORS WERE HARMED
      </footer>
    </div>
  );
}

/* ============================================================ CSS */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Yellowtail&family=JetBrains+Mono:wght@400;600;700&display=swap');

.fl-root {
  --tolex: #17130f;
  --tolex-2: #201a14;
  --panel: #2a231b;
  --cream: #e9dcc2;
  --cream-dim: #a89a7e;
  --amber: #ffb454;
  --amber-deep: #e08e2b;
  --grill: #3a2f24;
  --line: #453a2c;
  min-height: 100vh;
  background:
    radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,180,84,0.07), transparent 60%),
    repeating-linear-gradient(45deg, var(--tolex) 0px, var(--tolex) 3px, var(--tolex-2) 3px, var(--tolex-2) 6px);
  color: var(--cream);
  font-family: 'Oswald', sans-serif;
  padding: 0 0 40px;
}
.fl-root * { box-sizing: border-box; }
.fl-root button { font-family: inherit; cursor: pointer; }
.fl-root button:focus-visible, .fl-root select:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }

/* ---------- faceplate ---------- */
.faceplate {
  display: flex; align-items: center; gap: 24px; flex-wrap: wrap;
  padding: 18px 28px;
  background: linear-gradient(180deg, #38302563, #241e16), linear-gradient(180deg, #332a1f, #221c14);
  border-bottom: 3px solid #0d0a07;
  box-shadow: 0 2px 0 rgba(255,220,160,0.06) inset, 0 -6px 20px rgba(0,0,0,0.5) inset;
}
.logo-script {
  font-family: 'Yellowtail', cursive;
  font-size: 44px; line-height: 1;
  color: var(--cream);
  text-shadow: 0 0 18px rgba(255,180,84,0.35), 0 2px 0 rgba(0,0,0,0.6);
}
.logo-sub {
  font-size: 10px; letter-spacing: 3px; color: var(--cream-dim); margin-top: 2px;
}
.fp-tabs { display: flex; gap: 8px; flex: 1; flex-wrap: wrap; }
.fp-tab {
  background: linear-gradient(180deg, #322a20, #1d1710);
  color: var(--cream-dim);
  border: 1px solid #0d0a07;
  border-radius: 4px;
  padding: 10px 18px;
  font-size: 12px; letter-spacing: 2px; font-weight: 600;
  box-shadow: 0 1px 0 rgba(255,220,160,0.08) inset;
  transition: all .15s;
}
.fp-tab.on {
  color: #1a1207;
  background: linear-gradient(180deg, var(--amber), var(--amber-deep));
  box-shadow: 0 0 16px rgba(255,180,84,0.45), 0 1px 0 rgba(255,255,255,0.4) inset;
}
.power { display:flex; flex-direction:column; align-items:center; gap:4px; background:none; border:none; }
.jewel {
  width: 22px; height: 22px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #6b1f1f, #2a0808);
  border: 3px solid #0d0a07;
  box-shadow: 0 1px 0 rgba(255,255,255,0.1);
  transition: all .2s;
}
.power.lit .jewel {
  background: radial-gradient(circle at 35% 30%, #ff9a5c, #c1330f);
  box-shadow: 0 0 18px rgba(255,110,50,0.8), 0 0 40px rgba(255,110,50,0.35);
}
.power-label { font-size: 9px; letter-spacing: 2px; color: var(--cream-dim); }

/* ---------- sync ---------- */
.sync-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; background: none; border: none; }
.sync-dot {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid #0d0a07;
  background: radial-gradient(circle at 35% 30%, #5a5245, #2a251d);
  transition: all .2s;
}
.sync-btn.s-synced .sync-dot {
  background: radial-gradient(circle at 35% 30%, #a8e8a0, #3fa03a);
  box-shadow: 0 0 12px rgba(110,220,100,0.7);
}
.sync-btn.s-saving .sync-dot {
  background: radial-gradient(circle at 35% 30%, #ffd08a, var(--amber-deep));
  box-shadow: 0 0 12px rgba(255,180,84,0.7);
}
.sync-btn.s-error .sync-dot {
  background: radial-gradient(circle at 35% 30%, #ff9a8a, #b03a2a);
  box-shadow: 0 0 12px rgba(220,90,70,0.7);
}
.sync-panel {
  max-width: 1180px; margin: 14px auto 0; padding: 14px 20px;
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
  display: flex; flex-direction: column; gap: 12px;
}
.sync-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
.sync-info { font-family: Georgia, serif; font-size: 14px; color: #cbbfa6; flex: 1 1 320px; }
.sync-info strong { color: var(--cream); }
.sync-email { width: 220px; }
.backup-row { border-top: 1px solid var(--line); padding-top: 12px; }
.import-label { display: inline-block; cursor: pointer; }
.sync-msg { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: var(--amber); }

/* ---------- control panel ---------- */
.panel {
  display: flex; flex-wrap: wrap; gap: 18px 26px; align-items: flex-end;
  max-width: 1180px; margin: 22px auto 0; padding: 18px 24px;
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px;
  box-shadow: 0 1px 0 rgba(255,220,160,0.06) inset, 0 8px 24px rgba(0,0,0,0.45);
}
.ctl label { display:block; font-size: 10px; letter-spacing: 2.5px; color: var(--cream-dim); margin-bottom: 7px; }
.root-row { display: flex; flex-wrap: wrap; gap: 4px; }
.root-btn {
  width: 38px; height: 34px; border-radius: 4px;
  border: 1px solid #0d0a07;
  background: linear-gradient(180deg, #322a20, #1d1710);
  color: var(--cream-dim); font-size: 13px; font-weight: 600;
}
.root-btn.on {
  background: linear-gradient(180deg, var(--amber), var(--amber-deep));
  color: #1a1207; box-shadow: 0 0 12px rgba(255,180,84,0.5);
}
.fl-root select {
  background: linear-gradient(180deg, #322a20, #1d1710);
  color: var(--cream); border: 1px solid #0d0a07; border-radius: 4px;
  padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 13px; letter-spacing: 0.5px;
  min-width: 190px;
}
.seg { display: inline-flex; border: 1px solid #0d0a07; border-radius: 4px; overflow: hidden; }
.seg button {
  background: linear-gradient(180deg, #322a20, #1d1710);
  color: var(--cream-dim); border: none; padding: 8px 13px;
  font-size: 11px; letter-spacing: 1.5px; font-weight: 600;
  border-right: 1px solid #0d0a07;
}
.seg button:last-child { border-right: none; }
.seg button.on { background: linear-gradient(180deg, var(--amber), var(--amber-deep)); color: #1a1207; }
.play-btn {
  background: linear-gradient(180deg, #4a3b25, #2e2418);
  color: var(--amber); border: 1px solid var(--amber-deep); border-radius: 4px;
  padding: 9px 18px; font-size: 12px; letter-spacing: 2px; font-weight: 600;
  text-shadow: 0 0 8px rgba(255,180,84,0.5);
}
.play-btn:hover { box-shadow: 0 0 14px rgba(255,180,84,0.35); }

/* ---------- fretboard ---------- */
.board-wrap { max-width: 1180px; margin: 18px auto 0; padding: 0 4px; }
.board-scroll { overflow-x: auto; padding-bottom: 6px; }
.board { min-width: 940px; }
.fretnums { display: flex; padding: 0 0 4px; }
.fn {
  flex: 1; text-align: center; font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: var(--cream-dim);
}
.nut-col { flex: 0 0 52px !important; }
.neck {
  position: relative;
  border-radius: 6px;
  background:
    linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.25)),
    repeating-linear-gradient(92deg, #3b2317 0 7px, #472b1c 7px 13px, #341e12 13px 22px);
  border: 2px solid #14100b;
  box-shadow: 0 10px 26px rgba(0,0,0,0.55), 0 1px 0 rgba(255,220,160,0.08) inset;
  padding: 10px 0;
}
.inlay-layer { position: absolute; inset: 0; display: flex; pointer-events: none; }
.inlay-cell { flex: 1; position: relative; border-right: 3px solid; border-image: linear-gradient(180deg,#d8d3c8,#7a7568,#4a463d) 1; }
.inlay-layer .nut-col { border-right: 9px solid #e6dfcd; }
.dot {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: 15px; height: 15px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fdf8ea, #b8ad93);
  box-shadow: 0 1px 2px rgba(0,0,0,0.5) inset;
  opacity: 0.85;
}
.dot.d12a { transform: translate(-50%, -190%); }
.dot.d12b { transform: translate(-50%, 90%); }
.string-row { position: relative; display: flex; height: 34px; align-items: center; }
.string-line {
  position: absolute; left: 0; right: 0; top: 50%;
  background: linear-gradient(180deg, #efe9d8, #8f8672 60%, #4d4739);
  box-shadow: 0 1px 2px rgba(0,0,0,0.7);
  pointer-events: none;
}
.cell {
  flex: 1; height: 100%; position: relative; z-index: 2;
  display: flex; align-items: center; justify-content: center;
}
.cell:hover { background: rgba(255,180,84,0.07); }
.open-cell { background: rgba(0,0,0,0.25); }
.marker {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700;
  background: radial-gradient(circle at 35% 30%, #f7ecd6, #cdbc9a);
  color: #241b0e;
  box-shadow: 0 2px 5px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.4);
}
.marker.root {
  background: radial-gradient(circle at 35% 30%, #ffd08a, var(--amber-deep));
  box-shadow: 0 0 14px rgba(255,180,84,0.8), 0 2px 5px rgba(0,0,0,0.6);
}
.board-hint { text-align: center; font-size: 11px; letter-spacing: 1px; color: var(--cream-dim); margin-top: 8px; }

/* ---------- CAGED ---------- */
.zone-layer { position: absolute; inset: 0; display: flex; pointer-events: none; z-index: 1; }
.zcell { flex: 1; }
.zcell.zon {
  background: linear-gradient(180deg, rgba(255,180,84,0.16), rgba(255,180,84,0.08));
  box-shadow: 0 0 0 1px rgba(255,180,84,0.3) inset, 0 0 18px rgba(255,180,84,0.12) inset;
}
.zcell.zonB {
  background: linear-gradient(180deg, rgba(140,190,220,0.15), rgba(140,190,220,0.07));
  box-shadow: 0 0 0 1px rgba(140,190,220,0.3) inset, 0 0 18px rgba(140,190,220,0.12) inset;
}
.zcell.seam {
  background: linear-gradient(180deg, rgba(232,220,195,0.2), rgba(232,220,195,0.1));
  box-shadow: 0 0 0 1px rgba(255,180,84,0.45) inset, 0 0 0 3px rgba(140,190,220,0.25) inset;
}
.marker.now {
  transform: scale(1.35);
  background: radial-gradient(circle at 35% 30%, #fff3dd, var(--amber));
  box-shadow: 0 0 22px rgba(255,180,84,1), 0 0 40px rgba(255,180,84,0.5);
  transition: transform .1s;
  z-index: 3;
}
.connect-btn {
  display: block; margin-top: 7px;
  background: linear-gradient(180deg, #2c3540, #1c232b);
  color: #a8cbe0; border: 1px solid #45596b; border-radius: 4px;
  padding: 7px 12px; font-size: 10px; letter-spacing: 1.5px; font-weight: 600;
}
.connect-btn.on {
  background: linear-gradient(180deg, #4a6478, #33475a);
  color: #e2f1fb; box-shadow: 0 0 12px rgba(140,190,220,0.35);
}
.run-btn { margin-left: auto; }
.marker.dim { opacity: 0.14; box-shadow: none; }
.seg button:disabled { opacity: 0.35; cursor: not-allowed; }
.ctl-note { font-size: 9px; letter-spacing: 1.5px; color: #8a6f4a; margin-top: 5px; }
.caged-line {
  display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: baseline;
  margin: -4px 0 14px; padding: 9px 12px;
  background: rgba(255,180,84,0.06);
  border: 1px solid rgba(255,180,84,0.25); border-radius: 5px;
}
.caged-tag {
  font-size: 12px; font-weight: 700; letter-spacing: 2px; color: var(--amber);
  text-shadow: 0 0 10px rgba(255,180,84,0.4);
}
.caged-frets { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--cream); }
.caged-desc { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: #cbbfa6; }

/* ---------- info ---------- */
.info { max-width: 1180px; margin: 18px auto 0; padding: 0 4px; }
.info-card {
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px; padding: 20px 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.info-head { font-size: 24px; font-weight: 700; letter-spacing: 1px; margin-bottom: 14px; color: var(--amber); text-shadow: 0 0 14px rgba(255,180,84,0.3); }
.chip-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.chip-label { font-size: 10px; letter-spacing: 2.5px; color: var(--cream-dim); margin-right: 6px; }
.chip {
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 4px;
  color: var(--cream); padding: 6px 12px;
  font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700;
}
.chip em { font-style: normal; font-size: 10px; color: var(--cream-dim); }
.chip.root { border-color: var(--amber-deep); color: var(--amber); box-shadow: 0 0 10px rgba(255,180,84,0.25); }
.step {
  font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
  color: var(--cream-dim); background: rgba(0,0,0,0.3); border-radius: 3px; padding: 4px 9px;
}
.tip { font-family: Georgia, serif; font-size: 15px; line-height: 1.55; color: #cbbfa6; font-style: italic; margin: 10px 0 4px; max-width: 720px; }

/* ---------- mode lens ---------- */
.marker.char {
  box-shadow: 0 0 0 2px #8cbedc, 0 0 16px rgba(140,190,220,0.75), 0 2px 5px rgba(0,0,0,0.6);
}
.chip.char-chip { border-color: #8cbedc; box-shadow: 0 0 10px rgba(140,190,220,0.3); }
.chip.char-chip em { color: #a8cbe0; }
.mode-lens {
  margin-top: 16px; padding: 14px 16px;
  background: rgba(140,190,220,0.05);
  border: 1px solid rgba(140,190,220,0.28); border-radius: 6px;
}
.lens-title { color: #a8cbe0; }
.lens-row { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: 10px; }
.lens-fact { font-family: Georgia, serif; font-size: 14px; line-height: 1.5; color: #cbbfa6; flex: 1 1 300px; }
.lens-fact strong { color: var(--cream); font-family: 'Oswald', sans-serif; letter-spacing: 0.5px; }
.lens-fact .char-text { color: #a8cbe0; text-shadow: 0 0 10px rgba(140,190,220,0.4); }
.lens-btn {
  background: linear-gradient(180deg, #2c3540, #1c232b);
  color: #a8cbe0; border: 1px solid #45596b; border-radius: 4px;
  padding: 7px 14px; font-size: 11px; letter-spacing: 1.5px; font-weight: 600;
}
.lens-btn:hover { box-shadow: 0 0 12px rgba(140,190,220,0.3); }
.lens-strip { margin-top: 10px; }
.lens-strip .chip-label { display: block; margin-bottom: 7px; }
.lens-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lens-chip {
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 4px;
  color: var(--cream-dim); padding: 6px 11px;
  font-size: 11px; letter-spacing: 1px; font-weight: 600;
}
.lens-chip:hover { border-color: #45596b; color: var(--cream); }
.lens-chip.on {
  background: linear-gradient(180deg, #4a6478, #33475a);
  color: #e2f1fb; border-color: #45596b;
  box-shadow: 0 0 10px rgba(140,190,220,0.35);
}

.diatonic { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
.dia-label { font-size: 10px; letter-spacing: 2.5px; color: var(--cream-dim); margin-bottom: 10px; }
.dia-row { display: flex; flex-wrap: wrap; gap: 8px; }
.dia-chip {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 84px; padding: 8px 10px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 5px; color: var(--cream);
  transition: all .15s;
}
.dia-chip:hover { border-color: var(--amber-deep); box-shadow: 0 0 12px rgba(255,180,84,0.25); }
.dia-num { font-size: 15px; font-weight: 700; color: var(--amber); }
.dia-chip.min .dia-num { color: #b7cfd8; }
.dia-chip.dim .dia-num { color: #c78f8f; }
.dia-name { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; }
.dia-7 { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--cream-dim); }

/* ---------- circle ---------- */
.circle-wrap { max-width: 1180px; margin: 22px auto 0; padding: 0 4px; }
.circle-panel {
  display: flex; flex-wrap: wrap; gap: 28px; align-items: center; justify-content: center;
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px; padding: 26px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.circle-seg { width: 100%; justify-content: center; display: flex; }
.circle-svg-wrap { flex: 0 1 420px; }
.circle-svg { width: 100%; height: auto; }
.c-ring-outer, .c-ring-inner { fill: none; stroke: var(--line); stroke-width: 1; }
.c-hub { fill: #17120c; stroke: var(--line); }
.c-key circle { fill: #1d1710; stroke: #0d0a07; stroke-width: 1.5; cursor: pointer; transition: all .15s; }
.c-key text {
  fill: var(--cream); font-family: 'Oswald', sans-serif; font-size: 16px; font-weight: 600;
  text-anchor: middle; pointer-events: none;
}
.c-key.minor text { font-size: 12px; fill: var(--cream-dim); }
.c-key:hover circle { stroke: var(--amber-deep); }
.c-key.on circle { fill: var(--amber); stroke: var(--amber-deep); filter: drop-shadow(0 0 8px rgba(255,180,84,0.7)); }
.c-key.on text { fill: #1a1207; }
.hub-key { fill: var(--amber); font-family: 'Oswald', sans-serif; font-size: 26px; font-weight: 700; text-anchor: middle; }
.hub-sig { fill: var(--cream-dim); font-family: 'JetBrains Mono', monospace; font-size: 13px; text-anchor: middle; }
.circle-notes { flex: 1 1 300px; max-width: 420px; }
.circle-notes p { font-family: Georgia, serif; font-size: 15px; line-height: 1.6; color: #cbbfa6; }
.circle-notes strong { color: var(--cream); }
.circle-notes .play-btn { margin-top: 8px; }

.foot {
  text-align: center; margin-top: 34px; font-size: 9px; letter-spacing: 3px; color: #6b5f4c;
}

/* ---------- ear trainer ---------- */
.ear-wrap { max-width: 900px; margin: 22px auto 0; padding: 0 4px; }
.ear-panel {
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px; padding: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.ear-controls { display: flex; flex-wrap: wrap; gap: 18px 28px; align-items: flex-end; margin-bottom: 22px; }
.ear-score { display: flex; gap: 10px; margin-left: auto; }
.meter-box {
  display: flex; flex-direction: column; align-items: center; min-width: 62px;
  background: #14100b; border: 1px solid #0d0a07; border-radius: 5px; padding: 7px 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.5) inset;
}
.meter-num {
  font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700;
  color: var(--amber); text-shadow: 0 0 10px rgba(255,180,84,0.5);
}
.meter-lab { font-size: 8px; letter-spacing: 2px; color: var(--cream-dim); margin-top: 2px; }
.ear-stage { text-align: center; padding: 10px 0 4px; }
.ear-big {
  background: linear-gradient(180deg, var(--amber), var(--amber-deep));
  color: #1a1207; border: 1px solid #0d0a07; border-radius: 6px;
  font-size: 16px; font-weight: 700; letter-spacing: 2.5px; padding: 16px 34px;
  box-shadow: 0 0 24px rgba(255,180,84,0.4), 0 1px 0 rgba(255,255,255,0.4) inset;
}
.ear-live { display: flex; gap: 14px; justify-content: center; align-items: center; margin-bottom: 16px; }
.ear-replay {
  background: linear-gradient(180deg, #4a3b25, #2e2418);
  color: var(--amber); border: 1px solid var(--amber-deep); border-radius: 5px;
  padding: 10px 20px; font-size: 13px; letter-spacing: 2px; font-weight: 600;
}
.ear-dir { font-size: 11px; letter-spacing: 3px; color: var(--cream-dim); }
.ear-prompt { font-size: 13px; letter-spacing: 1.5px; color: var(--cream); }
.ear-prompt strong { color: var(--amber); text-shadow: 0 0 10px rgba(255,180,84,0.4); }
.live-pill {
  display: inline-block; margin: 4px auto 12px;
  padding: 6px 16px; border-radius: 20px;
  background: #14100b; border: 1px solid var(--line);
  font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--cream-dim);
}
.live-pill.hot {
  color: var(--amber); border-color: var(--amber-deep);
  box-shadow: 0 0 12px rgba(255,180,84,0.3);
}
.ev-played { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: #cbbfa6; margin-top: 6px; }
.ear-answers {
  display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin: 8px 0 4px;
}
.ear-ans {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 88px; padding: 10px 12px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 5px; color: var(--cream);
  transition: all .15s;
}
.ear-ans:hover:not(:disabled) { border-color: var(--amber-deep); }
.ear-ans:disabled { cursor: default; }
.ear-ans.off { opacity: 0.3; }
.ear-ans.good {
  border-color: #7dc27d; color: #b9e6b9;
  box-shadow: 0 0 14px rgba(125,194,125,0.35);
}
.ear-ans.bad { border-color: #c05b4d; color: #e8a89d; }
.ea-short { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; }
.ea-long { font-size: 10px; letter-spacing: 1px; color: var(--cream-dim); }
.ear-verdict { margin-top: 16px; }
.ev-head { font-size: 18px; font-weight: 700; letter-spacing: 1.5px; }
.ear-verdict.yes .ev-head { color: #a6d8a6; text-shadow: 0 0 12px rgba(125,194,125,0.4); }
.ear-verdict.no .ev-head { color: #df9c8f; }
.ev-song { font-family: Georgia, serif; font-style: italic; font-size: 14px; color: #cbbfa6; margin: 8px 0 14px; }
.ear-stats { margin-top: 24px; border-top: 1px solid var(--line); padding-top: 16px; }
.stat-row { display: flex; align-items: center; gap: 12px; margin-bottom: 7px; }
.stat-name {
  flex: 0 0 190px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--cream);
}
.stat-bar {
  flex: 1; height: 10px; background: #14100b; border-radius: 5px; overflow: hidden;
  border: 1px solid #0d0a07;
}
.stat-fill {
  display: block; height: 100%;
  background: linear-gradient(90deg, var(--amber-deep), var(--amber));
  box-shadow: 0 0 8px rgba(255,180,84,0.5);
  transition: width .3s;
}
.stat-pct { flex: 0 0 88px; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--amber); text-align: right; }
.stat-pct em { font-style: normal; color: var(--cream-dim); }

/* ---------- progression builder ---------- */
.prog-wrap { max-width: 1000px; margin: 22px auto 0; padding: 0 4px; }
.prog-panel {
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px; padding: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.bpm-slider { width: 160px; accent-color: var(--amber); }
.preset-label { margin-top: 18px; }
.preset-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 4px; }
.preset-btn {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 14px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 5px; color: var(--cream);
  font-size: 11px; letter-spacing: 1.5px; font-weight: 600;
}
.preset-btn em { font-style: normal; font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--cream-dim); }
.preset-btn:hover { border-color: var(--amber-deep); }
.prog-strip {
  display: flex; flex-wrap: wrap; gap: 10px; align-items: center;
  min-height: 66px; margin-top: 18px; padding: 12px;
  background: #14100b; border: 1px solid #0d0a07; border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.5) inset;
}
.prog-empty { font-family: Georgia, serif; font-style: italic; font-size: 13px; color: var(--cream-dim); }
.prog-slot {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 1px;
  min-width: 72px; padding: 8px 12px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid var(--line); border-radius: 5px;
  transition: all .12s;
}
.prog-slot.now {
  border-color: var(--amber);
  background: linear-gradient(180deg, #4a3b25, #2e2418);
  box-shadow: 0 0 18px rgba(255,180,84,0.55);
  transform: scale(1.08);
}
.ps-num { font-size: 15px; font-weight: 700; color: var(--amber); }
.ps-name { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--cream); }
.ps-x {
  position: absolute; top: -7px; right: -7px;
  width: 18px; height: 18px; border-radius: 50%;
  background: #1d1710; border: 1px solid var(--line); color: var(--cream-dim);
  font-size: 12px; line-height: 1; padding: 0;
}
.ps-x:hover { color: #e8a89d; border-color: #c05b4d; }
.prog-actions { display: flex; gap: 12px; align-items: center; margin-top: 16px; flex-wrap: wrap; }
.prog-play:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.prog-tip { margin-top: 14px; }
.prog-name-input {
  background: #14100b; border: 1px solid var(--line); border-radius: 4px;
  color: var(--cream); padding: 9px 12px; font-family: 'Oswald', sans-serif;
  font-size: 13px; letter-spacing: 0.5px; width: 150px;
}
.prog-name-input::placeholder { color: #6b5f4c; font-style: italic; }
.prog-name-input:focus { outline: none; border-color: var(--amber-deep); }
.play-btn:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
.saved-prog { position: relative; display: inline-block; }
.saved-x { top: -6px; right: -6px; }
.stats-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.reset-stats {
  background: none; border: 1px solid var(--line); border-radius: 4px;
  color: var(--cream-dim); padding: 4px 10px; font-size: 9px; letter-spacing: 2px;
}
.reset-stats:hover { color: #e8a89d; border-color: #c05b4d; }

/* ---------- tuner ---------- */
.tuner-wrap { max-width: 860px; margin: 22px auto 0; padding: 0 4px; }
.tuner-panel {
  background: linear-gradient(180deg, var(--panel), #211b14);
  border: 1px solid var(--line); border-radius: 8px; padding: 24px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.tuner-start { font-size: 14px; padding: 12px 26px; }
.intune-lamp { display: flex; flex-direction: column; align-items: center; gap: 4px; margin-left: auto; }
.jewel.green { background: radial-gradient(circle at 35% 30%, #2a4a2a, #0d1f0d); }
.intune-lamp.lit .jewel.green {
  background: radial-gradient(circle at 35% 30%, #a8e8a0, #3fa03a);
  box-shadow: 0 0 18px rgba(110,220,100,0.85), 0 0 40px rgba(110,220,100,0.4);
}
.mic-err { color: #df9c8f; }
.vu-wrap { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; justify-content: center; margin: 18px 0 22px; }
.vu { width: 340px; max-width: 100%; }
.vu-face {
  fill: linear-gradient(#f2e8d2, #d9cba8);
  fill: #ede1c5;
  stroke: #0d0a07; stroke-width: 3;
}
.vu-zone { fill: rgba(224,142,43,0.35); }
.vu-tick { stroke: #3a2f20; stroke-width: 2; }
.vu-tick.zero { stroke: var(--amber-deep); stroke-width: 3; }
.vu-num {
  fill: #4a3d2a; font-family: 'JetBrains Mono', monospace; font-size: 10px;
  font-weight: 600; text-anchor: middle;
}
.vu-flat, .vu-sharp { fill: #4a3d2a; font-size: 22px; font-family: Georgia, serif; }
.vu-needle {
  stroke: #1d140a; stroke-width: 3; stroke-linecap: round;
  transition: all .12s ease-out;
}
.vu-needle.idle { opacity: 0.25; }
.vu-hub { fill: #1d140a; stroke: #4a3d2a; stroke-width: 2; }
.tuner-readout { display: flex; flex-direction: column; align-items: center; min-width: 180px; }
.tr-note {
  font-size: 72px; font-weight: 700; line-height: 1; color: var(--amber);
  text-shadow: 0 0 26px rgba(255,180,84,0.5);
}
.tr-note em { font-style: normal; font-size: 30px; color: var(--cream-dim); }
.tr-detail { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--cream-dim); margin-top: 10px; }
.target-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.target-chip {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  min-width: 88px; padding: 9px 12px;
  background: linear-gradient(180deg, #322a20, #1d1710);
  border: 1px solid #0d0a07; border-radius: 5px; color: var(--cream);
  transition: all .15s;
}
.target-chip:hover { border-color: var(--amber-deep); }
.target-chip.near {
  border-color: var(--amber);
  box-shadow: 0 0 16px rgba(255,180,84,0.4);
}
.tc-str { font-size: 8px; letter-spacing: 2px; color: var(--cream-dim); }
.tc-note { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; }
.tc-note em { font-style: normal; font-size: 11px; color: var(--cream-dim); }
.tc-hz { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--cream-dim); }
.tc-hint { font-size: 10px; letter-spacing: 1px; color: var(--amber); font-weight: 600; }
@media (max-width: 720px) {
  .stat-name { flex-basis: 120px; font-size: 10px; }
  .ear-score { margin-left: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .fl-root * { transition: none !important; }
}
@media (max-width: 720px) {
  .faceplate { padding: 14px 16px; gap: 14px; }
  .logo-script { font-size: 34px; }
  .panel { margin: 14px 8px 0; }
}
`;
