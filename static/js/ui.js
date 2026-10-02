export function node(tag, { className = "", text = null, attrs = {} } = {}, children = []) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null) element.textContent = text;
  for (const [name, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || (value === false && !name.startsWith("aria-"))) continue;
    if (name === "dataset") Object.assign(element.dataset, value);
    else if (name in element && !name.startsWith("aria-") && name !== "role") element[name] = value;
    else element.setAttribute(name, value === true ? "" : String(value));
  }
  for (const child of children) if (child) element.append(child);
  return element;
}

export function initials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : (parts[0] || "CA").slice(0, 2)).toUpperCase();
}

export function avatar(url, name, className = "avatar avatar-medium") {
  const wrapper = node("span", { className });
  if (url) wrapper.append(node("img", { attrs: { src: url, alt: "", loading: "lazy", referrerPolicy: "no-referrer" } }));
  else wrapper.textContent = initials(name);
  return wrapper;
}

export function toast(message, { kind = "success", timeout = 3600, retry = null } = {}) {
  const region = document.querySelector("[data-toast-region]");
  if (!region) return;
  const item = node("div", { className: `toast${kind === "error" ? " is-error" : ""}`, attrs: { role: kind === "error" ? "alert" : "status" } });
  item.append(node("span", { text: message }));
  if (retry) item.append(node("button", { className: "toast-retry", text: "Retry", attrs: { type: "button" } }));
  region.append(item);
  item.querySelector(".toast-retry")?.addEventListener("click", () => { item.remove(); void retry(); });
  window.setTimeout(() => item.remove(), timeout);
}

export function timeAgo(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "just now";
  const seconds = Math.max(0, (Date.now() - date.valueOf()) / 1000);
  const units = [[31536000, "y"], [2592000, "mo"], [604800, "w"], [86400, "d"], [3600, "h"], [60, "m"]];
  for (const [size, label] of units) if (seconds >= size) return `${Math.floor(seconds / size)}${label}`;
  return "now";
}

function appendRichText(container, value) {
  const pattern = /(?:#[\p{L}\p{N}_]{1,80}|@[A-Za-z0-9_.]{1,150})/gu;
  let cursor = 0;
  for (const match of String(value || "").matchAll(pattern)) {
    const start = match.index;
    if (start > cursor) container.append(document.createTextNode(value.slice(cursor, start)));
    const token = match[0];
    const target = token[0] === "#" ? `/search/?q=${encodeURIComponent(token)}` : `/u/${encodeURIComponent(token.slice(1))}/`;
    container.append(node("a", { className: token[0] === "#" ? "post-tag" : "post-mention", text: token, attrs: { href: target } }));
    cursor = start + token.length;
  }
  if (cursor < String(value || "").length) container.append(document.createTextNode(String(value).slice(cursor)));
}

function icon(name) {
  const paths = {
    heart: "M20.8 8.7c0 5-8.8 10.2-8.8 10.2S3.2 13.7 3.2 8.7a4.2 4.2 0 0 1 8.8-1.4 4.2 4.2 0 0 1 8.8 1.4Z",
    comment: "M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.2-3.1A7.5 7.5 0 1 1 20 11.5Z",
    bookmark: "M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    share: "M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13v7h14v-7",
  };
  const svg = node("svg", { attrs: { viewBox: "0 0 24 24", "aria-hidden": "true" } });
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name] || paths.more);
  svg.append(path);
  return svg;
}

function makePostMenu(post, isOwner) {
  const details = node("details", { className: "post-menu" });
  const summary = node("summary", { className: "icon-button post-menu-trigger", attrs: { "aria-label": "Post options", title: "Post options" } }, [icon("more")]);
  details.append(summary);
  const menu = node("div", { className: "post-menu-popover", attrs: { role: "menu" } });
  const save = node("button", { text: post.bookmarked_by_me ? "Remove from saved" : "Save post", attrs: { type: "button", role: "menuitem", dataset: { postAction: "bookmark", postId: post.id } } });
  menu.append(save);
  if (isOwner) {
    menu.append(node("button", { text: "Edit post", attrs: { type: "button", role: "menuitem", dataset: { postAction: "edit", postId: post.id } } }));
    menu.append(node("button", { className: "menu-danger", text: "Delete post", attrs: { type: "button", role: "menuitem", dataset: { postAction: "delete", postId: post.id } } }));
  }
  details.append(menu);
  return details;
}

