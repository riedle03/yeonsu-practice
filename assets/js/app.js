/* ===========================================================================
   2026 하계 1급 정교사 자격연수 — 실습 가이드
   ---------------------------------------------------------------------------
   콘텐츠는 window.YEONSU(= content/bundle.js)가 유일한 원천이다.
   여기서 한국어 문구를 새로 만들지 않는다. UI 라벨만 이 파일에 있다.
   =========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "yeonsu2026:done";
  var TOOL_NAME = {
    gemini: "제미나이",
    // 2026-08 제미나이 노트북으로 이름이 바뀌었다. 키(notebooklm)는 내부
    // 식별자라 그대로 두고 화면에 보이는 이름만 바꾼다.
    notebooklm: "제미나이 노트북",
    chatgpt: "ChatGPT",
    canva: "캔바",
    google: "구글",
    neis: "NEIS",
    checker: "생기부 점검기"
  };

  /* --- 진도 저장 ---------------------------------------------------------
     저장이 실패해도(사생활 보호 모드 등) 실습 자체는 굴러가야 한다.
     그래서 메모리 사본을 항상 들고 있고, localStorage는 거들기만 한다. */
  var done = new Set();

  function loadDone() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) JSON.parse(raw).forEach(function (id) { done.add(id); });
    } catch (e) { /* 저장소를 못 써도 진행에는 지장 없다 */ }
  }

  function saveDone() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(done)));
    } catch (e) { /* 조용히 넘어간다 — 알림을 띄우면 실습을 방해한다 */ }
  }

  /* --- 도우미 ------------------------------------------------------------ */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function promptsOf(card) {
    var list = [];
    if (card.prompt) list.push(card.prompt);
    if (card.prompts) list = list.concat(card.prompts);
    return list.filter(function (p) { return p && p.text; });
  }

  /* --- 복사 --------------------------------------------------------------
     원문은 항상 데이터에서 가져온다. 화면에 보이는 텍스트를 긁지 않는다.
     프롬프트가 접혀 있어도 전문이 복사되는 이유가 이것이다. */
  function legacyCopy(text) {
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error("copy-failed"));
    });
  }

  function copyText(text) {
    // 최신 방식이 '없을 때'뿐 아니라 '거부될 때'도 옛 방식으로 넘어가야 한다.
    // file://로 열거나(오프라인 사본), 권한을 막았거나, 창이 포커스를 잃으면
    // writeText는 존재하지만 거부한다. 그때 폴백을 안 타면 연수장에서
    // 프롬프트 26개가 전부 수동 복사로 떨어진다.
    if (navigator.clipboard && window.isSecureContext) {
      try {
        return navigator.clipboard.writeText(text).catch(function () {
          return legacyCopy(text);
        });
      } catch (e) {
        return legacyCopy(text);
      }
    }
    return legacyCopy(text);
  }

  // 펼침 상태는 클래스·버튼 글자·aria 세 곳에 걸쳐 있다. 한 곳에서만 바꾸게
  // 묶어 둔다. 예전에 복사 실패 경로가 클래스만 바꿔, 펼쳐진 글을 보려고
  // '전문 펼치기'를 누르면 오히려 접히는 일이 있었다.
  function setPromptOpen(box, open) {
    if (!box) return;
    box.classList.toggle("prompt--open", open);
    var toggle = box.querySelector(".prompt__toggle");
    if (toggle) {
      toggle.textContent = open ? "접기" : "전문 펼치기";
      toggle.setAttribute("aria-expanded", String(open));
    }
  }

  function wireCopy(btn, text, status) {
    btn.addEventListener("click", function () {
      copyText(text).then(function () {
        btn.dataset.state = "ok";
        btn.textContent = "복사됨";
        status.textContent = "프롬프트를 복사했습니다. 도구 입력창에 붙여넣으세요.";
        window.setTimeout(function () {
          btn.dataset.state = "";
          btn.textContent = "복사";
        }, 1600);
      }).catch(function () {
        // 복사가 막힌 환경 — 직접 고를 수 있게 펼쳐서 선택 상태로 만든다.
        btn.dataset.state = "fail";
        btn.textContent = "직접 복사하세요";
        var box = btn.closest(".prompt");
        if (box) {
          setPromptOpen(box, true);
          var pre = box.querySelector(".prompt__text");
          if (pre) {
            var range = document.createRange();
            range.selectNodeContents(pre);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
        status.textContent =
          "브라우저가 복사를 막았습니다. 펼쳐진 프롬프트가 선택되어 있으니 Ctrl+C를 누르세요.";
      });
    });
  }

  /* --- 프롬프트 블록 ------------------------------------------------------ */

  function buildPrompt(p, status) {
    var box = el("div", "prompt");

    var bar = el("div", "prompt__bar");
    bar.appendChild(el("span", "prompt__label", p.label || "프롬프트"));
    bar.appendChild(el("span", "prompt__len", p.text.length + "자"));
    var btn = el("button", "prompt__copy", "복사");
    btn.type = "button";
    bar.appendChild(btn);
    box.appendChild(bar);

    // 이 프롬프트만 카드 설명과 다른 대목이 있을 때의 한 줄. 접힌 상태에서도
    // 보이도록 본문 위에 둔다 — 펼쳐야 보이면 못 보고 지나간다.
    if (p.hint) box.appendChild(el("p", "prompt__hint", p.hint));

    var body = el("div", "prompt__body");
    var pre = el("pre", "prompt__text", p.text);
    body.appendChild(pre);
    box.appendChild(body);

    // 짧은 프롬프트는 접을 필요가 없다. 접기 버튼이 오히려 손이 더 간다.
    var lines = p.text.split("\n").length;
    if (lines > 6 || p.text.length > 320) {
      body.appendChild(el("div", "prompt__fade"));
      var toggle = el("button", "prompt__toggle", "전문 펼치기");
      toggle.type = "button";
      toggle.setAttribute("aria-expanded", "false");
      toggle.addEventListener("click", function () {
        setPromptOpen(box, !box.classList.contains("prompt--open"));
      });
      box.appendChild(toggle);
    } else {
      box.classList.add("prompt--open");
    }

    wireCopy(btn, p.text, status);   // 원문 그대로 전달 — DOM을 거치지 않는다
    return box;
  }

  /* --- 교과별 프롬프트 ----------------------------------------------------
     연수생은 국어·미술·수학·지리 중 한 교과다. 프롬프트 하나가 5천 자라
     네 개를 나란히 두면 2만 자가 되고, 자기 것을 찾아 스크롤하는 동안
     강의는 다음 단계로 넘어간다.

     그래서 고른 교과의 것만 남기고 나머지는 화면에서 아예 지운다(hidden).
     한 번 고르면 이 기기에 저장돼 모든 단계·모든 파트에 그대로 적용된다 —
     단계마다 다시 고르게 하면 그게 또 손이 간다. */

  var SUBJECTS = ["국어", "미술", "수학", "지리"];
  var SUBJ_KEY = "yeonsu.subject.v1";
  var subjectPanels = [];      // 화면의 모든 교과 블록. 하나를 고르면 전부 따라 바뀐다

  function loadSubject() {
    try {
      var v = window.localStorage.getItem(SUBJ_KEY);
      return SUBJECTS.indexOf(v) >= 0 ? v : null;
    } catch (e) { return null; }
  }

  function saveSubject(s) {
    try { window.localStorage.setItem(SUBJ_KEY, s); } catch (e) { /* 사생활 보호 모드 */ }
  }

  function applySubject(s) {
    subjectPanels.forEach(function (show) { show(s); });
  }

  function buildSubjectPrompts(list, status) {
    var wrap = el("div", "subjects");

    var bar = el("div", "subjects__bar");
    bar.appendChild(el("span", "subjects__label", "내 교과"));
    var chips = el("div", "subjects__chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "교과 선택");
    bar.appendChild(chips);
    wrap.appendChild(bar);

    var hint = el("p", "subjects__hint", "교과를 누르면 그 교과 프롬프트가 열립니다.");
    wrap.appendChild(hint);

    // 한 교과에 프롬프트가 여럿일 수 있다(전문 + 입력 양식). 배열로 받는다.
    var boxes = {}, chipEls = {};
    list.forEach(function (p) {
      var box = buildPrompt(p, status);
      box.hidden = true;
      (boxes[p.subject] = boxes[p.subject] || []).push(box);
      wrap.appendChild(box);
    });

    SUBJECTS.forEach(function (s) {
      if (!boxes[s]) return;
      var c = el("button", "subjects__chip", s);
      c.type = "button";
      c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", function () {
        saveSubject(s);
        applySubject(s);
        status.textContent = s + "과 프롬프트를 열었습니다.";
      });
      chipEls[s] = c;
      chips.appendChild(c);
    });

    function show(s) {
      var picked = false;
      SUBJECTS.forEach(function (k) {
        if (chipEls[k]) chipEls[k].setAttribute("aria-pressed", String(k === s));
        if (!boxes[k]) return;
        boxes[k].forEach(function (box) {
          box.hidden = (k !== s);
          if (k === s) setPromptOpen(box, true);
        });
        if (k === s) picked = true;
      });
      // 고르기 전에는 안내만 보인다. 빈 화면을 남기지 않는다.
      hint.textContent = picked
        ? s + "과 프롬프트입니다. 다른 교과가 필요하면 위에서 바꾸세요."
        : "교과를 누르면 그 교과 프롬프트가 열립니다.";
      wrap.classList.toggle("subjects--picked", picked);
    }

    subjectPanels.push(show);
    return wrap;
  }

  /* --- 평가 종류별 프롬프트 ------------------------------------------------
     한 단계가 지필과 수행을 함께 다루기도 한다. 두 벌을 나란히 두면 2,800자
     아래에 또 4,600자가 붙어, 자기 것을 찾아 내리는 동안 강의는 넘어간다.

     교과 칩과 다른 점이 하나 있다 — 고르기 전에도 첫 번째 것이 이미 열려 있다.
     넷 중 어느 교과인지는 사이트가 알 수 없지만 평가 종류에는 기본값이 있다.
     이 강의가 지필 흐름으로 진행되기 때문이다. 아무것도 안 고른 화면을 만들면,
     어제까지 그냥 보이던 프롬프트가 사라진 것으로 읽힌다.

     접힘 상태는 건드리지 않는다. 교과 블록은 고른 것을 펼쳐 주지만, 여기서는
     첫 벌이 처음부터 보이므로 펼쳐 두면 카드가 화면 몇 개 길이로 늘어난다.
     복사 버튼은 접혀 있어도 전문을 복사한다 — 그게 이 화면의 설계다. */

  function buildTrackPrompts(list, status) {
    var wrap = el("div", "tracks");

    var bar = el("div", "tracks__bar");
    bar.appendChild(el("span", "tracks__label", "평가 종류"));
    var chips = el("div", "tracks__chips");
    chips.setAttribute("role", "group");
    chips.setAttribute("aria-label", "평가 종류 선택");
    bar.appendChild(chips);
    wrap.appendChild(bar);

    // 종류와 순서는 데이터가 정한다. 여기에 이름을 적어 두면 카드가 늘 때마다
    // 이 파일을 함께 고쳐야 하고, 그러다 한쪽만 고치면 프롬프트가 사라진다.
    var order = [], boxes = {}, chipEls = {};
    list.forEach(function (p) {
      if (order.indexOf(p.track) < 0) order.push(p.track);
      var box = buildPrompt(p, status);
      box.hidden = true;
      (boxes[p.track] = boxes[p.track] || []).push(box);
      wrap.appendChild(box);
    });

    function show(t) {
      order.forEach(function (k) {
        chipEls[k].setAttribute("aria-pressed", String(k === t));
        boxes[k].forEach(function (box) { box.hidden = (k !== t); });
      });
    }

    order.forEach(function (t) {
      var c = el("button", "tracks__chip", t);
      c.type = "button";
      c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", function () {
        show(t);
        status.textContent = t + " 프롬프트를 열었습니다.";
      });
      chipEls[t] = c;
      chips.appendChild(c);
    });

    show(order[0]);
    return wrap;
  }

  /* --- 실습 카드 ---------------------------------------------------------- */

  // 화면 예시 한 장. 단계 밑에 붙을 때는 stepNo를 넘긴다 — 낭독기가 어느
  // 단계의 그림인지 알 수 있어야 하고, 크기도 단계용이 더 작아야 한다.
  function buildShot(im, card, stepNo) {
    var fig = el("figure", "shot" + (stepNo ? " shot--step" : ""));
    var link = el("a");
    link.href = "assets/img/" + im.file;
    link.target = "_blank";
    link.rel = "noopener";
    var img = el("img");
    img.src = "assets/img/" + im.file;
    img.alt = stepNo
      ? "단계 " + stepNo + " 화면 예시 — " + (card.title || "")
      : (card.title || "") + " 화면 예시";
    img.loading = "lazy";
    img.decoding = "async";
    if (im.w) img.width = im.w;
    if (im.h) img.height = im.h;
    link.appendChild(img);
    link.appendChild(el("span", "shot__more", "눌러서 크게 보기 ↗"));
    fig.appendChild(link);
    return fig;
  }

  function buildCard(card, status, onToggle) {
    var art = el("article", "card");
    art.id = card.id;
    if (done.has(card.id)) art.classList.add("card--done");

    var top = el("div", "card__top");
    if (card.seq != null) {
      top.appendChild(el("div", "card__no", String(card.seq).padStart(2, "0")));
    }

    var heads = el("div", "card__heads");
    heads.appendChild(el("h2", "card__title", card.title));
    if (card.subtitle) heads.appendChild(el("p", "card__sub", card.subtitle));
    top.appendChild(heads);

    var stamp = el("button", "stamp");
    stamp.type = "button";
    stamp.setAttribute("aria-pressed", String(done.has(card.id)));
    stamp.setAttribute("aria-label", card.title + " 완료 표시");
    stamp.appendChild(el("span", "stamp__label", done.has(card.id) ? "완" : "완료"));
    stamp.addEventListener("click", function () {
      var nowDone = !done.has(card.id);
      nowDone ? done.add(card.id) : done.delete(card.id);
      saveDone();
      stamp.setAttribute("aria-pressed", String(nowDone));
      stamp.firstChild.textContent = nowDone ? "완" : "완료";
      art.classList.toggle("card--done", nowDone);
      status.textContent = card.title + (nowDone ? " 완료로 표시했습니다." : " 완료 표시를 해제했습니다.");
      onToggle();
    });
    top.appendChild(stamp);
    art.appendChild(top);

    // 도구·시간 배지
    var meta = el("div", "meta");
    if (card.tool) {
      var name = TOOL_NAME[card.tool] || card.tool;
      if (card.toolUrl) {
        var a = el("a", "badge badge--tool", name);
        a.href = card.toolUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "badge__arrow", "↗"));
        meta.appendChild(a);
      } else {
        meta.appendChild(el("span", "badge badge--tool", name));
      }
    }
    if (card.minutes) meta.appendChild(el("span", "badge badge--time", card.minutes + "분"));
    if (card.slides && card.slides.length) {
      meta.appendChild(el("span", "badge", "슬라이드 " + card.slides.join(", ")));
    }
    if (meta.childNodes.length) art.appendChild(meta);

    // 준비물
    if (card.prepare && card.prepare.length) {
      var prep = el("div", "prep");
      prep.appendChild(el("div", "prep__label", "준비물"));
      var ul = el("ul", "prep__list");
      card.prepare.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      prep.appendChild(ul);
      art.appendChild(prep);
    }

    // 그림을 단계별로 가른다. `step`(1-기준)이 붙은 것은 그 단계 밑으로,
    // 없거나 범위를 벗어난 것은 카드 끝 격자로 — 즉 예전 화면 그대로다.
    // 배정이 하나도 없어도 화면이 오늘과 똑같이 뜨는 것이 이 코드의 안전망이다.
    var byStep = {}, loose = [];
    (card.images || []).forEach(function (im) {
      var n = im.step;
      if (typeof n === "number" && n >= 1 &&
          card.steps && n <= card.steps.length) {
        (byStep[n] = byStep[n] || []).push(im);
      } else {
        loose.push(im);
      }
    });

    // 단계 — 그림은 반드시 해당 <li> '안에' 넣는다. 형제로 두면 .steps의
    // CSS 카운터가 li마다 증가하는 구조라 번호가 어긋난다.
    if (card.steps && card.steps.length) {
      var ol = el("ol", "steps");
      card.steps.forEach(function (t, i) {
        var li = el("li", null, t);
        var mine = byStep[i + 1];
        if (mine && mine.length) {
          var box = el("div", "shots shots--step");
          mine.forEach(function (im) { box.appendChild(buildShot(im, card, i + 1)); });
          li.appendChild(box);
        }
        ol.appendChild(li);
      });
      art.appendChild(ol);
    }

    // 프롬프트 — `track`(평가 종류)이나 `subject`(교과)가 붙은 것은 골라 보는
    // 블록으로 따로 묶는다. 둘 다 없는 프롬프트는 모두가 그대로 쓰는 공통이라
    // 항상 보인다.
    var commonP = [], subjectP = [], trackP = [];
    promptsOf(card).forEach(function (p) {
      if (p.track) trackP.push(p);
      else if (p.subject) subjectP.push(p);
      else commonP.push(p);
    });
    commonP.forEach(function (p) { art.appendChild(buildPrompt(p, status)); });
    if (trackP.length) art.appendChild(buildTrackPrompts(trackP, status));
    if (subjectP.length) art.appendChild(buildSubjectPrompts(subjectP, status));

    // 어느 단계에도 붙지 않는 그림 — 카드 전체에 관한 화면
    if (loose.length) {
      var figs = el("div", "shots");
      loose.forEach(function (im) { figs.appendChild(buildShot(im, card, null)); });
      art.appendChild(figs);
    }

    // 실습 자료 내려받기 — 브라우저에서 만들지 않고 실제 파일을 준다.
    // 즉석 생성은 다운로드 차단·인코딩 사고가 나는데, 연수 중에는 손쓸 수 없다.
    //
    // links는 내려받는 대신 '거기 가서 사본을 뜨는' 자료다(구글 시트 등).
    // 파일을 받아 다시 올리는 것보다 사본 한 번이 연수장에서 빠르다.
    // 생김새는 내려받기와 같은 줄에 두되, 화살표로 나가는 링크임을 알린다.
    var dlist = (card.downloads || []).length + (card.links || []).length;
    if (dlist) {
      var dls = el("div", "downloads");
      (card.downloads || []).forEach(function (d) {
        var a = el("a", "download");
        a.href = "assets/samples/" + d.file;
        a.setAttribute("download", d.file);
        a.appendChild(el("span", "download__icon", "↓"));
        a.appendChild(el("span", null, d.label || d.file));
        dls.appendChild(a);
      });
      (card.links || []).forEach(function (l) {
        if (!l || !l.url) return;
        var a = el("a", "download");
        a.href = l.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.appendChild(el("span", "download__icon", "↗"));
        a.appendChild(el("span", null, l.label || l.url));
        dls.appendChild(a);
      });
      art.appendChild(dls);
    }

    // 개인정보 안내는 눈에 띄어야 한다. 이걸 못 보면 선생님은 학생 이름을
    // 일일이 지우고 올리거나, 아예 실습을 건너뛴다.
    if (card.safety) {
      var safe = el("div", "safety");
      safe.appendChild(el("div", "safety__label", "개인정보 — 이 도구는 안전합니다"));
      safe.appendChild(el("p", "safety__body", card.safety));
      art.appendChild(safe);
    }

    if (card.success) {
      var ok = el("div", "note note--success");
      ok.appendChild(el("div", "note__label", "이렇게 나오면 성공"));
      ok.appendChild(el("p", "note__body", card.success));
      art.appendChild(ok);
    }

    if (card.pitfalls && card.pitfalls.length) {
      var pit = el("div", "note note--pitfall");
      pit.appendChild(el("div", "note__label", "막히면"));
      var pl = el("ul");
      card.pitfalls.forEach(function (t) { pl.appendChild(el("li", null, t)); });
      pit.appendChild(pl);
      art.appendChild(pit);
    }

    return art;
  }

  /* --- 파트 화면 ---------------------------------------------------------- */

  // 낭독기 안내용 자리. 없으면 만들어 준다 — 없을 때 조용히 두면 도장과
  // 복사 버튼이 각각 죽는데 화면은 멀쩡해 보여서 당일 원인을 못 찾는다.
  function ensureStatus() {
    var status = document.getElementById("status");
    if (!status) {
      status = el("p", "sr");
      status.id = "status";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      document.body.appendChild(status);
    }
    return status;
  }

  // 히어로는 장식이라 콘텐츠 JSON에 두지 않는다. JSON은 원고와 대조되는
  // 문구의 자리이고, 그림은 대조 대상이 아니다. 파트 키로 파일을 정한다.
  //
  // 파일이 없으면 상자째 걷어낸다. 연수장에서 깨진 이미지 아이콘이 뜨면
  // 선생님은 자기 인터넷이 문제인 줄 알고 실습을 멈춘다.
  function buildHero(partKey) {
    var box = el("div", "hero");
    var img = document.createElement("img");
    img.alt = "";                      // 장식 — 낭독기는 건너뛴다
    img.setAttribute("aria-hidden", "true");
    img.loading = "eager";             // 첫 화면이라 늦게 뜨면 덜컹인다
    img.addEventListener("error", function () {
      if (box.parentNode) box.parentNode.removeChild(box);
    });
    img.src = "assets/img/hero-" + partKey + ".webp";
    box.appendChild(img);
    return box;
  }

  function renderPart(partKey) {
    var data = (window.YEONSU || {})[partKey];
    var main = document.getElementById("main");
    if (!main) return;          // 담을 곳이 없으면 할 일도 없다
    if (!data || !data.cards) {
      main.appendChild(el("p", "callout",
        "실습 내용을 불러오지 못했습니다. 새로고침해 주세요."));
      return;
    }

    var status = ensureStatus();
    main.appendChild(buildHero(partKey));

    var head = el("header", "parthead");
    head.appendChild(el("div", "parthead__eyebrow", data.eyebrow || ""));
    head.appendChild(el("h1", "parthead__title", data.title || ""));
    if (data.lead) head.appendChild(el("p", "parthead__lead", data.lead));
    main.appendChild(head);

    if (data.notice) {
      var c = el("div", "callout");
      c.appendChild(el("div", "callout__title", data.notice.title));
      c.appendChild(el("p", null, data.notice.body));
      main.appendChild(c);
    }

    var refresh = function () { updateProgress(data); };
    data.cards.forEach(function (card) {
      main.appendChild(buildCard(card, status, refresh));
    });

    // 파트 끝
    var foot = el("div", "partfoot");
    foot.appendChild(el("p", "partfoot__done", "여기까지가 " + (data.title || "이 파트") + "입니다."));
    if (data.next) {
      var a = el("a", "partfoot__next", data.next.label);
      a.href = data.next.href;
      foot.appendChild(a);
    }
    main.appendChild(foot);

    buildSpine(data);
    updateProgress(data);
    watchPosition(data);

    // 지난번에 고른 교과를 그대로 되살린다. 파트를 넘겨도 다시 고를 일이 없다.
    applySubject(loadSubject());
  }

  function buildSpine(data) {
    var spine = document.getElementById("spine");
    if (!spine) return;
    var list = el("ol", "spine__list");
    data.cards.forEach(function (card) {
      var li = el("li", "spine__item");
      li.dataset.card = card.id;
      var a = el("a");
      a.href = "#" + card.id;
      a.appendChild(el("span", "spine__no", card.seq != null ? String(card.seq) : "·"));
      a.appendChild(el("span", null, card.title));
      li.appendChild(a);
      list.appendChild(li);
    });
    spine.appendChild(list);
  }

  function updateProgress(data) {
    var total = data.cards.length;
    var n = data.cards.filter(function (c) { return done.has(c.id); }).length;

    var count = document.getElementById("spine-count");
    if (count) count.innerHTML = "<b>" + n + "</b> / " + total;

    var fill = document.getElementById("rail-fill");
    if (fill) fill.style.width = (total ? (n / total) * 100 : 0) + "%";
    var text = document.getElementById("rail-text");
    if (text) text.innerHTML = "<b>" + n + "</b>/" + total;

    document.querySelectorAll(".spine__item").forEach(function (li) {
      li.classList.toggle("spine__item--done", done.has(li.dataset.card));
    });
  }

  // 지금 보고 있는 카드를 척추에서 짚어 준다 — '내가 어디지'가 이 화면의 일이다.
  function watchPosition(data) {
    if (!("IntersectionObserver" in window)) return;
    var links = {};
    document.querySelectorAll(".spine__item a").forEach(function (a) {
      links[a.getAttribute("href").slice(1)] = a;
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var a = links[e.target.id];
        if (!a) return;
        if (e.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].removeAttribute("aria-current"); });
          a.setAttribute("aria-current", "true");
        }
      });
    }, { rootMargin: "-72px 0px -70% 0px", threshold: 0 });
    data.cards.forEach(function (c) {
      var n = document.getElementById(c.id);
      if (n) io.observe(n);
    });
  }

  /* --- 표지 진행 요약 ----------------------------------------------------- */

  function renderCoverProgress() {
    var data = window.YEONSU || {};
    document.querySelectorAll("[data-progress-for]").forEach(function (node) {
      var part = data[node.dataset.progressFor];
      if (!part || !part.cards) return;
      var total = part.cards.length;
      var n = part.cards.filter(function (c) { return done.has(c.id); }).length;
      node.innerHTML = n > 0
        ? "<b>" + n + "</b> / " + total + " 완료"
        : total + "단계";
      if (n > 0) node.classList.add("is-started");
    });
  }

  /* --- 진도 지우기 -------------------------------------------------------- */

  function wireReset() {
    var btn = document.getElementById("reset");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (!window.confirm("체크한 진도를 모두 지웁니다. 계속할까요?")) return;
      done.clear();
      saveDone();
      window.location.reload();
    });
  }

  /* --- 시작 --------------------------------------------------------------- */

  function init() {
    loadDone();
    wireReset();
    var part = document.body.dataset.part;
    if (part) renderPart(part);
    else renderCoverProgress();
  }

  document.readyState === "loading"
    ? document.addEventListener("DOMContentLoaded", init)
    : init();
})();
