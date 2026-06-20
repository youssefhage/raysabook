/* ===================================================================
   Ray's Book — storefront logic (vanilla JS, no build step)
   Catalog is loaded from books.js as window.BOOKS
   =================================================================== */

/* ====== CONFIG — EDIT THESE ====== */
// WhatsApp number in FULL international format, digits only (no +, spaces or dashes).
// Example for +961 70 123 456  ->  "96170123456"
const WHATSAPP_NUMBER = "9613345683";   // +961 3 345683
const STORE_NAME = "RaysABook";
const COVER_BASE = "https://clzbooks.r.sizr.io";
/* ================================= */

const PAGE = 60;                 // items rendered per chunk
const CART_KEY = "raysbook_cart_v1";

const BOOKS = (window.BOOKS || []).map((b, i) => ({ ...b, _i: i }));

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const norm = (s) => (s || "").toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "");      // strip accents for search
const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// deterministic colour for spine fallback — restrained on-brand blues / slates / navy
const PALETTE = ["#1b6699", "#2380bc", "#13384d", "#2f4a5a", "#1f5f7a", "#0f3a52", "#34566b", "#27607d", "#1a4c6b", "#22343f"];
function colorFor(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
function coverURL(b) { return b.cover ? COVER_BASE + b.cover : ""; }

/* inline SVG icons (premium, no emoji) */
const ICON = {
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
};

/* search index (precomputed lowercased blob) */
BOOKS.forEach(b => { b._s = norm([b.title, b.author, b.isbn, b.publisher].join(" ")); });

/* ---------- state ---------- */
let cart = loadCart();
let filtered = BOOKS;
let shown = 0;
const state = { q: "", format: "", decade: "", genre: "", sort: "title" };

/* ---------- cart persistence ---------- */
function loadCart() {
  try { return new Set(JSON.parse(localStorage.getItem(CART_KEY) || "[]").map(String)); }
  catch { return new Set(); }
}
function saveCart() { localStorage.setItem(CART_KEY, JSON.stringify([...cart])); }

/* ---------- build filter option lists ---------- */
function buildFilters() {
  const fmt = new Map(), gen = new Map();
  for (const b of BOOKS) {
    if (b.format) fmt.set(b.format, (fmt.get(b.format) || 0) + 1);
    if (b.genre) gen.set(b.genre, (gen.get(b.genre) || 0) + 1);
  }
  // formats: only show reasonably common ones to avoid a huge list
  const fmtOpts = [...fmt.entries()].filter(([, n]) => n >= 5).sort((a, b) => b[1] - a[1]);
  const genOpts = [...gen.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]);

  const fSel = $("#fFormat");
  fmtOpts.forEach(([v, n]) => fSel.appendChild(opt(v, `${v} (${n})`)));
  const gSel = $("#fGenre");
  genOpts.forEach(([v, n]) => gSel.appendChild(opt(v, `${v} (${n})`)));

  // decades from years
  const decades = new Map();
  for (const b of BOOKS) {
    const y = parseInt((b.year || "").slice(0, 4), 10);
    if (y > 1000 && y < 2100) { const d = Math.floor(y / 10) * 10; decades.set(d, (decades.get(d) || 0) + 1); }
  }
  const dSel = $("#fDecade");
  [...decades.entries()].sort((a, b) => b[0] - a[0]).forEach(([d, n]) => dSel.appendChild(opt(String(d), `${d}s (${n})`)));
}
function opt(v, label) { const o = document.createElement("option"); o.value = v; o.textContent = label; return o; }

