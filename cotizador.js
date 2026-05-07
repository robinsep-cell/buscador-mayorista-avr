// ── Cotizador AutovidriosRobin ────────────────────────────────────────────────

window.cotSelection = new Map(); // _id → product (con _cant). Manuales usan key "m_N"
let _cotNumero = null;
let _manualCounter = 0;

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

document.getElementById("resultsBody").addEventListener("change", e => {
  const cb = e.target.closest(".cot-check");
  if (!cb) return;
  const id = Number(cb.dataset.id);
  const product = window._products?.find(p => p._id === id);
  if (!product) return;
  if (cb.checked) {
    if (!product._cant) product._cant = 1;
    window.cotSelection.set(id, product);
  } else {
    window.cotSelection.delete(id);
  }
  updateCotBtn();
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
  });

  cotBtnGuardar.disabled = false;
  if (error) {
    cotBtnGuardar.textContent = "💾 Guardar";
    alert("Error al guardar: " + error.message);
  } else {
    cotBtnGuardar.textContent = "✓ Guardado";
    setTimeout(() => { cotBtnGuardar.textContent = "💾 Guardar"; }, 2500);
  }
}

// ── Imprimir ──────────────────────────────────────────────────────────────────
function printCot() {
  const logoSrc = document.querySelector(".cot-logo")?.src || "";
  // Sincronizar atributos value de todos los inputs/textareas antes de copiar el HTML
  const doc = document.getElementById("cotDoc");
  doc.querySelectorAll("input").forEach(el => el.setAttribute("value", el.value));
  doc.querySelectorAll("textarea").forEach(el => { el.innerHTML = el.value; });
  const content = doc.innerHTML;
  const win = window.open("", "_blank", "width=900,height=1100");
  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${_cotNumero || "Cotización"}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: sans-serif; font-size: 13px; color: #111; padding: 24px; }
  .cot-doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
  .cot-logo { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; }
  .cot-company-block { margin-left: 12px; }
  .cot-company-name { font-size: 15px; font-weight: 700; }
  .cot-company-tag { color: #666; font-size: 11px; }
  .cot-header-left { display: flex; align-items: center; gap: 12px; }
  .cot-title-block { text-align: right; }
  .cot-title-big { font-size: 20px; font-weight: 800; letter-spacing: 1px; }
  .cot-numero { font-size: 13px; font-weight: 600; margin-top: 4px; }
  .cot-envio { color: #b45309; font-size: 12px; margin: 8px 0 10px; }
  hr { border: none; border-top: 2px solid #111; margin: 10px 0; }
  .cot-client-box { border: 1px solid #ddd; border-left: 4px solid #111; border-radius: 6px; padding: 12px 16px; margin-bottom: 14px; background: #f9f9f9; }
  .cot-client-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #666; text-transform: uppercase; margin-bottom: 2px; }
  .cot-client-value { font-size: 14px; font-weight: 600; color: #333; margin-bottom: 8px; }
  .cot-client-row2 { display: flex; gap: 32px; }
  .cot-price-label { font-size: 11px; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  thead tr { background: #111; color: #fff; }
  thead th { padding: 8px 10px; text-align: left; font-size: 12px; }
  tbody tr:nth-child(even) { background: #f5f5f5; }
  tbody td { padding: 8px 10px; border-bottom: 1px solid #e5e5e5; font-size: 12px; vertical-align: middle; }
  .cot-totals { text-align: right; margin-bottom: 14px; }
  .cot-totals p { font-size: 12px; color: #555; margin-bottom: 3px; }
  .cot-totals .cot-total-row { font-size: 15px; font-weight: 800; color: #111; border-top: 2px solid #111; padding-top: 4px; margin-top: 4px; }
  .cot-notes-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #666; text-transform: uppercase; margin-bottom: 4px; }
  .cot-notes-val { font-size: 12px; color: #444; border: 1px solid #ddd; border-radius: 4px; padding: 8px; min-height: 40px; }
  .no-print { display: none !important; }
  .cot-cant-inp { border: none; background: transparent; width: 40px; text-align: center; font-size: 12px; }
</style>
</head>
<body>${content}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}

// ── Compartir WhatsApp ────────────────────────────────────────────────────────
function shareWA() {
  const tipo  = getPrecioTipo();
  const items = [...window.cotSelection.values()];
  let text = `*Cotización ${_cotNumero || ""}*\n`;
  text += `AutovidriosRobin SPA — ${formatDateShort(new Date())}\n`;
  if (cotNombreEl.value.trim()) text += `Cliente: ${cotNombreEl.value.trim()}\n`;
  text += "\n";
  items.forEach((p, i) => {
    const precio = getUnitPrice(p, tipo);
    const cant   = p._cant || 1;
    text += `${i + 1}. ${p.nombre} x${cant} → ${fmtCLP(precio * cant)}\n`;
  });
  let subtotal = 0;
  items.forEach(p => { subtotal += getUnitPrice(p, tipo) * (p._cant || 1); });
  text += `\n*TOTAL: ${fmtCLP(subtotal)}*\nValidez: 3 días hábiles`;
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
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
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:9px 10px;font-weight:700;color:var(--primary)">${esc(r.numero || "—")}</td>
            <td style="padding:9px 10px">${fmtDate(r.created_at)}</td>
            <td style="padding:9px 10px">${esc(r.cliente_nombre || "—")}</td>
            <td style="padding:9px 10px">${esc(r.ejecutivo || "—")}</td>
            <td style="padding:9px 10px;text-align:right;font-weight:600">${fmtCLP(r.total)}</td>
            <td style="padding:9px 10px;color:var(--muted)">${Array.isArray(r.items) ? r.items.length + " prod." : "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;
}

async function loadHistorial() {
  historialList.innerHTML = `<p style="color:var(--muted);text-align:center;padding:24px">Cargando…</p>`;
  const { data, error } = await window._sb
    .from("cotizaciones")
    .select("numero,created_at,cliente_nombre,ejecutivo,total,items")
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

cotBtnEmail?.addEventListener("click", () => {
  const dest    = cotEmailEl.value.trim();
  const subject = encodeURIComponent("Cotización " + (_cotNumero || "") + " — AutovidriosRobin");
  const body    = encodeURIComponent(
    "Estimado/a " + (cotNombreEl.value.trim() || "cliente") + ",\n\n" +
    "Adjunto encontrará su cotización " + (_cotNumero || "") + ".\n\n" +
    "Saludos,\nAutovidriosRobin SPA\n+56 9 XXXX XXXX"
  );
  window.open(`mailto:${dest}?subject=${subject}&body=${body}`, "_blank");
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
