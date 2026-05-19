"""Load Combined_Restaurants.csv + Top 50 Fast-Food Chains into Supabase.

Posts batches straight to PostgREST so we don't need supabase-py (which pulls
in pyiceberg and friends and won't build on Python 3.14 without MSVC).

Usage:
    pip install -r ingest/requirements.txt
    cp ingest/.env.example ingest/.env   # fill SUPABASE_URL + SERVICE_ROLE_KEY
    python ingest/ingest.py
"""
from __future__ import annotations

import os
import re
import sys
import time
from pathlib import Path

import httpx
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
DB_DIR = ROOT / "Database"
MAIN_CSV = DB_DIR / "Combined_Restaurants.csv"
CHAINS_CSV = DB_DIR / "Top 50 Fast-Food Chains in USA.csv"

BATCH_SIZE = 1000
TIMEOUT = 60.0

load_dotenv(ROOT / "ingest" / ".env")
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SERVICE_ROLE = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

REST = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SERVICE_ROLE,
    "Authorization": f"Bearer {SERVICE_ROLE}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates,return=minimal",
}

client = httpx.Client(headers=HEADERS, timeout=TIMEOUT)


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


def post(table: str, rows: list[dict], on_conflict: str | None = None) -> None:
    url = f"{REST}/{table}"
    params = {"on_conflict": on_conflict} if on_conflict else None
    for attempt in range(3):
        r = client.post(url, json=rows, params=params)
        if r.status_code < 300:
            return
        if r.status_code in (429, 503) and attempt < 2:
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"{r.status_code} from {table}: {r.text[:500]}")


def ingest_chains():
    chains = pd.read_csv(CHAINS_CSV, encoding="utf-8-sig")
    col = chains.columns[0]
    names = [str(n).strip() for n in chains[col].dropna() if str(n).strip()]
    rows = [{"name": n} for n in sorted(set(names))]
    print(f"Inserting {len(rows)} fast-food chain names...")
    post("fast_food_chains", rows, on_conflict="name")


def ingest_restaurants():
    print(f"Reading {MAIN_CSV.name}...")
    df = pd.read_csv(MAIN_CSV, encoding="utf-8-sig", low_memory=False)
    print(f"Loaded {len(df):,} rows.")

    before = len(df)
    df = df[df["name"].notna() & (df["name"].astype(str).str.strip() != "")].copy()
    dropped = before - len(df)
    if dropped:
        print(f"Dropped {dropped:,} rows with missing name.")

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

    df = df.astype(object).where(pd.notna(df), None)
    records = df.to_dict(orient="records")

    print(f"Upserting {len(records):,} restaurants in batches of {BATCH_SIZE}...")
    with tqdm(total=len(records), unit="row") as bar:
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            post(
                "restaurants",
                batch,
                on_conflict="dataset,name,address,city,province",
            )
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
