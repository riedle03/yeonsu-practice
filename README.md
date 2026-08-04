# 실습 가이드 — AI·디지털 활용 업무경감의 실제

2026 하계 1급 정교사 자격연수(2026. 8. 5. · 미림마이스터고 이대형)에서
연수생이 노트북으로 열어 놓고 따라 하는 실습 사이트입니다.

강의를 듣다 놓친 지점을 다시 찾고, 프롬프트를 클릭 한 번으로 복사하고,
어디까지 했는지 남기는 것 — 이 세 가지가 이 사이트가 하는 일의 전부입니다.

## 구성

| 파트 | 내용 |
|------|------|
| Part 1 | 제미나이 기초 12가지 |
| Part 2 | 출제 워크플로우 6단계 (출제 → 검토 → 배점 → 성취기준 → 내용 영역 → 세특) |
| Part 3 | 캔바 대량제작 (상장·학부모 편지) |

## 만드는 방식

빌드 도구도 프레임워크도 쓰지 않습니다. 정적 파일을 그대로 올리고,
`git push` 하면 Vercel이 배포합니다.

외부 CDN은 폰트 한 곳(jsdelivr의 프리텐다드, 버전 고정)만 씁니다.
스크립트·아이콘·이미지는 전부 이 저장소 안에 있습니다. 폰트가 못 와도
맑은 고딕으로 떨어질 뿐 화면은 그대로 뜨기 때문에 이 예외만 열어 뒀습니다.
프롬프트에 쓰는 D2Coding은 쓸 만한 CDN이 없어 저장소에 담았습니다.

허용 목록은 `tests/check_site.py`의 `ALLOWED_EXTERNAL`에 있고, 목록에 없는
외부 자원이 들어오면 점검이 실패합니다.

```
index.html  part1.html  part2.html  part3.html
assets/css/site.css     디자인
assets/js/app.js        렌더링·복사·진도
assets/img/             정본 PPTX에서 추출한 실제 화면 (생성 이미지 아님)
assets/samples/         실습용 샘플 자료
content/part*.json      실습 카드 — 콘텐츠의 진실의 원천
content/bundle.js       위 JSON을 묶은 것 (자동 생성, 직접 고치지 말 것)
```

## 콘텐츠를 고칠 때

`content/*.json` 만 고치고, 다시 묶습니다.

```bash
node tools/bundle.mjs
```

`bundle.js`를 직접 고치면 다음 번들 실행 때 지워집니다.

### 프롬프트는 강의원고가 진실입니다

연수생이 복사한 프롬프트가 강의원고와 다르면 연수장에서 다른 결과가 나옵니다.
그래서 프롬프트마다 출처(`파일경로:라인`)를 달고, 원고와 문자열이 같은지
기계적으로 대조합니다.

```bash
python ../../.claude/skills/yeonsu-practice-site/scripts/verify_prompts.py \
  --content content/ --root ../..
```

`MISMATCH`가 나오면 **JSON을 원고에 맞춰 고칩니다.** 원고를 고쳐서 통과시키지
않습니다.

## 화면 이미지

`assets/img/`의 그림은 전부 정본 PPTX에서 뽑은 **실제 스크린샷**입니다.
연수생은 이 그림과 자기 화면을 대조하므로, 생성한 이미지를 넣지 않습니다.
그럴듯한 가짜 화면은 선생님이 자기가 잘못한 줄 알게 만듭니다.

```bash
python ../../.claude/skills/yeonsu-practice-site/scripts/extract_slide_images.py \
  --pptx "<정본 pptx 경로>" --out assets/img
```

## 학생 정보

이 저장소는 공개입니다. 샘플 자료는 전부 `학생A`, `S1` 형태의 가상 데이터이며,
실제 학생 이름·학번·성찰일지·세특은 어떤 형태로도 넣지 않습니다.
`.gitignore`가 `.xlsx`·`.hwp`·`.pptx` 등을 통째로 막아 둔 이유입니다.

## 로컬에서 보기

```bash
python -m http.server 8000
# http://localhost:8000
```

`file://`로 열어도 동작합니다 — 콘텐츠를 `fetch` 대신 `<script>`로 읽기 때문입니다.
