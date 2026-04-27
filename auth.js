const SUPABASE_URL  = "https://vlhoshlnkmsojeqejzwo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsaG9zaGxua21zb2plcWVqendvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjk5NzksImV4cCI6MjA5MTUwNTk3OX0.pyQDaG4dpwi_I_7bN6D433xkIE5TBGGFICQ8LP0_etg";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authScreen   = document.getElementById("authScreen");
const appContent   = document.getElementById("appContent");
const authStep1    = document.getElementById("authStep1");
const authStep2    = document.getElementById("authStep2");
const authEmail    = document.getElementById("authEmail");
const authCode     = document.getElementById("authCode");
const authSendBtn  = document.getElementById("authSendBtn");
const authVerifyBtn= document.getElementById("authVerifyBtn");
const authBackBtn  = document.getElementById("authBackBtn");
const authError1   = document.getElementById("authError1");
const authError2   = document.getElementById("authError2");
const authEmailDisplay = document.getElementById("authEmailDisplay");
const logoutBtn    = document.getElementById("logoutBtn");

// ── Mostrar/ocultar pantallas ─────────────────────────────────────────────────
function showApp() {
  authScreen.hidden = true;
  appContent.hidden = false;
}

function showAuth() {
  authScreen.hidden = false;
  appContent.hidden = true;
  authStep1.hidden  = false;
  authStep2.hidden  = true;
  authError1.textContent = "";
  authError2.textContent = "";
  authEmail.value = "";
  authCode.value  = "";
}

// ── Estado inicial ────────────────────────────────────────────────────────────
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) showApp();
  else showAuth();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session) showApp();
  else showAuth();
});

// ── Paso 1: enviar código ─────────────────────────────────────────────────────
authSendBtn.addEventListener("click", async () => {
  const email = authEmail.value.trim().toLowerCase();
  authError1.textContent = "";

  if (!email || !email.includes("@")) {
    authError1.textContent = "Ingresa un correo válido.";
    return;
  }

  authSendBtn.disabled = true;
  authSendBtn.textContent = "Verificando...";

  // Verificar si el correo está en la lista autorizada
  const { data, error } = await sb
    .from("authorized_emails")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) {
    authError1.textContent = "Correo no autorizado. Contacta a AutovidriosRobin.";
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Enviar código";
    return;
  }

  // Enviar OTP
  authSendBtn.textContent = "Enviando...";
  const { error: otpError } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  authSendBtn.disabled = false;
  authSendBtn.textContent = "Enviar código";

  if (otpError) {
    authError1.textContent = "Error al enviar el código. Intenta de nuevo.";
    return;
  }

  // Pasar a paso 2
  authEmailDisplay.textContent = email;
  authStep1.hidden = true;
  authStep2.hidden = false;
  authCode.focus();
});

// Enter en campo email → enviar
authEmail.addEventListener("keydown", e => {
  if (e.key === "Enter") authSendBtn.click();
});

// ── Paso 2: verificar código ──────────────────────────────────────────────────
authVerifyBtn.addEventListener("click", async () => {
  const email = authEmail.value.trim().toLowerCase();
  const token = authCode.value.trim();
  authError2.textContent = "";

  if (token.length !== 6 || !/^\d{6}$/.test(token)) {
    authError2.textContent = "El código debe ser de 6 dígitos.";
    return;
  }

  authVerifyBtn.disabled = true;
  authVerifyBtn.textContent = "Verificando...";

  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });

  authVerifyBtn.disabled = false;
  authVerifyBtn.textContent = "Acceder";

  if (error) {
    authError2.textContent = "Código incorrecto o expirado. Solicita uno nuevo.";
  }
  // Si es correcto, onAuthStateChange dispara showApp()
});

// Enter en campo código → verificar
authCode.addEventListener("keydown", e => {
  if (e.key === "Enter") authVerifyBtn.click();
});

// ── Volver al paso 1 ──────────────────────────────────────────────────────────
authBackBtn.addEventListener("click", () => {
  authStep2.hidden = true;
  authStep1.hidden = false;
  authCode.value  = "";
  authError2.textContent = "";
  authEmail.focus();
});

// ── Cerrar sesión ─────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
  await sb.auth.signOut();
  // onAuthStateChange dispara showAuth()
});
