const fileInput = document.getElementById('fileInput');
const stackContainer = document.getElementById('stackContainer');
const emptyState = document.getElementById('emptyState');
const themeToggle = document.getElementById('themeToggle');
const ratio11Btn = document.getElementById('ratio11');
const ratio169Btn = document.getElementById('ratio169');
const playToggle = document.getElementById('playToggle');
const speedControl = document.getElementById('speedControl');
const hideUiToggle = document.getElementById('hideUiToggle');
const controlsWrapper = document.getElementById('controlsWrapper');

let currentRatio = 'ratio-1-1';
let isAnimating = false;
let isPlaying = false;
let autoPlayTimer;
let activeIndex = 0;

const speeds = [
    { label: 'Normal', delay: 1800 },
    { label: 'Fast', delay: 560 },
    { label: 'Slow', delay: 2800 }
];
let currentSpeedIndex = 0;

hideUiToggle.addEventListener('click', () => {
    controlsWrapper.classList.toggle('hidden');
    if (controlsWrapper.classList.contains('hidden')) {
        hideUiToggle.textContent = 'Show UI';
    } else {
        hideUiToggle.textContent = 'Hide UI';
    }
});

themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    themeToggle.textContent = document.body.classList.contains('dark-mode') ? 'Light' : 'Dark';
});

ratio11Btn.addEventListener('click', () => {
    setRatio('ratio-1-1', ratio11Btn, ratio169Btn);
    updateStack();
});

ratio169Btn.addEventListener('click', () => {
    setRatio('ratio-16-9', ratio169Btn, ratio11Btn);
    updateStack();
});

function setRatio(ratioClass, activeBtn, inactiveBtn) {
    currentRatio = ratioClass;
    activeBtn.classList.add('active');
    inactiveBtn.classList.remove('active');

    document.querySelectorAll('.card').forEach(card => {
        card.classList.remove('ratio-1-1', 'ratio-16-9');
        card.classList.add(currentRatio);
    });
}

speedControl.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    const speedSettings = speeds[currentSpeedIndex];

    speedControl.textContent = `CONTROLS: ${speedSettings.label}`;

    if (isPlaying) {
        clearTimeout(autoPlayTimer);
        scheduleNextCard();
    }
});

playToggle.addEventListener('click', () => {
    const cards = document.querySelectorAll('.card');
    if (cards.length <= 1) return;

    isPlaying = !isPlaying;
    playToggle.textContent = isPlaying ? 'Pause' : 'Play';
    playToggle.classList.toggle('active', isPlaying);

    if (isPlaying) {
        triggerNextCard();
        scheduleNextCard();
    } else {
        clearTimeout(autoPlayTimer);
    }
});

function scheduleNextCard() {
    const currentDelay = speeds[currentSpeedIndex].delay;
    autoPlayTimer = setTimeout(() => {
        if (isPlaying) {
            triggerNextCard();
            scheduleNextCard();
        }
    }, currentDelay);
}

let wheelTimeout;
window.addEventListener('wheel', (e) => {
    if (isPlaying || isAnimating) return;
    const cards = document.querySelectorAll('.card');
    if (cards.length <= 1) return;

    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(() => {
        if (e.deltaY > 15) {
            triggerNextCard();
        } else if (e.deltaY < -15) {
            triggerPrevCard();
        }
    }, 40);
}, { passive: true });

fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
        emptyState.style.display = 'none';
    }

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            createCard(ev.target.result);
        };
        reader.readAsDataURL(file);
    });
    fileInput.value = '';
});

function createCard(imageSrc) {
    const card = document.createElement('div');
    card.className = `card ${currentRatio}`;

    const img = document.createElement('img');
    img.src = imageSrc;

    card.appendChild(img);
    stackContainer.appendChild(card);

    card.addEventListener('click', () => {
        if (isPlaying) return;
        const cards = Array.from(stackContainer.querySelectorAll('.card'));
        const clickedIndex = cards.indexOf(card);
        if (clickedIndex !== activeIndex) {
            activeIndex = clickedIndex;
            updateStack();
        } else {
            triggerNextCard();
        }
    });

    updateStack();
}

function updateStack() {
    const cards = Array.from(stackContainer.querySelectorAll('.card'));
    const total = cards.length;
    if (total === 0) return;

    const centerScale = 1;
    const sideScale = 0.54;
    const firstOffset = currentRatio === 'ratio-1-1' ? 310 : 272;
    const stepOffset = currentRatio === 'ratio-1-1' ? 236 : 208;

    cards.forEach((card, index) => {
        let diff = index - activeIndex;
        if (total > 4) {
            if (diff > total / 2) diff -= total;
            if (diff < -total / 2) diff += total;
        }

        card.classList.toggle('is-center', diff === 0);

        if (diff === 0) {
            card.style.zIndex = 10;
            card.style.transform = `translateY(0px) scale(${centerScale})`;
            card.style.opacity = 1;
            card.style.pointerEvents = 'auto';
        } else if (Math.abs(diff) === 1) {
            const sign = diff > 0 ? 1 : -1;
            const yOffset = sign * firstOffset;
            card.style.zIndex = 6;
            card.style.transform = `translateY(${yOffset}px) scale(${sideScale})`;
            card.style.opacity = 0.95;
            card.style.pointerEvents = 'auto';
        } else if (Math.abs(diff) === 2) {
            const sign = diff > 0 ? 1 : -1;
            const yOffset = sign * (firstOffset + stepOffset);
            card.style.zIndex = 4;
            card.style.transform = `translateY(${yOffset}px) scale(${sideScale})`;
            card.style.opacity = 0.95;
            card.style.pointerEvents = 'auto';
        } else {
            const sign = diff > 0 ? 1 : -1;
            const yOffset = sign * (firstOffset + stepOffset * 2);
            card.style.zIndex = 1;
            card.style.transform = `translateY(${yOffset}px) scale(${sideScale})`;
            card.style.opacity = 0;
            card.style.pointerEvents = 'none';
        }
    });
}

function triggerNextCard() {
    if (isAnimating) return;
    const cards = Array.from(stackContainer.querySelectorAll('.card'));
    if (cards.length <= 1) return;

    isAnimating = true;
    activeIndex = (activeIndex + 1) % cards.length;
    updateStack();

    setTimeout(() => {
        isAnimating = false;
    }, 550);
}

function triggerPrevCard() {
    if (isAnimating) return;
    const cards = Array.from(stackContainer.querySelectorAll('.card'));
    if (cards.length <= 1) return;

    isAnimating = true;
    activeIndex = (activeIndex - 1 + cards.length) % cards.length;
    updateStack();

    setTimeout(() => {
        isAnimating = false;
    }, 550);
}