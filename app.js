// AISC Shape Lookup — client-side search over the AISC v16 shapes database.

const HIGHLIGHTED = new Set([
  "A", "d", "bf", "tw", "tf", "Ix", "Sx", "Zx", "rx", "Iy", "Sy", "Zy", "ry",
  "J", "Cw", "rts", "ho", "OD", "ID", "Ht", "B", "t", "tdes", "W"
]);

const UNITS = {
  W: "lb/ft", A: "in²",
  d: "in", ddet: "in", Ht: "in", h: "in", OD: "in", ID: "in", B: "in", b: "in",
  bf: "in", bfdet: "in", tw: "in", twdet: "in", "twdet/2": "in",
  tf: "in", tfdet: "in", t: "in", tnom: "in", tdes: "in",
  kdes: "in", kdet: "in", k1: "in", x: "in", y: "in", eo: "in", xp: "in", yp: "in",
  Ix: "in⁴", Iy: "in⁴", Iz: "in⁴", Iw: "in⁴",
  Sx: "in³", Sy: "in³", Sz: "in³",
  Zx: "in³", Zy: "in³",
  rx: "in", ry: "in", rz: "in", rts: "in", ro: "in", ho: "in",
  J: "in⁴", Cw: "in⁶", C: "in³",
  Wno: "in²", Sw1: "in⁴", Sw2: "in⁴", Sw3: "in⁴",
  Qf: "in³", Qw: "in³",
};

const GROUPS = [
  ["Identity", ["Type", "EDI_Std_Nomenclature", "AISC_Manual_Label", "T_F", "W", "A"]],
  ["Dimensions", [
    "d","ddet","Ht","h","OD","bf","bfdet","B","b","ID",
    "tw","twdet","twdet/2","tf","tfdet","t","tnom","tdes",
    "kdes","kdet","k1","x","y","eo","xp","yp","ho",
  ]],
  ["Slenderness", ["bf/2tf","b/t","b/tdes","h/tw","h/tdes","D/t"]],
  ["Strong axis (X)", ["Ix","Zx","Sx","rx"]],
  ["Weak axis (Y)", ["Iy","Zy","Sy","ry"]],
  ["Z axis", ["Iz","rz","Sz"]],
  ["Torsion / Warping", ["J","Cw","C","Wno","Sw1","Sw2","Sw3","Qf","Qw","rts","ro","H"]],
];

let HEADERS = [];
let HEADER_INDEX = {};
let ROWS = [];
let CURRENT_TYPE = "ALL";
let CURRENT_QUERY = "";

const $ = (s) => document.querySelector(s);

