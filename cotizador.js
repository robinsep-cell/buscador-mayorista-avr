// ── Cotizador AutovidriosRobin ────────────────────────────────────────────────

window.cotSelection = new Map(); // _id → product (con _cant). Manuales usan key "m_N"
let _cotNumero    = null;
let _manualCounter = 0;
let _reemplazaA   = null; // numero de cotización que se reemplaza al guardar
let _cotSavedNumero = null; // número ya guardado en esta sesión del modal (evita doble insert)

// ── DOM ───────────────────────────────────────────────────────────────────────
const cotBtn      = document.getElementById("cotBtn");
const cotBadge    = document.getElementById("cotBadge");
const cotModal    = document.getElementById("cotModal");
const cotDocEl    = document.getElementById("cotDoc");

const cotNumeroEl = document.getElementById("cotNumero");
const cotFechaEl  = document.getElementById("cotFecha");
const cotEnvioEl  = document.getElementById("cotEnvio");
const cotItemsEl  = document.getElementById("cotItemsTbody");
const cotNetoEl   = document.getElementById("cotNeto");
const cotIvaEl    = document.getElementById("cotIva");
const cotTotalEl  = document.getElementById("cotTotal");
const cotNotasEl  = document.getElementById("cotNotas");

const cotNombreEl = document.getElementById("cotClienteNombre");
const cotRutEl    = document.getElementById("cotClienteRut");
const cotTelEl    = document.getElementById("cotClienteTel");
const cotEmailEl  = document.getElementById("cotClienteEmail");
const cotEjecEl   = document.getElementById("cotEjecutivo");
const cotRutMsg   = document.getElementById("cotRutMsg");
const cotEmailMsg = document.getElementById("cotEmailMsg");

const cotBtnClose    = document.getElementById("cotClose");
const cotBtnGuardar  = document.getElementById("cotBtnGuardar");
const cotBtnEmail    = document.getElementById("cotBtnEmail");
const cotBtnWA       = document.getElementById("cotBtnWA");
const cotBtnCopiar   = document.getElementById("cotBtnCopiar");
const cotBtnImprimir = document.getElementById("cotBtnImprimir");

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePrice(v) {
  const n = parseInt(String(v ?? "").replace(/\./g, ""), 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

function fmtCLP(n) {
  if (!n || n <= 0) return "$ 0";
  return "$ " + Math.round(n).toLocaleString("es-CL");
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function yearRange(d, h) {
  if (!d && !h) return "";
  return `${d || "—"} - ${h || "—"}`;
}

function formatDateShort(d) {
  return d.toLocaleDateString("es-CL");
}

function formatDateLong(d) {
  return d.toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  });
}

function addBusinessDays(date, n) {
  const d = new Date(date);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

// ── RUT ───────────────────────────────────────────────────────────────────────
function formatRut(v) {
  const clean = v.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

function validateRut(rut) {
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 2) return false;
  const body = clean.slice(0, -1);
  const dv   = clean.slice(-1);
  let sum = 0, m = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const exp = 11 - (sum % 11);
  const expDv = exp === 11 ? "0" : exp === 10 ? "K" : String(exp);
  return dv === expDv;
}

// ── Precio tipo ───────────────────────────────────────────────────────────────
function getPrecioTipo() {
  return document.querySelector('input[name="cotPrecio"]:checked')?.value ?? "sin";
}

function getUnitPrice(p, tipo) {
  if (p._isManual) return p._precioManual || 0;
  if (tipo === "con") return parsePrice(p.ventaCon);
  return parsePrice(p.ventaSin); // "sin" o "ambas" → sin instalación para subtotal
}

// ── Render items del modal ────────────────────────────────────────────────────
function renderCotItems() {
  const tipo   = getPrecioTipo();
  const items  = [...window.cotSelection.values()];

  if (!items.length) {
    cotItemsEl.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:12px;color:var(--muted)">Sin productos seleccionados.</td></tr>`;
    calcTotals();
    return;
  }

  cotItemsEl.innerHTML = items.map((p, idx) => {
    const cant = p._cant || 1;
    const sin  = parsePrice(p.ventaSin);
    const con  = parsePrice(p.ventaCon);

    if (tipo === "ambas") {
      const subSin = sin * cant;
      const subCon = con * cant;
      return `
        <tr>
          <td class="cot-td cot-td-num" rowspan="2">${idx + 1}</td>
          <td class="cot-td" rowspan="2">
            <strong>${esc(p.nombre)}</strong>
            <span class="cot-item-sub">${esc(p.marca)} · ${esc(p.color)} · ${esc(yearRange(p.anioDesde, p.anioHasta))}</span>
          </td>
          <td class="cot-td cot-td-cant" rowspan="2">
            <input class="cot-cant-inp" type="number" value="${cant}" min="1" max="999" data-id="${p._id}" />
          </td>
          <td class="cot-td cot-td-price">Sin inst.: ${fmtCLP(sin)}</td>
          <td class="cot-td cot-td-price">${fmtCLP(subSin)}</td>
          <td class="cot-td no-print" rowspan="2">
            <button class="cot-rm-btn" data-id="${p._id}">✕</button>
          </td>
        </tr>
        <tr>
          <td class="cot-td cot-td-price">Con inst.: ${fmtCLP(con)}</td>
          <td class="cot-td cot-td-price">${fmtCLP(subCon)}</td>
        </tr>`;
    }

    // Producto manual: precio editable directamente
    if (p._isManual) {
      const precio = p._precioManual || 0;
      const sub    = precio * cant;
      return `
        <tr>
          <td class="cot-td cot-td-num">${idx + 1}</td>
          <td class="cot-td">
            <strong>${esc(p.nombre)}</strong>
          </td>
          <td class="cot-td cot-td-cant">
            <input class="cot-cant-inp" type="number" value="${cant}" min="1" max="999" data-id="${p._id}" />
          </td>
          <td class="cot-td cot-td-price">
            <input class="cot-precio-manual-inp" type="number" value="${precio}" min="0" data-id="${p._id}" style="width:100px;border:1px solid var(--border);border-radius:5px;padding:3px 6px;background:var(--bg);color:var(--text);font-size:0.82rem;" />
          </td>
          <td class="cot-td cot-td-price"><strong>${fmtCLP(sub)}</strong></td>
          <td class="cot-td no-print">
            <button class="cot-rm-btn" data-id="${p._id}">✕</button>
          </td>
        </tr>`;
    }

    const precio = tipo === "con" ? con : sin;
    const sub    = precio * cant;
    return `
      <tr>
        <td class="cot-td cot-td-num">${idx + 1}</td>
        <td class="cot-td">
          <strong>${esc(p.nombre)}</strong>
          <span class="cot-item-sub">${esc(p.marca)} · ${esc(p.color)} · ${esc(yearRange(p.anioDesde, p.anioHasta))}</span>
        </td>
        <td class="cot-td cot-td-cant">
          <input class="cot-cant-inp" type="number" value="${cant}" min="1" max="999" data-id="${p._id}" />
        </td>
        <td class="cot-td cot-td-price">${fmtCLP(precio)}</td>
        <td class="cot-td cot-td-price"><strong>${fmtCLP(sub)}</strong></td>
        <td class="cot-td no-print">
          <button class="cot-rm-btn" data-id="${p._id}">✕</button>
        </td>
      </tr>`;
  }).join("");

  // Cantidad inputs
  cotItemsEl.querySelectorAll(".cot-cant-inp").forEach(inp => {
    inp.addEventListener("change", () => {
      const raw = inp.dataset.id;
      const id  = raw.startsWith("m_") ? raw : Number(raw);
      const p   = window.cotSelection.get(id);
      if (p) {
        p._cant = Math.max(1, parseInt(inp.value) || 1);
        inp.value = p._cant;
        window.cotSelection.set(id, p);
      }
      renderCotItems();
    });
  });

  // Precio manual editable
  cotItemsEl.querySelectorAll(".cot-precio-manual-inp").forEach(inp => {
    inp.addEventListener("change", () => {
      const id = inp.dataset.id;
      const p  = window.cotSelection.get(id);
      if (p) {
        p._precioManual = Math.max(0, parseInt(inp.value) || 0);
        window.cotSelection.set(id, p);
      }
      renderCotItems();
    });
  });

  // Botones eliminar
  cotItemsEl.querySelectorAll(".cot-rm-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const raw = btn.dataset.id;
      const id  = raw.startsWith("m_") ? raw : Number(raw);
      window.cotSelection.delete(id);
      const cb = document.querySelector(`.cot-check[data-id="${id}"]`);
      if (cb) cb.checked = false;
      updateCotBtn();
      renderCotItems();
    });
  });

  calcTotals();
}

