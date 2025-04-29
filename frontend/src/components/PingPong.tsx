import { useEffect, useRef, useState } from "react";

const WS_LOG_URL = "ws://localhost:8765";
const WS_INFER_L = "ws://localhost:9000/wsL";
const WS_INFER_R = "ws://localhost:9000/wsR";

const PADDLE_H = 200, PADDLE_W = 10, BALL_SZ = 20;
const INIT_SPEED = 3, PADDLE_SPEED = 7;
const MAX_ANGLE = Math.PI / 4, SPEED_GAIN = 0.1;

interface GameState {
    ballX: number; ballY: number; ballSpeedX: number; ballSpeedY: number;
    paddle1Y: number; paddle2Y: number; score1: number; score2: number; hitCount: number;
}
interface Transition { s: number[]; a: 0 | 1 | 2; r: number; d: boolean; }

export default function PingPong() {
    const [mode, setMode] = useState<"none" | "left" | "right" | "both">("left");
    const [showInfo, setInfo] = useState(false);
    const [showMenu, setMenu] = useState(false);

    const hostRef = useRef<HTMLDivElement>(null);
    const wsLog = useRef<WebSocket | null>(null);
    const wsL = useRef<WebSocket | null>(null);
    const wsR = useRef<WebSocket | null>(null);

    const [S, setS] = useState<GameState>({
        ballX: 50, ballY: 50, ballSpeedX: 1, ballSpeedY: 1,
        paddle1Y: 50, paddle2Y: 50, score1: 0, score2: 0, hitCount: 0,
    });

    const pressed = useRef(new Set<string>());
    useEffect(() => {
        const kd = (e: KeyboardEvent) => pressed.current.add(e.key);
        const ku = (e: KeyboardEvent) => pressed.current.delete(e.key);
        window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
        return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
    }, []);

    /* WS-подключения (один раз) */
    useEffect(() => {
        wsLog.current = new WebSocket(WS_LOG_URL);
        wsL.current = new WebSocket(WS_INFER_L);
        wsR.current = new WebSocket(WS_INFER_R);
        wsL.current.onmessage = ev => aiLeft.current = Number(ev.data) as 0 | 1 | 2;
        wsR.current.onmessage = ev => aiRight.current = Number(ev.data) as 0 | 1 | 2;
        return () => { wsLog.current?.close(); wsL.current?.close(); wsR.current?.close(); };
    }, []);

    const aiLeft = useRef<0 | 1 | 2>(1);
    const aiRight = useRef<0 | 1 | 2>(1);

    const bufL = useRef<Transition[]>([]), bufR = useRef<Transition[]>([]);
    const prevStateL = useRef<number[] | null>(null);
    const prevStateR = useRef<number[] | null>(null);
    const prevActL = useRef<0 | 1 | 2>(1);
    const prevActR = useRef<0 | 1 | 2>(1);

    useEffect(() => {
        const host = hostRef.current; if (!host) return;
        const W = host.clientWidth, H = host.clientHeight;

        const resetBall = (dir: "left" | "right") => setS(p => ({
            ...p,
            ballX: W / 2, ballY: H / 2,
            ballSpeedX: dir === "left" ? -INIT_SPEED : INIT_SPEED,
            ballSpeedY: (Math.random() - .5) * INIT_SPEED,
            hitCount: 0,
        }));
        const centrePads = () => setS(p => ({ ...p, paddle1Y: (H - PADDLE_H) / 2, paddle2Y: (H - PADDLE_H) / 2 }));

        centrePads(); resetBall("left");

        const send = (ws: WebSocket | null, data: any) => ws?.readyState === 1 && ws.send(JSON.stringify(data));

        const sendToBots = (g: GameState) => {
            const s = [g.ballX, g.ballY, g.ballSpeedX, g.ballSpeedY, g.paddle1Y, g.paddle2Y];
            if (mode === "left" || mode === "both") send(wsL.current, s);
            if (mode === "right" || mode === "both") send(wsR.current, s);
        };
        sendToBots(S);

        const step = () => {
            setS(prev => {
                const botL = mode === "left" || mode === "both";
                const botR = mode === "right" || mode === "both";

                const aL: 0 | 1 | 2 = botL ? aiLeft.current :
                    pressed.current.has("w") ? 0 : pressed.current.has("s") ? 2 : 1;
                const aR: 0 | 1 | 2 = botR ? aiRight.current :
                    pressed.current.has("ArrowUp") ? 0 : pressed.current.has("ArrowDown") ? 2 : 1;

                const n = { ...prev };
                const oldX = n.ballX
                n.ballX += n.ballSpeedX; n.ballY += n.ballSpeedY;
                if (n.ballY <= 0 || n.ballY >= H - BALL_SZ) n.ballSpeedY = -n.ballSpeedY;

                if (aL === 0 && n.paddle1Y > 0) n.paddle1Y -= PADDLE_SPEED;
                if (aL === 2 && n.paddle1Y < H - PADDLE_H) n.paddle1Y += PADDLE_SPEED;
                if (aR === 0 && n.paddle2Y > 0) n.paddle2Y -= PADDLE_SPEED;
                if (aR === 2 && n.paddle2Y < H - PADDLE_H) n.paddle2Y += PADDLE_SPEED;

                /* --- точные столкновения (сегмент) ----------------------------- */
                const crossesLeft = oldX >= PADDLE_W && n.ballX <= PADDLE_W &&
                    n.ballY + BALL_SZ > n.paddle1Y && n.ballY < n.paddle1Y + PADDLE_H;
                const crossesRight = oldX + BALL_SZ <= W - PADDLE_W && n.ballX + BALL_SZ >= W - PADDLE_W &&
                    n.ballY + BALL_SZ > n.paddle2Y && n.ballY < n.paddle2Y + PADDLE_H;

                if (crossesLeft || crossesRight) {
                    const hitL = crossesLeft;
                    const yPad = hitL ? n.paddle1Y : n.paddle2Y;
                    const sign = hitL ? 1 : -1;
                    const rel = yPad + PADDLE_H / 2 - n.ballY;
                    const ang = rel / (PADDLE_H / 2) * MAX_ANGLE;
                    n.hitCount++;
                    const spd = INIT_SPEED + n.hitCount * SPEED_GAIN;
                    n.ballSpeedX = sign * Math.cos(ang) * spd;
                    n.ballSpeedY = -Math.sin(ang) * spd;
                    /* прижимаем к краю */
                    n.ballX = hitL ? PADDLE_W : W - PADDLE_W - BALL_SZ;
                }

                /* --- голы ------------------------------------------------------ */
                let rL = 0, rR = 0, done = false;
                if (n.ballX <= 0) { n.score2++; rL = -1; rR = 1; done = true; resetBall("left"); centrePads(); }
                else if (n.ballX >= W - BALL_SZ) { n.score1++; rL = 1; rR = -1; done = true; resetBall("right"); centrePads(); }

                /* --- логирование ---------------------------------------------- */
                const curL = [prev.ballX, prev.ballY, prev.ballSpeedX, prev.ballSpeedY, prev.paddle1Y, prev.paddle2Y];
                const curR = [W - prev.ballX, prev.ballY, -prev.ballSpeedX, prev.ballSpeedY, prev.paddle2Y, prev.paddle1Y];
                if (prevStateL.current) {
                    bufL.current.push({ s: prevStateL.current, a: prevActL.current, r: rL, d: done });
                    send(wsLog.current, { side: "L", s: prevStateL.current, a: prevActL.current, r: rL, d: done });
                }
                if (prevStateR.current) {
                    bufR.current.push({ s: prevStateR.current, a: prevActR.current, r: rR, d: done });
                    send(wsLog.current, { side: "R", s: prevStateR.current, a: prevActR.current, r: rR, d: done });
                }
                prevStateL.current = curL; prevStateR.current = curR;
                prevActL.current = aL; prevActR.current = aR;

                sendToBots(n);
                return n;
            });
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, [mode]);

    const exportData = () => {
        const dump = (arr: Transition[], name: string) => {
            if (!arr.length) return;
            const blob = new Blob(arr.map(t => JSON.stringify(t) + "\n"), { type: "application/x-ndjson" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `${name}_${Date.now()}.ndjson`; a.click();
            URL.revokeObjectURL(url);
        };
        dump(bufL.current, "left"); dump(bufR.current, "right");
    };

    return (
        <div ref={hostRef} style={{ position: "relative", width: "100%", height: "100%", background: "black" }}>
            <div style={{ position: "absolute", left: 0, top: S.paddle1Y, width: PADDLE_W, height: PADDLE_H, background: "white" }} />
            <div style={{ position: "absolute", right: 0, top: S.paddle2Y, width: PADDLE_W, height: PADDLE_H, background: "white" }} />
            <div style={{ position: "absolute", left: S.ballX, top: S.ballY, width: BALL_SZ, height: BALL_SZ, borderRadius: "50%", background: "white" }} />
            <div style={{ position: "absolute", left: "25%", top: 20, color: "white", fontSize: 32 }}>{S.score1}</div>
            <div style={{ position: "absolute", right: "25%", top: 20, color: "white", fontSize: 32 }}>{S.score2}</div>

            <button style={{ position: "absolute", right: "calc(50% - 100px)", top: 10, width: 200 }}
                onClick={() => setInfo(true)}>Управление</button>
            <button style={{ position: "absolute", right: "calc(50% - 50px)", top: 60, width: 100 }}
                onClick={() => setMenu(true)}>Меню</button>
            <button style={{ position: "absolute", bottom: 20, right: 20 }}
                onClick={exportData}>Export NDJSON</button>

            {showMenu && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100 }}
                    onClick={() => setMenu(false)}>
                    <div style={{
                        position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", color: "white",
                        display: "flex", flexDirection: "column", gap: 10, background: "#0008", padding: 20
                    }}>
                        <h2>Режим игры</h2>
                        <button onClick={() => { setMode("none"); setMenu(false); }}>Пользователь vs пользователь</button>
                        <button onClick={() => { setMode("left"); setMenu(false); }}>Пользователь vs бот</button>
                        <button onClick={() => { setMode("both"); setMenu(false); }}>Бот vs бот</button>
                    </div>
                </div>)}

            {showInfo && (
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100 }}
                    onClick={() => setInfo(false)}>
                    <div style={{ position: "absolute", top: 60, left: 60, color: "white", background: "#0008", padding: 20 }}>
                        <h2>Управление</h2>
                        <p>Левый паддл: <b>W / S</b></p>
                        <p>Правый паддл: <b>↑ / ↓</b></p>
                    </div>
                </div>)}
        </div>);
}
