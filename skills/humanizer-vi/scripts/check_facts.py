#!/usr/bin/env python3
"""So bản gốc với bản viết lại: có mất hay thêm số liệu, ngày giờ, link, code, tên riêng không.

Dùng: python3 -I check_facts.py GOC.md MOI.md       (hoặc GOC.pptx MOI.pptx)
Thoát mã 1 nếu số, link hoặc code bị mất hay được thêm. Tên riêng chỉ cảnh báo, vì sửa câu
có thể đổi chữ đứng đầu câu hoặc lược bớt tên lặp lại.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I bỏ thư mục script khỏi sys.path
import slides  # noqa: E402

URL = re.compile(r"https?://[^\s)>\]]+")
CODE = re.compile(r"`([^`\n]+)`")
# 15:00, 30/4, 2026-11-07, 1.000.000, 2.3, 30%, v1.2.0, 5–10
NUMBER = re.compile(r"\bv?\d+(?:[.,:/\-–]\d+)*%?")
ACRONYM = re.compile(r"\b[A-ZĐ]{2,}[0-9]*\b")
UPPER = "A-ZÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬĐÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴ"
# Từ viết hoa không đứng sau dấu kết câu hay đầu dòng: thường là tên riêng
NAME = re.compile(rf"(?<![.!?:\n>\-*#]\s)(?<!^)(?<=\s)[{UPPER}][\w]+", re.MULTILINE)


def facts(text):
    no_code = CODE.sub(" ", URL.sub(" ", text))
    return {
        "_raw": text,
        "link": set(URL.findall(text)),
        "code": set(CODE.findall(text)),
        "số": {n.rstrip(".,") for n in NUMBER.findall(no_code)},
        "viết tắt": set(ACRONYM.findall(no_code)),
        "tên riêng": set(NAME.findall(no_code)),
    }


def read(path):
    if path.lower().endswith(".pptx"):
        return slides.to_text(slides.read_pptx(path))[0]
    with open(path, encoding="utf-8") as f:
        return f.read()


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    old = facts(read(sys.argv[1]))
    new = facts(read(sys.argv[2]))
    failed = False
    for kind in old:
        if kind == "_raw":
            continue
        lost, added = sorted(old[kind] - new[kind]), sorted(new[kind] - old[kind])
        if kind == "code":
            # Đoạn code được tách, gộp hay chuyển vào khối lệnh mà nội dung còn nguyên thì không tính
            lost = [c for c in lost if c not in new["_raw"]]
            added = [c for c in added if c not in old["_raw"]]
        if not lost and not added:
            continue
        strict = kind != "tên riêng"
        failed |= strict
        tag = "LỖI" if strict else "xem lại"
        if lost:
            print(f"[{tag}] {kind} bị mất: {', '.join(lost)}")
        if added:
            print(f"[{tag}] {kind} mới thêm: {', '.join(added)}")
    if not failed:
        print("Số liệu, link, code khớp với bản gốc.")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
