const CURVE = {
  x2: -0.0004210337737,
  y2: -0.0003892676237,
  xy: 0.000001197271825,
  x: 0.1682614324,
  y: 0.07788281922,
  c: -18.28677909,
};

const SUPABASE_URL = "https://vlhoshlnkmsojeqejzwo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsaG9zaGxua21zb2plcWVqendvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjk5NzksImV4cCI6MjA5MTUwNTk3OX0.pyQDaG4dpwi_I_7bN6D433xkIE5TBGGFICQ8LP0_etg";
const sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON);

const state = {
  fileName: "",
  contour: null,
  designs: [],
  ncUrl: null,
};

const authScreen = document.querySelector("#authScreen");
const appContent = document.querySelector("#appContent");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authSendBtn = document.querySelector("#authSendBtn");
const authError = document.querySelector("#authError");
const logoutBtn = document.querySelector("#logoutBtn");
const svgInput = document.querySelector("#svgInput");
const fileLabel = document.querySelector("#fileLabel");
const statusPill = document.querySelector("#statusPill");
const jobName = document.querySelector("#jobName");
const copies = document.querySelector("#copies");
const singlePlacement = document.querySelector("#singlePlacement");
const pieceControls = document.querySelector("#pieceControls");
const sheetWidth = document.querySelector("#sheetWidth");
const sheetHeight = document.querySelector("#sheetHeight");
const feed = document.querySelector("#feed");
const tolerance = document.querySelector("#tolerance");
const generateBtn = document.querySelector("#generateBtn");
const downloadLink = document.querySelector("#downloadLink");
const filenameBox = document.querySelector("#filenameBox");
const copyBtn = document.querySelector("#copyBtn");
const previewSvg = document.querySelector("#previewSvg");
const previewPaths = document.querySelector("#previewPaths");
const metrics = document.querySelector("#metrics");
const ncOutput = document.querySelector("#ncOutput");

function showAuth() {
  authScreen.hidden = false;
  appContent.hidden = true;
  authError.textContent = "";
}

async function showApp(session) {
  const email = session.user.email.toLowerCase();
  const { data, error } = await sb.from("authorized_emails").select("email").eq("email", email).maybeSingle();
  if (error) {
    showAuth();
    authError.textContent = "No se pudo verificar autorizacion. Recarga e intenta de nuevo.";
    return;
  }
  if (!data) {
    await sb.auth.signOut();
    showAuth();
    authError.textContent = "Correo no autorizado.";
    return;
  }
  authScreen.hidden = true;
  appContent.hidden = false;
}

async function initAuth() {
  if (!sb) {
    authError.textContent = "No se pudo cargar Supabase.";
    return;
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) await showApp(session);
  else showAuth();

  sb.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showAuth();
  });
}

authSendBtn.addEventListener("click", async () => {
  const email = authEmail.value.trim().toLowerCase();
  const password = authPassword.value;
  authError.textContent = "";
  if (!email.includes("@")) {
    authError.textContent = "Ingresa un correo valido.";
    return;
  }
  if (password.length < 6) {
    authError.textContent = "La clave debe tener al menos 6 caracteres.";
    return;
  }

  authSendBtn.disabled = true;
  authSendBtn.textContent = "Verificando...";

  const { data } = await sb.from("authorized_emails").select("email").eq("email", email).maybeSingle();
  if (!data) {
    authError.textContent = "Correo no autorizado.";
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Entrar";
    return;
  }

  const { data: signInData, error: signInErr } = await sb.auth.signInWithPassword({ email, password });
  if (!signInErr) {
    if (signInData?.session) await showApp(signInData.session);
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Entrar";
    return;
  }

  if (signInErr.message === "Invalid login credentials") {
    const { error: signUpErr } = await sb.auth.signUp({ email, password });
    if (!signUpErr) {
      const { data: sessionData } = await sb.auth.getSession();
      if (sessionData?.session) await showApp(sessionData.session);
      authSendBtn.disabled = false;
      authSendBtn.textContent = "Entrar";
      return;
    }
    authError.textContent = signUpErr.message.toLowerCase().includes("already registered")
      ? "Clave incorrecta."
      : "No se pudo crear la cuenta.";
  } else {
    authError.textContent = "No se pudo iniciar sesion.";
  }

  authSendBtn.disabled = false;
  authSendBtn.textContent = "Entrar";
});

authPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") authSendBtn.click();
});

logoutBtn.addEventListener("click", () => sb.auth.signOut());

function zCurve(x, y) {
  return CURVE.x2 * x * x + CURVE.y2 * y * y + CURVE.xy * x * y + CURVE.x * x + CURVE.y * y + CURVE.c;
}

function tokenizePath(d) {
  return d.match(/[MmLlHhVvCcZz]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/g) || [];
}

function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y,
  };
}

function parseSvgPath(d, cubicSteps = 8) {
  const tokens = tokenizePath(d);
  let i = 0;
  let cmd = null;
  let current = { x: 0, y: 0 };
  let start = { x: 0, y: 0 };
  let points = [];
  const subpaths = [];
  const isCmd = (value) => /^[MmLlHhVvCcZz]$/.test(value);
  const num = () => Number(tokens[i++]);

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++];
    if (!cmd) throw new Error("Path SVG sin comando inicial");

    const relative = cmd === cmd.toLowerCase();
    const upper = cmd.toUpperCase();

    if (upper === "M") {
      if (points.length >= 4) subpaths.push(points);
      points = [];
      let x = num();
      let y = num();
      if (relative) {
        x += current.x;
        y += current.y;
      }
      current = { x, y };
      start = { x, y };
      points.push(current);
      cmd = relative ? "l" : "L";
    } else if (upper === "L") {
      let x = num();
      let y = num();
      if (relative) {
        x += current.x;
        y += current.y;
      }
      current = { x, y };
      points.push(current);
    } else if (upper === "H") {
      const x = num() + (relative ? current.x : 0);
      current = { x, y: current.y };
      points.push(current);
    } else if (upper === "V") {
      const y = num() + (relative ? current.y : 0);
      current = { x: current.x, y };
      points.push(current);
    } else if (upper === "C") {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x3 = num();
      const y3 = num();
      const p1 = relative ? { x: current.x + x1, y: current.y + y1 } : { x: x1, y: y1 };
      const p2 = relative ? { x: current.x + x2, y: current.y + y2 } : { x: x2, y: y2 };
      const p3 = relative ? { x: current.x + x3, y: current.y + y3 } : { x: x3, y: y3 };
      for (let step = 1; step <= cubicSteps; step += 1) {
        points.push(cubicPoint(current, p1, p2, p3, step / cubicSteps));
      }
      current = p3;
    } else if (upper === "Z") {
      if (points.length && (points.at(-1).x !== start.x || points.at(-1).y !== start.y)) points.push(start);
      if (points.length >= 4) subpaths.push(points);
      points = [];
      cmd = null;
    } else {
      throw new Error(`Comando SVG no soportado: ${cmd}`);
    }
  }

  if (points.length >= 4) subpaths.push(points);
  return subpaths;
}

function bbox(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function pathArea(points) {
  let area = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    area += points[i].x * points[i + 1].y - points[i + 1].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

function distanceToSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function simplifyOpen(points, tol) {
  if (points.length <= 2) return points;
  const a = points[0];
  const b = points.at(-1);
  let maxDistance = -1;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = distanceToSegment(points[i], a, b);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = i;
    }
  }
  if (maxDistance > tol) {
    const left = simplifyOpen(points.slice(0, index + 1), tol);
    const right = simplifyOpen(points.slice(index), tol);
    return left.slice(0, -1).concat(right);
  }
  return [a, b];
}

function simplifyClosed(points, tol) {
  if (tol <= 0 || points.length <= 4) return points;
  const closed = points[0].x === points.at(-1).x && points[0].y === points.at(-1).y;
  const body = closed ? points.slice(0, -1) : points.slice();
  let split = 0;
  for (let i = 1; i < body.length; i += 1) {
    if (body[i].x > body[split].x || (body[i].x === body[split].x && body[i].y > body[split].y)) split = i;
  }
  const rotated = body.slice(split).concat(body.slice(0, split + 1));
  const simplified = simplifyOpen(rotated, tol);
  if (simplified[0].x !== simplified.at(-1).x || simplified[0].y !== simplified.at(-1).y) {
    simplified.push(simplified[0]);
  }
  return simplified;
}

