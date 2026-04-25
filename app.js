const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1h7VNeNZHI4zvJR9WTBXXM0BhsKu22u-GJNpT1TIh9YU/export?format=csv&gid=1487741598";

const FIELD_MAP = {
  nombre: "Nombre",
  medida: "Medida",
  costo: "Costo",
  sinInstalacion: "Sin Instalación",
  conInstalacion: "Con instalación",
};

const searchInput = document.querySelector("#searchInput");
const reloadButton = document.querySelector("#reloadButton");
const themeToggle = document.querySelector("#themeToggle");
const themeToggleText = document.querySelector(".theme-toggle-text");
const statusNode = document.querySelector("#status");
const counterNode = document.querySelector("#counter");
const resultsBody = document.querySelector("#resultsBody");

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
  const nextTheme = savedTheme || (systemPrefersDark ? "dark" : "light");
  setTheme(nextTheme);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

function parseCsvRow(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  return text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map(parseCsvRow);
}

function getCell(row, headerMap, ...headerNames) {
  for (const headerName of headerNames) {
    const index = headerMap[normalizeText(headerName)];
    if (index !== undefined) {
      return row[index] ?? "";
    }
  }

  return "";
}

function buildHeaderMap(headerRow) {
  return headerRow.reduce((map, header, index) => {
    map[normalizeText(header)] = index;
    return map;
  }, {});
}

function buildProduct(row, headerMap) {
  const nombre = getCell(row, headerMap, "Nombre") || row[1] || "";
  const siglas = buildSiglas(nombre);
  const anioDesde = getCell(row, headerMap, "AnioDesde", "AñoDesde") || row[4] || "";
  const anioHasta = getCell(row, headerMap, "AnioHasta", "AñoHasta") || row[5] || "";
  const stockIndex = headerMap[normalizeText("Stock")];
  const stock =
    getCell(row, headerMap, "Stock", "Unidades", "Unidades Disponibles") ||
    (stockIndex !== undefined ? row[stockIndex] || "" : row[14] || "");

  return {
    nombre,
    siglas,
    anioDesde,
    anioHasta,
    anios: buildYearLabel(anioDesde, anioHasta),
    aniosBusqueda: buildYearSearchTerms(anioDesde, anioHasta),
    medida: getCell(row, headerMap, "Medida") || row[7] || "",
    costo: getCell(row, headerMap, "Costo") || row[9] || "",
    sinInstalacion:
      getCell(row, headerMap, "$ Sin Instalación", "Sin Instalación") || row[10] || "",
    conInstalacion:
      getCell(row, headerMap, "$ Con instalación", "Con instalación") || row[11] || "",
    stock,
  };
}

function buildSearchIndex(product) {
  return normalizeText(
    [
      product.nombre,
      product.siglas,
      product.anios,
      product.aniosBusqueda,
      product.medida,
      product.costo,
      product.sinInstalacion,
      product.conInstalacion,
      product.stock,
    ].join(" ")
  );
}

function buildSearchTokens(searchIndex) {
  return new Set(
    searchIndex
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );
}

function productMatchesToken(product, token) {
  const normalizedToken = normalizeText(token);

  if (!normalizedToken) {
    return false;
  }

  const isShortToken = normalizedToken.length <= 2;
  const isNumericToken = /^\d+$/.test(normalizedToken);

  if (isShortToken || isNumericToken) {
    return product.searchTokens.has(normalizedToken);
  }

  return product.searchIndex.includes(normalizedToken);
}

function parseYear(value) {
  const year = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isInteger(year) ? year : null;
}

function buildYearLabel(anioDesde, anioHasta) {
  if (!anioDesde && !anioHasta) {
    return "";
  }

  return `${anioDesde || "-"} - ${anioHasta || "-"}`;
}

function buildYearSearchTerms(anioDesde, anioHasta) {
  const fromYear = parseYear(anioDesde);
  const currentYear = new Date().getFullYear();
  let toYear = parseYear(anioHasta);

  if (!fromYear) {
    return "";
  }

  if (!toYear) {
    const normalizedEnd = normalizeText(anioHasta);
    if (normalizedEnd === "actual") {
      toYear = currentYear;
    }
  }

  if (!toYear || toYear < fromYear) {
    toYear = fromYear;
  }

  const years = [];
  for (let year = fromYear; year <= toYear; year += 1) {
    years.push(String(year));
  }

  return years.join(" ");
}

