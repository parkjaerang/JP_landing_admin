/* =============================================================
   admin.js  —  管理ページ（admin.html）用
   - 簡易クライアント認証（パスワード）
   - 認証後にギャラリーを表示し、各カードに「編集」ボタンを追加
   - 編集ボタン → 各 LP を ?admin=1 で開き、admin-edit.js が編集モードに
   ※ クライアント側パスワードのため強固な機密保護ではありません。
     本番ではバックエンド認証への置き換えを推奨します。
   ============================================================= */
(function () {
  "use strict";

  /* ▼ ここでパスワードを変更してください ▼ */
  var ADMIN_PASSWORD = "admin1234";
  /* ▲ ここまで ▲ */

  var AUTH_KEY = "lp_admin_authed";

  function authed() { try { return localStorage.getItem(AUTH_KEY) === "1"; } catch (e) { return false; } }
  function setAuthed(v) { try { v ? localStorage.setItem(AUTH_KEY, "1") : localStorage.removeItem(AUTH_KEY); } catch (e) {} }

  document.addEventListener("DOMContentLoaded", function () {
    injectStyle();
    if (authed()) { enterAdmin(); } else { showGate(); }
  });

  /* ---- ログイン画面 ---- */
  function showGate() {
    document.body.classList.add("admin-locked");
    var gate = document.createElement("div");
    gate.className = "admin-gate";
    gate.innerHTML =
      "<div class='admin-gate-box'>" +
      "<h2>管理者ログイン</h2>" +
      "<p>パスワードを入力してください</p>" +
      "<input type='password' id='admin-pw' placeholder='パスワード' autocomplete='current-password'>" +
      "<button id='admin-login'>ログイン</button>" +
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
        err.textContent = "パスワードが違います";
        pw.value = ""; pw.focus();
      }
    }
    gate.querySelector("#admin-login").addEventListener("click", tryLogin);
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") tryLogin(); });
    pw.focus();
  }

  /* typo 安全のための別名 */
  function enterAdmin() { enterAdminImpl(); }
  function enterAdminImpl() {
    addAdminBar();
    addEditButtons();
  }

  /* ---- 上部バー（ログアウト） ---- */
  function addAdminBar() {
    if (document.querySelector(".admin-bar")) return;
    var bar = document.createElement("div");
    bar.className = "admin-bar";
    bar.innerHTML =
      "<span>🔑 管理モード</span><span class='admin-bar-sp'></span>" +
      "<span class='admin-hint'>各ページの「編集」から内容を変更できます</span>" +
      "<button id='admin-logout'>ログアウト</button>";
    document.body.insertBefore(bar, document.body.firstChild);
    bar.querySelector("#admin-logout").addEventListener("click", function () {
      setAuthed(false);
      location.reload();
    });
  }

  /* ---- 各カードに編集ボタン ---- */
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
      btn.textContent = "✏️ 編集";
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        var url = href + (href.indexOf("?") === -1 ? "?" : "&") + "admin=1";
        window.open(url, "_blank");
      });
      thumb.appendChild(btn);
    });
  }

  /* ---- スタイル ---- */
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
      ".admin-gate-box button:hover{background:#255bd0}" +
      ".admin-err{color:#e8553b!important;font-size:12px!important;margin:10px 0 0!important;min-height:14px}" +
      ".admin-bar{position:sticky;top:0;z-index:9000;display:flex;align-items:center;gap:10px;padding:9px 18px;" +
      "background:#1a1c1f;color:#fff;font-family:system-ui,sans-serif;font-size:13px}" +
      ".admin-bar .admin-bar-sp{flex:1}.admin-bar .admin-hint{opacity:.6;font-size:12px}" +
      ".admin-bar button{font:inherit;cursor:pointer;border:0;border-radius:8px;padding:7px 14px;background:#3a3d42;color:#fff;font-weight:600}" +
      ".admin-edit-btn{position:absolute;top:10px;right:10px;z-index:20;border:0;border-radius:999px;padding:8px 14px;" +
      "background:#2f6df0;color:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
      ".admin-edit-btn:hover{background:#255bd0}";
    document.head.appendChild(s);
  }
})();
