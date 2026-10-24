// 前端页面/components/视频播放器组件.js
// ==========================================
// 🎬 自定义视频播放器组件
// ==========================================
// 功能：内嵌视频播放 + 全屏沉浸式播放，支持自定义控制栏
// 接口：getVideoPlayerHTML / setupVideoPlayerEvents / cleanupVideoPlayer / openFullscreenVideo
// ==========================================

import { t } from './用户体验增强.js';

function releaseVideoMedia(video) {
    video.pause();
    video.removeAttribute('src');
    for (const source of video.querySelectorAll('source')) source.removeAttribute('src');
    video.load();
}

// ==========================================
// 🎨 CSS 样式（仅注入一次）
// ==========================================
let stylesInjected = false;
function injectVideoPlayerStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
.video-player-container {
    position: relative;
    overflow: hidden;
    border-radius: 8px;
    max-height: 500px;
    background: #000;
    width: 100%;
    container-type: inline-size;
    container-name: ranking-video;
    outline: none;
}
.video-player-container video {
    width: 100%;
    height: 100%;
    max-height: 500px;
    object-fit: contain;
    display: block;
    cursor: pointer;
}
.video-poster-overlay {
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 5;
    transition: opacity 0.3s ease;
}
.video-poster-overlay img {
    position: absolute;
    top: 0; left: 0;
    width: 100%; height: 100%;
    object-fit: cover;
}
.video-play-btn-large {
    position: relative;
    z-index: 2;
    width: 64px; height: 64px;
    border-radius: 50%;
    background: rgba(255,255,255,0.85);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease, background 0.2s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}
