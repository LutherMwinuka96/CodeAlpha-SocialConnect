import { api } from "./api.js";
import { state } from "./state.js";
import { editPostDialog, node, renderPost, timeAgo, toast, openDialog, avatar } from "./ui.js";

const LIMIT = 20;
let feedOffset = 0;
let feedNext = true;
let feedLoading = false;
let feedMode = "following";
let savedOffset = 0;
let savedNext = true;
let savedLoading = false;
let feedObserver = null;
const postCache = new Map();

function cachePost(post) { postCache.set(String(post.id), post); }
function cachePosts(posts) { for (const post of posts || []) cachePost(post); }
function updateCached(post) { cachePost(post); }

function pageForMode() { return feedMode === "following" ? "/posts/feed/" : "/posts/explore/"; }

function appendPosts(target, posts, { replace = false } = {}) {
  if (replace) target.replaceChildren();
  for (const post of posts) {
    cachePost(post);
    target.append(renderPost(post, state.user));
  }
}

async function loadFeedPage({ reset = false } = {}) {
  const list = document.querySelector("[data-feed-list]");
  if (!list || feedLoading || (!feedNext && !reset)) return;
  if (reset) { feedOffset = 0; feedNext = true; }
  feedLoading = true;
  list.setAttribute("aria-busy", "true");
  const empty = document.querySelector("[data-feed-empty]");
  if (empty) empty.hidden = true;
  if (reset) list.replaceChildren(...Array.from({ length: 2 }, () => node("article", { className: "post-skeleton card" }, [node("div", { className: "skeleton-header" }, [node("span", { className: "skeleton-avatar" }), node("span", { className: "skeleton-line" })]), node("span", { className: "skeleton-line" }), node("span", { className: "skeleton-line short" })])));
  try {
    const data = await api.get(`${pageForMode()}?limit=${LIMIT}&offset=${feedOffset}`);
    if (reset) list.replaceChildren();
    appendPosts(list, data.results || []);
    feedOffset += (data.results || []).length;
    feedNext = Boolean(data.next);
    if (empty) empty.hidden = Boolean(list.children.length);
  } catch (error) {
    if (reset) list.replaceChildren();
    if (empty) empty.hidden = Boolean(list.children.length);
    toast(error.message, { kind: "error", retry: () => loadFeedPage({ reset: true }) });
  } finally {
    list.setAttribute("aria-busy", "false");
    feedLoading = false;
  }
}

function setFeedMode(mode) {
  feedMode = mode;
  state.feedMode = mode;
  document.querySelectorAll("[data-feed-tab]").forEach((tab) => {
    const active = tab.dataset.feedTab === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  void loadFeedPage({ reset: true });
}

function updateCharCount(textarea, count, button) {
  const length = textarea.value.length;
  count.textContent = `${length} / 500`;
  count.classList.toggle("is-near-limit", length >= 450 && length <= 500);
  count.classList.toggle("is-over-limit", length > 500);
  button.disabled = !textarea.value.trim() || length > 500;
}

function showImagePreview(file, preview, image) {
  if (!file) { preview.hidden = true; image.removeAttribute("src"); return; }
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type) || file.size > 5 * 1024 * 1024) {
    toast("Choose a JPEG, PNG, or WebP image up to 5 MB.", { kind: "error" });
    return false;
  }
  image.src = URL.createObjectURL(file);
  preview.hidden = false;
  return true;
}

