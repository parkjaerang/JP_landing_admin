/* =============================================================
   admin-edit.js  —  LP ページ用 インライン編集 + オーバーライド適用
   -------------------------------------------------------------
   - すべての LP ページが読み込む（各ページの自前 JS より前に実行）
   - 通常表示 : localStorage に保存された変更を適用するだけ
   - 管理モード(?admin=1 かつ ログイン済み) : 画面上で直接編集
   - 保存は localStorage（将来バックエンド追加時にこの層を差し替える）
   編集対象セクション : シグネチャ / イベント料金 / ショート / 病院情報
   ============================================================= */
(function () {
  "use strict";

  var AUTH_KEY = "lp_admin_authed";
  var OVERRIDE_PREFIX = "lp_override_v1::";

  /* ---- ページキー（例: wooa_LP） ---- */
  function getPageKey() {
    var parts = location.pathname.split("/").filter(Boolean);
    var file = parts[parts.length - 1] || "";
    var key = file.replace(/\.html?$/i, "");
    if (!key || /^index$/i.test(key)) key = parts[parts.length - 2] || key;
    return decodeURIComponent(key);
  }
  var PAGE_KEY = getPageKey();

  /* ---- 管理対象セクション（innerHTML スナップショット方式・セクション全体） ---- */
  var SECTIONS = {
    signature: "#signature",
    event: "#procedure_type",
    info: "#information"
  };
  var SHORTS_GRID = "#contents .shorts_grid";

  /* ---- localStorage ヘルパ ---- */
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

  /* ---- YouTube ID 抽出 ---- */
  function ytId(input) {
    if (!input) return "";
    input = String(input).trim();
    var m = input.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{6,20})/);
    if (m) return m[1];
    if (/^[\w-]{6,20}$/.test(input)) return input;
    return input;
  }

  /* =========================================================
     1) オーバーライド適用（通常表示・管理表示の両方で最初に実行）
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
     2) 管理モード判定
     ========================================================= */
  function isAdminParam() {
    return new URLSearchParams(location.search).get("admin") === "1";
  }
  if (!isAdminParam()) return;                 // 通常表示はここで終了
  if (lsGet(AUTH_KEY) !== "1") {               // 未ログイン → admin へ
    location.replace("../admin.html");
    return;
  }

  /* 以降は編集モード */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initEditor);
  } else {
    initEditor();
  }

  function initEditor() {
    document.documentElement.classList.add("lp-admin");
    injectEditorStyle();
    buildToolbar();
    bindAnchorGuard();
    refreshEditables();
    buildShortsEditor();
    bindMapControl();
    toast("編集モード : クリックして直接編集できます");
  }

  /* =========================================================
     3) 編集 UI スタイル
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
      "html.lp-admin [contenteditable='true']{outline:1px dashed rgba(47,109,240,.55);outline-offset:2px;cursor:text;border-radius:3px}" +
      "html.lp-admin [contenteditable='true']:hover{background:rgba(47,109,240,.05)}" +
      "html.lp-admin [contenteditable='true']:focus{outline:2px solid #2f6df0;background:rgba(47,109,240,.08)}" +
      "html.lp-admin .lp-item{position:relative}" +
      ".lp-del{position:absolute;top:6px;right:6px;z-index:60;width:26px;height:26px;border-radius:50%;border:0;background:#e8553b;color:#fff;font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px rgba(0,0,0,.35)}" +
      ".lp-add{display:flex;align-items:center;justify-content:center;gap:6px;width:calc(100% - 8px);margin:12px auto;padding:10px 16px;border:1.5px dashed #2f6df0;border-radius:10px;background:rgba(47,109,240,.08);color:#2f6df0;font-weight:700;cursor:pointer;font-family:system-ui,sans-serif;font-size:13px}" +
      "html.lp-admin .lp-img{position:relative;cursor:pointer}" +
      "html.lp-admin .lp-img::after{content:'📷 画像を変更';position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,.65);color:#fff;font-size:11px;padding:5px 9px;border-radius:6px;pointer-events:none;opacity:0;transition:.15s;white-space:nowrap}" +
      "html.lp-admin .lp-img:hover::after{opacity:1}" +
      ".lp-map-edit{display:block;width:calc(100% - 0px);margin:0 0 10px;padding:9px;border:1.5px dashed #2f6df0;border-radius:9px;background:rgba(47,109,240,.08);color:#2f6df0;font-weight:700;cursor:pointer;font-family:system-ui;font-size:12px}" +
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
     4) ツールバー
     ========================================================= */
  function buildToolbar() {
    var bar = document.createElement("div");
    bar.className = "lp-toolbar";
    bar.setAttribute("data-lp-ec", "1");
    bar.innerHTML =
      "<span class='lp-title'>✏️ 編集モード</span><span class='lp-key'>" + PAGE_KEY + "</span>" +
      "<span class='lp-sp'></span>" +
      "<button class='ghost' data-act='preview'>プレビュー</button>" +
      "<button class='warn' data-act='reset'>変更を破棄</button>" +
      "<button data-act='save'>保存</button>" +
      "<button class='ghost' data-act='exit'>終了</button>";
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
     5) テキスト編集 / 画像 / 項目の追加削除
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
        // 別の編集候補を内部に含む要素はスキップ（最も内側のみ編集可能に）
        var hasInner = candidates.some(function (o) { return o !== el && el.contains(o); });
        if (hasInner) return;
        if (el.getAttribute("contenteditable") === "true") return;
        el.setAttribute("contenteditable", "true");
        el.setAttribute("spellcheck", "false");
      });
    });
    bindImages();
    bindItemControls();
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
        r.onload = function () { cb(r.result); toast("画像を変更しました"); };
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
        del.title = "この項目を削除";
        del.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          if (confirm("この項目を削除しますか？")) { var p = item.parentElement; item.remove(); toast("削除しました"); }
        });
        item.appendChild(del);
      });
      // 各「項目の入れ物」ごとに「＋ 追加」ボタンを設置
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
        add.textContent = "＋ 項目を追加";
        add.setAttribute("data-lp-ec", "1");
        add.addEventListener("click", function (e) {
          e.preventDefault(); e.stopPropagation();
          var last = qa(def.item, cont).filter(function (n) { return n.parentElement === cont; }).pop();
          if (!last) return;
          var clone = last.cloneNode(true);
          cleanClone(clone);
          last.parentElement.insertBefore(clone, add);
          refreshEditables();
          toast("項目を追加しました");
        });
        cont.appendChild(add);
      });
    });
  }

  // クローン項目から編集チロメ/状態を除去し、テキストを空に
  function cleanClone(node) {
    qa("[data-lp-ec]", node).forEach(function (n) { n.remove(); });
    qa(".lp-del", node).forEach(function (n) { n.remove(); });
    node.classList.remove("lp-item");
    node.removeAttribute("data-lp-itembound");
    qa("[data-lp-itembound]", node).forEach(function (n) { n.removeAttribute("data-lp-itembound"); });
    qa("[data-lp-img]", node).forEach(function (n) { n.removeAttribute("data-lp-img"); n.classList.remove("lp-img"); });
    if (node.getAttribute("data-lp-img") === "1") { node.removeAttribute("data-lp-img"); node.classList.remove("lp-img"); }
  }

  /* 地図 iframe のリンク変更 */
  function bindMapControl() {
    var map = q("#information iframe");
    if (!map || q(".lp-map-edit")) return;
    var btn = document.createElement("button");
    btn.className = "lp-map-edit"; btn.type = "button";
    btn.textContent = "🗺 地図の埋め込みリンクを変更";
    btn.setAttribute("data-lp-ec", "1");
    btn.addEventListener("click", function () {
      var cur = map.getAttribute("src") || "";
      var v = prompt("Google マップの埋め込み URL（iframe の src）を入力してください：", cur);
      if (v != null && v.trim()) { map.setAttribute("src", v.trim()); toast("地図を更新しました"); }
    });
    map.parentElement.insertBefore(btn, map);
  }

  /* ショート編集（リンク + 縦横比） */
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
      "<input type='text' class='lp-sid' placeholder='YouTube リンク または 動画ID' value='" + (it.id || "") + "'>" +
      "<select class='lp-sratio'>" +
      "<option value='9x16'" + (it.ratio !== "16x9" ? " selected" : "") + ">縦 9:16</option>" +
      "<option value='16x9'" + (it.ratio === "16x9" ? " selected" : "") + ">横 16:9</option>" +
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

  /* クリックでのリンク遷移を編集中は抑止 */
  function bindAnchorGuard() {
    document.addEventListener("click", function (e) {
      if (!document.documentElement.classList.contains("lp-admin")) return;
      if (e.target.closest("[data-lp-ec]")) return;            // 編集 UI は除外
      var a = e.target.closest("a[href]");
      if (a && !a.classList.contains("tab") && !a.classList.contains("subtab")) {
        e.preventDefault();
      }
    }, true);
  }

  /* =========================================================
     6) 保存 / リセット
     ========================================================= */
  function snapshot(sel, sectionName) {
    var el = q(sel);
    if (!el) return null;
    var clone = el.cloneNode(true);
    // 編集チロメ除去
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

  // シグネチャ : 説明が空なら .sig_desc を削除、タグが空なら .sig_tags / .sig_tag を削除
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
    toast(ok ? "✅ 保存しました（この端末のブラウザに保存）" : "⚠️ 保存に失敗（容量超過の可能性）");
  }

  function doReset() {
    if (!confirm("このページの変更をすべて破棄して初期状態に戻しますか？")) return;
    lsDel(OVERRIDE_PREFIX + PAGE_KEY);
    toast("変更を破棄しました。再読み込みします…");
    setTimeout(function () { location.reload(); }, 600);
  }

  /* ---- トースト ---- */
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
})();
