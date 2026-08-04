#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""연수장에서 사고가 났던 유형을 기계적으로 점검한다.

브라우저를 띄우지 않고 파일만 보고 잡을 수 있는 것들이다. 사람 눈으로
매번 확인하면 언젠가 놓치고, 놓치는 날이 하필 연수 당일이다.

  python tests/check_site.py
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
fails: list[str] = []
warns: list[str] = []
checks = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"[ OK ] {label}")
    else:
        print(f"[FAIL] {label}" + (f"\n       {detail}" if detail else ""))
        fails.append(label)


def warn(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if ok:
        print(f"[ OK ] {label}")
    else:
        print(f"[주의] {label}" + (f"\n       {detail}" if detail else ""))
        warns.append(label)


# --- 1. 외부 요청이 없어야 한다 -------------------------------------------
# 연수장 네트워크가 느리거나 막히면 CDN 자원 하나가 화면 전체를 늦춘다.
EXTERNAL = re.compile(
    r'(?:src|href)\s*=\s*["\'](?:https?:)?//(?!127\.0\.0\.1|localhost)', re.I
)
for html in sorted(ROOT.glob("*.html")):
    hits = []
    for i, line in enumerate(html.read_text(encoding="utf-8").split("\n"), 1):
        if EXTERNAL.search(line):
            hits.append(f"{html.name}:{i}  {line.strip()[:90]}")
    check(not hits, f"{html.name} — 외부 자원 요청 없음", "\n       ".join(hits))

# --- 2. 콘텐츠 번들이 JSON과 맞아야 한다 -----------------------------------
content_dir = ROOT / "content"
bundle = content_dir / "bundle.js"
jsons = sorted(p for p in content_dir.glob("*.json"))

check(bundle.exists(), "content/bundle.js 존재",
      "node tools/bundle.mjs 를 실행하세요")

if bundle.exists() and jsons:
    btext = bundle.read_text(encoding="utf-8")
    m = re.search(r"window\.YEONSU\s*=\s*(\{.*\});\s*$", btext, re.S)
    check(m is not None, "bundle.js 형식이 올바름")
    if m:
        bundled = json.loads(m.group(1))
        for jf in jsons:
            key = jf.stem
            src = json.loads(jf.read_text(encoding="utf-8"))
            check(bundled.get(key) == src,
                  f"{jf.name} 이 번들과 일치",
                  "JSON을 고친 뒤 node tools/bundle.mjs 를 다시 실행하세요")

# --- 3. 카드 무결성 --------------------------------------------------------
seen_ids: set[str] = set()
for jf in jsons:
    data = json.loads(jf.read_text(encoding="utf-8"))
    cards = data.get("cards", [])
    check(len(cards) > 0, f"{jf.name} — 카드가 있음")

    dup = [c["id"] for c in cards if c.get("id") in seen_ids]
    for c in cards:
        if c.get("id"):
            seen_ids.add(c["id"])
    check(not dup, f"{jf.name} — 카드 id 중복 없음", ", ".join(dup))

    # 도구 링크가 있으면 새 탭으로 열 수 있는 절대 주소여야 한다
    bad_url = [c["id"] for c in cards
               if c.get("toolUrl") and not str(c["toolUrl"]).startswith("http")]
    check(not bad_url, f"{jf.name} — 도구 주소 형식", ", ".join(bad_url))

    # 참조한 이미지가 실제로 있어야 한다 (깨진 그림은 연수 중 못 고친다)
    missing = []
    for c in cards:
        for im in c.get("images") or []:
            if not (ROOT / "assets" / "img" / im["file"]).exists():
                missing.append(f'{c["id"]}: {im["file"]}')
    check(not missing, f"{jf.name} — 참조 이미지 존재", ", ".join(missing))

    # 참조한 내려받기 파일이 실제로 있어야 한다
    missing_dl = []
    for c in cards:
        for d in c.get("downloads") or []:
            if not (ROOT / "assets" / "samples" / d["file"]).exists():
                missing_dl.append(f'{c["id"]}: {d["file"]}')
    check(not missing_dl, f"{jf.name} — 내려받기 파일 존재", ", ".join(missing_dl))

    # 프롬프트에 출처가 있어야 뒤에서 원고와 대조할 수 있다
    no_src = []
    for c in cards:
        ps = ([c["prompt"]] if c.get("prompt") else []) + (c.get("prompts") or [])
        for p in ps:
            if p and p.get("text") and not p.get("source"):
                no_src.append(c["id"])
    check(not no_src, f"{jf.name} — 모든 프롬프트에 출처", ", ".join(no_src))

    # 굽은 따옴표는 이 프로젝트에서 반복된 사고 원인이다.
    # 원고가 그렇다면 그대로 두는 게 맞으니 실패가 아니라 주의로만 알린다.
    curly = []
    for c in cards:
        ps = ([c["prompt"]] if c.get("prompt") else []) + (c.get("prompts") or [])
        for p in ps:
            if p and any(ch in (p.get("text") or "") for ch in "‘’“”"):
                curly.append(c["id"])
    warn(not curly, f"{jf.name} — 프롬프트에 굽은 따옴표 없음",
         "원고가 굽은 따옴표를 쓴다면 그대로 두세요: " + ", ".join(curly))

# --- 4. CSV는 엑셀에서 한글이 깨지지 않아야 한다 ---------------------------
for csv in sorted((ROOT / "assets" / "samples").glob("*.csv")):
    head = csv.read_bytes()[:3]
    check(head == b"\xef\xbb\xbf", f"{csv.name} — UTF-8 BOM 있음",
          "BOM이 없으면 엑셀에서 한글이 깨집니다")

# --- 5. 공개 저장소에 학생 자료가 없어야 한다 ------------------------------
LEAKY = [".xlsx", ".xls", ".hwp", ".hwpx", ".pptx", ".docx"]
leaked = [str(p.relative_to(ROOT)) for p in ROOT.rglob("*")
          if p.is_file() and p.suffix.lower() in LEAKY]
check(not leaked, "학생 자료 형식 파일 없음", ", ".join(leaked))

# --- 결과 -----------------------------------------------------------------
print("\n" + "=" * 62)
print(f"점검 {checks}건 — 실패 {len(fails)}, 주의 {len(warns)}")
if fails:
    print("\n실패 항목:")
    for f in fails:
        print("  -", f)
    print("\n연수 전에 고쳐야 합니다.")
    sys.exit(1)
if warns:
    print("\n주의 항목(원고가 그렇다면 그대로 두세요):")
    for w in warns:
        print("  -", w)
print("\n연수장 사고 유형 점검을 통과했습니다.")
sys.exit(0)