async function load() {
  try {
    const res = await fetch("data.json", { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    HEADERS = data.headers;
    HEADER_INDEX = Object.fromEntries(HEADERS.map((h, i) => [h, i]));
    ROWS = data.rows;
    init();
  } catch (e) {
    $("#status").textContent = "Failed to load database: " + e.message;
  }
}

function init() {
  // Build type filter chips
  const types = Array.from(new Set(ROWS.map(r => r[HEADER_INDEX.Type]))).sort();
  const wrap = $("#filters");
  const allChip = chip("ALL", true);
  wrap.appendChild(allChip);
  for (const t of types) wrap.appendChild(chip(t));
  wrap.addEventListener("click", (e) => {
    if (!e.target.classList.contains("chip")) return;
    wrap.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false"));
    e.target.setAttribute("aria-pressed", "true");
    CURRENT_TYPE = e.target.dataset.type;
    render();
  });

  $("#q").addEventListener("input", (e) => {
    CURRENT_QUERY = e.target.value.trim().toUpperCase().replace(/\s+/g, "");
    render();
  });

  $("#status").textContent = `${ROWS.length.toLocaleString()} shapes loaded. Start typing.`;
  $("#results").hidden = false;
  render();
}

function chip(t, pressed = false) {
  const b = document.createElement("button");
  b.className = "chip";
  b.type = "button";
  b.textContent = t;
  b.dataset.type = t;
  b.setAttribute("aria-pressed", pressed ? "true" : "false");
  return b;
}

function render() {
  const labelIdx = HEADER_INDEX.AISC_Manual_Label;
  const typeIdx = HEADER_INDEX.Type;
  const wIdx = HEADER_INDEX.W;
  const aIdx = HEADER_INDEX.A;

  const q = CURRENT_QUERY;
  const matches = [];
  for (const r of ROWS) {
    if (CURRENT_TYPE !== "ALL" && r[typeIdx] !== CURRENT_TYPE) continue;
    if (q) {
      const label = (r[labelIdx] || "").toUpperCase().replace(/\s+/g, "");
      if (!label.includes(q)) continue;
    }
    matches.push(r);
    if (matches.length >= 200) break;
  }

  const ul = $("#results");
  ul.innerHTML = "";
  if (matches.length === 0) {
    $("#status").textContent = q
      ? `No matches for "${q}".`
      : "No shapes for that filter.";
    return;
  }
  $("#status").textContent = `${matches.length}${matches.length >= 200 ? "+" : ""} match${matches.length === 1 ? "" : "es"}.`;

  for (const r of matches) {
    const li = document.createElement("li");
    const label = r[labelIdx] || "(unnamed)";
    const w = r[wIdx];
    const a = r[aIdx];
    const parts = [];
    if (w != null) parts.push(`${w} lb/ft`);
    if (a != null) parts.push(`A=${a} in²`);
    li.innerHTML = `
      <div class="row">
        <span class="name"></span>
        <span class="meta"></span>
      </div>
      <div class="detail"></div>`;
    li.querySelector(".name").textContent = label;
    li.querySelector(".meta").textContent = parts.join(" · ");
    li.querySelector(".row").addEventListener("click", () => {
      if (li.classList.contains("open")) {
        li.classList.remove("open");
      } else {
        if (!li.dataset.built) {
          li.querySelector(".detail").appendChild(buildDetail(r));
          li.dataset.built = "1";
        }
        li.classList.add("open");
      }
    });
    ul.appendChild(li);
  }
}

function buildDetail(row) {
  const frag = document.createDocumentFragment();
  const seen = new Set();

  for (const [groupName, keys] of GROUPS) {
    const items = [];
    for (const k of keys) {
      const i = HEADER_INDEX[k];
      if (i == null) continue;
      seen.add(k);
      const v = row[i];
      if (v == null || v === "") continue;
      items.push([k, v]);
    }
    if (items.length === 0) continue;
    const sec = document.createElement("section");
    sec.className = "group";
    const h = document.createElement("h3");
    h.textContent = groupName;
    sec.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "props";
    for (const [k, v] of items) grid.appendChild(propEl(k, v));
    sec.appendChild(grid);
    frag.appendChild(sec);
  }

  // Other (everything not in a known group)
  const others = [];
  for (const k of HEADERS) {
    if (seen.has(k)) continue;
    const v = row[HEADER_INDEX[k]];
    if (v == null || v === "") continue;
    others.push([k, v]);
  }
  if (others.length) {
    const sec = document.createElement("section");
    sec.className = "group";
    const h = document.createElement("h3");
    h.textContent = "Other";
    sec.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "props";
    for (const [k, v] of others) grid.appendChild(propEl(k, v));
    sec.appendChild(grid);
    frag.appendChild(sec);
  }

  return frag;
}

function propEl(k, v) {
  const el = document.createElement("div");
  el.className = "prop" + (HIGHLIGHTED.has(k) ? " hi" : "");
  const kk = document.createElement("span");
  kk.className = "k";
  kk.textContent = k;
  const vv = document.createElement("span");
  vv.className = "v";
  const unit = UNITS[k];
  vv.textContent = unit && typeof v === "number" ? `${v} ${unit}` : String(v);
  el.appendChild(kk); el.appendChild(vv);
  return el;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

load();
