// ── Modo Servicios del Buscador ───────────────────────────────────────────────
// Lee la vista pública servicios_publicos (sin costos) y agrega el servicio
// elegido a la MISMA cotización (window.addCotItem). Precio null = consultar.
(function () {
  const btn = document.getElementById("modoServicios");
  const sec = document.getElementById("svcSection");
  const q = document.getElementById("svcSearch");
  const st = document.getElementById("svcStatus");
  const out = document.getElementById("svcResults");
  if (!btn || !sec) return;
  const otros = [document.getElementById("modoVidrios"), document.getElementById("modoEspejos")];
  const esp = document.getElementById("espSection");
  const vidrioEls = [".search-panel > .search-box", ".search-panel > .hint", ".status-row", ".table-wrap"].map((s) => document.querySelector(s));
  let data = null, gama = "normal";
  const fmt = (n) => "$ " + Math.round(n).toLocaleString("es-CL");
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  async function cargar() {
    if (data) return;
    st.textContent = "Cargando servicios…";
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/servicios_publicos?select=*&order=orden`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` }, cache: "no-store" });
      data = await r.json();
      if (!Array.isArray(data)) throw 0;
    } catch (_e) { data = null; st.textContent = "Error cargando servicios. Reintenta."; }
  }

  function render() {
    if (!data) return;
    const t = norm(q.value.trim());
    const vis = data.filter((s) => (s.gama === "todas" || s.gama === gama) &&
      (!t || t.split(/\s+/).every((k) => norm(s.categoria + " " + s.servicio + " " + (s.unidad || "") + " " + (s.notas || "")).includes(k))));
    st.textContent = `${vis.length} servicio${vis.length === 1 ? "" : "s"}`;
    let html = "", ult = "";
    vis.forEach((s) => {
      if (s.categoria !== ult) { html += `<p class="panel-kicker" style="margin:10px 0 0">${esc(s.categoria)}</p>`; ult = s.categoria; }
      const p = s.precio_cliente;
      const pr = p == null ? "Consultar" : p === 0 ? "Sin costo" : fmt(p);
      html += `<div class="esp-card">
        <div class="esp-card-info"><strong>${esc(s.servicio)}</strong>
          <span class="esp-sub">${esc(s.unidad || "")}${s.gama !== "todas" ? " · " + (s.gama === "alta" ? "alta gama" : "auto normal") : ""}${s.notas ? " · " + esc(s.notas) : ""}</span></div>
        <div class="esp-card-actions"><strong>${pr}</strong>
          ${p != null ? `<button class="esp-add" data-id="${esc(s.id)}" type="button">Agregar</button>` : ""}</div></div>`;
    });
    out.innerHTML = html || `<p class="empty-cell" style="padding:16px">Sin resultados.</p>`;
  }

  out.addEventListener("click", (e) => {
    const b = e.target.closest(".esp-add"); if (!b) return;
    const s = data.find((x) => x.id === b.dataset.id); if (!s) return;
    if (typeof window.addCotItem !== "function") { alert("Abre primero el cotizador."); return; }
    const g = s.gama === "alta" ? " (alta gama)" : "";
    window.addCotItem({ nombre: `${s.servicio}${g}${s.unidad ? " · " + s.unidad : ""}`, precio: s.precio_cliente });
    b.textContent = "✓ Agregado"; b.disabled = true;
    setTimeout(() => { b.textContent = "Agregar"; b.disabled = false; }, 1400);
  });

  document.getElementById("svcGama").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    gama = b.dataset.g;
    document.querySelectorAll("#svcGama button").forEach((x) => x.classList.toggle("is-active", x === b));
    render();
  });
  q.addEventListener("input", render);

  btn.addEventListener("click", async () => {
    otros.forEach((o) => o && o.classList.remove("is-active"));
    btn.classList.add("is-active");
    if (esp) esp.hidden = true;
    vidrioEls.forEach((el) => { if (el) el.hidden = true; });
    sec.hidden = false;
    q.focus();
    await cargar(); render();
  });
  otros.forEach((o) => o && o.addEventListener("click", () => { sec.hidden = true; btn.classList.remove("is-active"); }));
})();
