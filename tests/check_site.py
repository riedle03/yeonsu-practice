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

# 한국어 윈도우 콘솔은 기본이 cp949라 줄표(—)에서 죽는다. 이 점검은 사고를
# 확인하러 온 사람이 돌리는 것인데, 여기서 트레이스백을 뱉으면 사이트가
# 망가진 줄 안다. 점검이 사람을 속이면 안 된다.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

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
# CSS의 @import·url()과 JS의 fetch도 같은 그물에 넣는다. HTML만 봐서는
# CDN 0건 제약이 지켜지는지 알 수 없다.
EXTERNAL_ASSET = re.compile(
    r'(?:@import\s+(?:url\()?["\']?|url\(\s*["\']?|fetch\(\s*["\'])'
    r'(?:https?:)?//(?!127\.0\.0\.1|localhost)', re.I
)
for html in sorted(ROOT.glob("*.html")):
    hits = []
    for i, line in enumerate(html.read_text(encoding="utf-8").split("\n"), 1):
        if EXTERNAL.search(line):
            hits.append(f"{html.name}:{i}  {line.strip()[:90]}")
    check(not hits, f"{html.name} — 외부 자원 요청 없음", "\n       ".join(hits))

for asset in sorted(list((ROOT / "assets" / "css").glob("*.css"))
                    + list((ROOT / "assets" / "js").glob("*.js"))):
    hits = []
    for i, line in enumerate(asset.read_text(encoding="utf-8").split("\n"), 1):
        if EXTERNAL_ASSET.search(line):
            hits.append(f"{asset.name}:{i}  {line.strip()[:90]}")
    check(not hits, f"{asset.name} — 외부 자원 요청 없음", "\n       ".join(hits))

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

    # id가 빠지면 전 카드가 같은 DOM id를 갖고 진도 추적이 통째로 뭉갠다.
    # 중복 검사는 id가 '있는' 카드만 세므로 이걸 따로 봐야 한다.
    no_id = [i for i, c in enumerate(cards) if not c.get("id")]
    check(not no_id, f"{jf.name} — 모든 카드에 id 있음",
          "id 없는 카드 번째: " + ", ".join(map(str, no_id)))

    dup = [c["id"] for c in cards if c.get("id") in seen_ids]
    for c in cards:
        if c.get("id"):
            seen_ids.add(c["id"])
    check(not dup, f"{jf.name} — 카드 id 중복 없음", ", ".join(dup))

    # 카드 id가 페이지의 예약 id와 겹치면 getElementById가 카드를 집어
    # 라이브 리전이 죽거나 진행 표시가 카드 내용으로 덮인다.
    RESERVED = {"main", "status", "spine", "spine-count",
                "rail-fill", "rail-text", "reset"}
    clash = [c["id"] for c in cards if c.get("id") in RESERVED]
    check(not clash, f"{jf.name} — 카드 id가 예약 id와 겹치지 않음", ", ".join(clash))

    # 같은 파트 안에서 순번이 겹치면 화면에 '03'이 두 개 나온다.
    seqs = [c.get("seq") for c in cards if c.get("seq") is not None]
    dup_seq = sorted({s for s in seqs if seqs.count(s) > 1})
    check(not dup_seq, f"{jf.name} — 카드 순번 중복 없음",
          ", ".join(map(str, dup_seq)))

    # 도구 링크는 https여야 한다. http는 https 배포본에서 혼합 콘텐츠로 막힌다.
    bad_url = [c.get("id") for c in cards
               if c.get("toolUrl") and not str(c["toolUrl"]).startswith("https://")]
    check(not bad_url, f"{jf.name} — 도구 주소가 https", ", ".join(map(str, bad_url)))

    # 다음 파트로 가는 링크가 실제로 있는 파일이어야 한다.
    nxt = data.get("next") or {}
    if nxt.get("href"):
        check((ROOT / nxt["href"]).exists(),
              f"{jf.name} — 다음 파트 링크 대상 존재", nxt["href"])

    # 참조한 이미지가 실제로 있어야 한다 (깨진 그림은 연수 중 못 고친다)
    missing = []
    for c in cards:
        for im in c.get("images") or []:
            f = im.get("file")
            if not f or not (ROOT / "assets" / "img" / f).exists():
                missing.append(f'{c.get("id")}: {f or "(file 없음)"}')
    check(not missing, f"{jf.name} — 참조 이미지 존재", ", ".join(missing))

    # 참조한 내려받기 파일이 실제로 있어야 한다
    missing_dl = []
    for c in cards:
        for d in c.get("downloads") or []:
            f = d.get("file")
            if not f or not (ROOT / "assets" / "samples" / f).exists():
                missing_dl.append(f'{c.get("id")}: {f or "(file 없음)"}')
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

# --- 3.5 HTML과 콘텐츠가 실제로 연결되어 있는가 ----------------------------
# 어긋나면 페이지 전체가 "실습 내용을 불러오지 못했습니다" 한 줄이 된다.
# 가장 파국적인 실패라 반드시 본다.

part_keys = {jf.stem for jf in jsons}
ANCHORS = ["main", "status", "spine", "spine-count", "rail-fill", "rail-text"]

for html in sorted(ROOT.glob("part*.html")):
    text = html.read_text(encoding="utf-8")

    m = re.search(r'<body[^>]*\bdata-part\s*=\s*["\']([^"\']+)["\']', text)
    check(m is not None, f"{html.name} — data-part 지정됨")
    if m:
        check(m.group(1) in part_keys,
              f"{html.name} — data-part '{m.group(1)}' 에 맞는 콘텐츠 있음",
              "content/ 에 있는 것: " + ", ".join(sorted(part_keys)))

    missing_anchor = [a for a in ANCHORS if f'id="{a}"' not in text]
    check(not missing_anchor, f"{html.name} — 필수 요소 id 존재",
          "빠진 id: " + ", ".join(missing_anchor))

# 번들 내용은 대조하면서 페이지가 그걸 불러오는지 안 보면 소용이 없다.
for html in sorted(ROOT.glob("*.html")):
    text = html.read_text(encoding="utf-8")
    check("content/bundle.js" in text and "assets/js/app.js" in text,
          f"{html.name} — 콘텐츠·앱 스크립트 연결됨")

# 표지의 고정 숫자가 실제 카드 수와 달라도 JS가 덮어써서 평소엔 안 보인다.
# 하지만 JS 실행 전 깜빡임과 번들 로드 실패 때 틀린 숫자가 남는다.
index_html = ROOT / "index.html"
if index_html.exists() and jsons:
    text = index_html.read_text(encoding="utf-8")
    counts = {jf.stem: len(json.loads(jf.read_text(encoding="utf-8")).get("cards", []))
              for jf in jsons}
    wrong = []
    for key, n in counts.items():
        m = re.search(
            r'data-progress-for\s*=\s*["\']' + re.escape(key) + r'["\']\s*>\s*([^<]*)',
            text)
        if not m:
            wrong.append(f"{key}: 표지에 없음")
        elif str(n) not in m.group(1):
            wrong.append(f'{key}: 표지 "{m.group(1).strip()}" vs 실제 {n}장')
    check(not wrong, "index.html — 표지 단계 수가 실제와 일치", ", ".join(wrong))

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
