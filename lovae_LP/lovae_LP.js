const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('.lightbox_img');
const lightboxClose = lightbox.querySelector('.lightbox_close');

document.querySelectorAll('.ba_img img').forEach((img) => {
    img.addEventListener('click', () => {
        lightboxImg.src = img.src;
        lightboxImg.alt = img.alt;
        lightbox.classList.remove('qr-mode');
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    });
});

const LINE_URL = 'https://line.me/R/ti/p/@564izgje?ts=03051300&oat_content=url';

document.querySelectorAll('.line_btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        lightboxImg.src = './lovae_LP_img/lineQR.png';
        lightboxImg.alt = 'LINE QRコード';
        lightbox.classList.add('open', 'qr-mode');
        document.body.style.overflow = 'hidden';
    });
});

lightboxImg.addEventListener('click', () => {
    if (lightbox.classList.contains('qr-mode')) {
        window.open(LINE_URL, '_blank');
    }
});

function closeLightbox() {
    lightbox.classList.remove('open', 'qr-mode');
    document.body.style.overflow = '';
}

lightboxClose.addEventListener('click', closeLightbox);

lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeLightbox();
});

const eventGrid = document.querySelector('.event_grid');
const eventMore = document.querySelector('.event_more');

if (eventGrid && eventMore) {
    const STEP = 4;
    const cards = Array.from(eventGrid.querySelectorAll('.event_item'));
    let visible = STEP;

    function renderCards() {
        cards.forEach((card, i) => {
            card.classList.toggle('is-hidden', i >= visible);
        });
        const allShown = visible >= cards.length;
        eventMore.textContent = allShown ? '閉じる' : 'もっと見る';
        eventMore.setAttribute('aria-expanded', String(allShown));
    }

    eventMore.addEventListener('click', () => {
        if (visible >= cards.length) {
            visible = STEP;
            const section = eventGrid.closest('section') || eventGrid;
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
            visible += STEP;
        }
        renderCards();
    });

    renderCards();
}

/* ===== SIGNATURE 자동 슬라이드 ===== */
const sigTrack = document.querySelector('.sig_track');

if (sigTrack) {
    const INTERVAL = 2500;
    let timer = null;
    let paused = false;
    let isDragging = false;
    let index = 0; // 현재 카드 인덱스

    // 양쪽 여백은 CSS의 .sig_track::before / ::after 로 가운데 정렬을 보장

    function nextSlide() {
        const cards = sigTrack.querySelectorAll('.sig_card');
        if (!cards.length) return;
        const step = cards[0].offsetWidth + 16; // 카드 폭 + gap
        // 마지막 카드 다음에는 처음으로 되돌아간다
        index = index >= cards.length - 1 ? 0 : index + 1;
        sigTrack.scrollTo({ left: step * index, behavior: 'smooth' });
    }

    function start() {
        if (timer) return;
        timer = setInterval(() => {
            if (!paused && !isDragging) nextSlide();
        }, INTERVAL);
    }

    function stop() {
        clearInterval(timer);
        timer = null;
    }

    // 호버 / 터치 시 일시정지
    sigTrack.addEventListener('mouseenter', () => { paused = true; });
    sigTrack.addEventListener('mouseleave', () => { paused = false; });
    sigTrack.addEventListener('touchstart', () => { paused = true; }, { passive: true });
    sigTrack.addEventListener('touchend', () => { paused = false; });

    // 드래그로 좌우 스크롤
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    sigTrack.addEventListener('pointerdown', (e) => {
        isDragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = sigTrack.scrollLeft;
        sigTrack.style.scrollSnapType = 'none';
        sigTrack.classList.add('dragging');
        sigTrack.setPointerCapture(e.pointerId);
    });

    sigTrack.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        sigTrack.scrollLeft = startScroll - dx;
    });

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        sigTrack.classList.remove('dragging');
        sigTrack.style.scrollSnapType = '';
        try { sigTrack.releasePointerCapture(e.pointerId); } catch (_) {}
        // 드래그로 옮긴 위치에 맞춰 인덱스 동기화
        const card = sigTrack.querySelector('.sig_card');
        if (card) {
            const step = card.offsetWidth + 16;
            index = Math.round(sigTrack.scrollLeft / step);
        }
    }

    sigTrack.addEventListener('pointerup', endDrag);
    sigTrack.addEventListener('pointercancel', endDrag);

    // 드래그 후 클릭 오작동 방지
    sigTrack.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    start();
}

/* ===== REVIEW 슬라이드 (화살표 + 드래그) ===== */
(function () {
    const track = document.querySelector('.review_track');
    if (!track) return;

    const prevBtn = document.querySelector('.review_prev');
    const nextBtn = document.querySelector('.review_next');

    function step() {
        const card = track.querySelector('.review_card');
        return card ? card.offsetWidth + 16 : track.clientWidth;
    }

    if (prevBtn) prevBtn.addEventListener('click', () => {
        track.scrollBy({ left: -step(), behavior: 'smooth' });
    });
    if (nextBtn) nextBtn.addEventListener('click', () => {
        track.scrollBy({ left: step(), behavior: 'smooth' });
    });

    // 드래그로 좌우 스크롤
    let isDragging = false;
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    track.addEventListener('pointerdown', (e) => {
        isDragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = track.scrollLeft;
        track.style.scrollSnapType = 'none';
        track.classList.add('dragging');
        track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        track.scrollLeft = startScroll - dx;
    });

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        track.classList.remove('dragging');
        track.style.scrollSnapType = '';
        try { track.releasePointerCapture(e.pointerId); } catch (_) {}
    }

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    track.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);
})();

