import pandas as pd
import sqlite3
import os

FOLDER_PATH = "excels"
DB_FILE = "geocoding.db"

conn = sqlite3.connect(DB_FILE)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS geocoded (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    address TEXT UNIQUE,
    line_of_business TEXT,
    lat REAL,
    lon REAL
)
""")

conn.commit()

files = [f for f in os.listdir(FOLDER_PATH) if f.endswith(".xlsx")]

for file in files:
    file_path = os.path.join(FOLDER_PATH, file)

    df = pd.read_excel(file_path)
    df.columns = df.columns.str.strip().str.upper()

    df = df.dropna(subset=["BUSINESS ADDRESS"])
    df["BUSINESS ADDRESS"] = df["BUSINESS ADDRESS"].astype(str).str.strip()

    for _, row in df.iterrows():
        cursor.execute("""
            INSERT OR IGNORE INTO geocoded
            (business_name, address, line_of_business, lat, lon)
            VALUES (?, ?, ?, ?, ?)
        """, (
            row.get("BUSINESS TRADE NAME", ""),
            row.get("BUSINESS ADDRESS", ""),
            row.get("LINE OF BUSINESS", ""),
            row.get("lat", None),
            row.get("lon", None)
        ))

    conn.commit()

conn.close()