.video-play-btn-large::after {
    content: '';
    width: 0; height: 0;
    margin-left: 6px;
    border-style: solid;
    border-width: 12px 0 12px 20px;
    border-color: transparent transparent transparent #333;
}
.video-poster-overlay:hover .video-play-btn-large {
    transform: scale(1.08);
    background: rgba(255,255,255,0.95);
}
.video-controls-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: linear-gradient(transparent, rgba(0,0,0,0.8));
    padding: 8px 10px 6px;
    z-index: 10;
    transition: opacity 0.3s ease;
    opacity: 1;
}
.video-controls-bar.hidden {
    opacity: 0;
    pointer-events: none;
}
.video-progress-wrap {
    position: relative;
    width: 100%;
    height: 24px;
    cursor: pointer;
    margin-bottom: 0;
}
.video-progress-wrap::before {
    content: '';
    position: absolute;
    top: 10px; left: 0; right: 0;
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    pointer-events: none;
}
.video-progress-wrap:hover::before {
    top: 8px;
    height: 8px;
}
.video-progress-buffered {
    position: absolute;
    top: 10px; left: 0;
    height: 4px;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
    width: 0;
    pointer-events: none;
}
.video-progress-played {
    position: absolute;
    top: 10px; left: 0;
    height: 4px;
    background: #4CAF50;
    border-radius: 2px;
    width: 0;
    pointer-events: none;
}
.video-progress-wrap:hover .video-progress-buffered,
.video-progress-wrap:hover .video-progress-played { top: 8px; height: 8px; }
.video-progress-handle {
    position: absolute;
    top: 50%;
    left: 0;
    width: 12px; height: 12px;
    background: #4CAF50;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    cursor: grab;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 2;
}
.video-progress-wrap:hover .video-progress-handle,
.video-progress-handle.dragging {
    opacity: 1;
}
.video-progress-tooltip {
    position: absolute;
    bottom: calc(100% + 4px);
    transform: translateX(-50%);
    background: rgba(0,0,0,0.8);
    color: #fff;
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
    z-index: 3;
}
.video-progress-wrap:hover .video-progress-tooltip.show {
    opacity: 1;
}
.video-controls-row {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-size: 13px;
}
.video-controls-row button {
    background: none;
    border: none;
    color: #fff;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    transition: background 0.2s ease;
}
.video-controls-row button:hover {
    background: rgba(255,255,255,0.2);
}
.video-time {
    font-variant-numeric: tabular-nums;
    min-width: 80px;
    user-select: none;
}
.video-volume-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
}
.video-volume-slider {
    width: 60px;
    height: 24px;
    cursor: pointer;
    accent-color: #4CAF50;
}
.video-speed-wrap {
    position: relative;
}
.video-speed-menu {
    position: absolute;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(30,30,30,0.95);
    border-radius: 6px;
    padding: 4px 0;
    min-width: 72px;
    box-sizing: border-box;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    display: none;
    flex-direction: column;
    z-index: 20;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.video-speed-menu.open {
    display: flex;
}
.video-speed-menu > button {
    flex-shrink: 0;
    padding: 6px 12px;
    font-size: 12px;
    color: #fff;
    cursor: pointer;
    text-align: center;
    transition: background 0.15s ease;
}
.video-speed-menu > button:hover,
.video-speed-menu > button.active {
    background: rgba(76,175,80,0.3);
}
.fullscreen-video-overlay {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: #000;
    z-index: 99999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    animation: videoFadeIn 0.25s ease;
}
@keyframes videoFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
.fullscreen-video-overlay .fs-video-close {
    position: absolute;
    top: 16px; right: 16px;
    width: 44px; height: 44px;
    background: rgba(255,255,255,0.1);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: 22px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
    transition: background 0.2s ease;
}
.fullscreen-video-overlay .fs-video-close:hover {
    background: rgba(255,255,255,0.25);
}
.fullscreen-video-overlay video {
    width: 100vw;
    height: 100vh;
    object-fit: contain;
}
.fullscreen-video-overlay .video-controls-bar {
    padding: 12px 16px 10px;
    font-size: 15px;
}
.fullscreen-video-overlay .video-controls-row button {
    font-size: 16px;
    padding: 6px 10px;
    min-width: 32px;
}
.fullscreen-video-overlay .video-progress-wrap {
    margin-bottom: 0;
}
.fullscreen-video-overlay .video-volume-slider {
    width: 80px;
}

.video-controls-bar:focus-within { opacity: 1; pointer-events: auto; }
.video-progress-wrap:focus-visible,
.video-controls-row button:focus-visible,
.video-volume-slider:focus-visible,
.fullscreen-video-overlay .fs-video-close:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
.video-progress-wrap:focus-visible .video-progress-handle { opacity: 1; }
.video-speed-menu > button { width: 100%; }
@media (prefers-reduced-motion: reduce) {
    .fullscreen-video-overlay { animation: none; }
    .video-controls-bar, .video-progress-wrap, .video-progress-handle,
    .video-controls-row button, .video-speed-menu > button, .video-poster-overlay { transition: none; }
}
@media (forced-colors: active) {
    .video-controls-bar, .video-speed-menu { background: Canvas; color: CanvasText; }
    .video-controls-row button { color: CanvasText; }
    .video-progress-wrap:focus-visible, .video-controls-row button:focus-visible,
    .video-volume-slider:focus-visible, .fullscreen-video-overlay .fs-video-close:focus-visible { outline-color: Highlight; }
    .video-speed-menu > button[aria-pressed="true"] { outline: 1px solid Highlight; }
}

@media (max-width: 480px) {
    .fullscreen-video-overlay .video-controls-row { gap: 6px; }
    .fullscreen-video-overlay .video-controls-row button { padding: 6px; }
    .fullscreen-video-overlay .video-volume-slider { width: 48px; }
    .fullscreen-video-overlay .video-time { min-width: 64px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}

@container ranking-video (max-width: 360px) {
    .video-controls-row { gap: 4px; }
    .video-controls-row button { padding: 4px; min-width: 24px; min-height: 24px; }
    .video-volume-slider { width: 40px; }
    .video-time { min-width: 0; flex: 1 1 60px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
}
`;
    document.head.appendChild(style);
}

// ==========================================
// 🔧 辅助函数
// ==========================================
function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function getVolumeIcon(volume, muted) {
    if (muted || volume <= 0) return '🔇';
    if (volume < 0.3) return '🔈';
    if (volume < 0.7) return '🔉';
    return '🔊';
}

function getPlayIcon(isPlaying) {
    return isPlaying ? '⏸' : '▶';
}

// ==========================================
// 🔧 模块级共享辅助函数（内嵌+全屏播放器共用）
// ==========================================

/**
 * 更新播放按钮标志与 tooltip
 * @param {HTMLElement} btnPlay
 * @param {HTMLVideoElement} video
 */
function _updatePlayButton(btnPlay, video) {
    if (!btnPlay) return;
    const playing = !video.paused && !video.ended;
    btnPlay.textContent = getPlayIcon(playing);
    btnPlay.title = playing ? t('video.pause') : t('video.play');
    btnPlay.setAttribute('aria-label', btnPlay.title);
}

/**
 * 更新进度条 UI
 * @param {HTMLElement} progressPlayed
 * @param {HTMLElement} progressHandle
 * @param {HTMLElement} timeDisplay
 * @param {HTMLVideoElement} video
 */
function _updateProgressUI(progressPlayed, progressHandle, timeDisplay, video) {
    if (!video.duration || !isFinite(video.duration)) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (progressPlayed) progressPlayed.style.width = pct + '%';
    if (progressHandle) progressHandle.style.left = pct + '%';
    if (timeDisplay) timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
}

/**
 * 更新缓冲进度
 * @param {HTMLElement} progressBuffered
 * @param {HTMLVideoElement} video
 */
function _updateBuffered(progressBuffered, video) {
    if (!video.buffered || !video.duration || !progressBuffered) return;
    let end = 0;
    for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
            end = Math.max(end, video.buffered.end(i));
        }
    }
    progressBuffered.style.width = ((end / video.duration) * 100) + '%';
}

/**
 * 更新音量图标
 * @param {HTMLElement} btnVolume
 * @param {HTMLVideoElement} video
 */
function _updateVolumeIcon(btnVolume, video) {
    if (!btnVolume) return;
    btnVolume.textContent = getVolumeIcon(video.volume, video.muted);
    btnVolume.setAttribute('aria-label', video.muted ? t('video.unmute') : t('video.mute'));
}

// ==========================================
let videoControlsId = 0;

function setupAccessibleVideoControls(scope, video, showControls) {
    const progress = scope.querySelector('.video-progress-wrap');
    const volume = scope.querySelector('.video-volume-slider');
    const speed = scope.querySelector('.video-btn-speed');
    const choices = scope.querySelector('.video-speed-menu');
    const releases = [];
    let active = true;
    const current = () => active && scope.isConnected;
    const listen = (target, type, handler) => {
        if (!target) return;
        target.addEventListener(type, handler);
        releases.push(() => target.removeEventListener(type, handler));
    };
    const plainKey = event => !event.defaultPrevented && !event.isComposing
        && event.keyCode !== 229 && !event.ctrlKey && !event.metaKey
        && !event.altKey && !event.shiftKey;
    const closeChoices = restore => {
        choices?.classList.remove('open');
        speed?.setAttribute('aria-expanded', 'false');
        if (restore && current()) speed?.focus();
    };
    const layoutChoices = preserveScroll => {
        if (!current() || !choices?.classList.contains('open')) return;
        const previousScroll = choices.scrollTop;
        choices.style.top = '';
        choices.style.bottom = '';
        choices.style.left = '';
        choices.style.maxHeight = '';
        const parentElement = choices.offsetParent;
        if (!parentElement) return;
        const bounds = scope.getBoundingClientRect();
        if (bounds.width <= 0 || bounds.height <= 0) return;
        const menu = choices.getBoundingClientRect();
        const parent = parentElement.getBoundingClientRect();
        const availableAbove = menu.bottom - bounds.top - 4;
        if (availableAbove >= 64) {
            choices.style.maxHeight = `${Math.min(menu.height, availableAbove)}px`;
        } else {
            choices.style.bottom = 'auto';
            choices.style.top = `${bounds.top + 4 - parent.top}px`;
            choices.style.maxHeight = `${Math.max(0, bounds.height - 8)}px`;
        }
        const left = Math.max(bounds.left + 4, Math.min(menu.left, bounds.right - menu.width - 4));
        choices.style.left = `${left - parent.left + menu.width / 2}px`;
        if (preserveScroll) choices.scrollTop = previousScroll;
        else {
            const selected = choices.querySelector('[aria-pressed="true"]');
            choices.scrollTop = selected ? selected.offsetTop - (choices.clientHeight - selected.offsetHeight) / 2 : 0;
        }
    };
    const syncRate = () => {
        if (!current() || !speed || !choices) return;
        speed.textContent = video.playbackRate + 'x';
        speed.setAttribute('aria-label', `${t('video.speed')} ${video.playbackRate}x`);
        choices.querySelectorAll('button[data-speed]').forEach(option => {
            const selected = Number(option.dataset.speed) === video.playbackRate;
            option.classList.toggle('active', selected);
            option.setAttribute('aria-pressed', String(selected));
        });
    };
    if (volume) volume.setAttribute('aria-label', t('video.volume'));
    if (speed && choices) {
        choices.id = `ranking-video-speed-${++videoControlsId}`;
        choices.setAttribute('role', 'group');
        choices.setAttribute('aria-label', t('video.speed'));
        speed.setAttribute('aria-controls', choices.id);
        speed.setAttribute('aria-expanded', 'false');
        listen(speed, 'click', event => {
            event.stopPropagation();
            if (!current()) return;
            const open = choices.classList.toggle('open');
            speed.setAttribute('aria-expanded', String(open));
            if (open) layoutChoices(false);
        });
        choices.querySelectorAll('button[data-speed]').forEach(option => {
            listen(option, 'click', event => {
                event.stopPropagation();
                if (!current()) return;
                video.playbackRate = Number(option.dataset.speed);
                syncRate();
                closeChoices(true);
            });
        });
        const resize = new ResizeObserver(() => layoutChoices(true));
        resize.observe(scope);
        releases.push(() => resize.disconnect());
        listen(video, 'ratechange', syncRate);
        listen(scope, 'keydown', event => {
            if (!current() || !plainKey(event) || event.key !== 'Escape'
                    || !choices.classList.contains('open')
                    || !(choices.contains(event.target) || speed.contains(event.target))) return;
            event.preventDefault();
            event.stopPropagation();
            closeChoices(true);
        });
        listen(document, 'click', event => {
            if (current() && !choices.contains(event.target) && !speed.contains(event.target)) closeChoices(false);
        });
        listen(scope, 'focusout', event => {
            if (!choices.contains(event.relatedTarget) && !speed.contains(event.relatedTarget)) closeChoices(false);
        });
        syncRate();
    }
    const syncProgress = () => {
        if (!current() || !progress) return;
        const available = Number.isFinite(video.duration) && video.duration > 0;
        const duration = available ? video.duration : 1;
        const time = Number.isFinite(video.currentTime) ? Math.max(0, Math.min(duration, video.currentTime)) : 0;
        progress.setAttribute('aria-valuemax', String(duration));
        progress.setAttribute('aria-valuenow', String(time));
        progress.setAttribute('aria-valuetext', `${formatTime(time)} / ${formatTime(available ? duration : 0)}`);
        progress.setAttribute('aria-disabled', String(!available));
    };
    if (progress) {
        progress.setAttribute('role', 'slider');
        progress.tabIndex = 0;
        progress.setAttribute('aria-label', t('video.progress'));
        progress.setAttribute('aria-valuemin', '0');
        listen(progress, 'keydown', event => {
            if (!current() || event.target !== progress || !plainKey(event)
                    || !Number.isFinite(video.duration) || video.duration <= 0) return;
            const time = Number.isFinite(video.currentTime) ? video.currentTime : 0;
            let target;
            if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target = time + 5;
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target = time - 5;
            else if (event.key === 'Home') target = 0;
            else if (event.key === 'End') target = video.duration;
            else return;
            event.preventDefault();
            event.stopPropagation();
            video.currentTime = Math.max(0, Math.min(video.duration, target));
            _updateProgressUI(scope.querySelector('.video-progress-played'), scope.querySelector('.video-progress-handle'), scope.querySelector('.video-time'), video);
            syncProgress();
            showControls();
        });
        for (const type of ['loadedmetadata', 'durationchange', 'timeupdate']) listen(video, type, syncProgress);
        syncProgress();
    }
    listen(scope, 'focusin', () => { if (current()) showControls(); });
    return () => {
        active = false;
        for (const release of releases) release();
        closeChoices(false);
    };
}

// 📺 Part 1: 内嵌播放器
// ==========================================

/**
 * 生成视频播放器 HTML
 * @param {string} videoUrl - 视频地址
 * @param {string} posterUrl - 封面图地址
 * @param {Object} options - 可选配置
 * @returns {string} HTML 字符串
 */
export function getVideoPlayerHTML(videoUrl, posterUrl, options = {}) {
    injectVideoPlayerStyles();
    const safeVideo = (videoUrl || '').replace(/"/g, '&quot;');
    const safePoster = (posterUrl || '').replace(/"/g, '&quot;');

    return `
<div class="video-player-container" data-video-url="${safeVideo}" data-poster-url="${safePoster}">
  <video preload="metadata" poster="${safePoster}" playsinline>
    <source src="${safeVideo}">
  </video>
  <div class="video-poster-overlay">
    <img src="${safePoster}" alt="" draggable="false" />
    <div class="video-play-btn-large"></div>
  </div>
  <div class="video-controls-bar">
    <div class="video-progress-wrap">
      <div class="video-progress-buffered"></div>
      <div class="video-progress-played"></div>
      <div class="video-progress-handle"></div>
      <div class="video-progress-tooltip">0:00</div>
    </div>
    <div class="video-controls-row">
      <button type="button" class="video-btn-play" title="${t('video.play')}">${getPlayIcon(false)}</button>
      <span class="video-time">0:00 / 0:00</span>
      <div class="video-volume-wrap">
        <button type="button" class="video-btn-volume" title="${t('video.volume')}">🔊</button>
        <input type="range" class="video-volume-slider" min="0" max="100" value="100">
      </div>
      <div class="video-speed-wrap">
        <button type="button" class="video-btn-speed" title="${t('video.speed')}">1x</button>
        <div class="video-speed-menu">
          <button type="button" data-speed="0.5">0.5x</button>
          <button type="button" data-speed="1" class="active">1x</button>
          <button type="button" data-speed="1.25">1.25x</button>
          <button type="button" data-speed="1.5">1.5x</button>
          <button type="button" data-speed="2">2x</button>
        </div>
      </div>
      <button type="button" class="video-btn-fullscreen" title="${t('video.fullscreen')}" aria-label="${t('video.fullscreen')}">⛶</button>
    </div>
  </div>
</div>
`;
}

/**
 * 设置视频播放器事件
 * @param {HTMLElement} container - 包含 .video-player-container 的容器
 */
export function setupVideoPlayerEvents(container) {
    const player = container.querySelector('.video-player-container');
    const video = player?.querySelector('video');
    if (container._videoPlayerCleanup) {
        container._videoPlayerCleanup(video);
        container._videoPlayerCleanup = null;
    }
    if (!player) return;
    const posterOverlay = player.querySelector('.video-poster-overlay');
    const controlsBar = player.querySelector('.video-controls-bar');
    const progressWrap = player.querySelector('.video-progress-wrap');
    const progressBuffered = player.querySelector('.video-progress-buffered');
    const progressPlayed = player.querySelector('.video-progress-played');
    const progressHandle = player.querySelector('.video-progress-handle');
    const progressTooltip = player.querySelector('.video-progress-tooltip');
    const btnPlay = player.querySelector('.video-btn-play');
    const btnVolume = player.querySelector('.video-btn-volume');
    const volumeSlider = player.querySelector('.video-volume-slider');
    const btnSpeed = player.querySelector('.video-btn-speed');
    const speedMenu = player.querySelector('.video-speed-menu');
    const btnFullscreen = player.querySelector('.video-btn-fullscreen');
    const timeDisplay = player.querySelector('.video-time');

    if (!video) return;
    const source = video.querySelector('source');
    if (source && !source.hasAttribute('src') && player.dataset.videoUrl) {
        source.setAttribute('src', player.dataset.videoUrl);
        video.load();
    }
    const listeners = new AbortController();
    let active = true;
    const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });

    // 设置按钮文字（fallback）
    if (btnPlay) btnPlay.title = t('video.play');
    if (btnVolume) btnVolume.title = t('video.volume');
    if (btnSpeed) btnSpeed.title = t('video.speed');
    if (btnFullscreen) btnFullscreen.title = t('video.fullscreen');

    let isDraggingProgress = false;
    let wasPlayingBeforeDrag = false;
    let hideControlsTimer = null;
    let hidePosterTimer = null;
    let isFullscreenMode = false;

    // 共享辅助函数（闭包适配）
    const updatePlayButton = () => _updatePlayButton(btnPlay, video);
    const updateProgressUI = () => _updateProgressUI(progressPlayed, progressHandle, timeDisplay, video);
    const updateBuffered   = () => _updateBuffered(progressBuffered, video);
    const updateVolumeIcon = () => _updateVolumeIcon(btnVolume, video);

    // 控制栏自动隐藏
    function showControls() {
        if (!controlsBar) return;
        controlsBar.classList.remove('hidden');
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        if (!video.paused && !video.ended) {
            hideControlsTimer = setTimeout(() => {
                if (!video.paused && !video.ended) {
                    controlsBar.classList.add('hidden');
                }
            }, 3000);
        }
    }

    function resetHideTimer() {
        showControls();
    }

    // Seek 到指定比例
    function seekToRatio(ratio) {
        if (!video.duration || !isFinite(video.duration)) return;
        ratio = Math.max(0, Math.min(1, ratio));
        video.currentTime = ratio * video.duration;
    }

    // 获取点击/鼠标位置对应的比例
    function getRatioFromEvent(e, element) {
        const rect = element.getBoundingClientRect();
        const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    // 播放/暂停切换
    function togglePlay() {
        if (video.paused || video.ended) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    }

    // ===== 事件绑定 =====

    // 1. 封面层点击
    if (posterOverlay) {
        listen(posterOverlay, 'click', () => {
            video.play().catch(() => {});
        });
    }

    // 2. 视频区域点击
    listen(video, 'click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 3. 播放/暂停按钮
    if (btnPlay) {
        listen(btnPlay, 'click', (e) => {
            e.stopPropagation();
            togglePlay();
        });
    }

    // 4. 进度条交互
    listen(video, 'timeupdate', () => {
        if (!isDraggingProgress) updateProgressUI();
    });
    listen(video, 'progress', updateBuffered);
    listen(video, 'loadedmetadata', () => {
        updateProgressUI();
        updateBuffered();
    });

    if (progressWrap) {
        // 点击进度条
        listen(progressWrap, 'click', (e) => {
            if (isDraggingProgress) return;
            e.stopPropagation();
            seekToRatio(getRatioFromEvent(e, progressWrap));
        });

        // 进度条 hover tooltip
        listen(progressWrap, 'mousemove', (e) => {
            if (!video.duration || !isFinite(video.duration)) return;
            const ratio = getRatioFromEvent(e, progressWrap);
            const time = ratio * video.duration;
            if (progressTooltip) {
                progressTooltip.textContent = formatTime(time);
                progressTooltip.style.left = (ratio * 100) + '%';
                progressTooltip.classList.add('show');
            }
        });
        listen(progressWrap, 'mouseleave', () => {
            if (progressTooltip) progressTooltip.classList.remove('show');
        });

        // 拖拽把手
        if (progressHandle) {
            listen(progressHandle, 'mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isDraggingProgress = true;
                progressHandle.classList.add('dragging');
                wasPlayingBeforeDrag = !video.paused && !video.ended;
                if (wasPlayingBeforeDrag) video.pause();
            });
        }
        // 在进度条任意位置按下也可以拖拽
        listen(progressWrap, 'mousedown', (e) => {
            if (e.target === progressHandle) return;
            isDraggingProgress = true;
            if (progressHandle) progressHandle.classList.add('dragging');
            wasPlayingBeforeDrag = !video.paused && !video.ended;
            if (wasPlayingBeforeDrag) video.pause();
            const ratio = getRatioFromEvent(e, progressWrap);
            seekToRatio(ratio);
            if (progressPlayed) progressPlayed.style.width = (ratio * 100) + '%';
            if (progressHandle) progressHandle.style.left = (ratio * 100) + '%';
        });
    }

    const handleMouseMove = (e) => {
        if (!isDraggingProgress || !progressWrap) return;
        const ratio = getRatioFromEvent(e, progressWrap);
        seekToRatio(ratio);
        if (progressPlayed) progressPlayed.style.width = (ratio * 100) + '%';
        if (progressHandle) progressHandle.style.left = (ratio * 100) + '%';
        if (progressTooltip) {
            progressTooltip.textContent = formatTime(video.currentTime);
            progressTooltip.style.left = (ratio * 100) + '%';
            progressTooltip.classList.add('show');
        }
    };

    const handleMouseUp = () => {
        if (!isDraggingProgress) return;
        isDraggingProgress = false;
        if (progressHandle) progressHandle.classList.remove('dragging');
        if (progressTooltip) progressTooltip.classList.remove('show');
        if (wasPlayingBeforeDrag) video.play().catch(() => {});
    };

    listen(window, 'mousemove', handleMouseMove);
    listen(window, 'mouseup', handleMouseUp);

    // 5. 音量控制
    if (volumeSlider) {
        listen(volumeSlider, 'input', () => {
            const val = parseInt(volumeSlider.value, 10) / 100;
            video.volume = val;
            if (val > 0 && video.muted) video.muted = false;
            updateVolumeIcon();
        });
    }
    if (btnVolume) {
        listen(btnVolume, 'click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            updateVolumeIcon();
        });
    }

    const cleanupAccessibleControls = setupAccessibleVideoControls(player, video, showControls);

    // 7. 全屏按钮
    if (btnFullscreen) {
        listen(btnFullscreen, 'click', (e) => {
            e.stopPropagation();
            const currentTime = video.currentTime;
            video.pause(); // 先暂停内嵌播放器，避免与全屏播放器同时出声
            openFullscreenVideo(
                player.dataset.videoUrl || '',
                player.dataset.posterUrl || '',
                {
                    signal: listeners.signal,
                    currentTime,
                    volume: video.volume,
                    muted: video.muted,
                    playbackRate: video.playbackRate,
                    onClose: (returnTime) => {
                        if (!active || !player.isConnected) return;
                        video.currentTime = returnTime;
                        updateProgressUI();
                        updatePlayButton(); // 同步播放按钮状态为暂停
                    }
                }
            );
        });
    }

    // 9. 控制栏自动隐藏
    listen(player, 'mousemove', resetHideTimer);
    listen(player, 'mouseenter', resetHideTimer);
    listen(video, 'play', showControls);
    listen(video, 'pause', showControls);
    listen(video, 'ended', () => {
        if (controlsBar) controlsBar.classList.remove('hidden');
    });

    // 10. 拖拽防冒泡
    const stopDrag = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };
    listen(player, 'dragstart', stopDrag);
    listen(player, 'dragover', stopDrag);
    listen(player, 'drop', stopDrag);

    // 11. 视频结束回到封面
    listen(video, 'ended', () => {
        if (posterOverlay) {
            posterOverlay.style.display = 'flex';
            posterOverlay.style.opacity = '1';
        }
        updatePlayButton();
    });

    // 播放时隐藏封面
    listen(video, 'play', () => {
        if (posterOverlay) {
            posterOverlay.style.opacity = '0';
            if (hidePosterTimer) clearTimeout(hidePosterTimer);
            hidePosterTimer = setTimeout(() => {
                hidePosterTimer = null;
                if (active && !video.paused) posterOverlay.style.display = 'none';
            }, 300);
        }
        updatePlayButton();
        showControls();
    });

    listen(video, 'pause', () => {
        updatePlayButton();
    });

    // 初始状态
    updateVolumeIcon();
    updatePlayButton();

    // 🔧 清理函数注册
    const cleanup = (replacementVideo) => {
        if (!active) return;
        active = false;
        listeners.abort();
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        if (hidePosterTimer) clearTimeout(hidePosterTimer);
        hideControlsTimer = hidePosterTimer = null;
        isDraggingProgress = false;
        cleanupAccessibleControls();
        if (replacementVideo === video) video.pause();
        else releaseVideoMedia(video);
        updatePlayButton();
    };
    container._videoPlayerCleanup = cleanup;
}

/**
 * 清理视频播放器
 * @param {HTMLElement} container - 包含 .video-player-container 的容器
 */
export function cleanupVideoPlayer(container) {
    if (container && container._videoPlayerCleanup) {
        container._videoPlayerCleanup();
        container._videoPlayerCleanup = null;
    }
}

// ==========================================
// 📺 Part 2: 全屏播放器
// ==========================================

/**
 * 打开全屏视频播放器
 * @param {string} videoUrl - 视频地址
 * @param {string} posterUrl - 封面图地址
 * @param {Object} options - 可选配置
 * @param {number} options.currentTime - 起始播放时间
 * @param {number} options.volume - 初始音量
 * @param {boolean} options.muted - 是否静音
 * @param {number} options.playbackRate - 播放速度
 * @param {Function} options.onClose - 关闭回调(currentTime)
 * @param {AbortSignal} options.signal - 所属页面的关闭信号
 */
export function openFullscreenVideo(videoUrl, posterUrl, options = {}) {
    if (options.signal?.aborted) return;
    injectVideoPlayerStyles();

    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-video-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', t('video.fullscreen'));

    const safeVideo = (videoUrl || '').replace(/"/g, '&quot;');
    const safePoster = (posterUrl || '').replace(/"/g, '&quot;');
    const startTime = options.currentTime || 0;
    const startVolume = typeof options.volume === 'number' ? options.volume : 1;
    const startMuted = !!options.muted;
    const startRate = options.playbackRate || 1;

    overlay.innerHTML = `
    <button type="button" class="fs-video-close" title="${t('video.close')}" aria-label="${t('video.close')}">✕</button>
    <video preload="metadata" poster="${safePoster}" playsinline
        style="width:100vw;height:100vh;object-fit:contain;">
      <source src="${safeVideo}">
    </video>
    <div class="video-controls-bar">
      <div class="video-progress-wrap">
        <div class="video-progress-buffered"></div>
        <div class="video-progress-played"></div>
        <div class="video-progress-handle"></div>
        <div class="video-progress-tooltip">0:00</div>
      </div>
      <div class="video-controls-row">
        <button type="button" class="video-btn-play" title="${t('video.play')}">▶</button>
        <span class="video-time">0:00 / 0:00</span>
        <div class="video-volume-wrap">
          <button type="button" class="video-btn-volume" title="${t('video.volume')}">🔊</button>
          <input type="range" class="video-volume-slider" min="0" max="100" value="100">
        </div>
        <div class="video-speed-wrap">
          <button type="button" class="video-btn-speed" title="${t('video.speed')}">1x</button>
          <div class="video-speed-menu">
            <button type="button" data-speed="0.5">0.5x</button>
            <button type="button" data-speed="1" class="active">1x</button>
            <button type="button" data-speed="1.25">1.25x</button>
            <button type="button" data-speed="1.5">1.5x</button>
            <button type="button" data-speed="2">2x</button>
          </div>
        </div>
        <button type="button" class="video-btn-fullscreen" title="${t('video.exit_fullscreen')}" aria-label="${t('video.exit_fullscreen')}">⛶</button>
      </div>
    </div>
  `;

    document.body.appendChild(overlay);

    const video = overlay.querySelector('video');
    const closeBtn = overlay.querySelector('.fs-video-close');
    const posterOverlay = null; // 全屏模式不需要封面层

    // 初始化视频状态
    video.currentTime = startTime;
    video.volume = startVolume;
    video.muted = startMuted;
    video.playbackRate = startRate;

    // 复用内嵌播放器的事件绑定逻辑
    const controlsBar = overlay.querySelector('.video-controls-bar');
    const progressWrap = overlay.querySelector('.video-progress-wrap');
    const progressBuffered = overlay.querySelector('.video-progress-buffered');
    const progressPlayed = overlay.querySelector('.video-progress-played');
    const progressHandle = overlay.querySelector('.video-progress-handle');
    const progressTooltip = overlay.querySelector('.video-progress-tooltip');
    const btnPlay = overlay.querySelector('.video-btn-play');
    const btnVolume = overlay.querySelector('.video-btn-volume');
    const volumeSlider = overlay.querySelector('.video-volume-slider');
    const btnSpeed = overlay.querySelector('.video-btn-speed');
    const speedMenu = overlay.querySelector('.video-speed-menu');
    const btnFullscreen = overlay.querySelector('.video-btn-fullscreen');
    const timeDisplay = overlay.querySelector('.video-time');

    if (volumeSlider) volumeSlider.value = Math.round(startVolume * 100);
    if (btnSpeed) btnSpeed.textContent = startRate + 'x';

    let isDraggingProgress = false;
    let wasPlayingBeforeDrag = false;
    let hideControlsTimer = null;
    const listeners = new AbortController();
    const listen = (target, type, handler) => target.addEventListener(type, handler, { signal: listeners.signal });
    let destroyed = false, finished = false, closeTimer = null;
    let finalTime = 0, restoreFocus = false;

    function finishClose() {
        if (finished) return;
        finished = true;
        if (closeTimer) clearTimeout(closeTimer);
        closeTimer = null;
        options.signal?.removeEventListener('abort', handleOwnerAbort);
        overlay.remove();
        if (options.signal?.aborted) return;
        if (typeof options.onClose === 'function') options.onClose(finalTime);
        if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected
                && (document.activeElement === document.body || overlay.contains(document.activeElement))) previousFocus.focus();
    }

    function handleOwnerAbort() {
        if (destroyed) finishClose();
        else destroy(video.currentTime);
    }

    function destroy(returnTime) {
        if (destroyed) return;
        destroyed = true;
        finalTime = typeof returnTime === 'number' ? returnTime : video.currentTime;
        restoreFocus = !options.signal?.aborted && (overlay.contains(document.activeElement) || document.activeElement === document.body);
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        listeners.abort();
        cleanupAccessibleControls();
        releaseVideoMedia(video);

        if (document.fullscreenElement === overlay) {
            try { Promise.resolve(document.exitFullscreen()).catch(() => {}); } catch {}
        }

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        overlay.style.transition = reducedMotion ? 'none' : 'opacity 0.25s ease';
        overlay.style.opacity = '0';
        if (options.signal?.aborted) finishClose();
        else closeTimer = setTimeout(finishClose, reducedMotion ? 0 : 250);
    }

    function updatePlayButton() {
        _updatePlayButton(btnPlay, video);
    }

    function updateProgressUI() {
        _updateProgressUI(progressPlayed, progressHandle, timeDisplay, video);
    }

    function updateBuffered() {
        _updateBuffered(progressBuffered, video);
    }

    function updateVolumeIcon() {
        _updateVolumeIcon(btnVolume, video);
    }

    function showControls() {
        if (!controlsBar) return;
        controlsBar.classList.remove('hidden');
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        if (!video.paused && !video.ended) {
            hideControlsTimer = setTimeout(() => {
                if (!video.paused && !video.ended) controlsBar.classList.add('hidden');
            }, 3000);
        }
    }

    function resetHideTimer() {
        showControls();
    }

    function seekToRatio(ratio) {
        if (!video.duration || !isFinite(video.duration)) return;
        ratio = Math.max(0, Math.min(1, ratio));
        video.currentTime = ratio * video.duration;
    }

    function getRatioFromEvent(e, element) {
        const rect = element.getBoundingClientRect();
        const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    function togglePlay() {
        if (video.paused || video.ended) {
            video.play().catch(() => {});
        } else {
            video.pause();
        }
    }

    // 播放/暂停按钮
    listen(btnPlay, 'click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 视频点击切换
    listen(video, 'click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 进度条
    listen(video, 'timeupdate', () => {
        if (!isDraggingProgress) updateProgressUI();
    });
    listen(video, 'progress', updateBuffered);
    listen(video, 'loadedmetadata', () => {
        updateProgressUI();
        updateBuffered();
    });

    listen(progressWrap, 'click', (e) => {
        if (isDraggingProgress) return;
        e.stopPropagation();
        seekToRatio(getRatioFromEvent(e, progressWrap));
    });

    listen(progressWrap, 'mousemove', (e) => {
        if (!video.duration || !isFinite(video.duration)) return;
        const ratio = getRatioFromEvent(e, progressWrap);
        if (progressTooltip) {
            progressTooltip.textContent = formatTime(ratio * video.duration);
            progressTooltip.style.left = (ratio * 100) + '%';
            progressTooltip.classList.add('show');
        }
    });
    listen(progressWrap, 'mouseleave', () => {
        if (progressTooltip) progressTooltip.classList.remove('show');
    });

    listen(progressHandle, 'mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isDraggingProgress = true;
        progressHandle.classList.add('dragging');
        wasPlayingBeforeDrag = !video.paused && !video.ended;
        if (wasPlayingBeforeDrag) video.pause();
    });
    listen(progressWrap, 'mousedown', (e) => {
        if (e.target === progressHandle) return;
        isDraggingProgress = true;
        progressHandle.classList.add('dragging');
        wasPlayingBeforeDrag = !video.paused && !video.ended;
        if (wasPlayingBeforeDrag) video.pause();
        const ratio = getRatioFromEvent(e, progressWrap);
        seekToRatio(ratio);
        progressPlayed.style.width = (ratio * 100) + '%';
        progressHandle.style.left = (ratio * 100) + '%';
    });

    const handleMouseMove = (e) => {
        if (!isDraggingProgress) return;
        const ratio = getRatioFromEvent(e, progressWrap);
        seekToRatio(ratio);
        progressPlayed.style.width = (ratio * 100) + '%';
        progressHandle.style.left = (ratio * 100) + '%';
        if (progressTooltip) {
            progressTooltip.textContent = formatTime(video.currentTime);
            progressTooltip.style.left = (ratio * 100) + '%';
            progressTooltip.classList.add('show');
        }
    };
    const handleMouseUp = () => {
        if (!isDraggingProgress) return;
        isDraggingProgress = false;
        progressHandle.classList.remove('dragging');
        if (progressTooltip) progressTooltip.classList.remove('show');
        if (wasPlayingBeforeDrag) video.play().catch(() => {});
    };
    listen(window, 'mousemove', handleMouseMove);
    listen(window, 'mouseup', handleMouseUp);

    // 音量
    listen(volumeSlider, 'input', () => {
        const val = parseInt(volumeSlider.value, 10) / 100;
        video.volume = val;
        if (val > 0 && video.muted) video.muted = false;
        updateVolumeIcon();
    });
    listen(btnVolume, 'click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        updateVolumeIcon();
    });

    const cleanupAccessibleControls = setupAccessibleVideoControls(overlay, video, showControls);

    // 全屏按钮（在全屏模式下退出全屏）
    listen(btnFullscreen, 'click', (e) => {
        e.stopPropagation();
        destroy(video.currentTime);
    });

    // 关闭按钮
    listen(closeBtn, 'click', () => destroy(video.currentTime));

    const handleKeydown = event => {
        if (!event.defaultPrevented && !event.isComposing && event.keyCode !== 229
                && !event.ctrlKey && !event.metaKey && !event.altKey && event.key === 'Tab') {
            const focusable = [...overlay.querySelectorAll('button, input, [tabindex]')]
                .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
            const first = focusable[0], last = focusable.at(-1);
            if (first && ((event.shiftKey && document.activeElement === first)
                    || (!event.shiftKey && document.activeElement === last))) {
                event.preventDefault();
                event.stopPropagation();
                (event.shiftKey ? last : first).focus();
            }
            return;
        }
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229
                || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
                || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        destroy(video.currentTime);
    };
    listen(overlay, 'keydown', handleKeydown);
    closeBtn.focus();

    // 控制栏自动隐藏
    listen(overlay, 'mousemove', resetHideTimer);
    listen(overlay, 'mouseenter', resetHideTimer);
    listen(video, 'play', showControls);
    listen(video, 'pause', showControls);
    listen(video, 'ended', () => {
        if (controlsBar) controlsBar.classList.remove('hidden');
    });

    // 播放/暂停状态更新
    listen(video, 'play', updatePlayButton);
    listen(video, 'pause', updatePlayButton);
    listen(video, 'ended', updatePlayButton);

    options.signal?.addEventListener('abort', handleOwnerAbort, { once: true });
    if (options.signal?.aborted) { handleOwnerAbort(); return; }

    // 尝试调用 Fullscreen API
    const requestFS = () => {
        if (overlay.requestFullscreen) {
            overlay.requestFullscreen().catch(() => {});
        } else if (overlay.webkitRequestFullscreen) {
            overlay.webkitRequestFullscreen();
        }
    };
    requestFS();

    // 自动播放
    video.play().catch(() => {});

    updateVolumeIcon();
    updatePlayButton();
    showControls();
}

// ==========================================
// 📦 默认导出
// ==========================================
export default {
    getVideoPlayerHTML,
    setupVideoPlayerEvents,
    cleanupVideoPlayer,
    openFullscreenVideo
};
