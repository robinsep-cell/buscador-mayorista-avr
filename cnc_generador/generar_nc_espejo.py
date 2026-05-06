#!/usr/bin/env python3
"""
Generador inicial de archivos .NC para espejos curvos.

Lee un SVG exportado desde Silhouette Studio, toma el contorno exterior mas
grande, lo aplana a segmentos lineales y genera G-code con Z curva.
"""

from __future__ import annotations

import argparse
import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path


CURVE_COEFS = {
    "x2": -0.0004210337737,
    "y2": -0.0003892676237,
    "xy": 0.000001197271825,
    "x": 0.1682614324,
    "y": 0.07788281922,
    "c": -18.28677909,
}


@dataclass
class Point:
    x: float
    y: float


def z_curve(x: float, y: float) -> float:
    """Curva aproximada aprendida de programas .NC existentes."""
    c = CURVE_COEFS
    return (
        c["x2"] * x * x
        + c["y2"] * y * y
        + c["xy"] * x * y
        + c["x"] * x
        + c["y"] * y
        + c["c"]
    )


def tokenize_path(d: str) -> list[str]:
    return re.findall(r"[MmLlHhVvCcZz]|-?\d+(?:\.\d+)?(?:e[-+]?\d+)?", d)


def cubic_point(p0: Point, p1: Point, p2: Point, p3: Point, t: float) -> Point:
    u = 1.0 - t
    return Point(
        u**3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t**3 * p3.x,
        u**3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t**3 * p3.y,
    )


def parse_svg_path(d: str, cubic_steps: int = 8) -> list[list[Point]]:
    tokens = tokenize_path(d)
    i = 0
    cmd = None
    current = Point(0, 0)
    start = Point(0, 0)
    subpaths: list[list[Point]] = []
    points: list[Point] = []

    def is_cmd(value: str) -> bool:
        return bool(re.fullmatch(r"[MmLlHhVvCcZz]", value))

    def num() -> float:
        nonlocal i
        value = float(tokens[i])
        i += 1
        return value

    while i < len(tokens):
        if is_cmd(tokens[i]):
            cmd = tokens[i]
            i += 1
        if cmd is None:
            raise ValueError("Path SVG sin comando inicial")

        relative = cmd.islower()
        upper = cmd.upper()

        if upper == "M":
            if len(points) >= 4:
                subpaths.append(points)
            points = []
            x, y = num(), num()
            if relative:
                x += current.x
                y += current.y
            current = start = Point(x, y)
            points.append(current)
            cmd = "l" if relative else "L"
        elif upper == "L":
            x, y = num(), num()
            if relative:
                x += current.x
                y += current.y
            current = Point(x, y)
            points.append(current)
        elif upper == "H":
            x = num() + (current.x if relative else 0)
            current = Point(x, current.y)
            points.append(current)
        elif upper == "V":
            y = num() + (current.y if relative else 0)
            current = Point(current.x, y)
            points.append(current)
        elif upper == "C":
            x1, y1, x2, y2, x3, y3 = num(), num(), num(), num(), num(), num()
            if relative:
                p1 = Point(current.x + x1, current.y + y1)
                p2 = Point(current.x + x2, current.y + y2)
                p3 = Point(current.x + x3, current.y + y3)
            else:
                p1, p2, p3 = Point(x1, y1), Point(x2, y2), Point(x3, y3)
            for step in range(1, cubic_steps + 1):
                points.append(cubic_point(current, p1, p2, p3, step / cubic_steps))
            current = p3
        elif upper == "Z":
            if points and (points[-1].x != start.x or points[-1].y != start.y):
                points.append(start)
            if len(points) >= 4:
                subpaths.append(points)
            points = []
            cmd = None
        else:
            raise ValueError(f"Comando SVG no soportado: {cmd}")

    if len(points) >= 4:
        subpaths.append(points)
    return subpaths


def bbox(points: list[Point]) -> tuple[float, float, float, float]:
    xs = [p.x for p in points]
    ys = [p.y for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def path_area(points: list[Point]) -> float:
    area = 0.0
    for a, b in zip(points, points[1:]):
        area += a.x * b.y - b.x * a.y
    return abs(area) / 2.0


def distance_to_segment(p: Point, a: Point, b: Point) -> float:
    dx = b.x - a.x
    dy = b.y - a.y
    if dx == 0 and dy == 0:
        return math.hypot(p.x - a.x, p.y - a.y)
    t = max(0.0, min(1.0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)))
    projection = Point(a.x + t * dx, a.y + t * dy)
    return math.hypot(p.x - projection.x, p.y - projection.y)


def simplify_open(points: list[Point], tolerance: float) -> list[Point]:
    if len(points) <= 2:
        return points
    a, b = points[0], points[-1]
    max_distance = -1.0
    index = 0
    for i, point in enumerate(points[1:-1], 1):
        distance = distance_to_segment(point, a, b)
        if distance > max_distance:
            max_distance = distance
            index = i
    if max_distance > tolerance:
        left = simplify_open(points[: index + 1], tolerance)
        right = simplify_open(points[index:], tolerance)
        return left[:-1] + right
    return [a, b]


