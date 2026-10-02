import { api } from "./api.js";
import { state, setUser } from "./state.js";
import { applyTheme } from "./theme.js";
import { addPostToCache } from "./feed.js";
import { avatar, node, renderPost, renderUser, toast, openDialog, showContentDialog, timeAgo } from "./ui.js";

const PAGE_SIZE = 20;
let currentProfile = null;
let profileTab = "posts";
let profileOffset = 0;
let profileHasMore = true;
let profileBusy = false;
let profileObserver = null;

function setText(selector, value) {
  const target = document.querySelector(selector);
  if (target) target.textContent = value || "";
}

function setImage(target, url, label = "") {
  if (!target) return;
  target.replaceChildren();
  if (url) target.append(node("img", { attrs: { src: url, alt: label, loading: "lazy" } }));
  else target.textContent = label.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 2).toUpperCase() || "CA";
}

function profileName(user) { return user.full_name || user.username; }

function fillProfile(user) {
  currentProfile = user;
  const name = profileName(user);
  document.title = `${name} · CodeAlpha Connect`;
  setText("[data-profile-name]", name);
  setText("[data-profile-handle]", `@${user.username}`);
  setText("[data-profile-bio]", user.bio || "");
  setText("[data-profile-followers]", String(user.followers_count ?? 0));
  setText("[data-profile-following]", String(user.following_count ?? 0));
  setText("[data-profile-posts]", String(user.posts_count ?? 0));
  setImage(document.querySelector("[data-profile-avatar]"), user.avatar, name);
  const cover = document.querySelector("[data-profile-cover]");
  if (cover && user.cover) cover.replaceChildren(node("img", { attrs: { src: user.cover, alt: `${name}'s cover photo` } }));
  const location = document.querySelector("[data-profile-location]");
  if (location) { location.hidden = !user.location; location.replaceChildren(); if (user.location) location.append(locationIcon(), document.createTextNode(user.location)); }
  const website = document.querySelector("[data-profile-website]");
  if (website) { website.hidden = !user.website; website.textContent = user.website ? new URL(user.website).host : ""; website.href = user.website || "#"; website.replaceChildren(globeIcon(), document.createTextNode(user.website ? new URL(user.website).host : "")); }
  const follows = document.querySelector("[data-follows-you]");
  if (follows) follows.hidden = !user.follows_you;
  const ownProfile = Number(state.user?.id) === Number(user.id);
  const edit = document.querySelector("[data-edit-profile]");
  if (edit) { edit.hidden = !ownProfile; edit.onclick = () => location.assign("/account/"); }
  const follow = document.querySelector("[data-follow-button]");
  if (follow) {
    follow.hidden = ownProfile;
    follow.textContent = user.is_following ? "Following" : "Follow";
    follow.classList.toggle("button-secondary", Boolean(user.is_following));
    follow.classList.toggle("button-primary", !user.is_following);
    follow.setAttribute("aria-pressed", String(Boolean(user.is_following)));
    follow.onclick = () => toggleProfileFollow(follow);
  }
  const more = document.querySelector("[data-profile-more]");
  if (more) more.hidden = ownProfile;
  void loadProfileContent(true);
}

function locationIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"); path.setAttribute("fill", "none"); path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "1.7"); svg.append(path); return svg;
}

function globeIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12"); circle.setAttribute("cy", "12"); circle.setAttribute("r", "9"); circle.setAttribute("fill", "none"); circle.setAttribute("stroke", "currentColor"); circle.setAttribute("stroke-width", "1.7"); svg.append(circle); return svg;
}

async function toggleProfileFollow(button) {
  if (!currentProfile) return;
  const before = Boolean(currentProfile.is_following);
  currentProfile.is_following = !before;
  currentProfile.followers_count = Math.max(0, (Number(currentProfile.followers_count) || 0) + (before ? -1 : 1));
  button.textContent = currentProfile.is_following ? "Following" : "Follow";
  button.classList.toggle("button-secondary", currentProfile.is_following);
  button.classList.toggle("button-primary", !currentProfile.is_following);
  button.setAttribute("aria-pressed", String(currentProfile.is_following));
  setText("[data-profile-followers]", String(currentProfile.followers_count));
  try {
    await api.request(`/users/${encodeURIComponent(currentProfile.username)}/follow/`, { method: before ? "DELETE" : "POST" });
  } catch (error) {
    currentProfile.is_following = before;
    currentProfile.followers_count += before ? 1 : -1;
    button.textContent = before ? "Following" : "Follow";
    button.classList.toggle("button-secondary", before);
    button.classList.toggle("button-primary", !before);
    button.setAttribute("aria-pressed", String(before));
    setText("[data-profile-followers]", String(currentProfile.followers_count));
    toast(error.message, { kind: "error" });
  }
}

