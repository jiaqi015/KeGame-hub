#!/usr/bin/env python3
"""
Remove only edge-connected dark background from a PNG. Isolated dark regions
not connected to the image border (e.g. a controller inside a mark) stay opaque.
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

from PIL import Image  # type: ignore


def is_dark(r: int, g: int, b: int, *, high: int = 52) -> bool:
    return max(r, g, b) <= high


def flood_from_edges_rgba(im: Image.Image) -> Image.Image:
    w, h = im.size
    out = im.convert("RGBA")
    px = out.load()
    visited = [[False] * w for _ in range(h)]
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            r, g, b, a = px[x, y]
            if a and is_dark(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))
    for y in range(1, h - 1):
        for x in (0, w - 1):
            r, g, b, a = px[x, y]
            if a and is_dark(r, g, b) and not visited[y][x]:
                visited[y][x] = True
                q.append((x, y))

    while q:
        x, y = q.popleft()
        for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nx, ny = x + dx, y + dy
            if not (0 <= nx < w and 0 <= ny < h):
                continue
            if visited[ny][nx]:
                continue
            r, g, b, a = px[nx, ny]
            if not a or not is_dark(r, g, b):
                continue
            visited[ny][nx] = True
            q.append((nx, ny))

    for y in range(h):
        for x in range(w):
            if visited[y][x]:
                r, g, b, _ = px[x, y]
                px[x, y] = (r, g, b, 0)
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: knockout-png-bg.py <input.png> [output.png]", file=sys.stderr)
        return 1
    inp = Path(sys.argv[1])
    outp = Path(sys.argv[2]) if len(sys.argv) > 2 else inp
    im = Image.open(inp).copy()
    out = flood_from_edges_rgba(im)
    out.save(outp, "PNG")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
