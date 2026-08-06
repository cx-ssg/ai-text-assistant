from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
BACKGROUND = (13, 35, 38, 255)
WHITE = (245, 255, 252, 255)
TEAL = (39, 202, 187, 255)


def draw_icon(size: int) -> Image.Image:
    scale = 4
    canvas = Image.new("RGBA", (size * scale, size * scale), BACKGROUND)
    draw = ImageDraw.Draw(canvas)

    def line(points, fill, width):
        draw.line([(round(x * scale), round(y * scale)) for x, y in points], fill=fill, width=max(1, round(width * scale)), joint="curve")

    def polygon(points, fill):
        draw.polygon([(round(x * scale), round(y * scale)) for x, y in points], fill=fill)

    def ellipse(box, fill):
        draw.ellipse(tuple(round(value * scale) for value in box), fill=fill)

    if size >= 48:
        line([(13, 27), (56, 27)], WHITE, 5 if size >= 96 else 4)
        line([(13, 43), (48, 43)], WHITE, 5 if size >= 96 else 4)
        line([(13, 59), (40, 59)], WHITE, 5 if size >= 96 else 4)
        line([(13, 75), (31, 75)], WHITE, 5 if size >= 96 else 4)
        line([(72, 18), (72, 79)], TEAL, 7 if size >= 96 else 6)
        line([(60, 27), (84, 51)], TEAL, 7 if size >= 96 else 6)
        polygon([(84, 51), (103, 70), (91, 75), (78, 58)], TEAL)
        if size >= 96:
            ellipse((100, 23, 108, 31), TEAL)
            ellipse((100, 39, 108, 47), TEAL)
            ellipse((100, 55, 108, 63), TEAL)
            line([(68, 88), (92, 88)], WHITE, 4)
    elif size >= 32:
        line([(5, 9), (20, 9)], WHITE, 2.5)
        line([(5, 15), (18, 15)], WHITE, 2.5)
        line([(5, 21), (16, 21)], WHITE, 2.5)
        line([(23, 6), (23, 23)], TEAL, 3)
        line([(20, 10), (29, 19)], TEAL, 3)
        polygon([(29, 19), (32, 22), (27, 24), (24, 20)], TEAL)
    else:
        line([(3, 5), (10, 5)], WHITE, 1.5)
        line([(3, 8), (9, 8)], WHITE, 1.5)
        line([(3, 11), (8, 11)], WHITE, 1.5)
        line([(11, 4), (11, 12)], TEAL, 2)
        line([(10, 6), (14, 10)], TEAL, 2)
        polygon([(14, 10), (15, 12), (13, 12)], TEAL)

    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    output_dir = ROOT / "icons"
    output_dir.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        draw_icon(size).save(output_dir / f"icon{size}.png", format="PNG", optimize=True)


if __name__ == "__main__":
    main()