export function renderPost(post, viewer = null) {
  const article = node("article", { className: "post-card card", attrs: { id: `post-${post.id}`, dataset: { postId: post.id } } });
  const author = post.author || {};
  const authorLink = node("a", { className: "post-author-link", attrs: { href: `/u/${encodeURIComponent(author.username || "")}/` } }, [avatar(author.avatar, author.full_name || author.username)]);
  const identity = node("div", { className: "post-identity" });
  const fullName = author.full_name || author.username || "Connect member";
  identity.append(node("a", { className: "post-author-name", text: fullName, attrs: { href: `/u/${encodeURIComponent(author.username || "")}/` } }));
  identity.append(node("a", { className: "post-author-handle", text: `@${author.username || "member"}`, attrs: { href: `/u/${encodeURIComponent(author.username || "")}/` } }));
  const created = node("time", { className: "post-time", text: timeAgo(post.created_at), attrs: { dateTime: post.created_at, title: new Date(post.created_at).toLocaleString() } });
  const header = node("header", { className: "post-header" }, [authorLink, identity, created, makePostMenu(post, Boolean(viewer && Number(viewer.id) === Number(author.id)))]);
  article.append(header);
  const content = node("div", { className: "post-content" });
  if (post.edited) content.append(node("span", { className: "edited-label", text: "Edited · " }));
  const text = node("p", { className: "post-text" });
  appendRichText(text, post.text);
  content.append(text);
  if (post.image) content.append(node("img", { className: "post-image", attrs: { src: post.image, alt: `Image shared by ${fullName}`, loading: "lazy" } }));
  article.append(content);
  const actions = node("footer", { className: "post-actions" });
  const like = node("button", { className: `post-action${post.liked_by_me ? " is-liked" : ""}`, attrs: { type: "button", dataset: { postAction: "like", postId: post.id }, "aria-pressed": Boolean(post.liked_by_me), "aria-label": post.liked_by_me ? "Unlike post" : "Like post" } }, [icon("heart"), node("span", { text: String(post.likes_count || 0), attrs: { dataset: { likeCount: "" } } })]);
  const comments = node("button", { className: "post-action", attrs: { type: "button", dataset: { postAction: "comments", postId: post.id }, "aria-label": "Show comments" } }, [icon("comment"), node("span", { text: String(post.comments_count || 0), attrs: { dataset: { commentCount: "" } } })]);
  const saved = node("button", { className: `post-action save-action${post.bookmarked_by_me ? " is-saved" : ""}`, attrs: { type: "button", dataset: { postAction: "bookmark", postId: post.id }, "aria-pressed": Boolean(post.bookmarked_by_me), "aria-label": post.bookmarked_by_me ? "Remove saved post" : "Save post" } }, [icon("bookmark")]);
  const share = node("button", { className: "post-action share-action", attrs: { type: "button", dataset: { postAction: "share", postId: post.id }, "aria-label": "Share post" } }, [icon("share")]);
  actions.append(like, comments, node("span", { className: "action-spacer" }), saved, share);
  article.append(actions);
  return article;
}

export function renderUser(user, viewer = null) {
  const row = node("article", { className: "user-result" });
  const name = user.full_name || user.username;
  row.append(node("a", { className: "user-result-avatar", attrs: { href: `/u/${encodeURIComponent(user.username)}/` } }, [avatar(user.avatar, name)]));
  const details = node("div", { className: "user-result-info" });
  details.append(node("a", { className: "user-result-name", text: name, attrs: { href: `/u/${encodeURIComponent(user.username)}/` } }));
  details.append(node("span", { className: "muted", text: `@${user.username}` }));
  if (user.bio) details.append(node("p", { className: "user-result-bio", text: user.bio }));
  row.append(details);
  if (!viewer || Number(viewer.id) !== Number(user.id)) {
    row.append(node("button", { className: `button button-small ${user.is_following ? "button-secondary" : "button-primary"}`, text: user.is_following ? "Following" : "Follow", attrs: { type: "button", dataset: { followUser: user.username, following: Boolean(user.is_following) }, "aria-pressed": Boolean(user.is_following) } }));
  }
  return row;
}

