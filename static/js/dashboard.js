/* Dashboard view: stats, cash flow ticker, charts, recent transactions, AI panel */

const Dashboard = {
  charts: {},

  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:400px;border-radius:16px;"></div>`;

    const [txnsRes, budgetProgressRes, insightsRes, goalsRes] = await Promise.all([
      API.get('/api/transactions').catch(() => ({ transactions: [] })),
      API.get('/api/budgets/progress').catch(() => ({ progress: [] })),
      API.get('/api/ai/insights').catch(() => null),
      API.get('/api/goals').catch(() => ({ goals: [] })),
    ]);

    const txns = txnsRes.transactions || [];
    const income = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;
    const netFlow = income - expense;

    const now = new Date();
    const monthTxns = txns.filter(t => {
      const d = new Date(t.txn_date + 'T00:00:00');
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthIncome = monthTxns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const monthExpense = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

    const budgetTotal = (budgetProgressRes.progress || []).reduce((s, b) => s + b.limit, 0);
    const budgetSpent = (budgetProgressRes.progress || []).reduce((s, b) => s + b.spent, 0);
    const budgetRemaining = budgetTotal - budgetSpent;

    container.innerHTML = '';
    container.appendChild(this._tickerBar(txns));
    container.appendChild(this._statGrid({ balance, monthIncome, monthExpense, netFlow, budgetRemaining, savings: Math.max(0, balance) }));

    const grid = el('div', { class: 'grid-2' });
    const leftCol = el('div');
    const rightCol = el('div');

    leftCol.appendChild(this._chartCard(txns));
    leftCol.appendChild(this._recentTransactionsCard(txns));

    rightCol.appendChild(this._healthScoreCard(insightsRes));
    rightCol.appendChild(this._tipsCard(insightsRes));
    rightCol.appendChild(this._goalsSummaryCard(goalsRes.goals || []));

    grid.appendChild(leftCol);
    grid.appendChild(rightCol);
    container.appendChild(grid);
  },

  _tickerBar(txns) {
    const recent = [...txns].sort((a, b) => b.id - a.id).slice(0, 12);
    const wrap = el('div', { class: 'cashflow-ticker' });
    const track = el('div', { class: 'cashflow-ticker-track' });
    const itemsHtml = recent.map(t => {
      const cls = t.type === 'income' ? 'pos' : 'neg';
      const sign = t.type === 'income' ? '+' : '-';
      return `<span class="cf-item ${cls}">${categoryIcon(t.category)} ${t.category} <strong>${sign}${fmtMoney(t.amount)}</strong></span>`;
    }).join('') || '<span class="cf-item">Add your first transaction to see it here.</span>';
    track.innerHTML = itemsHtml + itemsHtml;
    wrap.appendChild(track);
    return wrap;
  },

  _statGrid({ balance, monthIncome, monthExpense, netFlow, budgetRemaining, savings }) {
    const grid = el('div', { class: 'stat-grid' });
    const stats = [
      { label: 'Total Balance', value: balance, positive: balance >= 0 },
      { label: 'Monthly Income', value: monthIncome, positive: true, forceColor: 'var(--signal-green)' },
      { label: 'Monthly Expenses', value: monthExpense, positive: false, forceColor: 'var(--loss-red)' },
      { label: 'Net Cash Flow', value: netFlow, positive: netFlow >= 0 },
      { label: 'Budget Remaining', value: budgetRemaining, positive: budgetRemaining >= 0 },
      { label: 'Savings', value: savings, positive: true, forceColor: 'var(--signal-green)' },
    ];
    stats.forEach(s => {
      const color = s.forceColor || (s.positive ? 'var(--signal-green)' : 'var(--loss-red)');
      grid.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'label' }, s.label),
        el('div', { class: 'value mono', style: `color:${color}` }, fmtMoney(s.value)),
      ]));
    });
    return grid;
  },

  _chartCard(txns) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Income vs. Expenses'),
      el('span', { class: 'sub' }, 'Last 6 months')
    ]));
    const canvasWrap = el('div', { style: 'height:260px;' });
    const canvas = el('canvas');
    canvasWrap.appendChild(canvas);
    card.appendChild(canvasWrap);

    setTimeout(() => this._drawIncomeExpenseChart(canvas, txns), 0);
    return card;
  },

  _drawIncomeExpenseChart(canvas, txns) {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString(undefined, { month: 'short' }) });
    }
    const incomeData = months.map(m => txns.filter(t => t.type === 'income' && t.txn_date.startsWith(m.key)).reduce((s, t) => s + t.amount, 0));
    const expenseData = months.map(m => txns.filter(t => t.type === 'expense' && t.txn_date.startsWith(m.key)).reduce((s, t) => s + t.amount, 0));

    if (this.charts.main) this.charts.main.destroy();
    const style = getComputedStyle(document.body);
    this.charts.main = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          { label: 'Income', data: incomeData, backgroundColor: '#00D67E', borderRadius: 6, maxBarThickness: 28 },
          { label: 'Expenses', data: expenseData, backgroundColor: '#FF5C5C', borderRadius: 6, maxBarThickness: 28 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: style.getPropertyValue('--text-dim') } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: style.getPropertyValue('--text-dim') } },
          y: { grid: { color: style.getPropertyValue('--panel-border') }, ticks: { color: style.getPropertyValue('--text-dim') } }
        }
      }
    });
  },

  _recentTransactionsCard(txns) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Recent Transactions'),
      (() => { const b = el('button', { class: 'btn btn-ghost btn-sm' }, 'View all'); b.onclick = () => App.navigate('transactions'); return b; })()
    ]));
    const recent = [...txns].sort((a, b) => (b.txn_date + b.id).localeCompare(a.txn_date + a.id)).slice(0, 6);
    if (!recent.length) {
      card.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No transactions yet. Add your first one to get started.')]));
      return card;
    }
    const tableWrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'data-table' });
    table.innerHTML = `<thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th></tr></thead>`;
    const tbody = el('tbody');
    recent.forEach(t => {
      const tr = el('tr');
      tr.innerHTML = `
        <td>${fmtDateShort(t.txn_date)}</td>
        <td><span class="pill pill-cat">${categoryIcon(t.category)} ${t.category}</span></td>
        <td style="color:var(--text-dim)">${escapeHtml(t.note || '—')}</td>
        <td class="${t.type === 'income' ? 'amount-pos' : 'amount-neg'}">${t.type === 'income' ? '+' : '-'}${fmtMoney(t.amount)}</td>`;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    card.appendChild(tableWrap);
    return card;
  },

  _healthScoreCard(insights) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Financial Health Score')]));
    if (!insights) {
      card.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'Add transactions to calculate your score.')]));
      return card;
    }
    const hs = insights.health_score;
    const ringWrap = el('div');
    ringWrap.innerHTML = AIView.renderHealthRing(hs.score);
    card.appendChild(ringWrap);
    card.appendChild(el('div', { style: 'text-align:center;margin-top:8px;font-weight:600;', }, hs.label));
    return card;
  },

  _tipsCard(insights) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'AI Assistant'),
      el('span', { class: 'sub' }, 'Local · rule-based')
    ]));
    const body = el('div');
    body.innerHTML = insights ? AIView.renderTips(insights.tips) : AIView.renderTips([]);
    card.appendChild(body);
    return card;
  },

  _goalsSummaryCard(goals) {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Savings Goals'),
      (() => { const b = el('button', { class: 'btn btn-ghost btn-sm' }, 'Manage'); b.onclick = () => App.navigate('goals'); return b; })()
    ]));
    if (!goals.length) {
      card.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'No goals yet. Create one to start tracking progress.')]));
      return card;
    }
    goals.slice(0, 3).forEach(g => {
      const pct = Math.min(100, (g.current_amount / g.target_amount) * 100);
      const item = el('div', { style: 'margin-bottom:14px;' });
      item.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:0.88rem;margin-bottom:4px;">
          <span>${escapeHtml(g.name)}</span><span class="mono" style="color:var(--text-dim)">${Math.round(pct)}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>`;
      card.appendChild(item);
    });
    return card;
  }
};
