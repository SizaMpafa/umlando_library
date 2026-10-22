import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Waves, Search, Filter, Plus, X, ChevronDown, ChevronUp, BookOpen, Star, Moon,
  Package, Globe, MapPin, Sparkles, ArrowRight, Link2,
  Image as ImageIcon, FileText, Radio, Compass, MessageSquarePlus,
  Clock3, Upload, LogIn, LogOut, User, UserPlus, KeyRound
} from "lucide-react";
import { api, getToken, setToken, toUiTopic, toUiEvidence, UNAUTHORIZED_EVENT } from "./api";

/* Classical alchemical glyphs for the five elements — swapped in for generic
   icons at your request. Fire/Air = upward triangle (Air adds the bar),
   Water/Earth = downward triangle (Earth adds the bar), Spirit = circled cross. */
function ElementGlyph({ shape, size = 16, style }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", style, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinejoin: "round" };
  if (shape === "fire") return <svg {...common}><polygon points="12,3 21,20 3,20" /></svg>;
  if (shape === "air") return <svg {...common}><polygon points="12,3 21,20 3,20" /><line x1="6.5" y1="14" x2="17.5" y2="14" strokeLinecap="round" /></svg>;
  if (shape === "water") return <svg {...common}><polygon points="12,21 21,4 3,4" /></svg>;
  if (shape === "earth") return <svg {...common}><polygon points="12,21 21,4 3,4" /><line x1="6.5" y1="10" x2="17.5" y2="10" strokeLinecap="round" /></svg>;
  if (shape === "spirit") return <svg {...common}><circle cx="12" cy="12" r="9" /><line x1="12" y1="3" x2="12" y2="21" strokeLinecap="round" /><line x1="3" y1="12" x2="21" y2="12" strokeLinecap="round" /></svg>;
  return null;
}
const GlyphFire = (props) => <ElementGlyph shape="fire" {...props} />;
const GlyphAir = (props) => <ElementGlyph shape="air" {...props} />;
const GlyphWater = (props) => <ElementGlyph shape="water" {...props} />;
const GlyphEarth = (props) => <ElementGlyph shape="earth" {...props} />;
const GlyphSpirit = (props) => <ElementGlyph shape="spirit" {...props} />;

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const COLORS = {
  gold: "#F2B705",
  cyan: "#22D3EE",
  royal: "#4C6BF5",
  crimson: "#E11D5E",
  slate: "#8792A8",
  deep: "#040711",
};
const hexToRgba = (hex, a) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

/* ------------------------------------------------------------------ */
/* African Spiritual Calendar display layer.                           */
/* Postgres stores ordinary UTC timestamps and the API returns them    */
/* as-is; convertToASC() is the ONLY place a date becomes something   */
/* visible. To use your npm package instead, swap this function's body */
/* for the package's own converter — nothing else needs to change.     */
/* ------------------------------------------------------------------ */
const ASC_MONTHS = [
  { sign: "Leo", ruler: "Sun" },
  { sign: "Virgo", ruler: "Mercury" },
  { sign: "Libra", ruler: "Venus" },
  { sign: "Scorpio", ruler: "Pluto/Mars" },
  { sign: "Sagittarius", ruler: "Jupiter" },
  { sign: "Capricorn", ruler: "Saturn" },
  { sign: "Aquarius", ruler: "Saturn" },
  { sign: "Pisces", ruler: "Jupiter" },
  { sign: "Aries", ruler: "Mars" },
  { sign: "Taurus", ruler: "Venus" },
  { sign: "Gemini", ruler: "Mercury" },
  { sign: "Cancer", ruler: "Moon" },
];

// Simulation of @siza_m_official/afri-spirit-calendar-js
const COMMON_MONTH_NAMES = ["August", "September", "October", "November", "December", "January", "February", "March", "April", "May", "June", "July"];

function convertToASC(gregorianTimestamp) {
  const d = new Date(gregorianTimestamp);
  const day = d.getDate();
  const gMonth = d.getMonth() + 1;
  const gYear = d.getFullYear();
  const monthNum = gMonth >= 8 ? gMonth - 7 : gMonth + 5;
  const year = gMonth >= 8 ? gYear + 1 : gYear;
  const meta = ASC_MONTHS[monthNum - 1];
  const monthNumber = String(monthNum).padStart(2, "0");
  const monthName = `${meta.ruler} (${meta.sign})`;
  const commonMonthName = COMMON_MONTH_NAMES[monthNum - 1];
  const polarity = monthNum % 2 === 1 ? "Positive" : "Negative";
  return {
    day,
    monthNumber,
    monthName,
    commonMonthName,
    year,
    formatted: `${day} ${monthName} ${year}`,
    formattedCommon: `${day} ${commonMonthName} ${year}`,
    numeric: `${String(day).padStart(2, "0")}/${monthNumber}/${year}`,
    polarity,
    polaritySign: polarity === "Positive" ? "+" : "−",
    polarityQuality: polarity === "Positive" ? "Projective" : "Receptive",
  };
}

/** Cycles 0..len-1 on a fixed interval — used to rotate any ASC date display through its formats. */
function useCycleIndex(len, intervalMs = 9000) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return tick % len;
}

/* ------------------------------------------------------------------ */
/* Live elemental alignment — INDEPENDENT of the ASC month label above. */
/* The ASC month ("Month 01 · Sun (Leo)") stays a fixed calendar-month  */
/* block, unapologetically, per your call. This section answers a      */
/* different question — "which sign is actually active today?" — using */
/* real cusp dates, so Aug 23 onward correctly reads Virgo/Earth even   */
/* while the month label still says Sun (Leo). Ophiuchus is slotted in */
/* at its commonly-cited Nov 29 – Dec 17 window, which is why Scorpio   */
/* and Sagittarius get compressed around it (noted inline below).      */
/* ------------------------------------------------------------------ */
const ELEMENT_META = {
  Fire: { color: COLORS.gold, icon: GlyphFire },
  Earth: { color: COLORS.crimson, icon: GlyphEarth },
  Air: { color: COLORS.cyan, icon: GlyphAir },
  Water: { color: COLORS.royal, icon: GlyphWater },
  Spirit: { color: "#C77DFF", icon: GlyphSpirit },
};
const ELEMENTS = Object.keys(ELEMENT_META);

