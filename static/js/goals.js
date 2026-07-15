/* Savings goals view: create, track progress, projections */

const Goals = {
  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:300px;border-radius:16px;"></div>`;
    const data = await API.get('/api/goals').catch(() => ({ goals: [] }));
    container.innerHTML = '';

    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;' });
    head.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0;font-size:1.4rem;' }, 'Savings Goals'));
    const addBtn = el('button', { class: 'btn btn-primary' }, '+ New goal');
    addBtn.onclick = () => this._openModal(container);
    head.appendChild(addBtn);
    container.appendChild(head);

    if (!data.goals.length) {
      const card = el('div', { class: 'card' });
      card.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No savings goals yet. Create one to start tracking progress toward it.')]));
      container.appendChild(card);
      return;
    }

    const grid = el('div', { class: 'goal-grid' });
    data.goals.forEach(g => {
      const proj = g.projection;
      const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
      const card = el('div', { class: 'goal-card' });
      card.innerHTML = `
        <h4>${escapeHtml(g.name)}</h4>
        <div class="meta">${g.target_date ? `Target date: ${fmtDate(g.target_date)}` : 'No target date set'}</div>
        <div class="amounts-row"><span>${fmtMoney(g.current_amount)}</span><span style="color:var(--text-faint)">of ${fmtMoney(g.target_amount)}</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
        <div style="margin-top:12px;font-size:0.82rem;color:var(--text-dim);">
          ${proj.status === 'complete'
            ? '<strong style="color:var(--signal-green)">Goal complete! 🎉</strong>'
            : `Suggested monthly contribution: <strong class="mono" style="color:var(--text)">${fmtMoney(proj.suggested_monthly_contribution)}</strong><br>Est. ${proj.months_remaining} month(s) remaining`}
        </div>
      `;
      const updateRow = el('div', { style: 'display:flex;gap:8px;margin-top:14px;' });
      const addInput = el('input', { type: 'number', placeholder: 'Add amount', step: '0.01', style: 'flex:1;background:var(--panel);border:1px solid var(--panel-border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:0.85rem;' });
      const addBtnSmall = el('button', { class: 'btn btn-primary btn-sm' }, 'Add');
      addBtnSmall.onclick = async () => {
        const val = parseFloat(addInput.value);
        if (isNaN(val) || val <= 0) return;
        await API.put(`/api/goals/${g.id}`, { current_amount: g.current_amount + val });
        showToast('Contribution added.', 'success');
        this.render(container);
      };
      const delBtn = el('button', { class: 'btn btn-ghost btn-sm' }, '🗑');
      delBtn.onclick = async () => {
        if (!confirm('Delete this goal?')) return;
        await API.del(`/api/goals/${g.id}`);
        this.render(container);
      };
      updateRow.appendChild(addInput);
      updateRow.appendChild(addBtnSmall);
      updateRow.appendChild(delBtn);
      card.appendChild(updateRow);
      grid.appendChild(card);
    });
    container.appendChild(grid);
  },

  _openModal(container) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });
    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'New savings goal'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const nameInput = el('input', { type: 'text', placeholder: 'e.g. Emergency fund' });
    const targetInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00' });
    const currentInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', value: '0' });
    const dateInput = el('input', { type: 'date' });
    const errorBox = el('div');

    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Goal name'), nameInput]));
    box.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Target amount'), targetInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Starting amount'), currentInput]),
    ]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Target date (optional)'), dateInput]));
    box.appendChild(errorBox);

    const saveBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Create goal');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await API.post('/api/goals', {
          name: nameInput.value, target_amount: parseFloat(targetInput.value),
          current_amount: parseFloat(currentInput.value || 0), target_date: dateInput.value || null
        });
        showToast('Goal created.', 'success');
        close();
        this.render(container);
      } catch (e) {
        errorBox.innerHTML = '';
        errorBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
      } finally {
        saveBtn.disabled = false;
      }
    });
    box.appendChild(saveBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    function close() { overlay.classList.remove('open'); setTimeout(() => overlay.remove(), 220); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }
};
