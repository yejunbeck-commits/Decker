// ============================================================
// Decker — Video Export (MP4 · H.264)
// Re-renders the showcase frame by frame on a canvas and encodes it with WebCodecs.
// ============================================================
(() => {
    const exportBtn = document.getElementById('exportBtn');
    const modal = document.getElementById('exportModal');
    const closeX = document.getElementById('exportCloseX');
    const closeBtn = document.getElementById('exportClose');
    const startBtn = document.getElementById('exportStart');
    const infoEl = document.getElementById('exportInfo');
    const progressWrap = document.getElementById('exportProgress');
    const progressBar = document.getElementById('exportProgressBar');
    const progressText = document.getElementById('exportProgressText');

    const RES = {           // short side in px, bitrate in Mbps
        '720p': { short: 720, mbps: 8 },
        '1080p': { short: 1080, mbps: 12 },
        '2K': { short: 1440, mbps: 20 },
        '4K': { short: 2160, mbps: 40 },
    };
    const RATIOS = { '1:1': [1, 1], '4:5': [4, 5], '9:16': [9, 16], '16:9': [16, 9] };
    const settings = { ratio: '1:1', res: '720p', fps: 30, loops: 1 };
    let ratioPicked = false;

    let cancelled = false;
    let exporting = false;

    function syncSeg(key, value) {
        const group = modal.querySelector(`.seg[data-key="${key}"]`);
        if (!group) return;
        group.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.value === String(value)));
    }

    modal.querySelectorAll('.seg').forEach(group => {
        const key = group.dataset.key;
        group.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                if (exporting) return;
                group.querySelectorAll('button').forEach(b => b.classList.remove('on'));
                btn.classList.add('on');
                const v = btn.dataset.value;
                settings[key] = (key === 'fps' || key === 'loops') ? Number(v) : v;
                if (key === 'ratio') ratioPicked = true;
                updateInfo();
            });
        });
    });

    function getCards() {
        return Array.from(document.querySelectorAll('#stackContainer .card'));
    }

    function getDims() {
        const short = RES[settings.res].short;
        const [rw, rh] = RATIOS[settings.ratio];
        let w, h;
        if (rw >= rh) { h = short; w = Math.round(short * rw / rh); }
        else { w = short; h = Math.round(short * rh / rw); }
        w += w % 2; h += h % 2;
        return { w, h, wide: currentRatio === 'ratio-16-9' };   // wide = card shape
    }

    function getDurationMs() {
        return getCards().length * speeds[currentSpeedIndex].delay * settings.loops;
    }

    function updateInfo() {
        const { w, h } = getDims();
        const sec = getDurationMs() / 1000;
        const mbps = RES[settings.res].mbps;
        const mib = (mbps * 1e6 * sec / 8) / (1024 * 1024);
        infoEl.textContent = `${w}×${h} · ${sec.toFixed(1)}s · ${mbps} Mbps · ~${Math.round(mib)} MB max`;
    }

    function openModal() {
        if (getCards().length < 2) {
            alert('Upload at least 2 images to export a video.');
            return;
        }
        if (isPlaying) togglePlay();
        if (!ratioPicked) {
            settings.ratio = currentRatio === 'ratio-16-9' ? '16:9' : '1:1';
            syncSeg('ratio', settings.ratio);
        }
        updateInfo();
        progressWrap.hidden = true;
        modal.classList.add('open');
    }
    function closeModal() {
        if (exporting) { cancelled = true; return; }
        modal.classList.remove('open');
    }

    exportBtn.addEventListener('click', openModal);
    closeX.addEventListener('click', closeModal);
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    startBtn.addEventListener('click', () => { if (!exporting) runExport(); });

    // ---- Recreates cubic-bezier(0.22, 1, 0.36, 1) from style.css ----
    function cubicBezier(p1x, p1y, p2x, p2y) {
        const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
        const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
        const sx = t => ((ax * t + bx) * t + cx) * t;
        const sy = t => ((ay * t + by) * t + cy) * t;
        const dx = t => (3 * ax * t + 2 * bx) * t + cx;
        return x => {
            if (x <= 0) return 0;
            if (x >= 1) return 1;
            let t = x;
            for (let i = 0; i < 8; i++) {
                const err = sx(t) - x;
                const d = dx(t);
                if (Math.abs(err) < 1e-6 || Math.abs(d) < 1e-6) break;
                t -= err / d;
            }
            return sy(Math.min(1, Math.max(0, t)));
        };
    }
    const ease = cubicBezier(0.22, 1, 0.36, 1);
    const lerp = (a, b, t) => a + (b - a) * t;

    // Same layout as updateStack(), computed with a continuous diff
    function cardState(d, total, wide) {
        const firstOffset = wide ? 272 : 310;
        const stepOffset = wide ? 208 : 236;
        const side = 0.54;
        const a = Math.abs(d), sign = d < 0 ? -1 : 1;
        let y, scale, opacity;
        if (a <= 1) {
            y = lerp(0, firstOffset, a); scale = lerp(1, side, a); opacity = lerp(1, 0.95, a);
        } else if (a <= 2) {
            y = lerp(firstOffset, firstOffset + stepOffset, a - 1); scale = side; opacity = 0.95;
        } else {
            const t = Math.min(1, a - 2);
            y = lerp(firstOffset + stepOffset, firstOffset + stepOffset * 2, t); scale = side; opacity = lerp(0.95, 0, t);
        }
        opacity *= Math.min(1, Math.max(0, (total / 2 - a) / 0.5));
        return { y: y * sign, scale, opacity, center: 1 - Math.min(1, a) };
    }

    function roundRectPath(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function drawCover(ctx, img, x, y, w, h) {
        const ir = img.naturalWidth / img.naturalHeight, br = w / h;
        let sw, sh, sx, sy;
        if (ir > br) { sh = img.naturalHeight; sw = sh * br; sx = (img.naturalWidth - sw) / 2; sy = 0; }
        else { sw = img.naturalWidth; sh = sw / br; sx = 0; sy = (img.naturalHeight - sh) / 2; }
        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    function renderFrame(ctx, W, H, imgs, activePos, wide, dark) {
        const s = Math.min(H / 1000, W / 600);   // fit tall frames by height, cap by width
        const total = imgs.length;
        const bg = dark ? [17, 17, 17] : [254, 254, 254];
        const c = bg.join(',');

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgb(${c})`;
        ctx.fillRect(0, 0, W, H);

        const cardW = wide ? 500 : 340;
        const cardH = wide ? cardW * 9 / 16 : cardW;

        const items = imgs.map((img, i) => {
            let d = i - activePos;
            d = ((d % total) + total) % total;
            if (d > total / 2) d -= total;
            return { img, ...cardState(d, total, wide), a: Math.abs(d) };
        }).filter(it => it.opacity > 0.001)
          .sort((a, b) => b.a - a.a);

        for (const it of items) {
            const w = cardW * it.scale * s, h = cardH * it.scale * s;
            const x = W / 2 - w / 2, y = H / 2 + it.y * s - h / 2;
            const r = 18 * it.scale * s;
            ctx.save();
            ctx.globalAlpha = it.opacity;
            const sa = dark ? lerp(0.3, 0.5, it.center) : lerp(0.04, 0.08, it.center);
            ctx.shadowColor = `rgba(0,0,0,${sa})`;
            ctx.shadowBlur = lerp(24, 48, it.center) * s;
            ctx.shadowOffsetY = lerp(8, 24, it.center) * s;
            roundRectPath(ctx, x, y, w, h, r);
            ctx.fillStyle = `rgb(${c})`;
            ctx.fill();
            ctx.shadowColor = 'transparent';
            ctx.clip();
            drawCover(ctx, it.img, x, y, w, h);
            ctx.restore();
        }

        // Top / bottom fade (recreates .fade-overlay)
        const fh = H * 0.28;
        const top = ctx.createLinearGradient(0, 0, 0, fh);
        top.addColorStop(0, `rgba(${c},1)`); top.addColorStop(0.2, `rgba(${c},1)`);
        top.addColorStop(0.55, `rgba(${c},0.7)`); top.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = top; ctx.fillRect(0, 0, W, fh);
        const bot = ctx.createLinearGradient(0, H, 0, H - fh);
        bot.addColorStop(0, `rgba(${c},1)`); bot.addColorStop(0.2, `rgba(${c},1)`);
        bot.addColorStop(0.55, `rgba(${c},0.7)`); bot.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = bot; ctx.fillRect(0, H - fh, W, fh);
    }

    async function pickConfig(w, h, fps, bitrate) {
        const candidates = ['avc1.640033', 'avc1.640034', 'avc1.4D0033', 'avc1.42003E'];
        for (const codec of candidates) {
            const cfg = { codec, width: w, height: h, bitrate, framerate: fps, latencyMode: 'quality', avc: { format: 'avc' } };
            try {
                const r = await VideoEncoder.isConfigSupported(cfg);
                if (r.supported) return cfg;
            } catch (_) { }
        }
        return null;
    }

    function setProgress(p, text) {
        progressBar.style.width = `${Math.round(p * 100)}%`;
        progressText.textContent = text;
    }

    function setBusy(b) {
        exporting = b;
        startBtn.disabled = b;
        startBtn.textContent = b ? 'Exporting…' : 'Export MP4';
        closeBtn.textContent = b ? 'Cancel' : 'Close';
        modal.classList.toggle('busy', b);
    }

    async function runExport() {
        if (!('VideoEncoder' in window)) {
            alert('Your browser does not support video export. Please use the latest Chrome, Edge, or Safari 17+.');
            return;
        }
        const cards = getCards();
        if (cards.length < 2) return;

        const imgs = cards.map(c => c.querySelector('img'));
        await Promise.all(imgs.map(img => img.decode ? img.decode().catch(() => {}) : null));

        const { w: W, h: H, wide } = getDims();
        const fps = settings.fps;
        const bitrate = RES[settings.res].mbps * 1e6;
        const delay = speeds[currentSpeedIndex].delay;
        const transMs = Math.min(600, delay);
        const totalFrames = Math.round(getDurationMs() / 1000 * fps);
        const startIndex = activeIndex;
        const dark = document.body.classList.contains('dark-mode');

        const config = await pickConfig(W, H, fps, bitrate);
        if (!config) {
            alert(`${settings.res} ${settings.ratio} export is not supported on this device. Please choose a lower resolution.`);
            return;
        }

        setBusy(true);
        cancelled = false;
        progressWrap.hidden = false;
        setProgress(0, 'Preparing…');

        let encoder;
        try {
            const lib = await import('https://cdn.jsdelivr.net/npm/mp4-muxer@5/+esm');
            const target = new lib.ArrayBufferTarget();
            const muxer = new lib.Muxer({
                target,
                video: { codec: 'avc', width: W, height: H, frameRate: fps },
                fastStart: 'in-memory',
            });

            let encodeError = null;
            encoder = new VideoEncoder({
                output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
                error: e => { encodeError = e; },
            });
            encoder.configure(config);

            const canvas = document.createElement('canvas');
            canvas.width = W; canvas.height = H;
            const ctx = canvas.getContext('2d', { alpha: false });
            ctx.imageSmoothingQuality = 'high';

            const frameUs = 1e6 / fps;
            for (let f = 0; f < totalFrames; f++) {
                if (cancelled) throw new Error('cancelled');
                if (encodeError) throw encodeError;

                // Each segment (delay) = hold, then transition to the next card during the last transMs
                const t = (f / fps) * 1000;
                const seg = Math.floor(t / delay);
                const local = t - seg * delay;
                const p = ease((local - (delay - transMs)) / transMs);
                renderFrame(ctx, W, H, imgs, startIndex + seg + p, wide, dark);

                const frame = new VideoFrame(canvas, { timestamp: Math.round(f * frameUs), duration: Math.round(frameUs) });
                encoder.encode(frame, { keyFrame: f % (fps * 2) === 0 });
                frame.close();

                while (encoder.encodeQueueSize > 8) {
                    await new Promise(r => setTimeout(r, 4));
                }
                if (f % 5 === 0) {
                    setProgress(f / totalFrames, `Rendering frame ${f + 1} / ${totalFrames}`);
                    await new Promise(r => setTimeout(r, 0));
                }
            }

            setProgress(1, 'Finalizing…');
            await encoder.flush();
            if (encodeError) throw encodeError;
            encoder.close();
            muxer.finalize();

            const blob = new Blob([target.buffer], { type: 'video/mp4' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `decker-${W}x${H}-${fps}fps.mp4`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 10000);

            setProgress(1, `Done · ${(blob.size / 1024 / 1024).toFixed(1)} MB`);
        } catch (err) {
            try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch (_) {}
            if (err && err.message === 'cancelled') {
                setProgress(0, 'Cancelled');
            } else {
                console.error(err);
                setProgress(0, `Error: ${err && err.message ? err.message : err}`);
            }
        } finally {
            setBusy(false);
        }
    }
})();
