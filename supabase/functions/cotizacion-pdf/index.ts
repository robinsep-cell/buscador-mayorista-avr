// AVR — Sube el PDF de una cotización a un bucket privado y devuelve un link FIRMADO
// (temporal) para compartir por WhatsApp. WhatsApp no permite adjuntar archivos por link,
// así que se manda el texto + este enlace al PDF.
// La llama el buscador (cotizador.js) al tocar "WhatsApp".
// Body: { numero, pdf_base64 }  → pdf_base64 en base64 SIN prefijo "data:...,"
// Respuesta: { ok, url, path }
import { createClient } from "jsr:@supabase/supabase-js@2";

const BUCKET  = "cotizaciones";
const EXPIRES = 60 * 60 * 24 * 90; // 90 días

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const numeroRaw: string = String(body.numero || "COT").trim();
    // Carpeta segura (sin caracteres raros): p.ej. COT-20260708-57
    const numero = numeroRaw.replace(/[^A-Za-z0-9_-]/g, "") || "COT";
    const pdf_base64: string = String(body.pdf_base64 || "");
    if (!pdf_base64) return json({ ok: false, error: "falta el PDF (pdf_base64)" }, 400);

    // base64 → bytes
    let bin: Uint8Array;
    try {
      const raw = atob(pdf_base64);
      bin = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    } catch (_e) {
      return json({ ok: false, error: "pdf_base64 inválido" }, 400);
    }

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Ruta con UUID → no adivinable (el PDF lleva datos del cliente).
    const path = `${numero}/${crypto.randomUUID()}.pdf`;

    const up = await supa.storage.from(BUCKET).upload(path, bin, {
      contentType: "application/pdf", upsert: true,
    });
    if (up.error) return json({ ok: false, error: "upload: " + up.error.message }, 500);

    const sign = await supa.storage.from(BUCKET).createSignedUrl(path, EXPIRES, {
      download: `Cotizacion_${numero}.pdf`,
    });
    if (sign.error || !sign.data?.signedUrl) {
      return json({ ok: false, error: "sign: " + (sign.error?.message || "sin url") }, 500);
    }

    return json({ ok: true, url: sign.data.signedUrl, path });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
