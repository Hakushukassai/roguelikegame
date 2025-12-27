const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let scaleFactor = 1;
// --- 修正版 resizeCanvas ---
function resizeCanvas() {
    let winW = window.innerWidth;
    let winH = window.innerHeight;

    // モバイルのアドレスバー対策：
    // 正確なウィンドウサイズをCSSスタイルにも適用して、引き伸ばしを防ぐ
    canvas.style.width = winW + 'px';
    canvas.style.height = winH + 'px';

    const isPortrait = winH > winW;
    // 縦画面時の基準幅を900から少し広げることで、視野の狭さを軽減（お好みで調整可）
    const targetWidth = isPortrait ? 1080 : 1600;

    scaleFactor = winW < targetWidth ? targetWidth / winW : 1;
    
    canvas.width = winW * scaleFactor;
    canvas.height = winH * scaleFactor;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

function togglePause() {
    // ゲームオーバー時などは無効
    let gameOverElem = document.getElementById('game-over');
    let levelUpElem = document.getElementById('menu-overlay');
    let startScreenElem = document.getElementById('start-screen');
    
    if (gameOverElem.style.display === 'flex' || 
        levelUpElem.style.display === 'flex' || 
        startScreenElem.style.display === 'flex') {
        return;
    }

    let menu = document.getElementById('pause-menu');

    if (!isPaused) {
        // --- ポーズ ---
        isPaused = true;
        gameActive = false;
        
        // ★修正点1：ポーズした瞬間の時刻を記録
        pausedAt = Date.now(); 
        
        // 現在のスコアなどを表示反映
        document.getElementById('pause-score').innerText = Math.floor(score);
        document.getElementById('pause-lv').innerText = level;

        // CSSアニメーション用クラス付与
        menu.classList.add('active'); 
    } else {
        // --- 再開 ---
        isPaused = false;
        menu.classList.remove('active');
        
        // ★修正点2：経過時間の補正
        // (現在時刻 - ポーズした時刻) の分だけ、ゲーム開始時間(startTime)を後ろにずらす
        if (pausedAt) {
            let duration = Date.now() - pausedAt;
            startTime += duration;
            pausedAt = 0;
        }
        
        // 時間同期
        lastTime = performance.now(); 
        
        gameActive = true; 
        requestAnimationFrame(loop); 
    }
}

function restartGame() {
    location.reload();
}

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    Sound.init();
    Sound.play('levelup');
    gameActive = true;
    player.x = canvas.width/2;
    player.y = canvas.height/2;
    startTime = Date.now();
    lastTime = performance.now();
    updateSkillList();
    updateUI(); // Init UI text
    requestAnimationFrame(loop);
}

function showMilestone() {
    gameActive = false;
    Sound.play('milestone');
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    document.querySelector('#menu-title').innerText = "禁断の力 (Lv"+level+")";

    let pool = MILESTONE_DATA.filter(item => {
        let classMatch = !item.classes || item.classes.includes(player.class);
        let notOwned = !item.isOwned || !item.isOwned();
        return classMatch && notOwned;
    });

    pool.sort(() => Math.random() - 0.5);
    let opts = pool.slice(0, 3);

    if(level >= 100) {
        let singOpt = {
            id: 'singularity', // IDを追加
            title: "🌌 限界突破 (SINGULARITY)", 
            desc: "全ステータス +20%UP", 
            func: ()=>{ // funcプロパティとして定義
                stats.dmg*=1.2; stats.spd+=1; stats.rate*=0.9; 
                stats.bulletSpeed*=1.2; player.maxHp*=1.2; player.hp=player.maxHp;
            }
        };
        let el = document.createElement('div'); el.className='card singularity';
        el.innerHTML = `<span class="icon">🌌</span><h3>${singOpt.title}</h3><p>${singOpt.desc}</p>`;
        // ▼▼▼ 修正 ▼▼▼
        el.onclick = () => { applyUpgrade(singOpt); resume(); };
        // ▲▲▲ 修正 ▲▲▲
        c.appendChild(el);
        opts = opts.slice(0, 2); 
    }

    opts.forEach(o => {
        // データ構造を合わせるためのアダプタ処理
        // MILESTONE_DATA は f:()=>... となっているので func に統一して扱う
        let itemForUpgrade = { ...o, func: o.f };

        let el = document.createElement('div'); el.className='card milestone';
        let icon = o.title.split(' ')[0]; 
        let title = o.title.split(' ').slice(1).join(' ');
        el.innerHTML = `<span class="icon">${icon}</span><h3>${title}</h3><p>${o.desc}</p>`;
        
        // ▼▼▼ 修正 ▼▼▼
        el.onclick = () => { applyUpgrade(itemForUpgrade); resume(); };
        // ▲▲▲ 修正 ▲▲▲
        
        c.appendChild(el);
    });

    if(opts.length === 0 && level < 100) {
        let limitBreak = {
            id: 'limit_break',
            title: "LIMIT BREAK",
            func: () => { stats.dmg*=1.5; stats.hp+=100; }
        };
        let el = document.createElement('div'); el.className='card milestone';
        el.innerHTML = `<h3>LIMIT BREAK</h3><p>全ステータス強化</p>`;
        el.onclick = () => { applyUpgrade(limitBreak); resume(); };
        c.appendChild(el);
    }
}

function getCurrentStatString(id) {
    const s = stats;
    switch(id) {
        case 'dmg_p': return `攻撃力: ${Math.floor(s.dmg)}`;
        case 'hp': return `最大HP: ${Math.floor(player.maxHp)}`;
        case 'spd': return `移動速度: ${s.spd.toFixed(1)}`;
        case 'crit': return `会心率: ${(s.critChance*100).toFixed(0)}%`;
        case 'magnet': return `収集範囲: ${Math.floor(s.magnet)}`;
        case 'rate': return `連射速度: ${(60/s.rate).toFixed(1)}/秒`;
        case 'lightning': return `レベル: ${s.lightning}`;
        case 'phantom_strike': return `レベル: ${s.phantomStrike}`;
        case 'void_rift': return `レベル: ${s.voidRift}`;
        case 'regen': return `リジェネ: ${s.regen}/秒`;
        case 'drone': return `所持数: ${s.drones}`;
        case 'missile': return `レベル: ${s.missile}`;
        case 'chakram': return `所持数: ${s.chakram}`;
        case 'homing': return `レベル: ${s.homing}`;
        case 'area': return `攻撃範囲: ${(s.areaScale*100).toFixed(0)}%`;
        case 'bullet_speed': return `弾速: ${s.bulletSpeed.toFixed(0)}`;
        case 'pierce': return `貫通数: ${s.pierce}`;
        case 'duration': return `効果時間: ${(s.duration*100).toFixed(0)}%`;
        case 'armor': return `装甲: ${s.armor}`;
        case 'knockback': return `衝撃力: ${s.knockback}`;
        case 'dodge': return `回避率: ${(s.dodge*100).toFixed(0)}%`;
        case 'multi_blade': case 'multi_wave': case 'multi_shot': return `個数: ${s.multi}`;
        case 'sonic_boom': return `レベル: ${stats.sonicBoom}`;
        default: return '';
    }
}

