// Panel de administración — solo visible para is_admin = true

const adminBtn    = document.getElementById("adminBtn");
const mainView    = document.getElementById("mainView");
const adminView   = document.getElementById("adminView");
const adminBack   = document.getElementById("adminBack");
const adminList   = document.getElementById("adminList");
const adminForm   = document.getElementById("adminForm");
const adminNombre = document.getElementById("adminNombre");
const adminEmail  = document.getElementById("adminNewEmail");
const adminAddBtn = document.getElementById("adminAddBtn");
const adminMsg    = document.getElementById("adminMsg");

// Abrir/cerrar panel
adminBtn?.addEventListener("click", () => {
  mainView.hidden = true;
  adminView.hidden = false;
  loadUsers();
});

adminBack?.addEventListener("click", () => {
  adminView.hidden = true;
  mainView.hidden  = false;
});

// ── Cargar lista de usuarios ──────────────────────────────────────────────────
async function loadUsers() {
  adminList.innerHTML = `<tr><td colspan="4" class="admin-empty">Cargando...</td></tr>`;
  const { data, error } = await window._sb
    .from("authorized_emails")
    .select("email, nombre, is_admin, created_at")
    .order("created_at", { ascending: true });

  if (error || !data) {
    adminList.innerHTML = `<tr><td colspan="4" class="admin-empty">Error al cargar usuarios.</td></tr>`;
    return;
  }

  if (!data.length) {
    adminList.innerHTML = `<tr><td colspan="4" class="admin-empty">Sin usuarios registrados.</td></tr>`;
    return;
  }

  adminList.innerHTML = data.map(u => {
    const fecha = new Date(u.created_at).toLocaleDateString("es-CL");
    const isSelf = u.email === window.currentUser?.email;
    return `
      <tr>
        <td class="admin-td">
          <span class="admin-nombre">${escHtml(u.nombre || "—")}</span>
          <span class="admin-email-small">${escHtml(u.email)}</span>
        </td>
        <td class="admin-td admin-td--center">
          ${u.is_admin ? '<span class="admin-badge admin-badge--admin">Admin</span>' : '<span class="admin-badge">Usuario</span>'}
        </td>
        <td class="admin-td admin-td--muted">${fecha}</td>
        <td class="admin-td admin-td--center">
          ${isSelf ? "" : `<button class="admin-del-btn" data-email="${escHtml(u.email)}">Eliminar</button>`}
        </td>
      </tr>`;
  }).join("");

  // Botones de eliminar
  adminList.querySelectorAll(".admin-del-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.email));
  });
}

// ── Agregar usuario ───────────────────────────────────────────────────────────
adminAddBtn?.addEventListener("click", async () => {
  const nombre = adminNombre.value.trim();
  const email  = adminEmail.value.trim().toLowerCase();
  adminMsg.textContent = "";
  adminMsg.className   = "admin-msg";

  if (!nombre || !email || !email.includes("@")) {
    adminMsg.textContent = "Ingresa nombre y correo válido.";
    adminMsg.classList.add("admin-msg--error");
    return;
  }

  adminAddBtn.disabled = true;
  adminAddBtn.textContent = "Guardando...";

  const { error } = await window._sb
    .from("authorized_emails")
    .insert({ email, nombre, is_admin: false });

  adminAddBtn.disabled = false;
  adminAddBtn.textContent = "Agregar";

  if (error) {
    adminMsg.textContent = error.code === "23505"
      ? "Ese correo ya está autorizado."
      : "Error al agregar. Intenta de nuevo.";
    adminMsg.classList.add("admin-msg--error");
    return;
  }

  adminNombre.value = "";
  adminEmail.value  = "";
  adminMsg.textContent = `✓ ${email} agregado correctamente.`;
  adminMsg.classList.add("admin-msg--ok");
  loadUsers();
});

// ── Eliminar usuario ──────────────────────────────────────────────────────────
async function deleteUser(email) {
  if (!confirm(`¿Eliminar acceso a ${email}?`)) return;

  const { error } = await window._sb
    .from("authorized_emails")
    .delete()
    .eq("email", email);

  if (error) {
    alert("No se pudo eliminar. Verifica permisos.");
    return;
  }
  loadUsers();
}

// ── Helper ────────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
