"""Report generation: spending trends, category breakdowns, income vs expense, CSV export."""

import csv
import io
from datetime import datetime, timedelta, date
from collections import defaultdict


def _parse_date(d):
    return datetime.fromisoformat(d).date() if isinstance(d, str) else d


def build_report_data(txns, period):
    today = date.today()
    if period == "weekly":
        start = today - timedelta(days=7)
        bucket_fmt = lambda d: d.isoformat()
    elif period == "monthly":
        start = today - timedelta(days=30)
        bucket_fmt = lambda d: d.isoformat()
    else:  # yearly
        start = today - timedelta(days=365)
        bucket_fmt = lambda d: f"{d.year}-{d.month:02d}"

    filtered = [t for t in txns if _parse_date(t["txn_date"]) >= start]

    income_total = sum(t["amount"] for t in filtered if t["type"] == "income")
    expense_total = sum(t["amount"] for t in filtered if t["type"] == "expense")

    by_category = defaultdict(float)
    for t in filtered:
        if t["type"] == "expense":
            by_category[t["category"]] += t["amount"]

    trend = defaultdict(lambda: {"income": 0.0, "expense": 0.0})
    for t in filtered:
        key = bucket_fmt(_parse_date(t["txn_date"]))
        trend[key][t["type"]] += t["amount"]

    savings_growth = []
    running = 0
    for key in sorted(trend.keys()):
        running += trend[key]["income"] - trend[key]["expense"]
        savings_growth.append({"period": key, "cumulative_savings": round(running, 2)})

    return {
        "period": period,
        "start_date": start.isoformat(),
        "end_date": today.isoformat(),
        "income_total": round(income_total, 2),
        "expense_total": round(expense_total, 2),
        "net": round(income_total - expense_total, 2),
        "category_breakdown": {k: round(v, 2) for k, v in by_category.items()},
        "trend": [{"period": k, **{kk: round(vv, 2) for kk, vv in v.items()}} for k, v in sorted(trend.items())],
        "savings_growth": savings_growth,
        "transaction_count": len(filtered)
    }


def csv_export(txns):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Date", "Type", "Category", "Amount", "Note", "Recurring"])
    for t in txns:
        writer.writerow([t["txn_date"], t["type"], t["category"], t["amount"], t.get("note", ""), t.get("recurring", "none")])
    return output.getvalue()
