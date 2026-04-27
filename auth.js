const SUPABASE_URL  = "https://vlhoshlnkmsojeqejzwo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsaG9zaGxua21zb2plcWVqendvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjk5NzksImV4cCI6MjA5MTUwNTk3OX0.pyQDaG4dpwi_I_7bN6D433xkIE5TBGGFICQ8LP0_etg";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window._sb = sb;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authScreen    = document.getElementById("authScreen");
const appContent    = document.getElementById("appContent");
const authStep1     = document.getElementById("authStep1");
const authStep2     = document.getElementById("authStep2");
const authEmail     = document.getElementById("authEmail");
const authSendBtn   = document.getElementById("authSendBtn");
const authBackBtn   = document.getElementById("authBackBtn");
const authError1    = document.getElementById("authError1");
const authEmailDisp = document.getElementById("authEmailDisplay");
const logoutBtn     = document.getElementById("logoutBtn");
const adminBtn      = document.getElementById("adminBtn");

// ── Mostrar/ocultar pantallas ─────────────────────────────────────────────────
function showAuth() {
  authScreen.hidden = false;
  appContent.hidden = true;
  authStep1.hidden  = false;
  authStep2.hidden  = true;
  authError1.textContent = "";
  authEmail.value = "";
  window.currentUser = null;
}

async function showApp(session) {
  const email = session.user.email;
  const { data: profile } = await sb
    .from("authorized_emails")
    .select("nombre, is_admin")
    .eq("email", email)
    .maybeSingle();

  window.currentUser = {
    email,
    nombre:  profile?.nombre  || email,
    isAdmin: profile?.is_admin === true,
  };

  authScreen.hidden = true;
  appContent.hidden = false;
  adminBtn.hidden   = !window.currentUser.isAdmin;
}

// ── Estado inicial ────────────────────────────────────────────────────────────
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) showApp(session);
  else showAuth();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp(session);
  else showAuth();
});

// ── Paso 1: enviar enlace mágico ──────────────────────────────────────────────
authSendBtn.addEventListener("click", async () => {
  const email = authEmail.value.trim().toLowerCase();
  authError1.textContent = "";
  if (!email || !email.includes("@")) {
    authError1.textContent = "Ingresa un correo válido.";
    return;
  }
  authSendBtn.disabled = true;
  authSendBtn.textContent = "Verificando...";

  // Verificar que el correo esté autorizado
  const { data, error } = await sb
    .from("authorized_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    authError1.textContent = "Correo no autorizado. Contacta al administrador.";
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Enviar enlace";
    return;
  }

  authSendBtn.textContent = "Enviando...";
  const { error: otpErr } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  authSendBtn.disabled = false;
  authSendBtn.textContent = "Enviar enlace";

  if (otpErr) {
    authError1.textContent = "Error al enviar el correo. Intenta de nuevo.";
    return;
  }

  authEmailDisp.textContent = email;
  authStep1.hidden = true;
  authStep2.hidden = false;
});

authEmail.addEventListener("keydown", e => { if (e.key === "Enter") authSendBtn.click(); });

// ── Volver ────────────────────────────────────────────────────────────────────
authBackBtn.addEventListener("click", () => {
  authStep2.hidden = true;
  authStep1.hidden = false;
  authError1.textContent = "";
  authEmail.focus();
});

// ── Cerrar sesión ─────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => sb.auth.signOut());
