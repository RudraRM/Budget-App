"""
BudgetMind AI - Personal Finance & Budgeting Platform
Backend: Flask + SQLite
No external AI API used - all "AI Assistant" logic is local, rule-based analysis.
"""

import os
import sqlite3
import secrets
import hashlib
import hmac
import base64
from datetime import datetime, timedelta, date
from functools import wraps

from flask import Flask, request, jsonify, g, send_from_directory, session
from werkzeug.utils import secure_filename

from backend.ai_engine import (
    analyze_spending, financial_health_score, predict_budget_outcome,
    recommend_savings, emergency_fund_target, estimate_future_balance,
    detect_unusual_spending, personalized_tips, goal_projection
)
from backend.reports import build_report_data, csv_export
from backend.statement_parser import parse_statement_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "budgetmind.db")

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("BUDGETMIND_SECRET", secrets.token_hex(32))
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["JSON_SORT_KEYS"] = False

CATEGORIES = [
    "Food", "Shopping", "Bills", "Transportation", "Entertainment",
    "Healthcare", "Education", "Salary", "Investments", "Other"
]

# File upload configuration
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'png', 'jpg', 'jpeg'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    fresh = not os.path.exists(DB_PATH)
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        currency TEXT DEFAULT 'USD',
        theme TEXT DEFAULT 'dark',
        reset_token TEXT,
        reset_expires TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income','expense')),
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        txn_date TEXT NOT NULL,
        recurring TEXT DEFAULT 'none',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS budgets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        period TEXT NOT NULL CHECK(period IN ('daily','weekly','monthly')),
        limit_amount REAL NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0,
        target_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        due_day INTEGER NOT NULL,
        category TEXT DEFAULT 'Bills',
        active INTEGER DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    """)
    db.commit()
    db.close()
    return fresh


# ---------------------------------------------------------------------------
# Security helpers
# ---------------------------------------------------------------------------

def hash_password(password: str, salt: str = None):
    if salt is None:
        salt = secrets.token_hex(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260000)
    return base64.b64encode(pw_hash).decode(), salt


def verify_password(password: str, salt: str, stored_hash: str) -> bool:
    calc_hash, _ = hash_password(password, salt)
    return hmac.compare_digest(calc_hash, stored_hash)


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Not authenticated"}), 401
        return f(*args, **kwargs)
    return wrapper


def validate_email(email: str) -> bool:
    return bool(email) and "@" in email and "." in email.split("@")[-1] and len(email) < 254


def validate_amount(amount) -> bool:
    try:
        val = float(amount)
        return val >= 0 and val < 1_000_000_000
    except (TypeError, ValueError):
        return False


# ---------------------------------------------------------------------------
# Static pages
# ---------------------------------------------------------------------------

@app.route("/")
def landing():
    return send_from_directory(app.template_folder, "landing.html")


@app.route("/app")
def dashboard_page():
    return send_from_directory(app.template_folder, "app.html")


@app.route("/manifest.json")
def manifest():
    return send_from_directory(app.static_folder, "manifest.json")


@app.route("/sw.js")
def service_worker():
    return send_from_directory(app.static_folder, "sw.js")


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:100]
    email = (data.get("email") or "").strip().lower()[:254]
    password = data.get("password") or ""

    if not name or len(name) < 2:
        return jsonify({"error": "Please enter a valid name."}), 400
    if not validate_email(email):
        return jsonify({"error": "Please enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return jsonify({"error": "An account with this email already exists."}), 409

    pw_hash, salt = hash_password(password)
    cur = db.execute(
        "INSERT INTO users (name, email, password_hash, salt) VALUES (?, ?, ?, ?)",
        (name, email, pw_hash, salt)
    )
    db.commit()
    user_id = cur.lastrowid
    session["user_id"] = user_id
    session.permanent = False
    return jsonify({"ok": True, "user": {"id": user_id, "name": name, "email": email, "currency": "USD", "theme": "dark"}})


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    remember = bool(data.get("remember"))

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not user or not verify_password(password, user["salt"], user["password_hash"]):
        return jsonify({"error": "Invalid email or password."}), 401

    session["user_id"] = user["id"]
    session.permanent = remember
    if remember:
        app.permanent_session_lifetime = timedelta(days=30)

    return jsonify({"ok": True, "user": {
        "id": user["id"], "name": user["name"], "email": user["email"],
        "currency": user["currency"], "theme": user["theme"]
    }})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    db = get_db()
    user = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    # Always respond success to avoid leaking which emails are registered.
    if user:
        token = secrets.token_urlsafe(32)
        expires = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        db.execute("UPDATE users SET reset_token=?, reset_expires=? WHERE id=?",
                   (token, expires, user["id"]))
        db.commit()
        # In a real deployment this would be emailed. For local/demo use we
        # return it directly so the flow is testable without an email server.
        return jsonify({"ok": True, "demo_reset_token": token})
    return jsonify({"ok": True})


@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json(force=True, silent=True) or {}
    token = data.get("token") or ""
    new_password = data.get("password") or ""
    if len(new_password) < 8:
        return jsonify({"error": "Password must be at least 8 characters."}), 400

    db = get_db()
    user = db.execute("SELECT * FROM users WHERE reset_token = ?", (token,)).fetchone()
    if not user:
        return jsonify({"error": "Invalid or expired reset link."}), 400
    if datetime.fromisoformat(user["reset_expires"]) < datetime.utcnow():
        return jsonify({"error": "This reset link has expired."}), 400

    pw_hash, salt = hash_password(new_password)
    db.execute("UPDATE users SET password_hash=?, salt=?, reset_token=NULL, reset_expires=NULL WHERE id=?",
               (pw_hash, salt, user["id"]))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/auth/me", methods=["GET"])
def me():
    if "user_id" not in session:
        return jsonify({"user": None})
    db = get_db()
    user = db.execute("SELECT id, name, email, currency, theme FROM users WHERE id=?",
                       (session["user_id"],)).fetchone()
    if not user:
        session.clear()
        return jsonify({"user": None})
    return jsonify({"user": dict(user)})


@app.route("/api/profile", methods=["PUT"])
@login_required
def update_profile():
    data = request.get_json(force=True, silent=True) or {}
    db = get_db()
    fields, values = [], []
    if "name" in data and data["name"].strip():
        fields.append("name=?"); values.append(data["name"].strip()[:100])
    if "currency" in data:
        fields.append("currency=?"); values.append(data["currency"][:10])
    if "theme" in data and data["theme"] in ("dark", "light"):
        fields.append("theme=?"); values.append(data["theme"])
    if fields:
        values.append(session["user_id"])
        db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", values)
        db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Transactions
# ---------------------------------------------------------------------------

@app.route("/api/transactions", methods=["GET"])
@login_required
def list_transactions():
    db = get_db()
    q = "SELECT * FROM transactions WHERE user_id=?"
    params = [session["user_id"]]

    category = request.args.get("category")
    ttype = request.args.get("type")
    date_from = request.args.get("from")
    date_to = request.args.get("to")
    min_amt = request.args.get("min")
    max_amt = request.args.get("max")
    search = request.args.get("search")

    if category and category != "all":
        q += " AND category=?"; params.append(category)
    if ttype and ttype != "all":
        q += " AND type=?"; params.append(ttype)
    if date_from:
        q += " AND txn_date>=?"; params.append(date_from)
    if date_to:
        q += " AND txn_date<=?"; params.append(date_to)
    if min_amt:
        q += " AND amount>=?"; params.append(float(min_amt))
    if max_amt:
        q += " AND amount<=?"; params.append(float(max_amt))
    if search:
        q += " AND note LIKE ?"; params.append(f"%{search}%")

    q += " ORDER BY txn_date DESC, id DESC"
    rows = db.execute(q, params).fetchall()
    return jsonify({"transactions": [dict(r) for r in rows]})


@app.route("/api/transactions", methods=["POST"])
@login_required
def add_transaction():
    data = request.get_json(force=True, silent=True) or {}
    ttype = data.get("type")
    category = data.get("category")
    amount = data.get("amount")
    note = (data.get("note") or "").strip()[:500]
    txn_date = data.get("date") or date.today().isoformat()
    recurring = data.get("recurring", "none")

    if ttype not in ("income", "expense"):
        return jsonify({"error": "Transaction type must be income or expense."}), 400
    if category not in CATEGORIES:
        return jsonify({"error": "Invalid category."}), 400
    if not validate_amount(amount):
        return jsonify({"error": "Please enter a valid amount."}), 400
    if recurring not in ("none", "daily", "weekly", "monthly", "yearly"):
        recurring = "none"

    db = get_db()
    cur = db.execute(
        "INSERT INTO transactions (user_id, type, category, amount, note, txn_date, recurring) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (session["user_id"], ttype, category, float(amount), note, txn_date, recurring)
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/transactions/<int:txn_id>", methods=["PUT"])
@login_required
def update_transaction(txn_id):
    db = get_db()
    existing = db.execute("SELECT * FROM transactions WHERE id=? AND user_id=?",
                           (txn_id, session["user_id"])).fetchone()
    if not existing:
        return jsonify({"error": "Transaction not found."}), 404

    data = request.get_json(force=True, silent=True) or {}
    ttype = data.get("type", existing["type"])
    category = data.get("category", existing["category"])
    amount = data.get("amount", existing["amount"])
    note = (data.get("note", existing["note"]) or "").strip()[:500]
    txn_date = data.get("date", existing["txn_date"])

    if ttype not in ("income", "expense"):
        return jsonify({"error": "Transaction type must be income or expense."}), 400
    if category not in CATEGORIES:
        return jsonify({"error": "Invalid category."}), 400
    if not validate_amount(amount):
        return jsonify({"error": "Please enter a valid amount."}), 400

    db.execute(
        "UPDATE transactions SET type=?, category=?, amount=?, note=?, txn_date=? WHERE id=? AND user_id=?",
        (ttype, category, float(amount), note, txn_date, txn_id, session["user_id"])
    )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/transactions/<int:txn_id>", methods=["DELETE"])
@login_required
def delete_transaction(txn_id):
    db = get_db()
    db.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (txn_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/statements/upload", methods=["POST"])
@login_required
def upload_statement():
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed. Supported: TXT, PDF, PNG, JPEG"}), 400

    try:
        filename = secure_filename(file.filename)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_")
        filename = timestamp + filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        file.save(filepath)

        # Parse the statement file
        transactions = parse_statement_file(filepath, file.filename)

        if not transactions:
            return jsonify({"error": "No transactions found in the file. Please check the file format."}), 400

        return jsonify({
            "ok": True,
            "transactions": transactions,
            "count": len(transactions)
        })

    except Exception as e:
        return jsonify({"error": f"Error processing file: {str(e)}"}), 500


@app.route("/api/statements/import", methods=["POST"])
@login_required
def import_statement_transactions():
    data = request.get_json(force=True, silent=True) or {}
    transactions_data = data.get("transactions", [])

    if not transactions_data:
        return jsonify({"error": "No transactions provided"}), 400

    db = get_db()
    imported_count = 0

    for txn in transactions_data:
        try:
            ttype = txn.get("type", "expense")
            category = txn.get("category", "Other")
            amount = float(txn.get("amount", 0))
            note = (txn.get("description", "") or "").strip()[:500]
            txn_date = txn.get("date", date.today().isoformat())

            if ttype not in ("income", "expense"):
                ttype = "expense"
            if category not in CATEGORIES:
                category = "Other"
            if amount <= 0:
                continue

            db.execute(
                "INSERT INTO transactions (user_id, type, category, amount, note, txn_date, recurring) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (session["user_id"], ttype, category, amount, note, txn_date, "none")
            )
            imported_count += 1
        except Exception as e:
            continue

    db.commit()
    return jsonify({"ok": True, "imported": imported_count})


@app.route("/api/categories", methods=["GET"])
def get_categories():
    return jsonify({"categories": CATEGORIES})


# ---------------------------------------------------------------------------
# Budgets
# ---------------------------------------------------------------------------

@app.route("/api/budgets", methods=["GET"])
@login_required
def list_budgets():
    db = get_db()
    rows = db.execute("SELECT * FROM budgets WHERE user_id=?", (session["user_id"],)).fetchall()
    return jsonify({"budgets": [dict(r) for r in rows]})


@app.route("/api/budgets", methods=["POST"])
@login_required
def add_budget():
    data = request.get_json(force=True, silent=True) or {}
    category = data.get("category")
    period = data.get("period")
    limit_amount = data.get("limit")

    if category not in CATEGORIES:
        return jsonify({"error": "Invalid category."}), 400
    if period not in ("daily", "weekly", "monthly"):
        return jsonify({"error": "Period must be daily, weekly, or monthly."}), 400
    if not validate_amount(limit_amount):
        return jsonify({"error": "Please enter a valid budget limit."}), 400

    db = get_db()
    existing = db.execute(
        "SELECT id FROM budgets WHERE user_id=? AND category=? AND period=?",
        (session["user_id"], category, period)
    ).fetchone()
    if existing:
        db.execute("UPDATE budgets SET limit_amount=? WHERE id=?", (float(limit_amount), existing["id"]))
    else:
        db.execute(
            "INSERT INTO budgets (user_id, category, period, limit_amount) VALUES (?, ?, ?, ?)",
            (session["user_id"], category, period, float(limit_amount))
        )
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/budgets/<int:budget_id>", methods=["DELETE"])
@login_required
def delete_budget(budget_id):
    db = get_db()
    db.execute("DELETE FROM budgets WHERE id=? AND user_id=?", (budget_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/budgets/progress", methods=["GET"])
@login_required
def budget_progress():
    db = get_db()
    budgets = db.execute("SELECT * FROM budgets WHERE user_id=?", (session["user_id"],)).fetchall()
    txns = db.execute("SELECT * FROM transactions WHERE user_id=? AND type='expense'",
                       (session["user_id"],)).fetchall()

    today = date.today()
    results = []
    for b in budgets:
        if b["period"] == "daily":
            start = today
        elif b["period"] == "weekly":
            start = today - timedelta(days=today.weekday())
        else:
            start = today.replace(day=1)

        spent = sum(
            t["amount"] for t in txns
            if t["category"] == b["category"] and datetime.fromisoformat(t["txn_date"]).date() >= start
        )
        pct = min(100, round((spent / b["limit_amount"]) * 100, 1)) if b["limit_amount"] else 0
        results.append({
            "id": b["id"], "category": b["category"], "period": b["period"],
            "limit": b["limit_amount"], "spent": round(spent, 2), "percent": pct,
            "overspent": spent > b["limit_amount"]
        })
    return jsonify({"progress": results})


# ---------------------------------------------------------------------------
# Goals
# ---------------------------------------------------------------------------

@app.route("/api/goals", methods=["GET"])
@login_required
def list_goals():
    db = get_db()
    rows = db.execute("SELECT * FROM goals WHERE user_id=?", (session["user_id"],)).fetchall()
    goals = []
    for r in rows:
        g_dict = dict(r)
        g_dict["projection"] = goal_projection(g_dict)
        goals.append(g_dict)
    return jsonify({"goals": goals})


@app.route("/api/goals", methods=["POST"])
@login_required
def add_goal():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:150]
    target_amount = data.get("target_amount")
    current_amount = data.get("current_amount", 0)
    target_date = data.get("target_date")

    if not name:
        return jsonify({"error": "Please name your goal."}), 400
    if not validate_amount(target_amount) or float(target_amount) <= 0:
        return jsonify({"error": "Please enter a valid target amount."}), 400
    if not validate_amount(current_amount):
        current_amount = 0

    db = get_db()
    cur = db.execute(
        "INSERT INTO goals (user_id, name, target_amount, current_amount, target_date) VALUES (?, ?, ?, ?, ?)",
        (session["user_id"], name, float(target_amount), float(current_amount), target_date)
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/goals/<int:goal_id>", methods=["PUT"])
@login_required
def update_goal(goal_id):
    db = get_db()
    existing = db.execute("SELECT * FROM goals WHERE id=? AND user_id=?",
                           (goal_id, session["user_id"])).fetchone()
    if not existing:
        return jsonify({"error": "Goal not found."}), 404

    data = request.get_json(force=True, silent=True) or {}
    current_amount = data.get("current_amount", existing["current_amount"])
    if not validate_amount(current_amount):
        return jsonify({"error": "Please enter a valid amount."}), 400

    db.execute("UPDATE goals SET current_amount=? WHERE id=? AND user_id=?",
               (float(current_amount), goal_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


@app.route("/api/goals/<int:goal_id>", methods=["DELETE"])
@login_required
def delete_goal(goal_id):
    db = get_db()
    db.execute("DELETE FROM goals WHERE id=? AND user_id=?", (goal_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Bills
# ---------------------------------------------------------------------------

@app.route("/api/bills", methods=["GET"])
@login_required
def list_bills():
    db = get_db()
    rows = db.execute("SELECT * FROM bills WHERE user_id=? ORDER BY due_day", (session["user_id"],)).fetchall()
    return jsonify({"bills": [dict(r) for r in rows]})


@app.route("/api/bills", methods=["POST"])
@login_required
def add_bill():
    data = request.get_json(force=True, silent=True) or {}
    name = (data.get("name") or "").strip()[:150]
    amount = data.get("amount")
    due_day = data.get("due_day")
    category = data.get("category", "Bills")

    if not name:
        return jsonify({"error": "Please name this bill."}), 400
    if not validate_amount(amount):
        return jsonify({"error": "Please enter a valid amount."}), 400
    try:
        due_day = int(due_day)
        if not (1 <= due_day <= 31):
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "Due day must be between 1 and 31."}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO bills (user_id, name, amount, due_day, category) VALUES (?, ?, ?, ?, ?)",
        (session["user_id"], name, float(amount), due_day, category)
    )
    db.commit()
    return jsonify({"ok": True, "id": cur.lastrowid})


@app.route("/api/bills/<int:bill_id>", methods=["DELETE"])
@login_required
def delete_bill(bill_id):
    db = get_db()
    db.execute("DELETE FROM bills WHERE id=? AND user_id=?", (bill_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# AI Assistant (rule-based, local, no external API)
# ---------------------------------------------------------------------------

@app.route("/api/ai/insights", methods=["GET"])
@login_required
def ai_insights():
    db = get_db()
    txns = [dict(r) for r in db.execute(
        "SELECT * FROM transactions WHERE user_id=? ORDER BY txn_date", (session["user_id"],)
    ).fetchall()]
    budgets = [dict(r) for r in db.execute(
        "SELECT * FROM budgets WHERE user_id=?", (session["user_id"],)
    ).fetchall()]
    goals = [dict(r) for r in db.execute(
        "SELECT * FROM goals WHERE user_id=?", (session["user_id"],)
    ).fetchall()]

    spending_analysis = analyze_spending(txns)
    health_score = financial_health_score(txns, budgets)
    budget_forecast = predict_budget_outcome(txns, budgets)
    savings_rec = recommend_savings(txns)
    emergency_target = emergency_fund_target(txns)
    future_balance = estimate_future_balance(txns)
    anomalies = detect_unusual_spending(txns)
    tips = personalized_tips(txns, budgets, goals, health_score)

    return jsonify({
        "spending_analysis": spending_analysis,
        "health_score": health_score,
        "budget_forecast": budget_forecast,
        "savings_recommendation": savings_rec,
        "emergency_fund_target": emergency_target,
        "future_balance_estimate": future_balance,
        "anomalies": anomalies,
        "tips": tips
    })


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------

@app.route("/api/reports/<period>", methods=["GET"])
@login_required
def get_report(period):
    if period not in ("weekly", "monthly", "yearly"):
        return jsonify({"error": "Invalid report period."}), 400
    db = get_db()
    txns = [dict(r) for r in db.execute(
        "SELECT * FROM transactions WHERE user_id=? ORDER BY txn_date", (session["user_id"],)
    ).fetchall()]
    return jsonify(build_report_data(txns, period))


@app.route("/api/reports/<period>/export.csv", methods=["GET"])
@login_required
def export_csv(period):
    db = get_db()
    txns = [dict(r) for r in db.execute(
        "SELECT * FROM transactions WHERE user_id=? ORDER BY txn_date", (session["user_id"],)
    ).fetchall()]
    csv_data = csv_export(txns)
    return app.response_class(
        csv_data, mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename=budgetmind_{period}_report.csv"}
    )


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------

@app.route("/api/notifications", methods=["GET"])
@login_required
def get_notifications():
    db = get_db()

    # Generate fresh rule-based notifications (budget warnings, bill reminders)
    budgets = db.execute("SELECT * FROM budgets WHERE user_id=?", (session["user_id"],)).fetchall()
    txns = db.execute("SELECT * FROM transactions WHERE user_id=? AND type='expense'",
                       (session["user_id"],)).fetchall()
    bills = db.execute("SELECT * FROM bills WHERE user_id=? AND active=1", (session["user_id"],)).fetchall()

    today = date.today()
    generated = []

    for b in budgets:
        if b["period"] == "monthly":
            start = today.replace(day=1)
        elif b["period"] == "weekly":
            start = today - timedelta(days=today.weekday())
        else:
            start = today
        spent = sum(t["amount"] for t in txns
                    if t["category"] == b["category"] and datetime.fromisoformat(t["txn_date"]).date() >= start)
        if b["limit_amount"] > 0:
            pct = spent / b["limit_amount"]
            if pct >= 1.0:
                generated.append(("budget_alert", f"You've exceeded your {b['period']} {b['category']} budget."))
            elif pct >= 0.85:
                generated.append(("budget_alert", f"You're at {round(pct*100)}% of your {b['period']} {b['category']} budget."))

    for bill in bills:
        days_until = bill["due_day"] - today.day
        if 0 <= days_until <= 3:
            generated.append(("bill_reminder", f"{bill['name']} (${bill['amount']:.2f}) is due in {days_until} day(s)."))

    existing_msgs = {r["message"] for r in db.execute(
        "SELECT message FROM notifications WHERE user_id=? AND date(created_at)=date('now')",
        (session["user_id"],)
    ).fetchall()}

    for kind, message in generated:
        if message not in existing_msgs:
            db.execute("INSERT INTO notifications (user_id, kind, message) VALUES (?, ?, ?)",
                       (session["user_id"], kind, message))
    db.commit()

    rows = db.execute(
        "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30",
        (session["user_id"],)
    ).fetchall()
    return jsonify({"notifications": [dict(r) for r in rows]})


@app.route("/api/notifications/<int:notif_id>/read", methods=["POST"])
@login_required
def mark_notification_read(notif_id):
    db = get_db()
    db.execute("UPDATE notifications SET read=1 WHERE id=? AND user_id=?", (notif_id, session["user_id"]))
    db.commit()
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Security headers
# ---------------------------------------------------------------------------

@app.after_request
def set_security_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src https://fonts.gstatic.com; script-src 'self' https://cdnjs.cloudflare.com; "
        "img-src 'self' data:;"
    )
    return response


if __name__ == "__main__":
    init_db()
    app.run(debug=True, host="0.0.0.0", port=5000)
else:
    init_db()
