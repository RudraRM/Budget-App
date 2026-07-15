/* App bootstrap: auth check, layout shell, routing between views */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◈', module: Dashboard },
  { id: 'transactions', label: 'Transactions', icon: '▤', module: Transactions },
  { id: 'budgets', label: 'Budgets', icon: '▦', module: Budgets },
  { id: 'goals', label: 'Goals', icon: '◎', module: Goals },
  { id: 'reports', label: 'Reports', icon: '▧', module: Reports },
  { id: 'bills', label: 'Bills', icon: '📅', module: Bills },
  { id: 'tools', label: 'Calculators', icon: '✦', module: Tools },
];

const App = {
  currentView: 'dashboard',

  async boot() {
    const meRes = await API.get('/api/auth/me').catch(() => ({ user: null }));
    if (meRes.user) {
      window.CURRENT_USER = meRes.user;
      this.init();
    } else {
      document.getElementById('authRoot').style.display = '';
      document.getElementById('appRoot').style.display = 'none';
      Auth.render();
    }
    this._registerServiceWorker();
  },

  init() {
    document.getElementById('authRoot').style.display = 'none';
    const root = document.getElementById('appRoot');
    root.style.display = '';
    document.body.setAttribute('data-theme', window.CURRENT_USER.theme || 'dark');
    this._buildShell(root);
    this.navigate('dashboard');
  },

  _buildShell(root) {
    root.innerHTML = '';
    const shell = el('div', { class: 'app-shell' });

    const sidebar = el('div', { class: 'sidebar', id: 'sidebar' });
    sidebar.appendChild(el('div', { class: 'sidebar-brand' }, [
      el('span', { class: 'brand-mark' }, '$'), 'BudgetMind AI'
    ]));

    NAV_ITEMS.forEach(item => {
      const btn = el('button', { class: `nav-item ${item.id === this.currentView ? 'active' : ''}`, 'data-nav': item.id }, [
        el('span', {}, item.icon), el('span', {}, item.label)
      ]);
      btn.onclick = () => this.navigate(item.id);
      sidebar.appendChild(btn);
    });

    const footer = el('div', { class: 'sidebar-footer' });
    const logoutBtn = el('button', { class: 'nav-item' }, [el('span', {}, '⏻'), el('span', {}, 'Log out')]);
    logoutBtn.onclick = () => this.logout();
    const settingsBtn = el('button', { class: 'nav-item' }, [el('span', {}, '⚙'), el('span', {}, 'Settings')]);
    settingsBtn.onclick = () => this.navigate('settings');
    footer.appendChild(settingsBtn);
    footer.appendChild(logoutBtn);
    sidebar.appendChild(footer);

    const main = el('div');
    const topbar = el('div', { class: 'topbar' });
    const menuToggle = el('button', { class: 'menu-toggle' }, '☰');
    menuToggle.onclick = () => sidebar.classList.toggle('open');
    const titleEl = el('h1', { id: 'viewTitle' }, 'Dashboard');
    const leftSide = el('div', { style: 'display:flex;align-items:center;gap:12px;' }, [menuToggle, titleEl]);

    const rightSide = el('div', { class: 'topbar-actions' });
    const themeBtn = el('button', { class: 'icon-btn', title: 'Toggle theme' }, document.body.getAttribute('data-theme') === 'dark' ? '☾' : '☀');
    themeBtn.onclick = () => this._toggleTheme(themeBtn);
    rightSide.appendChild(themeBtn);

    const notifWrap = el('div', { id: 'notifWrap' });
    rightSide.appendChild(notifWrap);
    this._loadNotifications(notifWrap);

    topbar.appendChild(leftSide);
    topbar.appendChild(rightSide);

    const viewContainer = el('div', { class: 'main-content', id: 'viewContainer' });

    main.appendChild(topbar);
    main.appendChild(viewContainer);

    shell.appendChild(sidebar);
    shell.appendChild(main);
    root.appendChild(shell);
  },

  async _loadNotifications(wrap) {
    await Notifications.load();
    wrap.innerHTML = '';
    wrap.appendChild(Notifications.renderBell());
  },

  navigate(viewId) {
    this.currentView = viewId;
    document.querySelectorAll('.nav-item[data-nav]').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-nav') === viewId);
    });
    const titleEl = document.getElementById('viewTitle');
    const container = document.getElementById('viewContainer');
    document.getElementById('sidebar').classList.remove('open');

    if (viewId === 'settings') {
      titleEl.textContent = 'Settings';
      this._renderSettings(container);
      return;
    }

    const navItem = NAV_ITEMS.find(n => n.id === viewId);
    if (!navItem) return;
    titleEl.textContent = navItem.label;
    navItem.module.render(container);
  },

  _toggleTheme(btn) {
    const current = document.body.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.body.setAttribute('data-theme', next);
    btn.textContent = next === 'dark' ? '☾' : '☀';
    API.put('/api/profile', { theme: next }).catch(() => {});
    if (window.CURRENT_USER) window.CURRENT_USER.theme = next;
  },

  _renderSettings(container) {
    container.innerHTML = '';
    const card = el('div', { class: 'card', style: 'max-width:480px;' });
    card.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Profile settings')]));

    const nameInput = el('input', { type: 'text', value: window.CURRENT_USER.name });
    const currencySelect = el('select');
    Object.keys(CURRENCY_SYMBOLS).forEach(c => {
      const opt = el('option', { value: c }, `${c} (${CURRENCY_SYMBOLS[c]})`);
      if (c === window.CURRENT_USER.currency) opt.selected = true;
      currencySelect.appendChild(opt);
    });

    card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]));
    card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Currency'), currencySelect]));

    const saveBtn = el('button', { class: 'btn btn-primary' }, 'Save changes');
    saveBtn.onclick = async () => {
      await API.put('/api/profile', { name: nameInput.value, currency: currencySelect.value });
      window.CURRENT_USER.name = nameInput.value;
      window.CURRENT_USER.currency = currencySelect.value;
      showToast('Profile updated.', 'success');
    };
    card.appendChild(saveBtn);
    container.appendChild(card);

    const emailCard = el('div', { class: 'card', style: 'max-width:480px;' });
    emailCard.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Account')]));
    emailCard.appendChild(el('div', { style: 'color:var(--text-dim);font-size:0.9rem;' }, `Signed in as ${window.CURRENT_USER.email}`));
    container.appendChild(emailCard);
  },

  async logout() {
    await API.post('/api/auth/logout').catch(() => {});
    window.CURRENT_USER = null;
    location.reload();
  },

  _registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }
};

App.boot();
