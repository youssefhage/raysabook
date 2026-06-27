/* ===================================================================
   RaysABook — admin portal (Supabase auth + CRUD + cover upload)
   =================================================================== */
const sb = window.supabase.createClient(window.SB_URL, window.SB_KEY);
const COVERS = window.SB_URL + "/storage/v1/object/public/covers/";

const $ = (s) => document.querySelector(s);
const esc = (s) => (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const PALETTE = ["#1b6699", "#2380bc", "#13384d", "#2f4a5a", "#1f5f7a", "#0f3a52", "#34566b"];
const colorFor = (s) => { let h = 0; for (let i = 0; i < (s || "x").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; };

let editingId = null;        // null = adding
let editingCoverPath = "";   // existing cover when editing
let newCoverBlob = null;     // resized blob to upload on save
let genreTags;               // genre tag-input widget

/* ---------- toast ---------- */
let toastT;
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800); }

/* ---------- auth ---------- */
async function refreshAuth() {
  const { data } = await sb.auth.getSession();
  const session = data.session;
  if (session) {
    $("#loginView").style.display = "none";
    $("#appView").style.display = "block";
    $("#who").textContent = session.user.email;
    loadRows("");
  } else {
    $("#appView").style.display = "none";
    $("#loginView").style.display = "block";
  }
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#loginBtn"), msg = $("#loginMsg");
  btn.disabled = true; msg.className = "msg"; msg.textContent = "Signing in…";
  const { error } = await sb.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
  btn.disabled = false;
  if (error) { msg.className = "msg err"; msg.textContent = error.message; return; }
  msg.textContent = ""; refreshAuth();
});
$("#logoutBtn").onclick = async () => { await sb.auth.signOut(); refreshAuth(); };

/* ---------- list ---------- */
let searchT;
$("#adminSearch").addEventListener("input", (e) => { clearTimeout(searchT); searchT = setTimeout(() => loadRows(e.target.value.trim()), 200); });

async function loadRows(q) {
  const rowsEl = $("#rows"), empty = $("#emptyState");
  rowsEl.innerHTML = '<div class="empty-state">Loading…</div>';
  let query = sb.from("books").select("id,clz_id,title,author,year,format,isbn,publisher,pages,genre,cover_path");
  if (q) {
    const safe = q.replace(/[,%()]/g, " ");
    query = query.or(`title.ilike.%${safe}%,author.ilike.%${safe}%,isbn.ilike.%${safe}%`);
  }
  query = query.order("created_at", { ascending: false }).limit(80);
  const { data, error } = await query;
  if (error) { rowsEl.innerHTML = `<div class="empty-state">Error: ${esc(error.message)}</div>`; return; }
  $("#adminCount").textContent = data.length ? `${data.length}${data.length === 80 ? "+" : ""} shown` : "";
  if (!data.length) { rowsEl.innerHTML = ""; empty.style.display = "block"; return; }
  empty.style.display = "none";
  rowsEl.innerHTML = data.map(b => {
    const cov = b.cover_path
      ? `<img src="${COVERS}${esc(b.cover_path)}" onerror="this.replaceWith(miniEl(${b.id}))">`
      : `<div class="mini" style="background:${colorFor(b.title)}">${esc((b.title || "?")[0].toUpperCase())}</div>`;
    const sub = [b.author || "Unknown author", b.year].filter(Boolean).join(" · ");
    return `<div class="row" data-id="${b.id}">
      <div class="ic">${cov}</div>
      <div class="info"><div class="t">${esc(b.title)}</div><div class="a">${esc(sub)}</div></div>
      <div class="acts">
        <button class="btn" onclick='editRow(${JSON.stringify(b)})'>Edit</button>
      </div>
    </div>`;
  }).join("");
}
window.miniEl = function (id) { const d = document.createElement("div"); d.className = "mini"; d.style.background = "#2f4a5a"; d.textContent = "?"; return d; };

/* ---------- editor ---------- */
function openEditor() { $("#edScrim").classList.add("open"); $("#edMsg").textContent = ""; }
function closeEditor() { $("#edScrim").classList.remove("open"); }
$("#edCancel").onclick = closeEditor;
$("#edScrim").addEventListener("click", (e) => { if (e.target.id === "edScrim") closeEditor(); });

