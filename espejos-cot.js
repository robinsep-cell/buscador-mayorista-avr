// ── Modo Espejos del Buscador (fase 2) ────────────────────────────────────────
// Busca modelos de espejo (vista pública espejos_cotizador_publica), muestra sus
// opciones con precio (Original, Alternativo, punto ciego, retrovisor completo,
// piezas, servicios) y agrega la elegida a la MISMA cotización (window.addCotItem).
// No toca el buscador de vidrios.
(function () {
  // Etiquetas de las opciones de precio (espejo). Orden = orden de aparición.
  const DEF_PRECIOS = [
    ["alt_plano", "Alternativo plano"],
    ["alt_panoramico", "Alternativo panorámico"],
    ["alt_panoramico_pc", "Alt. panorámico c/ punto ciego"],
    ["original", "Original"],
    ["original_pc", "Original c/ punto ciego"],
    ["original_foto", "Original fotocromático"],
    ["original_foto_pc", "Original fotocromático + punto ciego"],
    ["intermitente", "Luz intermitente"],
    ["retro_manual", "Retrovisor completo · Manual"],
    ["retro_elec_sin_int", "Retrovisor · Eléctrico s/ intermitente"],
    ["retro_elec_int", "Retrovisor · Eléctrico c/ intermitente"],
    ["retro_int_abate", "Retrovisor · + abatible eléctrico"],
    ["retro_int_abate_pc", "Retrovisor · + sensor punto ciego"],
    ["retro_int_abate_pc_cam", "Retrovisor · + cámara"],
    ["carcasa_cromada", "Carcasa cromada"],
    ["tapa_cromada", "Tapa cromada"],
    ["bigote", "Bigote"],
    ["base", "Base / anclaje"],
    ["bisel", "Bisel"],
    ["motor", "Motor"],
    ["serv_rep_abate_manual", "Servicio · Reparación abate manual"],
    ["serv_rep_abate_electrico", "Servicio · Reparación abate eléctrico"],
  ];
  const ORDER  = DEF_PRECIOS.map(([k]) => k);
  const LABELS = Object.fromEntries(DEF_PRECIOS);

  const modoVidrios = document.getElementById("modoVidrios");
  const modoEspejos = document.getElementById("modoEspejos");
  const espSection  = document.getElementById("espSection");
  const espSearch   = document.getElementById("espSearch");
  const espStatus   = document.getElementById("espStatus");
  const espResults  = document.getElementById("espResults");
  if (!modoEspejos || !espSection) return;

  // Contenedores del modo Vidrios que se ocultan al pasar a Espejos.
  const vidrioEls = [
    document.querySelector(".search-panel .search-box"),
    document.querySelector(".search-panel .hint"),
    document.querySelector(".status-row"),
    document.querySelector(".table-wrap"),
  ];

  let _data = null;
  let _loading = false;

  function fmt(n) { return "$ " + Math.round(n || 0).toLocaleString("es-CL"); }
  function esc(v) {
    return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function norm(s) {
    return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  }

  async function cargar() {
    if (_data || _loading) return;
    _loading = true;
    espStatus.textContent = "Cargando espejos…";
    const page = 1000;
    let offset = 0;
    const rows = [];
    try {
      while (true) {
        const r = await fetch(
          `${SUPABASE_URL}/rest/v1/espejos_cotizador_publica?select=*&limit=${page}&offset=${offset}`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }, cache: "no-store" }
        );
        const chunk = await r.json();
        if (!Array.isArray(chunk) || !chunk.length) break;
        rows.push(...chunk);
        if (chunk.length < page) break;
        offset += page;
      }
      _data = rows.map((x) => ({
        ...x,
        _s: norm([x.marca, x.modelo, x.periodo, x.lado].join(" ")),
      }));
      espStatus.textContent = `${_data.length} espejos. Escribe marca, modelo o año.`;
    } catch (_e) {
      espStatus.textContent = "Error cargando espejos. Reintenta.";
    } finally {
      _loading = false;
    }
  }

  function opciones(precios) {
    return ORDER
      .filter((k) => precios && Number(precios[k]) > 0)
      .map((k) => ({ key: k, label: LABELS[k] || k, precio: Number(precios[k]) }));
  }

  function matchToken(p, tok) {
    if (/^\d{4}$/.test(tok)) {
      const y = +tok;
      if (p.anio_desde && p.anio_hasta) return y >= p.anio_desde && y <= p.anio_hasta;
    }
    return p._s.includes(tok);
  }

  function render(items) {
    if (!items.length) {
      espResults.innerHTML = `<p class="empty-cell" style="padding:16px;color:var(--muted,#777)">Sin resultados.</p>`;
      return;
    }
    espResults.innerHTML = items.slice(0, 60).map((p, i) => {
      const ops = opciones(p.precios);
      const optionsHtml = ops.map((o) => `<option value="${o.key}">${esc(o.label)} — ${fmt(o.precio)}</option>`).join("");
      const anios = (p.anio_desde && p.anio_hasta) ? `${p.anio_desde}–${p.anio_hasta}` : esc(p.periodo || "");
      return `
        <div class="esp-card">
          <div class="esp-card-info">
            <strong>${esc(p.marca)} ${esc(p.modelo)}</strong>
            <span class="esp-sub">${esc(p.lado || "")}${anios ? " · " + anios : ""}</span>
          </div>
          <div class="esp-card-actions">
            <select class="esp-op" data-i="${i}">${optionsHtml}</select>
            <button class="esp-add" data-i="${i}">Agregar</button>
          </div>
        </div>`;
    }).join("");

    espResults.querySelectorAll(".esp-add").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i   = Number(btn.dataset.i);
        const p   = items[i];
        const sel = espResults.querySelector(`.esp-op[data-i="${i}"]`);
        const key = sel ? sel.value : null;
        if (!key || !p?.precios?.[key]) return;
        const label = LABELS[key] || key;
        const nombre = `Espejo ${p.marca} ${p.modelo}${p.lado ? " " + p.lado : ""} · ${label}`;
        if (typeof window.addCotItem !== "function") { alert("Abre primero el cotizador."); return; }
        window.addCotItem({
          nombre,
          precio: Number(p.precios[key]),
          marca: p.marca || "",
          anioDesde: p.anio_desde || "",
          anioHasta: p.anio_hasta || "",
        });
        btn.textContent = "✓ Agregado";
        btn.disabled = true;
        setTimeout(() => { btn.textContent = "Agregar"; btn.disabled = false; }, 1400);
      });
    });
  }

  let _t = null;
  function buscar() {
    clearTimeout(_t);
    _t = setTimeout(() => {
      if (!_data) return;
      const q = norm(espSearch.value.trim());
      if (!q) {
        espResults.innerHTML = "";
        espStatus.textContent = `${_data.length} espejos. Escribe marca, modelo o año.`;
        return;
      }
      const toks = q.split(/\s+/);
      const res = _data.filter((p) => toks.every((t) => matchToken(p, t)));
      espStatus.textContent = `${res.length} coincidencia${res.length === 1 ? "" : "s"}${res.length > 60 ? " (muestro 60)" : ""}`;
      render(res);
    }, 180);
  }

  function setModo(esp) {
    modoEspejos.classList.toggle("is-active", esp);
    modoVidrios.classList.toggle("is-active", !esp);
    espSection.hidden = !esp;
    vidrioEls.forEach((el) => { if (el) el.hidden = esp; });
    if (esp) {
      cargar().then(() => { if (espSearch.value.trim()) buscar(); });
      espSearch.focus();
    }
  }

  modoVidrios?.addEventListener("click", () => setModo(false));
  modoEspejos?.addEventListener("click", () => setModo(true));
  espSearch?.addEventListener("input", buscar);
})();
