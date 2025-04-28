// ДАННЫЙ ФАЙЛ НУЖЕН ДЛЯ СБОРКИ ДАННЫХ

import { useEffect, useRef, useState } from "react";

/* ────────── параметры сбора ────────── */
const EPS_L = 0.15;   // noise левой
const EPS_R = 0.20;   // noise правой
const SPD_L = 6;      // speed левой
const SPD_R = 4;      // speed правой
const WS_URL = "ws://localhost:8765";
const WIND_TICK = 9;
const WIND_STRENGTH = 0.15;     // макс. добавка к vY
const RAND_ANGLE = Math.PI / 60; // ±3° случайного угла при рикошете
const SPEED_STEP = 0.15;

/* ────────── поле ────────── */
const PADDLE_H = 200, PADDLE_W = 10, BALL_SZ = 20;
const INIT_SPEED = 3, MAX_ANGLE = Math.PI / 4, SPEED_GAIN = 0.1;

interface GameState {
    ballX: number; ballY: number; ballSpeedX: number; ballSpeedY: number;
    paddle1Y: number; paddle2Y: number;
    score1: number; score2: number; hitCount: number;
}
interface Transition { s: number[]; a: 0 | 1 | 2; r: number; d: boolean; }

export default function PingPong() {
    const hostRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    const [S, setS] = useState<GameState>({
        ballX: 50, ballY: 50, ballSpeedX: 1, ballSpeedY: 1,
        paddle1Y: 50, paddle2Y: 50, score1: 0, score2: 0, hitCount: 0
    });

    const bufL = useRef<Transition[]>([]), bufR = useRef<Transition[]>([]);
    const pSL = useRef<number[] | null>(null), pSR = useRef<number[] | null>(null);
    const pAL = useRef<0 | 1 | 2>(1), pAR = useRef<0 | 1 | 2>(1);

    useEffect(() => {
        wsRef.current = new WebSocket(WS_URL);
        return () => wsRef.current?.close();
    }, []);

    /* helpers */
    const asLeft = (g: GameState) => [g.ballX, g.ballY, g.ballSpeedX, g.ballSpeedY, g.paddle1Y, g.paddle2Y];
    const asRight = (g: GameState, W: number) => [W - g.ballX, g.ballY, -g.ballSpeedX, g.ballSpeedY, g.paddle2Y, g.paddle1Y];

    useEffect(() => {
        const host = hostRef.current!; const W = host.clientWidth, H = host.clientHeight;

        const centre = () => setS(p => ({ ...p, paddle1Y: (H - PADDLE_H) / 2, paddle2Y: (H - PADDLE_H) / 2 }));
        const reset = (dir: "left" | "right") => setS(p => ({
            ...p, ballX: W / 2, ballY: H / 2,
            ballSpeedX: dir === "left" ? -INIT_SPEED : INIT_SPEED,
            ballSpeedY: (Math.random() - .5) * INIT_SPEED, hitCount: 0,
        }));

        centre(); reset("left");
        let wind = 0


        const step = () => {
            setS(prev => {
                const n = { ...prev };
                n.ballX += n.ballSpeedX; n.ballY += n.ballSpeedY;
                if (n.ballY <= 0 || n.ballY >= H - BALL_SZ) n.ballSpeedY = -n.ballSpeedY;
                n.ballX = Math.min(Math.max(n.ballX, 0), W);
                n.ballY = Math.min(Math.max(n.ballY, 0), H);

                if (++wind >= WIND_TICK) {
                    wind = 0;
                    n.ballSpeedY += (Math.random() * 2 - 1) * WIND_STRENGTH;
                }
                let aL: 0 | 1 | 2 = 1, aR: 0 | 1 | 2 = 1;

                const dL = n.ballY - (n.paddle1Y + PADDLE_H / 2);
                if (dL < -2) aL = 0; else if (dL > 2) aL = 2;
                if (Math.random() < EPS_L) aL = Math.floor(Math.random() * 3) as 0 | 1 | 2;


                const dR = n.ballY - (n.paddle2Y + PADDLE_H / 2);
                if (dR < -2) aR = 0; else if (dR > 2) aR = 2;
                if (Math.random() < EPS_R) aR = Math.floor(Math.random() * 3) as 0 | 1 | 2;

                if (aL === 0 && n.paddle1Y > 0) n.paddle1Y -= SPD_L;
                if (aL === 2 && n.paddle1Y < H - PADDLE_H) n.paddle1Y += SPD_L;
                if (aR === 0 && n.paddle2Y > 0) n.paddle2Y -= SPD_R;
                if (aR === 2 && n.paddle2Y < H - PADDLE_H) n.paddle2Y += SPD_R;

                const hitL = n.ballX <= PADDLE_W &&
                    n.ballY >= n.paddle1Y && n.ballY <= n.paddle1Y + PADDLE_H;
                const hitR = n.ballX >= W - PADDLE_W - BALL_SZ &&
                    n.ballY >= n.paddle2Y && n.ballY <= n.paddle2Y + PADDLE_H;
                if (hitL || hitR) {
                    const yPad = hitL ? n.paddle1Y : n.paddle2Y, sign = hitL ? 1 : -1;
                    let ang = (yPad + PADDLE_H / 2 - n.ballY) / (PADDLE_H / 2) * MAX_ANGLE;
                    ang += (Math.random() * 2 - 1) * RAND_ANGLE;
                    n.hitCount++; const spd = INIT_SPEED + n.hitCount * (SPEED_GAIN + SPEED_STEP);
                    n.ballSpeedX = sign * Math.cos(ang) * spd; n.ballSpeedY = -Math.sin(ang) * spd;
                }

                let rL = 0, rR = 0, done = false;
                if (n.ballX <= 0) { n.score2++; rL = -1; rR = 1; done = true; centre(); reset("left"); }
                else if (n.ballX >= W - BALL_SZ) { n.score1++; rL = 1; rR = -1; done = true; centre(); reset("right"); }

                const curL = asLeft(prev), curR = asRight(prev, W);
                if (pSL.current) {
                    const t: { side: "L" } & Transition = { side: "L", s: pSL.current, a: pAL.current, r: rL, d: done };
                    bufL.current.push(t); wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(t));
                }
                if (pSR.current) {
                    const t: { side: "R" } & Transition = { side: "R", s: pSR.current, a: pAR.current, r: rR, d: done };
                    bufR.current.push(t); wsRef.current?.readyState === 1 && wsRef.current.send(JSON.stringify(t));
                }
                pSL.current = curL; pSR.current = curR; pAL.current = aL; pAR.current = aR;
                return n;
            });
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }, []);

    const dump = (arr: Transition[], name: string) => {
        if (!arr.length) return;
        const blob = new Blob(arr.map(t => JSON.stringify(t) + "\n"), { type: "application/x-ndjson" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `${name}_${Date.now()}.ndjson`; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div ref={hostRef} style={{ position: "relative", width: "100%", height: "100%", background: "black" }}>
            <div style={{ position: "absolute", left: 0, top: S.paddle1Y, width: PADDLE_W, height: PADDLE_H, background: "white" }} />
            <div style={{ position: "absolute", right: 0, top: S.paddle2Y, width: PADDLE_W, height: PADDLE_H, background: "white" }} />
            <div style={{ position: "absolute", left: S.ballX, top: S.ballY, width: 20, height: 20, borderRadius: "50%", background: "white" }} />
            <div style={{ position: "absolute", left: "25%", top: 20, color: "white", fontSize: 32 }}>{S.score1}</div>
            <div style={{ position: "absolute", right: "25%", top: 20, color: "white", fontSize: 32 }}>{S.score2}</div>
            <button onClick={() => { dump(bufL.current, "left"); dump(bufR.current, "right"); }}
                style={{ position: "absolute", bottom: 20, right: 20 }}>Export NDJSON</button>
        </div>
    );
}