document.querySelectorAll('.faq_item').forEach((item) => {
    const btn = item.querySelector('.faq_q');
    const answer = item.querySelector('.faq_a');

    btn.addEventListener('click', () => {
        const isOpen = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        answer.style.maxHeight = isOpen ? answer.scrollHeight + 'px' : '';
    });
});

/* ===== PROCEDURE TYPE: タブ切替 ===== */
(function () {
    const root = document.getElementById('procedure_type');
    if (!root) return;

    const tabs = Array.from(root.querySelectorAll('.tab'));
    const panels = Array.from(root.querySelectorAll('.panel'));

    tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.target;
            tabs.forEach((t) => t.classList.toggle('is-active', t === tab));
            panels.forEach((panel) => {
                panel.classList.toggle('is-active', '#' + panel.id === target);
            });
        });
    });

    // 各パネル内のカテゴリ サブタブ切替
    panels.forEach((panel) => {
        const subtabs = Array.from(panel.querySelectorAll('.subtab'));
        const cats = Array.from(panel.querySelectorAll('.proc-cat'));
        subtabs.forEach((st) => {
            st.addEventListener('click', () => {
                const target = st.dataset.target;
                subtabs.forEach((s) => s.classList.toggle('is-active', s === st));
                cats.forEach((c) => c.classList.toggle('is-active', c.id === target));
            });
        });
    });
})();

/* ===== 前後写真 Swiper ===== */
if (window.Swiper) {
    document.querySelectorAll('.sectionSwiper').forEach((sec) => {
        const el = sec.querySelector('.bnaSwiper');
        if (!el) return;
        new Swiper(el, {
            loop: el.querySelectorAll('.swiper-slide').length > 1,
            navigation: {
                nextEl: sec.querySelector('.swiper-button-next'),
                prevEl: sec.querySelector('.swiper-button-prev'),
            },
        });
    });
}

/* ===== Hero 배경 페이드 전환 ===== */
(() => {
    const slides = document.querySelectorAll('#hero_intro .hero_bg');
    if (slides.length < 2) return;
    let i = 0;
    setInterval(() => {
        slides[i].classList.remove('is-active');
        i = (i + 1) % slides.length;
        slides[i].classList.add('is-active');
    }, 4000);
})();

/* ===== DOCTORS 가로 슬라이더 (kleamH와 동일) ===== */
function initCardSlider(track, cardSelector, { interval = 2500, gap = 16 } = {}) {
    if (!track) return;

    let timer = null;
    let paused = false;
    let isDragging = false;
    let index = 0; // 현재 카드 인덱스

    function nextSlide() {
        const cards = track.querySelectorAll(cardSelector);
        if (!cards.length) return;
        const step = cards[0].offsetWidth + gap; // 카드 폭 + gap
        // 마지막 카드 다음에는 처음으로 되돌아간다
        index = index >= cards.length - 1 ? 0 : index + 1;
        track.scrollTo({ left: step * index, behavior: 'smooth' });
    }

    function start() {
        if (timer) return;
        timer = setInterval(() => {
            if (!paused && !isDragging) nextSlide();
        }, interval);
    }

    // 호버 / 터치 시 일시정지
    track.addEventListener('mouseenter', () => { paused = true; });
    track.addEventListener('mouseleave', () => { paused = false; });
    track.addEventListener('touchstart', () => { paused = true; }, { passive: true });
    track.addEventListener('touchend', () => { paused = false; });

    // 드래그로 좌우 스크롤
    let startX = 0;
    let startScroll = 0;
    let moved = false;

    track.addEventListener('pointerdown', (e) => {
        isDragging = true;
        moved = false;
        startX = e.clientX;
        startScroll = track.scrollLeft;
        track.style.scrollSnapType = 'none';
        track.classList.add('dragging');
        track.setPointerCapture(e.pointerId);
    });

    track.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        track.scrollLeft = startScroll - dx;
    });

    function endDrag(e) {
        if (!isDragging) return;
        isDragging = false;
        track.classList.remove('dragging');
        track.style.scrollSnapType = '';
        try { track.releasePointerCapture(e.pointerId); } catch (_) {}
        // 드래그로 옮긴 위치에 맞춰 인덱스 동기화
        const card = track.querySelector(cardSelector);
        if (card) {
            const step = card.offsetWidth + gap;
            index = Math.round(track.scrollLeft / step);
        }
    }

    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    // 드래그 후 클릭 오작동 방지
    track.addEventListener('click', (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    start();
}

initCardSlider(document.querySelector('.doctors_wrap'), '.doctor_card', { interval: 3000 });
