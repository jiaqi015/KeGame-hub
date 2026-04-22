#!/usr/bin/env python3
"""
Build public/kegame-wordmark.fg.png from public/kegame-wordmark-source.png:
edge-flood background removal + foreground lighten toward white + tight crop.
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image  # type: ignore


def is_bg(r: int, g: int, b: int, high: int = 52) -> bool:
    return max(r, g, b) <= high


def flood_knockout_rgba(im: Image.Image) -> None:
    w, h = im.size
    px = im.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(*px[x, y][:3]) and px[x, y][3] > 20:
                visited[y][x] = True
                q.append((x, y))
    for y in range(1, h - 1):
        for x in (0, w - 1):
            if is_bg(*px[x, y][:3]) and px[x, y][3] > 20:
                if not visited[y][x]:
                    visited[y][x] = True
                    q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny][nx]:
                r, g, b, a = px[nx, ny]
                if a and is_bg(r, g, b):
                    visited[ny][nx] = True
                    q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)


def whiten_toward_white(im: Image.Image) -> None:
    """源图笔画多为中灰，提亮到近白，避免深底上发糊。"""
    w, h = im.size
    px = im.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 20:
                continue
            m = max(r, g, b)
            if m < 20:
                continue
            u = m / 255.0
            t = 0.18 + 0.82 * (u**0.55)
            o = int(min(255, 255 * t + 4))
            px[x, y] = (o, o, o, a)


def crop_to_opaque(im: Image.Image) -> Image.Image:
    w, h = im.size
    px = im.load()
    xs, ys = [], []
    for yy in range(h):
        for xx in range(w):
            if px[xx, yy][3] > 20:
                xs.append(xx)
                ys.append(yy)
    if not xs:
        return im
    pad = 4
    x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
    return im.crop((
        max(0, x0 - pad),
        max(0, y0 - pad),
        min(w, x1 + pad + 1),
        min(h, y1 + pad + 1),
    ))


def main() -> int:
    root = Path(__file__).resolve().parents[1] / "public"
    src = root / "kegame-wordmark-source.png"
    out = root / "kegame-wordmark.fg.png"
    if not src.is_file():
        print(f"missing: {src}", file=sys.stderr)
        return 1
    im = Image.open(src).copy().convert("RGBA")
    flood_knockout_rgba(im)
    whiten_toward_white(im)
    im = crop_to_opaque(im)
    im.save(out, "PNG")
    print("wrote", out, im.size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
