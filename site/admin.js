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
  $("#f_genre").value = b.genre || ""; $("#f_publisher").value = b.publisher || "";
  $("#f_pages").value = b.pages || ""; $("#f_isbn").value = b.isbn || "";
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
      format: $("#f_format").value.trim(), genre: $("#f_genre").value.trim(),
      publisher: $("#f_publisher").value.trim(), pages: $("#f_pages").value.trim(),
      isbn: $("#f_isbn").value.trim(), cover_path
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

refreshAuth();