function setForm(b) {
  $("#f_title").value = b.title || ""; $("#f_author").value = b.author || "";
  $("#f_year").value = b.year || ""; $("#f_format").value = b.format || "";
  $("#f_publisher").value = b.publisher || "";
  $("#f_pages").value = b.pages || ""; $("#f_isbn").value = b.isbn || "";
  if (genreTags) genreTags.set((b.genre || "").split(" | ").map(s => s.trim()).filter(Boolean));
  isbnHint();
  const prev = $("#coverPrev");
  prev.innerHTML = b.cover_path ? `<img src="${COVERS}${esc(b.cover_path)}">` : "";
}

$("#addBtn").onclick = () => {
  editingId = null; editingCoverPath = ""; newCoverBlob = null;
  $("#edTitle").textContent = "Add book";
  $("#edDelete").style.display = "none";
  setForm({});
  $("#f_cover").value = "";
  openEditor();
};

window.editRow = function (b) {
  editingId = b.id; editingCoverPath = b.cover_path || ""; newCoverBlob = null;
  $("#edTitle").textContent = "Edit book";
  $("#edDelete").style.display = "inline-flex";
  setForm(b);
  $("#f_cover").value = "";
  openEditor();
};

/* resize chosen image to a small webp thumbnail */
$("#f_cover").addEventListener("change", async (e) => {
  const file = e.target.files[0]; if (!file) { newCoverBlob = null; return; }
  try {
    newCoverBlob = await resizeToWebp(file, 400);
    $("#coverPrev").innerHTML = `<img src="${URL.createObjectURL(newCoverBlob)}">`;
  } catch (err) { $("#edMsg").className = "msg err"; $("#edMsg").textContent = "Couldn’t read that image."; }
});

function resizeToWebp(file, maxW) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      c.toBlob(b => b ? resolve(b) : reject(new Error("encode failed")), "image/webp", 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$("#edSave").onclick = async () => {
  const title = $("#f_title").value.trim();
  const msg = $("#edMsg");
  if (!title) { msg.className = "msg err"; msg.textContent = "Title is required."; return; }
  $("#edSave").disabled = true; msg.className = "msg"; msg.textContent = "Saving…";
  try {
    let cover_path = editingCoverPath;
    if (newCoverBlob) {
      const name = `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.webp`;
      const { error: upErr } = await sb.storage.from("covers").upload(name, newCoverBlob, { contentType: "image/webp", upsert: true });
      if (upErr) throw upErr;
      cover_path = name;
    }
    const rec = {
      title, author: $("#f_author").value.trim(), year: $("#f_year").value.trim(),
      format: $("#f_format").value.trim(), genre: genreTags.get().join(" | "),
      publisher: $("#f_publisher").value.trim(), pages: $("#f_pages").value.trim(),
      isbn: normIsbn($("#f_isbn").value), cover_path
    };
    if (editingId == null) {
      const { error } = await sb.from("books").insert(rec); if (error) throw error;
      toast("Book added");
    } else {
      const { error } = await sb.from("books").update(rec).eq("id", editingId); if (error) throw error;
      toast("Book updated");
    }
    closeEditor(); loadRows($("#adminSearch").value.trim());
  } catch (e) {
    msg.className = "msg err"; msg.textContent = e.message || "Save failed.";
  } finally { $("#edSave").disabled = false; }
};

$("#edDelete").onclick = async () => {
  if (editingId == null) return;
  if (!confirm("Delete this book permanently?")) return;
  $("#edDelete").disabled = true;
  try {
    const { error } = await sb.from("books").delete().eq("id", editingId); if (error) throw error;
    if (editingCoverPath) sb.storage.from("covers").remove([editingCoverPath]);
    toast("Book deleted"); closeEditor(); loadRows($("#adminSearch").value.trim());
  } catch (e) { $("#edMsg").className = "msg err"; $("#edMsg").textContent = e.message || "Delete failed."; }
  finally { $("#edDelete").disabled = false; }
};

document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });

/* ---------- autocomplete + tags (keep data clean) ---------- */
async function suggestField(field, q) { const { data } = await sb.rpc("field_suggestions", { field, q, lim: 10 }); return data || []; }
async function suggestGenre(q) { const { data } = await sb.rpc("genre_tokens", { q, lim: 14 }); return data || []; }

function sgHTML(items, active) {
  return items.map((s, i) => `<div class="sg-item${i === active ? " on" : ""}" data-i="${i}"><span>${esc(s.value)}</span><span class="sg-n">${s.freq}</span></div>`).join("");
}

