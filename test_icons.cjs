const { spawnSync } = require("child_process");
const path = require("path");

const script = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

root = Path(sys.argv[1])
results = []
for size in [16, 32, 48, 128]:
    path = root / "icons" / f"icon{size}.png"
    with Image.open(path) as image:
        image.load()
        pixels = list(image.convert("RGBA").getdata())
        results.append({
            "size": size,
            "width": image.width,
            "height": image.height,
            "colors": len(set(pixels)),
            "bytes": path.stat().st_size,
        })
print(json.dumps(results))
`;

const result = spawnSync("python", ["-c", script, path.resolve(__dirname)], {
  encoding: "utf8",
});

if (result.error) {
  console.error(`Unable to run Python/Pillow: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

const reports = JSON.parse(result.stdout);
for (const report of reports) {
  if (report.width !== report.size || report.height !== report.size) {
    throw new Error(`icon${report.size}.png has wrong dimensions: ${report.width}x${report.height}`);
  }
  if (report.colors < 2) {
    throw new Error(`icon${report.size}.png has too few colors: ${report.colors}`);
  }
  console.log(`PASS icon${report.size}.png ${report.width}x${report.height}, ${report.colors} colors, ${report.bytes} bytes`);
}