function calcTotals() {
  const tipo = getPrecioTipo();
  let subtotal = 0;
  [...window.cotSelection.values()].forEach(p => {
    const precio = getUnitPrice(p, tipo);
    subtotal += precio * (p._cant || 1);
  });
  const neto = Math.round(subtotal / 1.19);
  const iva  = subtotal - neto;
  cotNetoEl.textContent  = fmtCLP(neto);
  cotIvaEl.textContent   = fmtCLP(iva);
  cotTotalEl.textContent = fmtCLP(subtotal);
}

// ── Abrir modal ───────────────────────────────────────────────────────────────
async function openCotModal() {

  const today = new Date();
  cotFechaEl.textContent = "Fecha: " + formatDateShort(today);

  const envio    = addBusinessDays(today, 2);
  const envioStr = formatDateLong(envio);
  cotEnvioEl.innerHTML = `<strong>📦 Envío estimado:</strong> ${envioStr.charAt(0).toUpperCase() + envioStr.slice(1)}`;

  // Ejecutivo = usuario actual
  if (cotEjecEl && window.currentUser) {
    cotEjecEl.value = window.currentUser.nombre || window.currentUser.email || "";
  }

  // Correlativo desde Supabase
  cotNumeroEl.textContent = "Generando…";
  try {
    const { data, error } = await window._sb.rpc("next_cotizacion_numero");
    _cotNumero = (!error && data) ? data : "COT-" + today.toISOString().slice(0,10).replace(/-/g,"") + "-?";
  } catch {
    _cotNumero = null;
  }
  cotNumeroEl.textContent = "N° " + (_cotNumero || "—");
  _cotSavedNumero = null; // cotización nueva: aún no guardada

  renderCotItems();
  cotModal.showModal();
}

// ── Selección de productos ────────────────────────────────────────────────────
function updateCotBtn() {
  const n = window.cotSelection.size;
  cotBadge.textContent = n;
  cotBadge.hidden  = n === 0;
  cotBtn.disabled  = false; // siempre habilitado, se pueden agregar externos
}