def simplify_closed(points: list[Point], tolerance: float) -> list[Point]:
    if tolerance <= 0 or len(points) <= 4:
        return points
    closed = points[0].x == points[-1].x and points[0].y == points[-1].y
    body = points[:-1] if closed else points
    split = max(range(len(body)), key=lambda i: (body[i].x, body[i].y))
    rotated = body[split:] + body[: split + 1]
    simplified = simplify_open(rotated, tolerance)
    if simplified[0].x != simplified[-1].x or simplified[0].y != simplified[-1].y:
        simplified.append(simplified[0])
    return simplified


def load_largest_svg_path(svg_path: Path) -> list[Point]:
    root = ET.parse(svg_path).getroot()
    candidates: list[list[Point]] = []
    for element in root.iter():
        if element.tag.endswith("path") and element.get("d"):
            for pts in parse_svg_path(element.get("d") or ""):
                if len(pts) >= 4:
                    candidates.append(pts)
    if not candidates:
        raise ValueError("No encontre paths utiles en el SVG")
    return max(candidates, key=path_area)


def transform_to_sheet(points: list[Point], left: float, bottom: float, mirror: bool) -> list[Point]:
    min_x, min_y, max_x, max_y = bbox(points)
    width = max_x - min_x
    transformed = []
    for p in points:
        x = (max_x - p.x if mirror else p.x - min_x) + left
        y = p.y - min_y + bottom
        transformed.append(Point(x, y))
    return transformed


def make_layout(points: list[Point], copies: int, sheet_w: float, sheet_h: float, mirror: bool) -> list[list[Point]]:
    min_x, min_y, max_x, max_y = bbox(points)
    width = max_x - min_x
    height = max_y - min_y
    if height > sheet_h:
        raise ValueError(f"La pieza mide {height:.2f} mm de alto y supera la plancha {sheet_h:.2f} mm")
    if copies * width > sheet_w:
        raise ValueError(f"{copies} piezas miden {copies * width:.2f} mm y superan la plancha {sheet_w:.2f} mm")
    gap = (sheet_w - copies * width) / (copies + 1)
    bottom = (sheet_h - height) / 2
    return [transform_to_sheet(points, gap + i * (width + gap), bottom, mirror) for i in range(copies)]


def nc_lines(title: str, paths: list[list[Point]], feed: float) -> list[str]:
    lines = [
        f"O0000({title})",
        "(GENERADO POR GENERADOR CNC ESPEJOS - PRUEBA)",
        "(VALIDAR EN SIMULACION ANTES DE CORTAR VIDRIO)",
        "( T1 | DIAMANTE | H1 )",
        "N100 G21",
        "N102 G0 G17 G40 G49 G80 G90",
        "N104 T1 M6",
    ]
    n = 106
    first = paths[0][0]
    lines.append(f"N{n} G0 G90 G54 X{first.x:.3f} Y{first.y:.3f} A0. S3500 M3")
    n += 2
    lines.append(f"N{n} G43 H1 Z15.")
    n += 2

    for path in paths:
        start = path[0]
        lines.append(f"N{n} G0 X{start.x:.3f} Y{start.y:.3f}")
        n += 2
        lines.append(f"N{n} Z5.")
        n += 2
        lines.append(f"N{n} G1 Z{z_curve(start.x, start.y):.3f} F{feed:.0f}.")
        n += 2
        for p in path[1:]:
            lines.append(f"N{n} X{p.x:.3f} Y{p.y:.3f} Z{z_curve(p.x, p.y):.3f}")
            n += 2
        lines.append(f"N{n} G0 Z15.")
        n += 2

    lines += [
        f"N{n} M5",
        f"N{n + 2} G91 G28 Z0.",
        f"N{n + 4} G28 X0. Y0. A0.",
        f"N{n + 6} M30",
        "%",
    ]
    return lines


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("svg", type=Path)
    parser.add_argument("-o", "--output", type=Path, required=True)
    parser.add_argument("--title", default="MUSSO PRUEBA")
    parser.add_argument("--copies", type=int, default=2)
    parser.add_argument("--side", choices=["DER", "IZQ"], default="DER")
    parser.add_argument("--sheet-width", type=float, default=400.0)
    parser.add_argument("--sheet-height", type=float, default=200.0)
    parser.add_argument("--feed", type=float, default=450.0)
    parser.add_argument("--tolerance", type=float, default=0.04)
    args = parser.parse_args()

    contour = simplify_closed(load_largest_svg_path(args.svg), args.tolerance)
    mirror = args.side == "IZQ"
    layout = make_layout(contour, args.copies, args.sheet_width, args.sheet_height, mirror)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\r\n".join(nc_lines(args.title, layout, args.feed)) + "\r\n", encoding="ascii")

    min_x, min_y, max_x, max_y = bbox(contour)
    print(f"contorno: {max_x - min_x:.3f} x {max_y - min_y:.3f} mm")
    print(f"puntos por pieza: {len(contour)}")
    print(f"piezas: {args.copies} lado: {args.side}")
    print(f"salida: {args.output}")


if __name__ == "__main__":
    main()