/* ---------- filtering & sorting ---------- */
function apply() {
  const q = norm(state.q.trim());
  const terms = q ? q.split(/\s+/) : [];
  const dec = state.decade ? parseInt(state.decade, 10) : null;

  filtered = BOOKS.filter(b => {
    if (state.format && b.format !== state.format) return false;
    if (state.genre && b.genre !== state.genre) return false;
    if (dec !== null) {
      const y = parseInt((b.year || "").slice(0, 4), 10);
      if (!(y >= dec && y < dec + 10)) return false;
    }
    if (terms.length) { for (const t of terms) if (!b._s.includes(t)) return false; }
    return true;
  });

  const s = state.sort;
  filtered = filtered.slice().sort((a, b) => {
    if (s === "year_desc") return (yr(b) - yr(a)) || a.title.localeCompare(b.title);
    if (s === "year_asc") return (yr(a) - yr(b)) || a.title.localeCompare(b.title);
    if (s === "author") return (a.author || "~").localeCompare(b.author || "~") || a.title.localeCompare(b.title);
    return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  });

  shown = 0;
  $("#grid").innerHTML = "";
  $("#resultCount").textContent = filtered.length.toLocaleString() + " book" + (filtered.length === 1 ? "" : "s");
  renderChips();
  renderMore();
  $("#empty").style.display = filtered.length ? "none" : "block";
}
function yr(b) { const y = parseInt((b.year || "").slice(0, 4), 10); return isNaN(y) ? -1 : y; }

