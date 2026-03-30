// 前端页面/components/动画音效引擎.js
// ==========================================
// ✨ 榜单切换动画与音效引擎
// ==========================================
// 功能：为各榜单提供科技感的切换动画和音效
// 动画类型：
//   - cascade: 工具/应用/推荐榜 - 瀑布式从上到下依次从左往右载入
//   - fan: 创作者榜 - 从下到上扇形载入
//   - abyss: 讨论区 - 伪3D效果，从深渊中汇聚
//   - dataflow: 任务榜 - 数据流效果，左右交替滑入
// ==========================================

import { getSettings } from "./全局设置组件.js";

// ==========================================
// 🔊 音效管理
// ==========================================

// 音效类型定义（使用 Web Audio API 合成科技感音效）
let audioContext = null;

// 🔧 懒加载 AudioContext（确保在用户交互后创建）
function getAudioContext() {
    if (!audioContext && typeof AudioContext !== 'undefined') {
        try {
            audioContext = new AudioContext();
        } catch (e) {
            console.warn('AudioContext 创建失败:', e);
            return null;
        }
    }
    return audioContext;
}

// 🔒 恢复被挂起的 AudioContext（浏览器安全策略需要用户交互）
async function resumeAudioContext() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        try {
            await ctx.resume();
        } catch (e) {
            console.warn('AudioContext resume 失败:', e);
        }
    }
    return ctx;
}

/**
 * 播放科技感音效
 * @param {string} type - 音效类型：'whoosh' | 'blip' | 'charge' | 'pop'
 */
export async function playSound(type = 'whoosh') {
    const settings = getSettings();
    if (!settings.enableSoundEffects) return;
    
    // 🔒 确保 AudioContext 已恢复（浏览器安全策略）
    const ctx = await resumeAudioContext();
    if (!ctx) return;
    
    try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        const now = ctx.currentTime;
        
        switch (type) {
            case 'whoosh':
                // 科技滑动音效
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(800, now);
                oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.15);
                gainNode.gain.setValueAtTime(0.12, now);  // 提高音量
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                oscillator.start(now);
                oscillator.stop(now + 0.15);
                break;
                
            case 'blip':
                // 数据点音效
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(1200, now);
                oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.05);
                gainNode.gain.setValueAtTime(0.08, now);  // 提高音量
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                oscillator.start(now);
                oscillator.stop(now + 0.05);
                break;
                
            case 'charge':
                // 充能音效（用于深渊汇聚）
                oscillator.type = 'sawtooth';
                oscillator.frequency.setValueAtTime(100, now);
                oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.3);
                gainNode.gain.setValueAtTime(0.05, now);  // 提高音量
                gainNode.gain.linearRampToValueAtTime(0.12, now + 0.2);
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                oscillator.start(now);
                oscillator.stop(now + 0.35);
                break;
                
            case 'pop':
                // 弹出音效
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(600, now);
                oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.08);
                gainNode.gain.setValueAtTime(0.1, now);  // 提高音量
                gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
                oscillator.start(now);
                oscillator.stop(now + 0.08);
                break;
        }
    } catch (e) {
        console.warn('音效播放失败:', e);
    }
}

// ==========================================
// 🎬 动画样式注入
// ==========================================

let stylesInjected = false;

function injectAnimationStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    
    const style = document.createElement('style');
    style.id = 'comfy-animation-engine-styles';
    style.textContent = `
        /* ==========================================
         * 🌊 瀑布式动画 (工具/应用/推荐榜)
         * 从上到下依次从左往右载入
         * ========================================== */
        @keyframes cascade-in {
            0% {
                opacity: 0;
                transform: translateX(-30px) translateY(-20px) scale(0.9);
                filter: blur(4px);
            }
            60% {
                opacity: 0.8;
                transform: translateX(5px) translateY(0) scale(1.02);
                filter: blur(0);
            }
            100% {
                opacity: 1;
                transform: translateX(0) translateY(0) scale(1);
                filter: blur(0);
            }
        }
        
        .anim-cascade {
            animation: cascade-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
            opacity: 0;
        }
        
        /* ==========================================
         * 🌀 扇形动画 (创作者榜)
         * 从下到上扇形展开载入
         * ========================================== */
        @keyframes fan-in {
            0% {
                opacity: 0;
                transform: translateY(60px) rotate(-15deg) scale(0.8);
                transform-origin: center bottom;
            }
            50% {
                opacity: 0.7;
                transform: translateY(10px) rotate(5deg) scale(1.05);
            }
            100% {
                opacity: 1;
                transform: translateY(0) rotate(0) scale(1);
            }
        }
        
        .anim-fan {
            animation: fan-in 0.5s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
            opacity: 0;
        }
        
        /* ==========================================
         * 🕳️ 深渊汇聚动画 (讨论区)
         * 伪3D效果，从四面八方汇聚
         * ========================================== */
        @keyframes abyss-in {
            0% {
                opacity: 0;
                transform: perspective(800px) translateZ(-300px) scale(0.3);
                filter: blur(8px) brightness(2);
            }
            40% {
                opacity: 0.6;
                filter: blur(2px) brightness(1.2);
            }
            100% {
                opacity: 1;
                transform: perspective(800px) translateZ(0) scale(1);
                filter: blur(0) brightness(1);
            }
        }
        
        /* 不同方向的起点 */
        @keyframes abyss-in-tl { 0% { transform: perspective(800px) translateZ(-300px) translate(-100px, -100px) scale(0.3); opacity: 0; filter: blur(8px); } 100% { transform: perspective(800px) translateZ(0) translate(0, 0) scale(1); opacity: 1; filter: blur(0); } }
        @keyframes abyss-in-tr { 0% { transform: perspective(800px) translateZ(-300px) translate(100px, -100px) scale(0.3); opacity: 0; filter: blur(8px); } 100% { transform: perspective(800px) translateZ(0) translate(0, 0) scale(1); opacity: 1; filter: blur(0); } }
        @keyframes abyss-in-bl { 0% { transform: perspective(800px) translateZ(-300px) translate(-100px, 100px) scale(0.3); opacity: 0; filter: blur(8px); } 100% { transform: perspective(800px) translateZ(0) translate(0, 0) scale(1); opacity: 1; filter: blur(0); } }
        @keyframes abyss-in-br { 0% { transform: perspective(800px) translateZ(-300px) translate(100px, 100px) scale(0.3); opacity: 0; filter: blur(8px); } 100% { transform: perspective(800px) translateZ(0) translate(0, 0) scale(1); opacity: 1; filter: blur(0); } }
        @keyframes abyss-in-center { 0% { transform: perspective(800px) translateZ(-400px) scale(0.1); opacity: 0; filter: blur(10px) brightness(3); } 100% { transform: perspective(800px) translateZ(0) scale(1); opacity: 1; filter: blur(0) brightness(1); } }
        
        .anim-abyss { animation: abyss-in 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        .anim-abyss-tl { animation: abyss-in-tl 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        .anim-abyss-tr { animation: abyss-in-tr 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        .anim-abyss-bl { animation: abyss-in-bl 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        .anim-abyss-br { animation: abyss-in-br 0.6s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        .anim-abyss-center { animation: abyss-in-center 0.7s cubic-bezier(0.23, 1, 0.32, 1) forwards; opacity: 0; }
        
        /* ==========================================
         * ⚡ 数据流动画 (任务榜)
         * 电路板效果，左右交替滑入带电流
         * ========================================== */
        @keyframes dataflow-left {
            0% {
                opacity: 0;
                transform: translateX(-100%) skewX(-5deg);
                box-shadow: -20px 0 30px rgba(33, 150, 243, 0.5);
            }
            50% {
                box-shadow: 0 0 20px rgba(33, 150, 243, 0.8), 0 0 40px rgba(33, 150, 243, 0.3);
            }
            100% {
                opacity: 1;
                transform: translateX(0) skewX(0);
                box-shadow: none;
            }
        }
        
        @keyframes dataflow-right {
            0% {
                opacity: 0;
                transform: translateX(100%) skewX(5deg);
                box-shadow: 20px 0 30px rgba(255, 152, 0, 0.5);
            }
            50% {
                box-shadow: 0 0 20px rgba(255, 152, 0, 0.8), 0 0 40px rgba(255, 152, 0, 0.3);
            }
            100% {
                opacity: 1;
                transform: translateX(0) skewX(0);
                box-shadow: none;
            }
        }
        
        /* 扫描线效果 */
        @keyframes scanline {
            0% { background-position: 0 -100%; }
            100% { background-position: 0 200%; }
        }
        
        .anim-dataflow-left {
            animation: dataflow-left 0.45s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
            opacity: 0;
        }
        
        .anim-dataflow-right {
            animation: dataflow-right 0.45s cubic-bezier(0.25, 0.8, 0.25, 1) forwards;
            opacity: 0;
        }
        
        /* 任务榜扫描线叠加效果 */
        .anim-dataflow-left::before,
        .anim-dataflow-right::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(
                180deg,
                transparent 0%,
                rgba(33, 150, 243, 0.1) 50%,
                transparent 100%
            );
            background-size: 100% 200%;
            animation: scanline 0.8s linear forwards;
            pointer-events: none;
            border-radius: inherit;
        }
    `;
    document.head.appendChild(style);
}

// ==========================================
// 🎮 动画应用函数
// ==========================================

