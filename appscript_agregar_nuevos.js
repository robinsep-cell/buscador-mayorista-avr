function agregarNuevosAVR() {
  var GIST_URL = "https://gist.githubusercontent.com/robinsep-cell/829591031c504a53af23aa4745453dd2/raw/nuevos_para_avr.csv";
  var TAB_NAME = "AVR_unificado";
  var AVR_COLS = 42; // columnas A..AP sin las dos extras (Fuente, Score_Match)

  // Fetch CSV
  var resp = UrlFetchApp.fetch(GIST_URL, {muteHttpExceptions: true});
  if (resp.getResponseCode() !== 200) {
    SpreadsheetApp.getUi().alert("Error al descargar el CSV: " + resp.getResponseCode());
    return;
  }

  var text = resp.getContentText("UTF-8").replace(/^﻿/, "");
  var rows = parseCsv_(text);
  if (rows.length < 2) {
    SpreadsheetApp.getUi().alert("CSV vacío o sin datos.");
    return;
  }

  // Header is row 0; data starts at row 1
  // Last 2 cols are "Fuente" and "Score_Match" — we drop them
  var dataRows = rows.slice(1).map(function(r) {
    return r.slice(0, AVR_COLS);
  });

  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TAB_NAME);
  if (!sheet) {
    SpreadsheetApp.getUi().alert("No encontré la pestaña: " + TAB_NAME);
    return;
  }

  // Append all rows at the bottom
  var lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, dataRows.length, AVR_COLS).setValues(dataRows);

  SpreadsheetApp.getUi().alert("✅ Agregados " + dataRows.length + " productos a " + TAB_NAME);
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCsv_(text) {
  var rows = [], row = [], cur = "", inQ = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQ = false;
      else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ""; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (c !== '\r') cur += c;
    }
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(function(r) { return r.some(function(v) { return v.trim() !== ""; }); });
}
