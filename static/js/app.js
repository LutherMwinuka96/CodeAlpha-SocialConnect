import { initAuth } from "./auth.js";
import { state } from "./state.js";
import { applyTheme, initTheme } from "./theme.js";
import { initFeed } from "./feed.js";
import { initProfile } from "./profile.js";
import { initSearch } from "./search.js";
import { initNotifications } from "./notifications.js";
import { toast } from "./ui.js";

function setActiveNavigation() {
  const page = document.body.dataset.page;
  const selected = page === "feed" ? "home" : page === "saved" ? "saved" : page === "notifications" ? "notifications" : page === "search" ? "search" : page === "profile" || page === "account" ? "profile" : "";
  document.querySelectorAll("[data-nav]").forEach((link) => link.classList.toggle("is-active", link.dataset.nav === selected));
  if (state.user) document.querySelector('[data-nav="profile"]')?.setAttribute("href", `/u/${encodeURIComponent(state.user.username)}/`);
}

async function boot() {
  initTheme();
  await initAuth();
  applyTheme(state.user?.theme || localStorage.getItem("connect-theme") || "system");
  if (!state.user) {
    if (document.body.dataset.page === "feed") initFeed();
    return;
  }
  setActiveNavigation();
  initSearch();
  initFeed();
  await initProfile();
  initNotifications();
  window.addEventListener("offline", () => toast("You’re offline. Some actions may not work.", { kind: "error", timeout: 6000 }));
  window.addEventListener("online", () => toast("You’re back online."));
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
else void boot();
