// --- Global Variables & Input Handling ---

const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
// Note: UI logic handles the display of mobile controls based on this variable

let joyTouchId = null;
let joyStartX = 0, joyStartY = 0;
let joyMoveX = 0, joyMoveY = 0;
let isPaused = false;
let pausedAt = 0
const JOY_MAX_RADIUS = 50;

let lastTime = 0;
let startTime = 0;
let gameActive = false;
let score = 0;
let level = 1;
let exp = 0;
let nextExp = 65; 
let screenShake = 0;
let bossCycleCounter = 0; 
let bossWarningTimer = 0;
let bossWarningActive = false; 
let singularityMode = false;
let noDamageTimer = 0;

// Guardian Sentry
let sentries = [];
let sentryTimer = 0;

// Items
let items = [];

let player = {
    x: 0, y: 0, size: 15, // 初期位置はstartGameで設定
    hp: 100, maxHp: 100,
    class: 'Novice', subClass: null, color: '#00ffff',
    invincible: 0,
    dashCd: 0, maxDashCd: 120,
    slamCd: 0,
    laserCd: 0, freezeCd: 0,
    // Unique states
    sunCharge: 0, // Crusader
    isMoving: false
};

let stats = {
    critChance: 0.05,
    dodge: 0,
    areaScale: 1.0,
    duration: 1.0,
    knockback: 0,
    critMult: 2.0,
    hpDamage: 0,
    lowHpDmg: false,
    spd: 7, dmg: 15, rate: 25, multi: 1, 
    bulletSpeed: 16, pierce: 0, 
    aura: false, auraRange: 0,
    regen: 1, magnet: 150, 
    homing: 0, lightning: 0, poison: 0, spinBlade: 0, chakram: 0,
    sonicBoom: 0,
    phantomStrike: 0,
    voidRift: 0,
    missile: 0, drones: 0, auraScale: 1,
    lifesteal: 0, infinitePierce: false,
    missileBlast: 1, gravityAura: false, spreadShot: false,
    napalm: false, spikeArmor: false, dashNova: false, 
    splitShot: false, giantSlayer: false,
    armor: 0, 
    knockback: 0, shrapnel: false, 
    
    // Guardian Skills
    sentrySystem: false, siegeMode: false, reactiveArmor: false, 
    nanoRepair: false, clusterMine: false, forceField: false,
    forceFieldCd: 0, isStationary: false,
    sentryMax: 5, sentryRate: 1.0,
    
    // Forbidden Skills
    shotExplode: false, shotBounce: false, doubleShot: false, 
    missileChance: 0, infiniteMag: false, gatling: false,
    titan: false, blackHole: false, bladeStorm: false, 
    earthquake: false, spikeReflect: false, bloodLust: false,
    railgun: false, execute: false, deadeye: false, 
    electroFence: false, chainBurst: false, orbital: false,
    omegaLaser: false, absoluteZero: false, necromancer: false,

    // Sub Class Specifics
    ghostShot: false, // Dimension Walker
    prismSplit: false, // Prism Shooter
    isEarthShaker: false,
    teslaGrid: false,
    bulletStorm: false, // Assault B
    clusterStriker: false // Assault A
};

let bullets = [];
let enemyBullets = [];
let enemies = [];
let particles = [];
let expOrbs = [];
let texts = [];
let orbitals = [];
let drones = []; 
let gasClouds = [];
let spikeBits = [];
// Flying Swords
let flyingSwords = [];

let activeSkills = [];

// --- Input Handling ---
const keys = {};

window.addEventListener('keydown', e => { keys[e.key] = true; if(e.code === 'Space') dash(); });
window.addEventListener('keyup', e => keys[e.key] = false);

// ダッシュボタンの処理
const dashBtn = document.getElementById('dash-btn');
if(dashBtn) {
    dashBtn.addEventListener('touchstart', (e) => { 
        e.preventDefault(); 
        dash(); 
    }, {passive: false});
}

function isInteractive(target) {
    if (target.id === 'pause-btn' || target.closest('#pause-btn')) return true;
    if (target.closest('#pause-menu')) return true;
    return target.closest('button') || target.closest('.card') || target.id === 'dash-btn';
}

// ジョイスティック処理
const handleTouchStart = (e) => {
    if(!isInteractive(e.target)) {
        if(e.cancelable) e.preventDefault();
    }

    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(gameActive && t.clientX < window.innerWidth / 2 && joyTouchId === null) {
            joyTouchId = t.identifier;
            joyStartX = t.clientX;
            joyStartY = t.clientY;
            
            let zone = document.getElementById('joystick-zone');
            zone.style.display = 'block';
            zone.style.left = joyStartX + 'px';
            zone.style.top = joyStartY + 'px';
            
            let knob = document.getElementById('joystick-knob');
            knob.style.transform = `translate(-50%, -50%)`;
            
            updateJoystick(t.clientX, t.clientY);
        }
    }
};

