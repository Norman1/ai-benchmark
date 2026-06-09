from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "medium-earth-reference.png"
OUT = ROOT / "public" / "assets" / "medium-earth-clean.png"

NEUTRAL = np.array([202, 202, 202], dtype=np.uint8)


def connected_components(mask):
    height, width = mask.shape
    seen = np.zeros(mask.shape, dtype=bool)
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            pixels = []
            queue = deque([(x, y)])
            seen[y, x] = True
            while queue:
                cx, cy = queue.popleft()
                pixels.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((nx, ny))
            yield pixels


def dilate(mask, radius=1):
    image = Image.fromarray((mask * 255).astype(np.uint8))
    image = image.filter(ImageFilter.MaxFilter(radius * 2 + 1))
    return np.asarray(image) > 0


def local_fill(arr, mask, fallback):
    height, width = mask.shape
    out = arr.copy()
    components = list(connected_components(mask))
    for pixels in components:
        xs = np.array([p[0] for p in pixels])
        ys = np.array([p[1] for p in pixels])
        min_x, max_x = xs.min(), xs.max()
        min_y, max_y = ys.min(), ys.max()
        pad = 8
        x0, x1 = max(0, min_x - pad), min(width, max_x + pad + 1)
        y0, y1 = max(0, min_y - pad), min(height, max_y + pad + 1)
        local = out[y0:y1, x0:x1]
        local_mask = mask[y0:y1, x0:x1]
        samples = local[~local_mask]
        samples = samples[
            (samples[:, 0] > 80)
            & (samples[:, 1] > 80)
            & (samples[:, 2] > 80)
            & ~((samples[:, 1] > 135) & (samples[:, 0] < 90) & (samples[:, 2] < 110))
        ]
        color = np.median(samples, axis=0).astype(np.uint8) if len(samples) else fallback
        out[ys, xs] = color
    return out


def main():
    image = Image.open(SRC).convert("RGB")
    arr = np.asarray(image).copy()
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]

    # Turn random-warlord green territory fills back into ordinary neutral land.
    green_picks = (g > 130) & (r < 80) & (b < 100)
    arr[green_picks] = NEUTRAL

    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    dark = (r < 55) & (g < 55) & (b < 55)

    digit_mask = np.zeros(dark.shape, dtype=bool)
    for pixels in connected_components(dark):
        xs = [p[0] for p in pixels]
        ys = [p[1] for p in pixels]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        w = max_x - min_x + 1
        h = max_y - min_y + 1
        area = len(pixels)
        if 5 <= area <= 180 and 3 <= w <= 24 and 5 <= h <= 24:
            cx = (min_x + max_x) // 2
            cy = (min_y + max_y) // 2
            around = arr[max(0, cy - 12) : cy + 13, max(0, cx - 12) : cx + 13]
            saturated = np.mean(
                ((around[:, :, 0] > 150) & (around[:, :, 1] < 80))
                | ((around[:, :, 2] > 120) & (around[:, :, 0] < 90))
                | ((around[:, :, 0] > 150) & (around[:, :, 1] > 120) & (around[:, :, 2] < 80))
            )
            if saturated > 0.18:
                continue
            for x, y in pixels:
                digit_mask[y, x] = True

    antialias = (r < 95) & (g < 95) & (b < 95)
    digit_mask = dilate(digit_mask, 1) & dilate(antialias, 1)
    arr = local_fill(arr, digit_mask, NEUTRAL)

    Image.fromarray(arr).save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
