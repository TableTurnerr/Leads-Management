"""Load Combined_Restaurants.csv + Top 50 Fast-Food Chains into Supabase.

Reuses the bucket_price / fmt_phone / cat_list pipeline from explore.py so
ingested data matches what the Streamlit app showed.

Usage:
    pip install -r ingest/requirements.txt
    cp ingest/.env.example ingest/.env  # fill in SUPABASE_URL + SERVICE_ROLE_KEY
    python ingest/ingest.py
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
DB_DIR = ROOT / "Database"
MAIN_CSV = DB_DIR / "Combined_Restaurants.csv"
CHAINS_CSV = DB_DIR / "Top 50 Fast-Food Chains in USA.csv"

BATCH_SIZE = 1000

load_dotenv(ROOT / "ingest" / ".env")
SUPABASE_URL = os.environ["SUPABASE_URL"]
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

sb = create_client(SUPABASE_URL, SERVICE_ROLE)


def bucket_price(p) -> str:
    if pd.isna(p) or str(p).strip() == "":
        return "Unknown"
    p = str(p).strip()
    if re.match(r"^\${1,6}$", p):
        return p
    nums = re.findall(r"\d+", p)
    if nums:
        avg = (int(nums[0]) + int(nums[-1])) / 2
        if avg < 12:
            return "$"
        if avg < 25:
            return "$$"
        if avg < 50:
            return "$$$"
        return "$$$$"
    return "Unknown"


def fmt_phone(p) -> str | None:
    if pd.isna(p):
        return None
    digits = str(p).strip()
    if not digits:
        return None
    if len(digits) == 11 and digits.startswith("1"):
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return digits


def to_cat_list(x) -> list[str]:
    if pd.isna(x) or not str(x).strip():
        return []
    return [c.strip() for c in str(x).split(",") if c.strip()]


def load_chain_names() -> set[str]:
    chains = pd.read_csv(CHAINS_CSV, encoding="utf-8-sig")
    col = chains.columns[0]
    return {str(n).strip().lower() for n in chains[col].dropna()}


def ingest_chains():
    chains = pd.read_csv(CHAINS_CSV, encoding="utf-8-sig")
    col = chains.columns[0]
    names = [str(n).strip() for n in chains[col].dropna() if str(n).strip()]
    rows = [{"name": n} for n in sorted(set(names))]
    print(f"Inserting {len(rows)} fast-food chain names…")
    sb.table("fast_food_chains").upsert(rows).execute()


def ingest_restaurants():
    print(f"Reading {MAIN_CSV.name}…")
    df = pd.read_csv(MAIN_CSV, encoding="utf-8-sig", low_memory=False)
    print(f"Loaded {len(df):,} rows.")

    df["country"] = df["country"].replace({"United States": "US", "United Kingdom": "UK"})
    for col in ["rating", "latitude", "longitude"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    for col in ["ratings", "position"]:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    df["price_bucket"] = df["price_range"].apply(bucket_price)
    df["cat_list"] = df["category"].apply(to_cat_list)
    df["phone"] = df["phone"].apply(fmt_phone)

    chain_set = load_chain_names()
    df["is_chain"] = df["name"].astype(str).str.strip().str.lower().isin(chain_set)
    df["dataset"] = "main"

    cols = [
        "name", "address", "city", "province", "postal_code", "country",
        "latitude", "longitude", "website", "phone", "category", "categories",
        "cat_list", "rating", "ratings", "price_range", "price_bucket",
        "position", "link", "images", "geo_coordinates", "time_zone",
        "keys", "location_name", "is_chain", "dataset",
    ]
    df = df[cols]

    # NaN → None for JSON serialization (Supabase REST won't accept NaN)
    df = df.astype(object).where(pd.notna(df), None)
    records = df.to_dict(orient="records")

    print(f"Upserting {len(records):,} restaurants in batches of {BATCH_SIZE}…")
    with tqdm(total=len(records), unit="row") as bar:
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            sb.table("restaurants").upsert(
                batch,
                on_conflict="dataset,name,address,city,province",
            ).execute()
            bar.update(len(batch))


def main():
    if not MAIN_CSV.exists():
        print(f"Missing CSV: {MAIN_CSV}", file=sys.stderr)
        sys.exit(1)
    ingest_chains()
    ingest_restaurants()
    print("Done.")


if __name__ == "__main__":
    main()