// Agrega un VIDRIO a la cotización con precio FIJO según el tipo elegido (sin/con
// instalación). Unifica el flujo de vidrios con el de espejos (menú + Agregar → precio
// fijo). El nombre queda anotado con "· Sin/Con instalación" para que se lea en el PDF.
window.addCotVidrio = function (id, tipo) {
  const p = window._products?.find(x => x._id === id);
  if (!p) return null;
  const precio = tipo === "con" ? parsePrice(p.ventaCon) : parsePrice(p.ventaSin);
  if (!precio) return null;
  const etiqueta = tipo === "con" ? "Con instalación" : "Sin instalación";
  return window.addCotItem({
    nombre:    `${p.nombre} · ${etiqueta}`,
    precio,
    marca:     p.marca || "",
    color:     p.color || "",
    anioDesde: p.anioDesde || "",
    anioHasta: p.anioHasta || "",
    cant: 1,
  });
};

// Click en "Agregar" de una fila de resultados → agrega el vidrio con el precio elegido.
document.getElementById("resultsBody").addEventListener("click", e => {
  const btn = e.target.closest(".cot-add-btn");
  if (!btn) return;
  const id   = Number(btn.dataset.id);
  const sel  = btn.parentElement.querySelector(".cot-op");
  const tipo = sel ? sel.value : "sin";
  if (!window.addCotVidrio(id, tipo)) return;
  btn.textContent = "✓ Agregado";
  btn.disabled = true;
  setTimeout(() => { btn.textContent = "Agregar"; btn.disabled = false; }, 1400);
});

// ── Guardar en Supabase ───────────────────────────────────────────────────────
async function saveCotizacion() {
  if (!_cotNumero) { alert("Error: sin número de cotización."); return; }

  cotBtnGuardar.disabled     = true;
  cotBtnGuardar.textContent  = "Guardando…";

  const tipo = getPrecioTipo();
  let subtotal = 0;
  const items = [...window.cotSelection.values()].map(p => {
    const cant   = p._cant || 1;
    const precio = getUnitPrice(p, tipo);
    subtotal += precio * cant;
    return {
      nombre: p.nombre, marca: p.marca, color: p.color,
      anioDesde: p.anioDesde, anioHasta: p.anioHasta,
      cant, precioSin: parsePrice(p.ventaSin),
      precioCon: parsePrice(p.ventaCon), precio,
    };
  });
  const neto = Math.round(subtotal / 1.19);
  const iva  = subtotal - neto;

  const { error } = await window._sb.from("cotizaciones").insert({
    numero:           _cotNumero,
    cliente_nombre:   cotNombreEl.value.trim(),
    cliente_rut:      cotRutEl.value.trim(),
    cliente_telefono: cotTelEl.value.trim(),
    cliente_email:    cotEmailEl.value.trim(),
    ejecutivo:        cotEjecEl.value.trim(),
    precio_tipo:      tipo,
    items,
    notas:            cotNotasEl.value.trim(),
    neto, iva, total: subtotal,
    created_by:       window.currentUser?.email || "",
    reemplaza_a:      _reemplazaA || null,
  });

  cotBtnGuardar.disabled = false;
  if (error) {
    cotBtnGuardar.textContent = "💾 Guardar";
    alert("Error al guardar: " + error.message);
    return;
  }
  _cotSavedNumero = _cotNumero; // marca esta cotización como ya guardada en la sesión

  // Si reemplaza una anterior → anularla automáticamente
  if (_reemplazaA) {
    await window._sb.from("cotizaciones")
      .update({ estado: "anulada", anulada_por: _cotNumero })
      .eq("numero", _reemplazaA);
    _reemplazaA = null;
  }

  cotBtnGuardar.textContent = "✓ Guardado";
  setTimeout(() => { cotBtnGuardar.textContent = "💾 Guardar"; }, 2500);
}

