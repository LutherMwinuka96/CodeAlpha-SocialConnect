import { api } from "./api.js";
import { node, renderNotification, toast } from "./ui.js";

const LIMIT = 30;
let notificationRows = [];
let notificationOffset = 0;
let notificationHasMore = true;
let notificationBusy = false;
let notificationFilter = "all";
let unreadTimer = null;
const notificationCache = new Map();

function renderBadge(count) {
  const safeCount = Number(count) || 0;
  document.querySelectorAll("[data-unread-badge]").forEach((badge) => { badge.hidden = safeCount === 0; badge.setAttribute("aria-label", `${safeCount} unread notifications`); });
  document.querySelectorAll("[data-unread-count]").forEach((badge) => { badge.textContent = safeCount > 99 ? "99+" : String(safeCount); badge.hidden = safeCount === 0; });
  document.querySelectorAll("[data-mobile-unread]").forEach((badge) => { badge.hidden = safeCount === 0; });
}

async function refreshUnread() {
  try {
    const data = await api.get("/notifications/unread_count/");
    renderBadge(data.count);
    const dropdown = document.querySelector("[data-notification-dropdown]");
    const preview = dropdown?.querySelector("[data-notification-preview]");
    if (preview) {
      const rows = await api.get("/notifications/?limit=5&offset=0");
      preview.replaceChildren();
      if (rows.results?.length) for (const item of rows.results) { notificationCache.set(String(item.id), item); preview.append(renderNotification(item)); }
      else preview.append(node("p", { className: "notification-preview-empty", text: "You’re all caught up." }));
    }
  } catch { /* Badge remains at its last known value during network outages. */ }
}

function visibleNotifications() {
  return notificationRows.filter((item) => notificationFilter === "all" || !item.is_read);
}

function drawNotifications({ append = false } = {}) {
  const list = document.querySelector("[data-notification-list]");
  const empty = document.querySelector("[data-notifications-empty]");
  if (!list) return;
  if (!append) list.replaceChildren();
  const rows = visibleNotifications();
  if (!rows.length) {
    list.hidden = true;
    empty.hidden = false;
    empty.querySelector("h2").textContent = notificationFilter === "unread" ? "You’re all caught up" : "No notifications yet";
    empty.querySelector("p").textContent = notificationFilter === "unread" ? "There are no unread updates right now." : "When someone follows, mentions, or replies to you, you’ll see it here.";
    return;
  }
  list.hidden = false;
  empty.hidden = true;
  for (const item of rows) {
    if (!list.querySelector(`[data-notification-id="${CSS.escape(String(item.id))}"]`)) list.append(renderNotification(item));
  }
  if (notificationHasMore && !list.querySelector("[data-more-notifications]")) list.append(node("button", { className: "load-more-notifications", text: "Show older notifications", attrs: { type: "button", dataset: { moreNotifications: "" } } }));
  else list.querySelector("[data-more-notifications]")?.remove();
}

async function loadNotifications({ reset = false } = {}) {
  if (notificationBusy || (!notificationHasMore && !reset)) return;
  if (reset) { notificationRows = []; notificationOffset = 0; notificationHasMore = true; }
  notificationBusy = true;
  const list = document.querySelector("[data-notification-list]");
  if (list) list.setAttribute("aria-busy", "true");
  try {
    const data = await api.get(`/notifications/?limit=${LIMIT}&offset=${notificationOffset}`);
    notificationRows = reset ? (data.results || []) : [...notificationRows, ...(data.results || [])];
    for (const item of data.results || []) notificationCache.set(String(item.id), item);
    notificationOffset += (data.results || []).length;
    notificationHasMore = Boolean(data.next);
    drawNotifications({ append: !reset });
  } catch (error) { toast(error.message, { kind: "error", retry: () => loadNotifications({ reset: true }) }); }
  finally { if (list) list.setAttribute("aria-busy", "false"); notificationBusy = false; }
}

function wireFilters() {
  document.querySelectorAll("[data-notification-filter]").forEach((button) => button.addEventListener("click", () => {
    notificationFilter = button.dataset.notificationFilter;
    document.querySelectorAll("[data-notification-filter]").forEach((tab) => {
      const active = tab === button; tab.classList.toggle("is-active", active); tab.setAttribute("aria-selected", String(active));
    });
    drawNotifications();
  }));
}

function wireReadActions() {
  const toggle = document.querySelector("[data-notification-toggle]");
  const dropdown = document.querySelector("[data-notification-dropdown]");
  toggle?.addEventListener("click", () => {
    dropdown.hidden = !dropdown.hidden;
    toggle.setAttribute("aria-expanded", String(!dropdown.hidden));
    if (!dropdown.hidden) void refreshUnread();
  });
  document.addEventListener("click", (event) => {
    if (dropdown && toggle && !dropdown.contains(event.target) && !toggle.contains(event.target)) {
      dropdown.hidden = true; toggle.setAttribute("aria-expanded", "false");
    }
  });
  document.querySelector("[data-mark-all-read]")?.addEventListener("click", async () => {
    try {
      await api.post("/notifications/mark_all_read/", {});
      for (const row of notificationRows) row.is_read = true;
      drawNotifications(); renderBadge(0); toast("You’re all caught up.");
    } catch (error) { toast(error.message, { kind: "error" }); }
  });
  document.addEventListener("click", async (event) => {
    const more = event.target.closest("[data-more-notifications]");
    if (more) { more.remove(); await loadNotifications(); return; }
    const row = event.target.closest("[data-notification-id]");
    if (!row || (document.body.dataset.page !== "notifications" && !row.closest("[data-notification-dropdown]"))) return;
    const id = Number(row.dataset.notificationId);
    const item = notificationRows.find((entry) => Number(entry.id) === id) || notificationCache.get(String(id));
    if (!item) return;
    if (!item.is_read) {
      try {
        await api.post("/notifications/mark_read/", { ids: [id] });
        item.is_read = true; row.classList.remove("is-unread"); row.querySelector(".unread-indicator")?.remove();
        await refreshUnread();
        if (notificationFilter === "unread" && document.body.dataset.page === "notifications") { row.remove(); drawNotifications(); }
      } catch (error) { toast(error.message, { kind: "error" }); }
    }
    let username = item.actor?.username;
    if (item.post_id) {
      try { username = (await api.get(`/posts/${item.post_id}/`)).author?.username || username; }
      catch { /* The actor profile remains a useful destination if the post is unavailable. */ }
    }
    if (username) location.assign(`/u/${encodeURIComponent(username)}/${item.post_id ? `#post-${item.post_id}` : ""}`);
  });
  document.addEventListener("keydown", (event) => {
    const row = event.target.closest?.("[data-notification-id][role='link']");
    if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); row.click(); }
  });
}

export function initNotifications() {
  void refreshUnread();
  if (unreadTimer) window.clearInterval(unreadTimer);
  const poll = () => {
    if (document.visibilityState !== "visible") return;
    void refreshUnread();
    if (document.body.dataset.page === "notifications") void loadNotifications({ reset: true });
  };
  unreadTimer = window.setInterval(poll, 30000);
  document.addEventListener("visibilitychange", poll);
  wireReadActions();
  if (document.body.dataset.page === "notifications") {
    wireFilters();
    void loadNotifications({ reset: true });
  }
}
