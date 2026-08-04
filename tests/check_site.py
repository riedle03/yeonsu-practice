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
#
# 예외는 폰트 CDN 하나뿐이다(사용자 결정, 2026-08-04). 글자를 깎아 담으면
# 원고를 고칠 때마다 다시 깎아야 하고 깜빡하면 그 글자만 다른 글꼴로 튀는데,
# 그 관리비를 지지 않기로 했다. 폰트가 못 오면 맑은 고딕으로 떨어질 뿐 화면은
# 그대로 뜬다 — 이 예외가 감당하는 최악이 그 정도라서 허용한다.
#
# 목록에 없는 외부 자원은 여전히 실패다. 스크립트·이미지·분석 도구가 슬그머니
# 들어오는 것을 막는 그물은 그대로 둔다.
ALLOWED_EXTERNAL = {
    "https://cdn.jsdelivr.net",
    "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css",
}
URL_IN_TAG = re.compile(
    r'(?:src|href)\s*=\s*["\']((?:https?:)?//[^"\']+)["\']', re.I
)
# CSS의 @import·url()과 JS의 fetch도 같은 그물에 넣는다. HTML만 봐서는
# CDN 0건 제약이 지켜지는지 알 수 없다. 이쪽은 예외 없이 0건이다.
EXTERNAL_ASSET = re.compile(
    r'(?:@import\s+(?:url\()?["\']?|url\(\s*["\']?|fetch\(\s*["\'])'
    r'(?:https?:)?//(?!127\.0\.0\.1|localhost)', re.I
)
for html in sorted(ROOT.glob("*.html")):
    hits = []
    for i, line in enumerate(html.read_text(encoding="utf-8").split("\n"), 1):
        for url in URL_IN_TAG.findall(line):
            norm = url if url.lower().startswith("http") else "https:" + url
            host = norm.split("/")[2].lower() if norm.count("/") >= 2 else ""
            if host in ("127.0.0.1", "localhost") or norm.rstrip("/") in ALLOWED_EXTERNAL:
                continue
            hits.append(f"{html.name}:{i}  {url[:90]}")
    check(not hits, f"{html.name} — 허용 목록 밖 외부 자원 없음", "\n       ".join(hits))

# 예외로 연 폰트 CDN이 실제로 각 페이지에 걸려 있는지도 본다. 한 페이지만
# 빠지면 그 페이지만 맑은 고딕으로 떠서, 넘길 때 글자가 바뀐다.
PRETENDARD_CSS = (
    "https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/static/pretendard.css"
)
missing_font_link = [h.name for h in sorted(ROOT.glob("*.html"))
                     if PRETENDARD_CSS not in h.read_text(encoding="utf-8")]
check(not missing_font_link, "모든 페이지가 프리텐다드 CDN을 부름",
      "빠진 페이지: " + ", ".join(missing_font_link))

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

# --- 6. 웹폰트 ------------------------------------------------------------
# 본문·머리글은 프리텐다드 CDN이 맡는다(위 1번에서 링크를 확인했다).
# 프롬프트에 쓰는 D2Coding만 저장소에 담는다 — 쓸 만한 CDN이 없어서다.
#
# D2Coding은 글자를 깎지 않고 통째로 담았지만, 담는 과정에서 잘못된 face를
# 고르거나 파일이 잘려도 화면에는 '조금 이상한 글꼴'로만 보인다. 그래서 실제
# 프롬프트 글자가 폰트 안에 다 있는지 파일을 열어 대조한다.

FONT_DIR = ROOT / "assets" / "fonts"
css_text = (ROOT / "assets" / "css" / "site.css").read_text(encoding="utf-8")

check((FONT_DIR / "D2Coding.woff2").exists(), "D2Coding.woff2 — 파일 있음 (프롬프트)")
check("D2Coding.woff2" in css_text, "D2Coding.woff2 — site.css가 참조함")
# 라이선스(SIL OFL)는 폰트를 재배포할 때 같이 담아야 한다. 공개 저장소다.
# 프리텐다드는 CDN이 자기 라이선스와 함께 내주므로 여기서 담지 않는다.
check((FONT_DIR / "LICENSE-D2Coding-OFL.txt").exists(),
      "LICENSE-D2Coding-OFL.txt — 함께 배포됨")

# preload가 없는 파일을 가리키면 브라우저가 조용히 무시한다. 지금은 preload를
# 쓰지 않지만, 나중에 넣고 경로를 틀리는 일을 막아 둔다.
bad_preload = []
for html in sorted(ROOT.glob("*.html")):
    for href in re.findall(r'<link[^>]*rel=["\']preload["\'][^>]*href=["\']([^"\']+)["\']',
                           html.read_text(encoding="utf-8")):
        if not href.startswith("http") and not (ROOT / href).exists():
            bad_preload.append(f"{html.name} -> {href}")
check(not bad_preload, "preload 대상 파일이 모두 실재함", ", ".join(bad_preload))

try:
    from fontTools.ttLib import TTFont
except ImportError:
    warn(False, "D2Coding 글리프 커버리지 점검",
         "fontTools가 없어 건너뜁니다: pip install fonttools")
else:
    fp = FONT_DIR / "D2Coding.woff2"
    if fp.exists():
        f = TTFont(str(fp))
        cm = set()
        for tb in f["cmap"].tables:
            cm |= set(tb.cmap.keys())
        f.close()

        # 프롬프트 본문만 D2Coding으로 렌더된다.
        prompt_text: list[str] = []

        def walk(node, in_prompt=False):
            if isinstance(node, dict):
                for k, v in node.items():
                    walk(v, in_prompt or k in ("prompt", "prompts"))
            elif isinstance(node, list):
                for v in node:
                    walk(v, in_prompt)
            elif isinstance(node, str) and in_prompt:
                prompt_text.append(node)

        for jf in jsons:
            walk(json.loads(jf.read_text(encoding="utf-8")))

        used = set("".join(prompt_text)) - set("\n\r\t")
        missing = sorted(c for c in used if ord(c) not in cm)
        gone_hangul = [c for c in missing
                       if 0xAC00 <= ord(c) <= 0xD7A3 or 0x3131 <= ord(c) <= 0x318E]
        # 이모지는 어느 본문 폰트에도 없다. 시스템 이모지 글꼴로 떨어지는 게
        # 정상이므로 실패가 아니라 주의로 남긴다.
        gone_other = [c for c in missing if c not in gone_hangul]
        check(not gone_hangul, "D2Coding — 프롬프트의 한글이 모두 들어 있음",
              "빠진 글자: " + "".join(gone_hangul))
        warn(not gone_other, "D2Coding — 프롬프트의 기호도 모두 들어 있음",
             "시스템 폰트로 대체됨: " + "".join(gone_other))

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