// ── CSS del documento imprimible / PDF (compartido por printCot y el PDF de correo) ──
// CSS del documento PDF / impresión. Va SCOPED bajo `.avr-pdf` para no afectar la
// página (antes apuntaba a `body`, que no aplicaba al contenedor del PDF → salía en blanco).
const COT_PDF_CSS = `
  .avr-pdf, .avr-pdf * { box-sizing: border-box; margin: 0; padding: 0; }
  .avr-pdf { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 12.5px; color: #14261c; background: #fff; padding: 28px 30px; width: 794px; }
  .avr-pdf .cot-doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .avr-pdf .cot-header-left { display: flex; align-items: center; gap: 14px; }
  .avr-pdf .cot-logo { width: 66px; height: 66px; border-radius: 50%; object-fit: cover; }
  .avr-pdf .cot-company-name { font-size: 15px; font-weight: 800; letter-spacing: .3px; color: #14261c; }
  .avr-pdf .cot-company-block p { font-size: 11px; color: #45564c; line-height: 1.45; }
  .avr-pdf .cot-company-tag { color: #7a8a80; font-style: italic; }
  .avr-pdf .cot-title-block { text-align: right; }
  .avr-pdf .cot-title-big { font-size: 24px; font-weight: 800; letter-spacing: 2px; color: #0f5132; }
  .avr-pdf .cot-title-block p { font-size: 11.5px; color: #45564c; line-height: 1.5; }
  .avr-pdf .cot-title-block .cot-numero { font-size: 13px; font-weight: 700; color: #14261c; margin-top: 3px; }
  .avr-pdf .cot-rule { border: none; border-top: 2.5px solid #0f5132; margin: 8px 0 14px; }
  .avr-pdf .cot-envio { color: #b45309; font-size: 11.5px; margin: 0 0 12px; font-weight: 600; }
  .avr-pdf .cot-client { border: 1px solid #dfe6e1; border-left: 4px solid #0f5132; border-radius: 7px; padding: 12px 16px; margin-bottom: 16px; background: #f6f9f7; }
  .avr-pdf .cot-client-grid { display: flex; flex-wrap: wrap; gap: 8px 40px; }
  .avr-pdf .cot-client-item { min-width: 210px; }
  .avr-pdf .cot-k { font-size: 9px; font-weight: 700; letter-spacing: .8px; color: #7a8a80; text-transform: uppercase; }
  .avr-pdf .cot-v { font-size: 13px; font-weight: 600; color: #14261c; }
  .avr-pdf .cot-price-note { font-size: 11px; color: #556; margin-bottom: 8px; }
  .avr-pdf table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .avr-pdf thead tr { background: #0f5132; color: #fff; }
  .avr-pdf thead th { padding: 8px 10px; text-align: left; font-size: 11.5px; font-weight: 700; }
  .avr-pdf thead th.num, .avr-pdf thead th.cant { text-align: center; }
  .avr-pdf thead th.price { text-align: right; }
  .avr-pdf tbody td { padding: 7px 10px; border-bottom: 1px solid #e7ece8; font-size: 12px; vertical-align: top; }
  .avr-pdf tbody tr:nth-child(even) { background: #f6f9f7; }
  .avr-pdf td.num, .avr-pdf td.cant { text-align: center; }
  .avr-pdf td.price { text-align: right; white-space: nowrap; }
  .avr-pdf .cot-item-name { font-weight: 700; color: #14261c; }
  .avr-pdf .cot-item-sub { display: block; font-size: 10.5px; color: #7a8a80; margin-top: 1px; }
  .avr-pdf .cot-totals { margin-left: auto; width: 260px; margin-bottom: 16px; }
  .avr-pdf .cot-totals .row { display: flex; justify-content: space-between; font-size: 12px; color: #45564c; padding: 3px 0; }
  .avr-pdf .cot-totals .row.total { font-size: 15px; font-weight: 800; color: #0f5132; border-top: 2px solid #0f5132; padding-top: 6px; margin-top: 4px; }
  .avr-pdf .cot-notes { margin-bottom: 14px; }
  .avr-pdf .cot-notes .cot-k { margin-bottom: 4px; }
  .avr-pdf .cot-notes-body { font-size: 12px; color: #37463d; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .avr-pdf .cot-garantia { border-top: 1px solid #dfe6e1; padding-top: 10px; }
  .avr-pdf .cot-garantia-title { font-size: 10px; font-weight: 700; letter-spacing: .8px; color: #7a8a80; text-transform: uppercase; margin-bottom: 4px; }
  .avr-pdf .cot-garantia p { font-size: 10.5px; color: #556; line-height: 1.5; }
`;

// Filas de la tabla en TEXTO PLANO (sin <input>) para el PDF / impresión.
function cotPdfRows(items, tipo) {
  return items.map((p, idx) => {
    const cant = p._cant || 1;
    const n    = idx + 1;
    const sub  = p._isManual ? "" :
      `<span class="cot-item-sub">${esc([p.marca, p.color, yearRange(p.anioDesde, p.anioHasta)].filter(Boolean).join(" · "))}</span>`;
    const nameCell = `<span class="cot-item-name">${esc(p.nombre)}</span>${sub}`;

    if (!p._isManual && tipo === "ambas") {
      const sin = parsePrice(p.ventaSin), con = parsePrice(p.ventaCon);
      return `
        <tr>
          <td class="num">${n}</td>
          <td>${nameCell}</td>
          <td class="cant">${cant}</td>
          <td class="price">Sin inst.: ${fmtCLP(sin)}<br>Con inst.: ${fmtCLP(con)}</td>
          <td class="price">${fmtCLP(sin * cant)}<br>${fmtCLP(con * cant)}</td>
        </tr>`;
    }
    const precio = getUnitPrice(p, tipo);
    return `
      <tr>
        <td class="num">${n}</td>
        <td>${nameCell}</td>
        <td class="cant">${cant}</td>
        <td class="price">${fmtCLP(precio)}</td>
        <td class="price">${fmtCLP(precio * cant)}</td>
      </tr>`;
  }).join("");
}

