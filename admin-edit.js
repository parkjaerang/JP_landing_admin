/* =============================================================
   admin-edit.js  —  LP 페이지용 인라인 편집 + 오버라이드 적용
   -------------------------------------------------------------
   - 모든 LP 페이지가 로드(각 페이지 자체 JS보다 먼저 실행)
   - 일반 보기 : localStorage에 저장된 변경을 적용만 함
   - 관리자 모드(?admin=1 이며 로그인됨) : 화면에서 직접 편집
   - 저장은 localStorage (추후 백엔드 추가 시 이 층만 교체)
   편집 대상 섹션 : 시그니처 / 이벤트 요금 / 쇼츠 / 병원 정보
   ============================================================= */
(function () {
  "use strict";

  var AUTH_KEY = "lp_admin_authed";
  var OVERRIDE_PREFIX = "lp_override_v1::";

  /* ---- 페이지 키(예: wooa_LP) ---- */
  function getPageKey() {
    var parts = location.pathname.split("/").filter(Boolean);
    var file = parts[parts.length - 1] || "";
    var key = file.replace(/\.html?$/i, "");
    if (!key || /^index$/i.test(key)) key = parts[parts.length - 2] || key;
    return decodeURIComponent(key);
  }
  var PAGE_KEY = getPageKey();

  /* ---- 편집 대상 섹션(innerHTML 스냅샷 방식·섹션 전체) ---- */
  var SECTIONS = {
    signature: "#signature",
    event: "#procedure_type",
    info: "#information"
  };
  var SHORTS_GRID = "#contents .shorts_grid";

  /* ---- localStorage 헬퍼 ---- */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function loadOverride() {
    var raw = lsGet(OVERRIDE_PREFIX + PAGE_KEY);
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  function saveOverride(obj) { return lsSet(OVERRIDE_PREFIX + PAGE_KEY, JSON.stringify(obj)); }

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---- YouTube ID 추출 ---- */
  function ytId(input) {
    if (!input) return "";
    input = String(input).trim();
    var m = input.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{6,20})/);
    if (m) return m[1];
    if (/^[\w-]{6,20}$/.test(input)) return input;
    return input;
  }

  /* =========================================================
     1) 오버라이드 적용(일반 보기·관리자 보기 모두에서 가장 먼저 실행)
     ========================================================= */
  function applyHtml(sel, html) {
    if (html == null) return;
    var el = q(sel);
    if (el) el.innerHTML = html;
  }

  function ensureShortsStyle() {
    if (q("#lp-shorts-style")) return;
    var s = document.createElement("style");
    s.id = "lp-shorts-style";
    s.textContent =
      ".shorts_grid .short_embed{position:relative;width:100%;max-width:360px;margin:0 auto;border-radius:12px;overflow:hidden;background:#000}" +
      ".shorts_grid .short_embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block}" +
      ".shorts_grid .short_embed.r9x16{aspect-ratio:9/16}" +
      ".shorts_grid .short_embed.r16x9{aspect-ratio:16/9}";
    document.head.appendChild(s);
  }

  function renderShorts(config) {
    var grid = q(SHORTS_GRID);
    if (!grid || !config || !config.length) return;
    ensureShortsStyle();
    grid.innerHTML = config.map(function (it) {
      var id = ytId(it.id);
      var rc = it.ratio === "16x9" ? "r16x9" : "r9x16";
      if (!id) return "";
      return '<div class="short_embed ' + rc + '">' +
        '<iframe src="https://www.youtube.com/embed/' + id + '" title="YouTube video player" ' +
        'frameborder="0" loading="lazy" ' +
        'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
        'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe></div>';
    }).join("");
  }

  var OVERRIDE = loadOverride();
  applyHtml(SECTIONS.signature, OVERRIDE.signature);
  applyHtml(SECTIONS.event, OVERRIDE.event);
  applyHtml(SECTIONS.info, OVERRIDE.info);
  if (OVERRIDE.shorts) renderShorts(OVERRIDE.shorts);

  /* =========================================================
     2) 관리자 모드 판정
     ========================================================= */
  function isAdminParam() {
    return new URLSearchParams(location.search).get("admin") === "1";
  }
  if (!isAdminParam()) return;                 // 일반 보기는 여기서 종료
  if (lsGet(AUTH_KEY) !== "1") {               // 미로그인 → admin으로
    location.replace("../admin.html");
    return;
  }

  /* 이후는 편집 모드 (실제 호출은 IIFE 끝에서 — 모든 var/함수 정의 후) */

  function initEditor() {
    document.documentElement.classList.add("lp-admin");
    injectEditorStyle();
    buildToolbar();
    bindAnchorGuard();
    refreshEditables();
    bindTabSwitch();
    buildShortsEditor();
    bindMapControl();
    tameMotion();
    toast("편집 모드 : 클릭해서 직접 편집할 수 있습니다");
  }

  /* =========================================================
     3) 편집 UI 스타일
     ========================================================= */
  function injectEditorStyle() {
    var s = document.createElement("style");
    s.id = "lp-editor-style";
    s.textContent =
      ".lp-toolbar{position:fixed;top:0;left:0;right:0;z-index:99999;display:flex;gap:8px;align-items:center;" +
      "padding:8px 14px;background:#1a1c1f;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
      ".lp-toolbar .lp-title{font-weight:700}.lp-toolbar .lp-key{opacity:.6;font-size:11px}.lp-toolbar .lp-sp{flex:1}" +
      ".lp-toolbar button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:7px 14px;background:#2f6df0;color:#fff;font-weight:600}" +
      ".lp-toolbar button.ghost{background:#3a3d42}.lp-toolbar button.warn{background:#e8553b}" +
      "html.lp-admin body{padding-top:54px!important}" +
      /* 편집 모드: 콘텐츠의 hover/전환/애니메이션 비활성화(편집 UI[data-lp-ec]는 제외) */
      "html.lp-admin *:not([data-lp-ec]):not([data-lp-ec] *){animation:none!important;transition:none!important}" +
      /* hover 시 카드 들썩임 제거는 편집 대상 섹션 안으로만 한정(FAQ 등 아이콘 transform 보존) */
      "html.lp-admin #signature *:hover:not([data-lp-ec]),html.lp-admin #procedure_type *:hover:not([data-lp-ec]),html.lp-admin #information *:hover:not([data-lp-ec]){transform:none!important}" +
      "html.lp-admin #hero_intro .hero_bg{transition:none!important}" +
      "html.lp-admin [contenteditable='true']{outline:1px dashed rgba(47,109,240,.55);outline-offset:2px;cursor:text;border-radius:3px}" +
      "html.lp-admin [contenteditable='true']:hover{background:rgba(47,109,240,.05)}" +
      "html.lp-admin [contenteditable='true']:focus{outline:2px solid #2f6df0;background:rgba(47,109,240,.08)}" +
      /* 클릭 요소는 pointer 커서(편집용 텍스트 커서보다 우선) */
      "html.lp-admin a,html.lp-admin button,html.lp-admin [role='button'],html.lp-admin .tab,html.lp-admin .subtab,html.lp-admin .plan-switch-btn,html.lp-admin .faq_q,html.lp-admin .faq_arrow,html.lp-admin .line_btn,html.lp-admin label,html.lp-admin select,html.lp-admin summary,html.lp-admin .swiper-button-next,html.lp-admin .swiper-button-prev{cursor:pointer!important}" +
      "html.lp-admin .lp-item{position:relative}" +
      ".lp-del{position:absolute;top:6px;right:6px;z-index:60;width:26px;height:26px;border-radius:50%;border:0;background:#e8553b;color:#fff;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.35)}" +
      /* 가로형 리스트 항목(kleam .event_item=<li>: 이름 왼쪽·가격 오른쪽)은 ×버튼이 가격을 가림 → 우측 여백 확보 */
      "html.lp-admin li.event_item.lp-item{padding-right:40px}" +
      ".lp-add{display:flex;align-items:center;justify-content:center;gap:6px;width:calc(100% - 8px);margin:12px auto;padding:10px 16px;border:1.5px dashed #2f6df0;border-radius:10px;background:rgba(47,109,240,.08);color:#2f6df0;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;font-size:13px}" +
      "html.lp-admin #signature .sig_track .lp-add{width:180px;min-width:180px;margin:0 8px;align-self:center;flex:0 0 auto}" +
      "html.lp-admin .lp-img{position:relative;cursor:pointer}" +
      "html.lp-admin .lp-img::after{content:'📷 이미지 변경';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:5px 9px;border-radius:6px;pointer-events:none;opacity:0;transition:.15s;white-space:nowrap}" +
      "html.lp-admin .lp-img:hover::after{opacity:1}" +
      ".lp-map-edit{display:block;width:calc(100% - 0px);margin:0 0 10px;padding:9px;border:1.5px dashed #2f6df0;border-radius:9px;background:rgba(47,109,240,.08);color:#2f6df0;font-weight:700;cursor:pointer;font-family:system-ui;font-size:12px}" +
      "html.lp-admin #procedure_type .tab,html.lp-admin #procedure_type .subtab{position:relative;overflow:visible}" +
      ".lp-tabdel{position:absolute;top:-8px;right:-8px;width:19px;height:19px;border-radius:50%;border:0;background:#e8553b;color:#fff;font-size:12px;line-height:19px;text-align:center;cursor:pointer;z-index:6;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.4);font-family:system-ui}" +
      ".lp-tabadd,.lp-subadd{cursor:pointer;border:1.5px dashed #2f6df0;color:#2f6df0;background:rgba(47,109,240,.1);border-radius:9px;padding:7px 14px;font-weight:700;font-family:system-ui,sans-serif;font-size:13px;align-self:center;white-space:nowrap}" +
      ".lp-tabadd:hover,.lp-subadd:hover{background:rgba(47,109,240,.18)}" +
      /* 탭 자체가 없는 섹션/패널에 노출되는 '구조 생성' 부트스트랩 버튼(중앙 블록) */
      "html.lp-admin #procedure_type .lp-tabboot,html.lp-admin #procedure_type .lp-subboot{display:block;width:max-content;max-width:calc(100% - 32px);margin:14px auto;align-self:auto}" +
      ".lp-shorts-editor{display:flex;flex-direction:column;gap:10px;padding:0 16px;max-width:640px;margin:0 auto}" +
      ".lp-srow{display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid #e7e9ee;border-radius:10px;padding:10px;box-shadow:0 1px 4px rgba(0,0,0,.05)}" +
      ".lp-srow .lp-sn{font-weight:700;color:#6b7077;font-family:system-ui;font-size:12px}" +
      ".lp-srow input{flex:1;min-width:180px;font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}" +
      ".lp-srow select{font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}" +
      ".lp-badge{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a1c1f;color:#fff;padding:9px 18px;border-radius:999px;font-size:13px;font-family:system-ui;opacity:0;transition:.25s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3)}" +
      ".lp-badge.show{opacity:1}";
    document.head.appendChild(s);
  }

  /* =========================================================
     4) 툴바
     ========================================================= */
  function buildToolbar() {
    var bar = document.createElement("div");
    bar.className = "lp-toolbar";
    bar.setAttribute("data-lp-ec", "1");
    bar.innerHTML =
      "<span class='lp-title'>✏️ 편집 모드</span><span class='lp-key'>" + PAGE_KEY + "</span>" +
      "<span class='lp-sp'></span>" +
      "<button class='ghost' data-act='preview'>미리보기</button>" +
      "<button class='warn' data-act='reset'>변경 취소</button>" +
      "<button data-act='save'>저장</button>" +
      "<button class='ghost' data-act='exit'>종료</button>";
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var act = b.getAttribute("data-act");
      if (act === "save") doSave();
      else if (act === "reset") doReset();
      else if (act === "preview") window.open(location.pathname, "_blank");
      else if (act === "exit") location.href = "../admin.html";
    });
  }

  /* =========================================================
     5) 텍스트 편집 / 이미지 / 항목 추가·삭제
     ========================================================= */
  var TEXT_SELECTORS = {
    signature: [".sig_title", ".sig_desc", ".sig_tag", ".section_title"],
    event: [".event_name", ".event_now", ".event_origin", ".event_off", ".event_unit",
            ".event_note", ".event_badge", ".event_meta", ".event_price",
            ".menu_cat_title", ".menu_sub", ".prog_title", ".proc-cat-title", ".proc-opt",
            ".tab", ".subtab", ".plan-switch-btn", ".section_title"],
    info: [".info_label", ".info_text", ".info_hours dt", ".info_hours dd", ".section_title"]
  };
  var ITEM_DEFS = [
    { wrap: "#signature .sig_track", item: ".sig_card" },
    { wrap: "#procedure_type", item: ".event_item" }
  ];

  function refreshEditables() {
    Object.keys(TEXT_SELECTORS).forEach(function (sec) {
      var root = q(sec === "signature" ? "#signature" : sec === "event" ? "#procedure_type" : "#information");
      if (!root) return;
      var sels = TEXT_SELECTORS[sec];
      var candidates = [];
      sels.forEach(function (s) { candidates = candidates.concat(qa(s, root)); });
      candidates.forEach(function (el) {
        // 다른 편집 후보를 내부에 포함하는 요소는 건너뜀(가장 안쪽만 편집 가능하게)
        var hasInner = candidates.some(function (o) { return o !== el && el.contains(o); });
        if (hasInner) return;
        if (el.getAttribute("contenteditable") === "true") return;
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
      });
    });
    bindImages();
    bindItemControls();
    bindTabControls();
  }

  function bindImages() {
    qa("#signature img, #procedure_type img").forEach(function (img) {
      var holder = img.parentElement || img;
      if (holder.getAttribute("data-lp-img") === "1") return;
      holder.setAttribute("data-lp-img", "1");
      holder.classList.add("lp-img");
      holder.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        pickImage(function (dataUrl) { img.setAttribute("src", dataUrl); img.removeAttribute("srcset"); });
      });
    });
  }

  function pickImage(cb) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*"; inp.setAttribute("data-lp-ec", "1");
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (f) {
        var r = new FileReader();
        r.onload = function () { cb(r.result); toast("이미지를 변경했습니다"); };
        r.readAsDataURL(f);
      }
      inp.remove();
    });
    inp.click();
  }

  function bindItemControls() {
    ITEM_DEFS.forEach(function (def) {
      var wrap = q(def.wrap);
      if (!wrap) return;
      qa(def.item, wrap).forEach(function (item) {
        if (item.getAttribute("data-lp-itembound") === "1") return;
        item.setAttribute("data-lp-itembound", "1");
        item.classList.add("lp-item");
        var del = document.createElement("button");
        del.className = "lp-del"; del.type = "button"; del.textContent = "×";
        del.setAttribute("data-lp-ec", "1");
        del.title = "이 항목 삭제";
        del.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          if (confirm("이 항목을 삭제할까요?")) { var p = item.parentElement; item.remove(); toast("삭제했습니다"); }
        });
        item.appendChild(del);
      });
      // 각 '항목 컨테이너'마다 '＋ 추가' 버튼 설치
      var containers = [];
      qa(def.item, wrap).forEach(function (it) {
        var p = it.parentElement;
        if (p && containers.indexOf(p) === -1) containers.push(p);
      });
      containers.forEach(function (cont) {
        if (cont.getAttribute("data-lp-addbtn") === "1") return;
        cont.setAttribute("data-lp-addbtn", "1");
        var items = qa(def.item, cont).filter(function (n) { return n.parentElement === cont; });
        if (!items.length) return;
        var add = document.createElement("button");
        add.className = "lp-add"; add.type = "button";
        add.textContent = "＋ 항목 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          var last = qa(def.item, cont).filter(function (n) { return n.parentElement === cont; }).pop();
          if (!last) return;
          var clone = last.cloneNode(true);
          cleanClone(clone);
          last.parentElement.insertBefore(clone, add);
          refreshEditables();
          toast("항목을 추가했습니다");
        });
        cont.appendChild(add);
      });
    });
  }

  // 복제 항목에서 편집 UI/상태 속성을 제거
  function cleanClone(node) {
    qa("[data-lp-ec]", node).forEach(function (n) { n.remove(); });
    qa(".lp-del", node).forEach(function (n) { n.remove(); });
    node.classList.remove("lp-item");
    node.removeAttribute("data-lp-itembound");
    qa("[data-lp-itembound]", node).forEach(function (n) { n.removeAttribute("data-lp-itembound"); });
    if (node.getAttribute("data-lp-addbtn") === "1") node.removeAttribute("data-lp-addbtn");
    qa("[data-lp-addbtn]", node).forEach(function (n) { n.removeAttribute("data-lp-addbtn"); });
    qa("[data-lp-img]", node).forEach(function (n) { n.removeAttribute("data-lp-img"); n.classList.remove("lp-img"); });
    if (node.getAttribute("data-lp-img") === "1") { node.removeAttribute("data-lp-img"); node.classList.remove("lp-img"); }
  }

  /* =========================================================
     5.5) 카테고리 탭 / 세부 탭 추가·삭제·전환
     - .tabs > .tab[data-target="#panelId"]  ↔  .panel#panelId
     - .subtabs > .subtab[data-target="catId"] ↔ .proc-cat#catId
     - ceramique/lovae(탭+서브탭), classone(탭만, .panel>.grid) 모두 호환
     ========================================================= */
  function directChildren(parent, sel) {
    return qa(sel, parent).filter(function (el) { return el.parentElement === parent; });
  }
  function makeUid(prefix) {
    var n = 1;
    while (document.getElementById(prefix + n)) n++;
    return prefix + n;
  }

  /* 탭/서브탭 클릭 시 패널 전환(기존 탭 + 새로 추가한 탭 모두 동작) */
  var _tabSwitchBound = false;
  function bindTabSwitch() {
    if (_tabSwitchBound) return;
    var root = q("#procedure_type");
    if (!root) return;
    _tabSwitchBound = true;
    root.addEventListener("click", function (e) {
      if (e.target.closest("[data-lp-ec]")) return;   // 편집 UI(삭제/추가 버튼)는 제외
      var sub = e.target.closest(".subtab");
      if (sub && root.contains(sub)) { switchSub(sub); return; }
      var tab = e.target.closest(".tab");
      if (tab && root.contains(tab)) { switchTab(tab); }
    });
  }
  function switchTab(tab) {
    var group = tab.closest(".tabs");
    if (!group) return;
    var tabs = directChildren(group, ".tab");
    var activeSel = tab.getAttribute("data-target");
    tabs.forEach(function (t) {
      t.classList.toggle("is-active", t === tab);
      var sel = t.getAttribute("data-target");
      var panel = sel ? q(sel) : null;
      if (panel) panel.classList.toggle("is-active", sel === activeSel);
    });
  }
  function switchSub(sub) {
    var wrap = sub.closest(".subtabs");
    var panel = sub.closest(".panel") || q("#procedure_type");
    if (!wrap) return;
    var subs = directChildren(wrap, ".subtab");
    var target = sub.getAttribute("data-target");
    subs.forEach(function (s) { s.classList.toggle("is-active", s === sub); });
    qa(".proc-cat", panel).forEach(function (c) { c.classList.toggle("is-active", c.id === target); });
  }

  function setTabLabel(el, label) {
    // 라벨만 교체(삭제 버튼 등 data-lp-ec 요소는 보존)
    var keep = qa("[data-lp-ec]", el);
    el.textContent = label;
    keep.forEach(function (k) { el.appendChild(k); });
  }

  /* 카드(가격 항목) 컨테이너를 1개만 남기고 비움(새 탭/카테고리 템플릿용) */
  function trimCards(scope) {
    var cont = q(".proc-cards", scope) || q(".grid", scope) || q(".event_grid", scope);
    if (!cont) return;
    while (cont.children.length > 1) cont.removeChild(cont.lastElementChild);
  }

  /* 새 패널을 최소 템플릿(서브탭 1 + 카테고리 1 + 카드 1)으로 축소 */
  function trimPanel(panel) {
    var subsWrap = q(".subtabs", panel);
    var cats = qa(".proc-cat", panel);
    var firstCat = cats[0] || null;
    cats.forEach(function (c, i) { if (i > 0) c.remove(); });
    if (subsWrap) directChildren(subsWrap, ".subtab").forEach(function (s, i) { if (i > 0) s.remove(); });

    if (firstCat) {
      var newCat = makeUid("lp-cat-");
      firstCat.id = newCat;
      firstCat.classList.add("is-active");
      var title = q(".proc-cat-title", firstCat);
      if (title) title.textContent = "新しいカテゴリ";
      trimCards(firstCat);
      var s0 = subsWrap ? directChildren(subsWrap, ".subtab")[0] : null;
      if (s0) {
        s0.setAttribute("data-target", newCat);
        s0.classList.add("is-active");
        setTabLabel(s0, "新しいカテゴリ");
      }
    } else {
      trimCards(panel);
    }
  }

  function addTab(group) {
    var tabs = directChildren(group, ".tab");
    var last = tabs[tabs.length - 1];
    if (!last) return;
    var srcPanel = last.getAttribute("data-target") ? q(last.getAttribute("data-target")) : null;
    var newPanelId = makeUid("lp-panel-");

    var t = last.cloneNode(true);
    cleanClone(t);
    t.classList.remove("is-active");
    t.setAttribute("data-target", "#" + newPanelId);
    setTabLabel(t, "新しいタブ");

    if (srcPanel) {
      var p = srcPanel.cloneNode(true);
      cleanClone(p);
      p.classList.remove("is-active");
      p.id = newPanelId;
      trimPanel(p);
      srcPanel.parentElement.insertBefore(p, srcPanel.nextSibling);
    }
    group.insertBefore(t, q(".lp-tabadd", group));
    refreshEditables();
    switchTab(t);
    toast("탭을 추가했습니다");
  }

  function deleteTab(tab) {
    var group = tab.closest(".tabs");
    if (!group) return;
    if (directChildren(group, ".tab").length <= 1) { toast("마지막 탭은 삭제할 수 없습니다"); return; }
    if (!confirm("이 탭과 그 내용을 모두 삭제할까요?")) return;
    var sel = tab.getAttribute("data-target");
    var panel = sel ? q(sel) : null;
    var wasActive = tab.classList.contains("is-active");
    tab.remove();
    if (panel) panel.remove();
    if (wasActive) {
      var first = directChildren(group, ".tab")[0];
      if (first) switchTab(first);
    }
    toast("탭을 삭제했습니다");
  }

  function addSubtab(wrap) {
    var panel = wrap.closest(".panel") || q("#procedure_type");
    var subs = directChildren(wrap, ".subtab");
    var last = subs[subs.length - 1];
    if (!last) return;
    var cats = qa(".proc-cat", panel);
    var srcCat = cats[cats.length - 1];
    var newCat = makeUid("lp-cat-");

    var s = last.cloneNode(true);
    cleanClone(s);
    s.classList.remove("is-active");
    s.setAttribute("data-target", newCat);
    setTabLabel(s, "新しいカテゴリ");

    if (srcCat) {
      var c = srcCat.cloneNode(true);
      cleanClone(c);
      c.classList.remove("is-active");
      c.id = newCat;
      var title = q(".proc-cat-title", c);
      if (title) title.textContent = "新しいカテゴリ";
      trimCards(c);
      srcCat.parentElement.appendChild(c);
    }
    wrap.insertBefore(s, q(".lp-subadd", wrap));
    refreshEditables();
    switchSub(s);
    toast("카테고리를 추가했습니다");
  }

  function deleteSubtab(sub) {
    var wrap = sub.closest(".subtabs");
    if (!wrap) return;
    if (directChildren(wrap, ".subtab").length <= 1) { toast("마지막 카테고리는 삭제할 수 없습니다"); return; }
    if (!confirm("이 카테고리와 그 내용을 삭제할까요?")) return;
    var catId = sub.getAttribute("data-target");
    var cat = catId ? document.getElementById(catId) : null;
    var wasActive = sub.classList.contains("is-active");
    sub.remove();
    if (cat) cat.remove();
    if (wasActive) {
      var first = directChildren(wrap, ".subtab")[0];
      if (first) switchSub(first);
    }
    toast("카테고리를 삭제했습니다");
  }

  /* ---- 탭/서브탭이 아예 없는 섹션을 탭 구조로 '부트스트랩' ----
     평면 카드 묶음(.event_grid / .grid / .proc-cards)을 탭·패널 구조로 감싼다.
     한 번 감싸면 이후는 기존 addTab/addSubtab 로직이 그대로 이어받는다.
     만들지 않으면 평면 구조 그대로 저장 → 랜딩페이지에 탭이 나타나지 않음. */
  function flatGrid(scope, directOnly) {
    var sels = [".event_grid", ".grid", ".proc-cards"];
    for (var i = 0; i < sels.length; i++) {
      var found = directOnly ? directChildren(scope, sels[i])[0] : q(sels[i], scope);
      if (found) return found;
    }
    return null;
  }

  /* 평면 섹션(#procedure_type 직속 카드 묶음) → .tabs + .panel 으로 변환 */
  function createTabStructure(root) {
    if (q(".tabs", root)) return;
    var grid = flatGrid(root, true);
    if (!grid) return;
    var panelId = makeUid("lp-panel-");

    var tabs = document.createElement("div");
    tabs.className = "tabs";
    var tab = document.createElement("button");
    tab.type = "button";
    tab.className = "tab is-active";
    tab.setAttribute("data-target", "#" + panelId);
    tab.textContent = "新しいタブ";
    tabs.appendChild(tab);

    var panel = document.createElement("div");
    panel.className = "panel is-active";
    panel.id = panelId;
    panel.appendChild(grid);   // 기존 카드 묶음을 패널 안으로 이동(.panel 자체엔 패딩 없음)

    // section_title 바로 뒤에 tabs, 그 뒤에 panel 삽입
    var title = directChildren(root, ".section_title")[0];
    var anchor = title || root.firstChild;
    if (title) {
      root.insertBefore(tabs, title.nextSibling);
    } else {
      root.insertBefore(tabs, root.firstChild);
    }
    root.insertBefore(panel, tabs.nextSibling);

    qa(".lp-tabboot", root).forEach(function (n) { n.remove(); });
    refreshEditables();
    switchTab(tab);
    toast("상위탭을 만들었습니다");
  }

  /* 서브탭 없는 패널의 평면 카드 묶음 → .subtabs + .proc-cat 으로 변환 */
  function createSubtabStructure(panel) {
    if (q(".subtabs", panel)) return;
    var grid = flatGrid(panel, true);
    if (!grid) return;
    var catId = makeUid("lp-cat-");

    var subtabs = document.createElement("div");
    subtabs.className = "subtabs";
    var sub = document.createElement("button");
    sub.type = "button";
    sub.className = "subtab is-active";
    sub.setAttribute("data-target", catId);
    sub.textContent = "新しいカテゴリ";
    subtabs.appendChild(sub);

    var cat = document.createElement("div");
    cat.className = "proc-cat is-active";
    cat.id = catId;
    var ctitle = document.createElement("h3");
    ctitle.className = "proc-cat-title";
    ctitle.textContent = "新しいカテゴリ";
    cat.appendChild(ctitle);
    // .event_grid / .grid 는 자체 좌우 패딩이 있어 proc-cat 패딩과 겹침 → proc-cat 패딩 제거
    if (!grid.classList.contains("proc-cards")) {
      cat.style.paddingLeft = "0";
      cat.style.paddingRight = "0";
    }
    cat.appendChild(grid);     // 기존 카드 묶음을 카테고리 안으로 이동

    panel.insertBefore(subtabs, panel.firstChild);
    panel.insertBefore(cat, subtabs.nextSibling);

    qa(".lp-subboot", panel).forEach(function (n) { n.remove(); });
    refreshEditables();
    switchSub(sub);
    toast("하위탭을 만들었습니다");
  }

  function bootBtn(cls, label, handler) {
    var b = document.createElement("button");
    b.className = "lp-subadd " + cls;
    b.type = "button";
    b.textContent = label;
    b.setAttribute("data-lp-ec", "1");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      handler();
    });
    return b;
  }

  function addTabDelBtn(el, handler) {
    if (q(".lp-tabdel", el)) return;
    var b = document.createElement("button");
    b.className = "lp-tabdel"; b.type = "button"; b.textContent = "×";
    b.title = "삭제";
    b.setAttribute("data-lp-ec", "1");
    b.setAttribute("contenteditable", "false");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      handler(el);
    });
    el.appendChild(b);
  }

  function bindTabControls() {
    var root = q("#procedure_type");
    if (!root) return;

    // 탭이 하나도 없고 평면 카드 묶음이 있으면 → '상위탭 만들기' 부트스트랩 버튼
    if (!q(".tabs", root) && flatGrid(root, true) && !q(".lp-tabboot", root)) {
      root.appendChild(bootBtn("lp-tabboot", "＋ 上位タブを作成", function () {
        createTabStructure(root);
      }));
    }
    // 서브탭 없는 각 패널 → '하위탭 만들기' 부트스트랩 버튼(패널 맨 위)
    qa(".panel", root).forEach(function (panel) {
      if (q(".subtabs", panel) || !flatGrid(panel, true) || q(".lp-subboot", panel)) return;
      var btn = bootBtn("lp-subboot", "＋ 下位タブ(カテゴリ)を作成", function () {
        createSubtabStructure(panel);
      });
      panel.insertBefore(btn, panel.firstChild);
    });

    qa(".tabs", root).forEach(function (group) {
      directChildren(group, ".tab").forEach(function (tab) { addTabDelBtn(tab, deleteTab); });
      if (!q(".lp-tabadd", group)) {
        var add = document.createElement("button");
        add.className = "lp-tabadd"; add.type = "button";
        add.textContent = "＋ 탭 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          addTab(group);
        });
        group.appendChild(add);
      }
    });
    qa(".subtabs", root).forEach(function (wrap) {
      directChildren(wrap, ".subtab").forEach(function (sub) { addTabDelBtn(sub, deleteSubtab); });
      if (!q(".lp-subadd", wrap)) {
        var add = document.createElement("button");
        add.className = "lp-subadd"; add.type = "button";
        add.textContent = "＋ 카테고리 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          addSubtab(wrap);
        });
        wrap.appendChild(add);
      }
    });
  }

  /* 편집 모드에서 거슬리는 자동 움직임 정지(시그니처 자동 슬라이드 등) */
  function tameMotion() {
    var st = q("#signature .sig_track");
    if (!st) return;
    // 페이지 JS의 자동 슬라이드는 scrollTo로 동작 → 무력화(드래그 스크롤은 scrollLeft라 유지)
    try { st.scrollTo = function () {}; } catch (e) {}
    // 슬라이더 드래그용 포인터 캡처가 카드 내부의 ×/이미지/추가 버튼 클릭을 가로챔 → 무력화
    try { st.setPointerCapture = function () {}; } catch (e) {}
    try { st.releasePointerCapture = function () {}; } catch (e) {}
  }

  /* 주소 → Google 지도 임베드 URL(API 키 불필요) */
  function buildMapEmbed(addr) {
    return "https://maps.google.com/maps?q=" + encodeURIComponent(addr) + "&z=16&hl=ja&output=embed";
  }

  /* 지도 iframe 변경 : 주소 입력 시 자동 임베드 / URL·<iframe> 붙여넣기도 지원 */
  function bindMapControl() {
    var map = q("#information iframe");
    if (!map || q(".lp-map-edit")) return;
    var btn = document.createElement("button");
    btn.className = "lp-map-edit"; btn.type = "button";
    btn.textContent = "지도 변경 (주소 입력)";
    btn.setAttribute("data-lp-ec", "1");
    btn.addEventListener("click", function () {
      var v = prompt(
        "주소를 입력하면 지도에 자동으로 반영됩니다.\n" +
        "(Google 지도 임베드 URL이나 <iframe>을 그대로 붙여넣어도 됩니다)",
        ""
      );
      if (v == null) return;
      v = v.trim();
      if (!v) return;
      var src;
      var ifr = v.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
      if (ifr) src = ifr[1];                       // <iframe ...> 통째로 붙여넣은 경우 src 추출
      else if (/^https?:\/\//i.test(v)) src = v;   // URL 직접 입력
      else src = buildMapEmbed(v);                  // 주소 → 자동 임베드
      map.setAttribute("src", src);
      toast("지도를 변경했습니다");
    });
    map.parentElement.insertBefore(btn, map);
  }

  /* 쇼츠 편집(링크 + 가로세로 비율) */
  function readExistingShorts() {
    if (OVERRIDE.shorts && OVERRIDE.shorts.length) return OVERRIDE.shorts.slice();
    var grid = q(SHORTS_GRID);
    var out = [];
    if (!grid) return out;
    var facades = qa("[data-id]", grid);
    if (facades.length) {
      facades.forEach(function (b) { out.push({ id: b.getAttribute("data-id"), ratio: "9x16" }); });
      return out;
    }
    qa("iframe", grid).forEach(function (f) { out.push({ id: ytId(f.getAttribute("src") || ""), ratio: "16x9" }); });
    qa(".short_embed", grid).forEach(function (d) {
      var f = q("iframe", d);
      if (f) out.push({ id: ytId(f.getAttribute("src") || ""), ratio: d.classList.contains("r16x9") ? "16x9" : "9x16" });
    });
    return out;
  }

  function buildShortsEditor() {
    var grid = q(SHORTS_GRID);
    if (!grid) return;
    var cfg = readExistingShorts();
    if (!cfg.length) cfg = [{ id: "", ratio: "9x16" }];
    var box = document.createElement("div");
    box.className = "lp-shorts-editor";
    box.setAttribute("data-lp-ec", "1");
    cfg.forEach(function (it, i) { box.appendChild(shortsRow(it, i + 1)); });
    grid.innerHTML = "";
    grid.appendChild(box);
  }

  function shortsRow(it, n) {
    var row = document.createElement("div");
    row.className = "lp-srow"; row.setAttribute("data-lp-ec", "1");
    row.innerHTML =
      "<span class='lp-sn'>#" + n + "</span>" +
      "<input type='text' class='lp-sid' placeholder='YouTube 링크 또는 동영상 ID' value='" + (it.id || "") + "'>" +
      "<select class='lp-sratio'>" +
      "<option value='9x16'" + (it.ratio !== "16x9" ? " selected" : "") + ">세로 9:16</option>" +
      "<option value='16x9'" + (it.ratio === "16x9" ? " selected" : "") + ">가로 16:9</option>" +
      "</select>";
    return row;
  }

  function collectShorts() {
    return qa(".lp-srow").map(function (row) {
      return {
        id: ytId((q(".lp-sid", row) || {}).value || ""),
        ratio: (q(".lp-sratio", row) || {}).value === "16x9" ? "16x9" : "9x16"
      };
    }).filter(function (s) { return s.id; });
  }

  /* 편집 중에는 클릭에 의한 링크 이동을 막음 */
  function bindAnchorGuard() {
    document.addEventListener("click", function (e) {
      if (!document.documentElement.classList.contains("lp-admin")) return;
      if (e.target.closest("[data-lp-ec]")) return;            // 편집 UI는 제외
      var a = e.target.closest("a[href]");
      if (a && !a.classList.contains("tab") && !a.classList.contains("subtab")) {
        e.preventDefault();
      }
    }, true);
  }

  /* =========================================================
     6) 저장 / 초기화
     ========================================================= */
  function snapshot(sel, sectionName) {
    var el = q(sel);
    if (!el) return null;
    var clone = el.cloneNode(true);
    // 편집 UI 제거
    qa("[data-lp-ec]", clone).forEach(function (n) { n.remove(); });
    qa(".lp-del", clone).forEach(function (n) { n.remove(); });
    qa("[contenteditable]", clone).forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck"); });
    qa(".lp-item", clone).forEach(function (n) { n.classList.remove("lp-item"); });
    qa("[data-lp-itembound]", clone).forEach(function (n) { n.removeAttribute("data-lp-itembound"); });
    qa("[data-lp-addbtn]", clone).forEach(function (n) { n.removeAttribute("data-lp-addbtn"); });
    qa(".lp-img", clone).forEach(function (n) { n.classList.remove("lp-img"); });
    qa("[data-lp-img]", clone).forEach(function (n) { n.removeAttribute("data-lp-img"); });

    if (sectionName === "signature") cleanupSignature(clone);
    return clone.innerHTML;
  }

  // 시그니처 : 설명이 비면 .sig_desc 제거, 태그가 비면 .sig_tags / .sig_tag 제거
  function cleanupSignature(root) {
    qa(".sig_card", root).forEach(function (card) {
      var desc = q(".sig_desc", card);
      if (desc && !desc.textContent.trim()) desc.remove();
      qa(".sig_tag", card).forEach(function (t) { if (!t.textContent.trim()) t.remove(); });
      var tags = q(".sig_tags", card);
      if (tags && !qa(".sig_tag", tags).length) tags.remove();
    });
  }

  function doSave() {
    var ov = loadOverride();
    if (q(SECTIONS.signature)) ov.signature = snapshot(SECTIONS.signature, "signature");
    if (q(SECTIONS.event)) ov.event = snapshot(SECTIONS.event, "event");
    if (q(SECTIONS.info)) ov.info = snapshot(SECTIONS.info, "info");
    if (q(SHORTS_GRID)) ov.shorts = collectShorts();
    var ok = saveOverride(ov);
    OVERRIDE = ov;
    toast(ok ? "✅ 저장했습니다 (이 브라우저에 저장됨)" : "⚠️ 저장 실패 (용량 초과 가능성)");
  }

  function doReset() {
    if (!confirm("이 페이지의 변경을 모두 취소하고 초기 상태로 되돌릴까요?")) return;
    lsDel(OVERRIDE_PREFIX + PAGE_KEY);
    toast("변경을 취소했습니다. 다시 불러옵니다…");
    setTimeout(function () { location.reload(); }, 600);
  }

  /* ---- 토스트 ---- */
  var _toastEl, _toastT;
  function toast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement("div");
      _toastEl.className = "lp-badge";
      _toastEl.setAttribute("data-lp-ec", "1");
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add("show");
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { _toastEl.classList.remove("show"); }, 2200);
  }

  /* =========================================================
     편집 모드 시작 — 모든 var/함수 정의가 끝난 뒤 호출
     (defer 스크립트는 readyState가 "loading"이 아니므로 즉시 실행되는데,
      이 위치에서 호출해야 TEXT_SELECTORS/ITEM_DEFS 등이 할당된 상태가 됨)
     ========================================================= */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEditor);
  } else {
    initEditor();
  }
})();
