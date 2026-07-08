// AVR — Envía una cotización por correo al cliente con el PDF adjunto (vía Resend).
// La llama el buscador (cotizador.js) al tocar "Email".
// Body: { to, cliente_nombre?, numero, total?, ejecutivo?, filename?, pdf_base64 }
//   - pdf_base64: el PDF de la cotización en base64 SIN el prefijo "data:...,"
// Reusa la API key de Resend ya guardada (RPC get_payment_secrets → resend_api_key),
// la misma que usan las funciones de pago. Manda copia oculta (bcc) a aviso_email.
//
// IMPORTANTE: hoy el remitente es onboarding@resend.dev (dominio de prueba de Resend),
// que SOLO permite enviar a la propia casilla de la cuenta. Para enviar a clientes hay que
// verificar autovidriosrobin.cl en Resend (registros DNS en HostingPlus) y luego cambiar FROM
// por "AutoVidriosRobin <cotizaciones@autovidriosrobin.cl>".
import { createClient } from "jsr:@supabase/supabase-js@2";

// Dominio autovidriosrobin.cl verificado en Resend el 2026-07-07 → envío desde la marca.
const FROM     = "AutoVidriosRobin <contacto@autovidriosrobin.cl>";
const REPLY_TO = "contacto@autovidriosrobin.cl";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function fmtCLP(n: number): string {
  return "$ " + Math.round(n || 0).toLocaleString("es-CL");
}

function cuerpoHtml(nombre: string, numero: string, total: number, ejecutivo: string): string {
  const saludo = nombre ? `Estimado/a ${nombre}` : "Estimado/a cliente";
  const totalTxt = total > 0 ? `<p style="margin:0 0 14px">Total cotizado: <b>${fmtCLP(total)}</b> (IVA incluido).</p>` : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#13261a;font-size:14px;line-height:1.5;max-width:560px">
    <p style="margin:0 0 12px">${saludo},</p>
    <p style="margin:0 0 12px">Adjunto encontrará su cotización <b>${numero || ""}</b> de AutoVidriosRobin. El detalle completo está en el PDF adjunto.</p>
    ${totalTxt}
    <p style="margin:0 0 12px">Cualquier consulta puede responder este correo o escribirnos por WhatsApp al <b>+56 9 8157 4307</b>.</p>
    <p style="margin:16px 0 2px">Saludos,</p>
    <p style="margin:0;font-weight:700">${ejecutivo || "Equipo AutoVidriosRobin"}</p>
    <p style="margin:0;color:#557">AutoVidriosRobin SPA · José Arrieta 7044, La Reina, Santiago</p>
    <p style="margin:0;color:#557">autovidriosrobin.cl</p>
  </div>`;
}

Deno.serve(async (req) => {
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json", ...CORS } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const to: string = String(body.to || "").trim();
    const numero: string = String(body.numero || "").trim();
    const pdf_base64: string = String(body.pdf_base64 || "");
    const clienteNombre: string = String(body.cliente_nombre || "").trim();
    const ejecutivo: string = String(body.ejecutivo || "").trim();
    const total: number = Number(body.total || 0);
    const filename: string = String(body.filename || `Cotizacion_${numero || "AVR"}.pdf`);

    if (!to || !to.includes("@")) return json({ ok: false, error: "falta correo del cliente (to)" }, 400);
    if (!pdf_base64)              return json({ ok: false, error: "falta el PDF (pdf_base64)" }, 400);

    // Secrets (misma fuente que las funciones de pago)
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let secrets: any = {};
    try { const { data } = await supa.rpc("get_payment_secrets"); secrets = data || {}; } catch (_e) { /**/ }
    const apiKey: string = secrets.resend_api_key || "";
    if (!apiKey) return json({ ok: false, error: "Resend no configurado (resend_api_key)" }, 500);

    const payload: Record<string, unknown> = {
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: `Cotización ${numero || ""} — AutoVidriosRobin`.trim(),
      html: cuerpoHtml(clienteNombre, numero, total, ejecutivo),
      attachments: [{ filename, content: pdf_base64 }],
    };
    // Copia oculta interna (a Robinson), si está configurada y no es el mismo destinatario.
    if (secrets.aviso_email && secrets.aviso_email !== to) payload.bcc = [secrets.aviso_email];

    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const txt = await r.text();
    let data: any = null;
    try { data = JSON.parse(txt); } catch (_e) { data = txt; }

    if (!r.ok) return json({ ok: false, error: (data && data.message) || txt || "error Resend", status: r.status }, 502);
    return json({ ok: true, id: data?.id, to });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
