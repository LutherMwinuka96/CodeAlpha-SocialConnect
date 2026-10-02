import { api } from "./api.js";
import { state } from "./state.js";
import { addPostToCache } from "./feed.js";
import { node, renderPost, renderUser, toast } from "./ui.js";

let debounceTimer = null;
let activeTab = "people";
let currentResult = { people: [], posts: [], hashtags: [] };

function setActiveTab(name) {
  activeTab = name;
  state.search.tab = name;
  document.querySelectorAll("[data-result-tab]").forEach((tab) => {
    const active = tab.dataset.resultTab === name;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  renderCurrentTab();
}

function renderHashtags(items) {
  const list = node("div", { className: "hashtag-results" });
  for (const tag of items) {
    const row = node("a", { className: "hashtag-result", attrs: { href: `/search/?q=${encodeURIComponent(`#${tag.name}`)}` } });
    row.append(node("span", { className: "hashtag-symbol", text: "#" }), node("span", { className: "hashtag-name", text: tag.name }), node("span", { className: "muted", text: `${tag.posts_count || 0} posts` }));
    list.append(row);
  }
  return list;
}

function renderCurrentTab() {
  const results = document.querySelector("[data-results-list]");
  const prompt = document.querySelector("[data-search-prompt]");
  const empty = document.querySelector("[data-search-empty]");
  if (!results || !state.search.query) return;
  results.replaceChildren();
  prompt.hidden = true;
  const items = currentResult[activeTab] || [];
  document.querySelectorAll("[data-result-count]").forEach((count) => { count.textContent = currentResult[count.dataset.resultCount]?.length ? `(${currentResult[count.dataset.resultCount].length})` : ""; });
  if (!items.length) { empty.hidden = false; return; }
  empty.hidden = true;
  if (activeTab === "people") for (const user of items) results.append(renderUser(user, state.user));
  if (activeTab === "posts") for (const post of items) { addPostToCache(post); results.append(renderPost(post, state.user)); }
  if (activeTab === "hashtags") results.append(renderHashtags(items));
}

async function runSearch(query) {
  state.search.query = query;
  const prompt = document.querySelector("[data-search-prompt]");
  const empty = document.querySelector("[data-search-empty]");
  const results = document.querySelector("[data-results-list]");
  if (!query.trim()) {
    currentResult = { people: [], posts: [], hashtags: [] };
    results?.replaceChildren();
    if (prompt) prompt.hidden = false;
    if (empty) empty.hidden = true;
    document.querySelectorAll("[data-result-count]").forEach((count) => { count.textContent = ""; });
    return;
  }
  if (prompt) prompt.hidden = true;
  results?.replaceChildren(node("p", { className: "muted loading-note", text: "Looking around…" }));
  try {
    currentResult = await api.get(`/search/?q=${encodeURIComponent(query)}`);
    if (empty) { empty.querySelector("h2").textContent = "No results yet"; empty.querySelector("p").textContent = "Try another name or search for a different topic."; }
    renderCurrentTab();
  } catch (error) {
    if (results) results.replaceChildren();
    if (empty) { empty.hidden = false; empty.querySelector("h2").textContent = "Search couldn’t load"; empty.querySelector("p").textContent = error.message; }
  }
}

function queueSearch(query) {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => void runSearch(query), 300);
}

function wireSearchPage() {
  const input = document.querySelector("[data-search-input]");
  if (!input) return;
  const initial = new URLSearchParams(location.search).get("q") || "";
  input.value = initial;
  if (initial) void runSearch(initial);
  input.addEventListener("input", () => queueSearch(input.value));
  document.querySelectorAll("[data-result-tab]").forEach((button) => button.addEventListener("click", () => setActiveTab(button.dataset.resultTab)));
}

function wireGlobalSearch() {
  const inputs = document.querySelectorAll("[data-global-search]");
  for (const input of inputs) input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && input.value.trim()) location.assign(`/search/?q=${encodeURIComponent(input.value.trim())}`);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
      event.preventDefault(); inputs[0]?.focus();
    }
  });
}

function updateFollowButtons(username, following) {
  document.querySelectorAll(`[data-follow-user="${CSS.escape(username)}"]`).forEach((button) => {
    button.dataset.following = String(following);
    button.setAttribute("aria-pressed", String(following));
    button.textContent = following ? "Following" : "Follow";
    button.classList.toggle("button-secondary", following);
    button.classList.toggle("button-primary", !following);
  });
  for (const user of currentResult.people) if (user.username === username) user.is_following = following;
}

function wireQuickFollow() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-follow-user]");
    if (!button) return;
    const username = button.dataset.followUser;
    const following = button.dataset.following === "true";
    button.disabled = true;
    updateFollowButtons(username, !following);
    try {
      await api.request(`/users/${encodeURIComponent(username)}/follow/`, { method: following ? "DELETE" : "POST" });
      toast(following ? `You unfollowed @${username}.` : `You’re now following @${username}.`);
    } catch (error) { updateFollowButtons(username, following); toast(error.message, { kind: "error" }); }
    finally { button.disabled = false; }
  });
}

async function loadDiscovery() {
  const userList = document.querySelector("[data-suggestions-list]");
  const trendingList = document.querySelector("[data-trending-list]");
  if (!userList && !trendingList) return;
  try {
    const [suggestions, trending] = await Promise.all([
      userList ? api.get("/users/suggestions/?limit=4") : Promise.resolve(null),
      trendingList ? api.get("/posts/trending/") : Promise.resolve(null),
    ]);
    if (userList) {
      userList.replaceChildren();
      for (const user of suggestions.results || []) userList.append(renderUser(user, state.user));
      if (!userList.children.length) userList.append(node("p", { className: "muted", text: "You’re following the people who come to mind." }));
    }
    if (trendingList) {
      trendingList.replaceChildren();
      for (const tag of (trending || []).slice(0, 5)) {
        const link = node("a", { className: "trending-item", attrs: { href: `/search/?q=${encodeURIComponent(`#${tag.name}`)}` } });
        link.append(node("span", { className: "trending-hash", text: "#" }), node("span", { className: "trending-copy" }, [node("strong", { text: tag.name }), node("small", { text: `${tag.posts_count} ${tag.posts_count === 1 ? "post" : "posts"}` })]));
        trendingList.append(link);
      }
      if (!trendingList.children.length) trendingList.append(node("p", { className: "muted", text: "The conversation is just getting started." }));
    }
  } catch (error) {
    if (userList) userList.replaceChildren(node("p", { className: "muted", text: "Couldn’t load suggestions right now." }));
    if (trendingList) trendingList.replaceChildren(node("p", { className: "muted", text: "Couldn’t load trends right now." }));
  }
}

export function initSearch() {
  wireGlobalSearch();
  wireQuickFollow();
  wireSearchPage();
  void loadDiscovery();
}
