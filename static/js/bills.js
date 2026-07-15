/* Bill calendar & subscription tracker */

const Bills = {
  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:300px;border-radius:16px;"></div>`;
    const data = await API.get('/api/bills').catch(() => ({ bills: [] }));
    container.innerHTML = '';

    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;' });
    head.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0;font-size:1.4rem;' }, 'Bill Calendar & Subscriptions'));
    const addBtn = el('button', { class: 'btn btn-primary' }, '+ Add bill');
    addBtn.onclick = () => this._openModal(container);
    head.appendChild(addBtn);
    container.appendChild(head);

    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Upcoming bills'),
      el('span', { class: 'sub' }, `${data.bills.length} tracked`)
    ]));

    if (!data.bills.length) {
      card.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No bills tracked yet. Add recurring bills and subscriptions to get reminders.')]));
    } else {
      const today = new Date().getDate();
      const sorted = [...data.bills].sort((a, b) => a.due_day - b.due_day);
      const tableWrap = el('div', { class: 'table-wrap' });
      const table = el('table', { class: 'data-table' });
      table.innerHTML = `<thead><tr><th>Bill</th><th>Category</th><th>Amount</th><th>Due day</th><th>Status</th><th></th></tr></thead>`;
      const tbody = el('tbody');
      sorted.forEach(b => {
        const daysUntil = b.due_day - today;
        let status = `Due day ${b.due_day}`;
        let statusColor = 'var(--text-dim)';
        if (daysUntil === 0) { status = 'Due today'; statusColor = 'var(--warn-amber)'; }
        else if (daysUntil > 0 && daysUntil <= 3) { status = `Due in ${daysUntil}d`; statusColor = 'var(--warn-amber)'; }
        else if (daysUntil < 0) { status = 'Passed this month'; statusColor = 'var(--text-faint)'; }

        const tr = el('tr');
        tr.innerHTML = `
          <td>${escapeHtml(b.name)}</td>
          <td><span class="pill pill-cat">${categoryIcon(b.category)} ${b.category}</span></td>
          <td class="mono">${fmtMoney(b.amount)}</td>
          <td class="mono">${b.due_day}</td>
          <td style="color:${statusColor};font-size:0.85rem;">${status}</td>
        `;
        const actionTd = el('td');
        const delBtn = el('button', { class: 'row-actions' });
        const inner = el('button', { title: 'Delete' }, '🗑');
        inner.onclick = async () => { await API.del(`/api/bills/${b.id}`); this.render(container); };
        delBtn.appendChild(inner);
        actionTd.appendChild(delBtn);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      card.appendChild(tableWrap);
    }
    container.appendChild(card);
  },

  _openModal(container) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });
    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'Add bill or subscription'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const nameInput = el('input', { type: 'text', placeholder: 'e.g. Netflix, Rent, Electric' });
    const amountInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00' });
    const dueDayInput = el('input', { type: 'number', min: '1', max: '31', placeholder: '1-31' });
    const catSelect = el('select');
    CATEGORIES.forEach(c => catSelect.appendChild(el('option', { value: c }, c)));
    const errorBox = el('div');

    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Name'), nameInput]));
    box.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Amount'), amountInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Due day of month'), dueDayInput]),
    ]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Category'), catSelect]));
    box.appendChild(errorBox);

    const saveBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Add bill');
    saveBtn.addEventListener('click', async () => {
      saveBtn.disabled = true;
      try {
        await API.post('/api/bills', {
          name: nameInput.value, amount: parseFloat(amountInput.value),
          due_day: parseInt(dueDayInput.value, 10), category: catSelect.value
        });
        showToast('Bill added.', 'success');
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
