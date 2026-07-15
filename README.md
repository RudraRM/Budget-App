# BudgetMind AI

A modern, responsive personal budgeting web application. Tracks income, expenses,
budgets, and savings goals, and provides financial insights using a **local,
rule-based analysis engine** — no external AI/LLM API key required, no third-party
AI service calls, no data leaving your server.

## Stack

- **Backend:** Python (Flask) + SQLite
- **Frontend:** Vanilla HTML/CSS/JavaScript (no build step required), Chart.js for charts
- **"AI Assistant":** `backend/ai_engine.py` — pure Python statistics (mean, standard
  deviation, z-scores, weighted composite scoring, linear projection). No API keys,
  no network calls, works fully offline once loaded.

## Features

- Auth: registration, login, PBKDF2-SHA256 password hashing, forgot/reset password flow, "remember me", profile settings
- Dashboard: total balance, monthly income/expenses, savings, net cash flow, budget remaining, financial health score, animated cash-flow ticker, income vs. expense chart, recent transactions
- Transactions: add/edit/delete/search, 10 categories, recurring transactions, filters by date/category/amount/type
- Budgets: daily/weekly/monthly limits, live progress bars, AI overspend forecasting
- Savings goals: multiple goals, progress tracking, projected completion date, suggested monthly contribution
- AI Assistant (rule-based): spending pattern analysis, anomaly/unusual-spending detection (z-score), budget outcome prediction, savings recommendations, emergency fund sizing, future balance projection, personalized tips
- Reports: weekly/monthly/yearly, spending trend charts, category breakdown, income vs. expense, savings growth, CSV export, printable/PDF export (browser print)
- Notifications: budget warnings, bill due-date reminders
- Bonus: multi-currency display, bill calendar/subscription tracker, debt payoff calculator, investment growth estimator, achievement badges
- PWA: installable, offline app-shell caching via service worker, manifest
- Security: PBKDF2 password hashing with per-user salt, input validation, parameterized SQL, security response headers (CSP, X-Frame-Options, etc.), session-based auth

## Running locally

```bash
cd budgetmind
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Then open **http://localhost:5000** in your browser. The landing page is served at
`/` and the app (register/login/dashboard) is at `/app`.

The SQLite database (`budgetmind.db`) is created automatically on first run in the
project directory.

### Environment variables (optional)

- `BUDGETMIND_SECRET` — Flask session secret key. If not set, a random one is
  generated at startup (sessions won't persist across server restarts in that case).

## Project structure

```
budgetmind/
├── app.py                   # Flask app: routes, auth, DB, security headers
├── backend/
│   ├── ai_engine.py          # Rule-based local "AI" financial analysis
│   └── reports.py            # Report aggregation + CSV export
├── templates/
│   ├── landing.html          # SEO-friendly marketing landing page
│   └── app.html              # SPA shell for the dashboard app
├── static/
│   ├── css/                  # tokens.css (design system), landing.css, app.css
│   ├── js/                   # Modular vanilla JS (auth, dashboard, transactions, etc.)
│   ├── manifest.json          # PWA manifest
│   └── sw.js                  # Service worker (offline app-shell caching)
└── requirements.txt
```

## Notes on the "AI Assistant"

Every insight shown in the app — the financial health score, budget forecasts,
anomaly detection, savings recommendations, emergency fund targets, and future
balance projections — is computed by plain Python functions in
`backend/ai_engine.py` operating only on the signed-in user's own transaction
history. There is no call to OpenAI, Anthropic, or any other AI provider, and
no API key is needed to use any feature of this app.
