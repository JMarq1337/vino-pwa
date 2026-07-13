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
  enter: () => request("/api/auth-login", { method: "POST", body: { action: "enter" } }),
  logout: () => request("/api/auth-logout", { method: "POST", body: {} }),
};

export const dbApi = {
  call: (action, payload = {}) => request("/api/db", { method: "POST", body: { action, ...payload } }),
};
