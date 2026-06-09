from __future__ import annotations

import html
import json
import math
import re
import struct
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public" / "assets" / "medium-earth-d2_3.map"
SVG_OUT = ROOT / "public" / "assets" / "medium-earth-official.svg"
GEOMETRY_OUT = ROOT / "public" / "assets" / "medium-earth-geometry.json"
MAP_OUT = ROOT / "src" / "engine" / "medium-earth-map.generated.js"

BONUS_VALUES = {
    "Canada": 5,
    "Greenland": 5,
    "CentralAmerica": 3,
    "SouthAmerica": 4,
    "Antarctica": 3,
    "WestUS": 5,
    "EastUS": 5,
    "Australia": 5,
    "SouthAfrica": 3,
    "WestAfrica": 4,
    "EastAfrica": 4,
    "NorthAfrica": 3,
    "Europe": 5,
    "ScandinavianPeninsula": 3,
    "WestRussia": 4,
    "CentralRussia": 4,
    "Caucasus": 5,
    "MiddleEast": 4,
    "WestChina": 6,
    "EastRussia": 5,
    "EastChina": 4,
    "Indonesia": 4,
    "SoutheastAsia": 3,
    "Alaska": 0,
    "Hawaii": 0,
    "Japan": 0,
    "Korea": 0,
}

BONUS_COLORS = {
    "Canada": "#22318f",
    "Greenland": "#d21319",
    "CentralAmerica": "#d21319",
    "SouthAmerica": "#22318f",
    "Antarctica": "#c19a00",
    "WestUS": "#2b8f32",
    "EastUS": "#c19a00",
    "Australia": "#22318f",
    "SouthAfrica": "#d21319",
    "WestAfrica": "#c19a00",
    "EastAfrica": "#2b8f32",
    "NorthAfrica": "#c19a00",
    "Europe": "#2b8f32",
    "ScandinavianPeninsula": "#22318f",
    "WestRussia": "#c19a00",
    "CentralRussia": "#d21319",
    "Caucasus": "#22318f",
    "MiddleEast": "#d21319",
    "WestChina": "#2b8f32",
    "EastRussia": "#22318f",
    "EastChina": "#d21319",
    "Indonesia": "#2b8f32",
    "SoutheastAsia": "#8b1aac",
    "Alaska": "#9c9c9c",
    "Hawaii": "#9c9c9c",
    "Japan": "#9c9c9c",
    "Korea": "#9c9c9c",
}


@dataclass
class Shape:
    id: str | None
    territory_id: int | None
    bonus_link: str | None
    path: str
    style: dict[str, str]
    points: list[tuple[float, float]]

    @property
    def bbox(self) -> tuple[float, float, float, float]:
        xs = [point[0] for point in self.points]
        ys = [point[1] for point in self.points]
        return min(xs), min(ys), max(xs), max(ys)

    @property
    def label(self) -> dict[str, float]:
        x = sum(point[0] for point in self.points) / len(self.points)
        y = sum(point[1] for point in self.points) / len(self.points)
        return {"x": round(x, 3), "y": round(y, 3)}


class Reader:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def byte(self) -> int:
        value = self.data[self.pos]
        self.pos += 1
        return value

    def boolean(self) -> bool:
        return self.byte() != 0

    def int32(self) -> int:
        value = struct.unpack_from("<i", self.data, self.pos)[0]
        self.pos += 4
        return value

    def float32(self) -> float:
        value = struct.unpack_from("<f", self.data, self.pos)[0]
        self.pos += 4
        return value

    def varint(self) -> int:
        value = 0
        shift = 0
        while True:
            byte = self.byte()
            value |= (byte & 0x7F) << shift
            if (byte & 0x80) == 0:
                return value
            shift += 7
            if shift >= 35:
                raise ValueError("Bad variable-length integer")

    def string(self) -> str:
        length = self.varint()
        value = self.data[self.pos:self.pos + length].decode("utf-8")
        self.pos += length
        return value


