# merge_ws_logs.py
import gzip, json, pathlib, random, glob, sys

LOG_DIR = pathlib.Path("logs")
OUT_L   = "left.ndjson"
OUT_R   = "right.ndjson"

def collect(patterns, out_file):
    lines = []
    for pat in patterns:
        for fname in glob.glob(str(LOG_DIR / pat)):
            with gzip.open(fname, "rt") as fp:
                lines.extend(fp)      
    lines = list(set(lines))
    random.shuffle(lines)
    pathlib.Path(out_file).write_text("".join(lines))
    print(f"⊕ {out_file}:  {len(lines):,} строк")

collect(["L_*.ndjson.gz"], OUT_L)
collect(["R_*.ndjson.gz"], OUT_R)