function loadLargestContour(svgText) {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const error = doc.querySelector("parsererror");
  if (error) throw new Error("El SVG no se pudo leer");
  const paths = [...doc.querySelectorAll("path[d]")];
  const contours = [];
  paths.forEach((path) => parseSvgPath(path.getAttribute("d")).forEach((subpath) => contours.push(subpath)));
  if (!contours.length) throw new Error("No encontre un contorno util en el SVG");
  return contours.sort((a, b) => pathArea(b) - pathArea(a))[0];
}

function transformToSheet(points, left, bottom, mirror) {
  const box = bbox(points);
  return points.map((p) => ({
    x: (mirror ? box.maxX - p.x : p.x - box.minX) + left,
    y: p.y - box.minY + bottom,
  }));
}

function normalizePoints(points) {
  const box = bbox(points);
  return points.map((p) => ({ x: p.x - box.minX, y: p.y - box.minY }));
}

function rotatePoints90(points) {
  const box = bbox(points);
  const rotated = points.map((p) => ({ x: p.y - box.minY, y: box.maxX - p.x }));
  return normalizePoints(rotated);
}

function makeLayout(items, sheetW, sheetH, placement) {
  const prepared = items.map((item) => ({ ...item, points: normalizePoints(item.points), box: bbox(item.points) }));
  prepared.forEach((item) => {
    if (item.box.height > sheetH) {
      throw new Error(`${item.name} mide ${item.box.height.toFixed(2)} mm de alto y supera la plancha`);
    }
  });

  const totalWidth = prepared.reduce((sum, item) => sum + item.box.width, 0);
  if (totalWidth > sheetW) throw new Error(`Las piezas miden ${totalWidth.toFixed(2)} mm de ancho y no caben`);

  if (prepared.length === 1) {
    const item = prepared[0];
    const shouldCenter = placement === "center" || (placement === "auto" && item.box.width > sheetW * 0.72);
    const left = shouldCenter ? (sheetW - item.box.width) / 2 : Math.max(3, sheetW * 0.025);
    const bottom = (sheetH - item.box.height) / 2;
    return [{ name: item.name, mirrored: item.mirrored, rotated: item.rotated, points: transformToSheet(item.points, left, bottom, item.mirrored) }];
  }

  const gap = (sheetW - totalWidth) / (prepared.length + 1);
  let cursor = gap;
  return prepared.map((item) => {
    const bottom = (sheetH - item.box.height) / 2;
    const placed = { name: item.name, mirrored: item.mirrored, rotated: item.rotated, points: transformToSheet(item.points, cursor, bottom, item.mirrored) };
    cursor += item.box.width + gap;
    return placed;
  });
}

function fmt(value) {
  return Number(value).toFixed(3);
}

function makeNc(title, paths, feedValue) {
  const lines = [
    `O0000(${title})`,
    "(GENERADO POR GENERADOR CNC ESPEJOS - PRUEBA)",
    "(VALIDAR EN SIMULACION ANTES DE CORTAR VIDRIO)",
    "( T1 | DIAMANTE | H1 )",
    "N100 G21",
    "N102 G0 G17 G40 G49 G80 G90",
    "N104 T1 M6",
  ];
  let n = 106;
  const first = paths[0].points[0];
  lines.push(`N${n} G0 G90 G54 X${fmt(first.x)} Y${fmt(first.y)} A0. S3500 M3`);
  n += 2;
  lines.push(`N${n} G43 H1 Z15.`);
  n += 2;

  paths.forEach((item) => {
    const path = item.points;
    const start = path[0];
    lines.push(`N${n} G0 X${fmt(start.x)} Y${fmt(start.y)}`);
    n += 2;
    lines.push(`N${n} Z5.`);
    n += 2;
    lines.push(`N${n} G1 Z${fmt(zCurve(start.x, start.y))} F${Math.round(feedValue)}.`);
    n += 2;
    path.slice(1).forEach((p) => {
      lines.push(`N${n} X${fmt(p.x)} Y${fmt(p.y)} Z${fmt(zCurve(p.x, p.y))}`);
      n += 2;
    });
    lines.push(`N${n} G0 Z15.`);
    n += 2;
  });

  lines.push(`N${n} M5`);
  lines.push(`N${n + 2} G91 G28 Z0.`);
  lines.push(`N${n + 4} G28 X0. Y0. A0.`);
  lines.push(`N${n + 6} M30`);
  lines.push("%");
  return `${lines.join("\r\n")}\r\n`;
}