/* ---------- rendering ---------- */
function cardHTML(b) {
  const inCart = cart.has(String(b.id));
  const url = coverURL(b);
  const cov = url
    ? `<img loading="lazy" src="${esc(url)}" alt="${esc(b.title)}" onerror="this.replaceWith(spineEl(${b._i}))">`
    : spineMarkup(b);
  const fmt = b.format ? `<span class="fmt">${esc(b.format)}</span>` : "";
  const sub = [b.year, b.publisher].filter(Boolean).join(" · ");
  return `<article class="card" data-i="${b._i}">
    <div class="cover" onclick="openDetail(${b._i})">${cov}${fmt}<span class="sheen"></span></div>
    <div class="meta" onclick="openDetail(${b._i})">
      <div class="t">${esc(b.title)}</div>
      <div class="a">${esc(b.author || "Unknown author")}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ""}
    </div>
    <button class="add ${inCart ? "in" : ""}" data-id="${esc(String(b.id))}" onclick="toggleCart(this)" aria-label="Add to enquiry">
      <span class="ai">${ICON.plus}</span><span class="ai in">${ICON.check}</span>
      <span class="al">${inCart ? "In enquiry" : "Add to enquiry"}</span>
    </button>
  </article>`;
}
function spineMarkup(b) {
  const c = colorFor(b.title || "x");
  return `<div class="spine" style="background:linear-gradient(155deg,${shade(c, 14)},${shade(c, -22)})">
    <div class="spine-frame">
      <div class="st">${esc(b.title)}</div>
      ${b.author ? `<div class="sa">${esc(b.author)}</div>` : ""}
    </div>
    <div class="spine-brand">RAYS<span>A</span>BOOK</div>
  </div>`;
}
// used by onerror to swap a broken image for the spine fallback
window.spineEl = function (i) {
  const b = BOOKS[i]; const d = document.createElement("div");
  d.innerHTML = spineMarkup(b); return d.firstElementChild;
};
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, bl = (n & 255) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); bl = Math.max(0, Math.min(255, bl));
  return "#" + ((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0");
}

function renderMore() {
  const next = filtered.slice(shown, shown + PAGE);
  if (!next.length) { $("#more").style.display = "none"; return; }
  const frag = document.createElement("div");
  frag.innerHTML = next.map(cardHTML).join("");
  const grid = $("#grid");
  while (frag.firstChild) grid.appendChild(frag.firstChild);
  shown += next.length;
  $("#more").style.display = shown < filtered.length ? "block" : "none";
}

function renderChips() {
  const c = $("#chips"); c.innerHTML = "";
  const add = (label, key) => {
    const el = document.createElement("span"); el.className = "chip";
    el.innerHTML = `${esc(label)} <button title="Remove">×</button>`;
    el.querySelector("button").onclick = () => { state[key] = ""; syncControls(); apply(); };
    c.appendChild(el);
  };
  if (state.format) add(state.format, "format");
  if (state.genre) add(state.genre, "genre");
  if (state.decade) add(state.decade + "s", "decade");
}
function syncControls() {
  $("#fFormat").value = state.format; $("#fGenre").value = state.genre;
  $("#fDecade").value = state.decade; $("#fSort").value = state.sort;
}

/* ---------- cart ---------- */
function setAddBtn(btn, inCart) {
  btn.classList.toggle("in", inCart);
  const lbl = btn.querySelector(".al");
  if (lbl) lbl.textContent = inCart ? "In enquiry" : "Add to enquiry";
  else btn.textContent = inCart ? "In enquiry" : "Add to enquiry";
}
window.toggleCart = function (btn) {
  const id = String(btn.dataset.id);
  if (cart.has(id)) { cart.delete(id); setAddBtn(btn, false); }
  else { cart.add(id); setAddBtn(btn, true); toast("Added to your enquiry"); }
  saveCart(); updateCartCount();
};
function updateCartCount() {
  const n = cart.size; const el = $("#cartCount");
  el.textContent = n; el.classList.toggle("zero", n === 0);
}
function openCart() { $("#scrim").classList.add("open"); $("#drawer").classList.add("open"); renderCart(); }
function closeCart() { $("#scrim").classList.remove("open"); $("#drawer").classList.remove("open"); }

function renderCart() {
  const wrap = $("#ditems");
  const items = [...cart].map(id => BOOKS.find(b => String(b.id) === id)).filter(Boolean);
  if (!items.length) {
    wrap.innerHTML = `<div class="cartempty"><div class="big">Your enquiry list is empty</div>
      <div>Browse the catalog and add the books you’re interested in. We’ll send the list to ${esc(STORE_NAME)} on WhatsApp to ask about availability & price.</div></div>`;
  } else {
    wrap.innerHTML = items.map(b => {
      const url = coverURL(b);
      const ic = url ? `<img src="${esc(url)}" onerror="this.replaceWith(spineMiniEl(${b._i}))">`
        : spineMini(b);
      return `<div class="ditem">
        <div class="ic">${ic}</div>
        <div class="info">
          <div class="t">${esc(b.title)}</div>
          <div class="a">${esc(b.author || "Unknown author")}${b.year ? " · " + esc(b.year) : ""}</div>
          <button class="rm" data-id="${esc(String(b.id))}">Remove</button>
        </div></div>`;
    }).join("");
    $$("#ditems .rm").forEach(btn => btn.onclick = () => {
      cart.delete(String(btn.dataset.id)); saveCart(); updateCartCount(); renderCart(); refreshAddButtons();
    });
  }
  $("#waBtn").disabled = items.length === 0;
  $("#cartTitle").textContent = `Enquiry (${items.length})`;
}
function spineMini(b) { const c = colorFor(b.title || "x"); return `<div class="mini" style="background:${c}">${esc((b.title || "?")[0].toUpperCase())}</div>`; }
window.spineMiniEl = function (i) { const d = document.createElement("div"); d.innerHTML = spineMini(BOOKS[i]); return d.firstElementChild; };

function refreshAddButtons() {
  $$(".card .add").forEach(btn => setAddBtn(btn, cart.has(String(btn.dataset.id))));
}

/* ---------- WhatsApp ---------- */
function sendWhatsApp() {
  const items = [...cart].map(id => BOOKS.find(b => String(b.id) === id)).filter(Boolean);
  if (!items.length) return;
  const n = items.length;
  const yearOf = (y) => { const m = (y || "").match(/\d{4}/); return m ? m[0] : (y || ""); };
  let msg = `*Hello ${STORE_NAME}!*\n\n`;
  msg += `I'd like to enquire about the availability and price of ${n === 1 ? "this book" : `these ${n} books`}:\n`;
  items.forEach((b, i) => {
    msg += `\n${i + 1}. *${b.title}*\n`;
    const meta = [b.author, yearOf(b.year), b.format].filter(Boolean).join(" · ");
    if (meta) msg += `    ${meta}\n`;
    if (b.isbn) msg += `    ISBN ${b.isbn}\n`;
  });
  msg += `\nThank you!`;
  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(url, "_blank");
}

/* ---------- detail modal ---------- */
window.openDetail = function (i) {
  const b = BOOKS[i]; const url = coverURL(b);
  $("#mCover").innerHTML = url ? `<img src="${esc(url)}" onerror="this.replaceWith(spineEl(${i}))">` : spineMarkup(b);
  $("#mTitle").textContent = b.title;
  $("#mBy").textContent = b.author ? "by " + b.author : "";
  const rows = [["Format", b.format], ["Year", b.year], ["Publisher", b.publisher], ["Pages", b.pages], ["Genre", b.genre], ["ISBN", b.isbn]]
    .filter(([, v]) => v).map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join("");
  $("#mMeta").innerHTML = rows;
  const ab = $("#mAdd"); ab.dataset.id = String(b.id);
  ab.className = "add add-lg";
  ab.innerHTML = `<span class="ai">${ICON.plus}</span><span class="ai in">${ICON.check}</span><span class="al"></span>`;
  setAddBtn(ab, cart.has(String(b.id)));
  $("#modal").classList.add("open");
};
function closeModal() { $("#modal").classList.remove("open"); }

/* ---------- toast ---------- */
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1600); }