def read_nullable(reader: Reader, parser):
    return parser() if reader.boolean() else None


def read_array(reader: Reader, parser):
    length = reader.int32()
    if length == -1:
        return None
    return [parser() for _ in range(length)]


def read_command(reader: Reader) -> dict:
    token = reader.byte()
    if token == 1:
        return {
            "type": "roundRect",
            "height": reader.float32(),
            "radiusX": reader.float32(),
            "radiusY": reader.float32(),
            "width": reader.float32(),
            "x": reader.float32(),
            "y": reader.float32(),
        }
    if token == 2:
        return {
            "type": "rect",
            "height": reader.float32(),
            "width": reader.float32(),
            "x": reader.float32(),
            "y": reader.float32(),
        }
    if token == 3:
        return {"type": "endFill"}
    if token == 4:
        return {"type": "moveTo", "x": reader.float32(), "y": reader.float32()}
    if token == 5:
        return {"type": "lineTo", "x": reader.float32(), "y": reader.float32()}
    if token == 6:
        return {
            "type": "circle",
            "cx": reader.float32(),
            "cy": reader.float32(),
            "r": reader.float32(),
        }
    if token == 7:
        return {
            "type": "ellipse",
            "height": reader.float32(),
            "width": reader.float32(),
            "x": reader.float32(),
            "y": reader.float32(),
        }
    if token == 8:
        return {"type": "beginFill", "alpha": reader.float32(), "color": reader.int32()}
    if token == 10:
        return {
            "type": "lineStyle",
            "color": reader.int32(),
            "miterLimit": reader.float32(),
            "pixelHinting": reader.boolean(),
            "caps": reader.byte(),
            "alpha": reader.float32(),
            "width": reader.float32(),
        }
    if token == 11:
        return {
            "type": "drawPath",
            "commands": read_nullable(reader, lambda: read_array(reader, reader.byte)),
            "data": read_nullable(reader, lambda: read_array(reader, reader.float32)),
            "winding": reader.byte(),
        }
    raise ValueError(f"Unexpected SVG graphics token {token} at byte {reader.pos - 1}")


def read_sprite(reader: Reader) -> dict:
    bonus_link = read_nullable(reader, reader.string)
    commands = read_nullable(reader, lambda: read_array(reader, lambda: read_nullable(reader, lambda: read_command(reader))))
    territory_id = read_nullable(reader, reader.int32)
    return {"bonusLink": bonus_link, "commands": commands or [], "territoryId": territory_id}


def color(value: int) -> str:
    return f"#{value & 0xFFFFFF:06x}"


def cubic(p0, p1, p2, p3, t):
    mt = 1 - t
    return (
        mt ** 3 * p0[0] + 3 * mt ** 2 * t * p1[0] + 3 * mt * t ** 2 * p2[0] + t ** 3 * p3[0],
        mt ** 3 * p0[1] + 3 * mt ** 2 * t * p1[1] + 3 * mt * t ** 2 * p2[1] + t ** 3 * p3[1],
    )


