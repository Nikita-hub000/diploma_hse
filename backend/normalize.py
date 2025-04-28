# normalise.py  --------------------------------------------
import json, sys, argparse, gzip, pathlib, math

parser = argparse.ArgumentParser()
parser.add_argument("w", type=float)        # ширина оригинального поля
parser.add_argument("h", type=float)        # высота
args = parser.parse_args()

for line in sys.stdin:
    if not line.strip():
        continue
    obj = json.loads(line)
    s = obj["s"]                # [x, y, vx, vy, pad1Y, pad2Y]
    s[0] /= args.w;  s[2] /= args.w
    s[1] /= args.h;  s[3] /= args.h
    s[4] /= args.h;  s[5] /= args.h
    print(json.dumps(obj))
