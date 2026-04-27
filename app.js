const SHEET_ID = "1h7VNeNZHI4zvJR9WTBXXM0BhsKu22u-GJNpT1TIh9YU";
const URL_IMPORTADORA = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=142068239`;
const URL_AVR = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=795430851`;

// Positional column indexes (0-based, same layout in both sheets)
const COL_STOCK   = 13; // N
const COL_COSTO   = 35; // AJ
const COL_VSIN    = 36; // AK – Venta sin instalación
const COL_VCON    = 37; // AL – Venta con instalación
const COL_SIGLA   = 41; // AP

const searchInput = document.querySelector("#searchInput");
const reloadButton = document.querySelector("#reloadButton");
const themeToggle = document.querySelector("#themeToggle");
const themeToggleText = document.querySelector(".theme-toggle-text");
const statusNode = document.querySelector("#status");
const counterNode = document.querySelector("#counter");
const resultsBody = document.querySelector("#resultsBody");

const COLSPAN = 11;
let products = [];

const THEME_STORAGE_KEY = "avr-marketplace-theme";

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeToggleText) {
    themeToggleText.textContent = theme === "dark" ? "Modo claro" : "Modo oscuro";
  }
}

function initializeTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  setTheme(savedTheme || (systemPrefersDark ? "dark" : "light"));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCsv(text) {
  const rows = [];
  let cur = "";
  let row = [];
  let inQuotes = false;
  const t = text.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c === "\r") { /* skip */ }
      else cur += c;
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => (v ?? "").trim() !== ""));
}

function buildHeaderMap(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => { map[normalizeText(h)] = i; });
  return map;
}

function getCell(row, headerMap, ...names) {
  for (const n of names) {
    const i = headerMap[normalizeText(n)];
    if (i !== undefined) return (row[i] ?? "").toString().trim();
  }
  return "";
}

function getByIndex(row, idx) {
  return (row[idx] ?? "").toString().trim();
}

function buildYearLabel(d, h) {
  if (!d && !h) return "";
  return `${d || "-"} - ${h || "-"}`;
}

function parseYear(v) {
  const y = Number.parseInt(String(v ?? "").trim(), 10);
  return Number.isInteger(y) ? y : null;
}

function buildYearSearchTerms(d, h) {
  const from = parseYear(d);
  if (!from) return "";
  let to = parseYear(h);
  if (!to) {
    const end = normalizeText(h);
    if (end === "actual") to = new Date().getFullYear();
  }
  if (!to || to < from) to = from;
  const out = [];
  for (let y = from; y <= to; y++) out.push(String(y));
  return out.join(" ");
}

function siglasFromCodigoAntiguo(codigoAntiguo) {
  if (!codigoAntiguo) return [];
  return codigoAntiguo
    .split("|")
    .map(c => c.trim())
    .filter(Boolean);
}

function siglasFromNombre(nombre) {
  const n = normalizeText(nombre);
  const sig = [];
  if (n.includes("parabrisas")) sig.push("PBS");
  if (n.includes("luneta")) sig.push("LUN");
  if (n.includes("puerta")) {
    const v = n.includes("delantera") ? "D" : n.includes("trasera") ? "T" : "";
    const s = n.includes("derecha") ? "D" : n.includes("izquierda") ? "I" : "";
    if (v && s) sig.push(`P${v}${s}`);
  }
  if (n.includes("aleta")) {
    const v = n.includes("delantera") ? "D" : n.includes("trasera") ? "T" : "";
    const s = n.includes("derecha") ? "D" : n.includes("izquierda") ? "I" : "";
    if (v && s) sig.push(`A${v}${s}`);
  }
  if (n.includes("lateral")) {
    const v = n.includes("delantera") ? "D" : n.includes("trasera") ? "T" : "";
    const s = n.includes("derecha") ? "D" : n.includes("izquierda") ? "I" : "";
    if (v && s) sig.push(`L${v}${s}`);
  }
  return sig;
}

function formatPrice(value) {
  const s = String(value ?? "").trim();
  if (!s) return "-";
  const n = parseInt(s.replace(/\./g, ""), 10);
  if (!Number.isInteger(n) || n <= 0) return "-";
  return "$ " + n.toLocaleString("es-CL");
}

