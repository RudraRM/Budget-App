"""
Statement Parser: Extract transactions from credit/debit statements
Supports: TXT, PDF, PNG, JPEG
"""

import re
from datetime import datetime, date
from typing import List, Dict, Tuple
from collections import defaultdict

# Category keywords for automatic categorization
CATEGORY_KEYWORDS = {
    "Food": ["restaurant", "cafe", "grocery", "pizza", "burger", "coffee", "food", "diner", "bistro", "bakery", "market", "supermarket"],
    "Shopping": ["amazon", "mall", "store", "walmart", "target", "shop", "clothing", "apparel", "retail"],
    "Bills": ["utility", "water", "electric", "gas", "phone", "internet", "insurance", "bill"],
    "Transportation": ["uber", "taxi", "gas", "fuel", "parking", "transit", "train", "bus", "airline", "hotel"],
    "Entertainment": ["movie", "cinema", "theater", "concert", "spotify", "netflix", "game", "gaming", "entertainment"],
    "Healthcare": ["doctor", "pharmacy", "hospital", "medical", "clinic", "health"],
    "Education": ["school", "tuition", "course", "book", "education", "university"],
    "Salary": ["salary", "paycheck", "income", "deposit"],
    "Investments": ["broker", "investment", "stock", "crypto"],
}

def categorize_transaction(description: str, amount: float) -> Tuple[str, str]:
    """Categorize a transaction based on description and determine if it's income or expense."""
    description_lower = description.lower()

    # Determine if it's income or expense
    # Typically deposits or positive descriptions are income
    if any(word in description_lower for word in ["salary", "paycheck", "deposit", "income", "refund", "credit"]):
        ttype = "income"
    else:
        ttype = "expense"

    # Find matching category
    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in description_lower:
                return category, ttype

    # Default category
    return "Other", ttype

def parse_txt_statement(content: str) -> List[Dict]:
    """Parse a TXT file statement."""
    transactions = []
    lines = content.strip().split('\n')

    # Pattern to match transaction lines: DATE DESCRIPTION AMOUNT
    # Flexible pattern to handle various formats
    date_pattern = r'(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})'
    amount_pattern = r'(\$?[\d,]+\.?\d*)'

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Try to extract date, description, and amount
        date_match = re.search(date_pattern, line)
        if not date_match:
            continue

        date_str = date_match.group(1)

        # Try to parse the date
        try:
            # Try different date formats
            for fmt in ['%m/%d/%Y', '%m/%d/%y', '%d/%m/%Y', '%d/%m/%y', '%Y-%m-%d', '%Y/%m/%d']:
                try:
                    parsed_date = datetime.strptime(date_str, fmt).date()
                    break
                except ValueError:
                    continue
            else:
                continue
        except:
            continue

        # Extract amount (look for currency amounts in the line)
        amount_matches = re.findall(r'[\d,]+\.?\d*', line)
        if not amount_matches:
            continue

        # Take the last number as the amount (usually the amount is at the end)
        amount_str = amount_matches[-1].replace(',', '')
        try:
            amount = float(amount_str)
        except ValueError:
            continue

        if amount <= 0:
            continue

        # Extract description (between date and amount)
        description_part = line[date_match.end():].strip()
        # Remove amount from the end
        description_part = re.sub(r'[\d,]+\.?\d*\s*$', '', description_part).strip()

        if not description_part:
            description_part = "Transaction"

        category, ttype = categorize_transaction(description_part, amount)

        transactions.append({
            "date": parsed_date.isoformat(),
            "description": description_part,
            "amount": round(amount, 2),
            "category": category,
            "type": ttype
        })

    return transactions

def parse_pdf_statement(file_path: str) -> List[Dict]:
    """Parse a PDF file statement."""
    try:
        import PyPDF2
    except ImportError:
        return []

    transactions = []
    try:
        with open(file_path, 'rb') as file:
            reader = PyPDF2.PdfReader(file)
            text = ""
            for page in reader.pages:
                text += page.extract_text() + "\n"

        # Use the TXT parser on extracted text
        transactions = parse_txt_statement(text)
    except Exception as e:
        print(f"Error parsing PDF: {e}")

    return transactions

def parse_image_statement(file_path: str) -> List[Dict]:
    """Parse an image file statement using OCR."""
    transactions = []
    try:
        import pytesseract
        from PIL import Image

        # Open and process image
        img = Image.open(file_path)
        text = pytesseract.image_to_string(img)

        # Use the TXT parser on extracted text
        transactions = parse_txt_statement(text)
    except ImportError:
        print("Tesseract not available. Image parsing disabled.")
    except Exception as e:
        print(f"Error parsing image: {e}")

    return transactions

def parse_statement_file(file_path: str, filename: str) -> List[Dict]:
    """
    Main entry point for parsing statement files.
    Supports: TXT, PDF, PNG, JPEG
    """
    extension = filename.lower().split('.')[-1]

    if extension == 'txt':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        return parse_txt_statement(content)

    elif extension == 'pdf':
        return parse_pdf_statement(file_path)

    elif extension in ['png', 'jpg', 'jpeg']:
        return parse_image_statement(file_path)

    else:
        return []