def build_shape(sprite: dict, fallback_id: int) -> Shape | None:
    attrs: dict[str, str] = {}
    style: dict[str, str] = {}
    path_parts: list[str] = []
    points: list[tuple[float, float]] = []
    element = None
    current = (0.0, 0.0)

    def add_path(text: str, point: tuple[float, float] | None = None):
        path_parts.append(text)
        if point is not None:
            points.append(point)

    for command in sprite["commands"]:
        if command is None:
            continue
        kind = command["type"]
        if kind == "rect":
            x, y, width, height = command["x"], command["y"], command["width"], command["height"]
            if width < 0:
                x += width
                width = -width
            if height < 0:
                y += height
                height = -height
            element = "path"
            for point, marker in [
                ((x, y), "M"),
                ((x + width, y), "L"),
                ((x + width, y + height), "L"),
                ((x, y + height), "L"),
            ]:
                add_path(f"{marker} {point[0]:.3f} {point[1]:.3f}", point)
            path_parts.append("Z")
        elif kind == "roundRect":
            x, y, width, height = command["x"], command["y"], command["width"], command["height"]
            if width < 0:
                x += width
                width = -width
            if height < 0:
                y += height
                height = -height
            element = "path"
            for point, marker in [
                ((x, y), "M"),
                ((x + width, y), "L"),
                ((x + width, y + height), "L"),
                ((x, y + height), "L"),
            ]:
                add_path(f"{marker} {point[0]:.3f} {point[1]:.3f}", point)
            path_parts.append("Z")
        elif kind == "circle":
            element = "circle"
            x, y, radius = command["cx"], command["cy"], abs(command["r"])
            attrs.update(cx=f"{x:.3f}", cy=f"{y:.3f}", r=f"{radius:.3f}")
            points.extend([(x - radius, y - radius), (x + radius, y + radius)])
        elif kind == "ellipse":
            element = "ellipse"
            rx, ry = abs(command["width"] / 2), abs(command["height"] / 2)
            cx, cy = command["x"] + command["width"] / 2, command["y"] + command["height"] / 2
            attrs.update(cx=f"{cx:.3f}", cy=f"{cy:.3f}", rx=f"{rx:.3f}", ry=f"{ry:.3f}")
            points.extend([(cx - rx, cy - ry), (cx + rx, cy + ry)])
        elif kind == "moveTo":
            current = (command["x"], command["y"])
            element = "path"
            add_path(f"M {current[0]:.3f} {current[1]:.3f}", current)
        elif kind == "lineTo":
            current = (command["x"], command["y"])
            element = "path"
            add_path(f"L {current[0]:.3f} {current[1]:.3f}", current)
        elif kind == "drawPath":
            element = "path"
            if command["winding"] == 1:
                style["fill-rule"] = "evenodd"
            elif command["winding"] == 2:
                style["fill-rule"] = "nonzero"
            values = command["data"] or []
            value_index = 0

            def next_value() -> float:
                nonlocal value_index
                value = values[value_index]
                value_index += 1
                return value

            for path_command in command["commands"] or []:
                if path_command == 1:
                    current = (next_value(), next_value())
                    add_path(f"M {current[0]:.3f} {current[1]:.3f}", current)
                elif path_command == 2:
                    current = (next_value(), next_value())
                    add_path(f"L {current[0]:.3f} {current[1]:.3f}", current)
                elif path_command == 3:
                    p1 = (next_value(), next_value())
                    p3 = (next_value(), next_value())
                    p0 = current
                    cp1 = (p0[0] + 0.66666 * (p1[0] - p0[0]), p0[1] + 0.66666 * (p1[1] - p0[1]))
                    cp2 = (p1[0] + (p3[0] - p1[0]) / 3, p1[1] + (p3[1] - p1[1]) / 3)
                    add_path(f"C {cp1[0]:.3f} {cp1[1]:.3f} {cp2[0]:.3f} {cp2[1]:.3f} {p3[0]:.3f} {p3[1]:.3f}")
                    points.extend(cubic(p0, cp1, cp2, p3, step / 10) for step in range(1, 11))
                    current = p3
                elif path_command == 4:
                    cp1 = (next_value(), next_value())
                    cp2 = (next_value(), next_value())
                    p3 = (next_value(), next_value())
                    p0 = current
                    add_path(f"C {cp1[0]:.3f} {cp1[1]:.3f} {cp2[0]:.3f} {cp2[1]:.3f} {p3[0]:.3f} {p3[1]:.3f}")
                    points.extend(cubic(p0, cp1, cp2, p3, step / 10) for step in range(1, 11))
                    current = p3
                else:
                    raise ValueError(f"Unexpected path command {path_command}")
        elif kind == "beginFill":
            if command["alpha"] == 0:
                style["fill"] = "none"
            else:
                style["fill"] = color(command["color"])
                style["fill-opacity"] = f"{command['alpha']:.4g}"
        elif kind == "lineStyle":
            style["stroke"] = color(command["color"])
            style["stroke-width"] = "1" if sprite["territoryId"] is not None else f"{command['width']:.4g}"
            style["stroke-opacity"] = f"{command['alpha']:.4g}"
            style["stroke-miterlimit"] = f"{command['miterLimit']:.4g}"
            if command["caps"] == 1:
                style["stroke-linecap"] = "round"
            elif command["caps"] == 2:
                style["stroke-linecap"] = "square"

    if element is None or not points:
        return None

    if path_parts:
        attrs["d"] = " ".join(path_parts)

    if "fill" not in style:
        style["fill"] = "none"

    shape_id = None
    if sprite["territoryId"] is not None:
        shape_id = f"Territory_{sprite['territoryId']}"
    elif sprite["bonusLink"] is not None:
        shape_id = f"BonusLink_{sprite['bonusLink']}"
    elif fallback_id is not None:
        shape_id = f"MapObject_{fallback_id}"

    return Shape(
        id=shape_id,
        territory_id=sprite["territoryId"],
        bonus_link=sprite["bonusLink"],
        path=attrs.get("d", ""),
        style=style,
        points=points,
    )