function showUpgrade() {
    gameActive = false;
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    document.querySelector('#menu-title').innerText = "LEVEL UP!";

    let validPool = UPGRADE_DATA.filter(item => !item.condition || item.condition());
    if (validPool.length < 3) validPool = UPGRADE_DATA.slice(0, 5); 

    validPool.sort(() => Math.random() - 0.5);
    
    let choices = [];
    let pickedIds = new Set();
    
    for (let item of validPool) {
        if (choices.length >= 3) break;
        if (pickedIds.has(item.id)) continue; 
        
        let opt = { ...item };
        
        // ▼▼▼ 修正箇所：レア判定ロジック ▼▼▼
        if (Math.random() < 0.1) {
            opt.isRare = true;
            // HPなら3倍、リジェネなら5倍、それ以外は2倍
            let mult = (opt.id === 'hp') ? 3 : (opt.id === 'regen' ? 5 : 2);
            opt.val = Math.floor(opt.val * mult);
        }
        // ▲▲▲ 修正ここまで ▲▲▲

        choices.push(opt);
        pickedIds.add(item.id);
    }

    choices.forEach(o => {
        let el = document.createElement('div'); 
        el.className = 'card';
        if(o.isRare) el.classList.add('rare');
        
        let title = o.isRare ? `✨ ${o.title}` : o.title;
        let desc = o.desc(o.val);
        
        let currentStat = getCurrentStatString(o.id);
        
        el.innerHTML = `
            <span class="icon">${o.icon}</span>
            <h3>${title}</h3>
            <p>${desc}</p>
            <div style="font-size:10px; color:#888; border-top:1px solid #444; margin-top:6px; padding-top:4px;">
                現在: <span style="color:#0ff">${currentStat}</span>
            </div>
        `;
        
        el.onclick = () => { applyUpgrade(o, o.val); resume(); };
        c.appendChild(el);
    });
}

// ▼▼▼ ここからコピー ▼▼▼

// 1. 共通のカード生成ヘルパー関数 (これが足りなかった部分です！)
function createEvoCard(item, isSecond) {
    let el = document.createElement('div'); 
    el.className = 'card evo';
    el.innerHTML = `<span class="icon">${item.icon}</span><h3>${item.title}</h3><p>${item.desc}</p>`;
    
    el.onclick = () => { 
        // クラス変更処理などは applyUpgrade に任せてもいいが、
        // ここでは「クリック時のUI更新」と「データ適用」を分ける
        
        player.color = item.color;
        let nameSpan = document.getElementById('disp-class-name');
        nameSpan.innerText = `(${item.title})`; 
        nameSpan.style.color = player.color;

        if (isSecond) {
            player.subClass = item.id;
        } else {
            player.class = item.id;
        }

        // ▼▼▼ 修正: applyUpgrade を通す ▼▼▼
        applyUpgrade(item); 
        // ▲▲▲ 修正完了 ▲▲▲
        
        resume(); 
    };
    return el;
}

// 2. 第1次進化 (Level 5)
function showEvo() {
    gameActive = false;
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    document.querySelector('#menu-title').innerText = "クラス進化";

    // 定義データ(EVO_DATA)からカードを生成して並べる
    EVO_DATA.forEach(item => {
        c.appendChild(createEvoCard(item, false));
    });
}

// 3. 第2次進化 (Level 40)
function showSecondEvo() {
    gameActive = false;
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    document.querySelector('#menu-title').innerText = "第2次進化 (Class Evolution)";

    // 現在のクラスから派生する進化先だけを抽出
    let validEvos = SECOND_EVO_DATA.filter(item => item.parent === player.class);

    if(validEvos.length > 0) {
        validEvos.forEach(item => {
            c.appendChild(createEvoCard(item, true));
        });
    } else {
        // 万が一進化先がない場合
        let el = document.createElement('div'); el.className='card milestone';
        el.innerHTML = `<h3>LIMIT BREAK</h3><p>全ステータス強化</p>`;
        el.onclick = () => { stats.dmg*=1.5; stats.hp+=100; resume(); };
        c.appendChild(el);
    }
}
// ▲▲▲ ここまでコピー ▲▲▲

function resume() {
    document.getElementById('menu-overlay').style.display = 'none';
    lastTime = performance.now(); gameActive = true; updateSkillList(); requestAnimationFrame(loop);
}

function createParticles(x,y,c,n,sizeBase) { 
    if(particles.length > MAX_PARTICLES) return; 
    for(let i=0;i<n;i++) particles.push({ x:x, y:y, vx:(Math.random()-0.5)*12, vy:(Math.random()-0.5)*12, life:10+Math.random()*5, size:(sizeBase||4)+Math.random()*2, color:c }); 
}

function updateStatsDisplay() {
    const s = stats;
    let atkPerSec = (60 / s.rate).toFixed(1); 
    
    let html = `
        <span style="color:#ff8888">攻撃力 </span> : ${Math.floor(s.dmg)} <br>
        <span style="color:#ffff88">連射 </span> : ${atkPerSec}/秒 <br>
        <span style="color:#88ff88">移動 </span> : ${s.spd.toFixed(1)} <br>
        <span style="color:#88ffff">範囲 </span> : ${(s.areaScale * 100).toFixed(0)}% <br>
        <span style="color:#ff88ff">会心 </span> : ${(s.critChance * 100).toFixed(0)}% <br>
    `;
    
    // 0より大きい場合のみ表示する項目
    if(s.pierce > 0) html += `貫通 : ${s.pierce} <br>`;
    if(s.magnet > 150) html += `収集 : ${Math.floor(s.magnet)} <br>`;
    if(s.armor > 0) html += `装甲 : ${s.armor} <br>`;
    if(s.dodge > 0) html += `回避 : ${(s.dodge * 100).toFixed(0)}% <br>`;
    if(s.regen > 1) html += `回復 : ${s.regen}/秒 <br>`;
    if(s.bulletSpeed > 20 || s.bulletSpeed < 10) html += `弾速 : ${s.bulletSpeed.toFixed(0)} <br>`;
    
    document.getElementById('stats-list').innerHTML = html;
}

function updateUI() {
    document.getElementById('disp-lv').innerText = level;
    let hpPer = Math.max(0, player.hp / player.maxHp * 100);
    document.getElementById('hp-bar-fill').style.width = hpPer + '%';
    document.getElementById('disp-hp-val').innerText = Math.floor(player.hp);
    document.getElementById('disp-hp-max').innerText = Math.floor(player.maxHp);
    
    // ここでリジェネ表示を書き換え（/s -> /秒）
    document.getElementById('hp-regen-text').innerHTML = `+<span id="disp-regen">${stats.regen}</span>/秒`;
    
    document.getElementById('disp-score').innerText = score;

    updateStatsDisplay();
}

