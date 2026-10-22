// Thin client for the Express backend + mappers from API shapes to the shapes the UI components use.
const BASE = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/$/, "");
const TOKEN_KEY = "umlando_token";

export const UNAUTHORIZED_EVENT = "umlando:unauthorized";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => (token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = "GET", body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (formData) {
    payload = formData; // the browser sets the multipart boundary itself
  } else if (body) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new Error("Can't reach the server. Check your connection and try again.");
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // An expired/invalid session on an authenticated call → drop it everywhere.
    if (res.status === 401 && token && path !== "/auth/login") {
      setToken(null);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  me: () => request("/auth/me"),
  changePassword: (currentPassword, newPassword) => request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  addResearcher: (body) => request("/users", { method: "POST", body }),
  listTopics: () => request("/topics"),
  createTopic: (body) => request("/topics", { method: "POST", body }),
  addEvidence: (topicId, formData) => request(`/topics/${topicId}/evidence`, { method: "POST", formData }),
};

/* ── API → UI shape ───────────────────────────────────────────────── */
const PAYLOAD_LABELS = { text: "Text / Data Note", url: "URL Reference", image: "Image / Screenshot" };
const isHttpUrl = (v) => typeof v === "string" && /^https?:\/\//i.test(v); // never turn anything else into a link

export function toUiEvidence(e) {
  const { type, label, value } = e.payload;
  let payload;
  if (type === "image") {
    payload = { type, label: label || PAYLOAD_LABELS.image, detail: "Click to open full size", previewUrl: isHttpUrl(value) ? value : null, href: isHttpUrl(value) ? value : null };
  } else if (type === "url") {
    payload = { type, label: PAYLOAD_LABELS.url, detail: value || "", href: isHttpUrl(value) ? value : null };
  } else {
    payload = { type, label: PAYLOAD_LABELS.text, detail: value || "No note attached" };
  }
  return { id: e.id, contributor: e.contributor, categories: e.categories, createdAt: e.createdAt, payload, content: e.description };
}

export function toUiTopic(t) {
  return {
    id: t.id,
    title: t.title,
    location: t.location,
    types: t.types,
    description: t.description,
    createdAt: t.createdAt,
    initiator: t.initiator,
    validationUnits: t.evidence.map(toUiEvidence),
  };
}