function wireComposer() {
  const composer = document.querySelector("[data-composer]");
  const form = document.querySelector("[data-composer-form]");
  if (!composer || !form) return;
  const textarea = form.querySelector("[data-post-text]");
  const count = form.querySelector("[data-char-count]");
  const submit = form.querySelector("[data-submit-post]");
  const imageInput = form.querySelector("[data-post-image]");
  const preview = form.querySelector("[data-image-preview]");
  const image = form.querySelector("[data-preview-image]");
  const errorBox = form.querySelector("[data-composer-error]");
  let selectedFile = null;
  updateCharCount(textarea, count, submit);
  textarea.addEventListener("input", () => updateCharCount(textarea, count, submit));
  imageInput.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (file && showImagePreview(file, preview, image)) selectedFile = file;
    else { selectedFile = null; imageInput.value = ""; }
  });
  form.querySelector("[data-remove-image]")?.addEventListener("click", () => {
    selectedFile = null; imageInput.value = ""; showImagePreview(null, preview, image);
  });
  document.querySelectorAll("[data-open-composer]").forEach((button) => button.addEventListener("click", () => {
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    if (mobile) {
      composer.classList.add("is-sheet");
      composer.setAttribute("role", "dialog"); composer.setAttribute("aria-modal", "true"); composer.setAttribute("aria-label", "Create a post");
      document.body.classList.add("composer-open");
    }
    textarea.focus();
    if (!form.querySelector("[data-close-composer]")) {
      const close = node("button", { className: "composer-close icon-button", text: "×", attrs: { type: "button", "aria-label": "Close composer", dataset: { closeComposer: "" } } });
      form.prepend(close);
      close.addEventListener("click", closeComposer);
    }
  }));
  function closeComposer() { composer.classList.remove("is-sheet"); composer.removeAttribute("aria-modal"); composer.removeAttribute("role"); document.body.classList.remove("composer-open"); }
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && composer.classList.contains("is-sheet")) closeComposer(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const data = new FormData();
    data.set("text", textarea.value.trim());
    if (selectedFile) data.set("image", selectedFile, selectedFile.name);
    submit.disabled = true;
    const original = submit.textContent;
    submit.textContent = "Sharing…";
    try {
      const post = await api.post("/posts/", data);
      cachePost(post);
      const list = document.querySelector("[data-feed-list]");
      if (list && feedMode === "following") list.prepend(renderPost(post, state.user));
      textarea.value = "";
      selectedFile = null;
      imageInput.value = "";
      showImagePreview(null, preview, image);
      updateCharCount(textarea, count, submit);
      closeComposer();
      toast("Your post is out in the world.");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.hidden = false;
      toast(error.message, { kind: "error" });
    } finally { submit.textContent = original; updateCharCount(textarea, count, submit); }
  });
}

function updateLikeUI(article, liked, count) {
  const button = article.querySelector('[data-post-action="like"]');
  if (!button) return;
  button.classList.toggle("is-liked", liked);
  button.setAttribute("aria-pressed", String(liked));
  button.setAttribute("aria-label", liked ? "Unlike post" : "Like post");
  const output = button.querySelector("[data-like-count]");
  if (output) output.textContent = String(Math.max(0, count));
}

function updateBookmarkUI(article, bookmarked) {
  article.querySelectorAll('[data-post-action="bookmark"]').forEach((button) => {
    button.classList.toggle("is-saved", bookmarked);
    button.setAttribute("aria-pressed", String(bookmarked));
    button.setAttribute("aria-label", bookmarked ? "Remove saved post" : "Save post");
    if (button.matches(".post-menu-popover button")) button.textContent = bookmarked ? "Remove from saved" : "Save post";
  });
}

async function toggleLike(button, article) {
  const postId = article.dataset.postId;
  const post = postCache.get(String(postId));
  if (!post) return;
  const wasLiked = Boolean(post.liked_by_me);
  const previousCount = Number(post.likes_count) || 0;
  const liked = !wasLiked;
  post.liked_by_me = liked;
  post.likes_count = Math.max(0, previousCount + (liked ? 1 : -1));
  updateLikeUI(article, liked, post.likes_count);
  if (liked) { button.classList.remove("heart-pop"); void button.offsetWidth; button.classList.add("heart-pop"); }
  try {
    const result = await api.request(`/posts/${postId}/like/`, { method: liked ? "POST" : "DELETE" });
    post.likes_count = result.likes_count;
    updateLikeUI(article, liked, result.likes_count);
  } catch (error) {
    post.liked_by_me = wasLiked;
    post.likes_count = previousCount;
    updateLikeUI(article, wasLiked, previousCount);
    toast(error.message, { kind: "error" });
  }
}

