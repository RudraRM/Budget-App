/* Budget planning view: create budgets, view progress, AI forecast */

const Budgets = {
  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:300px;border-radius:16px;"></div>`;
    const [progressRes, insightsRes] = await Promise.all([
      API.get('/api/budgets/progress').catch(() => ({ progress: [] })),
      API.get('/api/ai/insights').catch(() => null),
    ]);
    container.innerHTML = '';

    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;' });
    head.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0;font-size:1.4rem;' }, 'Budget Planning'));
    const addBtn = el('button', { class: 'btn btn-primary' }, '+ New budget');
    addBtn.onclick = () => this._openModal(container);
    head.appendChild(addBtn);
    container.appendChild(head);

    const grid = el('div', { class: 'grid-2' });
    const left = el('div', { class: 'card' });
    left.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Budget Progress')]));
    if (!progressRes.progress.length) {
      left.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No budgets set. Create one to start tracking spending limits.')]));
    } else {
      progressRes.progress.forEach(b => {
        const item = el('div', { class: 'budget-item' });
        const cls = b.percent >= 100 ? 'over' : (b.percent >= 80 ? 'warn' : '');
        item.innerHTML = `
          <div class="budget-item-head">
            <span>${categoryIcon(b.category)} ${b.category} <span style="color:var(--text-faint);font-size:0.78rem;">(${b.period})</span></span>
            <span class="amounts">${fmtMoney(b.spent)} / ${fmtMoney(b.limit)}</span>
          </div>
          <div class="progress-track"><div class="progress-fill ${cls}" style="width:${b.percent}%"></div></div>
          ${b.overspent ? `<div style="font-size:0.8rem;color:var(--loss-red);margin-top:6px;">Over budget by ${fmtMoney(b.spent - b.limit)}</div>` : ''}
        `;
        const delBtn = el('button', { class: 'btn btn-ghost btn-sm', style: 'margin-top:8px;' }, 'Remove budget');
        delBtn.onclick = async () => {
          await API.del(`/api/budgets/${b.id}`);
          this.render(container);
        };
        item.appendChild(delBtn);
        left.appendChild(item);
      });
    }
    grid.appendChild(left);

    const right = el('div', { class: 'card' });
    right.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'AI Budget Forecast'),
      el('span', { class: 'sub' }, 'Projects month-end totals')
    ]));
    const forecastBody = el('div');
    forecastBody.innerHTML = insightsRes ? AIView.renderBudgetForecast(insightsRes.budget_forecast) : AIView.renderBudgetForecast([]);
    right.appendChild(forecastBody);
    grid.appendChild(right);

    container.appendChild(grid);
  },

  _openModal(container) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });
    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'New budget'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const catSelect = el('select');
    CATEGORIES.forEach(c => catSelect.appendChild(el('option', { value: c }, c)));

    const periodSelect = el('select');
    [['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly']].forEach(([v, l]) => periodSelect.appendChild(el('option', { value: v }, l)));

    const limitInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00' });
    const errorBox = el('div');

    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Category'), catSelect]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Period'), periodSelect]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Limit amount'), limitInput]));
    box.appendChild(errorBox);

    const saveBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Create budget');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await API.post('/api/budgets', { category: catSelect.value, period: periodSelect.value, limit: parseFloat(limitInput.value) });
        showToast('Budget created.', 'success');
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
