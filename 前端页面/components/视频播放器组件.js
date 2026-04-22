// 前端页面/components/视频播放器组件.js
// ==========================================
// 🎬 自定义视频播放器组件
// ==========================================
// 功能：内嵌视频播放 + 全屏沉浸式播放，支持自定义控制栏、键盘快捷键
// 接口：getVideoPlayerHTML / setupVideoPlayerEvents / cleanupVideoPlayer / openFullscreenVideo
// ==========================================

import { t } from './用户体验增强.js';

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
    height: 4px;
    background: rgba(255,255,255,0.2);
    border-radius: 2px;
    cursor: pointer;
    margin-bottom: 8px;
    transition: height 0.2s ease;
}
.video-progress-wrap:hover {
    height: 8px;
}
.video-progress-buffered {
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    background: rgba(255,255,255,0.3);
    border-radius: 2px;
    width: 0;
    pointer-events: none;
}
.video-progress-played {
    position: absolute;
    top: 0; left: 0;
    height: 100%;
    background: #4CAF50;
    border-radius: 2px;
    width: 0;
    pointer-events: none;
}
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
    bottom: 16px;
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
    min-width: 60px;
    display: none;
    flex-direction: column;
    z-index: 20;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
.video-speed-menu.open {
    display: flex;
}
.video-speed-menu > div {
    padding: 6px 12px;
    font-size: 12px;
    color: #fff;
    cursor: pointer;
    text-align: center;
    transition: background 0.15s ease;
}
.video-speed-menu > div:hover,
.video-speed-menu > div.active {
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
    margin-bottom: 10px;
}
.fullscreen-video-overlay .video-volume-slider {
    width: 80px;
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
<div class="video-player-container" data-video-url="${safeVideo}" data-poster-url="${safePoster}" tabindex="0">
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
      <button class="video-btn-play" title="${t('video.play') || '播放'}">${getPlayIcon(false)}</button>
      <span class="video-time">0:00 / 0:00</span>
      <div class="video-volume-wrap">
        <button class="video-btn-volume" title="${t('video.volume') || '音量'}">🔊</button>
        <input type="range" class="video-volume-slider" min="0" max="100" value="100">
      </div>
      <div class="video-speed-wrap">
        <button class="video-btn-speed" title="${t('video.speed') || '播放速度'}">1x</button>
        <div class="video-speed-menu">
          <div data-speed="0.5">0.5x</div>
          <div data-speed="1" class="active">1x</div>
          <div data-speed="1.25">1.25x</div>
          <div data-speed="1.5">1.5x</div>
          <div data-speed="2">2x</div>
        </div>
      </div>
      <button class="video-btn-fullscreen" title="${t('video.fullscreen') || '全屏'}">⛶</button>
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
    if (!player) return;

    const video = player.querySelector('video');
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

    // 设置按钮文字（fallback）
    if (btnPlay) btnPlay.title = t('video.play') || '播放';
    if (btnVolume) btnVolume.title = t('video.volume') || '音量';
    if (btnSpeed) btnSpeed.title = t('video.speed') || '播放速度';
    if (btnFullscreen) btnFullscreen.title = t('video.fullscreen') || '全屏';

    let isDraggingProgress = false;
    let wasPlayingBeforeDrag = false;
    let hideControlsTimer = null;
    let isFullscreenMode = false;

    // 更新播放按钮
    function updatePlayButton() {
        if (!btnPlay) return;
        const playing = !video.paused && !video.ended;
        btnPlay.textContent = getPlayIcon(playing);
        btnPlay.title = playing ? (t('video.pause') || '暂停') : (t('video.play') || '播放');
    }

    // 更新进度条 UI
    function updateProgressUI() {
        if (!video.duration || !isFinite(video.duration)) return;
        const pct = (video.currentTime / video.duration) * 100;
        if (progressPlayed) progressPlayed.style.width = pct + '%';
        if (progressHandle) progressHandle.style.left = pct + '%';
        if (timeDisplay) timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }

    // 更新缓冲进度
    function updateBuffered() {
        if (!video.buffered || !video.duration || !progressBuffered) return;
        let end = 0;
        for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
                end = Math.max(end, video.buffered.end(i));
            }
        }
        const pct = (end / video.duration) * 100;
        progressBuffered.style.width = pct + '%';
    }

    // 更新音量图标
    function updateVolumeIcon() {
        if (!btnVolume) return;
        btnVolume.textContent = getVolumeIcon(video.volume, video.muted);
    }

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
        posterOverlay.addEventListener('click', () => {
            video.play().catch(() => {});
        });
    }

    // 2. 视频区域点击
    video.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 3. 播放/暂停按钮
    if (btnPlay) {
        btnPlay.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePlay();
        });
    }

    // 4. 进度条交互
    video.addEventListener('timeupdate', () => {
        if (!isDraggingProgress) updateProgressUI();
    });
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('loadedmetadata', () => {
        updateProgressUI();
        updateBuffered();
    });

    if (progressWrap) {
        // 点击进度条
        progressWrap.addEventListener('click', (e) => {
            if (isDraggingProgress) return;
            e.stopPropagation();
            seekToRatio(getRatioFromEvent(e, progressWrap));
        });

        // 进度条 hover tooltip
        progressWrap.addEventListener('mousemove', (e) => {
            if (!video.duration || !isFinite(video.duration)) return;
            const ratio = getRatioFromEvent(e, progressWrap);
            const time = ratio * video.duration;
            if (progressTooltip) {
                progressTooltip.textContent = formatTime(time);
                progressTooltip.style.left = (ratio * 100) + '%';
                progressTooltip.classList.add('show');
            }
        });
        progressWrap.addEventListener('mouseleave', () => {
            if (progressTooltip) progressTooltip.classList.remove('show');
        });

        // 拖拽把手
        if (progressHandle) {
            progressHandle.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
                isDraggingProgress = true;
                progressHandle.classList.add('dragging');
                wasPlayingBeforeDrag = !video.paused && !video.ended;
                if (wasPlayingBeforeDrag) video.pause();
            });
        }
        // 在进度条任意位置按下也可以拖拽
        progressWrap.addEventListener('mousedown', (e) => {
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

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // 5. 音量控制
    if (volumeSlider) {
        volumeSlider.addEventListener('input', () => {
            const val = parseInt(volumeSlider.value, 10) / 100;
            video.volume = val;
            if (val > 0 && video.muted) video.muted = false;
            updateVolumeIcon();
        });
    }
    if (btnVolume) {
        btnVolume.addEventListener('click', (e) => {
            e.stopPropagation();
            video.muted = !video.muted;
            updateVolumeIcon();
        });
    }

    // 6. 播放速度
    function closeSpeedMenu() {
        if (speedMenu) speedMenu.classList.remove('open');
    }

    if (btnSpeed && speedMenu) {
        btnSpeed.addEventListener('click', (e) => {
            e.stopPropagation();
            speedMenu.classList.toggle('open');
        });
        speedMenu.querySelectorAll('div[data-speed]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(item.dataset.speed);
                video.playbackRate = speed;
                btnSpeed.textContent = speed + 'x';
                speedMenu.querySelectorAll('div').forEach(d => d.classList.remove('active'));
                item.classList.add('active');
                closeSpeedMenu();
            });
        });
    }
    const handleDocClickForSpeed = (e) => {
        if (speedMenu && !speedMenu.contains(e.target) && e.target !== btnSpeed) {
            closeSpeedMenu();
        }
    };
    document.addEventListener('click', handleDocClickForSpeed);

    // 7. 全屏按钮
    if (btnFullscreen) {
        btnFullscreen.addEventListener('click', (e) => {
            e.stopPropagation();
            const currentTime = video.currentTime;
            video.pause(); // 先暂停内嵌播放器，避免与全屏播放器同时出声
            openFullscreenVideo(
                player.dataset.videoUrl || '',
                player.dataset.posterUrl || '',
                {
                    currentTime,
                    volume: video.volume,
                    muted: video.muted,
                    playbackRate: video.playbackRate,
                    onClose: (returnTime) => {
                        video.currentTime = returnTime;
                        updateProgressUI();
                        updatePlayButton(); // 同步播放按钮状态为暂停
                    }
                }
            );
        });
    }

    // 8. 键盘快捷键
    const handleKeydown = (e) => {
        if (document.activeElement !== player) return;
        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.1);
                if (video.volume > 0) video.muted = false;
                if (volumeSlider) volumeSlider.value = Math.round(video.volume * 100);
                updateVolumeIcon();
                break;
            case 'ArrowDown':
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.1);
                if (volumeSlider) volumeSlider.value = Math.round(video.volume * 100);
                updateVolumeIcon();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                if (btnFullscreen) btnFullscreen.click();
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                video.muted = !video.muted;
                updateVolumeIcon();
                break;
        }
    };
    player.addEventListener('keydown', handleKeydown);

    // 点击播放器获取焦点
    player.addEventListener('click', () => {
        player.focus();
    });

    // 9. 控制栏自动隐藏
    player.addEventListener('mousemove', resetHideTimer);
    player.addEventListener('mouseenter', resetHideTimer);
    video.addEventListener('play', showControls);
    video.addEventListener('pause', showControls);
    video.addEventListener('ended', () => {
        if (controlsBar) controlsBar.classList.remove('hidden');
    });

    // 10. 拖拽防冒泡
    const stopDrag = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };
    player.addEventListener('dragstart', stopDrag);
    player.addEventListener('dragover', stopDrag);
    player.addEventListener('drop', stopDrag);

    // 11. 视频结束回到封面
    video.addEventListener('ended', () => {
        if (posterOverlay) {
            posterOverlay.style.display = 'flex';
            posterOverlay.style.opacity = '1';
        }
        updatePlayButton();
    });

    // 播放时隐藏封面
    video.addEventListener('play', () => {
        if (posterOverlay) {
            posterOverlay.style.opacity = '0';
            setTimeout(() => {
                if (!video.paused) posterOverlay.style.display = 'none';
            }, 300);
        }
        updatePlayButton();
        showControls();
    });

    video.addEventListener('pause', () => {
        updatePlayButton();
    });

    // 初始状态
    updateVolumeIcon();
    updatePlayButton();

    // 🔧 清理函数注册
    const cleanup = () => {
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('click', handleDocClickForSpeed);
        video.pause();
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
 */
export function openFullscreenVideo(videoUrl, posterUrl, options = {}) {
    injectVideoPlayerStyles();

    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-video-overlay';

    const safeVideo = (videoUrl || '').replace(/"/g, '&quot;');
    const safePoster = (posterUrl || '').replace(/"/g, '&quot;');
    const startTime = options.currentTime || 0;
    const startVolume = typeof options.volume === 'number' ? options.volume : 1;
    const startMuted = !!options.muted;
    const startRate = options.playbackRate || 1;

    overlay.innerHTML = `
    <button class="fs-video-close" title="${t('video.close') || '关闭'}">✕</button>
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
        <button class="video-btn-play" title="${t('video.play') || '播放'}">▶</button>
        <span class="video-time">0:00 / 0:00</span>
        <div class="video-volume-wrap">
          <button class="video-btn-volume" title="${t('video.volume') || '音量'}">🔊</button>
          <input type="range" class="video-volume-slider" min="0" max="100" value="100">
        </div>
        <div class="video-speed-wrap">
          <button class="video-btn-speed" title="${t('video.speed') || '播放速度'}">1x</button>
          <div class="video-speed-menu">
            <div data-speed="0.5">0.5x</div>
            <div data-speed="1" class="active">1x</div>
            <div data-speed="1.25">1.25x</div>
            <div data-speed="1.5">1.5x</div>
            <div data-speed="2">2x</div>
          </div>
        </div>
        <button class="video-btn-fullscreen" title="${t('video.exit_fullscreen') || '退出全屏'}">⛶</button>
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
    let destroyed = false;

    function destroy(returnTime) {
        if (destroyed) return;
        destroyed = true;
        if (hideControlsTimer) clearTimeout(hideControlsTimer);
        document.removeEventListener('keydown', handleKeydown);
        document.removeEventListener('click', handleDocClickForSpeed);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        video.pause();

        // 退出 Fullscreen API
        if (document.fullscreenElement) {
            try { document.exitFullscreen(); } catch (e) {}
        }

        overlay.style.transition = 'opacity 0.25s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            if (typeof options.onClose === 'function') {
                options.onClose(typeof returnTime === 'number' ? returnTime : video.currentTime);
            }
        }, 250);
    }

    function updatePlayButton() {
        if (!btnPlay) return;
        const playing = !video.paused && !video.ended;
        btnPlay.textContent = getPlayIcon(playing);
        btnPlay.title = playing ? (t('video.pause') || '暂停') : (t('video.play') || '播放');
    }

    function updateProgressUI() {
        if (!video.duration || !isFinite(video.duration)) return;
        const pct = (video.currentTime / video.duration) * 100;
        if (progressPlayed) progressPlayed.style.width = pct + '%';
        if (progressHandle) progressHandle.style.left = pct + '%';
        if (timeDisplay) timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
    }

    function updateBuffered() {
        if (!video.buffered || !video.duration || !progressBuffered) return;
        let end = 0;
        for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= video.currentTime && video.buffered.end(i) >= video.currentTime) {
                end = Math.max(end, video.buffered.end(i));
            }
        }
        progressBuffered.style.width = ((end / video.duration) * 100) + '%';
    }

    function updateVolumeIcon() {
        if (!btnVolume) return;
        btnVolume.textContent = getVolumeIcon(video.volume, video.muted);
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
    btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 视频点击切换
    video.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePlay();
    });

    // 进度条
    video.addEventListener('timeupdate', () => {
        if (!isDraggingProgress) updateProgressUI();
    });
    video.addEventListener('progress', updateBuffered);
    video.addEventListener('loadedmetadata', () => {
        updateProgressUI();
        updateBuffered();
    });

    progressWrap.addEventListener('click', (e) => {
        if (isDraggingProgress) return;
        e.stopPropagation();
        seekToRatio(getRatioFromEvent(e, progressWrap));
    });

    progressWrap.addEventListener('mousemove', (e) => {
        if (!video.duration || !isFinite(video.duration)) return;
        const ratio = getRatioFromEvent(e, progressWrap);
        if (progressTooltip) {
            progressTooltip.textContent = formatTime(ratio * video.duration);
            progressTooltip.style.left = (ratio * 100) + '%';
            progressTooltip.classList.add('show');
        }
    });
    progressWrap.addEventListener('mouseleave', () => {
        if (progressTooltip) progressTooltip.classList.remove('show');
    });

    progressHandle.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isDraggingProgress = true;
        progressHandle.classList.add('dragging');
        wasPlayingBeforeDrag = !video.paused && !video.ended;
        if (wasPlayingBeforeDrag) video.pause();
    });
    progressWrap.addEventListener('mousedown', (e) => {
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
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    // 音量
    volumeSlider.addEventListener('input', () => {
        const val = parseInt(volumeSlider.value, 10) / 100;
        video.volume = val;
        if (val > 0 && video.muted) video.muted = false;
        updateVolumeIcon();
    });
    btnVolume.addEventListener('click', (e) => {
        e.stopPropagation();
        video.muted = !video.muted;
        updateVolumeIcon();
    });

    // 播放速度
    function closeSpeedMenu() {
        if (speedMenu) speedMenu.classList.remove('open');
    }
    btnSpeed.addEventListener('click', (e) => {
        e.stopPropagation();
        speedMenu.classList.toggle('open');
    });
    speedMenu.querySelectorAll('div[data-speed]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const speed = parseFloat(item.dataset.speed);
            video.playbackRate = speed;
            btnSpeed.textContent = speed + 'x';
            speedMenu.querySelectorAll('div').forEach(d => d.classList.remove('active'));
            item.classList.add('active');
            closeSpeedMenu();
        });
    });
    const handleDocClickForSpeed = (e) => {
        if (speedMenu && !speedMenu.contains(e.target) && e.target !== btnSpeed) {
            closeSpeedMenu();
        }
    };
    document.addEventListener('click', handleDocClickForSpeed);

    // 全屏按钮（在全屏模式下退出全屏）
    btnFullscreen.addEventListener('click', (e) => {
        e.stopPropagation();
        destroy(video.currentTime);
    });

    // 关闭按钮
    closeBtn.addEventListener('click', () => destroy(video.currentTime));

    // 键盘快捷键
    const handleKeydown = (e) => {
        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                destroy(video.currentTime);
                break;
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                video.currentTime = Math.max(0, video.currentTime - 5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                video.volume = Math.min(1, video.volume + 0.1);
                if (video.volume > 0) video.muted = false;
                volumeSlider.value = Math.round(video.volume * 100);
                updateVolumeIcon();
                break;
            case 'ArrowDown':
                e.preventDefault();
                video.volume = Math.max(0, video.volume - 0.1);
                volumeSlider.value = Math.round(video.volume * 100);
                updateVolumeIcon();
                break;
            case 'f':
            case 'F':
                e.preventDefault();
                destroy(video.currentTime);
                break;
            case 'm':
            case 'M':
                e.preventDefault();
                video.muted = !video.muted;
                updateVolumeIcon();
                break;
        }
    };
    document.addEventListener('keydown', handleKeydown);

    // 控制栏自动隐藏
    overlay.addEventListener('mousemove', resetHideTimer);
    overlay.addEventListener('mouseenter', resetHideTimer);
    video.addEventListener('play', showControls);
    video.addEventListener('pause', showControls);
    video.addEventListener('ended', () => {
        if (controlsBar) controlsBar.classList.remove('hidden');
    });

    // 播放/暂停状态更新
    video.addEventListener('play', updatePlayButton);
    video.addEventListener('pause', updatePlayButton);
    video.addEventListener('ended', updatePlayButton);

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
