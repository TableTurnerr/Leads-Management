import pandas as pd
from tqdm import tqdm

INPUT = "Cleaned/Combined_Restaurants.csv"
OUTPUT = "Cleaned/Combined_Restaurants.csv"
THRESHOLD = 10

print("Loading CSV...")
df = pd.read_csv(INPUT, dtype=str, low_memory=False)
print(f"Loaded {len(df):,} rows.\n")

name_col = "name"
addr_col = "address"

name_counts = df[name_col].value_counts()
frequent_names = name_counts[name_counts > THRESHOLD].index
print(f"Checking {len(frequent_names):,} names that appear >{THRESHOLD} times...\n")

names_to_remove = []
for name in tqdm(frequent_names, desc="Analysing names", unit="name"):
    subset = df[df[name_col] == name]
    if subset[addr_col].nunique() == len(subset):
        names_to_remove.append(name)

print(f"\nRestaurant names to remove (>{THRESHOLD} occurrences, all-different addresses): {len(names_to_remove)}")
for n in names_to_remove:
    print(f"  - {n!r}  ({name_counts[n]} rows)")

before = len(df)
print("\nFiltering rows...")
df_clean = df[~df[name_col].isin(names_to_remove)]
after = len(df_clean)

print(f"Rows removed  : {before - after:,}")
print(f"Rows remaining: {after:,}")

print("\nSaving cleaned data...")
df_clean.to_csv(OUTPUT, index=False, encoding="utf-8-sig")
print(f"Saved to {OUTPUT}")