// Arma el HTML LIMPIO del documento (texto plano, sin controles de formulario). Se usa
// para el PDF (correo/WhatsApp) y para imprimir. Los precios ya incluyen IVA; el Neto se
// deriva (total/1.19), igual que en pantalla (calcTotals).
function buildCotDocHtml() {
  const tipo  = getPrecioTipo();
  const items = [...window.cotSelection.values()];

  let total = 0;
  items.forEach(p => { total += getUnitPrice(p, tipo) * (p._cant || 1); });
  const neto = Math.round(total / 1.19);
  const iva  = total - neto;

  const envio   = (cotEnvioEl?.textContent || "").trim();
  const fecha   = (cotFechaEl?.textContent || "").trim() || ("Fecha: " + formatDateShort(new Date()));

  const clientItems = [
    ["Cliente", cotNombreEl.value.trim()],
    ["RUT", cotRutEl.value.trim()],
    ["Teléfono", cotTelEl.value.trim()],
    ["Correo", cotEmailEl.value.trim()],
    ["Ejecutivo responsable", cotEjecEl.value.trim()],
  ].filter(([, v]) => v)
   .map(([k, v]) => `<div class="cot-client-item"><div class="cot-k">${k}</div><div class="cot-v">${esc(v)}</div></div>`)
   .join("");

  const notas    = cotNotasEl.value.trim();
  const rowsHtml = cotPdfRows(items, tipo) ||
    `<tr><td colspan="5" style="text-align:center;padding:14px;color:#7a8a80">Sin productos.</td></tr>`;

  return `<div class="avr-pdf">
    <div class="cot-doc-header">
      <div class="cot-header-left">
        <img class="cot-logo" src="./logo-autovidriosrobin.jpg" alt="AVR" />
        <div class="cot-company-block">
          <p class="cot-company-name">AUTOVIDRIOSROBIN SPA</p>
          <p>RUT: 77.068.352-1</p>
          <p>José Arrieta 7044, La Reina</p>
          <p class="cot-company-tag">Venta al por menor — Repuestos Automotrices</p>
        </div>
      </div>
      <div class="cot-title-block">
        <p class="cot-title-big">COTIZACIÓN</p>
        <p class="cot-numero">N° ${esc(_cotNumero || "—")}</p>
        <p>${esc(fecha)}</p>
        <p>Validez: <strong>3 días hábiles</strong></p>
      </div>
    </div>
    ${envio ? `<p class="cot-envio">${esc(envio)}</p>` : ""}
    <hr class="cot-rule" />
    ${clientItems ? `<div class="cot-client"><div class="cot-client-grid">${clientItems}</div></div>` : ""}
    <p class="cot-price-note">Valores en pesos chilenos (CLP), IVA incluido. La instalación se indica en cada ítem.</p>
    <table>
      <thead>
        <tr>
          <th class="num">#</th>
          <th>Descripción del producto</th>
          <th class="cant">Cant.</th>
          <th class="price">P. Unitario</th>
          <th class="price">Subtotal</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="cot-totals">
      <div class="row"><span>Neto</span><span>${fmtCLP(neto)}</span></div>
      <div class="row"><span>IVA (19%)</span><span>${fmtCLP(iva)}</span></div>
      <div class="row total"><span>TOTAL</span><span>${fmtCLP(total)}</span></div>
    </div>
    ${notas ? `<div class="cot-notes"><div class="cot-k">Notas / Observaciones</div><div class="cot-notes-body">${esc(notas)}</div></div>` : ""}
    <div class="cot-garantia">
      <p class="cot-garantia-title">Garantía y condiciones</p>
      <p>• Garantía de <strong>6 meses</strong> por falla de fábrica o instalación desde la fecha de entrega.</p>
      <p>• Productos pintados, grabados o alterados <strong>no podrán ser devueltos</strong>.</p>
      <p>• Devoluciones por desistimiento: <strong>10 días hábiles</strong> desde la entrega, en las mismas condiciones en que fue entregado el producto.</p>
    </div>
  </div>`;
}

// Genera el PDF de la cotización y lo devuelve como base64 (sin el prefijo data:).
// El contenedor se renderiza EN PANTALLA (no fuera de ella): html2canvas capturaba
// vacío cuando el nodo estaba en left:-9999px → PDF en blanco.
async function buildCotPdfBase64() {
  if (typeof html2pdf === "undefined") throw new Error("Falta la librería de PDF (html2pdf).");
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;left:0;top:0;z-index:2147483647;background:#fff;width:794px;pointer-events:none;";
  wrap.innerHTML = `<style>${COT_PDF_CSS}</style>${buildCotDocHtml()}`;
  document.body.appendChild(wrap);

  // Esperar a que el logo cargue para que no salga cortado en el canvas.
  const img = wrap.querySelector("img.cot-logo");
  if (img && !img.complete) {
    await new Promise((res) => { img.onload = img.onerror = res; setTimeout(res, 1500); });
  }

  try {
    const opt = {
      margin:      [8, 8, 8, 8],
      image:       { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true },
      jsPDF:       { unit: "mm", format: "a4", orientation: "portrait" },
    };
    const dataUri = await html2pdf().set(opt).from(wrap.querySelector(".avr-pdf")).outputPdf("datauristring");
    return dataUri.split(",")[1];
  } finally {
    wrap.remove();
  }
}

