/* Client-side helpers that render AI insight data (fetched from the local
   rule-based backend at /api/ai/insights) into readable UI. No external
   AI/LLM calls happen anywhere in this app — this file only formats numbers
   already computed by backend/ai_engine.py. */

const AIView = {
  healthScoreColor(score) {
    if (score >= 80) return 'var(--signal-green)';
    if (score >= 65) return 'var(--info-blue)';
    if (score >= 45) return 'var(--warn-amber)';
    return 'var(--loss-red)';
  },

  renderHealthRing(score) {
    const radius = 60, circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = this.healthScoreColor(score);
    return `
      <div class="health-score-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="var(--panel-border)" stroke-width="10"/>
          <circle cx="70" cy="70" r="${radius}" fill="none" stroke="${color}" stroke-width="10"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"
            style="transition: stroke-dashoffset 800ms cubic-bezier(0.16,1,0.3,1);"/>
        </svg>
        <div class="center-label">
          <div class="num" style="color:${color}">${score}</div>
          <div class="lbl">/ 100</div>
        </div>
      </div>`;
  },

  renderTips(tips) {
    if (!tips || !tips.length) return '<div class="empty-state"><p>No insights yet — add a few transactions to get started.</p></div>';
    return `<div class="tip-list">${tips.map(t => `
      <div class="tip-item">
        <span class="tip-icon">◈</span>
        <span>${escapeHtml(t)}</span>
      </div>`).join('')}</div>`;
  },

  renderAnomalies(anomalies) {
    if (!anomalies || !anomalies.length) {
      return '<div class="empty-state"><p>No unusual transactions detected. Everything looks consistent.</p></div>';
    }
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Date</th><th>Category</th><th>Amount</th><th>Typical</th><th>Severity</th></tr></thead>
      <tbody>${anomalies.map(a => `
        <tr>
          <td>${fmtDateShort(a.date)}</td>
          <td><span class="pill pill-cat">${categoryIcon(a.category)} ${a.category}</span></td>
          <td class="mono amount-neg">${fmtMoney(a.amount)}</td>
          <td class="mono" style="color:var(--text-dim)">${fmtMoney(a.typical_amount)}</td>
          <td><span class="pill ${a.severity === 'high' ? 'pill-expense' : 'pill-cat'}">${a.severity}</span></td>
        </tr>`).join('')}</tbody>
    </table></div>`;
  },

  renderBudgetForecast(forecast) {
    if (!forecast || !forecast.length) {
      return '<div class="empty-state"><p>Set a budget to see whether you\'re on track to stay within it.</p></div>';
    }
    return forecast.map(f => `
      <div class="budget-item">
        <div class="budget-item-head">
          <span>${categoryIcon(f.category)} ${f.category} <span style="color:var(--text-faint)">(${f.period})</span></span>
          <span class="amounts">${fmtMoney(f.spent_so_far)} of ${fmtMoney(f.limit)}</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${f.will_exceed ? 'over' : (f.spent_so_far / f.limit > 0.8 ? 'warn' : '')}"
               style="width:${Math.min(100, (f.spent_so_far / f.limit) * 100)}%"></div>
        </div>
        <div style="font-size:0.8rem;color:${f.will_exceed ? 'var(--loss-red)' : 'var(--text-dim)'};margin-top:6px;">
          ${f.will_exceed
            ? `Projected to exceed by ${fmtMoney(f.projected_overage)} by period end.`
            : `Projected total: ${fmtMoney(f.projected_total)} — on track.`}
        </div>
      </div>`).join('');
  },

  renderFutureBalance(data) {
    if (!data.projections || !data.projections.length) {
      return '<div class="empty-state"><p>Add more transaction history to project future balance.</p></div>';
    }
    const rows = data.projections.map(p => `
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--panel-border);font-size:0.88rem;">
        <span style="color:var(--text-dim)">${p.month}</span>
        <span class="mono" style="color:${p.projected_balance >= 0 ? 'var(--signal-green)' : 'var(--loss-red)'}">${fmtMoney(p.projected_balance)}</span>
      </div>`).join('');
    return `<div style="margin-bottom:12px;font-size:0.85rem;color:var(--text-dim)">Current balance: <strong class="mono" style="color:var(--text)">${fmtMoney(data.current_balance)}</strong></div>${rows}`;
  }
};
