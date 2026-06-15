// 6枚ずつ表示。残りは「もっと見る」で6枚ずつ追加表示する。
(function () {
    var STEP = 6;
    var gallery = document.querySelector(".gallery");
    var btn = document.querySelector(".more-btn");
    if (!gallery || !btn) return;

    var cards = Array.prototype.slice.call(gallery.querySelectorAll(".card"));
    var shown = 0;

    // ページ数バッジをカード数に合わせて自動更新
    var badge = document.querySelector(".count-badge");
    if (badge) {
        badge.textContent = cards.length + (cards.length === 1 ? " Page" : " Pages");
    }

    function render() {
        cards.forEach(function (card, i) {
            card.hidden = i >= shown;
        });
        btn.hidden = shown >= cards.length;
    }

    function showMore() {
        shown = Math.min(shown + STEP, cards.length);
        render();
    }

    shown = Math.min(STEP, cards.length);
    render();

    btn.addEventListener("click", showMore);
})();
