# save_ws.py  — приёмник NDJSON-логов
import asyncio, json, gzip, uuid, pathlib, websockets

LOG_DIR = pathlib.Path("logs")
LOG_DIR.mkdir(exist_ok=True)

async def handler(ws):
    sid = uuid.uuid4().hex[:8]
    f_left  = gzip.open(LOG_DIR / f"L_{sid}.ndjson.gz", "wt")
    f_right = gzip.open(LOG_DIR / f"R_{sid}.ndjson.gz", "wt")
    print(ws)
    try:
        async for line in ws:                       # ждём сообщения от вкладки
            obj = json.loads(line)    
            print(obj)              # {side:"L"|"R", s, a, r, d}
            (f_left if obj["side"] == "L" else f_right).write(line + "\n")
    finally:
        f_left.close(); f_right.close()
        print("closed", sid)

async def main():
    async with websockets.serve(handler, "", 8765):
        print("WS-logger listening on :8765")
        await asyncio.Future()                      # держим процесс «вечно»

if __name__ == "__main__":
    asyncio.run(main())
