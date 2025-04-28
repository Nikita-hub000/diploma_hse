# ╔═════════════════════════════════════════════════════════════════╗
# ║  Colab: обучение двух Discrete-CQL-агентов                      ║
# ╚═════════════════════════════════════════════════════════════════╝
# !pip3 -q install "d3rlpy[torch]" scikit-learn pandas joblib "gym<=0.25.2"
# примерно 1 час на 500k данных
# ─── константы ────────────────────────────────────────────────────
LEFT_FILE  = "left_full.ndjson"
RIGHT_FILE = "right_full.ndjson"
WIDTH, HEIGHT = 800, 600
EPOCHS      = 50          # 50 k grad-шагов
BATCH_SIZE  = 2048        
OUT_L       = "left_cql"
OUT_R       = "right_cql"

import json, joblib, numpy as np, pandas as pd, torch
from pathlib import Path
from sklearn.preprocessing import MinMaxScaler
from d3rlpy.dataset import MDPDataset
from d3rlpy.algos   import DiscreteCQLConfig         

def load_ndjson(path):
    with open(path, encoding="utf-8") as fp:
        return [json.loads(l) for l in fp if l.strip()]

def build_dataset(raw, W, H):
    df   = pd.DataFrame(raw)
    mask = ~df["d"]                            # кадры до done
    cur  = df[mask].reset_index(drop=True)
    nxt  = df[mask.shift(-1, fill_value=False)].reset_index(drop=True)

    obs      = np.vstack(cur["s"]).astype("float32")
    next_obs = np.vstack(nxt["s"]).astype("float32")

    obs[:, [0,2]]      /= W;  next_obs[:, [0,2]]      /= W   
    obs[:, [1,3,4,5]]  /= H;  next_obs[:, [1,3,4,5]]  /= H  

    return dict(
        obs      = obs,
        next_obs = next_obs,
        acts     = cur["a"].to_numpy(np.int64),
        rews     = nxt["r"].to_numpy(np.float32),
        dones    = nxt["d"].to_numpy(np.bool_)
    )

def train(pack, out_dir):
    out = Path(out_dir); out.mkdir(parents=True, exist_ok=True)
    scaler = MinMaxScaler((0,1)); scaler.fit(pack["obs"])

    obs      = scaler.transform(pack["obs"]).astype("float32")
    next_obs = scaler.transform(pack["next_obs"]).astype("float32")
    zeros    = np.zeros_like(pack["dones"], dtype=bool)

    ds = MDPDataset(
        observations      = obs,
        actions           = pack["acts"],
        rewards           = pack["rews"],
        terminals         = pack["dones"],
        timeouts          = zeros,
        action_size       = 3,          # 0 / 1 / 2
    )

    cfg   = DiscreteCQLConfig(batch_size=BATCH_SIZE)
    agent = cfg.create(device="cuda" if torch.cuda.is_available() else "cpu")

    agent.fit(ds, n_steps=EPOCHS*1000, show_progress=True)
    agent.save_model(out/"cql_agent.pt")
    joblib.dump(scaler, out/"scaler.pkl")

print("⏳ читаем NDJSON …")
left_raw, right_raw = load_ndjson(LEFT_FILE), load_ndjson(RIGHT_FILE)
print(f"строк: left {len(left_raw):,}   right {len(right_raw):,}")

print("⏳ строим датасеты …")
ds_left  = build_dataset(left_raw,  WIDTH, HEIGHT)
ds_right = build_dataset(right_raw, WIDTH, HEIGHT)

print("🚀 обучаем LEFT …");  train(ds_left,  OUT_L)
print("🚀 обучаем RIGHT …"); train(ds_right, OUT_R)

print("🎉 модели сохранены в", OUT_L, "и", OUT_R)


#  right  [info     ] DiscreteCQL_20250428222140: epoch=5 step=50000 epoch=5 metrics={'time_sample_batch': 0.026845773601531984, 'time_algorithm_update': 0.005253050231933593, 'loss': 0.7329454589426517, 'td_loss': 0.09148620612919331, 'conservative_loss': 0.6414592528641224, 'time_step': 0.03228092696666718} step=50000
# left [info     ] DiscreteCQL_20250428215412: epoch=5 step=50000 epoch=5 metrics={'time_sample_batch': 0.02693500084877014, 'time_algorithm_update': 0.005229049253463745, 'loss': 0.7423939689397812, 'td_loss': 0.08114856857173144, 'conservative_loss': 0.6612454006493091, 'time_step': 0.032347464609146115} step=50000