function updateSkillList() {
    let list = document.getElementById('skill-list');
    let html = "";
    
    if(singularityMode) html += `<div style="color:#000; text-shadow:0 0 5px #fff; font-weight:bold;">🌌 限界突破モード</div>`;

    // 英語名を日本語表示に変換するマップ
    const JP_NAMES = {
        'omegaLaser': '⚡ オメガレーザー',
        'absoluteZero': '❄️ アブソリュートゼロ',
        'titan': '🦍 タイタン',
        'gatling': '⚙️ ガトリング',
        'railgun': '🚅 レールガン',
        'chainBurst': '💥 チェーンバースト',
        'electroFence': '⚡ エレクトロフェンス',
        'shrapnel': '💥 シュラプネル',
        'reactiveArmor': '⚡ リアクティブアーマー',
        'earthquake': '🌎 アースクエイク'
    };

    SKILL_DISPLAY_LIST.forEach(item => {
        if (stats[item.key]) {
            // マップにあれば日本語を、なければ元のラベルを使用
            let label = JP_NAMES[item.key] || item.label;
            html += `<div style="color:${item.color}">${label}</div>`;
        }
    });

    activeSkills.forEach(skill => {
        // アクティブスキルのIDも日本語化
        let label = JP_NAMES[skill.id] || skill.id.toUpperCase();
        let cdText = skill.timer <= 0 ? "OK" : (Math.ceil(skill.timer/60) + "秒");
        html += `<div style="color:#0ff">⚡ ${label} [${cdText}]</div>`;
    });
    
    if(stats.sentrySystem) html += `<div style="color:#0f0">🏗️ セントリー (${sentries.length})</div>`;
    if(stats.siegeMode) {
        let active = stats.isStationary ? "(ON)" : "(OFF)";
        html += `<div style="color:#0f0">🏯 シージモード ${active}</div>`;
    }
    if(stats.forceField) {
        let ready = stats.forceFieldCd <= 0 ? "OK" : Math.ceil(stats.forceFieldCd/60)+"秒";
        html += `<div style="color:#0ff">🛡️ バリア [${ready}]</div>`;
    }

    // パッシブ系スキルのレベル表示
    if(stats.lightning > 0) html += `<div style="color:#ff0">🌩️ ライトニング Lv${stats.lightning}</div>`;
    if(stats.phantomStrike > 0) html += `<div style="color:#ccc">👻 ファントム Lv${stats.phantomStrike}</div>`;
    if(stats.voidRift > 0) html += `<div style="color:#d0f">🌀 ヴォイド Lv${stats.voidRift}</div>`;
    if(stats.missile > 0) html += `<div style="color:#fa0">🚀 ミサイル Lv${stats.missile}</div>`;
    if(stats.drones > 0) html += `<div style="color:#ff0">🛰️ ドローン x${stats.drones}</div>`;
    if(stats.homing > 0) html += `<div style="color:#8ff">👁️ ホーミング Lv${stats.homing}</div>`;
    if(stats.chakram > 0) html += `<div style="color:#f88">🥏 チャクラム x${stats.chakram}</div>`;
    if(stats.poison > 0) html += `<div style="color:#a0f">☣️ ポイズン Lv${stats.poison}</div>`;

    list.innerHTML = html;
}

function gameOver() {
    gameActive = false;
    document.getElementById('final-score').innerText = score;
    document.getElementById('game-over').style.display = 'flex';
}

function triggerWarning() {
    Sound.play('alert');
    let overlay = document.getElementById('warning-overlay');
    overlay.style.display = 'flex'; // CSSでflexレイアウトが指定されているためflexにする
}

