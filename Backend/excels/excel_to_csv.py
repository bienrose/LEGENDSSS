import pandas as pd

df = pd.read_excel("geo3.xlsx")

df = df[
    ["BUSINESS TRADE NAME",
     "BUSINESS ADDRESS",
     "LINE OF BUSINESS",
     "Street",
     "Barangay",
     "lat",
     "lon"]
]

df.columns = [
    "business_trade_name",
    "business_address",
    "line_of_business",
    "street",
    "barangay",
    "lat",
    "lon"
]

df = df.fillna("")

# 🚨 NO HEADER ROW
df.to_csv(
    "clean_no_header3.csv",
    index=False,
    header=False,
    encoding="utf-8",
    sep=",",
    quoting=1
)

print("DONE")