// [monthStart, dayStart, monthEnd, dayEnd, sign, element] — month/day only, year-agnostic.
// Standard tropical cusps, with Ophiuchus inserted at its usual Nov 29–Dec 17 slot;
// Scorpio and Sagittarius are compressed to stay contiguous around it.
const SIGN_RANGES = [
  { sign: "Capricorn", element: "Earth", from: [12, 22], to: [1, 19] },
  { sign: "Aquarius", element: "Air", from: [1, 20], to: [2, 18] },
  { sign: "Pisces", element: "Water", from: [2, 19], to: [3, 20] },
  { sign: "Aries", element: "Fire", from: [3, 21], to: [4, 19] },
  { sign: "Taurus", element: "Earth", from: [4, 20], to: [5, 20] },
  { sign: "Gemini", element: "Air", from: [5, 21], to: [6, 20] },
  { sign: "Cancer", element: "Water", from: [6, 21], to: [7, 22] },
  { sign: "Leo", element: "Fire", from: [7, 23], to: [8, 22] },
  { sign: "Virgo", element: "Earth", from: [8, 23], to: [9, 22] },
  { sign: "Libra", element: "Air", from: [9, 23], to: [10, 22] },
  { sign: "Scorpio", element: "Water", from: [10, 23], to: [11, 28] },
  { sign: "Ophiuchus", element: "Spirit", from: [11, 29], to: [12, 17] },
  { sign: "Sagittarius", element: "Fire", from: [12, 18], to: [12, 21] },
];

/** Which sign/element is actually active today, by real (month, day) — not tied to the ASC month label. */
function getActiveSign(d) {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const val = m * 100 + day;
  for (const r of SIGN_RANGES) {
    const from = r.from[0] * 100 + r.from[1];
    const to = r.to[0] * 100 + r.to[1];
    if (from <= to) {
      if (val >= from && val <= to) return r;
    } else {
      // wraps the new year (Capricorn: Dec 22 – Jan 19)
      if (val >= from || val <= to) return r;
    }
  }
  return SIGN_RANGES[0];
}

const CATEGORY_META = {
  "Historical Text Cross-Ref": { icon: BookOpen, color: COLORS.gold },
  "Astronomical/Cosmic Alignment": { icon: Star, color: COLORS.cyan },
  "Material Artifact/Cultural Proof": { icon: Package, color: COLORS.crimson },
  "Independent Participant Dream": { icon: Moon, color: COLORS.royal },
  "Physical Reality Occurrence/News Link": { icon: Globe, color: COLORS.slate },
};
const CATEGORIES = Object.keys(CATEGORY_META);

