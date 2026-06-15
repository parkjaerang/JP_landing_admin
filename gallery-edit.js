/* =============================================================
   gallery-edit.js  —  갤러리(index.html / admin.html) 카드 썸네일 오버라이드
   -------------------------------------------------------------
   - 두 페이지 모두에서 로드되어, 저장된 썸네일 변경을 적용만 함
   - 실제 편집(클릭해서 사진 변경)은 admin.js(관리자 모드)에서 처리
   - 저장은 localStorage (추후 백엔드 추가 시 이 층만 교체)
     · 카드 식별자 = href (예: "wooa_LP/wooa_LP.html") — 안정적
     · 구조 : { "<href>": { thumb: "data:...", logo: "data:..." } }
   ============================================================= */
(function () {
  "use strict";

  var KEY = "lp_gallery_v1";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }

  function load() {
    var raw = lsGet(KEY);
    if (!raw) return {};
    try { return JSON.parse(raw) || {}; } catch (e) { return {}; }
  }
  function save(obj) { return lsSet(KEY, JSON.stringify(obj)); }

  function cardKey(card) { return card.getAttribute("href") || ""; }

  /* 저장된 오버라이드를 모든 카드에 적용 */
  function apply() {
    var data = load();
    var cards = document.querySelectorAll(".gallery .card");
    Array.prototype.forEach.call(cards, function (card) {
      var ov = data[cardKey(card)];
      if (!ov) return;
      if (ov.thumb) {
        var t = card.querySelector(".card-thumb img");
        if (t) { t.setAttribute("src", ov.thumb); t.removeAttribute("srcset"); }
      }
      if (ov.logo) {
        var l = card.querySelector(".card-logo");
        if (l) { l.setAttribute("src", ov.logo); l.removeAttribute("srcset"); }
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }

  /* 관리자 편집(admin.js)에서 사용 */
  window.LPGallery = { KEY: KEY, load: load, save: save, apply: apply, cardKey: cardKey };
})();