export function renderNotification(item) {
  const actor = item.actor || {};
  const name = actor.full_name || actor.username || "Someone";
  const row = node("article", { className: `notification-row${item.is_read ? "" : " is-unread"}`, attrs: { dataset: { notificationId: item.id, unread: String(!item.is_read) }, role: "link", tabindex: 0, "aria-label": `Notification: ${name}` } });
  row.append(avatar(actor.avatar, name, "avatar avatar-medium"));
  const message = node("div", { className: "notification-message" });
  const verb = { follow: "started following you", like: "liked your post", comment: "replied to your post", mention: "mentioned you" }[item.kind] || "interacted with you";
  const sentence = node("p");
  sentence.append(node("strong", { className: "notification-actor", text: name }), document.createTextNode(` ${verb}`));
  message.append(sentence, node("time", { className: "post-time", text: timeAgo(item.created_at), attrs: { dateTime: item.created_at, title: new Date(item.created_at).toLocaleString() } }));
  row.append(message);
  if (!item.is_read) row.append(node("span", { className: "unread-indicator", attrs: { "aria-label": "Unread" } }));
  return row;
}

export function openDialog({ title, message = "", confirmText = "Continue", cancelText = "Cancel", danger = false, input = null }) {
  const dialog = document.querySelector("[data-dialog]");
  const target = dialog?.querySelector("[data-dialog-content]");
  if (!dialog || !target) return Promise.resolve(null);
  target.replaceChildren();
  target.append(node("h2", { text: title, attrs: { id: "dialog-title" } }));
  if (message) target.append(node("p", { className: "dialog-message", text: message }));
  let field = null;
  if (input) {
    const label = node("label", { text: input.label, attrs: { htmlFor: "dialog-input" } });
    field = node("input", { attrs: { id: "dialog-input", type: input.type || "text", autocomplete: input.autocomplete || "off", required: Boolean(input.required), placeholder: input.placeholder || "" } });
    target.append(label, field);
  }
  const actions = node("div", { className: "dialog-actions" });
  const cancel = node("button", { className: "button button-secondary", text: cancelText, attrs: { type: "button" } });
  const confirm = node("button", { className: `button ${danger ? "button-danger" : "button-primary"}`, text: confirmText, attrs: { type: "button" } });
  actions.append(cancel, confirm);
  target.append(actions);
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.removeEventListener("close", onClose);
      resolve(value);
    };
    const onClose = () => finish(null);
    cancel.addEventListener("click", () => dialog.close("cancel"), { once: true });
    confirm.addEventListener("click", () => {
      if (field?.required && !field.value.trim()) { field.focus(); return; }
      const value = input ? field.value : true;
      dialog.close("confirm");
      finish(value);
    }, { once: true });
    dialog.addEventListener("close", onClose, { once: true });
    dialog.showModal();
    field?.focus();
  });
}

export function showContentDialog(title, content) {
  const dialog = document.querySelector("[data-dialog]");
  const target = dialog?.querySelector("[data-dialog-content]");
  if (!dialog || !target) return;
  target.replaceChildren(node("h2", { text: title, attrs: { id: "dialog-title" } }), content);
  dialog.showModal();
}

export async function editPostDialog(post, title = "Edit your post") {
  const dialog = document.querySelector("[data-dialog]");
  const target = dialog?.querySelector("[data-dialog-content]");
  if (!dialog || !target) return null;
  target.replaceChildren();
  target.append(node("h2", { text: title, attrs: { id: "dialog-title" } }));
  const form = node("form", { className: "edit-post-form" });
  const textarea = node("textarea", { attrs: { rows: 5, maxlength: 500, required: true, "aria-label": "Post text" } });
  textarea.value = post.text;
  const count = node("span", { className: "character-count", text: `${textarea.value.length} / 500` });
  textarea.addEventListener("input", () => { count.textContent = `${textarea.value.length} / 500`; });
  const actions = node("div", { className: "dialog-actions" });
  const cancel = node("button", { className: "button button-secondary", text: "Cancel", attrs: { type: "button" } });
  const save = node("button", { className: "button button-primary", text: "Save changes", attrs: { type: "submit" } });
  actions.append(cancel, save);
  form.append(textarea, count, actions);
  target.append(form);
  return new Promise((resolve) => {
    const done = (value) => { dialog.removeEventListener("close", onClose); resolve(value); };
    const onClose = () => done(null);
    cancel.addEventListener("click", () => dialog.close("cancel"), { once: true });
    form.addEventListener("submit", (event) => { event.preventDefault(); if (textarea.value.trim()) { dialog.close("save"); done(textarea.value.trim()); } }, { once: true });
    dialog.addEventListener("close", onClose, { once: true });
    dialog.showModal();
    textarea.focus();
  });
}
