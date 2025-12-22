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
        
        // 現在のスコアなどを表示反映
        document.getElementById('pause-score').innerText = Math.floor(score);
        document.getElementById('pause-lv').innerText = level;

        // CSSアニメーション用クラス付与
        menu.classList.add('active'); 
    } else {
        // --- 再開 ---
        isPaused = false;
        menu.classList.remove('active');
        
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

function showUpgrade() {
    gameActive = false;
    let m = document.getElementById('menu-overlay'); 
    let c = document.getElementById('card-area');
    c.innerHTML = ''; 
    m.style.display = 'flex';
    document.querySelector('#menu-title').innerText = "LEVEL UP!";

    // 1. 出現条件(condition)を満たすアイテムだけを抽出
    let validPool = UPGRADE_DATA.filter(item => !item.condition || item.condition());
    
    if (validPool.length < 3) validPool = UPGRADE_DATA.slice(0, 5); 

    // 2. 重み付け抽選（簡易版）
    // 本来はweightを見るべきですが、まずはランダムで
    validPool.sort(() => Math.random() - 0.5);
    
    let choices = [];
    let pickedIds = new Set();
    
    for (let item of validPool) {
        if (choices.length >= 3) break;
        if (pickedIds.has(item.id)) continue; 
        
        let opt = { ...item };
        
        // レアリティ判定
        if (Math.random() < 0.1) {
            opt.isRare = true;
            let mult = (opt.id === 'hp') ? 3 : 2;
            opt.val = Math.floor(opt.val * mult);
        }
        
        choices.push(opt);
        pickedIds.add(item.id);
    }

    // 3. カード生成
    choices.forEach(o => {
        let el = document.createElement('div'); 
        el.className = 'card';
        if(o.isRare) el.classList.add('rare');
        
        let title = o.isRare ? `✨ ${o.title}` : o.title;
        let desc = o.desc(o.val);
        
        el.innerHTML = `<span class="icon">${o.icon}</span><h3>${title}</h3><p>${desc}</p>`;
        
        // ▼▼▼ 修正箇所: 直接 func を呼ばず、applyUpgrade を通す ▼▼▼
        el.onclick = () => { applyUpgrade(o, o.val); resume(); };
        // ▲▲▲ 修正完了 ▲▲▲
        
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
        ATK  : ${Math.floor(s.dmg)} <br>
        ASP  : ${atkPerSec}/s <br>
        CRIT : ${(s.critChance * 100).toFixed(0)}% <br>
        AREA : ${(s.areaScale * 100).toFixed(0)}% <br>
        SPD  : ${s.spd.toFixed(1)} <br>
        BSPD : ${s.bulletSpeed.toFixed(0)} <br>
        PIRC : ${s.pierce} <br>
        MAG  : ${Math.floor(s.magnet)} <br>
        ARM  : ${s.armor}
    `;
    
    if(s.duration > 1.0) html += `<br>DUR  : ${(s.duration*100).toFixed(0)}%`;
    if(s.knockback > 0) html += `<br>KBCK : ${s.knockback}`;

    document.getElementById('stats-list').innerHTML = html;
}

function updateUI() {
    document.getElementById('disp-lv').innerText = level;
    let hpPer = Math.max(0, player.hp / player.maxHp * 100);
    document.getElementById('hp-bar-fill').style.width = hpPer + '%';
    document.getElementById('disp-hp-val').innerText = Math.floor(player.hp);
    document.getElementById('disp-hp-max').innerText = Math.floor(player.maxHp);
    document.getElementById('disp-regen').innerText = stats.regen;
    document.getElementById('disp-score').innerText = score;

    updateStatsDisplay();
}

function updateSkillList() {
    let list = document.getElementById('skill-list');
    let html = "";
    
    if(singularityMode) html += `<div style="color:#000; text-shadow:0 0 5px #fff; font-weight:bold;">🌌 SINGULARITY MODE</div>`;

    // 1. リスト定義されている単純なスキルを一括表示
    SKILL_DISPLAY_LIST.forEach(item => {
        if (stats[item.key]) {
            html += `<div style="color:${item.color}">${item.label}</div>`;
        }
    });

    activeSkills.forEach(skill => {
        // IDを大文字にしてラベル化 (例: earthquake -> EARTHQUAKE)
        let label = skill.id.replace(/([A-Z])/g, ' $1').toUpperCase();
        // クールダウン残り時間の表示
        let cdText = skill.timer <= 0 ? "READY" : (Math.ceil(skill.timer/60) + "s");
        
        html += `<div style="color:#0ff">⚡ ${label} [${cdText}]</div>`;
    });
    
    // 2. フォーマットが必要な特殊表示のスキル
    // Guardian / Sentry
    if(stats.sentrySystem) html += `<div style="color:#0f0">🏗️ SENTRY SYS (${sentries.length})</div>`;
    
    // Siege Mode
    if(stats.siegeMode) {
        let active = stats.isStationary ? "(ON)" : "(OFF)";
        html += `<div style="color:#0f0">🏯 SIEGE ${active}</div>`;
    }
    
    // Force Field
    if(stats.forceField) {
        let ready = stats.forceFieldCd <= 0 ? "READY" : Math.ceil(stats.forceFieldCd/60)+"s";
        html += `<div style="color:#0ff">🛡️ FORCE FIELD [${ready}]</div>`;
    }

    // 数値表示が必要なもの
    if(stats.armor > 0) html += `<div style="color:#8f8">🛡️ ARMOR +${stats.armor}</div>`;
    if(stats.missile > 0) html += `<div style="color:#fa0">🚀 ミサイル Lv${stats.missile}</div>`;
    if(stats.drones > 0) html += `<div style="color:#ff0">🛰️ ドローン x${stats.drones}</div>`;
    if(stats.auraScale > 1) html += `<div style="color:#f00">🛡️ オーラ倍率 x${stats.auraScale.toFixed(1)}</div>`;
    if(stats.lifesteal > 0) html += `<div style="color:#f0f">🧛 吸血 +${stats.lifesteal}</div>`;

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

    // 2. カメラ位置の計算 (プレイヤーが画面中心に来るためのオフセット)
    // 画面揺れ(shake)もここに加算します
    let shakeX = (Math.random() - 0.5) * screenShake;
    let shakeY = (Math.random() - 0.5) * screenShake;
    
    // カメラの左上座標 = プレイヤー座標 - 画面サイズの半分
    let camX = player.x - canvas.width / 2;
    let camY = player.y - canvas.height / 2;

    ctx.save();
    // 3. 全体をカメラの分だけ逆方向にずらす
    ctx.translate(-camX + shakeX, -camY + shakeY);

    // --- 背景グリッドの描画 (無限に見せる工夫) ---
    // プレイヤーの位置に合わせて線を描く位置を調整
    const gridSize = 100;
    // 画面に見えている範囲だけ描画するための計算
    let startX = Math.floor(camX / gridSize) * gridSize;
    let startY = Math.floor(camY / gridSize) * gridSize;
    
    ctx.strokeStyle = '#1a1a1a'; 
    ctx.lineWidth = 1; 
    ctx.beginPath();
    // 縦線
    for(let i = startX; i < startX + canvas.width + gridSize; i += gridSize) { 
        ctx.moveTo(i, startY - gridSize); 
        ctx.lineTo(i, startY + canvas.height + gridSize); 
    }
    // 横線
    for(let i = startY; i < startY + canvas.height + gridSize; i += gridSize) { 
        ctx.moveTo(startX - gridSize, i); 
        ctx.lineTo(startX + canvas.width + gridSize, i); 
    }
    ctx.stroke();
    // ------------------------------------------

    // ★以下は元の描画ロジックとほぼ同じですが、
    // 既に ctx.translate しているので、オブジェクトの x, y をそのまま描画すればOKです。

    // 絶対零度オーラ
    if(stats.absoluteZero) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.05)';
        ctx.beginPath(); ctx.arc(player.x, player.y, 250, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.2)'; ctx.lineWidth=1; ctx.stroke();
    }
    // 電気柵
    if(stats.electroFence) {
        ctx.strokeStyle = `rgba(136, 255, 255, ${(electroFenceTimer/60)})`;
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
        if(b.type === 'omega') {
            // オメガレーザーは画面全体なので座標変換の影響を受けないように注意が必要だが
            // ここでは簡易的に「プレイヤーの前方に描画」とする
            ctx.fillStyle = `rgba(255, 0, 255, ${b.life/30})`;
            // 画面を覆う矩形を描画したいが、translateされているので camX, camY を使う
            ctx.fillRect(camX, camY, canvas.width, canvas.height); 
            // ビーム中心
            ctx.fillStyle = '#fff'; ctx.fillRect(camX, b.y - 50, canvas.width, 100);
        }
        else if(b.type === 'void') {
            // 収縮する円のエフェクト
            let progress = 1.0 - (b.life / b.maxLife); // 0 -> 1
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 3;
            ctx.beginPath();
            // 予兆範囲（だんだん小さくなる = 力が収束するイメージ）
            let r = b.size * (1.5 - progress * 0.5); 
            ctx.arc(b.x, b.y, r, 0, Math.PI*2);
            ctx.stroke();
            
            // 中心のコア（だんだん大きくなる）
            ctx.fillStyle = b.color;
            ctx.globalAlpha = 0.5 * progress;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size * 0.5 * progress, 0, Math.PI*2);
            ctx.fill();
            ctx.globalAlpha = 1.0;
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

    // 敵
    enemies.forEach(e => {
        // (画面内にあるかどうかの簡易カリングを入れると描画負荷が減りますが、今回は全描画でもOK)
        ctx.fillStyle = e.frozen > 0 ? '#0ff' : (e.flash > 0 ? '#fff' : e.color); 
        ctx.beginPath();
        if(e.type === 'boss') {
            ctx.fillRect(e.x-e.size, e.y-e.size, e.size*2, e.size*2);
            // ボスのHPバー
            const barWidth = 120;  // バーの固定幅（ピクセル）
            const barHeight = 10;  // バーの高さ
            const barX = e.x - barWidth / 2;    // 中央揃え位置計算
            const barY = e.y - e.size - 25;     // ボスの頭上に配置

            // 比率計算
            // Math.min(1, ...) を使うことで、HPがMaxHPを超えても100%以上描画されないようにする
            let hpRatio = e.hp / e.maxHp;
            hpRatio = Math.max(0, Math.min(1, hpRatio)); 

            // 1. 背景（枠・減った部分）を描画（暗い赤）
            ctx.fillStyle = '#400'; 
            ctx.fillRect(barX, barY, barWidth, barHeight);

            // 2. 現在HP（緑）を描画
            // width に hpRatio を掛けることで、内部の値だけ伸縮させる
            ctx.fillStyle = '#0f0'; 
            ctx.fillRect(barX, barY, barWidth * hpRatio, barHeight);

            // 3. 枠線を描画（白）して見やすくする
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        } else if(e.type === 'golem') {
            ctx.fillRect(e.x-e.size, e.y-e.size, e.size*2, e.size*2);
            ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.strokeRect(e.x-e.size, e.y-e.size, e.size*2, e.size*2);
        } else {
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

    // ダメージテキスト (これもワールド座標に追従させます)
    ctx.font = 'bold 16px sans-serif';
    texts.forEach(t => { ctx.fillStyle = t.color || 'white'; ctx.fillText(t.str, t.x, t.y); });

    // --- カメラの座標変換を解除 (ここまでが動く世界) ---
    ctx.restore();

    // --- 画面固定のUI (ビネット効果など) ---
    // 画面の端を暗くする効果はカメラに関係なく画面全体にかける
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