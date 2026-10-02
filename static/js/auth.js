import { api } from "./api.js";
import { setUser } from "./state.js";
import { toast } from "./ui.js";

function formDataObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function showError(target, error) {
  if (!target) return;
  target.textContent = error.message || "Something went wrong. Please try again.";
  target.hidden = false;
}

function clearFieldErrors(form) {
  form.querySelectorAll("[data-inline-error]").forEach((item) => item.remove());
  form.querySelectorAll("[aria-invalid='true']").forEach((item) => item.removeAttribute("aria-invalid"));
}

function showFieldErrors(form, error) {
  const details = error.details;
  if (!details || Array.isArray(details) || typeof details !== "object") return;
  for (const [fieldName, rawMessages] of Object.entries(details)) {
    const input = form.elements.namedItem(fieldName);
    if (!input || !input.insertAdjacentElement) continue;
    const line = document.createElement("span");
    line.className = "field-error";
    line.dataset.inlineError = "";
    line.textContent = Array.isArray(rawMessages) ? rawMessages.join(" ") : String(rawMessages);
    input.setAttribute("aria-invalid", "true");
    input.insertAdjacentElement("afterend", line);
  }
}

function setBusy(form, busy, label = "Please wait…") {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = label;
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalLabel || button.textContent;
  }
}

function redirectAfterAuth() {
  const target = new URLSearchParams(location.search).get("next");
  location.assign(target?.startsWith("/") && !target.startsWith("//") ? target : "/");
}

async function wireLogin() {
  const form = document.querySelector("[data-login-form]");
  if (!form) return;
  const registrationSuccess = document.querySelector("[data-registration-success]");
  if (new URLSearchParams(location.search).get("registered") === "1") registrationSuccess.hidden = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = form.querySelector("[data-form-error]");
    errorBox.hidden = true;
    clearFieldErrors(form);
    setBusy(form, true, "Signing in…");
    try {
      const user = await api.post("/auth/login/", formDataObject(form));
      setUser(user);
      redirectAfterAuth();
    } catch (error) {
      showError(errorBox, error);
      showFieldErrors(form, error);
      form.querySelector('[name="password"]')?.focus();
    } finally { setBusy(form, false); }
  });
}

async function wireRegister() {
  const form = document.querySelector("[data-register-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = form.querySelector("[data-form-error]");
    errorBox.hidden = true;
    clearFieldErrors(form);
    const values = formDataObject(form);
    if (values.password !== values.password_confirm) {
      showError(errorBox, { message: "Your passwords don’t match yet." });
      form.querySelector('[name="password_confirm"]')?.focus();
      return;
    }
    setBusy(form, true, "Creating your account…");
    try {
      await api.post("/auth/register/", values);
      location.assign("/login/?registered=1");
    } catch (error) { showError(errorBox, error); showFieldErrors(form, error); }
    finally { setBusy(form, false); }
  });
}

async function wirePasswordReset() {
  const requestForm = document.querySelector("[data-password-reset-form]");
  if (requestForm) requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = requestForm.querySelector("[data-form-error]");
    errorBox.hidden = true;
    setBusy(requestForm, true, "Sending…");
    try {
      await api.post("/auth/password-reset/", formDataObject(requestForm));
      const note = document.createElement("p");
      note.className = "success-note";
      note.setAttribute("role", "status");
      note.textContent = "If the account exists, reset instructions have been sent to your email.";
      requestForm.replaceWith(note);
    } catch (error) { showError(errorBox, error); }
    finally { setBusy(requestForm, false); }
  });

  const confirmForm = document.querySelector("[data-password-reset-confirm]");
  if (confirmForm) {
    const params = new URLSearchParams(location.search);
    const uid = params.get("uid");
    const token = params.get("token");
    if (uid && token) {
      confirmForm.hidden = false;
      requestForm?.setAttribute("hidden", "");
      confirmForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const errorBox = confirmForm.querySelector("[data-form-error]");
        errorBox.hidden = true;
        const values = formDataObject(confirmForm);
        if (values.password !== values.password_confirm) {
          showError(errorBox, { message: "Your passwords don’t match yet." });
          return;
        }
        setBusy(confirmForm, true, "Updating password…");
        try {
          await api.post("/auth/password-reset/confirm/", { uid, token, password: values.password });
          toast("Password updated. You can sign in now.");
          location.assign("/login/");
        } catch (error) { showError(errorBox, error); }
        finally { setBusy(confirmForm, false); }
      });
    }
  }
}

