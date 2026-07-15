"""
BudgetMind AI - Local Rule-Based Financial Intelligence Engine
================================================================
Every function here uses plain arithmetic, statistics, and heuristic rules
derived from the user's own transaction history. No external AI/LLM API is
called or required. This is intentional: the "AI Assistant" experience works
completely offline/locally.
"""

from datetime import datetime, timedelta, date
from statistics import mean, pstdev
from collections import defaultdict


def _parse_date(d):
    return datetime.fromisoformat(d).date() if isinstance(d, str) else d


def _last_n_days(txns, n):
    cutoff = date.today() - timedelta(days=n)
    return [t for t in txns if _parse_date(t["txn_date"]) >= cutoff]


def _monthly_totals(txns, months=6):
    """Group income/expense totals by calendar month for the last N months."""
    totals = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    cutoff = date.today() - timedelta(days=months * 30)
    for t in txns:
        d = _parse_date(t["txn_date"])
        if d < cutoff:
            continue
        key = f"{d.year}-{d.month:02d}"
        totals[key][t["type"]] += t["amount"]
    return dict(sorted(totals.items()))


def analyze_spending(txns):
    """Break down spending by category, trend direction, and top categories."""
    if not txns:
        return {"by_category": {}, "trend": "insufficient_data", "top_categories": [], "average_daily_spend": 0}

    expenses = [t for t in txns if t["type"] == "expense"]
    by_category = defaultdict(float)
    for t in expenses:
        by_category[t["category"]] += t["amount"]

    total_expense = sum(by_category.values())
    top = sorted(by_category.items(), key=lambda x: -x[1])[:5]
    top_categories = [
        {"category": c, "amount": round(a, 2), "percent": round((a / total_expense) * 100, 1) if total_expense else 0}
        for c, a in top
    ]

    # Trend: compare last 30 days spend to the 30 days before that
    recent = sum(t["amount"] for t in _last_n_days(expenses, 30))
    prior_window = [t for t in expenses if
                    date.today() - timedelta(days=60) <= _parse_date(t["txn_date"]) < date.today() - timedelta(days=30)]
    prior = sum(t["amount"] for t in prior_window)

    if prior == 0 and recent == 0:
        trend = "stable"
    elif prior == 0:
        trend = "rising"
    else:
        change_pct = (recent - prior) / prior
        if change_pct > 0.1:
            trend = "rising"
        elif change_pct < -0.1:
            trend = "falling"
        else:
            trend = "stable"

    days_span = max((date.today() - _parse_date(expenses[0]["txn_date"])).days, 1) if expenses else 1
    avg_daily = total_expense / min(days_span, 90) if expenses else 0

    return {
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "trend": trend,
        "top_categories": top_categories,
        "average_daily_spend": round(avg_daily, 2)
    }


def financial_health_score(txns, budgets):
    """
    Composite 0-100 score from five weighted signals:
    - Savings rate (30%)
    - Budget adherence (25%)
    - Spending consistency / volatility (15%)
    - Income stability (15%)
    - Emergency buffer relative to expenses (15%)
    """
    if not txns:
        return {"score": 50, "label": "Not enough data yet", "breakdown": {}}

    income_txns = [t for t in txns if t["type"] == "income"]
    expense_txns = [t for t in txns if t["type"] == "expense"]

    total_income = sum(t["amount"] for t in income_txns) or 0.0001
    total_expense = sum(t["amount"] for t in expense_txns)

    # 1. Savings rate
    savings_rate = max(0, (total_income - total_expense) / total_income)
    savings_score = min(100, savings_rate * 250)  # 40% savings rate -> 100

    # 2. Budget adherence
    if budgets:
        adherence_scores = []
        today = date.today()
        for b in budgets:
            if b["period"] == "monthly":
                start = today.replace(day=1)
            elif b["period"] == "weekly":
                start = today - timedelta(days=today.weekday())
            else:
                start = today
            spent = sum(t["amount"] for t in expense_txns
                        if t["category"] == b["category"] and _parse_date(t["txn_date"]) >= start)
            ratio = spent / b["limit_amount"] if b["limit_amount"] else 1
            adherence_scores.append(max(0, 100 - max(0, ratio - 1) * 200) if ratio <= 1 else max(0, 100 - (ratio - 1) * 200))
        budget_score = mean(adherence_scores) if adherence_scores else 70
    else:
        budget_score = 60  # neutral if no budgets set

    # 3. Spending consistency (lower volatility = better)
    monthly = _monthly_totals(txns, months=4)
    monthly_expenses = [v["expense"] for v in monthly.values() if v["expense"] > 0]
    if len(monthly_expenses) >= 2:
        avg = mean(monthly_expenses)
        volatility = pstdev(monthly_expenses) / avg if avg else 0
        consistency_score = max(0, 100 - volatility * 100)
    else:
        consistency_score = 65

    # 4. Income stability
    monthly_income = [v["income"] for v in monthly.values() if v["income"] > 0]
    if len(monthly_income) >= 2:
        avg_i = mean(monthly_income)
        vol_i = pstdev(monthly_income) / avg_i if avg_i else 0
        income_score = max(0, 100 - vol_i * 100)
    else:
        income_score = 70

    # 5. Emergency buffer (based on current balance vs avg monthly expense)
    balance = total_income - total_expense
    avg_monthly_expense = mean(monthly_expenses) if monthly_expenses else (total_expense or 1)
    months_covered = balance / avg_monthly_expense if avg_monthly_expense else 0
    buffer_score = min(100, max(0, months_covered / 6 * 100))  # 6 months = full score

    weights = {
        "savings_rate": (savings_score, 0.30),
        "budget_adherence": (budget_score, 0.25),
        "spending_consistency": (consistency_score, 0.15),
        "income_stability": (income_score, 0.15),
        "emergency_buffer": (buffer_score, 0.15),
    }
    score = sum(v * w for v, w in weights.values())
    score = round(max(0, min(100, score)))

    if score >= 80:
        label = "Excellent"
    elif score >= 65:
        label = "Good"
    elif score >= 45:
        label = "Fair"
    else:
        label = "Needs attention"

    return {
        "score": score,
        "label": label,
        "breakdown": {k: round(v, 1) for k, (v, w) in weights.items()}
    }


