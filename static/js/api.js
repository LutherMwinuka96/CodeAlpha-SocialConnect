const API_ROOT = "/api/v1";
let refreshInFlight = null;

export class ApiError extends Error {
  constructor(message, { status = 0, code = "network_error", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function csrfCookie() {
  const row = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("csrftoken="));
  return row ? decodeURIComponent(row.slice("csrftoken=".length)) : "";
}

async function ensureCsrf() {
  let token = csrfCookie();
  if (!token) {
    try {
      await fetch(`${API_ROOT}/auth/csrf/`, { credentials: "same-origin", headers: { Accept: "application/json" } });
      token = csrfCookie();
    } catch {
      throw new ApiError("You appear to be offline. Check your connection and try again.");
    }
  }
  return token;
}

function payloadError(body, response) {
  const wrapped = body?.error;
  return new ApiError(wrapped?.message || body?.detail || `Request failed (${response.status}).`, {
    status: response.status,
    code: wrapped?.code || body?.code || "request_failed",
    details: wrapped?.details || body,
  });
}

async function decode(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    if (!response.ok) throw new ApiError(`Request failed (${response.status}).`, { status: response.status });
    return await response.text();
  }
  const body = await response.json();
  if (!response.ok) throw payloadError(body, response);
  return body;
}

async function rawRequest(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json");
  const body = options.body;
  if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== "string") {
    headers.set("Content-Type", "application/json");
    options = { ...options, body: JSON.stringify(body) };
  }
  if (body instanceof FormData) headers.delete("Content-Type");
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = await ensureCsrf();
    if (csrf) headers.set("X-CSRFToken", csrf);
  }
  let response;
  try {
    response = await fetch(path.startsWith("http") ? path : `${API_ROOT}${path}`, {
      ...options,
      method,
      headers,
      credentials: "same-origin",
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new ApiError("You appear to be offline. Check your connection and try again.");
  }
  return decode(response);
}

async function refreshAccess() {
  if (!refreshInFlight) {
    refreshInFlight = rawRequest("/auth/token/refresh/", { method: "POST", body: {} })
      .finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

async function request(path, options = {}, retry = true) {
  try {
    return await rawRequest(path, options);
  } catch (error) {
    const method = (options.method || "GET").toUpperCase();
    const canRefresh = error.status === 401 && retry && !path.includes("/auth/login/") && !path.includes("/auth/register/") && !path.includes("/auth/token/refresh/") && !path.includes("/auth/logout/");
    if (canRefresh) {
      try {
        await refreshAccess();
        return await request(path, options, false);
      } catch (refreshError) {
        if (refreshError.status === 401 || refreshError.status === 403) {
          window.dispatchEvent(new CustomEvent("connect:session-expired"));
        }
        throw refreshError;
      }
    }
    if (method === "GET" && !navigator.onLine && error.status === 0) error.message = "You are offline. Reconnect and retry.";
    throw error;
  }
}

export const api = {
  get(path, options = {}) { return request(path, { ...options, method: "GET" }); },
  post(path, body = {}, options = {}) { return request(path, { ...options, method: "POST", body }); },
  patch(path, body = {}, options = {}) { return request(path, { ...options, method: "PATCH", body }); },
  delete(path, options = {}) { return request(path, { ...options, method: "DELETE" }); },
  request,
};
