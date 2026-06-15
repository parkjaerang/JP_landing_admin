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
        lightboxImg.src = './img/lineQR.png';
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

/* ===== 가로 카드 트랙: 자동 슬라이드 + 드래그 ===== */
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

initCardSlider(document.querySelector('.sig_track'), '.sig_card', { interval: 2500 });
initCardSlider(document.querySelector('.doctors_wrap'), '.doctor_card', { interval: 3000 });

document.querySelectorAll('.faq_item').forEach((item) => {
    const btn = item.querySelector('.faq_q');
    const answer = item.querySelector('.faq_a');

    btn.addEventListener('click', () => {
        const isOpen = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(isOpen));
        answer.style.maxHeight = isOpen ? answer.scrollHeight + 'px' : '';
    });
});

/* ===== 料金メニュー 아코디언 (제목 클릭 시 펼침/접힘) ===== */
/* 관리자 편집 모드(html.lp-admin)에서는 아코디언을 만들지 않는다.
   - 제목(.menu_cat_title)을 토글 버튼이 아닌 편집 가능한 텍스트로 그대로 두고
   - 본문(가격 목록)도 펼쳐진 상태로 유지해 한 번에 편집할 수 있게 한다. */
if (!document.documentElement.classList.contains('lp-admin')) {
document.querySelectorAll('.menu_cat').forEach((cat) => {
    const title = cat.querySelector('.menu_cat_title');
    if (!title) return;

    // 제목 다음의 모든 내용을 .menu_body 로 감싼다
    const body = document.createElement('div');
    body.className = 'menu_body';
    while (title.nextSibling) {
        body.appendChild(title.nextSibling);
    }
    cat.appendChild(body);

    // 클릭 유도 화살표 사인
    const arrow = document.createElement('span');
    arrow.className = 'menu_arrow';
    arrow.setAttribute('aria-hidden', 'true');
    title.appendChild(arrow);

    title.setAttribute('role', 'button');
    title.setAttribute('tabindex', '0');
    title.setAttribute('aria-expanded', 'false');

    function toggle() {
        const isOpen = cat.classList.toggle('open');
        title.setAttribute('aria-expanded', String(isOpen));
        body.style.maxHeight = isOpen ? body.scrollHeight + 'px' : '';
    }

    title.addEventListener('click', toggle);
    title.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
        }
    });
});
}
