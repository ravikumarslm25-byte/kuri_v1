"""
Builds TEMPORARY 1080x1920 portrait background plates from the 4:5 concept images
(text painted out, Gemini watermark removed, extended to 9:16).

These are stand-ins only. Replace with clean 9:16 plates / video loops from the
visual artist (see kiosk/src/config/plates.ts). Run:
    python3 tools/make_standin_plates.py <dir-with-source-pngs> kiosk/public/plates
"""
import sys, os
import cv2
import numpy as np

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

W, H = 1080, 1920
DISP = 1856 / 1611  # boxes below were measured on 1611-px-wide previews

FILES = {
    "idle": "0ed3c707-image.png",
    "scan": "c3f9f61e-image.png",
    "result": "685685cc-image.png",
    "portrait": "ff043af7-image.png",
}

# (x1, y1, x2, y2, mode) in preview coords. mode: 'text' = paint out light glyphs only,
# 'box' = paint out the whole box.
BOXES = {
    "idle": [(120, 215, 1490, 412, "text"), (500, 405, 1110, 478, "text"), (415, 1708, 1200, 1890, "box"), (1450, 1835, 1580, 1955, "box")],
    "scan": [(225, 1470, 1395, 1620, "text"), (320, 1640, 1290, 1730, "box"), (480, 1760, 1130, 1850, "box"), (1450, 1835, 1580, 1955, "box")],
    "result": [(70, 70, 300, 150, "box"), (430, 175, 1185, 315, "text"), (150, 930, 395, 1000, "box"), (105, 1495, 435, 1565, "box"), (330, 1690, 1290, 1895, "box"), (1450, 1835, 1580, 1955, "box")],
    "portrait": [(1450, 1835, 1580, 1955, "box")],
}


def clean(img, boxes):
    mask = np.zeros(img.shape[:2], np.uint8)
    for x1, y1, x2, y2, mode in boxes:
        x1, y1, x2, y2 = (int(v * DISP) for v in (x1, y1, x2, y2))
        if mode == "box":
            mask[y1:y2, x1:x2] = 255
        else:
            roi = img[y1:y2, x1:x2]
            light = (roi.min(axis=2) > 150).astype(np.uint8) * 255
            light = cv2.dilate(light, np.ones((15, 15), np.uint8))
            mask[y1:y2, x1:x2] = np.maximum(mask[y1:y2, x1:x2], light)
    return cv2.inpaint(img, mask, 9, cv2.INPAINT_TELEA)


def to_portrait(img):
    h, w = img.shape[:2]
    s = W / w
    main = cv2.resize(img, (W, round(h * s)), interpolation=cv2.INTER_AREA)
    mh = main.shape[0]
    y0 = (H - mh) // 2
    # Background: same image scaled to cover, heavily blurred and darkened.
    cs = H / h
    cover = cv2.resize(img, (round(w * cs), H), interpolation=cv2.INTER_AREA)
    cx = (cover.shape[1] - W) // 2
    bg = cover[:, cx : cx + W]
    bg = cv2.GaussianBlur(bg, (0, 0), 28)
    bg = (bg * 0.45).astype(np.uint8)
    # Feather the top/bottom edges of the sharp image into the background.
    alpha = np.ones((mh, 1), np.float32)
    f = 160
    ramp = np.linspace(0, 1, f, dtype=np.float32)[:, None]
    alpha[:f] = ramp
    alpha[-f:] = ramp[::-1]
    alpha = alpha[:, :, None]
    out = bg.astype(np.float32)
    region = out[y0 : y0 + mh]
    out[y0 : y0 + mh] = region * (1 - alpha) + main.astype(np.float32) * alpha
    return out.astype(np.uint8), y0, s


for name, fn in FILES.items():
    img = cv2.imread(os.path.join(SRC, fn))
    img = clean(img, BOXES[name])
    plate, y0, s = to_portrait(img)
    cv2.imwrite(os.path.join(OUT, f"{name}.jpg"), plate, [cv2.IMWRITE_JPEG_QUALITY, 86])
    print(f"{name}.jpg  y0={y0} scale={s:.4f}")
