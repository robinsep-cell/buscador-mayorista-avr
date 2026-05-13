const SHEET_ID = "1h7VNeNZHI4zvJR9WTBXXM0BhsKu22u-GJNpT1TIh9YU";
const URL_IMPORTADORA = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=142068239`;
const URL_AVR = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=704848232`;
// Positional column indexes (0-based, same layout in both sheets)
const COL_STOCK   = 13; // N
const COL_COSTO   = 35; // AJ
const COL_VSIN    = 36; // AK – Venta sin instalación
const COL_VCON    = 37; // AL – Venta con instalación
const COL_SIGLA   = 41; // AP

// ── Factores de precio v6.1 (2026-05-13) ─────────────────────────────────────
const FACTOR_C           = 2.5;   // sin instalación (todas las categorías)
const FACTOR_D_NORMAL    = 4.0;   // con instalación normal
const FACTOR_D_ALTA_GAMA = 4.5;   // con instalación alta gama / camión / bus

const MODIFICADORES = {
  sensor_lluvia:       20000,  // solo parabrisas
  sistema_adas:        30000,  // solo parabrisas
  camara_1:            25000,  // solo parabrisas
  camara_2:            45000,  // solo parabrisas (no acumula con camara_1)
  encapsulada:         35000,  // solo lateral y luneta con /X
  laminada_de_fabrica:     0,  // solo puerta
};

const MIN_SIN = {
  "Parabrisas":       73400,
  "Luneta Portalón":  55000,
  "Vidrio Lateral":   55200,
  "Vidrio de Puerta": 39800,
  "Vidrio Aleta":     24200,
};

const MIN_SOLO_INSTALACION = 24500;

const CAJA_PRECIOS = {
  "Parabrisas":       { base: 45000, altaGama: 75000 },
  "Luneta Portalón":  { base: 45000, altaGama: 45000 },
  "Vidrio Lateral":   { base: 25000, altaGama: 25000 },
  "Vidrio de Puerta": { base: 25000, altaGama: 25000 },
  "Vidrio Aleta":     { base: 15000, altaGama: 15000 },
};

const PRODUCT_TRAITS = {
  "Parabrisas":      { sensor: true,  adas: true,  camara: true,  encapsulada: false, laminada: false },
  "Vidrio Aleta":    { sensor: false, adas: false, camara: false, encapsulada: true,  laminada: false },
  "Vidrio de Puerta":{ sensor: false, adas: false, camara: false, encapsulada: false, laminada: true  },
  "Vidrio Lateral":  { sensor: false, adas: false, camara: false, encapsulada: true,  laminada: false },
  "Luneta Portalón": { sensor: false, adas: false, camara: false, encapsulada: true,  laminada: false },
};

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

