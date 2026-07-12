#!/usr/bin/env bash
# init.sh — Buscador AVR (sitio estático). No hay build ni dependencias.
# Sirve el sitio localmente para desarrollo/preview.
set -e
PORT="${1:-5599}"
echo "Buscador AVR — sitio estático (HTML/JS vanilla)."
echo "No requiere instalar nada. Requiere login Supabase para usar el buscador."
echo ""
echo "Sirviendo en http://localhost:${PORT}  (Ctrl+C para salir)"
echo "Producción: push a 'main' -> GitHub Pages redeploya."
echo "Edge Functions (cotizacion-email, cotizacion-pdf) se despliegan a Supabase aparte."
python3 -m http.server "${PORT}"
