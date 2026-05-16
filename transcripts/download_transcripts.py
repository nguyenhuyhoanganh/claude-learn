#!/usr/bin/env python3
"""
Udemy transcript downloader for samsungu.udemy.com
Updates cookies.json when they expire, then re-run.
"""
import requests
import json
import re
import time
from pathlib import Path

COURSE_SLUG = "redis-the-complete-developers-guide-p"
OUTPUT_DIR = Path(__file__).parent
COOKIES_FILE = OUTPUT_DIR / "cookies.json"
PREFERRED_LOCALE = "en_US"
BASE_URL = "https://samsungu.udemy.com"


def make_headers(slug):
    return {
        "accept": "application/json, text/plain, */*",
        "x-requested-with": "XMLHttpRequest",
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
        "referer": f"https://samsungu.udemy.com/course/{slug}/learn/",
    }


def load_cookies():
    with open(COOKIES_FILE) as f:
        return json.load(f)


def get_course_id(slug, cookies, headers):
    """Resolve course ID from slug via subscribed courses API."""
    print(f"Resolving course ID for '{slug}'...")
    url = f"{BASE_URL}/api-2.0/users/me/subscribed-courses/"
    params = {"fields[course]": "id,published_title", "page_size": 100, "ordering": "-last_accessed"}

    while url:
        resp = requests.get(url, params=params, cookies=cookies, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        for course in data.get("results", []):
            if course.get("published_title") == slug:
                return str(course["id"])
        url = data.get("next")
        params = {}

    raise ValueError(f"Course '{slug}' not found in your subscribed courses")


def get_curriculum(course_id, cookies, headers):
    lectures = []
    url = f"{BASE_URL}/api-2.0/courses/{course_id}/subscriber-curriculum-items/"
    params = {
        "curriculum_types": "chapter,lecture",
        "page_size": 200,
        "fields[lecture]": "title,asset",
        "fields[chapter]": "title",
        "fields[asset]": "title,asset_type",
        "caching_intent": "True",
    }
    current_chapter = "Introduction"
    section_num = 0
    first = True

    while url:
        resp = requests.get(url, params=params if first else {}, cookies=cookies, headers=headers)
        resp.raise_for_status()
        data = resp.json()

        for item in data["results"]:
            if item["_class"] == "chapter":
                section_num += 1
                current_chapter = item["title"]
            elif item["_class"] == "lecture":
                asset = item.get("asset") or {}
                if asset.get("asset_type") == "Video":
                    lectures.append({
                        "section_num": section_num,
                        "chapter": current_chapter,
                        "title": item["title"],
                        "asset_id": asset["id"],
                    })

        url = data.get("next")
        first = False
        if url:
            time.sleep(0.3)

    return lectures


def get_vtt_url(asset_id, cookies, headers):
    url = f"{BASE_URL}/api-2.0/assets/{asset_id}/"
    resp = requests.get(url, params={"fields[asset]": "captions"}, cookies=cookies, headers=headers)
    resp.raise_for_status()
    captions = resp.json().get("captions", [])

    manual = next((c for c in captions if c["locale_id"] == PREFERRED_LOCALE and c["source"] == "manual"), None)
    auto = next((c for c in captions if c["locale_id"] == PREFERRED_LOCALE), None)
    caption = manual or auto
    return caption["url"] if caption else None


def vtt_to_text(vtt_content):
    texts = []
    for line in vtt_content.splitlines():
        line = line.strip()
        if not line or line == "WEBVTT":
            continue
        if re.match(r"^\d+$", line):
            continue
        if re.match(r"[\d:.]+ --> [\d:.]+", line):
            continue
        text = re.sub(r"<[^>]+>", "", line).strip()
        if text and (not texts or texts[-1] != text):
            texts.append(text)
    return " ".join(texts)


def safe_name(name, max_len=60):
    return re.sub(r'[<>:"/\\|?*]', "", name).strip()[:max_len]


def main():
    cookies = load_cookies()
    headers = make_headers(COURSE_SLUG)

    course_id = get_course_id(COURSE_SLUG, cookies, headers)
    print(f"Course ID: {course_id}")

    print("Fetching curriculum...")
    lectures = get_curriculum(course_id, cookies, headers)
    print(f"Found {len(lectures)} video lectures\n")

    course_dir = OUTPUT_DIR / COURSE_SLUG

    for i, lec in enumerate(lectures):
        section_dir = course_dir / f"Section {lec['section_num']:02d} - {safe_name(lec['chapter'])}"
        section_dir.mkdir(parents=True, exist_ok=True)

        filepath = section_dir / f"{i+1:03d}_{safe_name(lec['title'])}.txt"
        if filepath.exists():
            print(f"[{i+1:3d}/{len(lectures)}] skip  {lec['title']}")
            continue

        print(f"[{i+1:3d}/{len(lectures)}] {lec['title']}", end="", flush=True)
        try:
            vtt_url = get_vtt_url(lec["asset_id"], cookies, headers)
            if not vtt_url:
                print(" — no English caption")
                filepath.write_text(f"# {lec['title']}\n\n[No English transcript available]\n")
                continue

            vtt = requests.get(vtt_url).text
            text = vtt_to_text(vtt)
            filepath.write_text(f"# {lec['title']}\n\n{text}\n")
            print(f" — {len(text):,} chars")
        except Exception as e:
            print(f" — ERROR: {e}")

        time.sleep(0.3)

    print("\nDone!")


if __name__ == "__main__":
    main()
