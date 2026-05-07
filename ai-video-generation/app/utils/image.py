import io
from pathlib import Path


def is_valid_image(data: bytes, min_size: int = 512) -> bool:
    try:
        from PIL import Image
        img = Image.open(io.BytesIO(data))
        w, h = img.size
        return w >= min_size and h >= min_size
    except Exception:
        return False


def resize_to_minimum(data: bytes, min_size: int = 512) -> bytes:
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    w, h = img.size
    if w < min_size or h < min_size:
        scale = min_size / min(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def laplacian_variance(data: bytes) -> float:
    """Higher score = sharper image. Used for blur detection."""
    try:
        import cv2
        import numpy as np
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            return 0.0
        return float(cv2.Laplacian(img, cv2.CV_64F).var())
    except Exception:
        return 0.0


def generate_placeholder_image(width: int = 1280, height: int = 720,
                                text: str = "placeholder", color: tuple = (100, 149, 237)) -> bytes:
    """Generate a simple colored placeholder image for mock mode."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new("RGB", (width, height), color=color)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 48)
    except Exception:
        font = ImageFont.load_default()
    bbox = draw.textbbox((0, 0), text, font=font)
    x = (width - (bbox[2] - bbox[0])) // 2
    y = (height - (bbox[3] - bbox[1])) // 2
    draw.text((x, y), text, fill=(255, 255, 255), font=font)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def extract_dominant_colors(data: bytes, n_colors: int = 5) -> list[tuple[int, int, int]]:
    try:
        import cv2
        import numpy as np
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            return []
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        pixels = img_rgb.reshape(-1, 3).astype(np.float32)
        _, labels, centers = cv2.kmeans(
            pixels, n_colors, None,
            (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0),
            3, cv2.KMEANS_RANDOM_CENTERS,
        )
        return [tuple(int(c) for c in center) for center in centers]
    except Exception:
        return []


async def download_image(url: str) -> bytes:
    import httpx
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


def save_image(data: bytes, path: str) -> str:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_bytes(data)
    return path