function draw() {
    // 1. 画面クリア
    ctx.fillStyle = '#050505'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. カメラ位置の計算
    let shakeX = (Math.random() - 0.5) * screenShake;
    let shakeY = (Math.random() - 0.5) * screenShake;
    
    let camX = player.x - canvas.width / 2;
    let camY = player.y - canvas.height / 2;

    ctx.save();
    // 3. 全体をカメラの分だけ逆方向にずらす
    ctx.translate(-camX + shakeX, -camY + shakeY);

    // --- 背景グリッドの描画 ---
    const gridSize = 100;
    let startX = Math.floor(camX / gridSize) * gridSize;
    let startY = Math.floor(camY / gridSize) * gridSize;
    
    ctx.strokeStyle = '#1a1a1a'; 
    ctx.lineWidth = 1; 
    ctx.beginPath();
    for(let i = startX; i < startX + canvas.width + gridSize; i += gridSize) { 
        ctx.moveTo(i, startY - gridSize); 
        ctx.lineTo(i, startY + canvas.height + gridSize); 
    }
    for(let i = startY; i < startY + canvas.height + gridSize; i += gridSize) { 
        ctx.moveTo(startX - gridSize, i); 
        ctx.lineTo(startX + canvas.width + gridSize, i); 
    }
    ctx.stroke();

    // ------------------------------------------
    // ★追加: 星雲 (Nebula) の描画
    // ------------------------------------------
    if(typeof nebulas !== 'undefined') {
        nebulas.forEach(n => {
            // 画面外カリング
            if(Math.abs(n.x - player.x) > canvas.width && Math.abs(n.y - player.y) > canvas.height) return;

            let grad = ctx.createRadialGradient(n.x, n.y, n.r * 0.2, n.x, n.y, n.r);
            grad.addColorStop(0, n.color);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2); ctx.fill();
            
            // 粒子感
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            for(let i=0; i<3; i++) {
                 let px = n.x + Math.sin(Date.now()*0.001 + i)*n.r*0.5;
                 let py = n.y + Math.cos(Date.now()*0.002 + i)*n.r*0.5;
                 ctx.beginPath(); ctx.arc(px, py, n.r*0.1, 0, Math.PI*2); ctx.fill();
            }
        });
    }

    // --- 各種エフェクト描画 ---

    // 絶対零度オーラ
    if(stats.absoluteZero) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.beginPath(); ctx.arc(player.x, player.y, 250, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)'; ctx.lineWidth=1; ctx.stroke();
    }
    // 電気柵
    if(stats.electroFence) {
        // electroFenceTimer が未定義の場合のエラー防止
        let timerVal = (typeof electroFenceTimer !== 'undefined') ? electroFenceTimer : 0;
        ctx.strokeStyle = `rgba(136, 255, 255, ${(timerVal/60)})`;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(player.x, player.y, 150, 0, Math.PI*2); ctx.stroke();
    }

    // ガス雲
    gasClouds.forEach(g => { ctx.fillStyle = `rgba(100, 0, 150, ${g.life/100})`; ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI*2); ctx.fill(); });

    // セントリー
    sentries.forEach(s => {
        ctx.fillStyle = '#0f0'; ctx.fillRect(s.x-10, s.y-10, 20, 20);
        ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.strokeRect(s.x-10, s.y-10, 20, 20);
    });
    // テスラグリッド
    if(stats.teslaGrid && sentries.length >= 2) {
        ctx.strokeStyle = '#0ff'; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sentries[0].x, sentries[0].y);
        for(let i=1; i<sentries.length; i++) ctx.lineTo(sentries[i].x, sentries[i].y);
        ctx.lineTo(sentries[0].x, sentries[0].y);
        ctx.stroke();
    }

    // 飛剣
    if(player.class === 'Melee' && flyingSwords.length > 0) {
        ctx.fillStyle = '#f0a';
        flyingSwords.forEach(sw => {
            ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(Date.now()*0.1);
            ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(5, 5); ctx.lineTo(-5, 5); ctx.fill();
            ctx.restore();
            ctx.strokeStyle = 'rgba(255, 0, 100, 0.3)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(sw.x, sw.y); ctx.stroke();
        });
    }

    // スパイクビット
    if(player.class === 'Melee' && spikeBits.length > 0) {
        ctx.fillStyle = '#f00';
        spikeBits.forEach(bit => {
            ctx.beginPath(); ctx.moveTo(bit.x, bit.y - 8); ctx.lineTo(bit.x + 6, bit.y + 6); ctx.lineTo(bit.x - 6, bit.y + 6); ctx.fill();
        });
    }

    // オーラ
    if(stats.aura) {
        ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(Date.now() * 0.005);
        let r = stats.auraRange * stats.auraScale * stats.areaScale;
        let auraColor = '0, 255, 255';
        if(player.subClass === 'SunCrusher') {
            auraColor = '255, 100, 0'; 
            if(player.isMoving) r += player.sunCharge * 2;
        }

        let grad = ctx.createRadialGradient(0, 0, r*0.5, 0, 0, r);
        grad.addColorStop(0, `rgba(${auraColor}, 0)`); grad.addColorStop(0.8, `rgba(${auraColor}, 0.2)`);
        if(stats.gravityAura) grad.addColorStop(0.9, 'rgba(100, 0, 200, 0.4)'); 
        if(stats.blackHole) { grad.addColorStop(1, 'rgba(0, 0, 0, 0.6)'); ctx.strokeStyle='#f0f'; } 
        else ctx.strokeStyle = `rgba(${auraColor}, 0.5)`;
        
        ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
        ctx.lineWidth = 2;
        ctx.beginPath(); for(let i=0; i<3; i++) { ctx.rotate(Math.PI*2/3); ctx.moveTo(r * 0.6, 0); ctx.lineTo(r, 0); }
        ctx.stroke(); ctx.restore();
    }

    // オービタル
    ctx.fillStyle = '#0ff';
    orbitals.forEach(o => { ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, Math.PI*2); ctx.fill(); });
    
    // ドローン
    drones.forEach(d => {
        ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(Date.now() * 0.01);
        ctx.fillStyle = '#ff0'; ctx.fillRect(-6, -6, 12, 12);
        ctx.strokeStyle = '#fff'; ctx.strokeRect(-6, -6, 12, 12);
        ctx.restore();
    });

    // フォースフィールド
    if(stats.forceField && stats.forceFieldCd <= 0) {
        ctx.strokeStyle = `rgba(0, 255, 255, 0.8)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(player.x, player.y, player.size + 10, 0, Math.PI*2); ctx.stroke();
    }

    // アイテム
    items.forEach(it => {
        ctx.save(); ctx.translate(it.x, it.y);
        let s = 1.0 + Math.sin(Date.now()*0.01)*0.2;
        ctx.scale(s, s);
        ctx.font = '24px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline='middle';
        if(it.type === 'magnet') ctx.fillText('🧲', 0, 0);
        else if(it.type === 'bomb') ctx.fillText('💣', 0, 0);
        ctx.restore();
    });

    // プレイヤー描画 (無敵点滅)
    if(player.invincible % 10 < 5) {
        drawPlayerSprite(ctx, player);
    }

    // 弾丸
    bullets.forEach(b => { 
        if(b.type === 'slash') {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle);
            ctx.globalAlpha = Math.max(0, b.life / 15); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, b.size, -Math.PI/1.8, Math.PI/1.8); ctx.fill();
            ctx.strokeStyle = '#ccffff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(b.size + 20, 0); ctx.stroke();
            ctx.restore();
            return;
        }
        else if(b.type === 'sonic') {
            ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx));
            ctx.globalAlpha = 0.8; ctx.fillStyle = b.color || '#ccffff'; ctx.shadowBlur = 10; ctx.shadowColor = b.color || '#ccffff';
            ctx.beginPath(); ctx.arc(-5, 0, b.size, -Math.PI/2, Math.PI/2); ctx.lineTo(b.size * 2.0, 0); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-5, 0, b.size * 0.8, -Math.PI/2, Math.PI/2); ctx.stroke();
            ctx.restore();
            return;
        }
        else if(b.type === 'omega') {
            ctx.fillStyle = `rgba(255, 0, 255, ${b.life/30})`;
            ctx.fillRect(camX, camY, canvas.width, canvas.height); 
            ctx.fillStyle = '#fff'; ctx.fillRect(camX, b.y - 50, canvas.width, 100);
            return;
        }
        else if(b.type === 'void') {
            let progress = 1.0 - (b.life / b.maxLife); 
            ctx.strokeStyle = b.color; ctx.lineWidth = 3;
            ctx.beginPath(); let r = b.size * (1.5 - progress * 0.5); ctx.arc(b.x, b.y, r, 0, Math.PI*2); ctx.stroke();
            ctx.fillStyle = b.color; ctx.globalAlpha = 0.5 * progress;
            ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.5 * progress, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 1.0;
            return;
        }
        else if(b.type === 'missile') {
            ctx.fillStyle = '#f80'; ctx.beginPath(); ctx.moveTo(b.x, b.y-8); ctx.lineTo(b.x+6, b.y+6); ctx.lineTo(b.x-6, b.y+6); ctx.fill();
        } else if(b.type === 'chakram') {
            ctx.fillStyle = '#0ff'; ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Date.now() * 0.2);
            ctx.fillRect(-b.size/2, -b.size/2, b.size, b.size); ctx.restore();
        } else if(b.type === 'spirit') {
            ctx.fillStyle = '#8f8'; ctx.beginPath(); ctx.arc(b.x, b.y, 6, 0, Math.PI*2); ctx.fill();
        } else {
            let drawSize = (player.class === 'Sniper' && b.type === 'normal') ? 8 : b.size;
            if(b.isMini) drawSize = 2;
            ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(b.x, b.y, drawSize, 0, Math.PI*2); ctx.fill(); 
        }
    });
    
    // 敵弾
    ctx.fillStyle = '#fff'; 
    enemyBullets.forEach(b => { ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI*2); ctx.fill(); });

    // 敵の描画
    enemies.forEach(e => {
        ctx.fillStyle = e.frozen > 0 ? '#0ff' : (e.flash > 0 ? '#fff' : e.color); 
        ctx.beginPath();
        if(e.type === 'boss') {
            drawBossSprite(ctx, e);

            // ボスのHPバー
            const barWidth = 120;  const barHeight = 10;
            const barX = e.x - barWidth / 2; const barY = e.y - e.size - 25;
            let hpRatio = e.hp / e.maxHp; hpRatio = Math.max(0, Math.min(1, hpRatio)); 
            ctx.fillStyle = '#400'; ctx.fillRect(barX, barY, barWidth, barHeight);
            ctx.fillStyle = '#0f0'; ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(barX, barY, barWidth, barHeight);
        } else if(e.type === 'golem') {
            ctx.fillRect(e.x-e.size, e.y-e.size, e.size*2, e.size*2);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(e.x-e.size, e.y-e.size, e.size*2, e.size*2);
        } 
        
        // ★追加: アステロイド (drift AI) の描画
        else if(e.ai === 'drift') {
            ctx.save();
            ctx.translate(e.x, e.y);
            ctx.rotate(e.rotation || 0);
            
            ctx.beginPath();
            let sides = 7;
            for(let i=0; i<sides; i++) {
                let ang = (Math.PI*2/sides) * i;
                let r = e.size * (0.8 + Math.sin(i*132)*0.2); 
                ctx.lineTo(Math.cos(ang)*r, Math.sin(ang)*r);
            }
            ctx.closePath();
            ctx.fillStyle = e.color; // color is inherited
            ctx.fill();
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 2;
            ctx.stroke();
            
            ctx.restore();
        }
        
        else {
            if(e.ai === 'dasher') { ctx.moveTo(e.x, e.y-e.size); ctx.lineTo(e.x+e.size, e.y+e.size); ctx.lineTo(e.x-e.size, e.y+e.size); ctx.closePath(); }
            else if(e.ai === 'splitter') { ctx.rect(e.x-e.size, e.y-e.size, e.size*2, e.size*2); }
            else if(e.ai === 'bat') { ctx.moveTo(e.x, e.y-e.size); ctx.lineTo(e.x+e.size, e.y); ctx.lineTo(e.x, e.y+e.size); ctx.lineTo(e.x-e.size, e.y); ctx.closePath(); }
            else if(e.ai === 'shooter') { ctx.rect(e.x-e.size, e.y-e.size, e.size*2, e.size*2); }
            else if(e.ai === 'tank') { for(let i=0; i<6; i++) { let ang = i * Math.PI / 3; let px = e.x + Math.cos(ang) * e.size; let py = e.y + Math.sin(ang) * e.size; if(i===0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
            else { ctx.arc(e.x, e.y, e.size, 0, Math.PI*2); }
            ctx.fill();
        }
    });

    // 経験値オーブ
    expOrbs.forEach(o => { ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(o.x, o.y, o.size, 0, Math.PI*2); ctx.fill(); });
    
    // パーティクル
    particles.forEach(p => {
        if(p.type === 'lightning') {
            ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.globalAlpha = p.life / 10; 
            ctx.beginPath(); ctx.moveTo(p.x1, p.y1);
            let midX = (p.x1 + p.x2) / 2 + (Math.random()-0.5)*30; let midY = (p.y1 + p.y2) / 2 + (Math.random()-0.5)*30;
            ctx.lineTo(midX, midY); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.globalAlpha = 1.0; 
        } else if(p.type === 'shockwave') {
            ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.globalAlpha = p.life/15;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha=1;
        } else {
            ctx.fillStyle = p.color; ctx.globalAlpha = p.life / 20; ctx.fillRect(p.x, p.y, p.size, p.size); ctx.globalAlpha = 1.0;
        }
    });

    // ダメージテキスト
    ctx.font = 'bold 16px sans-serif';
    texts.forEach(t => { ctx.fillStyle = t.color || 'white'; ctx.fillText(t.str, t.x, t.y); });

    // --- カメラの座標変換を解除 ---
    ctx.restore();

    // --- 画面固定のUI (ビネット効果) ---
    let grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 100, canvas.width/2, canvas.height/2, 800);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// --- プレイヤー描画専用関数 (向き固定版) ---
function drawPlayerSprite(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    
    // 向きの固定ロジック
    if (typeof p.lastAngle === 'undefined') p.lastAngle = -Math.PI / 2;
    let angle = p.lastAngle;

    if (joyTouchId !== null && (joyMoveX !== 0 || joyMoveY !== 0)) {
        angle = Math.atan2(joyMoveY, joyMoveX);
        p.lastAngle = angle;
    } else {
        let dx = 0, dy = 0;
        if(keys['w'] || keys['ArrowUp']) dy -= 1;
        if(keys['s'] || keys['ArrowDown']) dy += 1;
        if(keys['a'] || keys['ArrowLeft']) dx -= 1;
        if(keys['d'] || keys['ArrowRight']) dx += 1;
        if (dx !== 0 || dy !== 0) {
            angle = Math.atan2(dy, dx);
            p.lastAngle = angle;
        }
    }

    // 共通の発光エフェクト（クラス持ちの場合）
    if(p.class !== 'Novice') {
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
    }

    if (p.subClass) {
        drawSecondEvo(ctx, p, angle);
    } else if (p.class !== 'Novice') {
        drawFirstEvo(ctx, p, angle);
    } else {
        // Novice: シンプルな二重リング
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        let pulse = Math.sin(Date.now()*0.01)*2;
        ctx.beginPath(); ctx.arc(0, 0, p.size + 3 + pulse, 0, Math.PI*2); ctx.stroke();
    }

    ctx.restore();
}

// ヘルパー: 指定された頂点数で多角形を描く
function drawPoly(ctx, r, sides, rot=0) {
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
        let a = (i * Math.PI * 2) / sides + rot;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
}

// ヘルパー: 鋭いスパイクを描く
function drawSpike(ctx, length, width, offset=0) {
    ctx.beginPath();
    ctx.moveTo(offset + length, 0);
    ctx.lineTo(offset, width);
    ctx.lineTo(offset + length * 0.2, 0); // 芯
    ctx.lineTo(offset, -width);
    ctx.closePath();
}

// 第1次進化 (幾何学・抽象化)
function drawFirstEvo(ctx, p, angle) {
    let t = Date.now() / 1000;
    ctx.lineWidth = 2;

    switch (p.class) {
        case 'Samurai': // 鋭利な「くの字」ブレード
            ctx.rotate(angle);
            ctx.fillStyle = p.color;
            ctx.strokeStyle = '#fff';
            // メインブレード
            drawSpike(ctx, p.size * 2.5, p.size * 0.8, -p.size*0.5);
            ctx.fill(); ctx.stroke();
            // サブブレード (逆側)
            ctx.beginPath();
            ctx.moveTo(-p.size*0.5, 0);
            ctx.lineTo(-p.size*1.5, p.size*0.5);
            ctx.lineTo(-p.size*1.2, 0);
            ctx.lineTo(-p.size*1.5, -p.size*0.5);
            ctx.fill();
            break;

        case 'Assault': // 3つの三角形が前進する形 (トライデント)
            ctx.rotate(angle);
            ctx.fillStyle = p.color;
            // 中央
            drawSpike(ctx, p.size*2.0, p.size*0.6, 0);
            ctx.fill();
            // 左右のウイング
            ctx.fillStyle = '#444'; ctx.strokeStyle = p.color;
            ctx.save(); ctx.translate(0, p.size); drawSpike(ctx, p.size*1.5, p.size*0.4, -p.size*0.5); ctx.fill(); ctx.stroke(); ctx.restore();
            ctx.save(); ctx.translate(0, -p.size); drawSpike(ctx, p.size*1.5, p.size*0.4, -p.size*0.5); ctx.fill(); ctx.stroke(); ctx.restore();
            break;

        case 'Sniper': // 以前と同じ（ユーザー好みの鋭い矢印）
            ctx.rotate(angle);
            ctx.fillStyle = p.color; 
            ctx.beginPath();
            ctx.moveTo(p.size * 2.5, 0);
            ctx.lineTo(-p.size, p.size * 0.7);
            ctx.lineTo(-p.size * 0.5, 0);
            ctx.lineTo(-p.size, -p.size * 0.7);
            ctx.closePath();
            ctx.fill();
            // コア
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-p.size, p.size*0.3); ctx.lineTo(-p.size, -p.size*0.3); ctx.fill();
            break;

        case 'Guardian': // 積層する六角形 (ヘキサゴン・コア)
            ctx.rotate(t * 0.5); // ゆっくり回転
            ctx.strokeStyle = p.color; ctx.lineWidth = 3;
            drawPoly(ctx, p.size * 1.2, 6, 0); ctx.stroke(); // 外殻
            
            ctx.rotate(-t * 1.0); // 逆回転
            ctx.fillStyle = p.color;
            drawPoly(ctx, p.size * 0.7, 6, 0); ctx.fill(); // 核
            break;

        case 'Tempest': // スパークする星型多角形
            // ギザギザのオーラ
            ctx.strokeStyle = p.color;
            ctx.save(); ctx.rotate(t * 2);
            drawPoly(ctx, p.size * 1.3, 4, 0); ctx.stroke();
            ctx.rotate(Math.PI/4); drawPoly(ctx, p.size * 1.3, 4, 0); ctx.stroke();
            ctx.restore();
            // 中心
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0,0, p.size*0.6, 0, Math.PI*2); ctx.fill();
            break;
            
        case 'Alchemist': // 軌道を描く分子構造
            ctx.rotate(angle);
            ctx.fillStyle = p.color;
            ctx.beginPath(); ctx.arc(0,0, p.size*0.8, 0, Math.PI*2); ctx.fill(); // 核
            // 周回する粒子
            ctx.fillStyle = '#fff';
            for(let i=0; i<3; i++) {
                let a = t * 3 + (i * Math.PI * 2 / 3);
                let dist = p.size * 1.5;
                ctx.beginPath(); ctx.arc(Math.cos(a)*dist, Math.sin(a)*dist, 3, 0, Math.PI*2); ctx.fill();
                // 軌跡ライン
                ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth=1;
                ctx.beginPath(); ctx.arc(0,0, dist, 0, Math.PI*2); ctx.stroke();
            }
            break;

        case 'Trickster': // 不定形・非対称
            ctx.rotate(t);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.moveTo(p.size, 0);
            ctx.lineTo(0, p.size);
            ctx.lineTo(-p.size * 0.5, 0); // 非対称な形
            ctx.lineTo(0, -p.size * 1.5);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.stroke();
            break;
            
        default: // Vanguardなど
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
            break;
    }
}

// 第2次進化 (より複雑な幾何学エフェクト)
function drawSecondEvo(ctx, p, angle) {
    let t = Date.now() / 1000;
    ctx.shadowBlur = 15; 
    ctx.shadowColor = p.color;

    // --- ⚔️ Samurai ---
    if (p.subClass === 'Ashura') {
        // 阿修羅: 放射状の鋭い棘 (ウニ型)
        ctx.rotate(t * 5); // 全体回転
        ctx.fillStyle = p.color;
        for(let i=0; i<6; i++) {
            ctx.rotate(Math.PI*2/6);
            drawSpike(ctx, p.size*2.5, p.size*0.5, 0); ctx.fill();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0, p.size*0.8, 0, Math.PI*2); ctx.fill();
    } 
    else if (p.subClass === 'Kensei') {
        // 剣聖: 非常に長い一直線の光 (レーザー状)
        ctx.rotate(angle);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-p.size*1.5, -2, p.size*6, 4); // 中心線
        // 周囲のフィールド
        ctx.fillStyle = `rgba(100, 200, 255, 0.4)`;
        ctx.beginPath();
        ctx.moveTo(p.size*4, 0);
        ctx.lineTo(-p.size, p.size);
        ctx.lineTo(-p.size*0.5, 0);
        ctx.lineTo(-p.size, -p.size);
        ctx.fill();
    }

    // --- 🔫 Assault ---
    else if (p.subClass === 'BulletStorm') {
        // バレットストーム: リング状に並んだ三角形が高速回転
        ctx.rotate(angle);
        // コア
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0,0, p.size, 0, Math.PI*2); ctx.fill();
        // リングビット
        ctx.save(); ctx.rotate(t * 10);
        ctx.fillStyle = '#fff';
        for(let i=0; i<8; i++) {
            ctx.rotate(Math.PI*2/8);
            ctx.beginPath(); ctx.moveTo(p.size*1.8, 0); ctx.lineTo(p.size*1.2, 4); ctx.lineTo(p.size*1.2, -4); ctx.fill();
        }
        ctx.restore();
    }
    else if (p.subClass === 'ClusterStriker') {
        // クラスター: 四角いブロックが展開・収縮
        ctx.rotate(angle);
        let pulse = Math.sin(t*10) * 5;
        ctx.fillStyle = '#f80';
        // 4つのブロック
        ctx.fillRect(5+pulse, 5+pulse, p.size, p.size);
        ctx.fillRect(5+pulse, -15-pulse, p.size, p.size);
        ctx.fillRect(-15-pulse, 5+pulse, p.size, p.size);
        ctx.fillRect(-15-pulse, -15-pulse, p.size, p.size);
        // コア
        ctx.fillStyle = '#fff'; ctx.fillRect(-5,-5, 10, 10);
    }

    // --- 🔭 Sniper ---
    else if (p.subClass === 'DimensionWalker') {
        // 次元: グリッチする鋭利な破片
        ctx.rotate(angle);
        let drawShard = (col, offX) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(p.size*3.0 + offX, 0);
            ctx.lineTo(-p.size + offX, p.size);
            ctx.lineTo(0 + offX, 0);
            ctx.lineTo(-p.size + offX, -p.size);
            ctx.fill();
        };
        let shift = Math.random() * 6;
        drawShard('rgba(255,0,0,0.5)', shift);
        drawShard('rgba(0,0,255,0.5)', -shift);
        ctx.strokeStyle = '#fff'; ctx.lineWidth=2;
        ctx.beginPath(); ctx.moveTo(p.size*3,0); ctx.lineTo(-p.size, p.size); ctx.lineTo(0,0); ctx.lineTo(-p.size, -p.size); ctx.stroke();
    }
    else if (p.subClass === 'PrismShooter') {
        // プリズム: 3つのひし形が回転して結晶化
        ctx.rotate(t); 
        ctx.fillStyle = 'rgba(255, 0, 255, 0.6)'; ctx.strokeStyle = '#fff';
        for(let i=0; i<3; i++) {
            ctx.rotate(Math.PI*2/3);
            ctx.beginPath(); ctx.moveTo(0, -p.size*2); ctx.lineTo(p.size*0.8, 0); ctx.lineTo(0, p.size*2); ctx.lineTo(-p.size*0.8, 0); ctx.fill(); ctx.stroke();
        }
        // 中心コア
        ctx.rotate(-t*2);
        ctx.fillStyle = '#fff'; drawPoly(ctx, p.size*0.5, 4, 0); ctx.fill();
    }

    // --- ⚡ Tempest ---
    else if (p.subClass === 'Thor') {
        // トール: 十字型の高エネルギー体
        ctx.rotate(angle);
        ctx.fillStyle = '#ff0'; ctx.strokeStyle = '#fff'; ctx.lineWidth=3;
        // 横棒
        ctx.fillRect(-p.size, -p.size*2.5, p.size*2, p.size*5);
        ctx.strokeRect(-p.size, -p.size*2.5, p.size*2, p.size*5);
        // 帯電エフェクト
        if(Math.random() < 0.5) {
            ctx.strokeStyle = '#fff'; ctx.lineWidth=1;
            ctx.beginPath(); let r = p.size*3; for(let i=0; i<8; i++) ctx.lineTo((Math.random()-0.5)*r*2, (Math.random()-0.5)*r*2); ctx.stroke();
        }
    }
    else if (p.subClass === 'PlasmaLord') {
        // プラズマ: ゆらめく円環とコア
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#a0f'; ctx.lineWidth = 3;
        // ランダムに歪むリング
        ctx.beginPath();
        for(let i=0; i<=10; i++) {
            let a = i * Math.PI*2 / 10;
            let r = p.size*2 + Math.sin(t*10 + i)*5;
            ctx.lineTo(Math.cos(a)*r, Math.sin(a)*r);
        }
        ctx.closePath(); ctx.stroke();
    }

    // --- 🧱 Guardian ---
    else if (p.subClass === 'EarthShaker') {
        // アース: 巨大な正方形ブロックの集合
        ctx.rotate(angle);
        ctx.fillStyle = '#640'; 
        // 左右の装甲
        ctx.fillRect(-p.size*2, -p.size*2, p.size*4, p.size*1.5);
        ctx.fillRect(-p.size*2, p.size*0.5, p.size*4, p.size*1.5);
        // 中央
        ctx.fillStyle = '#f80';
        ctx.fillRect(-p.size, -p.size*0.5, p.size*2, p.size);
    }
    else if (p.subClass === 'TeslaEngineer') {
        // テスラ: 三角形のタワーと回転するアンテナ
        ctx.fillStyle = '#0ff';
        drawPoly(ctx, p.size*1.5, 3, 0); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(0,0, p.size*2, 0, Math.PI*2); ctx.stroke(); // バリアリング
        // アンテナ
        ctx.rotate(t*5);
        ctx.fillStyle='#fff'; ctx.fillRect(-2, -p.size*2.5, 4, p.size*5);
    }

    // --- ⚗️ Alchemist ---
    else if (p.subClass === 'NecroToxin') {
        // ネクロ: 脈打つバイオハザードマーク
        ctx.rotate(t);
        ctx.fillStyle = '#0f0';
        for(let i=0; i<3; i++) {
            ctx.rotate(Math.PI*2/3);
            ctx.beginPath(); ctx.arc(0, p.size*1.5, p.size*0.8, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle='#050'; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, p.size*1.5); ctx.stroke();
        }
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0,0, p.size*0.5, 0, Math.PI*2); ctx.fill();
    }
    else if (p.subClass === 'MadScientist') {
        // マッド: 不安定に点滅する多角形
        ctx.rotate(-t);
        let flicker = Math.random() > 0.5 ? '#f0f' : '#fff';
        ctx.strokeStyle = flicker; ctx.lineWidth = 4;
        drawPoly(ctx, p.size*1.8, 5, 0); ctx.stroke();
        ctx.fillStyle = flicker;
        drawPoly(ctx, p.size*0.8, 5, Math.PI); ctx.fill();
    }

    // --- 🃏 Trickster ---
    else if (p.subClass === 'Gambler') {
        // ギャンブラー: 回転する正方形チップ
        ctx.rotate(t*2);
        ctx.fillStyle = '#fd0'; ctx.fillRect(-p.size*1.2, -p.size*1.2, p.size*2.4, p.size*2.4);
        ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.strokeRect(-p.size, -p.size, p.size*2, p.size*2);
        // 目
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(0,0, p.size*0.3, 0, Math.PI*2); ctx.fill();
    }
    else if (p.subClass === 'JokerMaster') {
        // ジョーカー: ギザギザの星
        let pulse = 1 + Math.sin(t*10)*0.2;
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#fff'; drawPoly(ctx, p.size*1.5, 8, t); ctx.fill();
        ctx.fillStyle = '#f0f'; drawPoly(ctx, p.size*1.0, 8, -t); ctx.fill();
    }

    // --- 🛡️ Vanguard ---
    else if (p.subClass === 'FlyingSwords') {
        // 御剣: 幾何学的なファンネル
        ctx.rotate(angle);
        ctx.fillStyle = '#f06';
        drawSpike(ctx, p.size*2, p.size*0.8, -p.size); ctx.fill();
        // 左右に浮くビット
        ctx.fillStyle = '#fff';
        ctx.fillRect(-p.size, p.size, p.size, 4);
        ctx.fillRect(-p.size, -p.size, p.size, 4);
    }
    else if (p.subClass === 'SunCrusher') {
        // 太陽: 燃えるような多重リング
        ctx.fillStyle = '#f50'; ctx.beginPath(); ctx.arc(0,0, p.size*1.2, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fe0'; ctx.lineWidth=3;
        ctx.rotate(t*2);
        for(let i=0; i<4; i++) {
            ctx.rotate(Math.PI/4);
            ctx.strokeRect(-p.size*1.5, -p.size*1.5, p.size*3, p.size*3);
        }
    }
    
    // Fallback
    else {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
    }
    
    ctx.shadowBlur = 0; 
}

// ui.js の drawBossSprite をこれに置き換えてください

// ui.js の drawBossSprite をこれに置き換えてください

function drawBossSprite(ctx, e) {
    ctx.save();

    // ■ 1. 時間管理
    const tickRate = 120; 
    const tick = Math.floor(Date.now() / tickRate);
    const time = Date.now() / 1000;

    // ■ 2. 擬似乱数
    let seed = tick + (e.id * 100);
    const rand = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    // ■ 3. グリッチ・振動
    let gx = 0, gy = 0;
    if (rand() > 0.92) {
        gx = (rand() - 0.5) * 10;
        gy = (rand() - 0.5) * 10;
    }
    ctx.translate(e.x + gx, e.y + gy);

    // バリアント決定
    const variant = Math.floor(e.id * 100) % 5;

    // --- 【重厚感の追加】 ---
    // 発光エフェクト
    ctx.shadowBlur = 15;
    ctx.shadowColor = e.color;
    
    // ベーススタイル
    ctx.strokeStyle = e.color;
    ctx.fillStyle = e.color; // 塗りつぶし用
    ctx.lineWidth = 2.0;

    // サイズ倍率
    const s = e.size * 1.6;

    // -----------------------------------------------------------
    // ▼ ヘルパー関数群
    // -----------------------------------------------------------

    // 統合ビット描画 (重厚版: 中身が詰まっている)
    const drawIntegratedBit = (x, y) => {
        ctx.save();
        ctx.translate(x, y);
        
        // 常に少し回転
        if (tick % 2 === 0) ctx.rotate(Math.PI/4);
        
        // 塗りつぶしの核
        ctx.globalAlpha = 0.8;
        ctx.fillRect(-3, -3, 6, 6);
        ctx.globalAlpha = 1.0;
        
        // 外枠
        ctx.strokeRect(-5, -5, 10, 10);
        
        // 接続ライン (稀に本体中心へ伸びる)
        if (rand() > 0.95) {
            ctx.globalAlpha = 0.4;
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-x, -y); ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
        ctx.restore();
    };

    // 重厚な多角形描画 (内部を薄く塗る)
    const drawSolidPoly = (verts) => {
        ctx.beginPath();
        verts.forEach((v, i) => {
            if (i===0) ctx.moveTo(v.x, v.y); else ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        
        // 内部を半透明で塗る (ガラスのような質感)
        ctx.globalAlpha = 0.15;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();
    };
    
    const getPolyVerts = (r, sides, offsetAngle=0) => {
        let verts = [];
        for(let i=0; i<sides; i++) {
            let a = offsetAngle + (Math.PI * 2 / sides) * i;
            verts.push({ x: Math.cos(a)*r, y: Math.sin(a)*r });
        }
        return verts;
    };


    // -----------------------------------------------------------
    // ▼ 形状描画ロジック
    // -----------------------------------------------------------

    // ★ Type 0: [PLATONIC SOLID] (正二十面体/六角形構造)
    if (variant === 0) {
        ctx.rotate(tick * 0.05);

        // 外殻 (六角形)
        const outerVerts = getPolyVerts(s, 6);
        drawSolidPoly(outerVerts);

        // 内部構造 (三角形の集合)
        ctx.beginPath();
        outerVerts.forEach((v, i) => {
            const next2 = outerVerts[(i+2)%6];
            ctx.moveTo(v.x, v.y); ctx.lineTo(next2.x, next2.y);
        });
        // 内部も薄く塗ることで重なりを表現
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();

        // ビット配置
        outerVerts.forEach(v => drawIntegratedBit(v.x, v.y));
    }


    // ★ Type 1: [NAPOLEON'S THEOREM] (三円と三角形)
    else if (variant === 1) {
        const offset = s * 0.5;
        // 回転
        if (tick % 4 === 0) ctx.rotate(Math.PI);

        const centers = [];
        for(let i=0; i<3; i++) {
            let a = (Math.PI*2/3)*i - (Math.PI/6);
            let cx = Math.cos(a)*offset;
            let cy = Math.sin(a)*offset;
            centers.push({x:cx, y:cy});
            
            // 円 (塗りつぶしあり)
            ctx.beginPath();
            ctx.arc(cx, cy, s*0.6, 0, Math.PI*2);
            ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1.0;
            ctx.stroke();
            
            // ビット配置 (円の外周)
            let bx = Math.cos(a) * (s*1.2);
            let by = Math.sin(a) * (s*1.2);
            drawIntegratedBit(bx, by);
        }

        // 中心を結ぶ正三角形 (実体のあるプレート感)
        ctx.beginPath();
        ctx.moveTo(centers[0].x, centers[0].y);
        ctx.lineTo(centers[1].x, centers[1].y);
        ctx.lineTo(centers[2].x, centers[2].y);
        ctx.closePath();
        ctx.fillStyle = '#ffffff'; // コア部分は白く輝かせる
        ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.stroke();
    }


    // ★ Type 2: [PYTHAGOREAN FRACTAL] (ピタゴラスの木)
    else if (variant === 2) {
        // メイン正方形
        ctx.beginPath();
        ctx.rect(-s/2, -s/2, s, s);
        ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.stroke();
        
        // 子正方形 (3方向に展開)
        const childS = s * 0.6;
        const dist = s/2 + childS/2;
        const positions = [
            {x:0, y:-dist, a:0},
            {x:-dist, y:dist*0.5, a:-0.5},
            {x:dist, y:dist*0.5, a:0.5}
        ];

        positions.forEach((p) => {
            ctx.save();
            ctx.translate(p.x, p.y);
            // グリッチ回転
            ctx.rotate(rand() > 0.8 ? 0 : p.a);
            
            ctx.beginPath(); ctx.rect(-childS/2, -childS/2, childS, childS);
            ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1.0;
            ctx.stroke();
            
            // ビット配置
            drawIntegratedBit(0, 0);
            ctx.restore();
        });
        
        // 中央コアビット
        drawIntegratedBit(0, 0);
    }

    // ★ Type 3: [FIBONACCI SEQUENCE] (黄金長方形と螺旋)
    else if (variant === 3) {
        // 中心位置調整
        ctx.rotate(time * 0.2);
        
        let fibSize = s;
        // 螺旋の中心へ向かって描画していく
        for(let i=0; i<6; i++) {
            // 正方形 (重厚な塗り)
            ctx.beginPath(); ctx.rect(0, 0, fibSize, fibSize);
            ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1.0;
            ctx.stroke();

            // 螺旋曲線
            ctx.beginPath();
            ctx.arc(fibSize, 0, fibSize, Math.PI/2, Math.PI); 
            ctx.stroke();
            
            // ビット (各正方形の角)
            drawIntegratedBit(0, 0);

            // 座標変換: 次の正方形の位置へ移動・回転・縮小
            ctx.translate(fibSize, fibSize);
            ctx.rotate(-Math.PI/2);
            // フィボナッチ比率で縮小
            const phiInv = 0.618;
            ctx.scale(phiInv, phiInv);
        }
    }

    // ★ Type 4: [PERPETUAL MOTION] (二重円環・歯車)
    else {
        // 外側のリング (塗りあり)
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI*2);
        ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.stroke();
        
        // 内側のリング (逆回転)
        ctx.save();
        ctx.rotate(-time * 2);
        ctx.beginPath(); ctx.arc(0, 0, s*0.6, 0, Math.PI*2);
        ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1.0;
        ctx.stroke();
        
        // 内部のスポーク
        for(let i=0; i<4; i++) {
            ctx.rotate(Math.PI/2);
            ctx.moveTo(0, 0); ctx.lineTo(s*0.6, 0); ctx.stroke();
        }
        ctx.restore();

        // 外周のブレードとビット
        const bladeCount = 8;
        const rot = time;
        for(let i=0; i<bladeCount; i++) {
            let a = (Math.PI*2/bladeCount) * i + rot;
            let x = Math.cos(a) * s;
            let y = Math.sin(a) * s;

            // 接線ブレード
            let tanA = a + Math.PI/2 + 0.4;
            let len = s * 0.8;
            
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(tanA)*len, y + Math.sin(tanA)*len);
            ctx.stroke();

            // 接続点ビット
            if (i % 2 === 0) {
                drawIntegratedBit(x, y);
            }
        }
    }

    // --- 【共通グリッチ: 走査線・テキスト】 ---
    if (rand() > 0.85) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        const ly = (rand()-0.5) * s * 2.5;
        // スキャンライン
        ctx.fillRect(-s*2, ly, s*4, 1);
        
        // 謎の数式テキスト
        ctx.font = '10px monospace';
        ctx.fillStyle = e.color;
        ctx.fillText(`Φ:${(1.618 + rand()*0.01).toFixed(4)}`, s, ly - 2);
        ctx.restore();
    }

    ctx.restore();
}

function showBossReward() {
    gameActive = false;
    Sound.play('milestone'); // 重要な音を鳴らす
    
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    
    // タイトル設定
    let titleEl = document.querySelector('#menu-title');
    titleEl.innerText = "BOSS DEFEATED";
    titleEl.style.color = "#ff0000"; // 赤色で強調
    titleEl.style.textShadow = "0 0 20px red";

    // まだ持っていないボススキルを抽出
    let pool = BOSS_SKILL_DATA.filter(item => !item.isOwned || !item.isOwned());

    // 表示する候補リスト
    let opts = [];

    if(pool.length > 0) {
        // 残りがあるなら、ランダムに最大3つ選ぶ
        pool.sort(() => Math.random() - 0.5);
        opts = pool.slice(0, 3);
    } else {
        // 全部持っている場合は汎用報酬
        opts.push({
            id: 'boss_limit_break',
            icon: '👑',
            title: "覇者の風格",
            desc: "全ステータスをさらに強化する (何度でも取得可能)",
            func: () => {
                stats.dmg *= 1.1; 
                player.maxHp += 50; 
                player.hp += 50;
                stats.armor += 1;
            }
        });
    }

    // カード生成
    opts.forEach(o => {
        // funcプロパティを統一的に扱うためのラップ
        let itemForUpgrade = { ...o, func: o.func || o.f };

        let el = document.createElement('div'); 
        el.className = 'card special'; // 黄色の枠（special）を使用
        el.style.borderColor = '#ff0000'; // ボス用なので赤枠に上書き
        el.style.boxShadow = '0 0 20px #ff0000';
        
        el.innerHTML = `<span class="icon">${o.icon}</span><h3 style="color:#ff8888">${o.title}</h3><p>${o.desc}</p>`;
        
        el.onclick = () => { 
            applyUpgrade(itemForUpgrade); 
            // タイトル色を戻して再開
            document.querySelector('#menu-title').style.color = "white";
            document.querySelector('#menu-title').style.textShadow = "0 0 15px #0ff";
            resume(); 
        };
        
        c.appendChild(el);
    });
}
