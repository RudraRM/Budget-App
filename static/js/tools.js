/* Bonus tools: debt payoff calculator, investment growth estimator, achievements */

const Tools = {
  async render(container) {
    container.innerHTML = '';
    container.appendChild(el('h2', { style: 'font-family:var(--font-display);margin:0 0 16px;font-size:1.4rem;' }, 'Financial Calculators'));

    const grid = el('div', { class: 'grid-2' });
    grid.appendChild(this._debtPayoffCard());
    grid.appendChild(this._investmentCard());
    container.appendChild(grid);

    container.appendChild(await this._achievementsCard());
  },

  _debtPayoffCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Debt Payoff Calculator')]));

    const balanceInput = el('input', { type: 'number', step: '0.01', placeholder: '5000' });
    const rateInput = el('input', { type: 'number', step: '0.01', placeholder: '18.99' });
    const paymentInput = el('input', { type: 'number', step: '0.01', placeholder: '250' });
    const resultBox = el('div', { style: 'margin-top:12px;' });

    card.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Balance owed'), balanceInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Annual interest rate (%)'), rateInput]),
    ]));
    card.appendChild(el('div', { class: 'field' }, [el('label', {}, 'Monthly payment'), paymentInput]));

    const calcBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Calculate payoff time');
    calcBtn.onclick = () => {
      const balance = parseFloat(balanceInput.value);
      const annualRate = parseFloat(rateInput.value);
      const payment = parseFloat(paymentInput.value);
      resultBox.innerHTML = '';

      if (!balance || !payment || isNaN(annualRate)) {
        resultBox.appendChild(el('div', { class: 'auth-alert' }, 'Please fill in all three fields.'));
        return;
      }
      const monthlyRate = annualRate / 100 / 12;
      const minPayment = balance * monthlyRate;
      if (monthlyRate > 0 && payment <= minPayment) {
        resultBox.appendChild(el('div', { class: 'auth-alert' }, `This payment won't cover monthly interest (${fmtMoney(minPayment)}). Increase your payment.`));
        return;
      }

      let months = 0, remaining = balance, totalInterest = 0;
      while (remaining > 0 && months < 1200) {
        const interest = remaining * monthlyRate;
        totalInterest += interest;
        remaining = remaining + interest - payment;
        months++;
      }
      const years = Math.floor(months / 12);
      const remMonths = months % 12;

      resultBox.appendChild(el('div', { class: 'tip-item' }, [
        el('span', { class: 'tip-icon' }, '◈'),
        el('span', {}, `Paid off in ${years > 0 ? years + ' yr ' : ''}${remMonths} mo. Total interest paid: ${fmtMoney(totalInterest)}.`)
      ]));
    };
    card.appendChild(calcBtn);
    card.appendChild(resultBox);
    return card;
  },

  _investmentCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [el('h3', {}, 'Investment Growth Estimator')]));

    const principalInput = el('input', { type: 'number', step: '0.01', placeholder: '1000' });
    const monthlyInput = el('input', { type: 'number', step: '0.01', placeholder: '200' });
    const rateInput = el('input', { type: 'number', step: '0.01', placeholder: '7' });
    const yearsInput = el('input', { type: 'number', step: '1', placeholder: '10' });
    const resultBox = el('div', { style: 'margin-top:12px;' });

    card.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Starting amount'), principalInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Monthly contribution'), monthlyInput]),
    ]));
    card.appendChild(el('div', { class: 'field-row' }, [
      el('div', { class: 'field' }, [el('label', {}, 'Est. annual return (%)'), rateInput]),
      el('div', { class: 'field' }, [el('label', {}, 'Years'), yearsInput]),
    ]));

    const calcBtn = el('button', { class: 'btn btn-primary btn-block' }, 'Estimate growth');
    calcBtn.onclick = () => {
      const principal = parseFloat(principalInput.value) || 0;
      const monthly = parseFloat(monthlyInput.value) || 0;
      const annualRate = parseFloat(rateInput.value);
      const years = parseInt(yearsInput.value, 10);
      resultBox.innerHTML = '';

      if (isNaN(annualRate) || !years) {
        resultBox.appendChild(el('div', { class: 'auth-alert' }, 'Please fill in the rate and number of years.'));
        return;
      }
      const monthlyRate = annualRate / 100 / 12;
      const totalMonths = years * 12;
      let balance = principal;
      let totalContributed = principal;
      for (let i = 0; i < totalMonths; i++) {
        balance = balance * (1 + monthlyRate) + monthly;
        totalContributed += monthly;
      }
      const growth = balance - totalContributed;

      resultBox.appendChild(el('div', { class: 'tip-item' }, [
        el('span', { class: 'tip-icon' }, '◈'),
        el('span', {}, `Projected value after ${years} years: ${fmtMoney(balance)} (${fmtMoney(totalContributed)} contributed, ${fmtMoney(growth)} in growth).`)
      ]));
    };
    card.appendChild(calcBtn);
    card.appendChild(resultBox);
    return card;
  },

  async _achievementsCard() {
    const card = el('div', { class: 'card' });
    card.appendChild(el('div', { class: 'card-head' }, [
      el('h3', {}, 'Achievements & Streaks'),
      el('span', { class: 'sub' }, 'Earned from your activity')
    ]));

    const [txnsRes, goalsRes, budgetsRes] = await Promise.all([
      API.get('/api/transactions').catch(() => ({ transactions: [] })),
      API.get('/api/goals').catch(() => ({ goals: [] })),
      API.get('/api/budgets').catch(() => ({ budgets: [] })),
    ]);
    const txns = txnsRes.transactions || [];
    const goals = goalsRes.goals || [];
    const budgets = budgetsRes.budgets || [];

    const badges = [
      { name: 'First entry', icon: '🌱', earned: txns.length >= 1 },
      { name: '10 logged', icon: '📊', earned: txns.length >= 10 },
      { name: '50 logged', icon: '🏆', earned: txns.length >= 50 },
      { name: 'Budget set', icon: '🎯', earned: budgets.length >= 1 },
      { name: 'Goal creator', icon: '🏦', earned: goals.length >= 1 },
      { name: 'Goal complete', icon: '⭐', earned: goals.some(g => g.current_amount >= g.target_amount) },
    ];

    const grid = el('div', { class: 'badge-grid' });
    badges.forEach(b => {
      grid.appendChild(el('div', { class: `badge-item ${b.earned ? 'earned' : ''}` }, [
        el('div', { class: 'icon' }, b.icon),
        el('div', { class: 'name' }, b.name)
      ]));
    });
    card.appendChild(grid);
    return card;
  }
};
