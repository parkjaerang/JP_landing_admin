/* =============================================================
   admin.js  —  관리자 페이지(admin.html) 전용
   - 간단한 클라이언트 인증(비밀번호)
   - 인증 후 갤러리를 표시하고, 각 카드에 '편집' 버튼 추가
   - 편집 버튼 → 각 LP를 ?admin=1 로 열어 admin-edit.js가 편집 모드 진입
   ※ 클라이언트 측 비밀번호라 강력한 보안은 아닙니다.
     실제 운영에서는 백엔드 인증으로 교체를 권장합니다.
   ============================================================= */
(function () {
  "use strict";

  /* ▼ 여기에서 비밀번호를 변경하세요 ▼ */
  var ADMIN_PASSWORD = "admin1234";
  /* ▲ 여기까지 ▲ */

  var AUTH_KEY = "lp_admin_authed";

  function authed() { try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; } }
  function setAuthed(v) { try { v ? localStorage.setItem(AUTH_KEY, "1") : localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  document.addEventListener("DOMContentLoaded", function () {
    injectStyle();
    if (authed()) { enterAdmin(); } else { showGate(); }
  });

  /* ---- 로그인 화면 ---- */
  function showGate() {
    document.body.classList.add("admin-locked");
    var gate = document.createElement("div");
    gate.className = "admin-gate";
    gate.innerHTML =
      "<div class='admin-gate-box'>" +
      "<h2>관리자 로그인</h2>" +
      "<p>비밀번호를 입력하세요</p>" +
      "<input type='password' id='admin-pw' placeholder='비밀번호' autocomplete='current-password'>" +
      "<button id='admin-login'>로그인</button>" +
      "<p class='admin-err' id='admin-err'></p>" +
      "</div>";
    document.body.appendChild(gate);

    var pw = gate.querySelector("#admin-pw");
    var err = gate.querySelector("#admin-err");
    function tryLogin() {
      if (pw.value === ADMIN_PASSWORD) {
        setAuthed(true);
        gate.remove();
        document.body.classList.remove("admin-locked");
        enterAdmin();
      } else {
        err.textContent = "비밀번호가 올바르지 않습니다";
        pw.value = ""; pw.focus();
      }
    }
    gate.querySelector("#admin-login").addEventListener("click", tryLogin);
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });
    pw.focus();
  }

  /* 오타 방지용 별칭 */
  function enterAdmin() { enterAdminImpl(); }
  function enterAdminImpl() {
    addAdminBar();
    addEditButtons();
    addThumbEditors();
  }

  /* ---- 상단 바(로그아웃) ---- */
  function addAdminBar() {
    if (document.querySelector(".admin-bar")) return;
    var bar = document.createElement("div");
    bar.className = "admin-bar";
    bar.innerHTML =
      "<span>🔑 관리자 모드</span><span class='admin-bar-sp'></span>" +
      "<span class='admin-hint'>각 페이지의 '편집'에서 내용을 변경할 수 있습니다</span>" +
      "<button id='admin-logout'>로그아웃</button>";
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector("#admin-logout").addEventListener("click", function () {
      setAuthed(false);
      location.reload();
    });
  }

  /* ---- 각 카드에 편집 버튼 ---- */
  function addEditButtons() {
    var cards = document.querySelectorAll(".gallery .card");
    cards.forEach(function (card) {
      if (card.querySelector(".admin-edit-btn")) return;
      var href = card.getAttribute("href");
      if (!href) return;
      var thumb = card.querySelector(".card-thumb") || card;
      thumb.style.position = "relative";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-edit-btn";
      btn.textContent = "✏️ 페이지 편집";
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var url = href + (href.indexOf("?") === -1 ? "?" : "&") + "admin=1";
        window.open(url, "_blank");
      });
      thumb.appendChild(btn);
    });
  }

  /* ---- 각 카드 썸네일 변경(이미지 교체) ---- */
  function addThumbEditors() {
    if (!window.LPGallery) return;            // gallery-edit.js 미로드 시 무시
    var cards = document.querySelectorAll(".gallery .card");
    cards.forEach(function (card) {
      var thumb = card.querySelector(".card-thumb");
      if (!thumb || thumb.querySelector(".admin-thumb-btn")) return;
      var img = thumb.querySelector("img");
      if (!img) return;
      thumb.style.position = "relative";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "admin-thumb-btn";
      btn.textContent = "🖼️ 썸네일 변경";
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        pickImage(function (dataUrl) {
          img.setAttribute("src", dataUrl);
          img.removeAttribute("srcset");
          var data = window.LPGallery.load();
          var key = window.LPGallery.cardKey(card);
          if (!data[key]) data[key] = {};
          data[key].thumb = dataUrl;
          var ok = window.LPGallery.save(data);
          toast(ok ? "✅ 썸네일을 변경했습니다 (이 브라우저에 저장됨)"
                   : "⚠️ 저장 실패 (용량 초과 가능성)");
        });
      });
      thumb.appendChild(btn);
    });
  }

  /* ---- 파일 선택 → dataURL ---- */
  function pickImage(cb) {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.style.display = "none";
    document.body.appendChild(inp);
    inp.addEventListener("change", function () {
      var f = inp.files && inp.files[0];
      if (f) {
        var r = new FileReader();
        r.onload = function () { cb(r.result); };
        r.readAsDataURL(f);
      }
      inp.remove();
    });
    inp.click();
  }

  /* ---- 토스트 ---- */
  var _toastEl, _toastT;
  function toast(msg) {
    if (!_toastEl) {
      _toastEl = document.createElement("div");
      _toastEl.className = "admin-toast";
      document.body.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add("show");
    clearTimeout(_toastT);
    _toastT = setTimeout(function () { _toastEl.classList.remove("show"); }, 2400);
  }

  /* ---- 스타일 ---- */
  function injectStyle() {
    var s = document.createElement("style");
    s.textContent =
      "body.admin-locked{overflow:hidden}" +
      ".admin-gate{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;" +
      "background:rgba(20,24,31,.55);backdrop-filter:blur(6px);font-family:system-ui,-apple-system,'Segoe UI','Noto Sans JP',sans-serif}" +
      ".admin-gate-box{background:#fff;border-radius:16px;padding:32px 28px;width:min(90vw,360px);text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)}" +
      ".admin-gate-box h2{font-size:20px;margin-bottom:6px;color:#1a1c1f}" +
      ".admin-gate-box p{font-size:13px;color:#6b7077;margin-bottom:18px}" +
      ".admin-gate-box input{width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;font-size:15px;margin-bottom:12px}" +
      ".admin-gate-box input:focus{outline:2px solid #2f6df0;border-color:transparent}" +
      ".admin-gate-box button{width:100%;padding:12px;border:0;border-radius:10px;background:#2f6df0;color:#fff;font-size:15px;font-weight:700;cursor:pointer}" +
      // ".admin-gate-box button:hover{background:#255bd0}" +
      ".admin-err{color:#e8553b!important;font-size:12px!important;margin:10px 0 0!important;min-height:14px}" +
      ".admin-bar{position:sticky;top:0;z-index:9000;display:flex;align-items:center;gap:10px;padding:9px 18px;" +
      "background:#1a1c1f;color:#fff;font-family:system-ui,sans-serif;font-size:13px}" +
      ".admin-bar .admin-bar-sp{flex:1}.admin-bar .admin-hint{opacity:.6;font-size:12px}" +
      ".admin-bar button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:7px 14px;background:#3a3d42;color:#fff;font-weight:600}" +
      ".admin-edit-btn{position:absolute;top:10px;right:10px;z-index:20;border:0;border-radius:999px;padding:8px 14px;" +
      "background:#2f6df0;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
      // ".admin-edit-btn:hover{background:#255bd0}" +
      ".admin-thumb-btn{position:absolute;top:10px;left:10px;z-index:20;border:0;border-radius:999px;padding:8px 14px;" +
      "background:rgba(26,28,31,.82);color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
      // ".admin-thumb-btn:hover{background:#1a1c1f}" +
      ".admin-toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;background:#1a1c1f;color:#fff;" +
      "padding:9px 18px;border-radius:999px;font-size:13px;font-family:system-ui,sans-serif;opacity:0;transition:.25s;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.3)}" +
      ".admin-toast.show{opacity:1}";
    document.head.appendChild(s);
  }
})();