function attachCombo(input, fetcher) {
  const wrap = document.createElement("div"); wrap.className = "combo";
  input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  const box = document.createElement("div"); box.className = "suggest"; box.style.display = "none"; wrap.appendChild(box);
  let items = [], active = -1, t;
  const close = () => { box.style.display = "none"; active = -1; };
  function paint() {
    if (!items.length) { close(); return; }
    box.innerHTML = sgHTML(items, active); box.style.display = "block";
    [...box.children].forEach(el => el.onmousedown = (e) => { e.preventDefault(); choose(+el.dataset.i); });
  }
  function choose(i) { if (items[i]) { input.value = items[i].value; close(); input.dispatchEvent(new Event("change")); } }
  const load = () => { clearTimeout(t); t = setTimeout(async () => { items = await fetcher(input.value.trim()); active = -1; paint(); }, 140); };
  input.addEventListener("input", load);
  input.addEventListener("focus", load);
  input.addEventListener("blur", () => setTimeout(close, 160));
  input.addEventListener("keydown", (e) => {
    if (box.style.display === "none") return;
    if (e.key === "ArrowDown") { active = Math.min(active + 1, items.length - 1); paint(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); paint(); e.preventDefault(); }
    else if (e.key === "Enter" && active >= 0) { choose(active); e.preventDefault(); }
    else if (e.key === "Escape") close();
  });
}

function makeTags(container, fetcher) {
  let tags = [];
  const input = document.createElement("input"); input.className = "tag-input"; input.placeholder = "Add genre…";
  const box = document.createElement("div"); box.className = "suggest"; box.style.display = "none";
  container.appendChild(input); container.appendChild(box);
  let items = [], active = -1, t;
  const has = (v) => tags.some(x => x.toLowerCase() === v.toLowerCase());
  const close = () => { box.style.display = "none"; active = -1; };
  function chips() {
    [...container.querySelectorAll(".chip")].forEach(c => c.remove());
    tags.forEach((tg, i) => {
      const c = document.createElement("span"); c.className = "chip";
      c.innerHTML = `${esc(tg)} <button type="button" aria-label="Remove">×</button>`;
      c.querySelector("button").onclick = () => { tags.splice(i, 1); chips(); };
      container.insertBefore(c, input);
    });
  }
  function add(v) { v = (v || "").trim(); if (v && !has(v)) { tags.push(v); chips(); } input.value = ""; close(); }
  function paint() {
    const list = items.filter(s => !has(s.value));
    if (!list.length) { close(); return; }
    box.innerHTML = sgHTML(list, active); box.style.display = "block";
    [...box.children].forEach(el => el.onmousedown = (e) => { e.preventDefault(); add(list[+el.dataset.i].value); input.focus(); });
  }
  const load = () => { clearTimeout(t); t = setTimeout(async () => { items = await fetcher(input.value.trim()); active = -1; paint(); }, 140); };
  input.addEventListener("input", load);
  input.addEventListener("focus", load);
  input.addEventListener("blur", () => setTimeout(close, 160));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(input.value); }
    else if (e.key === "Backspace" && !input.value && tags.length) { tags.pop(); chips(); }
    else if (e.key === "Escape") close();
  });
  return { get: () => tags.slice(), set: (arr) => { tags = (arr || []).filter(Boolean); chips(); } };
}

function normIsbn(s) { return (s || "").replace(/[\s-]/g, "").trim(); }
function isbnHint() {
  const v = normIsbn($("#f_isbn").value), h = $("#isbnHint");
  if (!v) { h.textContent = ""; h.className = "hint"; }
  else if (/^(\d{9}[\dXx]|\d{13})$/.test(v)) { h.textContent = "✓ looks like a valid ISBN"; h.className = "hint ok"; }
  else { h.textContent = "ISBNs are usually 10 or 13 digits — double-check (you can still save)."; h.className = "hint warn"; }
}

let widgetsReady = false;
function initWidgets() {
  if (widgetsReady) return; widgetsReady = true;
  document.querySelectorAll("[data-suggest]").forEach(inp => attachCombo(inp, (q) => suggestField(inp.dataset.suggest, q)));
  genreTags = makeTags($("#f_genre_tags"), suggestGenre);
  $("#f_isbn").addEventListener("input", isbnHint);
}

initWidgets();
refreshAuth();