// ── Imprimir ──────────────────────────────────────────────────────────────────
function printCot() {
  const win = window.open("", "_blank", "width=900,height=1100");
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${_cotNumero || "Cotización"}</title>
<style>${COT_PDF_CSS} @page { margin: 10mm; } .avr-pdf { width: auto; }</style>
</head>
<body>${buildCotDocHtml()}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ── Compartir WhatsApp (con PDF por link firmado) ─────────────────────────────
// WhatsApp no permite adjuntar archivos por link: se sube el PDF a Supabase y se
// manda el texto + el enlace firmado (función cotizacion-pdf).
async function shareWA() {
  if (!window.cotSelection.size) { alert("La cotización no tiene productos."); return; }

  const prev = cotBtnWA.textContent;
  cotBtnWA.disabled = true;
  try {
    // 1) Guardar (una sola vez por cotización)
    if (_cotSavedNumero !== _cotNumero) {
      cotBtnWA.textContent = "Guardando…";
      await saveCotizacion();
    }

    // 2) PDF → 3) subir y obtener link firmado
    cotBtnWA.textContent = "Generando PDF…";
    const pdf_base64 = await buildCotPdfBase64();
    cotBtnWA.textContent = "Subiendo…";
    const { data, error } = await window._sb.functions.invoke("cotizacion-pdf", {
      body: { numero: _cotNumero || "", pdf_base64 },
    });
    if (error || !data?.ok || !data.url) {
      throw new Error(error?.message || data?.error || "no se pudo subir el PDF");
    }

    // 4) Texto de WhatsApp: resumen + link al PDF
    const tipo  = getPrecioTipo();
    const items = [...window.cotSelection.values()];
    let text = `*Cotización ${_cotNumero || ""}*\n`;
    text += `AutoVidriosRobin SPA — ${formatDateShort(new Date())}\n`;
    if (cotNombreEl.value.trim()) text += `Cliente: ${cotNombreEl.value.trim()}\n`;
    text += "\n";
    items.forEach((p, i) => {
      const precio = getUnitPrice(p, tipo);
      const cant   = p._cant || 1;
      text += `${i + 1}. ${p.nombre} x${cant} → ${fmtCLP(precio * cant)}\n`;
    });
    let subtotal = 0;
    items.forEach(p => { subtotal += getUnitPrice(p, tipo) * (p._cant || 1); });
    text += `\n*TOTAL: ${fmtCLP(subtotal)}*\nValidez: 3 días hábiles\n\n📄 Descarga tu cotización en PDF:\n${data.url}`;

    // 5) Abrir WhatsApp — al número del cliente si está cargado
    const fono = (cotTelEl.value || "").replace(/\D/g, "");
    const to   = fono ? (fono.length === 9 ? "56" + fono : fono) : "";
    const base = to ? `https://wa.me/${to}` : "https://wa.me/";
    window.open(base + "?text=" + encodeURIComponent(text), "_blank");

    cotBtnWA.textContent = "✓ Listo";
    setTimeout(() => { cotBtnWA.textContent = prev; cotBtnWA.disabled = false; }, 2500);
  } catch (e) {
    alert("No se pudo preparar el WhatsApp: " + (e.message || e));
    cotBtnWA.textContent = prev;
    cotBtnWA.disabled = false;
  }
}

// ── Event listeners ───────────────────────────────────────────────────────────
// ── Historial de cotizaciones ─────────────────────────────────────────────────
const historialModal  = document.getElementById("historialModal");
const historialClose  = document.getElementById("historialClose");
const historialList   = document.getElementById("historialList");
const historialSearch = document.getElementById("historialSearch");
const historialReload = document.getElementById("historialReload");
let _historialData    = [];

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-CL", { day:"2-digit", month:"2-digit", year:"numeric" });
}

function renderHistorial(rows) {
  if (!rows.length) {
    historialList.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px">Sin cotizaciones encontradas.</p>`;
    return;
  }
  historialList.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:600">N°</th>
          <th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:600">Fecha</th>
          <th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:600">Cliente</th>
          <th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:600">Ejecutivo</th>
          <th style="text-align:right;padding:8px 10px;color:var(--muted);font-weight:600">Total</th>
          <th style="text-align:left;padding:8px 10px;color:var(--muted);font-weight:600">Items</th>
          <th style="padding:8px 10px"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const anulada = r.estado === 'anulada';
          const rowStyle = anulada
            ? 'border-bottom:1px solid var(--border);opacity:0.45;text-decoration:line-through'
            : 'border-bottom:1px solid var(--border)';
          const refTag = r.reemplaza_a
            ? `<div style="font-size:0.7rem;color:#f59e0b;margin-top:2px">↺ Reemplaza ${esc(r.reemplaza_a)}</div>` : "";
          const anuladaTag = r.anulada_por
            ? `<div style="font-size:0.7rem;color:#f87171;margin-top:2px">→ Reemplazada por ${esc(r.anulada_por)}</div>` : "";
          const btnAnular = anulada
            ? `<span style="font-size:0.75rem;color:#f87171;font-weight:600">ANULADA</span>${anuladaTag}`
            : `<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-start">
                <button class="hist-requotizar-btn" style="background:none;border:1px solid var(--primary);color:var(--primary);border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.78rem;font-weight:600">↺ Re-cotizar</button>
                <button class="hist-anular-btn" data-id="${r.id}" data-num="${esc(r.numero)}"
                  style="background:none;border:1px solid #f87171;color:#f87171;border-radius:6px;padding:4px 10px;cursor:pointer;font-size:0.78rem;font-weight:600">
                  Anular
                </button>
              </div>`;
          return `
            <tr style="${rowStyle}">
              <td style="padding:9px 10px;font-weight:700;color:var(--primary)">${esc(r.numero || "—")}${refTag}</td>
              <td style="padding:9px 10px">${fmtDate(r.created_at)}</td>
              <td style="padding:9px 10px">${esc(r.cliente_nombre || "—")}</td>
              <td style="padding:9px 10px">${esc(r.ejecutivo || "—")}</td>
              <td style="padding:9px 10px;text-align:right;font-weight:600">${fmtCLP(r.total)}</td>
              <td style="padding:9px 10px;color:var(--muted)">${Array.isArray(r.items) ? r.items.length + " prod." : "—"}</td>
              <td style="padding:9px 10px">${btnAnular}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  // Listeners botones re-cotizar
  historialList.querySelectorAll(".hist-requotizar-btn").forEach((btn, i) => {
    const row = rows.filter(r => r.estado !== 'anulada')[i];
    btn.addEventListener("click", () => { if (row) reQuotizar(row); });
  });

  // Listeners botones anular
  historialList.querySelectorAll(".hist-anular-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const num = btn.dataset.num;
      if (!confirm(`¿Anular cotización ${num}? Quedará marcada pero no se eliminará.`)) return;
      btn.disabled = true;
      btn.textContent = "…";
      const { error } = await window._sb
        .from("cotizaciones")
        .update({ estado: "anulada" })
        .eq("id", btn.dataset.id);
      if (error) { alert("Error: " + error.message); btn.disabled = false; btn.textContent = "Anular"; return; }
      await loadHistorial();
    });
  });
}

async function loadHistorial() {
  historialList.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px">Cargando…</p>`;
  const { data, error } = await window._sb
    .from("cotizaciones")
    .select("id,numero,created_at,cliente_nombre,cliente_rut,cliente_telefono,cliente_email,ejecutivo,total,items,notas,estado,reemplaza_a,anulada_por")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    historialList.innerHTML = `<p style="color:#f87171;text-align:center;padding:24px">Error: ${error.message}</p>`;
    return;
  }
  _historialData = data || [];
  renderHistorial(_historialData);
}

