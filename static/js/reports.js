/* Reports view: weekly/monthly/yearly trends, category breakdown, exports */

const Reports = {
  period: 'monthly',
  charts: {},

  async render(container) {
    container.innerHTML = `<div class="skeleton" style="height:400px;border-radius:16px;"></div>`;
    const data = await API.get(`/api/reports/${this.period}`).catch(() => null);
    container.innerHTML = '';

    const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:12px;' });
    head.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0;font-size:1.4rem;' }, 'Reports'));

    const actions = el('div', { style: 'display:flex;gap:10px;align-items:center;' });
    const tabs = el('div', { class: 'tabs' });
    ['weekly', 'monthly', 'yearly'].forEach(p => {
      const btn = el('button', { class: `tab-btn ${p === this.period ? 'active' : ''}` }, p[0].toUpperCase() + p.slice(1));
      btn.onclick = () => { this.period = p; this.render(container); };
      tabs.appendChild(btn);
    });
    actions.appendChild(tabs);

    const csvBtn = el('a', { class: 'btn btn-ghost btn-sm', href: `/api/reports/${this.period}/export.csv` }, 'Export CSV');
    const pdfBtn = el('button', { class: 'btn btn-ghost btn-sm' }, 'Export PDF');
    pdfBtn.onclick = () => window.print();
    actions.appendChild(csvBtn);
    actions.appendChild(pdfBtn);
    head.appendChild(actions);
    container.appendChild(head);

    if (!data) {
      container.appendChild(el('div', { class: 'card' }, [el('div', { class: 'empty-state' }, [el('p', {}, 'No data available for this report.')])]));
      return;
    }

    const statGrid = el('div', { class: 'stat-grid' });
    statGrid.appendChild(this._stat('Income', data.income_total, 'var(--signal-green)'));
    statGrid.appendChild(this._stat('Expenses', data.expense_total, 'var(--loss-red)'));
    statGrid.appendChild(this._stat('Net', data.net, data.net >= 0 ? 'var(--signal-green)' : 'var(--loss-red)'));
    statGrid.appendChild(this._stat('Transactions', data.transaction_count, 'var(--info-blue)', false));
    container.appendChild(statGrid);

    const grid = el('div', { class: 'grid-2' });

    const trendCard = el('div', { class: 'card' });
    trendCard.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Spending Trend')]));
    const trendCanvasWrap = el('div', { style: 'height:240px;' });
    const trendCanvas = el('canvas');
    trendCanvasWrap.appendChild(trendCanvas);
    trendCard.appendChild(trendCanvasWrap);
    grid.appendChild(trendCard);

    const catCard = el('div', { class: 'card' });
    catCard.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Category Breakdown')]));
    const catCanvasWrap = el('div', { style: 'height:240px;' });
    const catCanvas = el('canvas');
    catCanvasWrap.appendChild(catCanvas);
    catCard.appendChild(catCanvasWrap);
    grid.appendChild(catCard);

    container.appendChild(grid);

    const savingsCard = el('div', { class: 'card' });
    savingsCard.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Savings Growth')]));
    if (!data.savings_growth.length) {
      savingsCard.appendChild(el('div', { class: 'empty-state' }, [el('p', {}, 'Not enough data for this period.')]));
    } else {
      data.savings_growth.forEach(s => {
        savingsCard.appendChild(el('div', { style: 'display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--panel-border);font-size:0.85rem;' }, [
          el('span', { style: 'color:var(--text-dim)' }, s.period),
          el('span', { class: 'mono', style: `color:${s.cumulative_savings >= 0 ? 'var(--signal-green)' : 'var(--loss-red)'}` }, fmtMoney(s.cumulative_savings))
        ]));
      });
    }
    container.appendChild(savingsCard);

    setTimeout(() => {
      this._drawTrendChart(trendCanvas, data.trend);
      this._drawCategoryChart(catCanvas, data.category_breakdown);
    }, 0);
  },

  _stat(label, value, color, isMoney = true) {
    return el('div', { class: 'stat-card' }, [
      el('div', { class: 'label' }, label),
      el('div', { class: 'value mono', style: `color:${color}` }, isMoney ? fmtMoney(value) : String(value)),
    ]);
  },

  _drawTrendChart(canvas, trend) {
    if (this.charts.trend) this.charts.trend.destroy();
    const style = getComputedStyle(document.body);
    this.charts.trend = new Chart(canvas, {
      type: 'line',
      data: {
        labels: trend.map(t => t.period),
        datasets: [
          { label: 'Income', data: trend.map(t => t.income), borderColor: '#00D67E', backgroundColor: 'rgba(0,214,126,0.1)', tension: 0.35, fill: true },
          { label: 'Expenses', data: trend.map(t => t.expense), borderColor: '#FF5C5C', backgroundColor: 'rgba(255,92,92,0.1)', tension: 0.35, fill: true },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: style.getPropertyValue('--text-dim') } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: style.getPropertyValue('--text-dim'), maxRotation: 0 } },
          y: { grid: { color: style.getPropertyValue('--panel-border') }, ticks: { color: style.getPropertyValue('--text-dim') } }
        }
      }
    });
  },

  _drawCategoryChart(canvas, breakdown) {
    if (this.charts.cat) this.charts.cat.destroy();
    const style = getComputedStyle(document.body);
    const labels = Object.keys(breakdown);
    const values = Object.values(breakdown);
    const colors = ['#00D67E', '#5B8CFF', '#FFB020', '#FF5C5C', '#A78BFA', '#22D3EE', '#F472B6', '#84CC16', '#FB923C', '#94A3B8'];
    this.charts.cat = new Chart(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: style.getPropertyValue('--text-dim'), boxWidth: 12, padding: 12 } } }
      }
    });
  }
};
