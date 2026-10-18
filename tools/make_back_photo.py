# Builds assets/shirt-back-original.png from the front product photo:
# the front neckline (rib band + the inside of the back neck) is filled with body fabric
# and a back collar band is drawn along the top edge.
# Run from the repo root: python3 tools/make_back_photo.py
from PIL import Image, ImageFilter
import numpy as np
src = np.asarray(Image.open('assets/shirt-front-original.png').convert('RGB')).astype(float)
H, W, _ = src.shape
C = 299.5
HALF = 50.75     # half neck width (HPS to centre), px
BAND = 15        # back collar band height, px
top = lambda x: 110.5 + 10.5 * (1 - ((x - C) / HALF) ** 2)
outer = lambda dx: np.interp(abs(dx), [0, 30, 50, 62, 74, 84], [197, 192, 180, 164, 144, 124])
inside = src.min(axis=2) < 235
rng = np.random.default_rng(3)
out = src.copy()
mask = np.zeros((H, W), np.uint8)
for x in range(int(C - 86), int(C + 87)):
    dx = x - C
    ys = [y for y in range(95, int(outer(dx)) + 1) if inside[y, x]]
    if not ys: continue
    y0 = int(top(x) + BAND) if abs(dx) <= HALF else ys[0] + 2
    for y in range(y0, int(outer(dx)) + 1):
        out[y, x] = src[214 + (y % 10), x] * (1 + 0.004 * rng.standard_normal())
        mask[y, x] = 255
    if abs(dx) <= HALF:
        t = top(x)
        for y in range(int(np.ceil(t)), int(t + BAND)):
            k = 0.93 + 0.03 * np.sin(x * 2.1) - 0.05 * ((y - t) / BAND) ** 3
            out[y, x] = src[214 + (y % 6), x] * k
        yb = int(round(t + BAND))
        out[yb, x] *= 0.86; out[yb + 1, x] *= 0.94
img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
soft = img.filter(ImageFilter.GaussianBlur(1.4))
m = Image.fromarray(mask).filter(ImageFilter.GaussianBlur(2))
# keep the band crisp: don't blur rows above the band seam
mm = np.asarray(m).copy()
for x in range(int(C - HALF), int(C + HALF) + 1): mm[:int(top(x) + BAND + 2), x] = 0
img.paste(soft, (0, 0), Image.fromarray(mm))
img.save('assets/shirt-back-original.png')
print('ok')
