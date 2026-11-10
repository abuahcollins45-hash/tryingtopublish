// Grace Chapel: sign up, log in and social sign-in.
// Uses Firebase Authentication when firebase-config.js is filled in,
// otherwise falls back to a browser-only demo mode.
(function () {
  "use strict";

  const cfg = window.FIREBASE_CONFIG || {};
  const useFirebase = Boolean(cfg.apiKey) && !/^(PASTE|YOUR)/i.test(cfg.apiKey);
  const FIREBASE_VERSION = "10.12.2";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const $ = (id) => document.getElementById(id);
  const modal = $("auth-modal");
  const dialog = modal.querySelector(".modal-dialog");
  const loginForm = $("panel-login");
  const signupForm = $("panel-signup");
  const statusEl = $("auth-status");
  const bannerEl = $("auth-banner");
  const tabs = { login: $("tab-login"), signup: $("tab-signup") };
  const forms = { login: loginForm, signup: signupForm };
  const copy = {
    login: ["Welcome back", "Log in to reach member pages and prayer requests."],
    signup: ["Join our church family", "Create a free account. It takes under a minute."]
  };

  let backend = null;
  let lastFocus = null;
  let activeTab = "login";

  /* ---------- Friendly errors ---------- */
  const messages = {
    "auth/email-already-in-use": "An account with this email already exists. Try logging in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/user-not-found": "The email or password is incorrect.",
    "auth/wrong-password": "The email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Network problem. Check your connection and try again.",
    "auth/popup-closed-by-user": "The sign-in window was closed before you finished.",
    "auth/cancelled-popup-request": "",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow pop-ups for this page and try again.",
    "auth/account-exists-with-different-credential": "This email is already registered with a different sign-in method. Log in using that method first.",
    "auth/unauthorized-domain": "This web address is not authorised in Firebase. Add it under Authentication > Settings > Authorized domains.",
    "auth/operation-not-allowed": "This sign-in method is not turned on in your Firebase console yet.",
    "demo/social": "Google and Facebook sign-in need a free Firebase project. Follow SETUP.md, then paste your keys into firebase-config.js.",
    "demo/reset": "Password reset needs Firebase. Follow SETUP.md to switch it on."
  };
  function friendly(err) {
    if (err && Object.prototype.hasOwnProperty.call(messages, err.code)) return messages[err.code];
    console.error(err);
    return "Something went wrong. Please try again.";
  }

  /* ---------- Demo backend (browser only, not secure) ---------- */
  function createDemoBackend() {
    const USERS = "gc_demo_users";
    const SESSION = "gc_demo_session";
    const read = (key, fallback) => {
      try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
      catch (e) { return fallback; }
    };
    const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ } };
    const fail = (code) => { const e = new Error(code); e.code = code; return e; };
    async function hash(text) {
      if (window.crypto && window.crypto.subtle) {
        const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
      }
      return btoa(encodeURIComponent(text));
    }
    return {
      mode: "demo",
      async signUp(name, email, password) {
        const users = read(USERS, {});
        const key = email.toLowerCase();
        if (users[key]) throw fail("auth/email-already-in-use");
        users[key] = { name: name, email: email, hash: await hash(password) };
        write(USERS, users);
        const user = { name: name, email: email };
        write(SESSION, user);
        return user;
      },
      async logIn(email, password) {
        const record = read(USERS, {})[email.toLowerCase()];
        if (!record || record.hash !== (await hash(password))) throw fail("auth/invalid-credential");
        const user = { name: record.name, email: record.email };
        write(SESSION, user);
        return user;
      },
      async social() { throw fail("demo/social"); },
      async reset() { throw fail("demo/reset"); },
      async logOut() { try { localStorage.removeItem(SESSION); } catch (e) { /* ignore */ } },
      onChange(cb) { cb(read(SESSION, null)); }
    };
  }

  /* ---------- Firebase backend ---------- */
  async function createFirebaseBackend() {
    const base = "https://www.gstatic.com/firebasejs/" + FIREBASE_VERSION + "/";
    const appMod = await import(base + "firebase-app.js");
    const A = await import(base + "firebase-auth.js");
    const app = appMod.initializeApp(cfg);
    const auth = A.getAuth(app);
    const providers = {
      google: new A.GoogleAuthProvider(),
      facebook: new A.FacebookAuthProvider()
      // To add more: new A.OAuthProvider("microsoft.com"), new A.GithubAuthProvider(), etc.
    };
    const toUser = (u, fallbackName) => ({ name: u.displayName || fallbackName || u.email, email: u.email });
    return {
      mode: "firebase",
      async signUp(name, email, password) {
        const cred = await A.createUserWithEmailAndPassword(auth, email, password);
        await A.updateProfile(cred.user, { displayName: name });
        return toUser(cred.user, name);
      },
      async logIn(email, password) {
        const cred = await A.signInWithEmailAndPassword(auth, email, password);
        return toUser(cred.user);
      },
      async social(name) {
        const cred = await A.signInWithPopup(auth, providers[name]);
        return toUser(cred.user);
      },
      async reset(email) { await A.sendPasswordResetEmail(auth, email); },
      async logOut() { await A.signOut(auth); },
      onChange(cb) { A.onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null)); }
    };
  }

  /* ---------- UI helpers ---------- */
  function setStatus(text) { statusEl.textContent = text || ""; }

  function check(id, valid, message) {
    const input = $(id);
    input.parentElement.classList.toggle("invalid", !valid);
    (input.closest(".field") || input.parentElement).classList.toggle("invalid", !valid);
    input.setAttribute("aria-invalid", valid ? "false" : "true");
    $(id + "-error").textContent = valid ? "" : message;
    return valid;
  }

  function clearErrors() {
    modal.querySelectorAll(".error").forEach((el) => { el.textContent = ""; });
    modal.querySelectorAll(".field.invalid").forEach((el) => el.classList.remove("invalid"));
    modal.querySelectorAll("input[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    setStatus("");
  }

  function setBusy(busy) {
    modal.querySelectorAll("button[type=submit], .social-btn").forEach((b) => { b.disabled = busy; });
  }

  async function run(task) {
    if (!backend) { setStatus("Sign-in is not available right now. Check your connection and refresh the page."); return; }
    setBusy(true);
    try { await task(); }
    catch (err) { const msg = friendly(err); if (msg) setStatus(msg); }
    finally { setBusy(false); }
  }

  function closeMobileMenu() {
    const toggle = document.querySelector(".nav-toggle");
    if (toggle && toggle.getAttribute("aria-expanded") === "true") toggle.click();
  }

  function switchTab(name) {
    activeTab = name;
    Object.keys(tabs).forEach((key) => {
      const on = key === name;
      tabs[key].setAttribute("aria-selected", String(on));
      tabs[key].tabIndex = on ? 0 : -1;
      forms[key].hidden = !on;
    });
    $("auth-title").textContent = copy[name][0];
    $("auth-sub").textContent = copy[name][1];
    clearErrors();
  }

  function openModal(name) {
    lastFocus = document.activeElement;
    closeMobileMenu();
    switchTab(name || "login");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const first = forms[activeTab].querySelector("input");
    window.setTimeout(() => { if (first) first.focus(); }, 30);
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  /* ---------- Signed in / signed out state ---------- */
  function setUser(user) {
    const signedIn = Boolean(user);
    $("auth-nav-guest").hidden = signedIn;
    $("auth-nav-user").hidden = !signedIn;
    $("nav-members").hidden = !signedIn;
    $("members").hidden = !signedIn;
    if (!signedIn) return;

    const first = String(user.name || user.email || "friend").split(/[\s@]/)[0];
    $("user-name").textContent = first;
    $("members-name").textContent = first;

    // Pre-fill the contact form
    const contactName = $("name");
    const contactEmail = $("email");
    if (contactName && !contactName.value) contactName.value = user.name || "";
    if (contactEmail && !contactEmail.value) contactEmail.value = user.email || "";
  }

  function finish(user) {
    setUser(user);
    forms.login.reset();
    forms.signup.reset();
    closeModal();
    $("members").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Events ---------- */
  document.querySelectorAll("[data-auth-open]").forEach((btn) => {
    btn.addEventListener("click", () => openModal(btn.dataset.authOpen));
  });
  modal.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", closeModal));

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(dialog.querySelectorAll("button, input, a[href]"))
      .filter((el) => !el.disabled && el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  Object.keys(tabs).forEach((key) => {
    tabs[key].addEventListener("click", () => switchTab(key));
    tabs[key].addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const next = key === "login" ? "signup" : "login";
      switchTab(next);
      tabs[next].focus();
    });
  });

  modal.querySelectorAll(".pw-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const input = $(btn.dataset.toggle);
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "Hide" : "Show";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
  });

  modal.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", () => {
      const err = $(input.id + "-error");
      if (err) err.textContent = "";
      const field = input.closest(".field");
      if (field) field.classList.remove("invalid");
      input.removeAttribute("aria-invalid");
    });
  });

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    setStatus("");
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    const okEmail = check("login-email", EMAIL_RE.test(email), "Enter a valid email address.");
    const okPass = check("login-password", password.length > 0, "Enter your password.");
    if (!okEmail || !okPass) return;
    run(async () => finish(await backend.logIn(email, password)));
  });

  signupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    setStatus("");
    const name = $("signup-name").value.trim();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;
    const confirm = $("signup-confirm").value;
    const results = [
      check("signup-name", name.length > 0, "Enter your name."),
      check("signup-email", EMAIL_RE.test(email), "Enter a valid email address."),
      check("signup-password", password.length >= 8, "Use at least 8 characters."),
      check("signup-confirm", confirm === password && confirm.length > 0, "The passwords do not match.")
    ];
    if (results.includes(false)) return;
    run(async () => finish(await backend.signUp(name, email, password)));
  });

  modal.querySelectorAll(".social-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setStatus("");
      run(async () => finish(await backend.social(btn.dataset.provider)));
    });
  });

  $("forgot-btn").addEventListener("click", () => {
    setStatus("");
    const email = $("login-email").value.trim();
    if (!check("login-email", EMAIL_RE.test(email), "Enter your email here first, then choose Forgot your password.")) return;
    run(async () => {
      await backend.reset(email);
      setStatus("If an account exists for " + email + ", a reset link is on its way.");
    });
  });

  $("btn-logout").addEventListener("click", async () => {
    try { if (backend) await backend.logOut(); } catch (err) { console.error(err); }
    setUser(null);
    if (location.hash === "#members") location.hash = "#top";
  });

  /* ---------- Start ---------- */
  if (!useFirebase) {
    bannerEl.textContent = "Demo mode: accounts are saved only in this browser. Google and Facebook sign-in turn on after you add your Firebase keys (see SETUP.md).";
    bannerEl.hidden = false;
  }

  const starting = useFirebase ? createFirebaseBackend() : Promise.resolve(createDemoBackend());
  starting.then((b) => { backend = b; b.onChange(setUser); })
    .catch((err) => {
      console.error(err);
      bannerEl.textContent = "Could not load Firebase. Check your internet connection and the values in firebase-config.js.";
      bannerEl.hidden = false;
    });
})();