function filterHistorial() {
  const q = (historialSearch.value || "").toLowerCase().trim();
  if (!q) return renderHistorial(_historialData);
  const filtered = _historialData.filter(r =>
    (r.numero || "").toLowerCase().includes(q) ||
    (r.cliente_nombre || "").toLowerCase().includes(q) ||
    (r.ejecutivo || "").toLowerCase().includes(q)
  );
  renderHistorial(filtered);
}

// ── Re-cotizar ────────────────────────────────────────────────────────────────
async function reQuotizar(row) {
  historialModal.close();

  // Limpiar estado anterior
  window.cotSelection.clear();
  _manualCounter = 0;
  _reemplazaA = row.numero;

  // Cargar items como productos manuales
  (row.items || []).forEach(item => {
    const key = "m_" + (++_manualCounter);
    window.cotSelection.set(key, {
      _id: key, _isManual: true,
      _cant: item.cant || 1,
      _precioManual: item.precio || item.precioSin || 0,
      nombre:    item.nombre    || "",
      marca:     item.marca     || "",
      color:     item.color     || "",
      anioDesde: item.anioDesde || "",
      anioHasta: item.anioHasta || "",
      ventaSin: String(item.precioSin || 0),
      ventaCon: String(item.precioCon || 0),
    });
  });

  updateCotBtn();
  await openCotModal();

  // Pre-llenar datos del cliente
  if (cotNombreEl) cotNombreEl.value = row.cliente_nombre || "";
  if (cotRutEl)    cotRutEl.value    = row.cliente_rut    || "";
  if (cotTelEl)    cotTelEl.value    = row.cliente_telefono || "";
  if (cotEmailEl)  cotEmailEl.value  = row.cliente_email  || "";
  if (cotEjecEl)   cotEjecEl.value   = row.ejecutivo      || "";
  if (cotNotasEl)  cotNotasEl.value  = (row.notas ? row.notas + "\n" : "") +
                                        `Reemplaza a: ${row.numero}`;
}

document.getElementById("historialBtn")?.addEventListener("click", () => {
  historialModal.showModal();
  loadHistorial();
});
historialClose?.addEventListener("click", () => historialModal.close());
historialModal?.addEventListener("click", e => { if (e.target === historialModal) historialModal.close(); });
historialReload?.addEventListener("click", loadHistorial);
historialSearch?.addEventListener("input", filterHistorial);

cotBtn?.addEventListener("click", openCotModal);
cotBtnClose?.addEventListener("click", () => cotModal.close());
cotModal?.addEventListener("click", e => { if (e.target === cotModal) cotModal.close(); });

cotBtnGuardar?.addEventListener("click", saveCotizacion);
cotBtnImprimir?.addEventListener("click", printCot);
cotBtnWA?.addEventListener("click", shareWA);

cotBtnEmail?.addEventListener("click", async () => {
  const dest = cotEmailEl.value.trim();
  if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
    alert("Escribe un correo válido del cliente antes de enviar.");
    cotEmailEl.focus();
    return;
  }
  if (!window.cotSelection.size) { alert("La cotización no tiene productos."); return; }

  const prev = cotBtnEmail.textContent;
  cotBtnEmail.disabled = true;
  try {
    // 1) Guardar en el historial (una sola vez por cotización)
    if (_cotSavedNumero !== _cotNumero) {
      cotBtnEmail.textContent = "Guardando…";
      await saveCotizacion();
    }

    // 2) Generar el PDF
    cotBtnEmail.textContent = "Generando PDF…";
    const pdf_base64 = await buildCotPdfBase64();

    // 3) Enviar por correo con el PDF adjunto (función Supabase → Resend)
    cotBtnEmail.textContent = "Enviando…";
    const tipo = getPrecioTipo();
    let subtotal = 0;
    [...window.cotSelection.values()].forEach(p => { subtotal += getUnitPrice(p, tipo) * (p._cant || 1); });

    const { data, error } = await window._sb.functions.invoke("cotizacion-email", {
      body: {
        to:             dest,
        cliente_nombre: cotNombreEl.value.trim(),
        numero:         _cotNumero || "",
        total:          subtotal,
        ejecutivo:      cotEjecEl.value.trim(),
        filename:       `Cotizacion_${_cotNumero || "AVR"}.pdf`,
        pdf_base64,
      },
    });
    if (error || !data?.ok) throw new Error(error?.message || data?.error || "no se pudo enviar");

    cotBtnEmail.textContent = "✓ Enviado";
    setTimeout(() => { cotBtnEmail.textContent = prev; cotBtnEmail.disabled = false; }, 2800);
  } catch (e) {
    alert("No se pudo enviar el correo: " + (e.message || e));
    cotBtnEmail.textContent = prev;
    cotBtnEmail.disabled = false;
  }
});

