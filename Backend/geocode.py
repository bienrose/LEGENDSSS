import pandas as pd
import sqlite3
import time
from geopy.geocoders import Nominatim
from tqdm import tqdm

# =========================
# 1. LOAD EXCEL FILE
# =========================
df = pd.read_excel("Classified_Small_SMES_UPDATED.xlsx")

# CLEAN DATA
df = df.dropna(subset=["BUSINESS ADDRESS"])
df["BUSINESS ADDRESS"] = df["BUSINESS ADDRESS"].str.strip()
df = df.drop_duplicates(subset=["BUSINESS ADDRESS"])

print(f"Total rows after cleaning: {len(df)}")

# =========================
# 2. CONNECT SQLITE DB
# =========================
conn = sqlite3.connect("geocoding.db")
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS geocoded (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_name TEXT,
    address TEXT UNIQUE,
    lat REAL,
    lon REAL,
    status TEXT
)
""")

conn.commit()

# =========================
# 3. LOAD ALREADY DONE DATA (RESUME SYSTEM)
# =========================
cursor.execute("SELECT address FROM geocoded")
done = set(row[0] for row in cursor.fetchall())

print(f"Already geocoded: {len(done)}")

# =========================
# 4. SETUP GEOCODER
# =========================
geolocator = Nominatim(user_agent="thesis_geocoder")

# =========================
# 5. GEOCODING LOOP
# =========================
for _, row in tqdm(df.iterrows(), total=len(df)):

    address = row["BUSINESS ADDRESS"]
    name = row.get("BUSINESS TRADE NAME", "")

    # skip if already processed
    if address in done:
        continue

    try:
        location = geolocator.geocode(address, timeout=10)

        if location:
            lat = location.latitude
            lon = location.longitude
            status = "OK"
        else:
            lat = None
            lon = None
            status = "NOT FOUND"

        # save to database
        cursor.execute("""
            INSERT OR IGNORE INTO geocoded
            (business_name, address, lat, lon, status)
            VALUES (?, ?, ?, ?, ?)
        """, (name, address, lat, lon, status))

        conn.commit()

        # IMPORTANT: prevent API blocking (429 error)
        time.sleep(1)

    except Exception as e:
        print(f"Error on: {address} -> {e}")
        time.sleep(2)

# =========================
# 6. DONE
# =========================
conn.close()
print("Geocoding completed successfully!")