// Topic-level type tags — what a Root Thread is claiming to be, kept
// deliberately simple (two options, multi-select — a contributor unsure
// which it was, or who wants to log it as both, can pick either amount).
const TOPIC_TYPE_META = {
  Vision: { icon: Moon, color: COLORS.royal },
  Revelation: { icon: Sparkles, color: COLORS.gold },
};
const TOPIC_TYPES = Object.keys(TOPIC_TYPE_META);
function TopicTypeChip({ type, active, onClick, small }) {
  const meta = TOPIC_TYPE_META[type];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border transition-all ${small ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"}`}
      style={{ borderColor: active ? meta.color : "rgba(255,255,255,0.12)", background: active ? hexToRgba(meta.color, 0.14) : "rgba(255,255,255,0.03)", color: active ? meta.color : COLORS.slate, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
    >
      <Icon size={small ? 11 : 13} />
      {type}
    </button>
  );
}

const PAYLOAD_META = {
  url: { icon: Link2, label: "URL Reference" },
  image: { icon: ImageIcon, label: "Image / Screenshot" },
  text: { icon: FileText, label: "Text / Data Note" },
};

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */
function CategoryChip({ cat, active, onClick, small }) {
  const meta = CATEGORY_META[cat];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border transition-all ${small ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"}`}
      style={{ borderColor: active ? meta.color : "rgba(255,255,255,0.12)", background: active ? hexToRgba(meta.color, 0.14) : "rgba(255,255,255,0.03)", color: active ? meta.color : COLORS.slate, fontFamily: "'Inter', sans-serif", fontWeight: 500 }}
    >
      <Icon size={small ? 11 : 13} />
      {cat}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Modal shell                                                         */
/* ------------------------------------------------------------------ */
function Modal({ title, onClose, children, locked }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(2,4,12,0.75)", backdropFilter: "blur(4px)" }} onClick={locked ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ background: "rgba(10,14,30,0.97)", border: `1px solid ${hexToRgba(COLORS.cyan, 0.25)}`, boxShadow: `0 0 40px ${hexToRgba(COLORS.cyan, 0.1)}` }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F3F6FC" }}>{title}</h3>
          {!locked && <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>}
        </div>
        {children}
      </div>
    </div>
  );
}
function FieldLabel({ children }) {
  return <label className="text-[11px] block mb-1" style={{ color: COLORS.slate }}>{children}</label>;
}
const inputStyle = { border: "1px solid rgba(255,255,255,0.14)", color: "#E4EAF5", background: "rgba(255,255,255,0.02)" };

/* ------------------------------------------------------------------ */
/* Account modals — all talk to the real API (see api.js)              */
/* ------------------------------------------------------------------ */
function FormError({ message }) {
  return message ? <p className="text-xs" style={{ color: COLORS.crimson }}>{message}</p> : null;
}

function LoginModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy || !email.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const { token, user } = await api.login(email.trim(), password);
      setToken(token);
      onSuccess(user);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Researcher Log In" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs" style={{ color: COLORS.slate }}>
          Research-team access only — there's no sign-up here. Everyone else can keep browsing threads as a guest.
        </p>
        <div>
          <FieldLabel>Email</FieldLabel>
          <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="you@example.com" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Password</FieldLabel>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="••••••••" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Cancel</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40" style={{ background: hexToRgba(COLORS.cyan, 0.18), color: COLORS.cyan, border: `1px solid ${hexToRgba(COLORS.cyan, 0.5)}` }}>
            <LogIn size={13} /> {busy ? "Logging in…" : "Log In"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** `forced` = first login with an emailed temporary password: can't be dismissed until a new one is set. */
function ChangePasswordModal({ forced, onClose, onDone }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const problem = next.length < 10 ? "New password must be at least 10 characters" : next !== confirm ? "Passwords don't match" : "";

  const submit = async () => {
    if (busy || !current || problem) return;
    setBusy(true);
    setError("");
    try {
      const { user } = await api.changePassword(current, next);
      onDone(user);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Change Password" onClose={onClose} locked={forced}>
      <div className="space-y-3">
        {forced && <p className="text-xs" style={{ color: COLORS.slate }}>You're using a temporary password from your invite email. Choose your own to continue.</p>}
        <div>
          <FieldLabel>{forced ? "Temporary password" : "Current password"}</FieldLabel>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>New password (10+ characters)</FieldLabel>
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Confirm new password</FieldLabel>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <FormError message={error || (next && problem)} />
        <div className="flex justify-end gap-2 pt-1">
          {!forced && <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Cancel</button>}
          <button onClick={submit} disabled={busy || !current || !!problem} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: hexToRgba(COLORS.cyan, 0.18), color: COLORS.cyan, border: `1px solid ${hexToRgba(COLORS.cyan, 0.5)}` }}>
            <KeyRound size={13} /> {busy ? "Saving…" : "Save password"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AddResearcherModal({ onClose }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState(null);

  const canSubmit = fullName.trim().length >= 2 && email.trim().includes("@");

  const submit = async () => {
    if (busy || !canSubmit) return;
    setBusy(true);
    setError("");
    try {
      const { user } = await api.addResearcher({ fullName: fullName.trim(), email: email.trim() });
      setSentTo(user);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Researcher" onClose={onClose}>
      {sentTo ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "#C7D0E0" }}>
            <span style={{ color: COLORS.gold, fontWeight: 600 }}>{sentTo.name}</span> has been added. Their login details were emailed to <span style={{ color: COLORS.cyan }}>{sentTo.email}</span> — they'll set their own password on first login.
          </p>
          <div className="flex justify-end">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Done</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs" style={{ color: COLORS.slate }}>A password is generated automatically and emailed to them. You never see it.</p>
          <div>
            <FieldLabel>Full name</FieldLabel>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Email address</FieldLabel>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="researcher@example.com" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
          </div>
          <FormError message={error} />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Cancel</button>
            <button onClick={submit} disabled={busy || !canSubmit} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: hexToRgba(COLORS.gold, 0.18), color: COLORS.gold, border: `1px solid ${hexToRgba(COLORS.gold, 0.5)}` }}>
              <UserPlus size={13} /> {busy ? "Sending…" : "Add & email credentials"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add Topic modal                                                     */
/* ------------------------------------------------------------------ */
function AddTopicModal({ currentUser, onClose, onSubmit }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [types, setTypes] = useState([]);
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleType = (t) => setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const canSubmit = title.trim() && description.trim() && !busy; // location and type are optional

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({ title: title.trim(), location: location.trim() || null, types, description: description.trim() });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title="Create Root Thread" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs flex items-center gap-1.5" style={{ color: COLORS.slate }}>
          Initiating as <span style={{ color: COLORS.gold, fontWeight: 600 }}>{currentUser.name}</span> · timestamp captured automatically on submit.
        </div>
        <div>
          <FieldLabel>Title</FieldLabel>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Cosmic Alignment of Month 01" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Geolocation (optional)</FieldLabel>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Ekuphumleni, Free State, ZA" className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Type — what are you trying to verify? (optional — pick one, both, or leave blank if unsure)</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_TYPES.map((t) => <TopicTypeChip key={t} type={t} active={types.includes(t)} onClick={() => toggleType(t)} />)}
          </div>
        </div>
        <div>
          <FieldLabel>Context description</FieldLabel>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the revelation being logged... include the original date/context here if relevant." className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle} />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: hexToRgba(COLORS.royal, 0.2), color: "#C9D4FF", border: `1px solid ${hexToRgba(COLORS.royal, 0.55)}` }}>
            <Plus size={13} /> {busy ? "Creating…" : "Create Root Thread"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Add Evidence modal                                                  */
/* ------------------------------------------------------------------ */
function AddEvidenceModal({ topicTitle, currentUser, onClose, onSubmit }) {
  const [cats, setCats] = useState([]);
  const [payloadType, setPayloadType] = useState("text");
  const [payloadValue, setPayloadValue] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggleCat = (c) => setCats((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  const canSubmit =
    content.trim() && cats.length > 0 && !busy &&
    (payloadType !== "image" || imageFile) &&
    (payloadType !== "url" || payloadValue.trim());

  const handleFilePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    // Local preview only — the real file goes to the server as multipart on submit.
    const reader = new FileReader();
    reader.onload = () => setImagePreviewUrl(reader.result);
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!canSubmit) return;
    const fd = new FormData();
    fd.append("categories", JSON.stringify(cats));
    fd.append("payloadType", payloadType);
    if (payloadType !== "image" && payloadValue.trim()) fd.append("payloadValue", payloadValue.trim());
    fd.append("description", content.trim());
    if (payloadType === "image") fd.append("image", imageFile);

    setBusy(true);
    setError("");
    try {
      await onSubmit(fd);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const missing = [
    !cats.length && "at least one category tag",
    !content.trim() && "a description",
    payloadType === "url" && !payloadValue.trim() && "a URL",
    payloadType === "image" && !imageFile && "an image file",
  ].filter(Boolean);

  return (
    <Modal title={`Add Validation Unit — ${topicTitle}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs" style={{ color: COLORS.slate }}>
          Contributing as <span style={{ color: COLORS.gold, fontWeight: 600 }}>{currentUser.name}</span>
        </div>
        <div>
          <FieldLabel>Evidence category tag(s)</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => <CategoryChip key={c} cat={c} active={cats.includes(c)} onClick={() => toggleCat(c)} small />)}
          </div>
        </div>
        <div>
          <FieldLabel>Data payload slot</FieldLabel>
          <div className="flex gap-1.5 mb-2">
            {["text", "url", "image"].map((t) => (
              <button
                key={t}
                onClick={() => setPayloadType(t)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border"
                style={{ borderColor: payloadType === t ? COLORS.cyan : "rgba(255,255,255,0.14)", color: payloadType === t ? COLORS.cyan : COLORS.slate, background: payloadType === t ? hexToRgba(COLORS.cyan, 0.1) : "transparent" }}
              >
                {t === "text" && <FileText size={12} />}
                {t === "url" && <Link2 size={12} />}
                {t === "image" && <ImageIcon size={12} />}
                {PAYLOAD_META[t].label}
              </button>
            ))}
          </div>

          {payloadType === "image" ? (
            <div>
              <label className="flex items-center justify-center gap-2 rounded-lg px-3 py-4 text-xs cursor-pointer" style={{ ...inputStyle, borderStyle: "dashed" }}>
                <Upload size={14} style={{ color: COLORS.cyan }} />
                {imageFile ? "Choose a different image..." : "Click to select an image from your device"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={handleFilePick} />
              </label>
              <p className="text-[10px] mt-1" style={{ color: COLORS.slate }}>JPG, PNG, WebP or GIF · max 5 MB</p>
              {imagePreviewUrl && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={imagePreviewUrl} alt="Selected evidence preview" className="w-16 h-16 rounded-lg object-cover" style={{ border: "1px solid rgba(255,255,255,0.14)" }} />
                  <span className="text-[11px] truncate" style={{ color: COLORS.slate }}>{imageFile.name}</span>
                </div>
              )}
            </div>
          ) : (
            <input
              value={payloadValue}
              onChange={(e) => setPayloadValue(e.target.value)}
              placeholder={payloadType === "url" ? "https://... (paste a reference link)" : "Short label or citation (e.g. Harvard-style reference)"}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={inputStyle}
            />
          )}
        </div>
        <div>
          <FieldLabel>Evidence description</FieldLabel>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={4} placeholder="Describe the correlation, source, or occurrence..." className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none" style={inputStyle} />
        </div>
        {error ? (
          <FormError message={error} />
        ) : (
          !canSubmit && !busy && missing.length > 0 && <p className="text-[11px] text-right" style={{ color: COLORS.crimson }}>Missing: {missing.join(", ")}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: COLORS.slate, border: "1px solid rgba(255,255,255,0.14)" }}>Cancel</button>
          <button onClick={submit} disabled={!canSubmit} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed" style={{ background: hexToRgba(COLORS.gold, 0.18), color: COLORS.gold, border: `1px solid ${hexToRgba(COLORS.gold, 0.5)}` }}>
            <Plus size={13} /> {busy ? "Uploading…" : "Append to Thread"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Validation Unit card                                                */
/* ------------------------------------------------------------------ */
function ValidationUnitCard({ unit }) {
  const PayloadIcon = PAYLOAD_META[unit.payload.type].icon;
  const asc = convertToASC(unit.createdAt);
  const dateStates = [asc.formatted, asc.formattedCommon, asc.numeric];
  const dateLine = dateStates[useCycleIndex(3)];
  const PayloadWrap = unit.payload.href ? "a" : "div";
  const payloadProps = unit.payload.href ? { href: unit.payload.href, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <div className="relative pl-8">
      <div className="absolute left-0 top-2 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: COLORS.deep, border: `2px solid ${hexToRgba(COLORS.cyan, 0.6)}` }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.cyan, boxShadow: `0 0 6px ${COLORS.cyan}` }} />
      </div>
      <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(12,18,36,0.55)", border: "1px solid rgba(103,232,249,0.10)", backdropFilter: "blur(10px)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <span className="text-sm font-semibold text-slate-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{unit.contributor.name}</span>
          <span className="text-[10px] transition-opacity duration-300" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>{dateLine}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {unit.categories.map((c) => <CategoryChip key={c} cat={c} active onClick={() => {}} small />)}
        </div>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "#C7D0E0", fontFamily: "'Inter', sans-serif" }}>{unit.content}</p>
        <PayloadWrap {...payloadProps} className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 transition hover:brightness-125" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.14)" }}>
          {unit.payload.previewUrl ? (
            <img src={unit.payload.previewUrl} alt={unit.payload.label} className="w-9 h-9 rounded object-cover shrink-0" style={{ border: "1px solid rgba(255,255,255,0.14)" }} />
          ) : (
            <PayloadIcon size={14} style={{ color: COLORS.cyan }} />
          )}
          <div className="min-w-0">
            <div className="text-xs font-medium truncate" style={{ color: "#E4EAF5" }}>{unit.payload.label}</div>
            <div className="text-[11px] truncate" style={{ color: COLORS.slate }}>{unit.payload.detail}</div>
          </div>
        </PayloadWrap>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Topic card                                                          */
/* ------------------------------------------------------------------ */
function TopicCard({ topic, expanded, onToggle, activeCats, onOpenEvidenceModal, canEdit }) {
  const visibleUnits = useMemo(() => {
    if (activeCats.length === 0) return topic.validationUnits;
    return topic.validationUnits.filter((u) => u.categories.some((c) => activeCats.includes(c)));
  }, [topic.validationUnits, activeCats]);
  const asc = convertToASC(topic.createdAt);
  const dateStates = [asc.formatted, asc.formattedCommon, asc.numeric];
  const dateLine = dateStates[useCycleIndex(3)];

  return (
    <div className="rounded-2xl mb-6 overflow-hidden" style={{ background: "rgba(9,13,28,0.6)", border: "1px solid rgba(103,232,249,0.14)", backdropFilter: "blur(14px)" }}>
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full" style={{ color: COLORS.royal, background: hexToRgba(COLORS.royal, 0.15), border: `1px solid ${hexToRgba(COLORS.royal, 0.4)}` }}>Root Thread</span>
              {topic.types.length > 0 ? (
                topic.types.map((t) => <TopicTypeChip key={t} type={t} active onClick={() => {}} small />)
              ) : (
                <span className="text-[10px]" style={{ color: COLORS.slate }}>Type unconfirmed</span>
              )}
            </div>
            <h3 className="text-xl sm:text-2xl font-semibold text-slate-50" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{topic.title}</h3>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-xs" style={{ color: COLORS.slate }}>
          <span className="flex items-center gap-1 transition-opacity duration-300"><Clock3 size={12} /> {dateLine}</span>
          {topic.location && <span className="flex items-center gap-1"><MapPin size={12} /> {topic.location}</span>}
        </div>
        <p className="text-sm leading-relaxed mb-4" style={{ color: "#C7D0E0", fontFamily: "'Inter', sans-serif" }}>{topic.description}</p>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs" style={{ color: COLORS.slate }}>Initiated by <span style={{ color: "#E4EAF5" }}>{topic.initiator.name}</span></span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={onToggle} className="flex-1 min-w-[180px] flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#B8C2D9" }}>
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {expanded ? "Collapse Thread" : `View Validation Thread (${visibleUnits.length}/${topic.validationUnits.length})`}
          </button>
          {canEdit && (
            <button onClick={onOpenEvidenceModal} className="flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-sm font-medium" style={{ background: hexToRgba(COLORS.gold, 0.14), border: `1px solid ${hexToRgba(COLORS.gold, 0.4)}`, color: COLORS.gold }}>
              <MessageSquarePlus size={16} /> Add Evidence
            </button>
          )}
        </div>
      </div>
      {expanded && (
        <div className="px-5 pb-5 pt-1 relative" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="absolute left-[34px] top-0 bottom-0 w-px" style={{ background: `linear-gradient(to bottom, ${hexToRgba(COLORS.cyan, 0.5)}, ${hexToRgba(COLORS.cyan, 0.05)})` }} />
          <div className="pt-4">
            {visibleUnits.length === 0 && <p className="text-xs pl-8 mb-4" style={{ color: COLORS.slate }}>No validation units match the active category filters.</p>}
            {visibleUnits.map((u) => <ValidationUnitCard key={u.id} unit={u} />)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* P + P = F widget                                                    */
/* ------------------------------------------------------------------ */
function PPFWidget() {
  const columns = [
    { label: "Research", code: "Past", color: COLORS.gold, icon: BookOpen, items: ["Nothing new under the sun", "Indigenous Spiritual Systems & Ancient Knowledge", "Historical and cultural cross-referencing"] },
    { label: "Revelations", code: "Present", color: COLORS.cyan, icon: Radio, items: ["Visions and revelations received by the current spiritual guider", "Live validation from community witnesses", "Ongoing cross-checking against the research column"] },
    { label: "Unity & Restored Africa", code: "Future", color: COLORS.crimson, icon: Compass, items: ["Spirituality — not foreign religions — as what unites Africans", "Restoration of African indigenous spirituality, restoration of original systems — spiritual systems across generations"] },
  ];
  return (
    <div className="rounded-2xl p-5 mb-6 relative overflow-hidden" style={{ background: "rgba(9,13,28,0.6)", border: "1px solid rgba(103,232,249,0.14)", backdropFilter: "blur(14px)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={16} style={{ color: COLORS.cyan }} />
        <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "#E4EAF5", fontFamily: "'Space Grotesk', sans-serif" }}>P + P = F &nbsp;<span className="normal-case font-normal text-xs" style={{ color: COLORS.slate }}>Convergence Pipeline</span></h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1fr] gap-4 items-stretch">
        {columns.map((col, i) => (
          <React.Fragment key={col.code}>
            <div className="rounded-xl p-4 flex flex-col" style={{ background: hexToRgba(col.color, 0.06), border: `1px solid ${hexToRgba(col.color, 0.3)}` }}>
              <div className="flex items-center gap-2 mb-3">
                <col.icon size={14} style={{ color: col.color }} />
                <span className="text-xs font-semibold tracking-wider" style={{ color: col.color, fontFamily: "'JetBrains Mono', monospace" }}>{col.code} — {col.label}</span>
              </div>
              <ul className="space-y-2">
                {col.items.map((it, idx) => (
                  <li key={idx} className="text-xs leading-snug flex gap-1.5" style={{ color: "#C7D0E0" }}>
                    <span className="mt-1 w-1 h-1 rounded-full shrink-0" style={{ background: col.color }} />{it}
                  </li>
                ))}
              </ul>
            </div>
            {i < columns.length - 1 && <div className="hidden md:flex items-center justify-center"><ArrowRight size={18} style={{ color: COLORS.slate }} className="ppf-arrow" /></div>}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Waterfall backdrop                                                  */
/* ------------------------------------------------------------------ */
function WaterfallBackdrop() {
  const columns = useMemo(() => Array.from({ length: 32 }).map((_, i) => ({ id: i, left: Math.random() * 100, duration: 5 + Math.random() * 8, delay: Math.random() * 8, height: 25 + Math.random() * 35 })), []);
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 20% 0%, ${hexToRgba(COLORS.royal, 0.18)}, transparent 55%), radial-gradient(ellipse at 85% 30%, ${hexToRgba(COLORS.crimson, 0.1)}, transparent 50%), radial-gradient(ellipse at 50% 100%, ${hexToRgba(COLORS.cyan, 0.08)}, transparent 55%)` }} />
      {columns.map((c) => <div key={c.id} className="waterfall-col" style={{ left: `${c.left}%`, height: `${c.height}%`, animationDuration: `${c.duration}s`, animationDelay: `${-c.delay}s` }} />)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Directional alignment to Ekuphumleni Mountain (Clocolan)             */
/*                                                                       */
/* 29°04'31.7"S 27°37'28.3"E → decimal: -29.075472, 27.624528.           */
/* The bearing math below (haversine distance + great-circle initial    */
/* bearing) is exact spherical trigonometry — given two accurate lat/lng */
/* pairs, it cannot be "roughly right," only right. The one variable     */
/* that isn't guaranteed is the ACCURACY OF THE BROWSER'S OWN LOCATION   */
/* READING: GPS on a phone is typically accurate to a few metres, but a  */
/* desktop browser without GPS falls back to WiFi/IP-based positioning,  */
/* which can be off by kilometres. The UI below shows the browser's own  */
/* reported accuracy radius so that's never hidden.                     */
/* ------------------------------------------------------------------ */
const EKUPHUMLENI = { lat: -29.075472, lng: 27.624528, label: "Ekuphumleni Mountain (Clocolan)" };
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function greatCircleBearing(lat1, lng1, lat2, lng2) {
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δφ = toRad(lat2 - lat1), Δλ = toRad(lng2 - lng1);
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const bearingToCompass = (deg) => COMPASS_POINTS[Math.round(deg / 45) % 8];

function AlignmentCompass() {
  const [status, setStatus] = useState("idle"); // idle | loading | granted | denied | unsupported
  const [result, setResult] = useState(null);
  const [errorDetail, setErrorDetail] = useState("");

  const detect = () => {
    if (!navigator.geolocation) { setStatus("unsupported"); return; }
    setStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const bearing = greatCircleBearing(latitude, longitude, EKUPHUMLENI.lat, EKUPHUMLENI.lng);
        const distanceKm = haversineKm(latitude, longitude, EKUPHUMLENI.lat, EKUPHUMLENI.lng);
        setResult({ bearing, distanceKm, accuracy, source: "gps", compass: bearingToCompass(bearing) });
        setStatus("granted");
      },
      (err) => {
        // Surface the browser's own error text rather than a generic message —
        // code 1 (PERMISSION_DENIED) via an iframe permissions-policy block reads
        // very differently from the user actually clicking "Block" on the prompt.
        const codeNames = { 1: "PERMISSION_DENIED", 2: "POSITION_UNAVAILABLE", 3: "TIMEOUT" };
        setErrorDetail(`${codeNames[err.code] || "ERROR"}: ${err.message || "no further detail from the browser"}`);
        setStatus("denied");
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  // Fallback path: a plain network request, not the browser Permissions API —
  // so it isn't subject to the iframe's geolocation permissions-policy block.
  // Much less precise than GPS (city-level, sometimes worse) — labelled as such
  // wherever it's shown, never presented with GPS-level confidence.
  const detectViaIP = async () => {
    setStatus("loading");
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (typeof data.latitude !== "number" || typeof data.longitude !== "number") throw new Error("No coordinates in response");
      const bearing = greatCircleBearing(data.latitude, data.longitude, EKUPHUMLENI.lat, EKUPHUMLENI.lng);
      const distanceKm = haversineKm(data.latitude, data.longitude, EKUPHUMLENI.lat, EKUPHUMLENI.lng);
      setResult({ bearing, distanceKm, source: "ip", place: [data.city, data.country_name].filter(Boolean).join(", "), compass: bearingToCompass(bearing) });
      setStatus("granted");
    } catch (e) {
      setErrorDetail(`IP lookup failed: ${e.message}`);
      setStatus("denied");
    }
  };

  return (
    <div className="rounded-xl p-4 mt-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="text-[10px] uppercase tracking-widest mb-3 text-center" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>Align to Ekuphumleni</div>

      {status === "idle" && (
        <button onClick={detect} className="w-full flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium" style={{ background: hexToRgba(COLORS.cyan, 0.1), border: `1px solid ${hexToRgba(COLORS.cyan, 0.35)}`, color: COLORS.cyan }}>
          <Compass size={13} /> Detect My Location
        </button>
      )}
      {status === "loading" && <p className="text-xs text-center" style={{ color: COLORS.slate }}>Reading device location…</p>}
      {status === "unsupported" && <p className="text-[11px] text-center" style={{ color: COLORS.crimson }}>Geolocation isn't available in this browser/environment.</p>}
      {status === "denied" && (
        <div className="text-center">
          <p className="text-[11px] mb-1" style={{ color: COLORS.crimson }}>Location access denied or unavailable.</p>
          {errorDetail && <p className="text-[9px] mb-2 break-words" style={{ color: hexToRgba(COLORS.crimson, 0.7), fontFamily: "'JetBrains Mono', monospace" }}>{errorDetail}</p>}
          <div className="flex flex-col gap-1.5 items-center">
            <button onClick={detect} className="text-xs px-3 py-1.5 rounded-lg w-full" style={{ color: COLORS.cyan, border: `1px solid ${hexToRgba(COLORS.cyan, 0.35)}` }}>Try GPS again</button>
            <button onClick={detectViaIP} className="text-xs px-3 py-1.5 rounded-lg w-full" style={{ color: COLORS.gold, border: `1px solid ${hexToRgba(COLORS.gold, 0.35)}` }}>Use approximate IP location</button>
          </div>
          <p className="text-[9px] mt-2" style={{ color: hexToRgba(COLORS.slate, 0.6) }}>
            If both keep failing, you're likely inside a sandboxed preview that blocks outbound location and network requests entirely — this section works normally once the page is running on its own (locally or deployed), outside any embedding iframe.
          </p>
        </div>
      )}
      {status === "granted" && result && (
        <div>
          <div className="relative w-24 h-24 mx-auto mb-2">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
              <text x="50" y="11" textAnchor="middle" fontSize="8" fill={COLORS.slate}>N</text>
              <text x="92" y="53" textAnchor="middle" fontSize="8" fill={COLORS.slate}>E</text>
              <text x="50" y="97" textAnchor="middle" fontSize="8" fill={COLORS.slate}>S</text>
              <text x="8" y="53" textAnchor="middle" fontSize="8" fill={COLORS.slate}>W</text>
              <g style={{ transform: `rotate(${result.bearing}deg)`, transformOrigin: "50px 50px", transition: "transform 0.6s ease" }}>
                <line x1="50" y1="50" x2="50" y2="16" stroke={COLORS.gold} strokeWidth="3" strokeLinecap="round" />
                <polygon points="50,8 44,20 56,20" fill={COLORS.gold} />
              </g>
              <circle cx="50" cy="50" r="3" fill={COLORS.gold} />
            </svg>
          </div>
          <div className="text-center">
            <div className="text-base font-semibold" style={{ color: "#F3F6FC", fontFamily: "'Space Grotesk', sans-serif" }}>Face {result.compass}</div>
            <div className="text-[10px] mt-0.5" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>
              {Math.round(result.bearing)}° bearing · {result.distanceKm.toFixed(0)} km to {EKUPHUMLENI.label}
            </div>
            {result.source === "gps" ? (
              <div className="text-[9px] mt-1" style={{ color: hexToRgba(COLORS.slate, 0.7) }}>
                Device GPS accuracy: ±{Math.round(result.accuracy)}m
              </div>
            ) : (
              <div className="text-[9px] mt-1" style={{ color: hexToRgba(COLORS.gold, 0.8) }}>
                Approximate — via IP{result.place ? ` (${result.place})` : ""}, not GPS. Can be off by many km.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar — live ASC clock + zodiac-driven elemental alignment         */
/* ------------------------------------------------------------------ */
function Sidebar({ now }) {
  const asc = convertToASC(now.toISOString());
  const activeSign = getActiveSign(now);
  const activeElement = ELEMENT_META[activeSign.element];

  // Two independent 9-second cycles: the top line alternates between the
  // planetary/zodiac name and the plain month name; the polarity readout
  // steps through word → sign → quality. Both tick off the same 9s clock,
  // just with different cycle lengths (2 states vs 3), so they naturally
  // fall in and out of sync with each other.
  const [cycleTick, setCycleTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setCycleTick((t) => t + 1), 9000);
    return () => clearInterval(id);
  }, []);
  const topLine = cycleTick % 2 === 0 ? asc.formatted : asc.formattedCommon;
  const polarityStates = [`${asc.polarity} Polarity`, asc.polaritySign, asc.polarityQuality];
  const polarityLine = polarityStates[cycleTick % 3];
  const isSignState = cycleTick % 3 === 1;
  const signColor = asc.polarity === "Positive" ? COLORS.crimson : COLORS.cyan; // Sun/positive → red-toned fire, Moon/negative → light blue water

  return (
    <aside className="lg:sticky lg:top-6 h-fit rounded-2xl p-5" style={{ background: "rgba(9,13,28,0.65)", border: "1px solid rgba(103,232,249,0.14)", backdropFilter: "blur(14px)" }}>
      <div className="flex items-center gap-2 mb-5">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: hexToRgba(COLORS.cyan, 0.12), border: `1px solid ${hexToRgba(COLORS.cyan, 0.4)}` }}>
          <Waves size={16} style={{ color: COLORS.cyan }} />
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#F3F6FC" }}>Umlando Library</div>
          <div className="text-[10px]" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>Verification Matrix</div>
        </div>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: hexToRgba(COLORS.gold, 0.07), border: `1px solid ${hexToRgba(COLORS.gold, 0.28)}` }}>
        <div className="text-[10px] uppercase tracking-widest mb-1.5" style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>Live Alignment</div>
        <div className="text-base font-semibold leading-snug transition-opacity duration-300" style={{ color: "#F3F6FC", fontFamily: "'Space Grotesk', sans-serif" }}>{topLine}</div>
        <div className="text-xs mt-0.5 transition-all duration-300" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>
          {asc.numeric} ·{" "}
          <span style={isSignState ? { color: signColor, fontWeight: 800, fontSize: "1.05rem", textShadow: `0 0 8px ${hexToRgba(signColor, 0.6)}` } : undefined}>
            {polarityLine}
          </span>
        </div>
      </div>

      <div className="rounded-xl p-4 mb-4" style={{ background: hexToRgba(activeElement.color, 0.07), border: `1px solid ${hexToRgba(activeElement.color, 0.3)}` }}>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] uppercase tracking-widest" style={{ color: COLORS.slate, fontFamily: "'JetBrains Mono', monospace" }}>Elemental Alignment</span>
          <span className="text-[10px]" style={{ color: activeElement.color, fontFamily: "'JetBrains Mono', monospace" }}>{activeSign.sign}</span>
        </div>
        <div className="flex items-center justify-between gap-1.5">
          {ELEMENTS.map((el) => {
            const meta = ELEMENT_META[el];
            const active = el === activeSign.element;
            return (
              <div key={el} className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg transition-all" style={{ background: active ? hexToRgba(meta.color, 0.16) : "transparent", border: active ? `1px solid ${hexToRgba(meta.color, 0.5)}` : "1px solid transparent" }}>
                <meta.icon size={active ? 16 : 13} style={{ color: active ? meta.color : COLORS.slate, filter: active ? `drop-shadow(0 0 4px ${hexToRgba(meta.color, 0.8)})` : "none" }} />
                <span className="text-[8px]" style={{ color: active ? meta.color : COLORS.slate, fontWeight: active ? 600 : 400 }}>{el}</span>
              </div>
            );
          })}
        </div>
        <div className="text-[10px] mt-2.5 text-center" style={{ color: COLORS.slate }}>
          Computed from today's real cusp date — independent of the month label above.
        </div>
      </div>

      <AlignmentCompass />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Root component                                                      */
/* ------------------------------------------------------------------ */
export default function VerificationMatrix() {
  const [topics, setTopics] = useState([]);
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error
  const [loadError, setLoadError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [query, setQuery] = useState("");
  const [activeCats, setActiveCats] = useState([]);
  const [activeTypes, setActiveTypes] = useState([]);
  const [addTopicOpen, setAddTopicOpen] = useState(false);
  const [evidenceModalFor, setEvidenceModalFor] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [currentUser, setCurrentUser] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [addResearcherOpen, setAddResearcherOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadTopics = useCallback(async () => {
    setLoadState("loading");
    try {
      const { topics: rows } = await api.listTopics();
      setTopics(rows.map(toUiTopic));
      setLoadState("ready");
    } catch (e) {
      setLoadError(e.message);
      setLoadState("error");
    }
  }, []);
  useEffect(() => { loadTopics(); }, [loadTopics]);

  // Restore the session from a saved token, and drop it if any request later reports it expired.
  useEffect(() => {
    if (getToken()) api.me().then(({ user }) => setCurrentUser(user)).catch(() => {});
    const onUnauthorized = () => setCurrentUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  // Emailed temporary password → must choose their own before doing anything else.
  useEffect(() => {
    if (currentUser?.mustChangePassword) setPasswordModalOpen(true);
  }, [currentUser]);

  const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));
  const toggleCat = (c) => setActiveCats((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const toggleType = (t) => setActiveTypes((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));

  const logout = () => { setToken(null); setCurrentUser(null); };

  const addTopic = async (input) => {
    const { topic } = await api.createTopic(input);
    const ui = toUiTopic(topic);
    setTopics((prev) => [ui, ...prev]);
    setExpanded((p) => ({ ...p, [ui.id]: true }));
    setAddTopicOpen(false);
  };

  const addUnit = async (topicId, formData) => {
    const { evidence } = await api.addEvidence(topicId, formData);
    setTopics((prev) => prev.map((t) => (t.id === topicId ? { ...t, validationUnits: [...t.validationUnits, toUiEvidence(evidence)] } : t)));
    setEvidenceModalFor(null);
  };

  const filteredTopics = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics.filter((t) => {
      const matchesQuery = !q || t.title.toLowerCase().includes(q) || (t.location || "").toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
      const matchesCats = activeCats.length === 0 || t.validationUnits.some((u) => u.categories.some((c) => activeCats.includes(c)));
      const matchesTypes = activeTypes.length === 0 || t.types.some((ty) => activeTypes.includes(ty));
      return matchesQuery && matchesCats && matchesTypes;
    });
  }, [topics, query, activeCats, activeTypes]);

  const evidenceModalTopic = topics.find((t) => t.id === evidenceModalFor);
  const ghostBtn = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: "#B8C2D9" };

  return (
    <div className="min-h-screen w-full relative" style={{ background: COLORS.deep, fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        @keyframes fall { from { transform: translateY(-30%); opacity: 0; } 10% { opacity: 0.5; } 90% { opacity: 0.5; } to { transform: translateY(400%); opacity: 0; } }
        .waterfall-col { position: absolute; top: 0; width: 1px; background: linear-gradient(to bottom, transparent, ${COLORS.cyan} 30%, ${COLORS.royal} 70%, transparent); animation-name: fall; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes pulseDot { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        .live-dot { animation: pulseDot 1.6s ease-in-out infinite; }
        @keyframes arrowFlow { 0%, 100% { transform: translateX(0); opacity: 0.6; } 50% { transform: translateX(4px); opacity: 1; } }
        .ppf-arrow { animation: arrowFlow 1.8s ease-in-out infinite; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${hexToRgba(COLORS.royal, 0.4)}; border-radius: 4px; }
      `}</style>

      <WaterfallBackdrop />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6" style={{ zIndex: 1 }}>
        <Sidebar now={now} />

        <div>
          <div className="rounded-2xl p-5 mb-6 flex flex-wrap items-center gap-3" style={{ background: "rgba(9,13,28,0.65)", border: "1px solid rgba(103,232,249,0.14)", backdropFilter: "blur(14px)" }}>
            <div className="relative flex-1 min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.slate }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search topics, location, description..." className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-transparent outline-none" style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#E4EAF5" }} />
            </div>
            {currentUser && (
              <>
                <button onClick={() => setAddTopicOpen(true)} className="shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold" style={{ background: hexToRgba(COLORS.royal, 0.22), border: `1px solid ${hexToRgba(COLORS.royal, 0.55)}`, color: "#D6DEFF" }}>
                  <Plus size={16} /> Add New Research Topic
                </button>
                <button onClick={() => setAddResearcherOpen(true)} className="shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium" style={ghostBtn}>
                  <UserPlus size={15} /> Add Researcher
                </button>
              </>
            )}
            {currentUser ? (
              <div className="shrink-0 flex items-center gap-1 rounded-xl pl-3 pr-1.5 py-1.5" style={{ background: hexToRgba(COLORS.gold, 0.1), border: `1px solid ${hexToRgba(COLORS.gold, 0.35)}` }}>
                <User size={13} style={{ color: COLORS.gold }} />
                <span className="text-xs font-medium mr-1" style={{ color: "#F3F6FC" }}>{currentUser.name}</span>
                <button onClick={() => setPasswordModalOpen(true)} title="Change password" className="p-1.5 rounded-lg" style={{ color: COLORS.slate }}><KeyRound size={13} /></button>
                <button onClick={logout} title="Log out" className="p-1.5 rounded-lg" style={{ color: COLORS.slate }}><LogOut size={13} /></button>
              </div>
            ) : (
              <button onClick={() => setLoginOpen(true)} className="shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium" style={ghostBtn}>
                <LogIn size={15} /> Log In
              </button>
            )}
          </div>

          <PPFWidget />

          <div className="rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-2" style={{ background: "rgba(9,13,28,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1.5 mr-1 text-xs font-medium shrink-0" style={{ color: COLORS.slate }}><Filter size={13} /> Filter Topics by Type:</div>
            {TOPIC_TYPES.map((t) => <TopicTypeChip key={t} type={t} active={activeTypes.includes(t)} onClick={() => toggleType(t)} />)}
            {activeTypes.length > 0 && (
              <button onClick={() => setActiveTypes([])} className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ color: COLORS.crimson, border: `1px solid ${hexToRgba(COLORS.crimson, 0.4)}` }}><X size={12} /> Clear</button>
            )}
          </div>

          <div className="rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-2" style={{ background: "rgba(9,13,28,0.5)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-1.5 mr-1 text-xs font-medium shrink-0" style={{ color: COLORS.slate }}><Filter size={13} /> Filter Evidence by Category:</div>
            {CATEGORIES.map((c) => <CategoryChip key={c} cat={c} active={activeCats.includes(c)} onClick={() => toggleCat(c)} />)}
            {activeCats.length > 0 && (
              <button onClick={() => setActiveCats([])} className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" style={{ color: COLORS.crimson, border: `1px solid ${hexToRgba(COLORS.crimson, 0.4)}` }}><X size={12} /> Clear</button>
            )}
          </div>

          {loadState === "loading" && (
            <div className="text-center py-16 text-sm" style={{ color: COLORS.slate }}>Loading threads… (if the server was idle this can take up to a minute)</div>
          )}
          {loadState === "error" && (
            <div className="text-center py-16">
              <p className="text-sm mb-3" style={{ color: COLORS.crimson }}>Couldn't load threads: {loadError}</p>
              <button onClick={loadTopics} className="px-4 py-2 rounded-xl text-sm" style={{ color: COLORS.cyan, border: `1px solid ${hexToRgba(COLORS.cyan, 0.4)}` }}>Try again</button>
            </div>
          )}
          {loadState === "ready" && topics.length === 0 && (
            <div className="text-center py-16 text-sm" style={{ color: COLORS.slate }}>
              No threads yet.{currentUser ? " Use “Add New Research Topic” to start the first one." : ""}
            </div>
          )}
          {loadState === "ready" && topics.length > 0 && filteredTopics.length === 0 && (
            <div className="text-center py-16" style={{ color: COLORS.slate }}>No topics match your current search or filters.</div>
          )}
          {loadState === "ready" &&
            filteredTopics.map((topic) => (
              <TopicCard key={topic.id} topic={topic} expanded={!!expanded[topic.id]} onToggle={() => toggleExpand(topic.id)} activeCats={activeCats} onOpenEvidenceModal={() => setEvidenceModalFor(topic.id)} canEdit={!!currentUser} />
            ))}

          <div className="text-center pt-4 pb-8 text-[11px]" style={{ color: hexToRgba(COLORS.slate, 0.7), fontFamily: "'JetBrains Mono', monospace" }}>
            Umlando Library — decentralized cross-verification, not a claim of proof. Every card is a submitted, reviewable interpretation. This platform uses the African Spiritual Calendar.
          </div>
        </div>
      </div>

      {addTopicOpen && currentUser && <AddTopicModal currentUser={currentUser} onClose={() => setAddTopicOpen(false)} onSubmit={addTopic} />}
      {evidenceModalTopic && currentUser && <AddEvidenceModal topicTitle={evidenceModalTopic.title} currentUser={currentUser} onClose={() => setEvidenceModalFor(null)} onSubmit={(fd) => addUnit(evidenceModalTopic.id, fd)} />}
      {loginOpen && <LoginModal onClose={() => setLoginOpen(false)} onSuccess={(user) => { setCurrentUser(user); setLoginOpen(false); }} />}
      {addResearcherOpen && currentUser && <AddResearcherModal onClose={() => setAddResearcherOpen(false)} />}
      {passwordModalOpen && currentUser && (
        <ChangePasswordModal
          forced={currentUser.mustChangePassword}
          onClose={() => setPasswordModalOpen(false)}
          onDone={(user) => { setCurrentUser(user); setPasswordModalOpen(false); }}
        />
      )}
    </div>
  );
}
