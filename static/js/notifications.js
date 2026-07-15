/* Notification bell dropdown: budget warnings, bill reminders, monthly summaries */

const Notifications = {
  items: [],

  async load() {
    const data = await API.get('/api/notifications').catch(() => ({ notifications: [] }));
    this.items = data.notifications || [];
    return this.items;
  },

  unreadCount() {
    return this.items.filter(n => !n.read).length;
  },

  renderBell(topbar) {
    const wrap = el('div', { class: 'dropdown' });
    const btn = el('button', { class: 'icon-btn' }, '🔔');
    if (this.unreadCount() > 0) btn.appendChild(el('span', { class: 'notif-dot' }));
    const panel = el('div', { class: 'dropdown-panel' });
    this._fillPanel(panel);

    btn.onclick = (e) => {
      e.stopPropagation();
      panel.classList.toggle('open');
    };
    document.addEventListener('click', () => panel.classList.remove('open'));
    panel.addEventListener('click', e => e.stopPropagation());

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    return wrap;
  },

  _fillPanel(panel) {
    panel.innerHTML = '';
    if (!this.items.length) {
      panel.appendChild(el('div', { class: 'empty-state', style: 'padding:20px;' }, [el('p', {}, 'No notifications yet.')]));
      return;
    }
    this.items.forEach(n => {
      const item = el('div', { class: `notif-item ${n.read ? '' : 'unread'}` });
      item.innerHTML = `<div class="kind">${n.kind.replace('_', ' ')}</div><div>${escapeHtml(n.message)}</div>`;
      item.onclick = async () => {
        if (!n.read) {
          await API.post(`/api/notifications/${n.id}/read`);
          n.read = true;
          item.classList.remove('unread');
        }
      };
      panel.appendChild(item);
    });
  }
};