function tabPath() {
  const name = encodeURIComponent(currentProfile.username);
  return {
    posts: `/users/${name}/posts/`,
    replies: `/users/${name}/replies/`,
    likes: `/users/${name}/likes/`,
    media: `/users/${name}/media/`,
  }[profileTab];
}

function renderReply(comment) {
  const user = comment.author || {};
  const card = node("article", { className: "profile-reply card" });
  card.append(node("div", { className: "reply-label", text: "REPLIED" }));
  const header = node("header", { className: "comment-head" }, [
    node("a", { className: "comment-author", text: user.full_name || user.username, attrs: { href: `/u/${encodeURIComponent(user.username || "")}/` } }),
    node("time", { className: "post-time", text: timeAgo(comment.created_at), attrs: { dateTime: comment.created_at, title: new Date(comment.created_at).toLocaleString() } }),
  ]);
  card.append(header, node("p", { className: "comment-text", text: comment.text }), node("a", { className: "text-link", text: "View conversation →", attrs: { href: `/u/${encodeURIComponent(user.username || "")}/#post-${comment.post}` } }));
  return card;
}

async function loadProfileContent(reset = false) {
  const list = document.querySelector("[data-profile-posts]");
  if (!list || !currentProfile || profileBusy || (!profileHasMore && !reset)) return;
  if (reset) { profileOffset = 0; profileHasMore = true; list.replaceChildren(); }
  profileBusy = true;
  list.setAttribute("aria-busy", "true");
  try {
    const data = await api.get(`${tabPath()}?limit=${PAGE_SIZE}&offset=${profileOffset}`);
    for (const item of data.results || []) {
      if (profileTab === "replies") list.append(renderReply(item));
      else { addPostToCache(item); list.append(renderPost(item, state.user)); }
    }
    profileOffset += (data.results || []).length;
    profileHasMore = Boolean(data.next);
    document.querySelector("[data-profile-empty]").hidden = Boolean(list.children.length);
  } catch (error) { toast(error.message, { kind: "error", retry: () => loadProfileContent(true) }); }
  finally { list.setAttribute("aria-busy", "false"); profileBusy = false; }
}

function wireProfilePage() {
  const page = document.querySelector("[data-profile-page]");
  if (!page) return;
  const match = location.pathname.match(/^\/u\/([^/]+)\/?$/);
  if (!match) return;
  const username = decodeURIComponent(match[1]);
  api.get(`/users/${encodeURIComponent(username)}/`).then(fillProfile).catch((error) => {
    toast(error.message, { kind: "error" });
    if (error.status === 404) document.querySelector("[data-profile-name]").textContent = "Profile not found";
  });
  document.querySelectorAll("[data-profile-tab]").forEach((tab) => tab.addEventListener("click", () => {
    profileTab = tab.dataset.profileTab;
    document.querySelectorAll("[data-profile-tab]").forEach((button) => {
      const active = button === tab;
      button.classList.toggle("is-active", active); button.setAttribute("aria-selected", String(active));
    });
    void loadProfileContent(true);
  }));
  const sentinel = node("div", { className: "feed-sentinel" });
  page.append(sentinel);
  profileObserver?.disconnect();
  profileObserver = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadProfileContent(); }, { rootMargin: "400px" });
  profileObserver.observe(sentinel);
  document.querySelector("[data-open-followers]")?.addEventListener("click", (event) => { event.preventDefault(); void showConnections("followers"); });
  document.querySelector("[data-open-following]")?.addEventListener("click", (event) => { event.preventDefault(); void showConnections("following"); });
}

async function showConnections(kind) {
  if (!currentProfile) return;
  try {
    const data = await api.get(`/users/${encodeURIComponent(currentProfile.username)}/${kind}/?limit=50&offset=0`);
    const list = node("div", { className: "connection-list" });
    for (const user of data.results || []) list.append(renderUser(user, state.user));
    if (!list.children.length) list.append(node("p", { className: "muted dialog-message", text: `No ${kind} yet.` }));
    showContentDialog(kind === "followers" ? "Followers" : "Following", list);
  } catch (error) { toast(error.message, { kind: "error" }); }
}

function showFilePreview(input, selector, imageSelector) {
  const file = input.files?.[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
    toast("Choose a JPEG, PNG, or WebP image up to 5 MB.", { kind: "error" }); input.value = ""; return;
  }
  const target = document.querySelector(selector);
  if (!target) return;
  if (imageSelector) {
    const target = document.querySelector(selector);
    let image = document.querySelector(imageSelector);
    if (target && !image) { image = document.createElement("img"); image.alt = ""; target.replaceChildren(image); }
    if (image) image.src = URL.createObjectURL(file);
  } else {
    target.style.backgroundImage = `url("${URL.createObjectURL(file)}")`;
  }
}