function buildSiglas(nombre) {
  const normalized = normalizeText(nombre);
  const siglas = [];

  if (normalized.includes("parabrisas")) {
    siglas.push("PBS");
  }

  if (normalized.includes("luneta")) {
    siglas.push("LUN");
  }

  if (normalized.includes("puerta")) {
    const puertaSigla = buildPositionSigla(normalized, "P");
    if (puertaSigla) {
      siglas.push(puertaSigla);
    }
  }

  if (normalized.includes("aleta")) {
    const aletaSigla = buildPositionSigla(normalized, "A");
    if (aletaSigla) {
      siglas.push(aletaSigla);
    }
  }

  if (normalized.includes("lateral")) {
    const lateralSigla = buildPositionSigla(normalized, "L");
    if (lateralSigla) {
      siglas.push(lateralSigla);
    }
  }

  return [...new Set(siglas)].join(" / ");
}

function buildPositionSigla(text, prefix) {
  const vertical = text.includes("delantera")
    ? "D"
    : text.includes("trasera")
      ? "T"
      : "";
  const side = text.includes("derecha")
    ? "D"
    : text.includes("izquierda")
      ? "I"
      : "";

  return vertical && side ? `${prefix}${vertical}${side}` : "";
}

function setStatus(message) {
  statusNode.textContent = message;
}

function setCounter(message) {
  counterNode.textContent = message;
}

function highlightMatches(value, tokens) {
  const safeValue = escapeHtml(value);

  if (!tokens.length) {
    return safeValue;
  }

  let highlighted = safeValue;
  tokens
    .filter((token) => token.length > 1)
    .sort((a, b) => b.length - a.length)
    .forEach((token) => {
      const pattern = new RegExp(`(${escapeRegExp(token)})`, "gi");
      highlighted = highlighted.replace(pattern, "<mark>$1</mark>");
    });

  return highlighted;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderRows(items, tokens) {
  if (!items.length) {
    resultsBody.innerHTML =
      '<tr><td colspan="8" class="empty-cell">No encontré resultados con esos criterios.</td></tr>';
    return;
  }

  resultsBody.innerHTML = items
    .map(
      (item) => `
        <tr>
          <td class="name-cell">${highlightMatches(item.nombre, tokens)}</td>
          <td class="siglas-cell">${renderSiglas(item.siglas, tokens)}</td>
          <td class="years-cell">${highlightMatches(item.anios, tokens)}</td>
          <td>${highlightMatches(item.medida, tokens)}</td>
          <td>${highlightMatches(item.costo, tokens)}</td>
          <td>${highlightMatches(item.sinInstalacion, tokens)}</td>
          <td>${highlightMatches(item.conInstalacion, tokens)}</td>
          <td class="stock-cell">${highlightMatches(item.stock, tokens)}</td>
        </tr>
      `
    )
    .join("");
}

function renderSiglas(siglas, tokens) {
  if (!siglas) {
    return '<span class="sigla-badge">-</span>';
  }

  return siglas
    .split(" / ")
    .map(
      (sigla) =>
        `<span class="sigla-badge">${highlightMatches(sigla, tokens)}</span>`
    )
    .join(" ");
}

function filterProducts() {
  const rawQuery = searchInput.value;
  const tokens = normalizeText(rawQuery)
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) {
    resultsBody.innerHTML =
      '<tr><td colspan="8" class="empty-cell">Escribe una búsqueda para ver coincidencias.</td></tr>';
    setCounter("");
    setStatus("Ingresa marca, sigla, año, medida o stock para buscar.");
    return;
  }

  const filtered = products.filter((product) =>
    tokens.every((token) => productMatchesToken(product, token))
  );

  renderRows(filtered, tokens);
  setCounter(`${filtered.length} resultados`);
  setStatus(`Búsqueda activa en cualquier orden: ${tokens.join(" · ")}`);
}

async function loadProducts() {
  setStatus("Cargando datos desde Google Sheets...");
  setCounter("");
  resultsBody.innerHTML =
    '<tr><td colspan="8" class="empty-cell">Cargando productos...</td></tr>';

  try {
    const response = await fetch(CSV_URL, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const text = await response.text();
    const rows = parseCsv(text);
    const headerRow = rows[0] || [];
    const headerMap = buildHeaderMap(headerRow);

    products = rows
      .slice(1)
      .map((row) => buildProduct(row, headerMap))
      .filter((product) => product.nombre)
      .map((product) => ({
        ...product,
        searchIndex: buildSearchIndex(product),
        searchTokens: buildSearchTokens(buildSearchIndex(product)),
      }));

    setStatus("Datos listos.");
    filterProducts();
  } catch (error) {
    console.error(error);
    setStatus("No pude cargar la hoja. Revisa acceso público o conexión.");
    resultsBody.innerHTML =
      '<tr><td colspan="8" class="empty-cell">Error cargando la hoja. Intenta actualizar.</td></tr>';
  }
}

let debounceId;

searchInput.addEventListener("input", () => {
  window.clearTimeout(debounceId);
  debounceId = window.setTimeout(filterProducts, 120);
});

reloadButton.addEventListener("click", loadProducts);

themeToggle?.addEventListener("click", () => {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  setTheme(nextTheme);
});

initializeTheme();
loadProducts();
