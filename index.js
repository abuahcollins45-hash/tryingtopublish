// Grace Chapel: site behaviour
(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");

  // Header turns white after scrolling past the hero top
  function onScroll() {
    header.classList.toggle("scrolled", window.scrollY > 40);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Mobile menu
  function setMenu(open) {
    nav.classList.toggle("open", open);
    header.classList.toggle("menu-open", open && !header.classList.contains("scrolled"));
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }
  toggle.addEventListener("click", function () {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });
  nav.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setMenu(false);
  });

  // Footer year
  document.getElementById("year").textContent = new Date().getFullYear();

  // Contact form validation (front-end only; connect to a backend or form service to receive messages)
  const form = document.getElementById("contact-form");
  const status = document.getElementById("form-status");

  function showError(id, text) {
    const input = document.getElementById(id);
    const error = document.getElementById(id.replace("message-text", "message") + "-error");
    input.parentElement.classList.toggle("invalid", Boolean(text));
    input.setAttribute("aria-invalid", text ? "true" : "false");
    error.textContent = text;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.textContent = "";

    const name = form.elements["name"].value.trim();
    const email = form.elements["email"].value.trim();
    const message = form.elements["message"].value.trim();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    showError("name", name ? "" : "Enter your name.");
    showError("email", emailOk ? "" : "Enter a valid email address.");
    showError("message-text", message ? "" : "Write a short message.");

    if (name && emailOk && message) {
      form.reset();
      status.textContent = "Thank you, " + name + ". We have your message and will reply soon.";
    }
  });
})();