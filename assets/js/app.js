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
    notebooklm: "NotebookLM",
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

  /* --- 실습 카드 ---------------------------------------------------------- */

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

    // 단계
    if (card.steps && card.steps.length) {
      var ol = el("ol", "steps");
      card.steps.forEach(function (t) { ol.appendChild(el("li", null, t)); });
      art.appendChild(ol);
    }

    // 프롬프트
    promptsOf(card).forEach(function (p) { art.appendChild(buildPrompt(p, status)); });

    // 그림 — 강의 화면과 대조하는 용도
    if (card.images && card.images.length) {
      var figs = el("div", "shots");
      card.images.forEach(function (im) {
        var fig = el("figure", "shot");
        var link = el("a");
        link.href = "assets/img/" + im.file;
        link.target = "_blank";
        link.rel = "noopener";
        var img = el("img");
        img.src = "assets/img/" + im.file;
        img.alt = (card.title || "") + " 화면 예시";
        img.loading = "lazy";
        img.decoding = "async";
        if (im.w) img.width = im.w;
        if (im.h) img.height = im.h;
        link.appendChild(img);
        link.appendChild(el("span", "shot__more", "눌러서 크게 보기 ↗"));
        fig.appendChild(link);
        figs.appendChild(fig);
      });
      art.appendChild(figs);
    }

    // 실습 자료 내려받기 — 브라우저에서 만들지 않고 실제 파일을 준다.
    // 즉석 생성은 다운로드 차단·인코딩 사고가 나는데, 연수 중에는 손쓸 수 없다.
    if (card.downloads && card.downloads.length) {
      var dls = el("div", "downloads");
      card.downloads.forEach(function (d) {
        var a = el("a", "download");
        a.href = "assets/samples/" + d.file;
        a.setAttribute("download", d.file);
        a.appendChild(el("span", "download__icon", "↓"));
        a.appendChild(el("span", null, d.label || d.file));
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
