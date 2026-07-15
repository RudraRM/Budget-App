/* Transactions view: list, filters, add/edit modal, delete */

const Transactions = {
  filters: { category: 'all', type: 'all', from: '', to: '', search: '' },
  cache: [],

  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:400px;border-radius:16px;"></div>`;
    const data = await API.get('/api/transactions').catch(() => ({ transactions: [] }));
    this.cache = data.transactions || [];
    container.innerHTML = '';
    container.appendChild(this._header());
    container.appendChild(this._filterBar());
    this.tableContainer = el('div', { class: 'card' });
    container.appendChild(this.tableContainer);
    this._renderTable();
  },

  _header() {
    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;' });
    head.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0;font-size:1.4rem;' }, 'Transactions'));
    const btnGroup = el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;' });

    const addBtn = el('button', { class: 'btn btn-primary' }, '+ Add transaction');
    addBtn.onclick = () => this._openModal();
    btnGroup.appendChild(addBtn);

    const uploadBtn = el('button', { class: 'btn btn-secondary' }, '📤 Upload Credit/Debit Statement');
    uploadBtn.onclick = () => this._openUploadModal();
    btnGroup.appendChild(uploadBtn);

    head.appendChild(btnGroup);
    return head;
  },

  _filterBar() {
    const bar = el('div', { class: 'card', style: 'display:flex;gap:12px;flex-wrap:wrap;align-items:end;' });

    const searchField = el('div', { class: 'field', style: 'flex:2;min-width:180px;margin-bottom:0;' });
    const searchInput = el('input', { type: 'text', placeholder: 'Search notes…' });
    searchInput.addEventListener('input', debounce(() => { this.filters.search = searchInput.value; this._renderTable(); }, 250));
    searchField.appendChild(el('label', {}, 'Search'));
    searchField.appendChild(searchInput);

    const typeField = this._selectField('Type', [['all', 'All'], ['income', 'Income'], ['expense', 'Expense']], this.filters.type, v => { this.filters.type = v; this._renderTable(); });
    const catField = this._selectField('Category', [['all', 'All'], ...CATEGORIES.map(c => [c, c])], this.filters.category, v => { this.filters.category = v; this._renderTable(); });

    const fromField = el('div', { class: 'field', style: 'margin-bottom:0;' });
    const fromInput = el('input', { type: 'date' });
    fromInput.addEventListener('change', () => { this.filters.from = fromInput.value; this._renderTable(); });
    fromField.appendChild(el('label', {}, 'From'));
    fromField.appendChild(fromInput);

    const toField = el('div', { class: 'field', style: 'margin-bottom:0;' });
    const toInput = el('input', { type: 'date' });
    toInput.addEventListener('change', () => { this.filters.to = toInput.value; this._renderTable(); });
    toField.appendChild(el('label', {}, 'To'));
    toField.appendChild(toInput);

    bar.appendChild(searchField);
    bar.appendChild(typeField);
    bar.appendChild(catField);
    bar.appendChild(fromField);
    bar.appendChild(toField);
    return bar;
  },

  _selectField(label, options, value, onChange) {
    const field = el('div', { class: 'field', style: 'margin-bottom:0;min-width:140px;' });
    const select = el('select');
    options.forEach(([v, l]) => {
      const opt = el('option', { value: v }, l);
      if (v === value) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => onChange(select.value));
    field.appendChild(el('label', {}, label));
    field.appendChild(select);
    return field;
  },

  _filtered() {
    return this.cache.filter(t => {
      if (this.filters.type !== 'all' && t.type !== this.filters.type) return false;
      if (this.filters.category !== 'all' && t.category !== this.filters.category) return false;
      if (this.filters.from && t.txn_date < this.filters.from) return false;
      if (this.filters.to && t.txn_date > this.filters.to) return false;
      if (this.filters.search && !(t.note || '').toLowerCase().includes(this.filters.search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => (b.txn_date + b.id).localeCompare(a.txn_date + a.id));
  },

  _renderTable() {
    const rows = this._filtered();
    this.tableContainer.innerHTML = '';
    if (!rows.length) {
      this.tableContainer.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No transactions match your filters.')]));
      return;
    }
    const tableWrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'data-table' });
    table.innerHTML = `<thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Note</th><th>Amount</th><th>Recurring</th><th></th></tr></thead>`;
    const tbody = el('tbody');
    rows.forEach(t => {
      const tr = el('tr');
      tr.innerHTML = `
        <td>${fmtDateShort(t.txn_date)}</td>
        <td><span class="pill ${t.type === 'income' ? 'pill-income' : 'pill-expense'}">${t.type}</span></td>
        <td><span class="pill pill-cat">${categoryIcon(t.category)} ${t.category}</span></td>
        <td style="color:var(--text-dim);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(t.note || '—')}</td>
        <td class="${t.type === 'income' ? 'amount-pos' : 'amount-neg'}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</td>
        <td style="color:var(--text-faint);font-size:0.8rem;">${t.recurring !== 'none' ? t.recurring : '—'}</td>
      `;
      const actionsTd = el('td');
      const actions = el('div', { class: 'row-actions' });
      const editBtn = el('button', { title: 'Edit' }, '✎');
      editBtn.onclick = () => this._openModal(t);
      const delBtn = el('button', { title: 'Delete' }, '🗑');
      delBtn.onclick = () => this._deleteTxn(t.id);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      actionsTd.appendChild(actions);
      tr.appendChild(actionsTd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    this.tableContainer.appendChild(tableWrap);
  },

  async _deleteTxn(id) {
    if (!confirm('Delete this transaction?')) return;
    try {
      await API.del(`/api/transactions/${id}`);
      this.cache = this.cache.filter(t => t.id !== id);
      this._renderTable();
      showToast('Transaction deleted.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    }
  },

  _openModal(existing) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });

    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, existing ? 'Edit transaction' : 'Add transaction'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const typeSelect = el('select');
    ['expense', 'income'].forEach(v => {
      const opt = el('option', { value: v }, v[0].toUpperCase() + v.slice(1));
      if (existing && existing.type === v) opt.selected = true;
      typeSelect.appendChild(opt);
    });

    const catSelect = el('select');
    CATEGORIES.forEach(c => {
      const opt = el('option', { value: c }, c);
      if (existing && existing.category === c) opt.selected = true;
      catSelect.appendChild(opt);
    });

    const amountInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00', value: existing ? existing.amount : '' });
    const dateInput = el('input', { type: 'date', value: existing ? existing.txn_date : todayISO() });
    const noteInput = el('input', { type: 'text', placeholder: 'Optional note', value: existing ? (existing.note || '') : '' });

    const recurringSelect = el('select');
    [['none', 'One-time'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']].forEach(([v, l]) => {
      const opt = el('option', { value: v }, l);
      if (existing && existing.recurring === v) opt.selected = true;
      recurringSelect.appendChild(opt);
    });

    const errorBox = el('div');

    box.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Type'), typeSelect]),
      el('div', { class: 'field' }, [el('label', {}, 'Category'), catSelect]),
    ]));
    box.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Amount'), amountInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Date'), dateInput]),
    ]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Note'), noteInput]));
    box.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Recurring'), recurringSelect]));
    box.appendChild(errorBox);

    const saveBtn = el('button', { class: 'btn btn-primary btn-block' }, existing ? 'Save changes' : 'Add transaction');
    saveBtn.addEventListener('click', async () => {
      const payload = {
        type: typeSelect.value, category: catSelect.value, amount: parseFloat(amountInput.value),
        date: dateInput.value, note: noteInput.value, recurring: recurringSelect.value
      };
      saveBtn.disabled = true;
      try {
        if (existing) {
          await API.put(`/api/transactions/${existing.id}`, payload);
          showToast('Transaction updated.', 'success');
        } else {
          await API.post('/api/transactions', payload);
          showToast('Transaction added.', 'success');
        }
        close();
        this.render(document.getElementById('viewContainer'));
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

    function close() {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 220);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  },

  _openUploadModal() {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });

    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'Upload Credit/Debit Statement'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const info = el('div', { style: 'color:var(--text-dim);font-size:0.9rem;margin-bottom:16px;' });
    info.appendChild(el('p', {}, 'Supported formats: TXT, PDF, PNG, JPEG'));
    info.appendChild(el('p', {}, 'The AI will analyze and categorize transactions automatically.'));
    box.appendChild(info);

    const fileInput = el('input', { type: 'file', accept: '.txt,.pdf,.png,.jpg,.jpeg' });
    const fileField = el('div', { class: 'field' });
    fileField.appendChild(el('label', {}, 'Select file'));
    fileField.appendChild(fileInput);
    box.appendChild(fileField);

    const errorBox = el('div');
    const progressBox = el('div', { style: 'display:none;' });
    const previewBox = el('div', { style: 'margin-top:16px;' });

    box.appendChild(errorBox);
    box.appendChild(progressBox);
    box.appendChild(previewBox);

    const uploadBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Upload & Analyze');
    uploadBtn.addEventListener('click', async () => {
      errorBox.innerHTML = '';
      previewBox.innerHTML = '';
      if (!fileInput.files.length) {
        errorBox.appendChild(el('div', { class: 'auth-alert' }, 'Please select a file.'));
        return;
      }

      uploadBtn.disabled = true;
      progressBox.style.display = '';
      progressBox.innerHTML = '<div class="skeleton" style="height:60px;border-radius:8px;"></div>';

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);

      try {
        const response = await fetch('/api/statements/upload', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Upload failed');
        }

        const result = await response.json();
        progressBox.innerHTML = '';

        if (!result.ok) {
          throw new Error(result.error);
        }

        const txns = result.transactions || [];
        if (!txns.length) {
          throw new Error('No transactions found in the file.');
        }

        // Show preview
        previewBox.innerHTML = '';
        previewBox.appendChild(el('h4', { style: 'margin-top:16px;margin-bottom:12px;font-size:1rem;' }, `✓ Found ${txns.length} transactions`));

        const tableWrap = el('div', { class: 'table-wrap', style: 'margin-bottom:16px;' });
        const table = el('table', { class: 'data-table', style: 'font-size:0.85rem;width:100%;' });

        const thead = el('thead');
        const headerRow = el('tr');
        ['Date', 'Description', 'Category', 'Amount'].forEach(h => {
          headerRow.appendChild(el('th', {}, h));
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = el('tbody');
        txns.slice(0, 5).forEach(t => {
          const tr = el('tr');
          const dateCell = el('td', {}, t.date);
          const descCell = el('td', { style: 'max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, escapeHtml(t.description));
          const catCell = el('td', {});
          const catPill = el('span', { class: 'pill pill-cat' });
          catPill.appendChild(document.createTextNode(categoryIcon(t.category) + ' ' + t.category));
          catCell.appendChild(catPill);
          const amtCell = el('td', { style: 'text-align:right;' }, fmtMoney(t.amount));

          tr.appendChild(dateCell);
          tr.appendChild(descCell);
          tr.appendChild(catCell);
          tr.appendChild(amtCell);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        tableWrap.appendChild(table);
        previewBox.appendChild(tableWrap);

        if (txns.length > 5) {
          previewBox.appendChild(el('p', { style: 'color:var(--text-dim);font-size:0.8rem;margin-top:8px;margin-bottom:16px;' }, `... and ${txns.length - 5} more`));
        }

        // Import button
        const importBtn = el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:16px;' }, '✓ Import transactions');
        importBtn.addEventListener('click', async () => {
          importBtn.disabled = true;
          try {
            await API.post('/api/statements/import', { transactions: txns });
            showToast(`${txns.length} transactions imported successfully!`, 'success');
            close();
            this.render(document.getElementById('viewContainer'));
          } catch (e) {
            errorBox.innerHTML = '';
            errorBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
          } finally {
            importBtn.disabled = false;
          }
        });
        previewBox.appendChild(importBtn);

      } catch (e) {
        progressBox.style.display = 'none';
        errorBox.innerHTML = '';
        errorBox.appendChild(el('div', { class: 'auth-alert' }, e.message));
      } finally {
        uploadBtn.disabled = false;
      }
    });
    box.appendChild(uploadBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    function close() {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 220);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }
};

const CATEGORIES = ["Food", "Shopping", "Bills", "Transportation", "Entertainment", "Healthcare", "Education", "Salary", "Investments", "Other"];