function buildImportadora(row, hm) {
  return {
    cp: getCell(row, hm, "CodigoProveedor").toUpperCase(),
    nombre: getCell(row, hm, "Nombre"),
    descripcion: getCell(row, hm, "Descripcion"),
    grupo: getCell(row, hm, "Grupo"),
    marca: getCell(row, hm, "MarcaPrincipal"),
    marcasCompat: getCell(row, hm, "MarcasCompatibles"),
    anioDesde: getCell(row, hm, "AnioDesde"),
    anioHasta: getCell(row, hm, "AnioHasta"),
    color: getCell(row, hm, "Color"),
    medida: getCell(row, hm, "Medida"),
    stock: getByIndex(row, COL_STOCK),
    costo: getByIndex(row, COL_COSTO),
    ventaSin: getByIndex(row, COL_VSIN),
    ventaCon: getByIndex(row, COL_VCON),
    sigla: getByIndex(row, COL_SIGLA),
  };
}

function buildAvr(row, hm) {
  return {
    cp: getCell(row, hm, "CodigoProveedor").toUpperCase(),
    codigoAntiguo: getCell(row, hm, "CodigoAntiguo"),
    nombre: getCell(row, hm, "Nombre"),
    descripcion: getCell(row, hm, "Descripcion"),
    grupo: getCell(row, hm, "Grupo"),
    marca: getCell(row, hm, "MarcaPrincipal"),
    marcasCompat: getCell(row, hm, "MarcasCompatibles"),
    anioDesde: getCell(row, hm, "AnioDesde"),
    anioHasta: getCell(row, hm, "AnioHasta"),
    color: getCell(row, hm, "Color"),
    medida: getCell(row, hm, "Medida"),
    stock: getByIndex(row, COL_STOCK),
    costo: getByIndex(row, COL_COSTO),
    ventaSin: getByIndex(row, COL_VSIN),
    ventaCon: getByIndex(row, COL_VCON),
    sigla: getByIndex(row, COL_SIGLA),
  };
}

function pickField(impVal, avrVal) {
  return impVal && impVal.trim() !== "" ? impVal : avrVal || "";
}

function mergeRows(imp, avr) {
  const codigoAntiguoList = avr ? siglasFromCodigoAntiguo(avr.codigoAntiguo) : [];
  const nombre = pickField(imp?.nombre, avr?.nombre);
  const siglaSheet = pickField(imp?.sigla, avr?.sigla);
  const sigAuto = siglaSheet ? [] : siglasFromNombre(nombre);
  return {
    nombre,
    siglaSheet,
    siglasAuto: sigAuto,
    codigoAntiguo: codigoAntiguoList,
    marca: pickField(imp?.marca, avr?.marca),
    marcasCompat: pickField(imp?.marcasCompat, avr?.marcasCompat),
    anioDesde: pickField(imp?.anioDesde, avr?.anioDesde),
    anioHasta: pickField(imp?.anioHasta, avr?.anioHasta),
    color: pickField(imp?.color, avr?.color),
    medida: pickField(imp?.medida, avr?.medida),
    stockImp: imp ? imp.stock : "",
    stockAvr: avr ? avr.stock : "",
    costo: pickField(imp?.costo, avr?.costo),
    ventaSin: pickField(imp?.ventaSin, avr?.ventaSin),
    ventaCon: pickField(imp?.ventaCon, avr?.ventaCon),
    cp: (imp?.cp || avr?.cp || ""),
  };
}

function buildSearchIndex(p) {
  return normalizeText([
    p.nombre,
    p.siglaSheet,
    p.siglasAuto.join(" "),
    p.codigoAntiguo.join(" "),
    p.marca,
    p.marcasCompat,
    p.color,
    p.medida,
    buildYearLabel(p.anioDesde, p.anioHasta),
    buildYearSearchTerms(p.anioDesde, p.anioHasta),
  ].join(" "));
}

function buildSearchTokens(idx) {
  return new Set(idx.replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(Boolean));
}

function productMatchesToken(p, token) {
  const t = normalizeText(token);
  if (!t) return false;
  const isShort = t.length <= 2;
  const isNum = /^\d+$/.test(t);
  if (isShort || isNum) return p.searchTokens.has(t);
  return p.searchIndex.includes(t);
}

function setStatus(m) { statusNode.textContent = m; }
function setCounter(m) { counterNode.textContent = m; }

function highlight(value, tokens) {
  const safe = escapeHtml(value);
  if (!tokens.length) return safe;
  let out = safe;
  tokens.filter(t => t.length > 1).sort((a, b) => b.length - a.length).forEach(token => {
    const re = new RegExp(`(${escapeRegExp(token)})`, "gi");
    out = out.replace(re, "<mark>$1</mark>");
  });
  return out;
}

function renderBadges(items, tokens) {
  if (!items.length) return '<span class="sigla-badge">-</span>';
  return items.map(s => `<span class="sigla-badge">${highlight(s, tokens)}</span>`).join(" ");
}

