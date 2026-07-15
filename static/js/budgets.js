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
    const btnGroup = el('div', { style: 'display:flex;gap:12px;flex-wrap:wrap;' });

    const addBtn = el('button', { class: 'btn btn-primary' }, '+ New budget');
    addBtn.onclick = () => this._openModal(container);
    btnGroup.appendChild(addBtn);

    const uploadBtn = el('button', { class: 'btn btn-secondary' }, '📤 Upload Credit/Debit Statement');
    uploadBtn.onclick = () => this._openUploadWithGoalModal(container);
    btnGroup.appendChild(uploadBtn);

    head.appendChild(btnGroup);
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

    // Budget Chart section
    const chartSection = el('div', { class: 'card', style: 'margin-top:24px;' });
    chartSection.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Budget Chart'),
      (() => {
        const btn = el('button', { class: 'btn btn-ghost btn-sm' }, '⚙ Customize');
        btn.onclick = () => this._openChartCustomizer(container);
        return btn;
      })()
    ]));

    const txnsRes = await API.get('/api/transactions').catch(() => ({ transactions: [] }));
    const txns = txnsRes.transactions || [];
    const expenses = txns.filter(t => t.type === 'expense');

    if (!expenses.length) {
      chartSection.appendChild(el('div', { class: 'empty-state' }, [
        el('p', {}, 'No expenses recorded. Upload a statement or add expenses to see your budget chart.')
      ]));
    } else {
      // Group expenses by category
      const categoryTotals = {};
      expenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });

      const chartContainer = el('div', { style: 'position:relative;height:300px;margin:16px 0;' });
      chartSection.appendChild(chartContainer);

      // Create pie chart using Chart.js
      const ctx = el('canvas');
      chartContainer.appendChild(ctx);

      setTimeout(() => {
        const labels = Object.keys(categoryTotals);
        const data = Object.values(categoryTotals);
        const colors = [
          '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
          '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B88B', '#A2D5C6'
        ];

        new Chart(ctx, {
          type: 'pie',
          data: {
            labels: labels,
            datasets: [{
              data: data,
              backgroundColor: colors.slice(0, labels.length),
              borderColor: 'var(--surface-alt)',
              borderWidth: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: {
                  color: 'var(--text-dim)',
                  font: { size: 12 }
                }
              },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    const label = context.label || '';
                    const value = fmtMoney(context.parsed);
                    const total = context.dataset.data.reduce((a, b) => a + b, 0);
                    const pct = ((context.parsed / total) * 100).toFixed(1);
                    return `${label}: ${value} (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }, 0);
    }

    container.appendChild(chartSection);
  },

  async _openChartCustomizer(container) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });

    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'Customize Chart Labels'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const info = el('div', { style: 'color:var(--text-dim);font-size:0.9rem;margin-bottom:16px;' });
    info.appendChild(el('p', {}, 'Rename expense categories for your chart.'));
    box.appendChild(info);

    const fieldsContainer = el('div');
    const txnsRes = await API.get('/api/transactions').catch(() => ({ transactions: [] }));
    const txns = txnsRes.transactions || [];
    const expenses = txns.filter(t => t.type === 'expense');

    if (expenses.length > 0) {
      const categoryTotals = {};
      expenses.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
      });

      const labels = Object.keys(categoryTotals);
      const customLabels = JSON.parse(localStorage.getItem('budgetChartLabels') || '{}');

      labels.forEach(cat => {
        const field = el('div', { class: 'field', style: 'margin-bottom:12px;' });
        const label = el('label', {}, `${cat} (${fmtMoney(categoryTotals[cat])})`);
        const input = el('input', { type: 'text', value: customLabels[cat] || cat });
        field.appendChild(label);
        field.appendChild(input);
        input.dataset.category = cat;
        fieldsContainer.appendChild(field);
      });
    }

    box.appendChild(fieldsContainer);

    const saveBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Save labels');
    saveBtn.addEventListener('click', () => {
      const customLabels = {};
      fieldsContainer.querySelectorAll('input').forEach(input => {
        if (input.dataset.category) {
          customLabels[input.dataset.category] = input.value;
        }
      });
      localStorage.setItem('budgetChartLabels', JSON.stringify(customLabels));
      showToast('Chart labels saved.', 'success');
      close();
      this.render(container);
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

  _openUploadWithGoalModal(container) {
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' });

    box.appendChild(el('div', { class: 'modal-head' }, [
      el('h3', {}, 'Upload Statement & Set Budget Goal'),
      (() => { const b = el('button', { class: 'modal-close' }, '✕'); b.onclick = () => close(); return b; })()
    ]));

    const info = el('div', { style: 'color:var(--text-dim);font-size:0.9rem;margin-bottom:16px;' });
    info.appendChild(el('p', {}, 'Upload your statement and set a monthly spending goal.'));
    box.appendChild(info);

    const fileInput = el('input', { type: 'file', accept: '.txt,.pdf,.png,.jpg,.jpeg' });
    const fileField = el('div', { class: 'field' });
    fileField.appendChild(el('label', {}, 'Select statement file'));
    fileField.appendChild(fileInput);
    box.appendChild(fileField);

    const goalInput = el('input', { type: 'number', step: '0.01', min: '0', placeholder: '0.00' });
    const goalField = el('div', { class: 'field' });
    goalField.appendChild(el('label', {}, 'Monthly spending goal'));
    goalField.appendChild(goalInput);
    box.appendChild(goalField);

    const errorBox = el('div');
    const progressBox = el('div', { style: 'display:none;' });
    box.appendChild(errorBox);
    box.appendChild(progressBox);

    const uploadBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Upload & Generate Chart');
    uploadBtn.addEventListener('click', async () => {
      errorBox.innerHTML = '';
      if (!fileInput.files.length) {
        errorBox.appendChild(el('div', { class: 'auth-alert' }, 'Please select a file.'));
        return;
      }
      if (!goalInput.value || parseFloat(goalInput.value) <= 0) {
        errorBox.appendChild(el('div', { class: 'auth-alert' }, 'Please enter a valid monthly spending goal.'));
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
        if (!result.ok) throw new Error(result.error);

        const txns = result.transactions || [];
        if (!txns.length) throw new Error('No transactions found in the file.');

        // Import transactions
        await API.post('/api/statements/import', { transactions: txns });

        // Create monthly budget based on goal
        const monthlyGoal = parseFloat(goalInput.value);
        await API.post('/api/budgets', {
          category: 'Shopping',
          period: 'monthly',
          limit: monthlyGoal
        });

        showToast(`${txns.length} transactions imported and budget created!`, 'success');
        close();
        this.render(container);
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
