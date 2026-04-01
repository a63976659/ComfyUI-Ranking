// 前端页面/components/彩蛋动画引擎.js
// ==========================================
// 🎮 彩蛋动画模块 - 3D星空千字文隧道 + 数字小猪
// ==========================================
// 触发方式: 点击底部"猪的飞行梦"链接
// 功能: 在新标签页打开全屏3D动画

/**
 * 在新标签页打开彩蛋动画页面
 */
export function openEasterEggPage() {
    const html = generateFullHTML();
    const newWindow = window.open('', '_blank');
    if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
    }
}

/**
 * 生成完整的彩蛋动画HTML页面
 */
function generateFullHTML() {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🐷 猪的飞行梦</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000;
        }
        #canvas {
            display: block;
            width: 100%;
            height: 100%;
        }
        #hint {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: rgba(255, 255, 255, 0.4);
            font-family: monospace;
            font-size: 12px;
            pointer-events: none;
            text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
            z-index: 10;
        }
        #speed-indicator {
            position: fixed;
            top: 20px;
            right: 20px;
            color: rgba(100, 200, 255, 0.6);
            font-family: monospace;
            font-size: 42px;
            pointer-events: none;
            z-index: 10;
        }
    </style>
</head>
<body>
    <canvas id="canvas"></canvas>
    <div id="hint">鼠标移动改变视角 | PgUp加速 PgDn减速 | ESC关闭</div>
    <div id="speed-indicator">速度: 1.0x</div>
    <script>
        // ==================== 配置参数 ====================
        // 千字文（用于星空星星）
        const QIANZIWEN = '天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光果珍李柰菜重芥姜海咸河淡鳞潜羽翔龙师火帝鸟官人皇始制文字乃服衣裳推位让国有虞陶唐吊民伐罪周发殷汤坐朝问道垂拱平章爱育黎首臣伏戎羌遐迩一体率宾归王鸣凤在竹白驹食场化被草木赖及万方盖此身发四大五常恭惟鞠养岂敢毁伤女慕贞洁男效才良知过必改得能莫忘罔谈彼短靡恃己长信使可覆器欲难量墨悲丝染诗赞羔羊景行维贤克念作圣德建名立形端表正空谷传声虚堂习听祸因恶积福缘善庆尺璧非宝寸阴是竞资父事君曰严与敬孝当竭力忠则尽命临深履薄夙兴温凊似兰斯馨如松之盛川流不息渊澄取映容止若思言辞安定笃初诚美慎终宜令荣业所基籍甚无竟学优登仕摄职从政存以甘棠去而益咏乐殊贵贱礼别尊卑上和下睦夫唱妇随外受傅训入奉母仪诸姑伯叔犹子比儿孔怀兄弟同气连枝交友投分切磨箴规仁慈隐恻造次弗离节义廉退颠沛匪亏性静情逸心动神疲守真志满逐物意移坚持雅操好爵自縻都邑华夏东西二京背邙面洛浮渭据泾宫殿盘郁楼观飞惊图写禽兽画彩仙灵丙舍旁启甲帐对楹肆筵设席鼓瑟吹笙升阶纳陛弁转疑星右通广内左达承明既集坟典亦聚群英杜稿钟隶漆书壁经府罗将相路侠槐卿户封八县家给千兵高冠陪辇驱毂振缨世禄侈富车驾肥轻策功茂实勒碑刻铭盘溪伊尹佐时阿衡奄宅曲阜微旦孰营桓公匡合济弱扶倾绮回汉惠说感武丁俊乂密勿多士寔宁晋楚更霸赵魏困横假途灭虢践土会盟何遵约法韩弊烦刑起翦颇牧用军最精宣威沙漠驰誉丹青九州禹迹百郡秦并岳宗泰岱禅主云亭雁门紫塞鸡田赤城昆池碣石巨野洞庭旷远绵邈岩岫杳冥治本于农务资稼穑俶载南亩我艺黍稷税熟贡新劝赏黜陟孟轲敦素史鱼秉直庶几中庸劳谦谨敕聆音察理鉴貌辨色贻厥嘉猷勉其祗植省躬讥诫宠增抗极殆辱近耻林皋幸即两疏见机解组谁逼索居闲处沉默寂寥求古寻论散虑逍遥欣奏累遣戚谢欢招渠荷的历园莽抽条枇杷晚翠梧桐早凋陈根委翳落叶飘摇游鹍独运凌摩绛霄耽读玩市寓目囊箱易輶攸畏属耳垣墙具膳餐饭适口充肠饱饫烹宰饥厌糟糠亲戚故旧老少异粮妾御绩纺侍巾帷房纨扇圆洁银烛炜煌昼眠夕寐蓝笋象床弦歌酒宴接杯举觞矫手顿足悦豫且康嫡后嗣续祭祀烝尝稽颡再拜悚惧恐惶笺牒简要顾答审详骸垢想浴执热愿凉驴骡犊特骇跃超骧诛斩贼盗捕获叛亡布射僚丸嵇琴阮啸恬笔伦纸钧巧任钓释纷利俗并皆佳妙毛施淑姿工颦妍笑年矢每催曦晖朗曜璇玑悬斡晦魄环照指薪修祜永绥吉劭矩步引领俯仰廊庙束带矜庄徘徊瞻眺孤陋寡闻愚蒙等诮谓语助者焉哉乎也';

        // 隐道框架文字 - 9组顺序循环
        const TUNNEL_GROUPS = [
            '赵钱孙李 周吴郑王 冯陈褚卫 蒋沈韩杨 朱秦尤许 何吕施张 孔曹严华 金魏陶姜 戚谢邹喻 柏水窦章 云苏潘葛 奚范彭郎',  // 第1组
            '鲁韦昌马 苗凤花方 俞任袁柳 酆鲍史唐 费廉岑薛 雷贺倪汤 滕殷罗毕 郝邬安常 乐于时傅 皮卞齐康 伍余元卜 顾孟平黄',  // 第2组
            '和穆萧尹 姚邵湛汪 祁毛禹狄 米贝明臧 计伏成戴 谈宋茅庞 熊纪舒屈 项祝董梁 杜阮蓝闵 席季麻强 贾路娄危 江童颜郭',  // 第3组
            '梅盛林刁 钟徐邱骆 高夏蔡田 樊胡凌霍 虞万支柯 昝管卢莫 经房裘缪 干解应宗 丁宣贲邓 郁单杭洪 包诸左石 崔吉钮龚',  // 第4组
            '程嵇邢滑 裴陆荣翁 荀羊於惠 甄曲家封 芮羿储靳 汲邴糜松 井段富巫 乌焦巴弓 牧隗山谷 车侯宓蓬 全郗班仰 秋仲伊宫',  // 第5组
            '宁仇栾暴 甘钭厉戎 祖武符刘 景詹束龙 叶幸司韶 郜黎蓟薄 印宿白怀 蒲邰从鄂 索咸籍赖 卓蔺屠蒙 池乔阴鬱 胥能苍双',  // 第6组
            '闻莘党翟 谭贡劳逄 姬申扶堵 冉宰郦雍 郤璩桑桂 濮牛寿通 边扈燕冀 郏浦尚农 温别庄晏 柴瞿阎充 慕连茹习 宦艾鱼容',  // 第7组
            '向古易慎 戈廖庾终 暨居衡步 都耿满弘 匡国文寇 广禄阙东 欧殳沃利 蔚越夔隆 师巩厍聂 晁勾敖融 冷訾辛阚 那简饶空',  // 第8组
            '曾毋沙乜 养鞠须丰 巢关蒯相 查后荆红 游竺权逯 盖益桓公 万俟司馬 上官歐陽 夏侯諸葛 聞人東方 赫連皇甫 尉遲公羊',  // 第9组
        ];
        const TUNNEL_GROUP_COUNT = TUNNEL_GROUPS.length;

        const CONFIG = {
            starCount: 600,
            tunnelFrameCount: 12,
            focalLength: 400,
            baseSpeed: 2,
            minSpeed: 0.5,
            maxSpeed: 10,
            trailThreshold: 3,
            colors: {
                stars: ['#ffffff', '#e0f7ff', '#fff8e0', '#f0e0ff'],
                tunnel: '#c0d0e0'
            }
        };

        // ==================== 全局变量 ====================
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const speedIndicator = document.getElementById('speed-indicator');
        
        let width, height, centerX, centerY;
        let animationId;
        let frameCount = 0;
        
        // 视角中心点（用于鼠标交互）
        let cx = 0, cy = 0;
        let targetCx = 0, targetCy = 0;
        
        // 速度控制
        let currentSpeed = CONFIG.baseSpeed;
        let targetSpeed = CONFIG.baseSpeed;

        // ==================== 工具函数 ====================
        function lerp(start, end, t) {
            return start + (end - start) * t;
        }

        function randomRange(min, max) {
            return Math.random() * (max - min) + min;
        }

        function randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        function randomChoice(arr) {
            return arr[Math.floor(Math.random() * arr.length)];
        }

        // HSL转RGB
        function hslToRgb(h, s, l) {
            let r, g, b;
            if (s === 0) {
                r = g = b = l;
            } else {
                const hue2rgb = (p, q, t) => {
                    if (t < 0) t += 1;
                    if (t > 1) t -= 1;
                    if (t < 1/6) return p + (q - p) * 6 * t;
                    if (t < 1/2) return q;
                    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                    return p;
                };
                const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                const p = 2 * l - q;
                r = hue2rgb(p, q, h + 1/3);
                g = hue2rgb(p, q, h);
                b = hue2rgb(p, q, h - 1/3);
            }
            return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
        }

        // RGB转十六进制
        function rgbToHex(r, g, b) {
            return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        }

        // 颜色混合
        function blendColors(color1, color2, ratio) {
            const c1 = parseInt(color1.slice(1), 16);
            const c2 = parseInt(color2.slice(1), 16);
            const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
            const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
            const r = Math.round(r1 + (r2 - r1) * ratio);
            const g = Math.round(g1 + (g2 - g1) * ratio);
            const b = Math.round(b1 + (b2 - b1) * ratio);
            return rgbToHex(r, g, b);
        }

        // ==================== 3D投影 ====================
        function project3D(x, y, z) {
            const scale = CONFIG.focalLength / Math.max(z, 1);
            const screenX = (x - cx) * scale + centerX;
            const screenY = (y - cy) * scale + centerY;
            return { x: screenX, y: screenY, scale };
        }

        // ==================== 数字星星系统 ====================
        class StarField {
            constructor() {
                this.stars = [];
                this.initStars();
            }

            initStars() {
                for (let i = 0; i < CONFIG.starCount; i++) {
                    this.stars.push(this.createStar(i));
                }
            }

            createStar(index) {
                // 使用千字文字符，基于索引固定映射
                const charIndex = index % QIANZIWEN.length;
                return {
                    x: randomRange(-2000, 2000),
                    y: randomRange(-2000, 2000),
                    z: randomRange(10, 3000),
                    char: QIANZIWEN[charIndex],
                    color: randomChoice(CONFIG.colors.stars),
                    twinkleOffset: Math.random() * Math.PI * 2
                };
            }

            update() {
                for (let star of this.stars) {
                    star.z -= currentSpeed;
                    if (star.z < 10) {
                        star.z = 3000;
                        star.x = randomRange(-2000, 2000);
                        star.y = randomRange(-2000, 2000);
                        // 字符保持不变，不需要更新
                    }
                }
            }

            draw() {
                for (let star of this.stars) {
                    const projected = project3D(star.x, star.y, star.z);
                    const fontSize = Math.max(4, 30 * projected.scale);
                    const alpha = Math.min(1, (3000 - star.z) / 3000 * 1.2);
                    const twinkle = 0.8 + Math.sin(frameCount * 0.05 + star.twinkleOffset) * 0.2;
                    
                    ctx.save();
                    ctx.font = \`\${fontSize}px monospace\`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = star.color;
                    ctx.globalAlpha = alpha * twinkle;
                    ctx.shadowColor = star.color;
                    ctx.shadowBlur = fontSize * 0.5;
                    ctx.fillText(star.char, projected.x, projected.y);
                    ctx.restore();
                }
            }

            drawTrails() {
                if (currentSpeed <= CONFIG.trailThreshold) return;
                const trailLength = (currentSpeed - CONFIG.trailThreshold) * 8;
                
                for (let star of this.stars) {
                    if (star.z > 2000) continue;
                    const projected = project3D(star.x, star.y, star.z);
                    const fontSize = Math.max(4, 30 * projected.scale);
                    const dx = projected.x - centerX;
                    const dy = projected.y - centerY;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const dirX = dx / dist;
                    const dirY = dy / dist;
                    
                    const gradient = ctx.createLinearGradient(
                        projected.x, projected.y,
                        projected.x - dirX * trailLength, projected.y - dirY * trailLength
                    );
                    gradient.addColorStop(0, star.color);
                    gradient.addColorStop(1, 'transparent');
                    
                    ctx.save();
                    ctx.strokeStyle = gradient;
                    ctx.lineWidth = fontSize * 0.3;
                    ctx.globalAlpha = 0.6;
                    ctx.beginPath();
                    ctx.moveTo(projected.x, projected.y);
                    ctx.lineTo(projected.x - dirX * trailLength, projected.y - dirY * trailLength);
                    ctx.stroke();
                    ctx.restore();
                }
            }
        }

        // ==================== 隧道系统 ====================
        class Tunnel {
            constructor() {
                this.frames = [];
                this.frameSize = 800;
                this.initFrames();
            }

            initFrames() {
                const zSpacing = 300;
                for (let i = 0; i < CONFIG.tunnelFrameCount; i++) {
                    this.frames.push({
                        z: 500 + i * zSpacing,
                        rotation: i * 0.3,
                        groupIndex: i % TUNNEL_GROUP_COUNT
                    });
                }
            }

            update() {
                for (let frame of this.frames) {
                    frame.z -= currentSpeed;
                    frame.rotation += 0.005;
                    if (frame.z < 10) {
                        frame.z = 500 + (CONFIG.tunnelFrameCount - 1) * 300;
                        frame.rotation = this.frames[this.frames.length - 1].rotation + 0.3;
                        frame.groupIndex = (frame.groupIndex + 1) % TUNNEL_GROUP_COUNT;
                    }
                }
                this.frames.sort((a, b) => b.z - a.z);
            }

            draw() {
                for (let frame of this.frames) {
                    this.drawFrame(frame);
                }
            }

            drawFrame(frame) {
                const size = this.frameSize;
                const halfSize = size / 2;
                const cos = Math.cos(frame.rotation);
                const sin = Math.sin(frame.rotation);
                
                const corners = [
                    { x: -halfSize * cos - halfSize * sin, y: -halfSize * sin + halfSize * cos },
                    { x: halfSize * cos - halfSize * sin, y: halfSize * sin + halfSize * cos },
                    { x: halfSize * cos + halfSize * sin, y: halfSize * sin - halfSize * cos },
                    { x: -halfSize * cos + halfSize * sin, y: -halfSize * sin - halfSize * cos }
                ];
                
                const projectedCorners = corners.map(c => project3D(c.x, c.y, frame.z));
                const alpha = Math.min(1, (3500 - frame.z) / 3500 * 0.8);
                const scale = CONFIG.focalLength / Math.max(frame.z, 1);
                
                if (alpha <= 0.05) return;
                
                ctx.save();
                ctx.globalAlpha = alpha;
                ctx.shadowColor = CONFIG.colors.tunnel;
                ctx.shadowBlur = 15 * scale;
                ctx.font = \`\${Math.max(8, 20 * scale)}px monospace\`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                
                const digitsPerSide = 12;
                for (let side = 0; side < 4; side++) {
                    const start = projectedCorners[side];
                    const end = projectedCorners[(side + 1) % 4];
                    
                    for (let i = 0; i < digitsPerSide; i++) {
                        const t = i / digitsPerSide;
                        const x = lerp(start.x, end.x, t);
                        const y = lerp(start.y, end.y, t);
                        // 使用百家姓分组字符，每个框显示不同组
                        const group = TUNNEL_GROUPS[frame.groupIndex];
                        const charIndex = (side * digitsPerSide + i) % group.length;
                        ctx.fillStyle = CONFIG.colors.tunnel;
                        ctx.fillText(group[charIndex], x, y);
                    }
                }
                ctx.restore();
            }
        }

        // ==================== 3D数字小猪系统（粉色侧面视角）====================
        class DigitalPig3D {
            constructor() {
                this.x = 0;
                this.y = 0;
                this.scale = 1.0;
                this.time = 0;
                this.wingAngle = 0;
                this.floatPhase = 0;
                
                // 光照方向（从左上方照射）
                this.lightDir = { x: -0.5, y: -0.6, z: 0.6 };
                
                // 粉色调色板
                this.colors = {
                    bodyLight: { r: 255, g: 190, b: 190 },   // 亮面浅粉
                    bodyDark: { r: 190, g: 110, b: 110 },    // 暗面深粉
                    earInner: { r: 255, g: 140, b: 160 },    // 耳朵内侧
                    hoof: { r: 50, g: 35, b: 35 },           // 蹄子深色
                    wing: { r: 255, g: 230, b: 240 }         // 翅膀浅粉白
                };
                
                // 部位点阵
                this.bodyPoints = [];
                this.headPoints = [];
                this.earLeftPoints = [];
                this.earRightPoints = [];
                this.wingLeftPoints = [];
                this.wingRightPoints = [];
                this.legPoints = [];
                this.tailPoints = [];
                
                this.generateAllPoints();
            }

            // 检查点是否在椭圆内
            isInEllipse(px, py, cx, cy, rx, ry) {
                const dx = px - cx;
                const dy = py - cy;
                return (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1;
            }

            // 计算到椭圆中心的归一化深度
            getEllipseDepth(px, py, cx, cy, rx, ry) {
                const dx = (px - cx) / rx;
                const dy = (py - cy) / ry;
                const dist = Math.sqrt(dx * dx + dy * dy);
                return Math.sqrt(Math.max(0, 1 - dist * dist));
            }

            // 计算粉色光照（保持粉色基调）
            calculatePinkLighting(lightColor, darkColor, depth, normalX, normalY) {
                const normalZ = depth;
                // 计算光照强度 (0~1)
                const dot = normalX * this.lightDir.x + normalY * this.lightDir.y + normalZ * this.lightDir.z;
                const lightIntensity = Math.max(0, Math.min(1, dot * 0.5 + 0.5));
                
                // 在亮色和暗色之间插值
                const r = Math.round(darkColor.r + (lightColor.r - darkColor.r) * lightIntensity);
                const g = Math.round(darkColor.g + (lightColor.g - darkColor.g) * lightIntensity);
                const b = Math.round(darkColor.b + (lightColor.b - darkColor.b) * lightIntensity);
                
                return rgbToHex(r, g, b);
            }

            // 生成椭圆区域内的数字点（粉色版）
            generateEllipsePoints(cx, cy, rx, ry, step, colorType, zOffset = 0) {
                const points = [];
                let lightColor, darkColor;
                
                // 根据部位选择颜色
                switch(colorType) {
                    case 'body':
                        lightColor = this.colors.bodyLight;
                        darkColor = this.colors.bodyDark;
                        break;
                    case 'head':
                        // 头部比身体稍浅，便于在重叠区域区分
                        lightColor = { r: 255, g: 200, b: 200 };
                        darkColor = { r: 210, g: 130, b: 130 };
                        break;
                    case 'ear':
                        lightColor = { r: 255, g: 170, b: 180 };
                        darkColor = this.colors.earInner;
                        break;
                    case 'hoof':
                        lightColor = { r: 80, g: 55, b: 55 };
                        darkColor = this.colors.hoof;
                        break;
                    case 'leg':
                        lightColor = { r: 245, g: 175, b: 175 };
                        darkColor = { r: 180, g: 100, b: 110 };
                        break;
                    default:
                        lightColor = this.colors.bodyLight;
                        darkColor = this.colors.bodyDark;
                }
                
                for (let y = cy - ry; y <= cy + ry; y += step) {
                    for (let x = cx - rx; x <= cx + rx; x += step) {
                        if (this.isInEllipse(x, y, cx, cy, rx, ry)) {
                            const depth = this.getEllipseDepth(x, y, cx, cy, rx, ry);
                            const normalX = (x - cx) / rx;
                            const normalY = (y - cy) / ry;
                            const color = this.calculatePinkLighting(lightColor, darkColor, depth, normalX, normalY);
                            
                            // 边缘用较小的数字
                            const edgeDist = 1 - Math.sqrt((normalX*normalX + normalY*normalY));
                            const size = 0.5 + depth * 0.4 + edgeDist * 0.2;
                            
                            points.push({
                                x: x - cx,
                                y: y - cy,
                                digit: randomInt(0, 9),
                                color,
                                size: Math.max(0.4, size),
                                depth: depth + zOffset
                            });
                        }
                    }
                }
                return points;
            }

            // 生成所有小猪部位的点（侧面视角）
            generateAllPoints() {
                // 身体 - 圆润的椭圆
                this.bodyPoints = this.generateEllipsePoints(0, 10, 55, 45, 8, 'body', 0);
                
                // 头部 - 圆形，位于身体上方
                // 使用 'head' 颜色类型，比身体稍浅，便于区分
                this.headPoints = this.generateEllipsePoints(0, 50, 38, 35, 7, 'head', 0.15);
                
                // 左耳朵（在头部上方）
                this.earLeftPoints = this.generateEarPoints(-28, -50, true);
                // 右耳朵（在头部上方）
                this.earRightPoints = this.generateEarPoints(28, -50, false);
                
                // 四条小腿（在下方）
                this.legPoints = [
                    ...this.generateEllipsePoints(-30, 52, 10, 16, 6, 'leg', -0.1),
                    ...this.generateEllipsePoints(-12, 56, 10, 16, 6, 'leg', -0.1),
                    ...this.generateEllipsePoints(12, 56, 10, 16, 6, 'leg', -0.1),
                    ...this.generateEllipsePoints(30, 52, 10, 16, 6, 'leg', -0.1)
                ];
                
                // 小蹄子（在下方）
                this.legPoints.push(
                    ...this.generateEllipsePoints(-30, 66, 8, 6, 5, 'hoof', 0),
                    ...this.generateEllipsePoints(-12, 70, 8, 6, 5, 'hoof', 0),
                    ...this.generateEllipsePoints(12, 70, 8, 6, 5, 'hoof', 0),
                    ...this.generateEllipsePoints(30, 66, 8, 6, 5, 'hoof', 0)
                );
                
                // 翅膀 - 动态生成
                this.generateWingPoints(0);
                
                // 卷曲尾巴
                this.tailPoints = this.generateTailPoints();
            }

            // 生成耳朵点（三角形耳朵，内侧更深粉）
            generateEarPoints(cx, cy, isLeft) {
                const points = [];
                const outerLight = { r: 255, g: 175, b: 185 };
                const outerDark = { r: 200, g: 120, b: 130 };
                const innerLight = { r: 255, g: 140, b: 160 };
                const innerDark = { r: 180, g: 80, b: 100 };
                
                // 耳朵外形（椭圆形）
                for (let y = 0; y < 25; y += 5) {
                    const widthAtY = 12 * (1 - y / 35);
                    for (let x = -widthAtY; x <= widthAtY; x += 5) {
                        const depth = 0.4 + (1 - y / 25) * 0.3;
                        const normalX = x / 15 * (isLeft ? -1 : 1);
                        
                        // 内侧用更深的粉色
                        const isInner = y < 15;
                        const lightC = isInner ? innerLight : outerLight;
                        const darkC = isInner ? innerDark : outerDark;
                        const color = this.calculatePinkLighting(lightC, darkC, depth, normalX, -0.3);
                        
                        points.push({
                            x: cx + x,
                            y: cy + y,
                            digit: randomInt(0, 9),
                            color,
                            size: 0.4 + depth * 0.3,
                            depth: depth
                        });
                    }
                }
                return points;
            }

            // 生成翅膀点（弧线向下，浅粉白色）
            generateWingPoints(wingAngle) {
                this.wingLeftPoints = [];
                this.wingRightPoints = [];
                
                const wingLight = { r: 255, g: 235, b: 245 };
                const wingDark = { r: 255, g: 200, b: 220 };
                
                // 左翅膀（弧线向左下）
                for (let layer = 0; layer < 3; layer++) {
                    const layerAngle = wingAngle * 0.4 - layer * 0.08;
                    const layerLen = 60 - layer * 12;
                    
                    for (let i = 0; i < 8; i++) {
                        const t = i / 8;
                        // 从左侧开始弧线向下弯曲
                        const spreadAngle = Math.PI - 0.3 + layerAngle - t * 0.7;
                        const r = 25 + t * layerLen;
                        const x = -25 + Math.cos(spreadAngle) * r;
                        const y = -15 + Math.sin(spreadAngle) * r;
                        
                        const depth = 0.5 + (1 - t) * 0.3 - layer * 0.1;
                        const color = this.calculatePinkLighting(
                            wingLight, wingDark,
                            Math.max(0.3, depth), 
                            Math.cos(spreadAngle), 
                            Math.sin(spreadAngle)
                        );
                        
                        this.wingLeftPoints.push({
                            x, y,
                            digit: randomInt(0, 9),
                            color,
                            size: 0.5 + (1 - t) * 0.35 - layer * 0.08,
                            depth: 0.3 - layer * 0.1,
                            alpha: 0.85 - layer * 0.15
                        });
                    }
                }
                
                // 右翅膀（弧线向右下）
                for (let layer = 0; layer < 3; layer++) {
                    const layerAngle = -wingAngle * 0.4 + layer * 0.08;
                    const layerLen = 60 - layer * 12;
                    
                    for (let i = 0; i < 8; i++) {
                        const t = i / 8;
                        // 从右侧开始弧线向下弯曲
                        const spreadAngle = 0.3 + layerAngle + t * 0.7;
                        const r = 25 + t * layerLen;
                        const x = 25 + Math.cos(spreadAngle) * r;
                        const y = -15 + Math.sin(spreadAngle) * r;
                        
                        const depth = 0.5 + (1 - t) * 0.3 - layer * 0.1;
                        const color = this.calculatePinkLighting(
                            wingLight, wingDark,
                            Math.max(0.3, depth), 
                            Math.cos(spreadAngle), 
                            Math.sin(spreadAngle)
                        );
                        
                        this.wingRightPoints.push({
                            x, y,
                            digit: randomInt(0, 9),
                            color,
                            size: 0.5 + (1 - t) * 0.35 - layer * 0.08,
                            depth: 0.3 - layer * 0.1,
                            alpha: 0.85 - layer * 0.15
                        });
                    }
                }
            }

            // 生成卷曲尾巴点（粉色）
            generateTailPoints() {
                const points = [];
                const tailLight = { r: 255, g: 180, b: 185 };
                const tailDark = { r: 200, g: 115, b: 125 };
                
                // 螺旋卷曲尾巴
                for (let i = 0; i < 18; i++) {
                    const t = i / 18;
                    const angle = t * Math.PI * 2.5;
                    const radius = 5 + t * 10;
                    const x = Math.cos(angle) * radius * 0.7;
                    const y = 45 + Math.sin(angle) * radius * 0.5 - t * 10;
                    
                    const depth = 0.6 + Math.sin(angle) * 0.2;
                    const color = this.calculatePinkLighting(tailLight, tailDark, depth, Math.cos(angle) * 0.5, 0);
                    
                    points.push({
                        x, y,
                        digit: randomInt(0, 9),
                        color,
                        size: 0.45 - t * 0.1,
                        depth: 0.4 + depth * 0.2,
                        tailT: t
                    });
                }
                return points;
            }

            update() {
                const speedFactor = currentSpeed / CONFIG.baseSpeed;
                this.time += 0.016 * speedFactor;
                
                // 位置
                this.x = centerX;
                this.y = centerY + 10;
                
                // 飘浮动画
                this.floatPhase += 0.025 * speedFactor;
                this.y += Math.sin(this.floatPhase) * 12;
                this.x += Math.sin(this.floatPhase * 0.6) * 5;
                
                // 缩放呼吸
                this.scale = 1.4 + Math.sin(this.floatPhase * 1.2) * 0.025;
                
                // 翅膀扇动 - 速度越快向下扇动角度越大
                const speedRatio = (currentSpeed - CONFIG.minSpeed) / (CONFIG.maxSpeed - CONFIG.minSpeed);
                const baseAmplitude = 0.6;
                const minDownExtra = Math.PI / 3; // 最低速时向下额外60度
                const maxExtraAmplitude = Math.PI * 5 / 6 + Math.PI / 3; // 210度
                const rawWing = Math.sin(this.time * 5);
                // 向下（负值）时增加额外角度，最低速也有基础偏移
                const downExtra = rawWing < 0 ? minDownExtra + speedRatio * (maxExtraAmplitude - minDownExtra) : 0;
                this.wingAngle = -rawWing * baseAmplitude + downExtra;
                this.generateWingPoints(this.wingAngle);
                
                // 尾巴摆动
                for (const pt of this.tailPoints) {
                    if (pt.tailT !== undefined) {
                        pt.xOffset = Math.sin(this.time * 4 + pt.tailT * 4) * 4;
                    }
                }
            }

            draw() {
                ctx.save();
                ctx.translate(this.x, this.y);
                ctx.scale(this.scale, this.scale);
                
                // 按绘制顺序组织点（从远到近：后方先绘制，前方后绘制）
                // 1. 翅膀（最远，在背后）
                // 2. 腿/蹄子
                // 3. 身体
                // 4. 头部（在身体前面）
                // 5. 耳朵（在头部上）
                // 6. 尾巴（最近，朝向观众，最上层）
                const allPoints = [
                    ...this.tailPoints,
                    ...this.bodyPoints,
                    ...this.legPoints,
                    ...this.wingLeftPoints,
                    ...this.wingRightPoints,
                    ...this.earLeftPoints,
                    ...this.earRightPoints,
                    ...this.headPoints
                ];
                
                // 增大基础字体让数字更清晰
                const baseSize = 12;
                
                for (const pt of allPoints) {
                    const xPos = pt.x + (pt.xOffset || 0);
                    const yPos = pt.y;
                    const fontSize = baseSize * pt.size;
                    const alpha = (pt.alpha || 1) * 0.95;
                    
                    ctx.save();
                    // 使用更清晰的字体
                    ctx.font = \`bold \${Math.max(6, fontSize)}px "Courier New", monospace\`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = pt.color;
                    ctx.globalAlpha = alpha;
                    // 粉色光晕效果
                    ctx.shadowColor = '#ffb0c0';
                    ctx.shadowBlur = pt.depth * 3 + 2;
                    ctx.fillText(pt.digit.toString(), xPos, yPos);
                    ctx.restore();
                }
                
                ctx.restore();
            }
        }

        // ==================== 输入处理 ====================
        class InputHandler {
            constructor() {
                this.setupEventListeners();
            }

            setupEventListeners() {
                canvas.addEventListener('mousemove', (e) => {
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    targetCx = (mouseX - centerX) * 0.4;
                    targetCy = (mouseY - centerY) * 0.4;
                });

                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        document.body.style.display = 'none';
                        cancelAnimationFrame(animationId);
                    } else if (e.key === 'PageUp') {
                        e.preventDefault();
                        targetSpeed = Math.min(CONFIG.maxSpeed, targetSpeed + 0.3);
                    } else if (e.key === 'PageDown') {
                        e.preventDefault();
                        targetSpeed = Math.max(CONFIG.minSpeed, targetSpeed - 0.3);
                    }
                });

                window.addEventListener('resize', () => this.resize());
            }

            resize() {
                width = canvas.width = window.innerWidth;
                height = canvas.height = window.innerHeight;
                centerX = width / 2;
                centerY = height / 2;
            }

            update() {
                // 贝塞尔缓入缓出插值
                const t1 = 0.08;
                const ease1 = t1 * t1 * (3 - 2 * t1); // smoothstep
                cx = lerp(cx, targetCx, ease1);
                cy = lerp(cy, targetCy, ease1);
                currentSpeed = lerp(currentSpeed, targetSpeed, 0.05);
                speedIndicator.textContent = \`速度: \${currentSpeed.toFixed(1)}x\`;
            }
        }

        // ==================== 主程序 ====================
        let starField, tunnel, pig, inputHandler;

        function init() {
            width = canvas.width = window.innerWidth;
            height = canvas.height = window.innerHeight;
            centerX = width / 2;
            centerY = height / 2;
            
            starField = new StarField();
            tunnel = new Tunnel();
            pig = new DigitalPig3D();
            inputHandler = new InputHandler();
            
            animate();
        }

        function animate() {
            const trailAlpha = Math.max(0.1, 0.50 - currentSpeed * 0.04);
            ctx.fillStyle = \`rgba(0, 0, 0, \${trailAlpha})\`;
            ctx.fillRect(0, 0, width, height);
            
            frameCount++;
            
            inputHandler.update();
            tunnel.update();
            tunnel.draw();
            starField.update();
            starField.drawTrails();
            starField.draw();
            pig.update();
            pig.draw();
            
            animationId = requestAnimationFrame(animate);
        }

        init();
    </script>
</body>
</html>`;
}
