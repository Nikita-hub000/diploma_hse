# inference_server.py
from fastapi import FastAPI, WebSocket
import uvicorn, numpy as np, json, d3rlpy, joblib, torch
import datetime

# ─── грузим две модели (можно одну, если хотите) ───────────────
left  = d3rlpy.algos.DiscreteCQLConfig().create(device="cpu")
left.create_impl((6,), 3)
left.load_model("cql/cql_agent.pt")
left_scaler = joblib.load("left_cql/scaler.pkl")

right = d3rlpy.algos.DiscreteCQLConfig().create(device="cpu")
right.create_impl((6,), 3)
# right.load_model("left_cql/cql_agent.pt")
# right_scaler = joblib.load("left_cql/scaler.pkl")

app = FastAPI()
# LOG = open("ai_left.ndjson", "a")


async def serve(ws: WebSocket, agent, scaler, isLeft):
    await ws.accept()
    while True:
        raw = np.asarray(json.loads(await ws.receive_text()), dtype=np.float32)
        obs = scaler.transform(raw[None])
        a   = int(agent.predict(obs)[0])
        # if isLeft:
        #     LOG.write(json.dumps({
        #         "ts": datetime.datetime.utcnow().isoformat(timespec="milliseconds"),
        #         "state": await ws.receive_text(),
        #         "action": a,
        #     })+"\n"); LOG.flush()
        await ws.send_text(str(a))

@app.websocket("/wsL")   # левый бот
async def ws_left(ws: WebSocket):
    await serve(ws, left, left_scaler, True)

@app.websocket("/wsR")   # правый бот
async def ws_right(ws: WebSocket):
    await serve(ws, right, right_scaler, False)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000, workers=1)
