// AISC Shape Lookup — client-side search over the AISC v16 shapes database (US units).

// Per-shape-type list of dimensions to display. Order is also display order.
// Format: [property_key_in_database, friendly_label]
const DIM_SETS = {
  W:    [["d","Beam Height"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Flange Thickness"]],
  M:    [["d","Beam Height"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Flange Thickness"]],
  S:    [["d","Beam Height"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Flange Thickness"]],
  HP:   [["d","Beam Height"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Flange Thickness"]],
  C:    [["d","Channel Depth"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Avg Flange Thickness"]],
  MC:   [["d","Channel Depth"],["bf","Flange Width"],["tw","Web Thickness"],["tf","Avg Flange Thickness"]],
  WT:   [["d","Tee Depth"],["bf","Flange Width"],["tw","Stem Thickness"],["tf","Flange Thickness"]],
  MT:   [["d","Tee Depth"],["bf","Flange Width"],["tw","Stem Thickness"],["tf","Flange Thickness"]],
  ST:   [["d","Tee Depth"],["bf","Flange Width"],["tw","Stem Thickness"],["tf","Flange Thickness"]],
  L:    [["d","Long Leg"],["b","Short Leg"],["t","Thickness"]],
  "2L": [["d","Long Leg"],["b","Short Leg"],["t","Thickness"]],
  HSS:  [["Ht","Height"],["B","Width"],["OD","Outside Diameter"],["ID","Inside Diameter"],["tdes","Design Wall Thickness"]],
  PIPE: [["OD","Outside Diameter"],["ID","Inside Diameter"],["tdes","Design Wall Thickness"]],
};

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
  const types = Array.from(new Set(ROWS.map(r => r[HEADER_INDEX.Type]))).sort();
  const wrap = $("#filters");
  wrap.appendChild(chip("ALL", true));
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
    $("#status").textContent = q ? `No matches for "${q}".` : "No shapes for that filter.";
    return;
  }
  $("#status").textContent =
    `${matches.length}${matches.length >= 200 ? "+" : ""} match${matches.length === 1 ? "" : "es"}.`;

  for (const r of matches) {
    const li = document.createElement("li");
    const label = r[labelIdx] || "(unnamed)";
    const w = r[wIdx];
    li.innerHTML = `
      <div class="row">
        <span class="name"></span>
        <span class="meta"></span>
      </div>
      <div class="detail"></div>`;
    li.querySelector(".name").textContent = label;
    li.querySelector(".meta").textContent = w != null ? `${w} lb/ft` : "";
    li.querySelector(".row").addEventListener("click", () => {
      if (li.classList.contains("open")) {
        li.classList.remove("open");
      } else {
        if (!li.dataset.built) {
          li.querySelector(".detail").innerHTML = buildDetail(r);
          li.dataset.built = "1";
        }
        li.classList.add("open");
      }
    });
    ul.appendChild(li);
  }
}

function buildDetail(row) {
  const type = row[HEADER_INDEX.Type];
  const set = DIM_SETS[type] || [];

  // AISC tabulates ID for pipes but leaves it blank for round HSS — derive it.
  const od = row[HEADER_INDEX.OD];
  const tdes = row[HEADER_INDEX.tdes];
  const tabulatedId = row[HEADER_INDEX.ID];
  const computedId = (type === "HSS" && tabulatedId == null && od != null && tdes != null)
    ? Math.round((od - 2 * tdes) * 1000) / 1000
    : null;

  // Filter to fields that actually have a value for this shape (e.g. round vs
  // rectangular HSS use different keys).
  const items = [];
  for (const [key, label] of set) {
    const i = HEADER_INDEX[key];
    if (i == null) continue;
    let v = row[i];
    if ((v == null || v === "") && key === "ID" && computedId != null) v = computedId;
    if (v == null || v === "") continue;
    items.push({ key, label, value: v });
  }

  const presentKeys = new Set(items.map(it => it.key));
  const svg = diagramFor(type, presentKeys);

  const rows = items.map(it => `
    <div class="dim-row">
      <span class="dim-label">${it.label} <span class="dim-key">(${it.key})</span></span>
      <span class="dim-value">${it.value} in</span>
    </div>
  `).join("");

  return `<div class="diagram-wrap">${svg}</div><div class="dimensions">${rows}</div>`;
}

function diagramFor(type, keys) {
  if (type === "PIPE") return svgPipe();
  if (type === "HSS") return keys.has("OD") ? svgPipe() : svgHSSRect();
  if (type === "L" || type === "2L") return svgAngle();
  if (type === "C" || type === "MC") return svgChannel();
  if (type === "WT" || type === "MT" || type === "ST") return svgTee();
  return svgI();
}

// ---- SVG diagrams. All use a 240x240 viewBox with 20-unit margin reserved for labels. ----

function svgI() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Wide-flange section">
  <g fill="#64748b">
    <rect x="50" y="40" width="140" height="22"/>
    <rect x="50" y="178" width="140" height="22"/>
    <rect x="110" y="62" width="20" height="116"/>
  </g>
  <g class="dim">
    <line x1="50" y1="22" x2="190" y2="22" class="dl"/>
    <line x1="50" y1="14" x2="50" y2="30" class="dt"/>
    <line x1="190" y1="14" x2="190" y2="30" class="dt"/>
    <text x="120" y="12" text-anchor="middle">bf</text>

    <line x1="216" y1="40" x2="216" y2="200" class="dl"/>
    <line x1="208" y1="40" x2="224" y2="40" class="dt"/>
    <line x1="208" y1="200" x2="224" y2="200" class="dt"/>
    <text x="222" y="124" text-anchor="start">d</text>

    <line x1="40" y1="40" x2="48" y2="40" class="dl"/>
    <line x1="40" y1="62" x2="48" y2="62" class="dl"/>
    <text x="36" y="55" text-anchor="end">tf</text>

    <text x="170" y="124" text-anchor="middle">tw</text>
    <line x1="135" y1="120" x2="155" y2="120" class="dl"/>
  </g>
</svg>`;
}

function svgChannel() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Channel section">
  <g fill="#64748b">
    <rect x="60" y="40" width="20" height="160"/>
    <rect x="60" y="40" width="110" height="20"/>
    <rect x="60" y="180" width="110" height="20"/>
  </g>
  <g class="dim">
    <line x1="60" y1="22" x2="170" y2="22" class="dl"/>
    <line x1="60" y1="14" x2="60" y2="30" class="dt"/>
    <line x1="170" y1="14" x2="170" y2="30" class="dt"/>
    <text x="115" y="12" text-anchor="middle">bf</text>

    <line x1="190" y1="40" x2="190" y2="200" class="dl"/>
    <line x1="182" y1="40" x2="198" y2="40" class="dt"/>
    <line x1="182" y1="200" x2="198" y2="200" class="dt"/>
    <text x="196" y="124" text-anchor="start">d</text>

    <text x="100" y="124" text-anchor="start">tw</text>
    <line x1="82" y1="120" x2="96" y2="120" class="dl"/>

    <text x="115" y="78" text-anchor="middle">tf</text>
    <line x1="115" y1="62" x2="115" y2="72" class="dl"/>
  </g>
</svg>`;
}

function svgTee() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Tee section">
  <g fill="#64748b">
    <rect x="50" y="40" width="140" height="22"/>
    <rect x="110" y="62" width="20" height="138"/>
  </g>
  <g class="dim">
    <line x1="50" y1="22" x2="190" y2="22" class="dl"/>
    <line x1="50" y1="14" x2="50" y2="30" class="dt"/>
    <line x1="190" y1="14" x2="190" y2="30" class="dt"/>
    <text x="120" y="12" text-anchor="middle">bf</text>

    <line x1="216" y1="40" x2="216" y2="200" class="dl"/>
    <line x1="208" y1="40" x2="224" y2="40" class="dt"/>
    <line x1="208" y1="200" x2="224" y2="200" class="dt"/>
    <text x="222" y="124" text-anchor="start">d</text>

    <line x1="40" y1="40" x2="48" y2="40" class="dl"/>
    <line x1="40" y1="62" x2="48" y2="62" class="dl"/>
    <text x="36" y="55" text-anchor="end">tf</text>

    <text x="155" y="135" text-anchor="start">tw</text>
    <line x1="135" y1="130" x2="150" y2="130" class="dl"/>
  </g>
</svg>`;
}

function svgAngle() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Angle section">
  <g fill="#64748b">
    <rect x="50" y="40" width="22" height="160"/>
    <rect x="50" y="178" width="120" height="22"/>
  </g>
  <g class="dim">
    <line x1="32" y1="40" x2="32" y2="200" class="dl"/>
    <line x1="24" y1="40" x2="40" y2="40" class="dt"/>
    <line x1="24" y1="200" x2="40" y2="200" class="dt"/>
    <text x="26" y="124" text-anchor="end">d</text>

    <line x1="50" y1="218" x2="170" y2="218" class="dl"/>
    <line x1="50" y1="210" x2="50" y2="226" class="dt"/>
    <line x1="170" y1="210" x2="170" y2="226" class="dt"/>
    <text x="110" y="234" text-anchor="middle">b</text>

    <text x="100" y="135" text-anchor="start">t</text>
    <line x1="72" y1="130" x2="96" y2="130" class="dl"/>
  </g>
</svg>`;
}

function svgHSSRect() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Rectangular HSS section">
  <rect x="40" y="40" width="160" height="160" fill="#64748b"/>
  <rect x="58" y="58" width="124" height="124" fill="#111827"/>
  <g class="dim">
    <line x1="40" y1="22" x2="200" y2="22" class="dl"/>
    <line x1="40" y1="14" x2="40" y2="30" class="dt"/>
    <line x1="200" y1="14" x2="200" y2="30" class="dt"/>
    <text x="120" y="12" text-anchor="middle">B</text>

    <line x1="216" y1="40" x2="216" y2="200" class="dl"/>
    <line x1="208" y1="40" x2="224" y2="40" class="dt"/>
    <line x1="208" y1="200" x2="224" y2="200" class="dt"/>
    <text x="222" y="124" text-anchor="start">Ht</text>

    <text x="49" y="135" text-anchor="middle">t</text>
    <line x1="40" y1="148" x2="58" y2="148" class="dl"/>
  </g>
</svg>`;
}

function svgPipe() {
  return `<svg class="diagram" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg" aria-label="Round HSS / Pipe section">
  <circle cx="120" cy="120" r="80" fill="#64748b"/>
  <circle cx="120" cy="120" r="62" fill="#111827"/>
  <g class="dim">
    <line x1="40" y1="120" x2="40" y2="22" class="dl" stroke-dasharray="2 3"/>
    <line x1="200" y1="120" x2="200" y2="22" class="dl" stroke-dasharray="2 3"/>
    <line x1="40" y1="22" x2="200" y2="22" class="dl"/>
    <line x1="40" y1="14" x2="40" y2="30" class="dt"/>
    <line x1="200" y1="14" x2="200" y2="30" class="dt"/>
    <text x="120" y="12" text-anchor="middle">OD</text>

    <line x1="58" y1="120" x2="182" y2="120" class="dl"/>
    <line x1="58" y1="112" x2="58" y2="128" class="dt"/>
    <line x1="182" y1="112" x2="182" y2="128" class="dt"/>
    <text x="120" y="113" text-anchor="middle">ID</text>

    <text x="158" y="60" text-anchor="middle">t</text>
    <line x1="158" y1="65" x2="174" y2="80" class="dl"/>
  </g>
</svg>`;
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

load();