function pathToD(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${fmt(p.x)} ${fmt(p.y)}`).join(" ") + " Z";
}

function renderPreview(paths, sheetW, sheetH) {
  previewSvg.setAttribute("viewBox", `0 0 ${sheetW} ${sheetH}`);
  const sheet = previewSvg.querySelector(".sheet");
  sheet.setAttribute("width", sheetW);
  sheet.setAttribute("height", sheetH);
  previewPaths.innerHTML = paths.map((item) => `<path class="cut-path" d="${pathToD(item.points)}"></path>`).join("");
}

function setStatus(text, ready = false) {
  statusPill.textContent = text;
  statusPill.classList.toggle("ready", ready);
}

function clearDownload() {
  if (state.ncUrl) URL.revokeObjectURL(state.ncUrl);
  state.ncUrl = null;
  downloadLink.removeAttribute("href");
  downloadLink.classList.add("disabled");
  copyBtn.disabled = true;
  filenameBox.textContent = "Archivo: -";
  ncOutput.value = "";
}

function currentPieceCount() {
  if (!state.designs.length) return 0;
  return state.designs.length > 1 ? state.designs.length : Number(copies.value);
}

function buildPieceControls() {
  const count = currentPieceCount();
  if (!count) {
    pieceControls.hidden = true;
    pieceControls.innerHTML = '<div class="piece-controls-title">Ajustes por pieza</div>';
    state.pieceSettings = [];
    return;
  }

  state.pieceSettings = Array.from({ length: count }, (_, index) => ({
    mirrored: state.pieceSettings?.[index]?.mirrored === true,
    rotated: state.pieceSettings?.[index]?.rotated === true,
  }));

  pieceControls.hidden = false;
  pieceControls.innerHTML = `
    <div class="piece-controls-title">Ajustes por pieza</div>
    ${state.pieceSettings.map((setting, index) => `
      <div class="piece-card">
        <div class="piece-card-title">Pieza ${index + 1}</div>
        <div class="piece-card-actions">
          <label class="check-field">
            <input class="piece-mirror" data-index="${index}" type="checkbox" ${setting.mirrored ? "checked" : ""} />
            <span>Invertir</span>
          </label>
          <label class="check-field">
            <input class="piece-rotate" data-index="${index}" type="checkbox" ${setting.rotated ? "checked" : ""} />
            <span>Girar 90°</span>
          </label>
        </div>
      </div>
    `).join("")}
  `;

  pieceControls.querySelectorAll(".piece-mirror").forEach((input) => {
    input.addEventListener("change", () => {
      state.pieceSettings[Number(input.dataset.index)].mirrored = input.checked;
      regenerate();
    });
  });
  pieceControls.querySelectorAll(".piece-rotate").forEach((input) => {
    input.addEventListener("change", () => {
      state.pieceSettings[Number(input.dataset.index)].rotated = input.checked;
      regenerate();
    });
  });
}

function regenerate() {
  clearDownload();
  if (!state.designs.length) return;
  try {
    const tol = Number(tolerance.value);
    const sheetW = Number(sheetWidth.value);
    const sheetH = Number(sheetHeight.value);
    const copyCount = state.designs.length > 1 ? 1 : Number(copies.value);
    const items = state.designs.flatMap((design) => {
      const contour = simplifyClosed(design.contour, tol);
      return Array.from({ length: copyCount }, (_, index) => ({
        name: copyCount > 1 ? `${design.name} ${index + 1}` : design.name,
        points: contour,
        original: design.contour,
      }));
    }).map((item, index) => ({
      ...item,
      mirrored: state.pieceSettings?.[index]?.mirrored === true,
      rotated: state.pieceSettings?.[index]?.rotated === true,
    }));
    const transformedItems = items.map((item) => ({
      ...item,
      points: item.rotated ? rotatePoints90(item.points) : item.points,
    }));
    const mirrorLabel = items.some((item) => item.mirrored) ? "MIXTO" : "NORMAL";
    const paths = makeLayout(transformedItems, sheetW, sheetH, singlePlacement.value);
    const nc = makeNc(`${jobName.value.trim()} ${paths.length} ${mirrorLabel}`.trim(), paths, Number(feed.value));
    renderPreview(paths, sheetW, sheetH);

    const all = paths.flatMap((item) => item.points);
    const zValues = all.map((p) => zCurve(p.x, p.y));
    const originalBoxes = state.designs.map((design) => bbox(design.contour));
    const contourLabel = originalBoxes.map((box) => `${box.width.toFixed(2)} x ${box.height.toFixed(2)}`).join(" / ");
    const simplifiedPoints = items.map((item) => item.points.length).join(" / ");
    metrics.innerHTML = [
      `<span>Contorno: ${contourLabel} mm</span>`,
      `<span>Piezas: ${paths.length}</span>`,
      `<span>Invertidas: ${paths.filter((item) => item.mirrored).length}</span>`,
      `<span>Puntos: ${simplifiedPoints}</span>`,
      `<span>Giradas: ${paths.filter((item) => item.rotated).length}</span>`,
      `<span>Z: ${Math.min(...zValues).toFixed(3)} a ${Math.max(...zValues).toFixed(3)}</span>`,
    ].join("");

    ncOutput.value = nc;
    const blob = new Blob([nc], { type: "text/plain;charset=ascii" });
    state.ncUrl = URL.createObjectURL(blob);
    const safeName = `${jobName.value.trim() || "MODELO"}_${paths.length}_${mirrorLabel}_PRUEBA.NC`.replace(/[^\w.-]+/g, "_");
    downloadLink.href = state.ncUrl;
    downloadLink.download = safeName;
    downloadLink.textContent = `Descargar ${safeName}`;
    filenameBox.textContent = `Archivo: ${safeName}`;
    downloadLink.classList.remove("disabled");
    copyBtn.disabled = false;
    setStatus("Listo", true);
  } catch (error) {
    setStatus("Error", false);
    metrics.innerHTML = `<span>${error.message}</span>`;
    previewPaths.innerHTML = "";
  }
}

svgInput.addEventListener("change", async () => {
  const files = [...(svgInput.files || [])];
  clearDownload();
  if (!files.length) return;
  try {
    const designs = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".svg")) {
        throw new Error(`${file.name}: por ahora solo puedo leer SVG`);
      }
      const text = await file.text();
      designs.push({
        name: file.name.replace(/\.svg$/i, ""),
        contour: loadLargestContour(text),
      });
    }
    state.fileName = files.map((file) => file.name).join(", ");
    state.contour = designs[0].contour;
    state.designs = designs;
    fileLabel.textContent = files.length === 1 ? files[0].name : `${files.length} SVG cargados`;
    copies.disabled = files.length > 1;
    if (jobName.value === "MODELO PRUEBA") jobName.value = designs.map((design) => design.name).join("_").toUpperCase();
    generateBtn.disabled = false;
    setStatus("SVG cargado", true);
    buildPieceControls();
    regenerate();
  } catch (error) {
    state.contour = null;
    state.designs = [];
    state.pieceSettings = [];
    buildPieceControls();
    generateBtn.disabled = true;
    copies.disabled = false;
    setStatus("Error SVG", false);
    metrics.innerHTML = `<span>${error.message}</span>`;
  }
});

generateBtn.addEventListener("click", regenerate);
copyBtn.addEventListener("click", async () => {
  if (!ncOutput.value) return;
  await navigator.clipboard.writeText(ncOutput.value);
  const original = copyBtn.textContent;
  copyBtn.textContent = "Codigo copiado";
  setTimeout(() => {
    copyBtn.textContent = original;
  }, 1400);
});
[jobName, singlePlacement, sheetWidth, sheetHeight, feed, tolerance].forEach((control) => {
  control.addEventListener("input", () => state.designs.length && regenerate());
});

copies.addEventListener("input", () => {
  if (!state.designs.length) return;
  buildPieceControls();
  regenerate();
});

initAuth();