/* ---------- wire up ---------- */
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function init() {
  const totalStr = BOOKS.length.toLocaleString();
  ["#statTotal", "#statTotal2", "#statTotal3"].forEach(id => { const el = $(id); if (el) el.textContent = totalStr; });
  $("#yearNow").textContent = new Date().getFullYear();
  buildFilters();
  updateCartCount();
  apply();

  const search = $("#search");
  search.addEventListener("input", debounce(e => {
    state.q = e.target.value; $(".clr").style.display = e.target.value ? "block" : "none"; apply();
  }, 130));
  $(".clr").onclick = () => { search.value = ""; state.q = ""; $(".clr").style.display = "none"; apply(); search.focus(); };

  $("#fFormat").onchange = e => { state.format = e.target.value; apply(); };
  $("#fGenre").onchange = e => { state.genre = e.target.value; apply(); };
  $("#fDecade").onchange = e => { state.decade = e.target.value; apply(); };
  $("#fSort").onchange = e => { state.sort = e.target.value; apply(); };

  $("#more").onclick = renderMore;
  // infinite scroll
  const io = new IntersectionObserver(es => { if (es[0].isIntersecting) renderMore(); }, { rootMargin: "800px" });
  io.observe($("#sentinel"));

  $("#cartOpen").onclick = openCart;
  $("#scrim").onclick = closeCart;
  $("#cartClose").onclick = closeCart;
  $("#waBtn").onclick = sendWhatsApp;
  $("#clearCart").onclick = () => { if (confirm("Clear all books from your enquiry list?")) { cart.clear(); saveCart(); updateCartCount(); renderCart(); refreshAddButtons(); } };

  $("#mClose").onclick = closeModal;
  $("#modal").onclick = e => { if (e.target.id === "modal") closeModal(); };
  $("#mAdd").onclick = function () { toggleCart(this); refreshAddButtons(); };

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeModal(); closeCart(); }
    if (e.key === "/" && document.activeElement !== search) { e.preventDefault(); search.focus(); }
  });

  // when drawer changes cart, keep grid buttons in sync on close
  $("#drawer").addEventListener("transitionend", refreshAddButtons);

  // WhatsApp config warning
  if (WHATSAPP_NUMBER === "00000000000") {
    console.warn("[Ray's Book] Set WHATSAPP_NUMBER in app.js to your real number for the enquiry button to work.");
  }
}

document.addEventListener("DOMContentLoaded", init);