async function toggleBookmark(article) {
  const postId = article.dataset.postId;
  const post = postCache.get(String(postId));
  if (!post) return;
  const before = Boolean(post.bookmarked_by_me);
  post.bookmarked_by_me = !before;
  updateBookmarkUI(article, !before);
  try {
    await api.request(`/posts/${postId}/bookmark/`, { method: before ? "DELETE" : "POST" });
    if (before && document.body.dataset.page === "saved") article.remove();
    toast(before ? "Removed from your saved posts." : "Saved for later.");
  } catch (error) {
    post.bookmarked_by_me = before;
    updateBookmarkUI(article, before);
    toast(error.message, { kind: "error" });
  }
}

function renderComment(comment, post, viewer) {
  const author = comment.author || {};
  const row = node("article", { className: "comment-row", attrs: { dataset: { commentId: comment.id } } });
  row.append(node("a", { attrs: { href: `/u/${encodeURIComponent(author.username || "")}/` } }, [avatar(author.avatar, author.full_name || author.username, "avatar avatar-small")]));
  const body = node("div", { className: "comment-body" });
  const head = node("div", { className: "comment-head" });
  head.append(node("a", { className: "comment-author", text: author.full_name || author.username || "Member", attrs: { href: `/u/${encodeURIComponent(author.username || "")}/` } }));
  head.append(node("time", { className: "post-time", text: timeAgo(comment.created_at), attrs: { dateTime: comment.created_at, title: new Date(comment.created_at).toLocaleString() } }));
  if (comment.edited) head.append(node("span", { className: "edited-label", text: "edited" }));
  body.append(head, node("p", { className: "comment-text", text: comment.text }));
  const actions = node("div", { className: "comment-actions" });
  actions.append(node("button", { className: `comment-like${comment.liked_by_me ? " is-liked" : ""}`, text: `♥ ${comment.likes_count || 0}`, attrs: { type: "button", dataset: { commentAction: "like", postId: post.id, commentId: comment.id }, "aria-pressed": Boolean(comment.liked_by_me) } }));
  if (Number(viewer?.id) === Number(author.id)) {
    actions.append(node("button", { className: "comment-edit", text: "Edit", attrs: { type: "button", dataset: { commentAction: "edit", postId: post.id, commentId: comment.id } } }));
    actions.append(node("button", { className: "comment-delete", text: "Delete", attrs: { type: "button", dataset: { commentAction: "delete", postId: post.id, commentId: comment.id } } }));
  } else if (Number(viewer?.id) === Number(post.author?.id)) {
    actions.append(node("button", { className: "comment-delete", text: "Delete", attrs: { type: "button", dataset: { commentAction: "delete", postId: post.id, commentId: comment.id } } }));
  }
  body.append(actions);
  row.append(body);
  return row;
}

async function loadComments(article, post, { reset = false } = {}) {
  let panel = article.querySelector("[data-comments-panel]");
  if (!panel) {
    panel = node("section", { className: "comments-panel", attrs: { dataset: { commentsPanel: "", offset: "0", hasMore: "true" }, "aria-label": "Comments" } });
    const form = node("form", { className: "comment-form", attrs: { dataset: { commentForm: "", postId: post.id } } });
    const input = node("input", { attrs: { type: "text", name: "text", maxlength: 500, placeholder: "Write a reply…", required: true, "aria-label": "Write a reply" } });
    form.append(input, node("button", { className: "button button-primary button-small", text: "Reply", attrs: { type: "submit" } }));
    const list = node("div", { className: "comment-list", attrs: { dataset: { commentList: "" } } });
    panel.append(form, list);
    article.append(panel);
  }
  panel.hidden = false;
  const list = panel.querySelector("[data-comment-list]");
  if (reset) { list.replaceChildren(); panel.dataset.offset = "0"; panel.dataset.hasMore = "true"; }
  if (panel.dataset.loading === "true" || panel.dataset.hasMore === "false") return;
  panel.dataset.loading = "true";
  try {
    const offset = Number(panel.dataset.offset) || 0;
    const data = await api.get(`/posts/${post.id}/comments/?limit=10&offset=${offset}`);
    for (const comment of data.results || []) list.append(renderComment(comment, post, state.user));
    panel.dataset.offset = String(offset + (data.results || []).length);
    panel.dataset.hasMore = String(Boolean(data.next));
    panel.querySelector("[data-more-comments]")?.remove();
    if (data.next) list.after(node("button", { className: "load-more-comments", text: "Load more comments", attrs: { type: "button", dataset: { moreComments: "", postId: post.id } } }));
    if (!offset && !data.results?.length) list.append(node("p", { className: "comment-empty", text: "Be the first to reply." }));
  } catch (error) { toast(error.message, { kind: "error" }); }
  finally { panel.dataset.loading = "false"; }
}

