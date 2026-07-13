// trace.js — Convierte una imagen (foto/escaneo de una plantilla recortada)
// en un contorno de puntos apto para el generador CNC.
//
// Todo corre en el navegador (o en Node para las pruebas del nucleo).
// Se expone en window.ContourTracer para app.js (script clasico).
//
// Flujo: imagen -> ImageData -> binarizar (umbral) -> componente conexa mas
// grande -> trazar borde (Moore-neighbor) -> simplificar (Douglas-Peucker).
// El contorno se entrega en pixeles; la escala real en mm la fija el usuario
// por pieza, igual que con un SVG.

(function () {
  const MAX_DIM = 1000; // lado mayor (px) al que se reduce la imagen para procesar

  function luminance(r, g, b) {
    return 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Umbral automatico de Otsu sobre un histograma de luminancia 0..255.
  function otsuThreshold(hist, total) {
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let maxVar = -1;
    let threshold = 127;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > maxVar) {
        maxVar = between;
        threshold = t;
      }
    }
    return threshold;
  }

  // ImageData -> { grid: Uint8Array(W*H), W, H, threshold }.
  // grid[p] = 1 es "figura" (la plantilla). Por defecto la plantilla es la
  // zona OSCURA; invert=true cuando el fondo es mas oscuro que la plantilla.
  // El borde se fuerza a fondo para garantizar un contorno cerrado.
  function binarize(imageData, threshold, invert) {
    const W = imageData.width;
    const H = imageData.height;
    const data = imageData.data;
    const lum = new Float32Array(W * H);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; p < W * H; i += 4, p += 1) {
      const l = luminance(data[i], data[i + 1], data[i + 2]);
      lum[p] = l;
      hist[Math.min(255, Math.max(0, Math.round(l)))] += 1;
    }
    const th = threshold == null ? otsuThreshold(hist, W * H) : threshold;
    const grid = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p += 1) {
      const isFg = invert ? lum[p] > th : lum[p] <= th;
      grid[p] = isFg ? 1 : 0;
    }
    for (let x = 0; x < W; x += 1) {
      grid[x] = 0;
      grid[(H - 1) * W + x] = 0;
    }
    for (let y = 0; y < H; y += 1) {
      grid[y * W] = 0;
      grid[y * W + (W - 1)] = 0;
    }
    return { grid, W, H, threshold: th };
  }

  // Componente conexa (8-conectividad) mas grande -> mascara binaria.
  // Descarta manchas sueltas de fondo y se queda solo con la plantilla.
  function largestComponent(grid, W, H) {
    const label = new Int32Array(W * H);
    const stack = [];
    let bestSize = 0;
    let bestId = 0;
    let id = 0;
    for (let start = 0; start < W * H; start += 1) {
      if (grid[start] !== 1 || label[start] !== 0) continue;
      id += 1;
      let size = 0;
      stack.push(start);
      label[start] = id;
      while (stack.length) {
        const p = stack.pop();
        size += 1;
        const x = p % W;
        const y = (p - x) / W;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const np = ny * W + nx;
            if (grid[np] === 1 && label[np] === 0) {
              label[np] = id;
              stack.push(np);
            }
          }
        }
      }
      if (size > bestSize) {
        bestSize = size;
        bestId = id;
      }
    }
    const mask = new Uint8Array(W * H);
    if (bestId) {
      for (let p = 0; p < W * H; p += 1) mask[p] = label[p] === bestId ? 1 : 0;
    }
    return { mask, size: bestSize };
  }

  // Vecinos en sentido horario, empezando arriba-izquierda.
  const N8 = [
    [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
  ];
  function idxOfDelta(dx, dy) {
    for (let i = 0; i < 8; i += 1) if (N8[i][0] === dx && N8[i][1] === dy) return i;
    return -1;
  }

  // Trazado de borde Moore-neighbor sobre la mascara del componente.
  // Devuelve el contorno exterior como lista ordenada de {x, y} en pixeles.
  function traceBoundary(mask, W, H) {
    const isFg = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;

    let startP = -1;
    for (let p = 0; p < W * H; p += 1) {
      if (mask[p] === 1) {
        startP = p;
        break;
      }
    }
    if (startP < 0) return [];

    const sx = startP % W;
    const sy = (startP - sx) / W;

    // El pixel a la izquierda es fondo (por el orden de barrido): backtrack inicial.
    let bx = sx - 1;
    let by = sy;
    let px = sx;
    let py = sy;
    const contour = [];
    const maxIter = W * H * 8;
    let iter = 0;

    do {
      contour.push({ x: px, y: py });
      const bIdx = idxOfDelta(bx - px, by - py);
      let found = false;
      for (let k = 1; k <= 8; k += 1) {
        const dir = (bIdx + k) % 8;
        const nx = px + N8[dir][0];
        const ny = py + N8[dir][1];
        if (isFg(nx, ny)) {
          const prev = (dir + 7) % 8; // vecino de fondo justo antes de c
          bx = px + N8[prev][0];
          by = py + N8[prev][1];
          px = nx;
          py = ny;
          found = true;
          break;
        }
      }
      if (!found) break; // pixel aislado
      iter += 1;
    } while ((px !== sx || py !== sy) && iter < maxIter);

    return contour;
  }

  // Distancia perpendicular de p a la recta infinita a-b.
  function lineDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
  }

  // Douglas-Peucker iterativo (sin recursion, seguro para miles de puntos).
  function rdpOpen(points, eps) {
    const n = points.length;
    if (n < 3) return points.slice();
    const keep = new Uint8Array(n);
    keep[0] = 1;
    keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const seg = stack.pop();
      const s = seg[0];
      const e = seg[1];
      const a = points[s];
      const b = points[e];
      let idx = -1;
      let max = -1;
      for (let i = s + 1; i < e; i += 1) {
        const d = lineDist(points[i], a, b);
        if (d > max) {
          max = d;
          idx = i;
        }
      }
      if (max > eps && idx !== -1) {
        keep[idx] = 1;
        stack.push([s, idx]);
        stack.push([idx, e]);
      }
    }
    const out = [];
    for (let i = 0; i < n; i += 1) if (keep[i]) out.push(points[i]);
    return out;
  }

  // Simplifica un contorno cerrado anclando en el punto mas a la derecha,
  // para que el resultado no dependa de donde empezo el trazado.
  function dpSimplifyClosed(points, eps) {
    if (points.length <= 4 || eps <= 0) return points.slice();
    let split = 0;
    for (let i = 1; i < points.length; i += 1) {
      if (
        points[i].x > points[split].x ||
        (points[i].x === points[split].x && points[i].y > points[split].y)
      ) {
        split = i;
      }
    }
    const rotated = points.slice(split).concat(points.slice(0, split + 1));
    return rdpOpen(rotated, eps);
  }

  // Nucleo: ImageData -> contorno de puntos. Funciona en navegador y en Node.
  function imageDataToContour(imageData, options) {
    const opts = options || {};
    const threshold = opts.threshold == null ? null : Number(opts.threshold);
    const invert = opts.invert === true;
    const epsilon = opts.epsilon == null ? 1.2 : Number(opts.epsilon);

    const bin = binarize(imageData, threshold, invert);
    const comp = largestComponent(bin.grid, bin.W, bin.H);
    if (!comp.size) {
      throw new Error("No detecte ninguna figura. Sube el contraste o ajusta el umbral.");
    }
    // Una plantilla real ocupa una fraccion apreciable de la imagen.
    if (comp.size < (bin.W * bin.H) * 0.002) {
      throw new Error("La figura detectada es muy chica. Revisa el umbral o el encuadre.");
    }
    let pts = traceBoundary(comp.mask, bin.W, bin.H);
    if (pts.length < 8) {
      throw new Error("No pude trazar un contorno claro. Prueba con mas contraste.");
    }
    pts = dpSimplifyClosed(pts, epsilon);
    return {
      points: pts,
      width: bin.W,
      height: bin.H,
      threshold: bin.threshold,
      blobSize: comp.size,
    };
  }

  // --- Solo navegador: decodificar el archivo a ImageData ---
  async function imageFileToImageData(file, maxDim) {
    const limit = maxDim || MAX_DIM;
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, limit / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    if (bitmap.close) bitmap.close();
    return ctx.getImageData(0, 0, w, h);
  }

  async function imageFileToContour(file, options) {
    const opts = options || {};
    const imageData = await imageFileToImageData(file, opts.maxDim);
    const result = imageDataToContour(imageData, opts);
    result.imageData = imageData; // se guarda para re-trazar al mover el umbral
    return result;
  }

  const API = {
    MAX_DIM,
    otsuThreshold,
    binarize,
    largestComponent,
    traceBoundary,
    dpSimplifyClosed,
    imageDataToContour,
    imageFileToImageData,
    imageFileToContour,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.ContourTracer = API;
})();
