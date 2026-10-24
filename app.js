// ---------- LOGIC START ----------
const DEFAULT_CODES = {
  "REG":   "Vehicle Registration",
  "DDC":   "Defensive Driving Course (DDC) Certificate",
  "DMV":   "DMV Abstract (Driving Record)",
  "TITLE": "Vehicle Title",
  "DL":    "Driver's License",
  "TLC":   "TLC License"
};
const TYPO_DOMAINS = {"gmai.com":"gmail.com","gmial.com":"gmail.com","gmal.com":"gmail.com","gamil.com":"gmail.com","gmail.co":"gmail.com","gnail.com":"gmail.com","gmail.con":"gmail.com","yaho.com":"yahoo.com","yahooo.com":"yahoo.com","hotmal.com":"hotmail.com","hotmial.com":"hotmail.com","outlok.com":"outlook.com","iclod.com":"icloud.com"};
const EMAIL_RE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;

function titleCase(s){ return String(s||"").trim().toLowerCase().replace(/\s+/g," ").replace(/(^|[\s\-'(])([a-z])/g,(m,a,b)=>a+b.toUpperCase()); }

function expandDocs(raw, codes){
  const items = String(raw||"").split(/[,\n;\/]+/).map(s=>s.trim()).filter(Boolean);
  const out = [], seen = new Set();
  for (const item of items){
    const m = item.match(/^(.+?)\s*(?:\(([^)]*)\))?\s*$/);
    const written = m ? m[1].trim() : item;
    const code = written.toUpperCase();
    const who = m && m[2] ? titleCase(m[2]) : "";
    const known = Object.prototype.hasOwnProperty.call(codes, code);
    const label = (known ? codes[code] : written) + (who ? " – " + who : "");
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push({code, who, label, known, item});
  }
  return out;
}

function splitEmails(raw){ return String(raw||"").split(/[;,\s]+/).map(s=>s.replace(/^<|>$/g,"").trim().toLowerCase()).filter(Boolean); }
function emailProblems(raw){
  const probs = [];
  for (const a of splitEmails(raw)){
    if (!EMAIL_RE.test(a)) { probs.push(a + " is not a valid email address."); continue; }
    const d = a.split("@")[1];
    if (TYPO_DOMAINS[d]) probs.push(a + " looks like a typo. Did you mean @" + TYPO_DOMAINS[d] + "?");
  }
  return probs;
}

// Default email wording. {name}, {policy}, {documents} and {signature} are filled in.
const DEFAULT_SUBJECT = "Require Documents For {policy}";
const DEFAULT_BODY = [
  "Dear {name},",
  "",
  "Please provide the following documents:",
  "",
  "{documents}",
  "",
  "Please reply to this email with clear photos or scans of the documents above.",
  "",
  "If you have any questions, just reply to this email or give us a call.",
  "",
  "Best Regards,",
  "{signature}"
].join("\n");

function fillTemplate(t, vals){
  return String(t == null ? "" : t).replace(/\{\s*(\w+)\s*\}/g, (m, k) => {
    k = k.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vals, k) ? vals[k] : m;
  });
}

function buildEmail(f, codes){
  const docs = expandDocs(f.docs, codes);
  const policy = String(f.ref||"").trim();
  const vals = {
    name: titleCase(f.name) || "Customer",
    policy, ref: policy,
    documents: docs.length ? docs.map(d => "  • " + d.label).join("\n") : "  • (add the required documents)",
    signature: String(f.sig||"").trim()
  };
  let subject = fillTemplate(f.subjectTpl == null ? DEFAULT_SUBJECT : f.subjectTpl, vals).replace(/\s+/g, " ").trim();
  if (!policy) subject = subject.replace(/\s+(for|-|–|:|#)$/i, "").trim();   // no dangling "For" when the policy number is empty
  const body = fillTemplate(f.bodyTpl == null ? DEFAULT_BODY : f.bodyTpl, vals).replace(/\n{3,}/g, "\n\n").trim();
  return { subject, body, docs };
}

// Parse the first row of tab-separated text copied from Excel (handles quoted multi-line cells).
function parseExcelRow(text){
  const s = String(text||"").replace(/\r\n?/g,"\n");
  const cells = []; let i = 0, cur = "";
  while (i <= s.length){
    if (s[i] === '"' && cur === ""){
      i++;
      while (i < s.length){
        if (s[i] === '"' && s[i+1] === '"'){ cur += '"'; i += 2; }
        else if (s[i] === '"'){ i++; break; }
        else cur += s[i++];
      }
      while (i < s.length && s[i] !== "\t" && s[i] !== "\n") cur += s[i++];
    } else {
      while (i < s.length && s[i] !== "\t" && s[i] !== "\n") cur += s[i++];
    }
    cells.push(cur.trim()); cur = "";
    if (i >= s.length || s[i] === "\n") break;
    i++;
  }
  return cells;
}

function classifyRow(cells, codes){
  const r = {name:"", email:"", type:"", ref:"", docs:""};
  const codeList = Object.keys(codes).map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"));
  const docRe = codeList.length ? new RegExp("(^|[^A-Z])(" + codeList.join("|") + ")([^A-Z]|$)", "i") : null;
  const text = [];
  for (const c of cells){
    if (!c) continue;
    const firstEmail = splitEmails(c).find(x=>x.includes("@"));
    if (!r.email && firstEmail && /@/.test(c) && !/\s{2,}/.test(c)) { r.email = splitEmails(c).filter(x=>x.includes("@")).join(", "); continue; }
    if (/^\d+(\.0)?$/.test(c)) continue;                                  // serial number
    if (/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/.test(c)) continue;          // date
    if (/\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]\d{4}/.test(c) && !/[a-z]{3,}/i.test(c.replace(/ext/i,""))) continue; // phone
    if (!r.ref && /^[A-Z]{2,6}[-\s]?\d{4,}[A-Z0-9-]*(\s*\(.*\))?$/i.test(c)) { r.ref = c; continue; }
    if (!r.docs && docRe && docRe.test(c.toUpperCase())) { r.docs = c; continue; }
    text.push(c);
  }
  if (text[0]) r.name = text[0];
  if (text[1]) r.type = text[1];
  return r;
}
// ---------- LOGIC END ----------

const $ = id => document.getElementById(id);
const store = {
  get(k, d){ try { const v = localStorage.getItem("bde:"+k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem("bde:"+k, JSON.stringify(v)); } catch(e){} }
};

/* ---------- saved settings ---------- */
let codes = Object.assign({}, store.get("codes", DEFAULT_CODES));
$("cc").value = store.get("cc", "megainsurancenyc@gmail.com");
$("sig").value = store.get("sig2", "ABRAR");
$("tSubj").value = store.get("tSubj", DEFAULT_SUBJECT);
$("tBody").value = store.get("tBody", DEFAULT_BODY);

/* ---------- example client (cleared by New client or any edit) ---------- */
$("name").value = "John Smith";
$("email").value = "client@example.com";
$("ref").value = "FPT000000";
$("docs").value = "DMV, REG, TITLE\nTLC (DRIVER)";
function hideExample(){ $("exampleTag").hidden = true; }

let current = {subject:"", body:"", to:""};

/* ---------- render the email ---------- */
function render(){
  const f = {name:$("name").value, ref:$("ref").value, docs:$("docs").value, sig:$("sig").value,
             subjectTpl:$("tSubj").value, bodyTpl:$("tBody").value};
  const e = buildEmail(f, codes);
  const to = splitEmails($("email").value).join(", ");
  const cc = $("cc").value.trim();
  current = {subject:e.subject, body:e.body, to};

  $("oTo").textContent = to;
  $("oCc").textContent = cc;
  $("oSubj").textContent = e.subject;
  $("oBody").textContent = e.body;

  const chips = $("chips"); chips.textContent = "";
  let unknown = 0;
  for (const d of e.docs){
    if (d.known){
      const s = document.createElement("span"); s.className = "chip"; s.textContent = d.code + (d.who ? " · " + d.who : "");
      chips.appendChild(s);
    } else {
      unknown++;
      const b = document.createElement("button"); b.type = "button"; b.className = "chip unknown";
      b.textContent = d.code + " — add meaning"; b.title = "Say what " + d.code + " means";
      b.addEventListener("click", ()=>addCodeRow(d.code, "", true));
      chips.appendChild(b);
    }
  }
  $("unknownNote").hidden = !unknown;

  const probs = emailProblems($("email").value);
  $("emailWarn").hidden = !probs.length;
  $("emailWarn").textContent = probs.join(" ");

  // readiness
  const pill = $("readyPill");
  let msg = "";
  if (!to) msg = "Add the client's email";
  else if (probs.length) msg = "Check the client's email";
  else if (!e.docs.length) msg = "Add the documents";
  else if (unknown) msg = unknown === 1 ? "1 code has no meaning" : unknown + " codes have no meaning";
  pill.className = "pill " + (msg ? "warn" : "ok");
  pill.textContent = msg || "Ready to send";

  const q = new URLSearchParams({view:"cm", fs:"1", to, cc, su:e.subject, body:e.body});
  $("gmailBtn").href = "https://mail.google.com/mail/?" + q.toString().replace(/\+/g,"%20");
}

/* ---------- document codes ---------- */
function drawCodes(){
  $("codeList").textContent = "";
  Object.keys(codes).forEach(c => addCodeRow(c, codes[c], false));
}
function saveCodes(){
  const next = {};
  $("codeList").querySelectorAll(".coderow").forEach(row=>{
    const c = row.querySelector(".c").value.trim().toUpperCase();
    const m = row.querySelector(".m").value.trim();
    if (c && m) next[c] = m;
  });
  codes = next; store.set("codes", codes); render();
}
let rowId = 0;
function addCodeRow(code, meaning, focus){
  const list = $("codeList");
  if (focus){
    openDrawer();
    const existing = [...list.querySelectorAll(".coderow")].find(r=>r.querySelector(".c").value.trim().toUpperCase() === code && code);
    if (existing){ existing.querySelector(".m").focus(); return; }
  }
  rowId++;
  const row = document.createElement("div"); row.className = "coderow";
  row.innerHTML = '<input class="c mono" aria-label="Code" id="code-c-'+rowId+'" placeholder="CODE">'
    + '<input class="m" aria-label="What the client should send" id="code-m-'+rowId+'" placeholder="e.g. Vehicle Registration">'
    + '<button type="button" class="icon-btn" aria-label="Remove this code" title="Remove"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button>';
  row.querySelector(".c").value = code; row.querySelector(".m").value = meaning;
  row.querySelectorAll("input").forEach(inp=>inp.addEventListener("input", saveCodes));
  row.querySelector("button").addEventListener("click", ()=>{ row.remove(); saveCodes(); });
  list.appendChild(row);
  if (focus){
    row.scrollIntoView({block:"nearest"});
    row.querySelector(code ? ".m" : ".c").focus();
  }
}

/* ---------- toast + copy ---------- */
function flash(msg){
  const t = $("status"); t.textContent = msg; t.classList.add("show");
  clearTimeout(flash.t); flash.t = setTimeout(()=>t.classList.remove("show"), 2400);
}
async function copyText(t, label){
  try { await navigator.clipboard.writeText(t); flash(label + " copied"); }
  catch(e){
    const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch(_){}
    ta.remove();
    flash(ok ? label + " copied" : "Couldn't copy. Select the text in the preview and copy it by hand.");
  }
}
document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click", ()=>{
  const k = b.dataset.copy;
  if (k === "subject") copyText(current.subject, "Subject");
  if (k === "body") copyText(current.body, "Email text");
  if (k === "to") copyText(current.to || "", "Client email");
}));

/* ---------- paste an Excel row ---------- */
function fillFromRow(raw){
  if (!String(raw).trim()) return;
  const r = classifyRow(parseExcelRow(raw), codes);
  const filled = [];
  // a new row replaces the previous client completely
  $("name").value = r.name || ""; if (r.name) filled.push("name");
  $("email").value = r.email || ""; if (r.email) filled.push("email");
  $("ref").value = r.ref || ""; if (r.ref) filled.push("policy number");
  $("docs").value = r.docs || ""; if (r.docs) filled.push("documents");
  hideExample();
  const note = $("rowNote");
  note.hidden = false;
  note.classList.toggle("bad", !filled.length);
  note.textContent = filled.length
    ? "✓ Filled in " + filled.join(", ") + (filled.length < 4 ? ". Add anything missing below." : ".")
    : "That didn't look like a client row. Type the details below instead.";
  $("rowPaste").value = "";
  render();
}
$("rowPaste").addEventListener("input", ()=>{ const v = $("rowPaste").value; if (/[\t\n@]/.test(v)) fillFromRow(v); });
// Ctrl+V anywhere on the page (when not typing in a field) pastes the row
document.addEventListener("paste", e=>{
  const t = e.target;
  if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA") && t.id !== "rowPaste") return;
  if (!$("drawer").hidden) return;
  const text = e.clipboardData && e.clipboardData.getData("text");
  if (!text) return;
  e.preventDefault();
  fillFromRow(text);
});

/* ---------- inputs ---------- */
["name","email","ref","docs"].forEach(id=>$(id).addEventListener("input", ()=>{ hideExample(); $("rowNote").hidden = true; render(); }));
$("cc").addEventListener("input", ()=>{ store.set("cc", $("cc").value); render(); });
$("sig").addEventListener("input", ()=>{ store.set("sig2", $("sig").value); render(); });
$("tSubj").addEventListener("input", ()=>{ store.set("tSubj", $("tSubj").value); render(); });
$("tBody").addEventListener("input", ()=>{ store.set("tBody", $("tBody").value); render(); });
$("resetTemplate").addEventListener("click", ()=>{
  $("tSubj").value = DEFAULT_SUBJECT; $("tBody").value = DEFAULT_BODY;
  store.set("tSubj", DEFAULT_SUBJECT); store.set("tBody", DEFAULT_BODY);
  render(); flash("Email wording reset");
});
$("addCode").addEventListener("click", ()=>addCodeRow("", "", true));
$("resetCodes").addEventListener("click", ()=>{ codes = Object.assign({}, DEFAULT_CODES); store.set("codes", codes); drawCodes(); render(); flash("Document codes reset"); });
$("clearBtn").addEventListener("click", ()=>{
  ["rowPaste","name","email","ref","docs"].forEach(id=>$(id).value = "");
  hideExample(); $("rowNote").hidden = true; render();
  $("rowPaste").focus(); flash("Ready for the next client. Press Ctrl+V to paste their row.");
});

/* ---------- guide ---------- */
function setGuide(show){
  $("howto").hidden = !show;
  $("guideBtn").setAttribute("aria-expanded", String(show));
  store.set("howtoClosed", !show);
}
setGuide(!store.get("howtoClosed", false));
$("guideHide").addEventListener("click", ()=>setGuide(false));
$("guideBtn").addEventListener("click", ()=>{
  const show = $("howto").hidden; setGuide(show);
  if (show) $("howto").scrollIntoView({behavior:"smooth", block:"start"});
});

/* ---------- settings drawer ---------- */
let lastFocus = null;
function openDrawer(){
  if (!$("drawer").hidden) return;
  lastFocus = document.activeElement;
  $("drawer").hidden = false; $("scrim").hidden = false;
  document.body.style.overflow = "hidden";
  $("settingsBtn").setAttribute("aria-expanded", "true");
  $("drawerClose").focus();
}
function closeDrawer(){
  if ($("drawer").hidden) return;
  $("drawer").hidden = true; $("scrim").hidden = true;
  document.body.style.overflow = "";
  $("settingsBtn").setAttribute("aria-expanded", "false");
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
$("settingsBtn").addEventListener("click", openDrawer);
$("drawerClose").addEventListener("click", closeDrawer);
$("scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e=>{
  if (e.key === "Escape") closeDrawer();
  if (e.key === "Tab" && !$("drawer").hidden){            // keep keyboard focus inside the drawer
    const f = [...$("drawer").querySelectorAll("button,input,textarea")].filter(x=>!x.disabled);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]){ e.preventDefault(); f[f.length-1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length-1]){ e.preventDefault(); f[0].focus(); }
  }
});

drawCodes();
render();