def parse_source() -> tuple[int, int, int, list[Shape]]:
    reader = Reader(SOURCE.read_bytes())
    height = reader.int32()
    sprites = read_nullable(reader, lambda: read_array(reader, lambda: read_nullable(reader, lambda: read_sprite(reader)))) or []
    revision = reader.int32()
    width = reader.int32()
    if reader.pos != len(reader.data):
        raise ValueError(f"Parser stopped at {reader.pos} of {len(reader.data)} bytes")
    shapes = [shape for index, sprite in enumerate(sprites) if sprite and (shape := build_shape(sprite, index))]
    return width, height, revision, shapes


def camel_to_title(value: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", " ", value).replace("U S", "US")


def bonus_id(name: str) -> str:
    spaced = camel_to_title(name)
    return re.sub(r"[^a-z0-9]+", "_", spaced.lower()).strip("_")


def assign_bonus(x: float, y: float) -> str:
    if y >= 510:
        return "Antarctica"
    if x < 95 and y < 120:
        return "Alaska"
    if x < 70 and 190 <= y <= 290:
        return "Hawaii"
    if 870 <= x <= 930 and 105 <= y <= 190:
        return "Japan"
    if 835 <= x < 870 and 115 <= y <= 175:
        return "Korea"
    if 760 <= x <= 980 and 360 <= y <= 505:
        return "Australia"
    if 825 <= x <= 980 and 250 <= y < 370:
        return "Indonesia"
    if 690 <= x < 825 and 220 <= y < 340:
        return "SoutheastAsia"
    if 815 <= x <= 890 and 165 <= y < 265:
        return "EastChina"
    if 690 <= x < 815 and 110 <= y < 230:
        return "WestChina"
    if 745 <= x <= 935 and y < 150:
        return "EastRussia"
    if 615 <= x < 745 and y < 115:
        return "CentralRussia"
    if 540 <= x < 625 and y < 145:
        return "WestRussia"
    if 470 <= x < 540 and y < 105:
        return "ScandinavianPeninsula"
    if 340 <= x < 470 and y < 85:
        return "Greenland"
    if 385 <= x < 545 and 80 <= y < 185:
        return "Europe"
    if 545 <= x < 700 and 120 <= y < 205:
        return "Caucasus"
    if 555 <= x < 710 and 205 <= y < 305:
        return "MiddleEast"
    if 500 <= x < 630 and 330 <= y < 430:
        return "SouthAfrica"
    if 535 <= x < 665 and 285 <= y < 345:
        return "EastAfrica"
    if 400 <= x < 535 and 230 <= y < 335:
        return "WestAfrica"
    if 390 <= x < 560 and 165 <= y < 255:
        return "NorthAfrica"
    if 230 <= x < 390 and y >= 285:
        return "SouthAmerica"
    if 95 <= x < 260 and 210 <= y < 300:
        return "CentralAmerica"
    if 205 <= x < 355 and 125 <= y < 210:
        return "EastUS"
    if 95 <= x < 205 and 120 <= y < 210:
        return "WestUS"
    if 95 <= x < 390 and y < 135:
        return "Canada"
    # The official map has a few long/curved territories whose bbox center falls just outside
    # their geographic region. These fallbacks keep them with their visible continent.
    if x < 390 and y < 210:
        return "Canada"
    if x < 270 and y < 270:
        return "WestUS"
    if x < 390 and y < 330:
        return "CentralAmerica"
    if x < 390:
        return "SouthAmerica"
    if x < 560 and y < 250:
        return "Europe"
    if x < 560:
        return "WestAfrica"
    if x < 700 and y < 250:
        return "Caucasus"
    if x < 700:
        return "EastAfrica"
    if x < 830 and y < 250:
        return "WestChina"
    if x < 830:
        return "SoutheastAsia"
    if y < 180:
        return "EastRussia"
    if y < 260:
        return "EastChina"
    return "Indonesia"


def bbox_distance(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    dx = max(bx1 - ax2, ax1 - bx2, 0)
    dy = max(by1 - ay2, ay1 - by2, 0)
    return math.hypot(dx, dy)


def point_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def border_distance(a: Shape, b: Shape) -> float:
    if bbox_distance(a.bbox, b.bbox) > 5:
        return 9999
    return min(point_distance(pa, pb) for pa in a.points for pb in b.points)


def build_adjacency(territories: list[dict], shapes_by_id: dict[str, Shape], route_shapes: list[Shape]) -> dict[str, list[str]]:
    adjacency = {territory["id"]: set() for territory in territories}
    territory_by_numeric = {territory["numericId"]: territory for territory in territories}
    for index, territory in enumerate(territories):
        shape = shapes_by_id[territory["id"]]
        for other in territories[index + 1:]:
            other_shape = shapes_by_id[other["id"]]
            if border_distance(shape, other_shape) <= 2.25:
                adjacency[territory["id"]].add(other["id"])
                adjacency[other["id"]].add(territory["id"])

    centers = [(territory["id"], territory["x"], territory["y"]) for territory in territories]
    for route in route_shapes:
        if not route.points:
            continue
        start = route.points[0]
        end = route.points[-1]
        a = min(centers, key=lambda row: point_distance((row[1], row[2]), start))
        b = min(centers, key=lambda row: point_distance((row[1], row[2]), end))
        if a[0] != b[0] and point_distance((a[1], a[2]), start) < 80 and point_distance((b[1], b[2]), end) < 80:
            adjacency[a[0]].add(b[0])
            adjacency[b[0]].add(a[0])

    for territory in territories:
        if adjacency[territory["id"]]:
            continue
        nearest = min(
            (candidate for candidate in territories if candidate["id"] != territory["id"]),
            key=lambda candidate: point_distance((territory["x"], territory["y"]), (candidate["x"], candidate["y"])),
        )
        adjacency[territory["id"]].add(nearest["id"])
        adjacency[nearest["id"]].add(territory["id"])

    return {key: sorted(value) for key, value in adjacency.items()}


def style_string(style: dict[str, str]) -> str:
    return ";".join(f"{key}:{value}" for key, value in style.items())


def write_svg(width: int, height: int, shapes: list[Shape]):
    body = []
    for shape in shapes:
        attrs = {
            "d": shape.path,
            "style": style_string(shape.style),
        }
        if shape.id:
            attrs["id"] = shape.id
        body.append("<path " + " ".join(f'{key}="{html.escape(str(value))}"' for key, value in attrs.items()) + " />")
    SVG_OUT.write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" version="1.0">\n'
        + "\n".join(body)
        + "\n</svg>\n",
        encoding="utf-8",
    )


def main():
    width, height, revision, shapes = parse_source()
    territory_shapes = [shape for shape in shapes if shape.territory_id is not None]
    bonus_shapes = [shape for shape in shapes if shape.bonus_link is not None]
    route_shapes = [
        shape for shape in shapes
        if shape.territory_id is None and shape.bonus_link is None and shape.style.get("stroke") == "#fff500"
    ]

    write_svg(width, height, shapes)

    bonus_links = [
        {
            "id": bonus_id(shape.bonus_link),
            "name": camel_to_title(shape.bonus_link),
            "rawName": shape.bonus_link,
            "value": BONUS_VALUES.get(shape.bonus_link, 0),
            "path": shape.path,
            "label": shape.label,
        }
        for shape in sorted(bonus_shapes, key=lambda item: item.bonus_link or "")
    ]

    territories = []
    for shape in sorted(territory_shapes, key=lambda item: item.territory_id or 0):
        raw_bonus_name = assign_bonus(shape.label["x"], shape.label["y"])
        name = f"{camel_to_title(raw_bonus_name)} {shape.territory_id}"
        territories.append({
            "id": f"t{shape.territory_id}",
            "numericId": shape.territory_id,
            "name": name,
            "bonusId": bonus_id(raw_bonus_name),
            "bonusName": camel_to_title(raw_bonus_name),
            "bonusValue": BONUS_VALUES[raw_bonus_name],
            "x": shape.label["x"],
            "y": shape.label["y"],
            "color": BONUS_COLORS[raw_bonus_name],
            "zeroBonus": BONUS_VALUES[raw_bonus_name] == 0,
        })

    shapes_by_id = {f"t{shape.territory_id}": shape for shape in territory_shapes}
    adjacency = build_adjacency(territories, shapes_by_id, route_shapes)

    bonuses = []
    for raw_name, value in BONUS_VALUES.items():
        members = [territory["id"] for territory in territories if territory["bonusId"] == bonus_id(raw_name)]
        bonuses.append({
            "id": bonus_id(raw_name),
            "name": camel_to_title(raw_name),
            "value": value,
            "color": BONUS_COLORS[raw_name],
            "territories": members,
        })

    geometry = {
        "source": "https://warappcdn.com/s3/Data/Maps/1748/d2_3.map",
        "mapId": 1748,
        "revision": revision,
        "viewBox": {"width": width, "height": height},
        "territories": [
            {
                "id": f"t{shape.territory_id}",
                "numericId": shape.territory_id,
                "path": shape.path,
                "label": shape.label,
            }
            for shape in sorted(territory_shapes, key=lambda item: item.territory_id or 0)
        ],
        "bonusLinks": bonus_links,
        "routes": [{"path": shape.path, "style": shape.style} for shape in route_shapes],
    }
    GEOMETRY_OUT.write_text(json.dumps(geometry, indent=2) + "\n", encoding="utf-8")

    edges = []
    for territory_id, neighbors in adjacency.items():
        for neighbor in neighbors:
            if territory_id < neighbor:
                edges.append([territory_id, neighbor])
    edges.sort()

    map_data = {
        "id": "medium-earth-traditional",
        "name": "Medium Earth Traditional",
        "sourceMapId": 1748,
        "viewBox": {"width": width, "height": height},
        "bonuses": bonuses,
        "territories": territories,
        "adjacency": adjacency,
        "edges": edges,
        "distributionBonusIds": [bonus["id"] for bonus in bonuses if bonus["value"] > 0],
    }
    MAP_OUT.write_text(
        "export const MEDIUM_EARTH_MAP_DATA = "
        + json.dumps(map_data, indent=2)
        + ";\n",
        encoding="utf-8",
    )

    print(f"Decoded {len(territory_shapes)} territories, {len(bonus_shapes)} bonus links, {len(route_shapes)} routes")
    print("Bonus counts:")
    for bonus in bonuses:
        print(f"  {bonus['name']}: {len(bonus['territories'])}")


if __name__ == "__main__":
    main()