/**
 * 为卡片应用动画
 * @param {HTMLElement} card - 卡片元素
 * @param {string} animationType - 动画类型：'cascade' | 'fan' | 'abyss' | 'dataflow'
 * @param {number} index - 卡片索引（用于计算延迟）
 * @param {number} totalVisible - 可见卡片总数
 */
export function applyCardAnimation(card, animationType, index, totalVisible = 10) {
    const settings = getSettings();
    if (!settings.enableAnimations) return;
    
    // 确保样式已注入
    injectAnimationStyles();
    
    // 只对可见范围内的卡片应用动画
    if (index >= totalVisible) {
        card.style.opacity = '1';
        return;
    }
    
    // 计算延迟时间（错开动画）
    const baseDelay = 50; // 基础延迟 50ms
    const delay = index * baseDelay;
    
    // 设置延迟
    card.style.animationDelay = `${delay}ms`;
    
    switch (animationType) {
        case 'cascade':
            // 瀑布式动画
            card.classList.add('anim-cascade');
            if (index === 0) playSound('whoosh');
            break;
            
        case 'fan':
            // 扇形动画（从下往上，索引越小延迟越长，形成从下到上效果）
            const fanDelay = (totalVisible - 1 - index) * baseDelay;
            card.style.animationDelay = `${fanDelay}ms`;
            card.classList.add('anim-fan');
            if (index === totalVisible - 1) playSound('whoosh');
            break;
            
        case 'abyss':
            // 深渊汇聚动画（分配不同方向）
            const directions = ['anim-abyss-tl', 'anim-abyss-tr', 'anim-abyss-bl', 'anim-abyss-br', 'anim-abyss-center'];
            const direction = directions[index % directions.length];
            card.classList.add(direction);
            if (index === 0) playSound('charge');
            break;
            
        case 'dataflow':
            // 数据流动画（左右交替）
            const isLeft = index % 2 === 0;
            card.style.position = 'relative'; // 为扫描线效果
            card.classList.add(isLeft ? 'anim-dataflow-left' : 'anim-dataflow-right');
            if (index < 3) setTimeout(() => playSound('blip'), delay);
            break;
    }
    
    // 动画结束后清理类名
    card.addEventListener('animationend', () => {
        card.classList.remove(
            'anim-cascade', 'anim-fan', 
            'anim-abyss', 'anim-abyss-tl', 'anim-abyss-tr', 'anim-abyss-bl', 'anim-abyss-br', 'anim-abyss-center',
            'anim-dataflow-left', 'anim-dataflow-right'
        );
        card.style.animationDelay = '';
    }, { once: true });
}

/**
 * 批量为容器中的卡片应用动画
 * @param {HTMLElement} container - 容器元素
 * @param {string} animationType - 动画类型
 * @param {string} cardSelector - 卡片选择器（可选）
 */
export function animateCards(container, animationType, cardSelector = null) {
    const settings = getSettings();
    if (!settings.enableAnimations) return;
    
    // 确保样式已注入
    injectAnimationStyles();
    
    // 获取卡片元素
    const cards = cardSelector 
        ? Array.from(container.querySelectorAll(cardSelector))
        : Array.from(container.children).filter(el => el.nodeType === 1);
    
    // 计算可见卡片数量（基于容器高度估算）
    const containerHeight = container.clientHeight || 600;
    const estimatedCardHeight = 160; // 估算卡片高度
    const visibleCount = Math.min(Math.ceil(containerHeight / estimatedCardHeight) + 2, 15);
    
    // 应用动画
    cards.forEach((card, index) => {
        applyCardAnimation(card, animationType, index, visibleCount);
    });
}

/**
 * 获取榜单类型对应的动画类型
 * @param {string} tabId - 标签页ID
 * @returns {string} 动画类型
 */
export function getAnimationTypeForTab(tabId) {
    const animationMap = {
        'tools': 'cascade',      // 工具榜
        'apps': 'cascade',       // 应用榜
        'recommends': 'cascade', // 推荐榜
        'creators': 'fan',       // 创作者榜
        'posts': 'abyss',        // 讨论区
        'tasks': 'dataflow'      // 任务榜
    };
    return animationMap[tabId] || 'cascade';
}

/**
 * 初始化动画引擎（在应用启动时调用）
 */
export function initAnimationEngine() {
    injectAnimationStyles();
    
    // 🔒 在用户首次交互时预热 AudioContext
    const warmupAudio = () => {
        resumeAudioContext();
        document.removeEventListener('click', warmupAudio);
        document.removeEventListener('keydown', warmupAudio);
    };
    document.addEventListener('click', warmupAudio, { once: true });
    document.addEventListener('keydown', warmupAudio, { once: true });
}

// 自动初始化
initAnimationEngine();
