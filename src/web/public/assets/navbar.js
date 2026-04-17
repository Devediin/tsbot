function renderNavbar() {
  const navbarHTML = `
    <div class="navbar">
      <a href="/">🏠 Home</a>
      <a href="/description">📜 Gerador</a>
      <a href="/dashboard">📊 Dashboard</a>
      <a href="/tools">🧮 Tools</a>
      <span class="theme-toggle" onclick="toggleTheme()">🌓</span>
    </div>
  `;
  const container = document.getElementById('navbar');
  if (container) {
    container.innerHTML = navbarHTML;
  }
}

renderNavbar();
