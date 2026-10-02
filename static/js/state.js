const listeners = new Map();

export const state = {
  user: null,
  feedMode: "following",
  search: { query: "", tab: "people", result: null },
  notifications: { filter: "all", offset: 0 },
};

export function setState(key, value) {
  state[key] = value;
  for (const callback of listeners.get(key) || []) callback(value, state);
}

export function subscribe(key, callback) {
  const rows = listeners.get(key) || new Set();
  rows.add(callback);
  listeners.set(key, rows);
  return () => rows.delete(callback);
}

export function setUser(user) {
  setState("user", user);
  document.dispatchEvent(new CustomEvent("connect:user", { detail: user }));
}