const COLOR_CANON = { solex: "verde", vde: "verde", priv: "privado" };
function normalizeColor(c) {
  const n = normalizeText(c);
  return COLOR_CANON[n] || n;
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
    sku: getCell(row, hm, "SKU"),
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

// Extrae palabras clave de posición y lado de un nombre de producto
function posKeywords(nombre) {
  const n = normalizeText(nombre || "");
  const kw = [];
  if (n.includes("delantera")) kw.push("delantera");
  if (n.includes("trasera"))   kw.push("trasera");
  if (n.includes("derecha"))   kw.push("derecha");
  if (n.includes("izquierda")) kw.push("izquierda");
  if (n.includes("parabrisas")) kw.push("parabrisas");
  if (n.includes("luneta"))    kw.push("luneta");
  return kw;
}

// Cuántas palabras clave coinciden entre dos nombres (mayor = mejor pareja)
function nameMatchScore(nombre1, nombre2) {
  const kw1 = posKeywords(nombre1);
  const kw2 = posKeywords(nombre2);
  if (!kw1.length || !kw2.length) return 0;
  return kw1.filter(k => kw2.includes(k)).length;
}

function mergeRows(imp, avr) {
  // Combinar códigos antiguos de ambas hojas (sin duplicados)
  const avrCodigos = avr ? siglasFromCodigoAntiguo(avr.codigoAntiguo) : [];
  const impCodigos = imp ? siglasFromCodigoAntiguo(imp.codigoAntiguo) : [];
  const codigoAntiguoList = [...new Set([...avrCodigos, ...impCodigos])];
  const sku = imp?.sku || "";
  const nombre = pickField(imp?.nombre, avr?.nombre);
  const siglaSheet = pickField(imp?.sigla, avr?.sigla);
  const sigAuto = siglaSheet ? [] : siglasFromNombre(nombre);
  return {
    nombre,
    siglaSheet,
    siglasAuto: sigAuto,
    codigoAntiguo: codigoAntiguoList,
    sku,
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
    p.sku,
    p.cp,
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
  resultsBody.innerHTML = items.map(p => {
    const checked = window.cotSelection?.has(p._id) ? "checked" : "";
    return `
    <tr>
      <td class="cot-check-cell"><input type="checkbox" class="cot-check" data-id="${p._id}" ${checked} /></td>
      <td class="name-cell${p.medida ? ' has-medida' : ''}" ${p.medida ? `data-medida="📐 ${escapeHtml(p.medida)}"` : ''}>${highlight(p.nombre, tokens)}</td>
      <td class="siglas-cell">${renderSiglas(p, tokens)}</td>
      <td class="siglas-cell">${renderBadges(p.codigoAntiguo, tokens)}</td>
      <td class="years-cell">${highlight(buildYearLabel(p.anioDesde, p.anioHasta), tokens)}</td>
      <td>${highlight(p.color, tokens)}</td>
      <td class="${stockClass(p.stockImp)}">${highlight(p.stockImp || "0", tokens)}</td>
      <td class="${stockClass(p.stockAvr)}">${highlight(p.stockAvr || "0", tokens)}</td>
      <td class="price-cell">${formatPrice(p.costo)}</td>
      <td class="price-cell">${formatPrice(p.ventaSin)}</td>
      <td class="price-cell">${formatPrice(p.ventaCon)}</td>
    </tr>`;
  }).join("");
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

    // Agrupar importadora por cp para saber cuántos productos comparten el mismo código
    const impByCp = new Map(); // cp → item[]
    const impNoCp = [];        // filas de importadora sin CdP (igual se muestran)
    imp.rows.forEach(row => {
      const item = buildImportadora(row, imp.headerMap);
      if (!item.nombre && !item.cp) return;
      if (item.cp) {
        if (!impByCp.has(item.cp)) impByCp.set(item.cp, []);
        impByCp.get(item.cp).push(item);
      } else if (item.nombre || item.descripcion) {
        impNoCp.push(item); // rescatar: sin CdP pero con datos útiles
      }
    });

    // Agrupar AVR por cp
    const avrByCp = new Map(); // cp → item[]
    const avrNoCp = [];
    avr.rows.forEach(row => {
      const item = buildAvr(row, avr.headerMap);
      if (item.cp) {
        if (!avrByCp.has(item.cp)) avrByCp.set(item.cp, []);
        avrByCp.get(item.cp).push(item);
      } else if (item.nombre || item.codigoAntiguo) {
        avrNoCp.push(item);
      }
    });

    const merged = [];
    const avrMatched = new Set(); // "cp|idx" ya asignados

    // Recorrer cada cp único entre importadora y AVR
    const allCps = new Set([...impByCp.keys(), ...avrByCp.keys()]);
    allCps.forEach(cp => {
      const impItems = impByCp.get(cp) || [];
      const avrItems = avrByCp.get(cp) || [];

      if (impItems.length === 0) {
        // Solo AVR
        avrItems.forEach(a => merged.push(mergeRows(null, a)));
        return;
      }

      if (impItems.length === 1) {
        // Un solo producto importadora con este cp
        let avrMatchIdx = -1;

        if (avrItems.length === 1) {
          // Solo un AVR disponible: empareja directo
          avrMatchIdx = 0;
        } else if (avrItems.length > 1) {
          // Múltiples AVR: buscar el que más coincida por nombre (delantera/trasera/lado)
          let bestScore = -1;
          avrItems.forEach((a, i) => {
            const score = nameMatchScore(impItems[0].nombre, a.nombre);
            if (score > bestScore) { bestScore = score; avrMatchIdx = i; }
          });
          // Si no hay coincidencia de palabras clave, aún así usar el primero (mismo comportamiento anterior)
          if (bestScore === 0) avrMatchIdx = 0;
        }

        const avrItem = avrMatchIdx >= 0 ? avrItems[avrMatchIdx] : null;
        if (avrMatchIdx >= 0) avrMatched.add(cp + "|" + avrMatchIdx);
        merged.push(mergeRows(impItems[0], avrItem));
        // AVR no emparejados → filas independientes
        avrItems.forEach((a, i) => {
          if (i !== avrMatchIdx) merged.push(mergeRows(null, a));
        });
        return;
      }

      // Múltiples importadora con mismo cp (ej VDE y PRIV) → separar por color
      impItems.forEach(impItem => {
        const colorKey = normalizeColor(impItem.color);
        // Primero buscar un AVR sin consumir con el mismo color
        const idx = avrItems.findIndex((a, i) =>
          !avrMatched.has(cp + "|" + i) && normalizeColor(a.color) === colorKey
        );
        let avrItem = null;
        if (idx >= 0) {
          avrItem = avrItems[idx];
          avrMatched.add(cp + "|" + idx);
        } else {
          // Si ya se consumió el único AVR de ese color (ej: izquierda+derecha
          // comparten mismo color), igual mostrar el stock AVR de ese color
          const anyIdx = avrItems.findIndex(a => normalizeColor(a.color) === colorKey);
          if (anyIdx >= 0) avrItem = avrItems[anyIdx];
        }
        merged.push(mergeRows(impItem, avrItem));
      });
      // AVR sin match → filas independientes
      avrItems.forEach((a, i) => {
        if (!avrMatched.has(cp + "|" + i)) merged.push(mergeRows(null, a));
      });
    });

    avrNoCp.forEach(a => merged.push(mergeRows(null, a)));
    impNoCp.forEach(i => merged.push(mergeRows(i, null)));

    // Debug: exponer datos crudos para diagnóstico en consola
    window._debugData = { impByCp, avrByCp };

    products = merged
      .filter(p => p.nombre || p.codigoAntiguo.length || p.marca)
      .map((p, i) => {
        const idx = buildSearchIndex(p);
        return { ...p, _id: i, searchIndex: idx, searchTokens: buildSearchTokens(idx) };
      });
    window._products = products;

    setStatus(`Inventarios listos. Importadora: ${[...impByCp.values()].reduce((s,a)=>s+a.length,0) + impNoCp.length} · AVR: ${[...avrByCp.values()].reduce((s,a)=>s+a.length,0) + avrNoCp.length}.`);
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

// ── Calculator ────────────────────────────────────────────────────────────────

const calcModal    = document.querySelector("#calcModal");
const calcClose    = document.querySelector("#calcClose");
const calcOpenBtn  = document.querySelector("#calcOpenBtn");
const calcCosto    = document.querySelector("#calcCosto");
const calcProducto = document.querySelector("#calcProducto");
const chkAltaGama  = document.querySelector("#chkAltaGama");
const chkSensor    = document.querySelector("#chkSensor");
const chkAdas      = document.querySelector("#chkAdas");
const chkEncapsulada = document.querySelector("#chkEncapsulada");
const chkLaminada  = document.querySelector("#chkLaminada");
const chkCaja      = document.querySelector("#chkCaja");
const calcResSin   = document.querySelector("#calcResSin");
const calcResCon   = document.querySelector("#calcResCon");
const calcResSolo  = document.querySelector("#calcResSolo");
const calcStatus   = document.querySelector("#calcStatus");

function setPillState(input) {
  const pill = input.closest(".calc-pill");
  if (!pill) return;
  if (input.type === "radio") {
    document.querySelectorAll(`input[name="${input.name}"]`).forEach(r => {
      r.closest(".calc-pill")?.classList.toggle("is-checked", r.checked);
    });
  } else {
    pill.classList.toggle("is-checked", input.checked);
  }
}

function resetPill(checkboxEl) {
  checkboxEl.checked = false;
  checkboxEl.closest(".calc-pill")?.classList.remove("is-checked");
}

function updateCalcVisibility() {
  const producto = calcProducto.value;
  const traits = PRODUCT_TRAITS[producto] || {};

  // Mostrar bloque entero solo si hay producto seleccionado
  document.querySelector("#calcOptions").hidden = !producto;

  // Pills individuales dentro del bloque
  document.querySelector("#pillSensor").hidden     = !traits.sensor;
  document.querySelector("#pillAdas").hidden       = !traits.adas;
  document.querySelector("#pillEncapsulada").hidden = !traits.encapsulada;
  document.querySelector("#pillLaminada").hidden   = !traits.laminada;
  document.querySelector("#camaraGroup").hidden    = !traits.camara;

  // Resetear opciones no disponibles para este producto
  if (!traits.sensor)      resetPill(chkSensor);
  if (!traits.adas)        resetPill(chkAdas);
  if (!traits.encapsulada) resetPill(chkEncapsulada);
  if (!traits.laminada)    resetPill(chkLaminada);
  resetPill(chkAltaGama);
  resetPill(chkCaja);
  if (!traits.camara) {
    const noCam = document.querySelector("#chkNoCam");
    noCam.checked = true;
    setPillState(noCam);
  }
  calcPrices();
}

function calcPrices() {
  const costo    = parseFloat(calcCosto.value);
  const producto = calcProducto.value;

  if (!costo || costo <= 0 || !producto) {
    calcResSin.textContent = "—"; calcResCon.textContent = "—"; calcResSolo.textContent = "—";
    calcStatus.textContent = "";
    return;
  }
  calcStatus.textContent = "";

  const traits   = PRODUCT_TRAITS[producto] || {};
  const altaGama = chkAltaGama.checked;
  const C        = FACTOR_C;
  const D        = altaGama ? FACTOR_D_ALTA_GAMA : FACTOR_D_NORMAL;

  // Modificadores: cargos fijos en pesos que se suman SOLO a conBase
  let cargoMods = 0;
  if (producto === "Parabrisas") {
    if (traits.sensor && chkSensor.checked)  cargoMods += MODIFICADORES.sensor_lluvia;
    if (traits.adas   && chkAdas.checked)    cargoMods += MODIFICADORES.sistema_adas;
    if (traits.camara) {
      const camVal = document.querySelector('input[name="camara"]:checked')?.value;
      if      (camVal === "2") cargoMods += MODIFICADORES.camara_2;
      else if (camVal === "1") cargoMods += MODIFICADORES.camara_1;
    }
  }
  if ((producto === "Vidrio Lateral" || producto === "Luneta Portalón") && chkEncapsulada.checked) {
    cargoMods += MODIFICADORES.encapsulada;
  }

  const minSin   = MIN_SIN[producto] || 0;
  const sinBase  = Math.max(costo * C, minSin);
  const conBase  = Math.max(costo * D + cargoMods, sinBase + MIN_SOLO_INSTALACION);
  const soloInst = conBase - sinBase;

  // Caja (cargo fijo, se suma a sin y con, no afecta soloInst)
  let cajaCosto = 0;
  if (chkCaja?.checked && CAJA_PRECIOS[producto]) {
    const cp = CAJA_PRECIOS[producto];
    cajaCosto = (producto === "Parabrisas" && altaGama) ? cp.altaGama : cp.base;
  }

  const fmt = n => "$ " + Math.round(n).toLocaleString("es-CL");
  calcResSin.textContent  = fmt(sinBase  + cajaCosto); // caja solo al precio sin inst.
  calcResCon.textContent  = fmt(conBase);              // con inst. no lleva caja
  calcResSolo.textContent = fmt(soloInst);             // diferencia pura, sin caja
}

// Abrir / cerrar con native dialog
calcOpenBtn?.addEventListener("click", () => {
  calcModal.showModal();
  setTimeout(() => calcCosto.focus(), 50);
});
calcClose?.addEventListener("click", () => calcModal.close());
calcModal?.addEventListener("click", e => { if (e.target === calcModal) calcModal.close(); });

// Inputs → recalcular
calcCosto.addEventListener("input", calcPrices);
calcProducto.addEventListener("change", updateCalcVisibility);

[chkAltaGama, chkSensor, chkAdas, chkEncapsulada, chkLaminada, chkCaja].forEach(el => {
  el.addEventListener("change", () => { setPillState(el); calcPrices(); });
});
document.querySelectorAll('input[name="camara"]').forEach(r => {
  r.addEventListener("change", () => { setPillState(r); calcPrices(); });
});
