// ── Ofertas vigentes (oct-2026) ──────────────────────────────────────────────
// La oferta NO vive acá: se le pregunta a la base (RPC pública
// web_promociones_vigentes), que devuelve [] cuando no hay ninguna. El % y las
// fechas vienen de ahí; nada hardcodeado. Además se revisa `hasta` en el cliente:
// si la pestaña queda abierta pasado el plazo, la oferta deja de mostrarse sola.
// Si la consulta falla, todo sigue como antes (precios normales).
(function () {
  let promos = [];
  const listeners = [];
  let timerFin = null;

  function vigente(pr) {
    if (!pr) return false;
    const now = Date.now();
    const hasta = Date.parse(pr.hasta);
    const desde = Date.parse(pr.desde);
    if (!Number.isFinite(hasta) || now > hasta) return false;
    if (Number.isFinite(desde) && now < desde) return false;
    const pct = Number(pr.pct);
    return pct > 0 && pct < 100;
  }

  // Oferta "parabrisas con instalación" vigente en este momento, o null.
  function parabrisas() {
    return promos.find(p => p.aplica === "parabrisas_instalado" && vigente(p)) || null;
  }

  function norm(s) {
    return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  // ¿Es un parabrisas? Sigla PBS (de la hoja o deducida del nombre), o
  // grupo/subgrupo/nombre que diga "parabrisas".
  function esParabrisas(p) {
    if (!p) return false;
    if (String(p.siglaSheet || p.sigla || "").trim().toUpperCase() === "PBS") return true;
    if (Array.isArray(p.siglasAuto) && p.siglasAuto.includes("PBS")) return true;
    return [p.grupo, p.subgrupo, p.nombre].some(v => norm(v).includes("parabrisas"));
  }

  function precioOferta(normal, pr) {
    return Math.round(Number(normal) * (1 - Number(pr.pct) / 100));
  }

  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  // Fecha de término en hora de Chile: "7-oct" (corto) o "7-oct-2026 23:59" (largo).
  function partesChile(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const f = new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago", day: "numeric", month: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d);
    const g = t => f.find(x => x.type === t)?.value || "";
    return { dia: Number(g("day")), mes: MESES[Number(g("month")) - 1] || "", anio: g("year"), hh: g("hour"), mm: g("minute") };
  }
  function hastaCorto(pr) {
    const p = partesChile(pr?.hasta);
    return p ? `${p.dia}-${p.mes}` : "";
  }
  function hastaLargo(pr) {
    const p = partesChile(pr?.hasta);
    return p ? `${p.dia}-${p.mes}-${p.anio} ${p.hh}:${p.mm}` : "";
  }
  // "Oferta −20% hasta 7-oct"
  function etiqueta(pr) {
    return `Oferta −${Number(pr.pct)}% hasta ${hastaCorto(pr)}`;
  }

  function avisar() {
    renderBanda();
    listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
  }

  // Al llegar `hasta`, se re-renderiza todo para que la oferta desaparezca.
  function programarFin() {
    clearTimeout(timerFin);
    const pr = parabrisas();
    if (!pr) return;
    const ms = Date.parse(pr.hasta) - Date.now() + 1000;
    if (ms > 0 && ms < 2147483647) timerFin = setTimeout(avisar, ms);
  }

  function renderBanda() {
    const el = document.getElementById("promoBanner");
    if (!el) return;
    const pr = parabrisas();
    if (!pr) { el.hidden = true; el.innerHTML = ""; return; }
    const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    el.innerHTML = `
      <span class="promo-banner-tag">${esc(etiqueta(pr))}</span>
      <div class="promo-banner-body">
        <strong class="promo-banner-title">${esc(pr.titulo || "")}</strong>
        <span class="promo-banner-cond">Solo parabrisas con instalación (sucursal o domicilio); sin instalación el precio no cambia. No aplica al recargo de domicilio por comuna. Sujeto a cupos de instalación. Hasta el ${esc(hastaLargo(pr))}.</span>
      </div>`;
    el.hidden = false;
  }

  async function load() {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 8000) : null;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/web_promociones_vigentes`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        cache: "no-store",
        signal: ctrl?.signal,
      });
      if (t) clearTimeout(t);
      if (!res.ok) return;
      const data = await res.json();
      promos = Array.isArray(data) ? data : [];
    } catch (e) {
      console.warn("Ofertas: no se pudo consultar, se siguen los precios normales.", e);
      promos = [];
    }
    programarFin();
    avisar();
  }

  window.AVRPromo = {
    load, parabrisas, esParabrisas, precioOferta, etiqueta, hastaCorto, hastaLargo,
    onChange(fn) { listeners.push(fn); },
    _setPromos(arr) { promos = Array.isArray(arr) ? arr : []; programarFin(); avisar(); }, // para pruebas
  };

  // Una sola vez al inicio, sin bloquear la carga del catálogo.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
