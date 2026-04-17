import os
import joblib
from sklearn.ensemble import RandomForestRegressor
from helper import build_feature_table

CATEGORIES = [
    "Food & Beverage",
    "Retail & Trading",
    "Beauty & Wellness",
    "IT & Software"
]

os.makedirs("models", exist_ok=True)

for cat in CATEGORIES:
    df = build_feature_table(cat, radius_m=500, include_label=True)

    # features + label
    y = df["label"]
    X = df.drop(columns=["label", "barangay_name"])

    model = RandomForestRegressor(
        n_estimators=300,
        random_state=42
    )
    model.fit(X, y)

    joblib.dump(
        {"model": model, "columns": X.columns.tolist()},
        f"models/{cat.replace(' ','_').replace('&','and')}.pkl"
    )

print("✅ Training done. Models saved in /models.")