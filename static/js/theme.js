import { api } from "./api.js";

const root = document.documentElement;
const storageKey = "connect-theme";
const preference = window.matchMedia?.("(prefers-color-scheme: dark)");

export function applyTheme(value = "system") {
  const theme = ["light", "dark", "system"].includes(value) ? value : "system";
  root.dataset.theme = theme;
  localStorage.setItem(storageKey, theme);
  const effective = theme === "system" ? (preference?.matches ? "dark" : "light") : theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", effective === "dark" ? "#141621" : "#f5f7fb");
  const button = document.querySelector("[data-theme-toggle]");
  if (button) {
    button.setAttribute("aria-label", effective === "dark" ? "Switch to light theme" : "Switch to dark theme");
    button.title = effective === "dark" ? "Switch to light theme" : "Switch to dark theme";
  }
}

export async function setThemePreference(value, { persist = true } = {}) {
  applyTheme(value);
  if (!persist) return;
  try {
    await api.patch("/users/me/", { theme: value });
  } catch (error) {
    document.dispatchEvent(new CustomEvent("connect:theme-error", { detail: error }));
  }
}

export function initTheme(user = null) {
  const stored = localStorage.getItem(storageKey) || "system";
  const value = user?.theme || stored;
  applyTheme(value);
  document.querySelector("[data-theme-toggle]")?.addEventListener("click", () => {
    const effective = root.dataset.theme === "system" ? (preference?.matches ? "dark" : "light") : root.dataset.theme;
    void setThemePreference(effective === "dark" ? "light" : "dark");
  });
  preference?.addEventListener?.("change", () => {
    if (root.dataset.theme === "system") applyTheme("system");
  });
}
