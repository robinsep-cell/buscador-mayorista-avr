const SUPABASE_URL  = "https://vlhoshlnkmsojeqejzwo.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZsaG9zaGxua21zb2plcWVqendvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5Mjk5NzksImV4cCI6MjA5MTUwNTk3OX0.pyQDaG4dpwi_I_7bN6D433xkIE5TBGGFICQ8LP0_etg";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
window._sb = sb;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const authScreen  = document.getElementById("authScreen");
const appContent  = document.getElementById("appContent");
const authEmail   = document.getElementById("authEmail");
const authPass    = document.getElementById("authPassword");
const authSendBtn = document.getElementById("authSendBtn");
const authError1  = document.getElementById("authError1");
const logoutBtn   = document.getElementById("logoutBtn");
const adminBtn    = document.getElementById("adminBtn");

// ── Mostrar/ocultar pantallas ─────────────────────────────────────────────────
function showAuth() {
  authScreen.hidden = false;
  appContent.hidden = true;
  authError1.textContent = "";
  authEmail.value = "";
  authPass.value  = "";
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

// ── Login con correo y contraseña ─────────────────────────────────────────────
authSendBtn.addEventListener("click", async () => {
  const email    = authEmail.value.trim().toLowerCase();
  const password = authPass.value;
  authError1.textContent = "";

  if (!email || !email.includes("@")) {
    authError1.textContent = "Ingresa un correo válido.";
    return;
  }
  if (!password || password.length < 6) {
    authError1.textContent = "La contraseña debe tener al menos 6 caracteres.";
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
    authSendBtn.textContent = "Entrar";
    return;
  }

  // Intentar iniciar sesión
  const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });

  if (!signInErr) {
    // Éxito — onAuthStateChange maneja el resto
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Entrar";
    return;
  }

  // Credenciales inválidas: puede ser primera vez (crear cuenta) o clave incorrecta
  if (signInErr.message === "Invalid login credentials") {
    const { error: signUpErr } = await sb.auth.signUp({ email, password });

    if (!signUpErr) {
      // Primera vez: cuenta creada. onAuthStateChange dispara si email confirm está desactivado.
      authSendBtn.disabled = false;
      authSendBtn.textContent = "Entrar";
      return;
    }

    if (signUpErr.message.toLowerCase().includes("already registered")) {
      authError1.textContent = "Contraseña incorrecta.";
    } else {
      authError1.textContent = "Error al crear cuenta. Intenta de nuevo.";
    }
    authSendBtn.disabled = false;
    authSendBtn.textContent = "Entrar";
    return;
  }

  authError1.textContent = "Error al iniciar sesión. Intenta de nuevo.";
  authSendBtn.disabled = false;
  authSendBtn.textContent = "Entrar";
});

["keydown"].forEach(ev =>
  authPass.addEventListener(ev, e => { if (e.key === "Enter") authSendBtn.click(); })
);

// ── Cerrar sesión ─────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => sb.auth.signOut());