def predict_budget_outcome(txns, budgets):
    """Project whether the user will stay within each active budget this period."""
    if not budgets:
        return []

    today = date.today()
    results = []
    expense_txns = [t for t in txns if t["type"] == "expense"]

    for b in budgets:
        if b["period"] == "monthly":
            start = today.replace(day=1)
            if today.month == 12:
                next_month = date(today.year + 1, 1, 1)
            else:
                next_month = date(today.year, today.month + 1, 1)
            days_total = (next_month - start).days
        elif b["period"] == "weekly":
            start = today - timedelta(days=today.weekday())
            days_total = 7
        else:
            start = today
            days_total = 1

        days_elapsed = max((today - start).days + 1, 1)
        spent_so_far = sum(t["amount"] for t in expense_txns
                            if t["category"] == b["category"] and _parse_date(t["txn_date"]) >= start)

        daily_rate = spent_so_far / days_elapsed
        projected_total = daily_rate * days_total

        will_exceed = projected_total > b["limit_amount"]
        projected_overage = max(0, projected_total - b["limit_amount"])

        results.append({
            "category": b["category"],
            "period": b["period"],
            "limit": b["limit_amount"],
            "spent_so_far": round(spent_so_far, 2),
            "projected_total": round(projected_total, 2),
            "will_exceed": will_exceed,
            "projected_overage": round(projected_overage, 2),
            "days_remaining": max(0, days_total - days_elapsed)
        })
    return results


def recommend_savings(txns):
    """Suggest a realistic monthly savings amount based on income/expense history."""
    income_txns = [t for t in txns if t["type"] == "income"]
    expense_txns = [t for t in txns if t["type"] == "expense"]

    monthly = _monthly_totals(txns, months=3)
    avg_income = mean([v["income"] for v in monthly.values()]) if monthly else sum(t["amount"] for t in income_txns)
    avg_expense = mean([v["expense"] for v in monthly.values()]) if monthly else sum(t["amount"] for t in expense_txns)

    if avg_income <= 0:
        return {"suggested_monthly_savings": 0, "suggested_rate": 0, "note": "Add income transactions to get a savings recommendation."}

    surplus = avg_income - avg_expense
    # Rule of thumb: recommend saving 20% of income, but no more than the actual surplus allows comfortably (80% of surplus)
    target_20pct = avg_income * 0.20
    comfortable_cap = max(0, surplus * 0.8)
    suggested = min(target_20pct, comfortable_cap) if surplus > 0 else max(0, surplus * 0.5)
    suggested = max(0, suggested)

    return {
        "suggested_monthly_savings": round(suggested, 2),
        "suggested_rate": round((suggested / avg_income) * 100, 1) if avg_income else 0,
        "average_monthly_income": round(avg_income, 2),
        "average_monthly_expense": round(avg_expense, 2),
        "current_surplus": round(surplus, 2)
    }


def emergency_fund_target(txns):
    """Recommend an emergency fund size: 3-6 months of average expenses, scaled by income stability."""
    monthly = _monthly_totals(txns, months=6)
    monthly_expenses = [v["expense"] for v in monthly.values() if v["expense"] > 0]
    monthly_income = [v["income"] for v in monthly.values() if v["income"] > 0]

    if not monthly_expenses:
        return {"target_amount": 0, "months_recommended": 3, "note": "Add expense history to calculate a target."}

    avg_expense = mean(monthly_expenses)

    # More volatile income -> recommend a bigger buffer (up to 6 months); stable income -> 3 months is enough
    if len(monthly_income) >= 2:
        avg_i = mean(monthly_income)
        vol_i = pstdev(monthly_income) / avg_i if avg_i else 0
    else:
        vol_i = 0.3  # unknown stability, assume moderate

    months_recommended = 3 + round(min(3, vol_i * 6))
    target = avg_expense * months_recommended

    return {
        "target_amount": round(target, 2),
        "months_recommended": months_recommended,
        "average_monthly_expense": round(avg_expense, 2)
    }