function wireAccountMenu() {
  const trigger = document.querySelector("[data-user-menu]");
  const panel = document.querySelector("[data-user-menu-panel]");
  trigger?.addEventListener("click", () => { panel.hidden = !panel.hidden; });
  document.addEventListener("click", (event) => {
    if (panel && trigger && !panel.contains(event.target) && !trigger.contains(event.target)) panel.hidden = true;
  });
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try { await api.post("/auth/logout/", {}); } catch { /* Clearing local state still ends this browser session. */ }
    setUser(null);
    location.assign("/login/");
  });
}

function populateSummary(user) {
  if (!user) return;
  const profile = user.profile || {};
  const name = user.full_name || user.username;
  const setText = (selector, text) => { const item = document.querySelector(selector); if (item) item.textContent = text; };
  setText("[data-summary-name]", name);
  setText("[data-summary-handle]", `@${user.username}`);
  setText("[data-summary-bio]", profile.bio || "Share a little about yourself.");
  setText("[data-summary-followers] b", String(user.followers_count ?? 0));
  setText("[data-summary-following] b", String(user.following_count ?? 0));
  const avatar = document.querySelector("[data-summary-avatar]");
  if (avatar) {
    avatar.replaceChildren();
    if (profile.avatar) {
      const image = document.createElement("img"); image.src = profile.avatar; image.alt = ""; avatar.append(image);
    } else avatar.textContent = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  }
  const initialTargets = ["[data-composer-initials]"];
  for (const selector of initialTargets) setText(selector, name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase());
  const composerAvatar = document.querySelector("[data-composer-avatar]");
  if (composerAvatar && profile.avatar) { const image = document.createElement("img"); image.src = profile.avatar; image.alt = ""; composerAvatar.replaceChildren(image); }
  const menuTrigger = document.querySelector("[data-user-menu]");
  if (menuTrigger) {
    if (profile.avatar) {
      const image = document.createElement("img"); image.src = profile.avatar; image.alt = ""; menuTrigger.replaceChildren(image);
    } else setText("[data-user-initials]", name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase());
  }
}

export async function initAuth() {
  wireAccountMenu();
  await Promise.all([wireLogin(), wireRegister(), wirePasswordReset()]);
  const isProtected = document.body.dataset.protected === "true";
  const isAuthPage = ["login", "register"].includes(document.body.dataset.page);
  try {
    const user = await api.get("/auth/me/");
    setUser(user);
    let summary = user;
    try { summary = { ...user, ...(await api.get(`/users/${encodeURIComponent(user.username)}/`)), profile: user.profile }; }
    catch { /* The private user record still contains enough to fill the summary. */ }
    populateSummary(summary);
    if (isAuthPage) redirectAfterAuth();
    document.dispatchEvent(new CustomEvent("connect:authenticated", { detail: user }));
  } catch (error) {
    setUser(null);
    if (error.status === 0) {
      toast(error.message, { kind: "error", timeout: 10000, retry: () => location.reload() });
      return;
    }
    if (isProtected) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace(`/login/?next=${next}`);
    }
  }
  window.addEventListener("connect:session-expired", () => {
    if (document.body.dataset.protected === "true") location.replace(`/login/?next=${encodeURIComponent(location.pathname + location.search)}`);
  });
}