async function cropAvatarSquare(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = 512; canvas.height = 512;
  const context = canvas.getContext("2d");
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 512, 512);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
  if (!blob) throw new Error("Could not prepare that profile photo.");
  return new File([blob], "avatar.webp", { type: "image/webp" });
}

async function initSettings() {
  const form = document.querySelector("[data-profile-form]");
  if (!form) return;
  const profile = state.user?.profile || {};
  const user = state.user || {};
  const value = (selector, text) => { const element = form.querySelector(selector); if (element) element.value = text || ""; };
  value("[data-setting-name]", user.full_name);
  value("[data-setting-bio]", profile.bio);
  value("[data-setting-location]", profile.location);
  value("[data-setting-website]", profile.website);
  value("[data-setting-theme]", user.theme || "system");
  const avatarTarget = document.querySelector("[data-settings-avatar]");
  setImage(avatarTarget, profile.avatar, user.full_name || user.username || "CA");
  const coverTarget = document.querySelector("[data-cover-preview]");
  if (coverTarget && profile.cover) coverTarget.style.backgroundImage = `url("${profile.cover}")`;
  const avatarInput = form.querySelector("[data-avatar-upload]");
  let croppedAvatar = null;
  avatarInput?.addEventListener("change", async () => {
    const file = avatarInput.files?.[0];
    croppedAvatar = null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast("Choose a JPEG, PNG, or WebP image up to 5 MB.", { kind: "error" }); avatarInput.value = ""; return;
    }
    try {
      croppedAvatar = await cropAvatarSquare(file);
      const previewUrl = URL.createObjectURL(croppedAvatar);
      const target = document.querySelector("[data-settings-avatar]");
      let image = target.querySelector("img");
      if (!image) { image = document.createElement("img"); image.alt = ""; target.replaceChildren(image); }
      image.src = previewUrl;
    } catch (error) { toast(error.message, { kind: "error" }); }
  });
  const bio = form.querySelector("[data-setting-bio]");
  const bioCount = form.querySelector("[data-bio-count]");
  const updateBioCount = () => { bioCount.textContent = String(bio.value.length); };
  bio.addEventListener("input", updateBioCount); updateBioCount();
  form.querySelector("[data-cover-upload]")?.addEventListener("change", (event) => showFilePreview(event.target, "[data-cover-preview]"));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = form.querySelector("[data-settings-error]"); errorBox.hidden = true;
    const data = new FormData();
    data.set("full_name", form.querySelector("[data-setting-name]").value.trim());
    data.set("profile.bio", bio.value.trim());
    data.set("profile.location", form.querySelector("[data-setting-location]").value.trim());
    data.set("profile.website", form.querySelector("[data-setting-website]").value.trim());
    data.set("theme", form.querySelector("[data-setting-theme]").value);
    const avatarFile = croppedAvatar || form.querySelector("[data-avatar-upload]").files?.[0];
    const coverFile = form.querySelector("[data-cover-upload]").files?.[0];
    if (avatarFile) data.set("profile.avatar", avatarFile, avatarFile.name);
    if (coverFile) data.set("profile.cover", coverFile, coverFile.name);
    const button = form.querySelector("[data-save-profile]"); button.disabled = true; button.textContent = "Saving…";
    try {
      const updated = await api.patch("/auth/me/", data);
      setUser(updated); applyTheme(updated.theme, { persist: false });
      toast("Your profile is up to date.");
    } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; toast(error.message, { kind: "error" }); }
    finally { button.disabled = false; button.textContent = "Save changes"; }
  });
  document.querySelector("[data-password-form]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const passwordForm = event.currentTarget;
    const box = passwordForm.querySelector("[data-password-error]"); box.hidden = true;
    const values = Object.fromEntries(new FormData(passwordForm).entries());
    const button = passwordForm.querySelector("button[type=submit]"); button.disabled = true;
    try {
      await api.post("/auth/change-password/", values);
      await api.post("/auth/logout/", {});
      setUser(null); toast("Password updated. Sign in with your new password."); location.assign("/login/");
    } catch (error) { box.textContent = error.message; box.hidden = false; }
    finally { button.disabled = false; }
  });
  document.querySelector("[data-delete-account]")?.addEventListener("click", async () => {
    const password = await openDialog({ title: "Delete your account?", message: "This permanently deletes your profile, posts, comments, and follows. Enter your password to confirm.", confirmText: "Delete account", danger: true, input: { label: "Current password", type: "password", autocomplete: "current-password", required: true } });
    if (password === null) return;
    try {
      await api.delete("/auth/me/", { body: { current_password: password } });
      setUser(null); location.assign("/register/");
    } catch (error) { toast(error.message, { kind: "error" }); }
  });
}

export async function initProfile() {
  wireProfilePage();
  await initSettings();
}
