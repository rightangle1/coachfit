from pathlib import Path

from PIL import Image


output_directory = Path("docs/release/screenshots")
filenames = [
    "01-training-that-fits.png",
    "02-plan-around-today.png",
    "03-exercises-your-rules.png",
    "04-keep-moving.png",
    "05-progress-made-visible.png",
    "06-own-your-training.png",
    "07-stay-focused-set-by-set.png",
    "08-move-with-confidence.png",
    "09-progress-made-visible.png",
    "10-the-work-adds-up.png",
]

for filename in filenames:
    path = output_directory / filename
    with Image.open(path) as image:
        image.convert("RGB").save(path, optimize=True)
    print(f"Flattened {path}")
