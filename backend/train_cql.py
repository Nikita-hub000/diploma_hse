import os, json, pathlib, random
import numpy as np
import torch, torch.nn as nn, torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from tqdm.auto import tqdm
from collections import Counter

NDJSON_FILE = "left_full.ndjson"   
OUT_DIR     = "left_cql"           
EPOCHS      = 50_000               
BATCH       = 2_048
ALPHA       = 1.0
LR          = 6.25e-4
LAYERS      = (512, 512, 256)
device      = "cuda" if torch.cuda.is_available() else "cpu"
print("device:", device.upper())

def load(path):
    with open(path, encoding="utf-8") as fp:
        return [json.loads(l) for l in fp if l.strip()]

raw = load(NDJSON_FILE)
print(f"lines loaded: {len(raw):,}")

s,a,r,d = [],[],[],[]
for cur,nxt in zip(raw, raw[1:]):
    if cur["d"]:
        continue
    s.append(np.float32(cur["s"]))
    a.append(cur["a"])
    r.append(nxt["r"])
    d.append(nxt["d"])
s_next = [np.float32(n["s"]) for n,c in zip(raw[1:],raw) if not c["d"]]

obs  = np.stack(s);     nobs = np.stack(s_next)
acts = np.int64(a);      rews = np.float32(r);  term = np.bool_(d)
print("shapes:", obs.shape, acts.shape)

class RLDataset(Dataset):
    def __init__(self,o,no,a,r,t): self.o,self.no,self.a,self.r,self.t=o,no,a,r,t
    def __len__(self): return len(self.a)
    def __getitem__(self,i): return self.o[i],self.a[i],self.r[i],self.no[i],self.t[i]

dl = DataLoader(RLDataset(obs,nobs,acts,rews,term),
                batch_size=BATCH, shuffle=True, pin_memory=True)

class QNet(nn.Module):
    def __init__(self, nS, nA):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(nS, LAYERS[0]), nn.ReLU(),
            nn.Linear(LAYERS[0], LAYERS[1]), nn.ReLU(),
            nn.Linear(LAYERS[1], LAYERS[2]), nn.ReLU(),
            nn.Linear(LAYERS[2], nA)
        )
    def forward(self,x): return self.net(x)

n_state  = obs.shape[1];  n_action = 3
policy = QNet(n_state,n_action).to(device)
target = QNet(n_state,n_action).to(device)
target.load_state_dict(policy.state_dict())

opt   = optim.Adam(policy.parameters(), lr=LR)
gamma = 0.99
tau   = 8_000                  

def cql_loss(q, logexp, a, r, q2, done, alpha=ALPHA):
    td_tgt = r + gamma*torch.max(q2,1)[0]*(~done)
    td     = nn.functional.mse_loss(q.gather(1,a.unsqueeze(1)).squeeze(), td_tgt)
    consv  = (logexp - q.gather(1,a.unsqueeze(1)).detach()).mean()
    return td, consv, td + alpha*consv

step, meter = 0, Counter()
pbar = tqdm(total=EPOCHS, unit="grad")
while step < EPOCHS:
    for batch in dl:
        step += 1
        if step > EPOCHS: break
        o,a,r,no,done = [torch.as_tensor(t,device=device) for t in batch]
        q = policy(o)
        with torch.no_grad(): q2 = target(no)
        td, cons, loss = cql_loss(q, torch.logsumexp(q,1), a, r, q2, done)
        opt.zero_grad(); loss.backward(); opt.step()
        if step % tau == 0: target.load_state_dict(policy.state_dict())
        meter['loss']+=loss.item(); meter['td']+=td.item(); meter['cons']+=cons.item()
        if step % 1000 == 0:
            pbar.set_postfix(loss=f"{meter['loss']/1000:.3f}",
                             td=f"{meter['td']/1000:.3f}",
                             cons=f"{meter['cons']/1000:.3f}")
            meter.clear(); pbar.update(1000)
pbar.close()

out = pathlib.Path(OUT_DIR); out.mkdir(exist_ok=True, parents=True)
torch.save(policy.state_dict(), out/"cql_agent.pt")
print("saved", out/"cql_agent.pt")