cotBtnCopiar?.addEventListener("click", () => {
  const tipo  = getPrecioTipo();
  const items = [...window.cotSelection.values()];
  let text = `Cotización ${_cotNumero || ""} — ${formatDateShort(new Date())}\nAutovidriosRobin SPA\n\n`;
  items.forEach((p, i) => {
    const precio = getUnitPrice(p, tipo);
    const cant   = p._cant || 1;
    text += `${i + 1}. ${p.nombre} x${cant} — ${fmtCLP(precio * cant)}\n`;
  });
  let subtotal = 0;
  items.forEach(p => { subtotal += getUnitPrice(p, tipo) * (p._cant || 1); });
  text += `\nTOTAL: ${fmtCLP(subtotal)}\nValidez: 3 días hábiles`;
  navigator.clipboard.writeText(text).then(() => {
    cotBtnCopiar.textContent = "✓ Copiado";
    setTimeout(() => { cotBtnCopiar.textContent = "📋 Copiar"; }, 2000);
  });
});

// ── Producto externo / manual ─────────────────────────────────────────────────
const cotAddManualBtn    = document.getElementById("cotAddManualBtn");
const cotManualForm      = document.getElementById("cotManualForm");
const cotManualNombreEl  = document.getElementById("cotManualNombre");
const cotManualCantEl    = document.getElementById("cotManualCant");
const cotManualPrecioEl  = document.getElementById("cotManualPrecio");
const cotManualConfirm   = document.getElementById("cotManualConfirm");
const cotManualCancel    = document.getElementById("cotManualCancel");

cotAddManualBtn?.addEventListener("click", () => {
  cotManualForm.hidden = false;
  cotManualNombreEl.focus();
});

cotManualCancel?.addEventListener("click", () => {
  cotManualForm.hidden = true;
  cotManualNombreEl.value = "";
  cotManualCantEl.value   = "1";
  cotManualPrecioEl.value = "";
});

function confirmManualProduct() {
  const nombre = cotManualNombreEl.value.trim();
  if (!nombre) { cotManualNombreEl.focus(); return; }
  const cant   = Math.max(1, parseInt(cotManualCantEl.value) || 1);
  const precio = Math.max(0, parseInt(String(cotManualPrecioEl.value).replace(/\./g,"")) || 0);
  const key    = "m_" + (++_manualCounter);
  window.cotSelection.set(key, {
    _id: key, _isManual: true, _cant: cant, _precioManual: precio,
    nombre, marca: "", color: "", anioDesde: "", anioHasta: "",
    ventaSin: "0", ventaCon: "0",
  });
  // Resetear form
  cotManualNombreEl.value = "";
  cotManualCantEl.value   = "1";
  cotManualPrecioEl.value = "";
  cotManualForm.hidden    = true;
  updateCotBtn();
  renderCotItems();
}

// Helper público para agregar un ítem a la cotización desde otros módulos (ej. espejos-cot.js).
// Reusa la key "m_N" (compatible con los handlers de cantidad/eliminar de ítems manuales).
window.addCotItem = function ({ nombre, precio, marca = "", anioDesde = "", anioHasta = "", color = "", cant = 1 } = {}) {
  if (!nombre) return null;
  const key = "m_" + (++_manualCounter);
  window.cotSelection.set(key, {
    _id: key, _isManual: true,
    _cant: Math.max(1, parseInt(cant) || 1),
    _precioManual: Math.max(0, Math.round(Number(precio)) || 0),
    nombre, marca, color, anioDesde, anioHasta,
    ventaSin: "0", ventaCon: "0",
  });
  updateCotBtn();
  renderCotItems();
  return key;
};

cotManualConfirm?.addEventListener("click", confirmManualProduct);
cotManualNombreEl?.addEventListener("keydown", e => { if (e.key === "Enter") cotManualPrecioEl.focus(); });
cotManualPrecioEl?.addEventListener("keydown", e => { if (e.key === "Enter") confirmManualProduct(); });

// Tipo de precio → re-renderizar
document.querySelectorAll('input[name="cotPrecio"]').forEach(r => {
  r.addEventListener("change", renderCotItems);
});

// RUT auto-format + validación
cotRutEl?.addEventListener("input", () => {
  cotRutEl.value = formatRut(cotRutEl.value);
  const v = cotRutEl.value;
  if (v.length > 3) {
    const ok = validateRut(v);
    cotRutEl.classList.toggle("cot-field-ok",  ok);
    cotRutEl.classList.toggle("cot-field-err", !ok);
    cotRutMsg.textContent = ok ? "✓ RUT válido" : "RUT inválido";
    cotRutMsg.className   = "cot-field-msg " + (ok ? "cot-msg-ok" : "cot-msg-err");
  } else {
    cotRutEl.classList.remove("cot-field-ok", "cot-field-err");
    cotRutMsg.textContent = "";
  }
});

// Email validación
cotEmailEl?.addEventListener("input", () => {
  const v  = cotEmailEl.value.trim();
  const ok = !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  cotEmailEl.classList.toggle("cot-field-ok",  v && ok);
  cotEmailEl.classList.toggle("cot-field-err", v && !ok);
  cotEmailMsg.textContent = v && !ok ? "Correo inválido" : "";
  cotEmailMsg.className   = "cot-field-msg cot-msg-err";
});