async function handlePostAction(button) {
  const article = button.closest("[data-post-id]");
  if (!article) return;
  const id = button.dataset.postId || article.dataset.postId;
  const post = postCache.get(String(id));
  if (!post) return;
  const action = button.dataset.postAction;
  if (action === "like") return toggleLike(button, article);
  if (action === "bookmark") return toggleBookmark(article);
  if (action === "comments") {
    const panel = article.querySelector("[data-comments-panel]");
    if (panel && !panel.hidden) panel.hidden = true;
    else await loadComments(article, post, { reset: !panel });
    return;
  }
  if (action === "more-comments") return loadComments(article, post);
  if (action === "edit") {
    button.closest("details")?.removeAttribute("open");
    const text = await editPostDialog(post);
    if (text === null) return;
    try {
      const updated = await api.patch(`/posts/${id}/`, { text });
      cachePost(updated);
      article.replaceWith(renderPost(updated, state.user));
      toast("Your post has been updated.");
    } catch (error) { toast(error.message, { kind: "error" }); }
    return;
  }
  if (action === "delete") {
    button.closest("details")?.removeAttribute("open");
    const confirmed = await openDialog({ title: "Delete this post?", message: "This will permanently remove the post and its comments.", confirmText: "Delete post", danger: true });
    if (!confirmed) return;
    try { await api.delete(`/posts/${id}/`); article.remove(); postCache.delete(String(id)); toast("Post deleted."); }
    catch (error) { toast(error.message, { kind: "error" }); }
    return;
  }
  if (action === "share") {
    const url = `${location.origin}/u/${encodeURIComponent(post.author.username)}/#post-${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "A post on CodeAlpha Connect", text: post.text.slice(0, 120), url });
      else { await navigator.clipboard.writeText(url); toast("Post link copied."); }
    } catch (error) { if (error.name !== "AbortError") toast("Could not share that post.", { kind: "error" }); }
  }
}

function wirePostActions() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-post-action]");
    if (button) {
      event.preventDefault();
      await handlePostAction(button);
      return;
    }
    const more = event.target.closest("[data-more-comments]");
    if (more) {
      const article = more.closest("[data-post-id]");
      const post = postCache.get(String(more.dataset.postId));
      if (article && post) await loadComments(article, post);
      return;
    }
    const commentButton = event.target.closest("[data-comment-action]");
    if (commentButton) await handleCommentAction(commentButton);
  });
  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-comment-form]");
    if (!form) return;
    event.preventDefault();
    const text = form.elements.text.value.trim();
    if (!text) return;
    const article = form.closest("[data-post-id]");
    const post = postCache.get(String(form.dataset.postId));
    const submit = form.querySelector("button[type=submit]");
    submit.disabled = true;
    try {
      const comment = await api.post(`/posts/${form.dataset.postId}/comments/`, { text });
      const list = article.querySelector("[data-comment-list]");
      article.querySelector(".comment-empty")?.remove();
      list.append(renderComment(comment, post, state.user));
      form.reset();
      post.comments_count = (Number(post.comments_count) || 0) + 1;
      article.querySelector("[data-comment-count]").textContent = String(post.comments_count);
    } catch (error) { toast(error.message, { kind: "error" }); }
    finally { submit.disabled = false; }
  });
}

async function handleCommentAction(button) {
  const postId = button.dataset.postId;
  const commentId = button.dataset.commentId;
  const row = button.closest("[data-comment-id]");
  const post = postCache.get(String(postId));
  if (button.dataset.commentAction === "edit") {
    const original = row.querySelector(".comment-text")?.textContent || "";
    const value = await editPostDialog({ text: original }, "Edit your reply");
    if (value === null) return;
    try {
      const updated = await api.patch(`/posts/${postId}/comments/${commentId}/`, { text: value });
      row.replaceWith(renderComment(updated, post, state.user));
      toast("Reply updated.");
    } catch (error) { toast(error.message, { kind: "error" }); }
    return;
  }
  if (button.dataset.commentAction === "delete") {
    const ok = await openDialog({ title: "Delete this reply?", message: "This reply will be removed from the conversation.", confirmText: "Delete reply", danger: true });
    if (!ok) return;
    try {
      await api.delete(`/posts/${postId}/comments/${commentId}/`);
      row.remove();
      post.comments_count = Math.max(0, (Number(post.comments_count) || 0) - 1);
      const article = button.closest("[data-post-id]");
      article.querySelector("[data-comment-count]").textContent = String(post.comments_count);
    } catch (error) { toast(error.message, { kind: "error" }); }
    return;
  }
  if (button.dataset.commentAction === "like") {
    const wasLiked = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", String(!wasLiked));
    button.classList.toggle("is-liked", !wasLiked);
    try {
      const response = await api.request(`/posts/${postId}/comments/${commentId}/like/`, { method: wasLiked ? "DELETE" : "POST" });
      button.textContent = `♥ ${response.likes_count}`;
    } catch (error) {
      button.setAttribute("aria-pressed", String(wasLiked)); button.classList.toggle("is-liked", wasLiked); toast(error.message, { kind: "error" });
    }
  }
}

function wireFeedTabs() {
  document.querySelectorAll("[data-feed-tab]").forEach((tab) => tab.addEventListener("click", () => setFeedMode(tab.dataset.feedTab)));
}

export function initFeed() {
  if (document.body.dataset.page !== "feed") {
    document.querySelectorAll("[data-open-composer]").forEach((button) => button.addEventListener("click", () => location.assign("/?compose=1")));
  }
  if (document.body.dataset.page === "feed") {
    const isGuest = !state.user;
    if (isGuest) {
      document.querySelector("[data-composer]")?.setAttribute("hidden", "");
      document.querySelector('[data-feed-tab="following"]')?.setAttribute("hidden", "");
    } else {
      wireComposer();
      wireFeedTabs();
    }
    setFeedMode(isGuest ? "explore" : "following");
    const sentinel = document.querySelector("[data-feed-sentinel]");
    feedObserver?.disconnect();
    feedObserver = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void loadFeedPage(); }, { rootMargin: "500px 0px" });
    if (sentinel) feedObserver.observe(sentinel);
    if (new URLSearchParams(location.search).get("compose") === "1") document.querySelector("[data-open-composer]")?.click();
  }
  if (document.body.dataset.page === "saved") {
    const list = document.querySelector("[data-saved-list]");
    const empty = document.querySelector("[data-saved-empty]");
    const load = async () => {
      if (savedLoading || !savedNext) return;
      savedLoading = true;
      try {
        const data = await api.get(`/posts/saved/?limit=${LIMIT}&offset=${savedOffset}`);
        if (!savedOffset) list.replaceChildren();
        appendPosts(list, data.results || []);
        savedOffset += (data.results || []).length;
        savedNext = Boolean(data.next);
        empty.hidden = Boolean(list.children.length);
      } catch (error) { toast(error.message, { kind: "error", retry: () => load() }); }
      finally { list.setAttribute("aria-busy", "false"); savedLoading = false; }
    };
    void load();
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) void load(); }, { rootMargin: "400px" });
    const sentinel = node("div", { className: "feed-sentinel" });
    list.after(sentinel);
    observer.observe(sentinel);
  }
  wirePostActions();
}

export function addPostToCache(post) { updateCached(post); }
