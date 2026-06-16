/* =============================================================
   admin-edit.js  —  LP 페이지용 인라인 편집 + 오버라이드 적용
   -------------------------------------------------------------
   - 모든 LP 페이지가 로드(각 페이지 자체 JS보다 먼저 실행)
   - 일반 보기 : localStorage에 저장된 변경을 적용만 함
   - 관리자 모드(?admin=1 이며 로그인됨) : 화면에서 직접 편집
   - 저장은 localStorage (추후 백엔드 추가 시 이 층만 교체)
   편집 대상 섹션 : 히어로 / 시그니처 / 이벤트 요금 / 쇼츠 / 병원 정보
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
    hero: "#hero_intro",
    signature: "#signature",
    event: "#procedure_type",
    doctors: "#doctors",
    info: "#information",
    ba: "#BA"
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
  applyHtml(SECTIONS.hero, OVERRIDE.hero);
  applyHtml(SECTIONS.signature, OVERRIDE.signature);
  applyHtml(SECTIONS.event, OVERRIDE.event);
  applyHtml(SECTIONS.doctors, OVERRIDE.doctors);
  applyHtml(SECTIONS.info, OVERRIDE.info);
  applyHtml(SECTIONS.ba, OVERRIDE.ba);
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
      "html.lp-admin #signature *:hover:not([data-lp-ec]),html.lp-admin #procedure_type *:hover:not([data-lp-ec]),html.lp-admin #doctors *:hover:not([data-lp-ec]),html.lp-admin #information *:hover:not([data-lp-ec]),html.lp-admin #BA *:hover:not([data-lp-ec]){transform:none!important}" +
      "html.lp-admin #hero_intro .hero_bg{transition:none!important}" +
      "html.lp-admin [contenteditable='true']{outline:1px dashed rgba(47,109,240,.55);outline-offset:2px;cursor:text;border-radius:3px}" +
      /* 가격 단위(万ウォン 등 <small> 또는 .lp-unit)는 편집 대상에서 제외: 선택·수정 불가, 편집 외곽선 미표시 */
      "html.lp-admin #procedure_type small,html.lp-admin .lp-unit,html.lp-admin #procedure_type .event_unit{-webkit-user-modify:read-only!important;user-select:none;outline:none!important;cursor:default}" +
      /* 비어 있는 소제목 등: data-ph 안내문구를 흐리게 표시(실제 콘텐츠는 빈 상태 → view 미표시) */
      "html.lp-admin [contenteditable='true'][data-ph]:empty::before{content:attr(data-ph);color:#9aa0a6}" +
      /* 클릭 요소는 pointer 커서(편집용 텍스트 커서보다 우선) */
      "html.lp-admin a,html.lp-admin button,html.lp-admin [role='button'],html.lp-admin .tab,html.lp-admin .subtab,html.lp-admin .plan-switch-btn,html.lp-admin .faq_q,html.lp-admin .faq_arrow,html.lp-admin .line_btn,html.lp-admin label,html.lp-admin select,html.lp-admin summary,html.lp-admin .swiper-button-next,html.lp-admin .swiper-button-prev{cursor:pointer!important}" +
      "html.lp-admin .lp-item{position:relative}" +
      ".lp-del{position:absolute;top:6px;right:6px;z-index:60;width:26px;height:26px;border-radius:50%;border:0;background:#e8553b;color:#fff;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.35)}" +
      /* 가로형 리스트 항목(kleam .event_item=<li>: 이름 왼쪽·가격 오른쪽)은 ×버튼이 가격을 가림 → 우측 여백 확보 */
      "html.lp-admin li.event_item.lp-item{padding-right:40px}" +
      /* 원장 경력 줄(.doctor_career li): ×버튼이 텍스트를 가리지 않게 우측 여백 확보 + 줄 세로 중앙 정렬 */
      "html.lp-admin .doctor_career li.lp-item{padding-right:34px}" +
      "html.lp-admin .doctor_career li.lp-item > .lp-del{top:50%;transform:translateY(-50%);width:22px;height:22px;font-size:13px}" +
      /* 프로그램 단계(.pkg_steps li): ×버튼이 단계 텍스트를 가리지 않게 우측 여백 확보 + 줄 세로 중앙 정렬 */
      "html.lp-admin .pkg_steps li.lp-item{padding-right:34px}" +
      "html.lp-admin .pkg_steps li.lp-item > .lp-del{top:50%;transform:translateY(-50%);width:22px;height:22px;font-size:13px}" +
      /* 프로그램 블록(.prog_pkg): ×버튼이 프로그램명을 가리지 않게 상단에 여백 확보 후 그 영역에 배치 */
      "html.lp-admin .prog_pkg.lp-item{padding-top:38px}" +
      /* 프로그램 카드 삭제 버튼: 둥근 × 원형 → 「× 삭제」 알약형 버튼(카테고리 삭제 버튼과 동일한 모양) */
      "html.lp-admin .prog_pkg.lp-item > .lp-del{top:8px;right:8px;width:auto;height:auto;border-radius:7px;padding:6px 10px;font-size:0;font-weight:700;font-family:system-ui,sans-serif;white-space:nowrap}" +
      "html.lp-admin .prog_pkg.lp-item > .lp-del::before{content:'× 삭제';font-size:12px;line-height:1}" +
      /* 프로그램 카드(.price_prog/.menu_cat) 통째 삭제 버튼 + 펼침/접힘 토글: 카드 우상단 */
      "html.lp-admin .price_prog,html.lp-admin .menu_cat{position:relative}" +
      "html.lp-admin .price_prog > .prog_title,html.lp-admin .menu_cat > .menu_cat_title{padding-right:104px}" +
      ".lp-catdel{position:absolute;top:8px;right:42px;z-index:62;border:0;border-radius:7px;background:#e8553b;color:#fff;font-size:12px;font-weight:700;line-height:1;cursor:pointer;padding:6px 10px;font-family:system-ui,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.35);white-space:nowrap}" +
      /* 편집 모드 아코디언 토글(편집 대상 아님): 라이브 chevron과 동일한 동작 */
      ".lp-acc-toggle{position:absolute;top:7px;right:8px;z-index:63;width:26px;height:26px;border-radius:50%;border:0;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.2)}" +
      ".lp-acc-toggle::before{content:'';width:8px;height:8px;margin-top:-3px;border-right:2px solid #fff;border-bottom:2px solid #fff;transform:rotate(45deg);transition:transform .25s ease}" +
      "html.lp-admin .price_prog.lp-collapsed > .lp-acc-toggle::before,html.lp-admin .menu_cat.lp-collapsed > .lp-acc-toggle::before{transform:rotate(-135deg);margin-top:3px}" +
      "html.lp-admin .price_prog.lp-collapsed > :not(.prog_title):not(.lp-acc-toggle):not(.lp-catdel),html.lp-admin .menu_cat.lp-collapsed > :not(.menu_cat_title):not(.lp-acc-toggle):not(.lp-catdel){display:none}" +
      /* 그룹(소제목+항목 묶음) 삭제 버튼: 소제목 우상단 */
      "html.lp-admin .prog_sub.lp-grp,html.lp-admin .menu_sub.lp-grp{position:relative;padding-right:36px}" +
      ".lp-add{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:6px;width:calc(100% - 8px);margin:12px auto;padding:10px 16px;border:1.5px dashed #2f6df0;border-radius:10px;background:rgba(47,109,240,.08);color:#2f6df0;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;font-size:13px}" +
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
      ".lp-srow{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #e7e9ee;border-radius:10px;padding:10px;box-shadow:0 1px 4px rgba(0,0,0,.05)}" +
      ".lp-srow .lp-sn{font-weight:700;color:#6b7077;font-family:system-ui;font-size:12px}" +
      ".lp-srow input{flex:1;min-width:180px;font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}" +
      ".lp-srow select{font:inherit;padding:8px;border:1px solid #ccc;border-radius:8px}" +
      ".lp-srow .lp-sdel{flex:0 0 auto;width:30px;height:30px;border-radius:8px;border:0;background:#e8553b;color:#fff;font-size:16px;line-height:1;cursor:pointer}" +
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
    hero: [".element_wrap h2", ".element_wrap h3", ".element_wrap h4"],
    signature: [".sig_title", ".sig_desc", ".sig_tag", ".section_title"],
    event: [".event_name", ".event_now", ".event_origin", ".event_off",
            ".event_note", ".event_badge", ".event_meta", ".event_price", ".sub",
            ".campaign-label", ".campaign-period", ".campaign-tax",
            ".menu_cat_title", ".menu_sub", ".menu_period", ".price_period",
            ".prog_title", ".prog_sub",
            ".pkg_name", ".pkg_desc", ".pkg_steps li",
            ".proc-cat-title", ".proc-opt",
            ".tab", ".subtab", ".plan-switch-btn", ".section_title"],
    doctors: [".doctor_role", ".doctor_name", ".doctor_career li", ".section_title"],
    info: [".info_label", ".info_text", ".info_note", ".info_hours dt", ".info_hours dd", ".section_title"],
    ba: ["figcaption", ".ba_label", ".section_title"]
  };
  /* 프로그램(패키지) 블록 기본 템플릿 — 복제할 기존 항목이 없을 때 사용 */
  var PROG_PKG_TPL =
    '<div class="prog_pkg">' +
    '<p class="pkg_name">프로그램명</p>' +
    '<p class="pkg_desc">프로그램 설명</p>' +
    '<ol class="pkg_steps"><li>단계 설명</li></ol>' +
    '<ul class="prog_items"><li class="event_item">' +
    '<span class="event_name">시술이름</span>' +
    '<span class="event_price">00<small>万ウォン</small></span></li></ul>' +
    '</div>';
  /* container: 항목이 0개여도 추가 버튼을 노출할 컨테이너(없으면 항목이 있는 컨테이너에만 버튼).
     template: 복제할 기존 항목이 없을 때 새로 만들 HTML(빈 컨테이너에서 추가 가능하게). */
  var ITEM_DEFS = [
    { wrap: "#signature .sig_track", item: ".sig_card" },
    { wrap: "#procedure_type", item: ".event_item" },
    { wrap: "#procedure_type", item: ".pkg_steps li", addLabel: "＋ 단계 추가",
      container: ".pkg_steps", template: "<li>단계 설명</li>" },
    { wrap: "#procedure_type", item: ".prog_pkg", addLabel: "＋ 프로그램 추가",
      container: ".price_prog, .menu_cat", template: PROG_PKG_TPL },
    { wrap: "#doctors .doctors_wrap", item: ".doctor_card", addLabel: "＋ 의사 추가" },
    { wrap: "#doctors", item: ".doctor_career li", addLabel: "＋ 학력 및 경력 추가" },
    { wrap: "#BA .ba_grid", item: ".ba_card" }
  ];
  /* 부제목 그룹(소제목 + 항목 리스트) 추가 정의
     - kleamM: .price_prog > .prog_sub + .prog_items
     - kleamH: .menu_cat  > .menu_sub  + .menu_list
     비우면 view에서 사라지는 소제목 + 빈 항목 1개로 새 그룹을 만든다. */
  var GROUP_DEFS = [
    { cat: ".price_prog", sub: "prog_sub", list: "prog_items" },
    { cat: ".menu_cat", sub: "menu_sub", list: "menu_list" }
  ];
  /* 카테고리(프로그램 카드) 추가 정의
     - kleamM: .price_list > .price_prog (제목 .prog_title + 항목 .prog_items)
     - kleamH: .menu_wrap  > .menu_cat   (제목 .menu_cat_title + 항목 .menu_list)
     카드 전체(제목 + 빈 항목 1개)를 컨테이너 끝에 새로 추가한다. */
  var CAT_DEFS = [
    { wrap: ".price_list", cat: "price_prog", title: "prog_title", sub: "prog_sub", list: "prog_items" },
    { wrap: ".menu_wrap", cat: "menu_cat", title: "menu_cat_title", sub: "menu_sub", list: "menu_list" }
  ];

  function refreshEditables() {
    Object.keys(TEXT_SELECTORS).forEach(function (sec) {
      var root = q(SECTIONS[sec]);
      if (!root) return;
      var sels = TEXT_SELECTORS[sec];
      var candidates = [];
      sels.forEach(function (s) { candidates = candidates.concat(qa(s, root)); });
      candidates.forEach(function (el) {
        // 다른 편집 후보를 내부에 포함하는 요소는 건너뜀(가장 안쪽만 편집 가능하게)
        var hasInner = candidates.some(function (o) { return o !== el && el.contains(o); });
        if (hasInner) return;
        if (q(".lp-num", el)) return;                    // 가격: 숫자 span만 편집(단위는 입력란 밖)
        if (el.getAttribute("contenteditable") === "true") return;
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
      });
    });
    lockPriceUnits();
    bindImages();
    bindItemControls();
    bindGroupControls();
    bindCategoryControls();
    bindCategoryDelete();
    bindGroupDelete();
    bindSubInputs();
    bindEventSub();
    bindAccordionToggle();
    bindTabControls();
    markPlaceholders();
    markOptionalFields();
  }

  /* 컨테이너 직속 자식 중 첫 추가버튼(.lp-add)을 반환.
     새 항목/그룹/프로그램은 항상 이 버튼 위에 삽입 → 추가버튼들이 항상 맨 아래에 함께 모임. */
  function firstAddBtn(cont) {
    var kids = cont.children;
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].classList && kids[i].classList.contains("lp-add")) return kids[i];
    }
    return null;
  }

  /* 항목 추가 : 각 카테고리(.price_prog / .menu_cat) 끝에
     「＋ 항목 추가」 버튼 → 빈 소제목 + 빈 항목 1개 새 항목 삽입 */
  function bindGroupControls() {
    var ev = q("#procedure_type");
    if (!ev) return;
    GROUP_DEFS.forEach(function (def) {
      qa(def.cat, ev).forEach(function (cat) {
        if (cat.getAttribute("data-lp-grpbtn") === "1") return;
        if (!q("." + def.list, cat) && !q(".prog_pkg", cat)) return;   // 시술 리스트 또는 패키지가 있는 카테고리에만
        cat.setAttribute("data-lp-grpbtn", "1");
        var add = document.createElement("button");
        add.className = "lp-add lp-grpadd"; add.type = "button";
        add.textContent = "＋ 항목 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          var sub = document.createElement("p");
          sub.className = def.sub;
          sub.setAttribute("data-ph", "부제목 (비우면 표시되지 않습니다)");
          var ul = document.createElement("ul");
          ul.className = def.list;
          ul.innerHTML =
            '<li class="event_item"><span class="event_name">시술이름</span>' +
            '<span class="event_price">00<small>万ウォン</small></span></li>';
          var anchor = firstAddBtn(cat) || add;   // 추가버튼 묶음 위에 삽입(버튼들은 항상 함께 맨 아래)
          cat.insertBefore(sub, anchor);
          cat.insertBefore(ul, anchor);
          blankItem(ul); // 템플릿 텍스트(시술이름/00万ウォン) → placeholder 힌트
          refreshEditables();
          toast("항목을 추가했습니다");
        });
        cat.appendChild(add);
      });
    });
  }

  /* 카테고리 추가 : 카테고리 컨테이너(.price_list / .menu_wrap) 끝에
     「＋ 카테고리 추가」 버튼 → 제목 + 빈 항목 1개를 가진 새 카드 삽입 */
  function bindCategoryControls() {
    var ev = q("#procedure_type");
    if (!ev) return;
    CAT_DEFS.forEach(function (def) {
      qa(def.wrap, ev).forEach(function (wrap) {
        if (wrap.getAttribute("data-lp-catbtn") === "1") return;
        if (!q("." + def.cat, wrap)) return;   // 카드가 있는 컨테이너에만
        wrap.setAttribute("data-lp-catbtn", "1");
        var add = document.createElement("button");
        add.className = "lp-add lp-catadd"; add.type = "button";
        add.textContent = "＋ 카테고리 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          var card = document.createElement("div");
          card.className = def.cat;
          card.innerHTML =
            '<h3 class="' + def.title + '">카테고리명</h3>' +
            '<p class="' + def.sub + '" data-ph="부제목 (비우면 표시되지 않습니다)"></p>' +
            '<ul class="' + def.list + '">' +
            '<li class="event_item"><span class="event_name">시술이름</span>' +
            '<span class="event_price">00<small>万ウォン</small></span></li>' +
            '</ul>';
          wrap.insertBefore(card, add);
          blankItem(card);                  // 템플릿 텍스트(카테고리명/시술이름 등) → placeholder 힌트
          refreshEditables();
          toast("카테고리를 추가했습니다");
        });
        wrap.appendChild(add);
      });
    });
  }

  /* 카테고리(프로그램 카드) 통째 삭제 : 각 .price_prog/.menu_cat 우상단 「삭제」 버튼 */
  function bindCategoryDelete() {
    var ev = q("#procedure_type");
    if (!ev) return;
    CAT_DEFS.forEach(function (def) {
      qa("." + def.cat, ev).forEach(function (card) {
        if (card.getAttribute("data-lp-catdel") === "1") return;
        card.setAttribute("data-lp-catdel", "1");
        var del = document.createElement("button");
        del.className = "lp-catdel"; del.type = "button"; del.textContent = "× 삭제";
        del.setAttribute("data-lp-ec", "1");
        del.title = "이 카테고리(카드) 전체 삭제";
        del.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          if (confirm("이 카테고리(카드)를 통째로 삭제할까요?")) { card.remove(); toast("카테고리를 삭제했습니다"); }
        });
        card.appendChild(del);
      });
    });
  }

  /* 그룹(소제목+항목 묶음) 삭제 : 각 .prog_sub/.menu_sub 우상단 × → 소제목과 바로 뒤 리스트를 함께 제거 */
  function bindGroupDelete() {
    var ev = q("#procedure_type");
    if (!ev) return;
    GROUP_DEFS.forEach(function (def) {
      qa(def.cat, ev).forEach(function (cat) {
        qa("." + def.sub, cat).forEach(function (sub) {
          if (sub.parentElement !== cat) return;
          if (sub.getAttribute("data-lp-autosub") === "1") return;  // 자동 입력칸은 × 제외(빈칸은 저장 시 사라짐)
          if (sub.getAttribute("data-lp-grpdel") === "1") return;
          sub.setAttribute("data-lp-grpdel", "1");
          sub.classList.add("lp-grp");
          var del = document.createElement("button");
          del.className = "lp-del lp-grpdel-btn"; del.type = "button"; del.textContent = "×";
          del.setAttribute("contenteditable", "false");
          del.setAttribute("data-lp-ec", "1");
          del.title = "이 그룹(소제목+항목) 삭제";
          del.addEventListener("click", function (e) {
            e.preventDefault(); e.stopPropagation();
            if (!confirm("이 그룹(소제목과 항목들)을 삭제할까요?")) return;
            // 소제목 바로 뒤의 해당 리스트(.prog_items/.menu_list)를 찾아 함께 제거
            var n = sub.nextElementSibling, list = null;
            while (n) {
              if (n.classList.contains(def.sub)) break;        // 다음 그룹 시작 → 중단
              if (n.classList.contains(def.list)) { list = n; break; }
              n = n.nextElementSibling;
            }
            if (list) list.remove();
            sub.remove();
            toast("그룹을 삭제했습니다");
          });
          sub.appendChild(del);
        });
      });
    });
  }

  /* 편집 모드 펼침/접힘 토글 : 카드(.price_prog/.menu_cat) 우상단에 chevron 추가.
     - 클릭 시 제목만 남기고 본문 접기/펼치기(lp-collapsed 클래스 토글, DOM 재구성 없음).
     - 토글은 contenteditable=false + data-lp-ec → 편집/수정 대상이 아니며 저장 시 제거됨.
     - 제목 텍스트는 그대로 편집 가능. 라이브 페이지의 아코디언 동작은 LP JS가 별도로 처리. */
  var ACC_DEFS = [
    { card: ".price_prog", title: ".prog_title" },
    { card: ".menu_cat", title: ".menu_cat_title" }
  ];
  function bindAccordionToggle() {
    var ev = q("#procedure_type");
    if (!ev) return;
    ACC_DEFS.forEach(function (def) {
      qa(def.card, ev).forEach(function (card) {
        if (card.getAttribute("data-lp-acc") === "1") return;
        var title = q(def.title, card);
        if (!title || title.parentElement !== card) return;
        card.setAttribute("data-lp-acc", "1");
        var btn = document.createElement("button");
        btn.className = "lp-acc-toggle"; btn.type = "button";
        btn.setAttribute("contenteditable", "false");
        btn.setAttribute("data-lp-ec", "1");
        btn.setAttribute("aria-label", "펼치기 / 접기");
        btn.title = "펼치기 / 접기";
        btn.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          card.classList.toggle("lp-collapsed");
        });
        card.appendChild(btn);
      });
    });
  }

  /* 부제목 없는 항목 리스트(.prog_items/.menu_list) 앞에 빈 소제목 입력칸을 항상 노출.
     - 버튼 없이 바로 입력하는 형식(placeholder: '부제목 (비우면 표시되지 않습니다)').
     - 비워 두면 저장 시 cleanupEvent가 제거 → view에는 나타나지 않음.
     - 패키지(.prog_pkg) 내부 리스트는 제외(거긴 pkg_name/pkg_desc 사용). */
  function bindSubInputs() {
    var ev = q("#procedure_type");
    if (!ev) return;
    GROUP_DEFS.forEach(function (def) {
      qa("." + def.list, ev).forEach(function (list) {
        if (list.closest(".prog_pkg")) return;               // 패키지 내부 리스트는 부제목 대상 아님
        var prev = list.previousElementSibling;
        if (prev && prev.classList.contains(def.sub)) return; // 이미 소제목이 있으면 스킵
        var sub = document.createElement("p");
        sub.className = def.sub;
        sub.setAttribute("data-ph", "부제목 (비우면 표시되지 않습니다)");
        sub.setAttribute("data-lp-autosub", "1");            // 자동 삽입 입력칸(그룹 삭제 × 제외 대상)
        sub.setAttribute("contenteditable", "true");         // 버튼 없이 바로 입력
        sub.setAttribute("spellcheck", "false");
        list.parentElement.insertBefore(sub, list);
      });
    });
  }

  /* classone식 상세 설명(.sub): 각 event_item에 상세 설명란을 1개 보장.
     - 이미 있으면 TEXT_SELECTORS가 편집 가능하게 처리(여기선 스킵).
     - 없으면 빈 .sub를 시술명(.event_name) 뒤에 삽입하고 바로 편집 가능하게.
     - 비워 두면 저장 시 cleanupEvent가 제거 → view에는 표시되지 않음.
     - .sub 구조를 쓰지 않는 페이지(kleamM/H·세라미크 등)에는 삽입하지 않음. */
  function bindEventSub() {
    var ev = q("#procedure_type");
    if (!ev) return;
    if (!q(".sub", ev)) return;                  // .sub 상세 설명을 쓰는 페이지(classone)에서만
    qa(".event_item", ev).forEach(function (item) {
      if (q(".sub", item)) return;               // 이미 상세 설명란 있음
      var sub = document.createElement("div");
      sub.className = "sub";
      sub.setAttribute("contenteditable", "true");
      sub.setAttribute("spellcheck", "false");
      sub.setAttribute("data-ph", "상세 설명란 (비우면 표시되지 않습니다)");
      var name = q(".event_name", item);
      if (name) item.insertBefore(sub, name.nextSibling);
      else item.insertBefore(sub, item.firstChild);
    });
  }

  /* 가격 단위(万ウォン 등 <small>)는 편집 잠금 → 가격 숫자만 편집되게.
     contenteditable 부모 안의 contenteditable=false 자식은 편집 불가 섬이 됨.
     저장 스냅샷에서는 [contenteditable] 속성이 모두 제거되므로 라이브엔 영향 없음. */
  function lockPriceUnits() {
    var ev = q("#procedure_type");
    if (!ev) return;
    var UNIT_RE = /(万ウォン|ウォン|万円|円)\s*$/;
    qa(".event_price, .event_now, .event_origin", ev).forEach(function (el) {
      if (q(".lp-num", el)) return;                          // 이미 처리됨
      // 복합 래퍼(예: 세라미크 .event_price > .event_off/.event_now)는 제외 → 잎 요소만 처리
      var onlyUnitChildren = true;
      var small = null;
      Array.prototype.slice.call(el.children).forEach(function (c) {
        if (c.tagName === "SMALL") small = c;
        else if (!c.classList.contains("lp-unit")) onlyUnitChildren = false;
      });
      if (!onlyUnitChildren) return;
      var full = el.textContent;
      var unit = small ? small.textContent.trim() : (full.match(UNIT_RE) ? full.match(UNIT_RE)[1] : "");
      if (!unit) return;                                     // 단위가 없으면 가격 아님
      var idx = full.lastIndexOf(unit);
      var num = (idx >= 0 ? full.slice(0, idx) : full).trim();
      // 재구성: [숫자 span(편집 가능)] + [단위(.lp-unit, 편집 불가 → 입력란 밖)]
      el.textContent = "";
      var numSpan = document.createElement("span");
      numSpan.className = "lp-num";
      numSpan.setAttribute("contenteditable", "true");
      numSpan.setAttribute("spellcheck", "false");
      numSpan.setAttribute("data-ph", "가격");
      numSpan.textContent = num;
      el.appendChild(numSpan);
      var u = document.createElement(small ? "small" : "span");
      u.className = "lp-unit";
      u.setAttribute("contenteditable", "false");
      u.textContent = unit;
      el.appendChild(u);
      el.removeAttribute("contenteditable");                 // 컨테이너 자신은 편집 대상 아님
      el.removeAttribute("spellcheck");
    });
    // 그 외 남은 <small>(혹시 모를 단위)도 편집 잠금
    qa("small", ev).forEach(function (el) {
      if (!el.classList.contains("lp-unit")) el.setAttribute("contenteditable", "false");
    });
    // 단위 라벨 .event_unit(万ウォン/ウォン)은 편집 대상 아님 → 입력칸으로 잡히지 않게 잠금
    qa(".event_unit", ev).forEach(function (el) { el.setAttribute("contenteditable", "false"); });
  }

  function bindImages() {
    qa("#signature img, #procedure_type img, #doctors img, #BA img").forEach(function (img) {
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
        del.setAttribute("contenteditable", "false");   // 편집 가능한 항목(li 등) 안에서도 편집 대상에서 제외
        del.setAttribute("data-lp-ec", "1");
        del.title = "이 항목 삭제";
        del.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          if (confirm("이 항목을 삭제할까요?")) { var p = item.parentElement; item.remove(); toast("삭제했습니다"); }
        });
        item.appendChild(del);
      });
      // 각 '항목 컨테이너'마다 '＋ 추가' 버튼 설치
      //  - def.container 지정 시: 항목이 0개인 빈 컨테이너에도 버튼 노출(예: 빈 .pkg_steps)
      //  - 미지정 시: 기존처럼 항목이 실제로 있는 컨테이너에만 노출
      var containers = [];
      if (def.container) {
        qa(def.container, wrap).forEach(function (c) {
          if (containers.indexOf(c) === -1) containers.push(c);
        });
      } else {
        qa(def.item, wrap).forEach(function (it) {
          var p = it.parentElement;
          if (p && containers.indexOf(p) === -1) containers.push(p);
        });
      }
      containers.forEach(function (cont) {
        if (cont.getAttribute("data-lp-addbtn") === "1") return;
        cont.setAttribute("data-lp-addbtn", "1");
        if (!def.container) {
          var items = qa(def.item, cont).filter(function (n) { return n.parentElement === cont; });
          if (!items.length) return;
        }
        var add = document.createElement("button");
        add.className = "lp-add"; add.type = "button";
        add.textContent = def.addLabel || "＋ 시술 추가";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          var last = qa(def.item, cont).filter(function (n) { return n.parentElement === cont; }).pop();
          var clone;
          if (last) { clone = last.cloneNode(true); cleanClone(clone); }   // 기존 항목 복제
          else if (def.template) {                                         // 항목이 없으면 템플릿으로 생성
            var tmp = document.createElement("div");
            tmp.innerHTML = def.template;
            clone = tmp.firstElementChild;
          }
          if (!clone) return;
          cont.insertBefore(clone, firstAddBtn(cont) || add);   // 추가버튼 묶음 위에 삽입
          blankItem(clone);                 // 기존 텍스트 제거 + placeholder 힌트(삽입 후)
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
    if (node.getAttribute("data-lp-grpbtn") === "1") node.removeAttribute("data-lp-grpbtn");
    qa("[data-lp-grpbtn]", node).forEach(function (n) { n.removeAttribute("data-lp-grpbtn"); });
    if (node.getAttribute("data-lp-autosub") === "1") node.removeAttribute("data-lp-autosub");
    qa("[data-lp-autosub]", node).forEach(function (n) { n.removeAttribute("data-lp-autosub"); });
    qa("[data-lp-img]", node).forEach(function (n) { n.removeAttribute("data-lp-img"); n.classList.remove("lp-img"); });
    if (node.getAttribute("data-lp-img") === "1") { node.removeAttribute("data-lp-img"); node.classList.remove("lp-img"); }
  }

  /* 새 항목 추가 시 기존 텍스트를 비우고 무엇을 적을지 placeholder(data-ph) 힌트를 부여.
     - 클래스(또는 태그) → 안내문구 매핑. 가격 등 분리된 단위(<small>/.lp-unit)는 그대로 두고 숫자만 비움.
     - data-ph는 빈 contenteditable에서만 표시(injectEditorStyle의 :empty::before 규칙). */
  var ITEM_PH = [
    [".sig_title", "시술명"],
    [".sig_desc", "간단한 설명"],
    [".sig_tag", "태그"],
    [".event_badge", "배지 문구"],
    [".event_name", "시술 이름"],
    [".sub", "상세 설명란"],
    [".event_note", "구성·설명"],
    [".proc-opt", "옵션 설명"],
    [".event_origin", "정가"],
    [".event_off", "할인율 (예: 00%)"],
    [".event_now", "가격"],
    [".event_meta", "부가 정보"],
    [".event_price", "가격"],
    [".campaign-label", "이벤트 제목"],
    [".campaign-period", "기간 및 진행 중 표기"],
    [".prog_title", "카테고리명"],
    [".menu_cat_title", "카테고리명"],
    [".proc-cat-title", "카테고리명"],
    [".prog_sub", "부제목 (비우면 표시되지 않습니다)"],
    [".menu_sub", "부제목 (비우면 표시되지 않습니다)"],
    [".pkg_name", "프로그램명"],
    [".pkg_desc", "프로그램 설명"],
    [".pkg_steps li", "단계 설명"],
    [".doctor_role", "직책 (예: 院長)"],
    [".doctor_name", "이름"],
    [".doctor_career li", "경력 한 줄"],
    ["figcaption", "설명"],
    [".ba_label", "라벨"]
  ];

  /* 비우면 view에서 사라지는 선택 필드(cleanupEvent가 제거하는 대상) → 빈칸일 때
     '비우면 표시되지 않습니다' 안내를 placeholder로 노출(세라미크/우아 등 기존 항목 포함). */
  var OPT_PH = {
    "event_badge": "배지 문구 (비우면 표시되지 않습니다)",
    "event_note": "구성·설명 (비우면 표시되지 않습니다)",
    "sub": "상세 설명란 (비우면 표시되지 않습니다)",
    "proc-opt": "옵션 설명 (비우면 표시되지 않습니다)",
    "event_off": "할인율 (비우면 표시되지 않습니다)",
    "event_meta": "부가 정보 (비우면 표시되지 않습니다)"
  };
  function markOptionalFields() {
    var ev = q("#procedure_type");
    if (!ev) return;
    Object.keys(OPT_PH).forEach(function (cls) {
      qa("." + cls, ev).forEach(function (el) {
        el.setAttribute("data-ph", OPT_PH[cls]);   // 빈 상태에서만 표시(:empty::before)
      });
    });
  }

  /* 기존(이미 작성된) 편집 필드에도 ITEM_PH 기준 data-ph를 부여 → 내용을 모두 지우면
     신규 항목과 동일하게 placeholder 안내가 표시되게 함.
     - 편집 대상(contenteditable=true)인 잎 필드만 대상(컨테이너·가격 묶음은 제외).
     - 가격 숫자는 lockPriceUnits가 .lp-num에 '가격' 안내를 이미 부여하므로 건드리지 않음.
     - 선택 필드(.sub/.event_note 등)는 이후 markOptionalFields가 더 구체적인 문구로 덮어씀. */
  function markPlaceholders() {
    Object.keys(SECTIONS).forEach(function (sec) {
      var root = q(SECTIONS[sec]);
      if (!root) return;
      ITEM_PH.forEach(function (pair) {
        qa(pair[0], root).forEach(function (el) {
          if (el.getAttribute("contenteditable") !== "true") return;
          if (q(".lp-num", el)) return;              // 가격 컨테이너는 .lp-num이 별도 처리
          el.setAttribute("data-ph", pair[1]);
        });
      });
    });
  }

  function blankField(el, ph) {
    // 가격 구조(숫자 span.lp-num + 단위)인 경우: 숫자만 비우고 단위는 유지
    var nums = qa(".lp-num", el);
    if (nums.length) { nums.forEach(function (n) { n.textContent = ""; }); return; }
    // 분리된 단위(<small>/.lp-unit)가 '직속 자식'이면 단위는 남기고 숫자(직속 텍스트)만 제거
    var hasUnit = false;
    Array.prototype.slice.call(el.children).forEach(function (c) {
      if (c.tagName === "SMALL" || c.classList.contains("lp-unit")) hasUnit = true;
    });
    if (hasUnit) {
      Array.prototype.slice.call(el.childNodes).forEach(function (n) {
        if (n.nodeType === 3) el.removeChild(n);     // 직속 텍스트 노드만 제거
      });
      return;                                        // 자식이 남아 :empty 아님 → 단위가 힌트 역할
    }
    // 구분용 plain <span>(예: 기간 사이 '〜')만 자식으로 있으면 통째로 비워 힌트 노출
    var onlySepSpans = el.children.length > 0 &&
      Array.prototype.slice.call(el.children).every(function (c) {
        return c.tagName === "SPAN" && !c.className;
      });
    if (el.children.length && !onlySepSpans) return; // 다른 구조 요소가 있으면 비우지 않음(래퍼 보호)
    el.textContent = "";
    if (ph) el.setAttribute("data-ph", ph);
  }

  /* DOM에 삽입된 새 항목의 모든 텍스트 필드를 빈칸+placeholder로 전환(삽입 후 호출) */
  function blankItem(node) {
    ITEM_PH.forEach(function (pair) {
      qa(pair[0], node).forEach(function (el) { blankField(el, pair[1]); });
      if (node.matches && node.matches(pair[0])) blankField(node, pair[1]);  // 항목 자신이 li 등인 경우
    });
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
      if (title) title.textContent = "새 카테고리";
      trimCards(firstCat);
      var s0 = subsWrap ? directChildren(subsWrap, ".subtab")[0] : null;
      if (s0) {
        s0.setAttribute("data-target", newCat);
        s0.classList.add("is-active");
        setTabLabel(s0, "새 카테고리");
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
    setTabLabel(t, "새 탭");

    if (srcPanel) {
      var p = srcPanel.cloneNode(true);
      cleanClone(p);
      p.classList.remove("is-active");
      p.id = newPanelId;
      trimPanel(p);
      blankItem(p);                         // 복제된 카드의 기존 텍스트 → placeholder 힌트
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
    var isLast = directChildren(group, ".tab").length <= 1;
    if (!confirm(isLast ? "이 탭을 삭제하면 상위탭이 없어집니다(내용은 평면으로 복원). 삭제할까요?"
                        : "이 탭과 그 내용을 모두 삭제할까요?")) return;
    var sel = tab.getAttribute("data-target");
    var panel = sel ? q(sel) : null;
    var wasActive = tab.classList.contains("is-active");
    tab.remove();

    if (isLast) {
      // 마지막 탭: 평면 카드 묶음이 있으면 섹션으로 되돌리고(평면 복원), 패널·빈 .tabs 제거
      var root = group.closest("#procedure_type") || q("#procedure_type");
      if (panel) {
        var grid = flatGrid(panel, true);
        if (grid && root) root.insertBefore(grid, group);
        panel.remove();
      }
      group.remove();
      refreshEditables();
      toast("탭을 삭제했습니다");
      return;
    }

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
    setTabLabel(s, "새 카테고리");

    if (srcCat) {
      var c = srcCat.cloneNode(true);
      cleanClone(c);
      c.classList.remove("is-active");
      c.id = newCat;
      var title = q(".proc-cat-title", c);
      if (title) title.textContent = "새 카테고리";
      trimCards(c);
      blankItem(c);                         // 복제된 카드의 기존 텍스트 → placeholder 힌트
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
    var isLast = directChildren(wrap, ".subtab").length <= 1;
    if (!confirm(isLast ? "이 카테고리를 삭제하면 하위탭이 없어집니다(내용은 평면으로 복원). 삭제할까요?"
                        : "이 카테고리와 그 내용을 삭제할까요?")) return;
    var catId = sub.getAttribute("data-target");
    var cat = catId ? document.getElementById(catId) : null;
    var wasActive = sub.classList.contains("is-active");
    var panel = sub.closest(".panel") || q("#procedure_type");
    sub.remove();

    if (isLast) {
      // 마지막 카테고리: 평면 카드 묶음이 있으면 패널로 되돌리고(평면 복원), 카테고리·빈 .subtabs 제거
      if (cat) {
        var grid = flatGrid(cat, true);
        if (grid && panel) panel.insertBefore(grid, wrap);
        cat.remove();
      }
      wrap.remove();
      refreshEditables();
      toast("카테고리를 삭제했습니다");
      return;
    }

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
    tab.textContent = "새 탭";
    tabs.appendChild(tab);

    var panel = document.createElement("div");
    panel.className = "panel is-active";
    panel.id = panelId;
    panel.appendChild(grid);   // 기존 카드 묶음을 패널 안으로 이동(.panel 자체엔 패딩 없음)

    // section_title 바로 뒤에 tabs, 그 뒤에 panel 삽입
    var title = directChildren(root, ".section_title")[0];
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
    sub.textContent = "새 카테고리";
    subtabs.appendChild(sub);

    var cat = document.createElement("div");
    cat.className = "proc-cat is-active";
    cat.id = catId;
    var ctitle = document.createElement("h3");
    ctitle.className = "proc-cat-title";
    ctitle.textContent = "새 카테고리";
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

    // 탭이 하나도 없고 평면 카드 묶음이 있으면 → '상위탭 만들기' 버튼(요금제 제목 바로 아래)
    if (!q(".tabs", root) && flatGrid(root, true) && !q(".lp-tabboot", root)) {
      var tb = bootBtn("lp-tabboot", "＋ 상위탭 만들기", function () {
        createTabStructure(root);
      });
      var rootTitle = directChildren(root, ".section_title")[0];
      if (rootTitle) root.insertBefore(tb, rootTitle.nextSibling);
      else root.insertBefore(tb, root.firstChild);
    }
    // 서브탭 없는 각 패널 → '하위탭 만들기' 버튼(패널 맨 위)
    qa(".panel", root).forEach(function (panel) {
      if (q(".subtabs", panel) || !flatGrid(panel, true) || q(".lp-subboot", panel)) return;
      var btn = bootBtn("lp-subboot", "＋ 하위탭(카테고리) 만들기", function () {
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

  /* 편집 모드에서 거슬리는 자동 움직임 정지(시그니처 자동 슬라이드 / 원장 카드 슬라이드 등) */
  function tameMotion() {
    // 드래그 스크롤 슬라이더(시그니처·원장소개)는 포인터 캡처로 카드 내부 ×/이미지/추가 버튼
    // 클릭을 가로챔 → 캡처/자동 스크롤을 무력화해 삭제 버튼이 정상 동작하게 한다.
    qa("#signature .sig_track, #doctors .doctors_wrap").forEach(function (st) {
      // 자동 슬라이드는 scrollTo로 동작 → 무력화(드래그 스크롤은 scrollLeft라 유지)
      try { st.scrollTo = function () {}; } catch (e) {}
      try { st.setPointerCapture = function () {}; } catch (e) {}
      try { st.releasePointerCapture = function () {}; } catch (e) {}
    });
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

  /* 동영상 ID → 편집칸에 표시할 YouTube 링크 주소(링크로 보고 수정할 수 있게) */
  function shortsUrl(id) {
    id = ytId(id || "");
    return id ? "https://youtu.be/" + id : "";
  }

  function renumberShorts(box) {
    qa(".lp-srow", box).forEach(function (row, i) {
      var n = q(".lp-sn", row);
      if (n) n.textContent = "#" + (i + 1);
    });
  }

  function buildShortsEditor() {
    var grid = q(SHORTS_GRID);
    if (!grid) return;
    var cfg = readExistingShorts();
    if (!cfg.length) cfg = [{ id: "", ratio: "9x16" }];
    var box = document.createElement("div");
    box.className = "lp-shorts-editor";
    box.setAttribute("data-lp-ec", "1");
    cfg.forEach(function (it) { box.appendChild(shortsRow(it)); });

    var add = document.createElement("button");
    add.className = "lp-add lp-sadd"; add.type = "button";
    add.textContent = "＋ 유튜브 추가";
    add.setAttribute("data-lp-ec", "1");
    add.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      box.insertBefore(shortsRow({ id: "", ratio: "9x16" }), add);
      renumberShorts(box);
      var rows = qa(".lp-srow", box);
      var last = rows[rows.length - 1];
      var inp = last && q(".lp-sid", last);
      if (inp) inp.focus();
      toast("쇼츠를 추가했습니다");
    });
    box.appendChild(add);

    grid.innerHTML = "";
    grid.appendChild(box);
    renumberShorts(box);
  }

  function shortsRow(it) {
    var row = document.createElement("div");
    row.className = "lp-srow"; row.setAttribute("data-lp-ec", "1");
    row.innerHTML =
      "<span class='lp-sn'></span>" +
      "<input type='text' class='lp-sid' placeholder='유튜브 링크 주소 (예: https://youtu.be/xxxxxxxxxxx)' value='" + shortsUrl(it.id) + "'>" +
      "<select class='lp-sratio'>" +
      "<option value='9x16'" + (it.ratio !== "16x9" ? " selected" : "") + ">세로 9:16</option>" +
      "<option value='16x9'" + (it.ratio === "16x9" ? " selected" : "") + ">가로 16:9</option>" +
      "</select>" +
      "<button type='button' class='lp-sdel' data-lp-ec='1' title='이 쇼츠 삭제'>×</button>";
    var del = q(".lp-sdel", row);
    if (del) del.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      var box = row.parentElement;
      row.remove();
      if (box) renumberShorts(box);
      toast("쇼츠를 삭제했습니다");
    });
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
    qa("[data-ph]", clone).forEach(function (n) { n.removeAttribute("data-ph"); });   // 편집기 placeholder 안내 → 저장본에서 제거
    qa(".lp-item", clone).forEach(function (n) { n.classList.remove("lp-item"); });
    qa("[data-lp-itembound]", clone).forEach(function (n) { n.removeAttribute("data-lp-itembound"); });
    qa("[data-lp-addbtn]", clone).forEach(function (n) { n.removeAttribute("data-lp-addbtn"); });
    qa("[data-lp-grpbtn]", clone).forEach(function (n) { n.removeAttribute("data-lp-grpbtn"); });
    qa("[data-lp-catbtn]", clone).forEach(function (n) { n.removeAttribute("data-lp-catbtn"); });
    qa("[data-lp-catdel]", clone).forEach(function (n) { n.removeAttribute("data-lp-catdel"); });
    qa("[data-lp-grpdel]", clone).forEach(function (n) { n.removeAttribute("data-lp-grpdel"); });
    qa("[data-lp-autosub]", clone).forEach(function (n) { n.removeAttribute("data-lp-autosub"); });
    qa("[data-lp-acc]", clone).forEach(function (n) { n.removeAttribute("data-lp-acc"); });
    qa(".lp-collapsed", clone).forEach(function (n) { n.classList.remove("lp-collapsed"); });
    qa(".lp-grp", clone).forEach(function (n) { n.classList.remove("lp-grp"); });
    qa(".lp-img", clone).forEach(function (n) { n.classList.remove("lp-img"); });
    qa("[data-lp-img]", clone).forEach(function (n) { n.removeAttribute("data-lp-img"); });

    if (sectionName === "hero") cleanupHero(clone);
    if (sectionName === "signature") cleanupSignature(clone);
    if (sectionName === "event") cleanupEvent(clone);
    return clone.innerHTML;
  }

  // 이벤트요금 : 비어 있는 소제목(.prog_sub/.menu_sub)은 제거 → view에서 없는 것처럼.
  // 항목이 하나도 없는 빈 리스트(.prog_items/.menu_list)도 함께 제거.
  function cleanupEvent(root) {
    // 가격 편집 구조 해제 → 원본 마크업 복원
    //  - 숫자 span(.lp-num) : 텍스트로 환원
    //  - 단위(.lp-unit)     : <small>이면 클래스/속성만 제거해 <small>万ウォン</small> 유지,
    //                         <span>이면 평문(万ウォン)으로 환원(세라미크/우아)
    qa(".lp-num", root).forEach(function (n) {
      n.replaceWith(root.ownerDocument.createTextNode(n.textContent));
    });
    qa(".lp-unit", root).forEach(function (u) {
      if (u.tagName === "SMALL") {
        u.removeAttribute("class");
        u.removeAttribute("contenteditable");
      } else {
        u.replaceWith(root.ownerDocument.createTextNode(u.textContent));
      }
    });
    // 비어 있는 선택 필드(배지/설명/옵션/가격 등)는 제거 → view에서 표시되지 않게(세라미크 등)
    var OPT = [".event_badge", ".event_note", ".proc-opt", ".event_origin",
               ".event_off", ".event_now", ".event_unit", ".event_meta",
               ".event_period", ".price_period", ".menu_period", ".sub"];
    OPT.forEach(function (sel) {
      qa(sel, root).forEach(function (n) {
        // 단위(万ウォン/%/円 등)만 남은 가격 필드도 '빈 값'으로 보고 제거
        var t = n.textContent.replace(/(万ウォン|ウォン|万円|円|%)/g, "").trim();
        if (!t && !q("img", n)) n.remove();
      });
    });
    // 내용이 모두 빠져 비게 된 래퍼(가격 묶음/배지 줄)도 함께 제거(event_price → 상위 행 순서로)
    [".event_price", ".proc-badges", ".proc-price-row"].forEach(function (sel) {
      qa(sel, root).forEach(function (n) {
        if (!n.textContent.trim() && !q("img", n)) n.remove();
      });
    });
    qa(".prog_items, .menu_list", root).forEach(function (ul) {
      if (!qa(".event_item", ul).length) ul.remove();
    });
    qa(".prog_sub, .menu_sub", root).forEach(function (s) {
      if (!s.textContent.trim()) s.remove();
    });
  }

  // 히어로 : 슬라이드(.hero_bg/.hero_slide)의 is-active 상태가 편집 중 자동 슬라이드로
  // 임의 슬라이드에 고정되지 않도록, 첫 슬라이드에만 is-active를 부여(원본 마크업과 동일).
  function cleanupHero(root) {
    [".hero_bg", ".hero_slide"].forEach(function (sel) {
      var slides = qa(sel, root);
      slides.forEach(function (s, i) { s.classList.toggle("is-active", i === 0); });
    });
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
    if (q(SECTIONS.hero)) ov.hero = snapshot(SECTIONS.hero, "hero");
    if (q(SECTIONS.signature)) ov.signature = snapshot(SECTIONS.signature, "signature");
    if (q(SECTIONS.event)) ov.event = snapshot(SECTIONS.event, "event");
    if (q(SECTIONS.doctors)) ov.doctors = snapshot(SECTIONS.doctors, "doctors");
    if (q(SECTIONS.info)) ov.info = snapshot(SECTIONS.info, "info");
    if (q(SECTIONS.ba)) ov.ba = snapshot(SECTIONS.ba, "ba");
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