function renderSiglas(p, tokens) {
  if (p.siglaSheet) {
    return `<span class="sigla-badge">${highlight(p.siglaSheet, tokens)}</span>`;
  }
  return renderBadges(p.siglasAuto, tokens);
}

function stockClass(value) {
  const n = parseInt(String(value ?? "").trim(), 10);
  if (Number.isInteger(n) && n > 0) return "stock-cell stock-pos";
  return "stock-cell stock-zero";
}

function renderRows(items, tokens) {
  if (!items.length) {
    resultsBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="empty-cell">No encontré resultados.</td></tr>`;
    return;
  }
  resultsBody.innerHTML = items.map(p => `
    <tr>
      <td class="name-cell">${highlight(p.nombre, tokens)}</td>
      <td class="siglas-cell">${renderSiglas(p, tokens)}</td>
      <td class="siglas-cell">${renderBadges(p.codigoAntiguo, tokens)}</td>
      <td class="years-cell">${highlight(buildYearLabel(p.anioDesde, p.anioHasta), tokens)}</td>
      <td>${highlight(p.medida, tokens)}</td>
      <td>${highlight(p.color, tokens)}</td>
      <td class="${stockClass(p.stockImp)}">${highlight(p.stockImp || "0", tokens)}</td>
      <td class="${stockClass(p.stockAvr)}">${highlight(p.stockAvr || "0", tokens)}</td>
      <td class="price-cell">${formatPrice(p.costo)}</td>
      <td class="price-cell">${formatPrice(p.ventaSin)}</td>
      <td class="price-cell">${formatPrice(p.ventaCon)}</td>
    </tr>
  `).join("");
}

function filterProducts() {
  const raw = searchInput.value;
  const tokens = normalizeText(raw).split(/\s+/).filter(Boolean);
  if (!tokens.length) {
    resultsBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="empty-cell">Escribe una búsqueda para ver coincidencias.</td></tr>`;
    setCounter("");
    setStatus(`Cargados: ${products.length} productos. Ingresa marca, sigla, año, medida o código antiguo.`);
    return;
  }
  const filtered = products.filter(p => tokens.every(t => productMatchesToken(p, t)));
  renderRows(filtered, tokens);
  setCounter(`${filtered.length} resultados`);
  setStatus(`Búsqueda: ${tokens.join(" · ")}`);
}

async function fetchSheet(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  const rows = parseCsv(text);
  const headerMap = buildHeaderMap(rows[0] || []);
  return { rows: rows.slice(1), headerMap };
}

async function loadProducts() {
  setStatus("Cargando inventarios...");
  setCounter("");
  resultsBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="empty-cell">Cargando...</td></tr>`;

  try {
    const [imp, avr] = await Promise.all([fetchSheet(URL_IMPORTADORA), fetchSheet(URL_AVR)]);

    const impMap = new Map();
    imp.rows.forEach(row => {
      const item = buildImportadora(row, imp.headerMap);
      if (item.cp) impMap.set(item.cp, item);
    });

    const avrMap = new Map();
    const avrNoCp = [];
    avr.rows.forEach(row => {
      const item = buildAvr(row, avr.headerMap);
      if (item.cp) avrMap.set(item.cp, item);
      else if ((item.nombre || item.codigoAntiguo)) avrNoCp.push(item);
    });

    const merged = [];
    const cps = new Set([...impMap.keys(), ...avrMap.keys()]);
    cps.forEach(cp => merged.push(mergeRows(impMap.get(cp), avrMap.get(cp))));
    avrNoCp.forEach(a => merged.push(mergeRows(null, a)));

    products = merged
      .filter(p => p.nombre || p.codigoAntiguo.length || p.marca)
      .map(p => {
        const idx = buildSearchIndex(p);
        return { ...p, searchIndex: idx, searchTokens: buildSearchTokens(idx) };
      });

    setStatus(`Inventarios listos. Importadora: ${impMap.size} · AVR: ${avrMap.size + avrNoCp.length}.`);
    filterProducts();
  } catch (e) {
    console.error(e);
    setStatus("No pude cargar las hojas. Revisa acceso público o conexión.");
    resultsBody.innerHTML = `<tr><td colspan="${COLSPAN}" class="empty-cell">Error cargando datos.</td></tr>`;
  }
}

let debounceId;
searchInput.addEventListener("input", () => {
  window.clearTimeout(debounceId);
  debounceId = window.setTimeout(filterProducts, 120);
});
reloadButton.addEventListener("click", loadProducts);
themeToggle?.addEventListener("click", () => {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, next);
  setTheme(next);
});

initializeTheme();
loadProducts();
