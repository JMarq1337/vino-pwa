const readJson = async res => {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
};

const request = async (url, { method = "GET", body, headers } = {}) => {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const data = await readJson(res);
  return { ok: res.ok, status: res.status, data, error: data?.error || (res.ok ? "" : `HTTP ${res.status}`) };
};

export const authApi = {
  bootstrap: () => request("/api/auth-bootstrap"),
  session: () => request("/api/auth-session"),
  login: ({ role, pin }) => request("/api/auth-login", { method: "POST", body: { role, pin } }),
  logout: () => request("/api/auth-logout", { method: "POST", body: {} }),
  setupPin: ({ ownerName, cellarName, nextPin, digits }) => request("/api/auth-pin", {
    method: "POST",
    body: { action: "setup", ownerName, cellarName, nextPin, digits },
  }),
  changePin: ({ currentPin, nextPin, digits }) => request("/api/auth-pin", {
    method: "POST",
    body: { action: "change", currentPin, nextPin, digits },
  }),
};

export const dbApi = {
  call: (action, payload = {}) => request("/api/db", { method: "POST", body: { action, ...payload } }),
};