def estimate_future_balance(txns, months_ahead=3):
    """Simple linear projection of balance N months forward using average monthly net flow."""
    monthly = _monthly_totals(txns, months=6)
    if not monthly:
        return {"projections": [], "note": "Add transaction history to project future balance."}

    net_flows = [v["income"] - v["expense"] for v in monthly.values()]
    avg_net = mean(net_flows) if net_flows else 0

    total_income = sum(t["amount"] for t in txns if t["type"] == "income")
    total_expense = sum(t["amount"] for t in txns if t["type"] == "expense")
    current_balance = total_income - total_expense

    projections = []
    running = current_balance
    today = date.today()
    for i in range(1, months_ahead + 1):
        running += avg_net
        month_num = today.month + i
        year = today.year + (month_num - 1) // 12
        month = (month_num - 1) % 12 + 1
        projections.append({
            "month": f"{year}-{month:02d}",
            "projected_balance": round(running, 2)
        })

    return {
        "current_balance": round(current_balance, 2),
        "average_monthly_net_flow": round(avg_net, 2),
        "projections": projections
    }


def detect_unusual_spending(txns, z_threshold=2.0):
    """Flag transactions that are statistical outliers within their own category."""
    expense_txns = [t for t in txns if t["type"] == "expense"]
    by_category = defaultdict(list)
    for t in expense_txns:
        by_category[t["category"]].append(t)

    anomalies = []
    for category, items in by_category.items():
        if len(items) < 4:
            continue
        amounts = [t["amount"] for t in items]
        avg = mean(amounts)
        sd = pstdev(amounts)
        if sd == 0:
            continue
        for t in items:
            z = (t["amount"] - avg) / sd
            if z >= z_threshold:
                anomalies.append({
                    "id": t["id"],
                    "category": category,
                    "amount": t["amount"],
                    "date": t["txn_date"],
                    "note": t.get("note", ""),
                    "typical_amount": round(avg, 2),
                    "severity": "high" if z >= 3 else "moderate"
                })

    anomalies.sort(key=lambda a: a["date"], reverse=True)
    return anomalies[:10]


def goal_projection(goal):
    """For a savings goal, estimate completion date and suggested monthly contribution."""
    remaining = max(0, goal["target_amount"] - goal["current_amount"])
    if remaining == 0:
        return {"status": "complete", "months_remaining": 0, "suggested_monthly_contribution": 0}

    if goal.get("target_date"):
        try:
            target = datetime.fromisoformat(goal["target_date"]).date()
            months_left = max(1, (target.year - date.today().year) * 12 + (target.month - date.today().month))
        except (ValueError, TypeError):
            months_left = 12
    else:
        months_left = 12

    suggested_contribution = remaining / months_left

    return {
        "status": "in_progress",
        "remaining_amount": round(remaining, 2),
        "months_remaining": months_left,
        "suggested_monthly_contribution": round(suggested_contribution, 2),
        "percent_complete": round((goal["current_amount"] / goal["target_amount"]) * 100, 1) if goal["target_amount"] else 0
    }


def personalized_tips(txns, budgets, goals, health_score):
    """Generate a short list of plain-language, rule-based budgeting tips."""
    tips = []
    analysis = analyze_spending(txns)

    if analysis["top_categories"]:
        top = analysis["top_categories"][0]
        if top["percent"] > 35:
            tips.append(f"{top['category']} makes up {top['percent']}% of your spending — consider setting a dedicated budget for it.")

    if analysis["trend"] == "rising":
        tips.append("Your spending has increased over the past 30 days compared to the prior month. Review recent purchases for anything unplanned.")
    elif analysis["trend"] == "falling":
        tips.append("Nice work — your spending has decreased compared to last month. Consider moving the difference into savings.")

    savings = recommend_savings(txns)
    if savings.get("current_surplus", 0) > 0 and savings.get("suggested_monthly_savings", 0) > 0:
        tips.append(f"Based on your income and expenses, aim to save about ${savings['suggested_monthly_savings']:.0f}/month.")
    elif savings.get("current_surplus", 0) < 0:
        tips.append("Your expenses currently exceed your income. Look for non-essential categories to trim first.")

    if health_score["score"] < 45:
        tips.append("Your financial health score suggests focusing on the essentials: build a small emergency buffer before other goals.")
    elif health_score["score"] >= 80:
        tips.append("Your financial health score is excellent. This could be a good time to increase investment contributions.")

    if not budgets:
        tips.append("You haven't set any budgets yet. Start with your top 2-3 spending categories for the biggest impact.")

    if goals:
        underfunded = [g for g in goals if g["current_amount"] < g["target_amount"] * 0.1]
        if underfunded:
            tips.append(f"'{underfunded[0]['name']}' has barely started — even a small automatic monthly transfer can build momentum.")

    if not tips:
        tips.append("Keep logging your transactions consistently — the more history you have, the sharper these insights become.")

    return tips[:6]
