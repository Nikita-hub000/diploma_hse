import pandas as pd
df = pd.read_json('right.ndjson', lines=True, chunksize=100000)
df = pd.concat(df, ignore_index=True)

assert (df["s"].str.len() == 6).all(), "state len != 6"

cols = ["ballX","ballY","vX","vY","p1Y","p2Y"]
S = pd.DataFrame(df["s"].to_list(), columns=cols)

print("---------- basic stats ----------")
print(S.describe().loc[["min","max","mean"]])

print("\naction distribution:")
print(df["a"].value_counts(normalize=True))

print("\nreward distribution:")
print(df["r"].value_counts())
print("\n% done frames:", df["d"].mean()*100)

dupes = (
    df
    .assign(s_tuple=df["s"].apply(tuple))  # список → хэшируемый tuple
    .duplicated(subset=["s_tuple", "a", "r", "d"])
    .mean() * 100
)
print("% duplicates:", dupes)
# r!=0 ↔ d==True ?
mismatch = ((df["r"]!=0) != df["d"]).sum()
print("reward/done mismatch:", mismatch)