const handleTouchMove = (e) => {
    if (!e.target.closest('.card-container') && !e.target.closest('#pause-menu')) {
        if(e.cancelable) e.preventDefault();
    }
    
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(t.identifier === joyTouchId) {
            updateJoystick(t.clientX, t.clientY);
        }
    }
};

const handleTouchEnd = (e) => {
    if(!isInteractive(e.target)) {
        if(e.cancelable) e.preventDefault();
    }
    
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(t.identifier === joyTouchId) {
            resetJoystick();
        }
    }
};

const handleTouchCancel = (e) => {
    if(e.cancelable) e.preventDefault();
    for(let i=0; i<e.changedTouches.length; i++) {
        let t = e.changedTouches[i];
        if(t.identifier === joyTouchId) {
            resetJoystick();
        }
    }
};

function resetJoystick() {
    joyTouchId = null;
    joyMoveX = 0; joyMoveY = 0;
    let zone = document.getElementById('joystick-zone');
    if(zone) zone.style.display = 'none';
    let knob = document.getElementById('joystick-knob');
    if(knob) knob.style.transform = `translate(-50%, -50%)`;
}

window.addEventListener('touchstart', handleTouchStart, {passive: false});
window.addEventListener('touchmove', handleTouchMove, {passive: false});
window.addEventListener('touchend', handleTouchEnd, {passive: false});
window.addEventListener('touchcancel', handleTouchCancel, {passive: false});

function updateJoystick(cx, cy) {
    let dx = cx - joyStartX;
    let dy = cy - joyStartY;
    let dist = Math.hypot(dx, dy);
    
    if(dist > JOY_MAX_RADIUS) {
        let ratio = JOY_MAX_RADIUS / dist;
        dx *= ratio;
        dy *= ratio;
    }
    
    joyMoveX = dx / JOY_MAX_RADIUS;
    joyMoveY = dy / JOY_MAX_RADIUS;
    
    let knob = document.getElementById('joystick-knob');
    if(knob) knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

// スキル管理システム（簡易版）
const SkillSystem = {
    listeners: {}, // 初期化

    // リスナー登録（配列がなければ勝手に作るように修正）
    on: function(event, callback) {
        if(!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    },

    // イベント発火
    trigger: function(event, context) {
        if(!this.listeners[event]) return;
        this.listeners[event].forEach(fn => fn(context));
    }
};

// ★ アップグレード適用マネージャー (applyUpgrade)
// 全てのアイテム取得・スキル習得はここを経由させることで、
// ログ出力や共通処理（HP回復など）を一元管理する
function applyUpgrade(item, val) {
    if(!item) return;

    // 1. ログ出力
    console.log(`[Upgrade] 取得: ${item.title} (値: ${val !== undefined ? val : 'N/A'})`);

    // 2. 効果の適用 (statsのフラグ立てなどはここで行われる)
    if(item.func) {
        item.func(val);
    }

    // ★★★ 追加: アクティブスキルシステムの登録処理 ★★★
    // もし ACTIVE_SKILLS_DATA (data.jsで定義) にこのIDがあれば、動的リストに追加する
    // 重複登録を防ぐため、既に持っているかチェック
    if (typeof ACTIVE_SKILLS_DATA !== 'undefined' && ACTIVE_SKILLS_DATA[item.id]) {
        const existing = activeSkills.find(s => s.id === item.id);
        if (!existing) {
            // 初期状態(タイマー0など)で登録
            activeSkills.push({
                id: item.id,
                timer: 0,
                // 定義データへの参照を持たせる
                def: ACTIVE_SKILLS_DATA[item.id]
            });
            console.log(`[System] Active Skill Registered: ${item.id}`);
        }
    }
    
    // 3. 共通の副作用（フック処理）
    // 例: 最大HPが増える系のスキルなら、増えた分だけ現在HPも回復してあげる（親切設計）
    if(item.id === 'hp' || item.id === 'titan' || item.id === 'guardian' || item.id === 'EarthShaker') {
        // func内でも処理されている場合があるが、ここでダメ押しで補正しても良い
        // （今回は既存のfuncが優秀なので、ここでは特別な追加処理はせずログ確認のみとする）
    }

    // 例: クラス進化時はエフェクトを出す
    if(item.id === player.class || item.id === player.subClass) {
        // 色変更などは func 内で行われているのでOK
        console.log(`[Class Change] ${player.class} -> ${player.subClass || 'Evolved'}`);
    }

    // 4. ステータスの再計算・整合性チェック（必要なら）
    // 例えばステータスがマイナスにならないようにClampするなど
    if(stats.rate < 1) stats.rate = 1; // 連射速度の限界突破防止
}
