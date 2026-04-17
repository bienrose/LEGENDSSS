import pandas as pd
import numpy as np
import mysql.connector
from sklearn.neighbors import BallTree
from config import DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT

EARTH_RADIUS_M = 6371000

def get_conn():
    return mysql.connector.connect(
        host=DB_HOST, user=DB_USER, password=DB_PASS,
        database=DB_NAME, port=DB_PORT
    )

def fetch_demographics():
    conn = get_conn()
    df = pd.read_sql("""
        SELECT barangay_name, population, population_density, highest_age_group,
               avg_income_min, avg_income_max, gender_distribution
        FROM demographic_pasig
    """, conn)
    conn.close()
    return df

def fetch_businesses():
    conn = get_conn()
    df = pd.read_sql("""
        SELECT barangay, lat, lon, category
        FROM businesses
        WHERE lat IS NOT NULL AND lon IS NOT NULL
    """, conn)
    conn.close()
    return df

def compute_barangay_centroids(biz_df):
    grp = biz_df.groupby("barangay")[["lat","lon"]].mean().reset_index()
    grp.rename(columns={"barangay":"barangay_name"}, inplace=True)
    return grp

def competitor_count_by_centroid(biz_df, category, centroids_df, radius_m=500):
    cat_df = biz_df[biz_df["category"] == category].copy()

    if cat_df.empty:
        centroids_df["competitor_count"] = 0
        return centroids_df

    # BallTree expects radians
    cat_coords = np.radians(cat_df[["lat","lon"]].values)
    tree = BallTree(cat_coords, metric="haversine")

    centroids = np.radians(centroids_df[["lat","lon"]].values)
    radius_rad = radius_m / EARTH_RADIUS_M

    counts = tree.query_radius(centroids, r=radius_rad, count_only=True)
    centroids_df["competitor_count"] = counts
    return centroids_df

def build_feature_table(category, radius_m=500, include_label=True):
    demo = fetch_demographics()
    biz  = fetch_businesses()

    # total businesses per barangay
    biz_counts = biz.groupby("barangay").size().reset_index(name="total_businesses")
    biz_counts.rename(columns={"barangay":"barangay_name"}, inplace=True)

    # label = count of selected category per barangay
    cat_counts = biz[biz["category"] == category].groupby("barangay").size().reset_index(name="label")
    cat_counts.rename(columns={"barangay":"barangay_name"}, inplace=True)

    # centroid + competitor counts
    centroids = compute_barangay_centroids(biz)
    centroids = competitor_count_by_centroid(biz, category, centroids, radius_m=radius_m)

    # merge all features
    df = demo.merge(biz_counts, on="barangay_name", how="left") \
             .merge(centroids, on="barangay_name", how="left")

    df["total_businesses"] = df["total_businesses"].fillna(0)
    df["competitor_count"] = df["competitor_count"].fillna(0)

    if include_label:
        df = df.merge(cat_counts, on="barangay_name", how="left")
        df["label"] = df["label"].fillna(0)

   # add business_density proxy (per 1k residents)
    df["business_density"] = df["total_businesses"] / (df["population"] / 1000)

# encode categorical
    df["gender_distribution"] = df["gender_distribution"].map({"Male":0, "Female":1}).fillna(0)
    df = pd.get_dummies(df, columns=["highest_age_group"], drop_first=False)

    return df