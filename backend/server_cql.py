import torch, json, numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket

class QNet(torch.nn.Module):                   
    def __init__(self):
        super().__init__()
        self.net = torch.nn.Sequential(
            torch.nn.Linear(6,512), torch.nn.ReLU(),
            torch.nn.Linear(512,512), torch.nn.ReLU(),
            torch.nn.Linear(512,256), torch.nn.ReLU(),
            torch.nn.Linear(256,3)
        )
    def forward(self,x): return self.net(x)

model = QNet()
model.load_state_dict(torch.load("cql/cql_agent.pt", map_location="cpu"))
model.eval()

app = FastAPI()
@app.websocket("/wsL")
async def ws_left(ws: WebSocket):
    await ws.accept()
    while True:
        state = np.array(json.loads(await ws.receive_text()), dtype="float32")
        with torch.no_grad():
            q = model(torch.from_numpy(state).unsqueeze(0))
            action = int(torch.argmax(q,1))
        await ws.send_text(str(action))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=9000)
