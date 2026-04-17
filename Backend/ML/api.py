from flask import Flask, request, jsonify
import pandas as pd
import joblib
from helper import build_feature_table

app = Flask(__name__)

MODEL_MAP = {
    "FOOD": "Food & Beverage",
    "RETAIL": "Retail & Trading",
    "PERSONAL": "Beauty & Wellness",
    "TECH": "IT & Software"
}

def load_model(cat_name):
    key = cat_name.replace(" ","_").replace("&","and")
    return joblib.load(f"models/{key}.pkl")

@app.get("/predict")
def predict():
    category = request.args.get("category", "FOOD")
    barangay = request.args.get("barangay")  # optional
    top_n    = int(request.args.get("top", 5))
    radius   = int(request.args.get("radius", 500))

    cat_name = MODEL_MAP.get(category, "Food & Beverage")

    pack = load_model(cat_name)
    model = pack["model"]
    cols  = pack["columns"]

    df = build_feature_table(cat_name, radius_m=radius, include_label=False)

    # keep only columns used in training
    X = df[cols]

    df["score"] = model.predict(X)

    if barangay:
        df = df[df["barangay_name"] == barangay]

    df = df.sort_values("score", ascending=False).head(top_n)

    results = df[["barangay_name","lat","lon","score","competitor_count","total_businesses"]].to_dict("records")
    return jsonify({"success": True, "category": cat_name, "data": results})

if __name__ == "__main__":
    app.run(port=5001, debug=True)