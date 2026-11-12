"""Đọc chữ trong file .pptx (tiêu đề, nội dung, ghi chú thuyết trình) chỉ bằng thư viện chuẩn.

Dùng chung cho scan.py và check_facts.py. Không chạy macro, không đọc ảnh.
"""
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
NOTES_TYPE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"
TITLE_TYPES = {"title", "ctrTitle"}


def _rels(zf, part):
    """Bảng r:id -> (đường dẫn trong zip, kiểu quan hệ) của một part."""
    folder, name = posixpath.split(part)
    rels_path = posixpath.join(folder, "_rels", name + ".rels")
    if rels_path not in zf.namelist():
        return {}
    out = {}
    for rel in ET.fromstring(zf.read(rels_path)).findall("rel:Relationship", NS):
        target = rel.get("Target", "")
        if rel.get("TargetMode") == "External":
            continue
        path = posixpath.normpath(posixpath.join(folder, target)) if not target.startswith("/") else target[1:]
        out[rel.get("Id")] = (path, rel.get("Type", ""))
    return out


def _paragraphs(node):
    """Mỗi đoạn a:p thành một dòng; a:br thành khoảng trắng."""
    out = []
    for para in node.iter(f"{{{NS['a']}}}p"):
        parts = []
        for el in para.iter():
            if el.tag == f"{{{NS['a']}}}t" and el.text:
                parts.append(el.text)
            elif el.tag == f"{{{NS['a']}}}br":
                parts.append(" ")
        text = re.sub(r"\s+", " ", "".join(parts)).strip()
        if text:
            out.append(text)
    return out


def _placeholder_type(shape):
    ph = shape.find("p:nvSpPr/p:nvPr/p:ph", NS)
    if ph is None:
        return None
    return ph.get("type", "body")


def _slide_order(zf):
    pres = "ppt/presentation.xml"
    rels = _rels(zf, pres)
    order = []
    root = ET.fromstring(zf.read(pres))
    for sld in root.findall("p:sldIdLst/p:sldId", NS):
        rid = sld.get(f"{{{NS['r']}}}id")
        if rid in rels:
            order.append(rels[rid][0])
    if order:
        return order
    # Không có danh sách thì xếp theo số trong tên file.
    names = [n for n in zf.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)]
    return sorted(names, key=lambda n: int(re.search(r"(\d+)\.xml$", n).group(1)))


def read_pptx(path):
    """Trả về list slide: {"no", "title", "body": [đoạn], "notes": [đoạn], "hidden"}."""
    slides = []
    with zipfile.ZipFile(path) as zf:
        for no, part in enumerate(_slide_order(zf), 1):
            root = ET.fromstring(zf.read(part))
            title, body = [], []
            for shape in root.iter(f"{{{NS['p']}}}sp"):
                tx = shape.find("p:txBody", NS)
                if tx is None:
                    continue
                (title if _placeholder_type(shape) in TITLE_TYPES else body).extend(_paragraphs(tx))
            # Chữ trong bảng: quét nhưng không tính là gạch đầu dòng.
            table = []
            for frame in root.iter(f"{{{NS['p']}}}graphicFrame"):
                table.extend(_paragraphs(frame))
            notes = []
            for target, kind in _rels(zf, part).values():
                if kind == NOTES_TYPE and target in zf.namelist():
                    nroot = ET.fromstring(zf.read(target))
                    for shape in nroot.iter(f"{{{NS['p']}}}sp"):
                        tx = shape.find("p:txBody", NS)
                        if tx is not None and _placeholder_type(shape) == "body":
                            notes.extend(_paragraphs(tx))
            slides.append({"no": no, "title": " ".join(title), "body": body, "table": table,
                           "notes": notes, "hidden": root.get("show") == "0"})
    return slides


def to_text(slides):
    """Ghép thành văn bản, mỗi đoạn một dòng.

    Trả về (text, index), index là list (số dòng, số slide, loại, đoạn văn) với loại là
    "tiêu đề", "nội dung", "bảng" hoặc "ghi chú".
    """
    lines, index = [], []
    for s in slides:
        parts = ([("tiêu đề", s["title"])] if s["title"] else []) + \
            [("nội dung", x) for x in s["body"]] + [("bảng", x) for x in s["table"]] + \
            [("ghi chú", x) for x in s["notes"]]
        for kind, text in parts:
            lines.append(text)
            index.append((len(lines), s["no"], kind, text))
        lines.append("")
    return "\n".join(lines), index


def labels(index):
    """Số dòng -> nhãn dễ đọc, ví dụ "slide 3, ghi chú"."""
    return {line: f"slide {no}" + ("" if kind == "nội dung" else f", {kind}")
            for line, no, kind, _ in index}
