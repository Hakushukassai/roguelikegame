// --- Config ---
const MAX_ENEMIES = 500;
const MAX_PARTICLES = 500; 
const MAX_ORBS = 400; 
const MAX_TEXTS = 50;
const MAX_SOUND_CONCURRENT = 32; 

// --- 敵のステータス定義データベース ---
const ENEMY_DATA = {
    boss:    { baseHp: 3500, size: 90, color: '#cc0000', baseSpeed: 3.5, ai: 'boss' },
    golem:   { baseHp: 800,  size: 25, color: '#2F4F4F', baseSpeed: 2.5, ai: 'normal', speedMult: 0.3 },
    iron_will: { baseHp: 800, size: 22, color: '#708090', baseSpeed: 2.2, ai: 'iron' },
    dasher:  { baseHp: 40,   size: 18, color: '#ff3333', baseSpeed: 3.5, ai: 'dasher' },
    splitter:{ baseHp: 30,   size: 20, color: '#ff3333', baseSpeed: 2.0, ai: 'splitter' },
    bat:     { baseHp: 12,   size: 10, color: '#ff3333', baseSpeed: 6.0, ai: 'bat' },
    shooter: { baseHp: 30,   size: 15, color: '#ff3333', baseSpeed: 1.8, ai: 'shooter' },
    tank:    { baseHp: 150,  size: 24, color: '#ff3333', baseSpeed: 1.5, ai: 'tank' },
    minion:  { baseHp: 12,   size: 10, color: '#ff3333', baseSpeed: 3.0, ai: 'normal' },
    normal:  { baseHp: 15,   size: 14, color: '#ff3333', baseSpeed: 2.5, ai: 'normal' }
};

// --- アップグレード（通常レベルアップ）の定義 ---
const UPGRADE_DATA = [
    { id: 'dmg_p', icon: '💪', title: '攻撃力', val: 15, unit: '%', 
      desc: v=>`ダメージ +${v}%`, 
      func: (v)=> stats.dmg = Math.floor(stats.dmg*(1+v/100)) },
    { id: 'hp', icon: '❤️', title: '最大HP', val: 50, unit: '', 
      desc: v=> {
          let str = `最大HP +${v}`;
          if(player.class === 'Melee') str += "\n(攻撃力もUP!)";
          return str;
      },
      func: (v)=> { player.maxHp+=v; player.hp+=v; } },
    { id: 'spd', icon: '👟', title: '移動スピード', val: 2, unit: '', 
      desc: v=>`移動スピード +${v}`, 
      func: (v)=> stats.spd+=v },
    { id: 'crit', icon: '🎯', title: 'クリティカル', val: 5, unit: '%', 
      desc: v=>`会心率 +${v}%`, 
      func: (v)=> stats.critChance+=v/100 },
    { id: 'magnet', icon: '🧲', title: '収集範囲', val: 50, unit: '', 
      desc: v=>`アイテム回収距離 +${v}`, 
      func: (v)=> stats.magnet+=v },
    { id: 'rate', icon: '⚡', title: '連射スピード', val: 5, unit: '%', 
      desc: v=> {
          if(player.class === 'Melee' || player.class === 'Samurai') return `攻撃間隔 -${v}%`;
          // 【改善3】説明文を分岐
          if(stats.rate <= 2) return `限界突破! マルチショット +1 / 弾速 +10%`;
          return `連射速度 +${v}%`; 
      },
      func: (v)=> { 
          // 連射速度が限界(2フレーム以下)に達している場合
          if(stats.rate <= 2) {
              // 限界突破ボーナス：同時発射数と弾速を強化する（腐らせない）
              stats.multi += 1;
              stats.bulletSpeed *= 1.1;
              // 演出としてテキストを出す
              if(typeof texts !== 'undefined') texts.push({x:player.x, y:player.y-40, str:"LIMIT BREAK!", life:60, color:'#0ff'});
          } else {
              // 通常の強化
              stats.rate = Math.max(2, stats.rate*(1-v/100));
          }
      } 
    },
    { id: 'lightning', icon: '🌩️', title: 'ライトニング', val: 1, unit: 'Lv', 
      desc: v=>`攻撃時、確率で落雷が発生\n(Lv +${v})`, 
      func: (v)=> stats.lightning+=v },
    { id: 'phantom_strike', icon: '👻', title: 'ファントム', val: 1, unit: 'Lv', 
      desc: v=> {
          let effect = "攻撃後、確率で追撃が発生";
          if(player.class === 'Samurai') effect += "\n(侍: 確定会心)";
          else if(player.class === 'Sniper') effect += "\n(狙撃: 弱った敵を処刑)";
          else if(player.class === 'Melee') effect += "\n(近接: HP吸収)";
          else if(player.class === 'Assault') effect += "\n(突撃: 2連撃)";
          else if(player.class === 'Guardian') effect += "\n(守護: 衝撃波)";
          else if(player.class === 'Alchemist') effect += "\n(錬金: 呪い付与)";
          else if(player.class === 'Trickster') effect += "\n(奇術: ランダム倍率)";
          return `${effect}\n(Lv +${v})`;
      },
      func: (v)=> stats.phantomStrike += v },
    { id: 'void_rift', icon: '🌀', title: 'ヴォイド・リフト', val: 1, unit: 'Lv', 
      desc: v=> {
          let effect = "定期的に次元の裂け目を発生させ、\n範囲内の敵を圧殺する";
          if(player.class === 'Samurai') effect += "\n(侍: 居合/即時発動)";
          else if(player.class === 'Sniper') effect += "\n(狙撃: ロックオン/被ダメ増)";
          else if(player.class === 'Melee') effect += "\n(近接: グラビティ/吸引)";
          else if(player.class === 'Assault') effect += "\n(突撃: 誘爆/ミサイル発生)";
          else if(player.class === 'Guardian') effect += "\n(守護: 停滞フィールド/凍結)";
          else if(player.class === 'Alchemist') effect += "\n(錬金: 汚染/毒沼化)";
          else if(player.class === 'Trickster') effect += "\n(奇術: ?????)";
          return `${effect}\n(Lv +${v})`;
      },
      func: (v)=> stats.voidRift += v },
    // --- 条件付きアイテム ---
    { id: 'regen', icon: '💖', title: 'リジェネ', val: 2, unit: '', 
      desc: v=>`HP自然回復 +${v}/秒`, 
      func: (v)=> stats.regen+=v, weight: 0.8 }, 
    { id: 'drone', icon: '🛰️', title: 'ビット増設', val: 1, unit: '機', 
      desc: v=>`自動攻撃ビット +${v}機`, 
      func: (v)=> stats.drones+=v, 
      condition: ()=> player.class === 'Sniper' || stats.drones > 0 },
    { id: 'missile', icon: '🚀', title: 'ミサイル', val: 1, unit: 'Lv', 
      desc: v=>`定期的に誘導弾を発射\n(Lv +${v})`, 
      func: (v)=> stats.missile+=v, 
      condition: ()=> player.class === 'Assault' || stats.missile > 0 },
    { id: 'chakram', icon: '🥏', title: 'チャクラム', val: 1, unit: '個', 
      desc: v=>`跳ね返る円盤を投げる\n(数 +${v})`, 
      func: (v)=> stats.chakram+=v, 
      condition: ()=> player.class === 'Trickster' || stats.chakram > 0 },
    { id: 'homing', icon: '👁️', title: 'ホーミング', val: 1, unit: 'Lv', 
      desc: v=> {
          let str = `弾が敵を追尾する\n(性能 +${v})`;
          if(player.class === 'Melee') str += "\n(オーラのヒット間隔短縮!)";
          return str;
      },
      func: (v)=> stats.homing+=v, 
      condition: ()=> !['Samurai'].includes(player.class) || stats.homing > 0 },
    { id: 'area', icon: '💥', title: '攻撃範囲', val: 10, unit: '%', 
      desc: v=> {
          if(player.class==='Melee') return `オーラサイズ +${v}%`;
          if(player.class==='Samurai') return `斬撃の巨大化 +${v}%`;
          if(player.class==='Alchemist') return `毒ガス範囲 +${v}%`;
          return `弾の大きさ +${v}%`;
      },
      func: (v)=> { stats.areaScale += v/100; if(player.class==='Melee') player.size*=1.05; }, 
      condition: ()=> true },
    { id: 'bullet_speed', icon: '🚅', title: '弾速', val: 10, unit: '%', 
      desc: v=> {
          if(player.class==='Samurai') return `斬撃の飛距離・速度 +${v}%`;
          return `弾の飛ぶ速さ +${v}%`;
      },
      func: (v)=> stats.bulletSpeed*=(1+v/100), 
      condition: ()=> !['Melee','Alchemist'].includes(player.class) },
    { id: 'pierce', icon: '🏹', title: '貫通力', val: 1, unit: '', 
      desc: v=>`敵を貫通する数 +${v}`, 
      func: (v)=> stats.pierce+=v, 
      condition: ()=> ['Assault','Trickster','Tempest','Novice','Sniper'].includes(player.class) && !stats.infinitePierce },
    { id: 'duration', icon: '⏳', title: '効果時間', val: 15, unit: '%', 
      desc: v=>`毒・設置物の持続 +${v}%`, 
      func: (v)=> stats.duration+=v/100, 
      condition: ()=> player.class==='Alchemist' || stats.clusterMine || stats.poison>0 },
    { id: 'armor', icon: '🛡️', title: '装甲強化', val: 2, unit: '', 
      desc: v=> {
          let str = `被ダメージ -${v}`;
          if(player.class === 'Melee') str += "\n(攻撃力・反射痛もUP!)";
          return str;
      },
      func: (v)=> stats.armor+=v, 
      condition: ()=> ['Melee','Samurai','Guardian'].includes(player.class) || stats.armor > 0 },
    { id: 'knockback', icon: '🥊', title: '衝撃力', val: 1, unit: '', 
      desc: v=>`敵を弾き飛ばす距離 +${v}`, 
      func: (v)=> stats.knockback+=v, 
      condition: ()=> ['Sniper','Assault','Novice','Trickster'].includes(player.class) },

    { id: 'dodge', icon: '🍃', title: '回避', val: 5, unit: '%', 
      desc: v=>`敵の攻撃を完全回避する確率 +${v}%`, 
      func: (v)=> stats.dodge = Math.min(0.6, stats.dodge + v/100), // 最大60%でキャップ
      condition: ()=> true },
      
    { id: 'multi_blade', icon: '⚔️', title: '回転刃+', val: 1, unit: '', 
      desc: v=>`周囲の刃の数 +${v}`, 
      func: (v)=> stats.multi+=v, condition: ()=> player.class === 'Melee' },

    { id: 'multi_wave', icon: '🌊', title: '衝撃波+', val: 1, unit: '', 
      desc: v=>`斬撃時の衝撃波 +${v}`, 
      func: (v)=> stats.multi+=v, condition: ()=> player.class === 'Samurai' },

    { id: 'multi_shot', icon: '🔫', title: 'マルチショット', val: 1, unit: '', 
      desc: v=>`同時発射数 +${v}`, 
      func: (v)=> stats.multi+=v, 
      condition: ()=> !['Melee','Samurai','Sniper'].includes(player.class) }
];

// --- 禁断の力（Milestone）の定義 ---
const MILESTONE_DATA = [
    // === 共通 (Common) ===
    { title: "⚡ オメガ・レーザー", desc: "3秒ごとに画面を薙ぎ払う極太レーザーを発射。", 
      classes: null, isOwned: ()=>stats.omegaLaser, f:()=>{stats.omegaLaser=true;} },
    { title: "❄️ アブソリュート・ゼロ", desc: "周囲の敵を凍結させ、長時間停止させるオーラ。", 
      classes: null, isOwned: ()=>stats.absoluteZero, f:()=>{stats.absoluteZero=true;} },
    { title: "💀 ネクロマンサー", desc: "敵撃破時に、敵を追尾する怨霊弾を召喚する。", 
      classes: null, isOwned: ()=>stats.necromancer, f:()=>{stats.necromancer=true;} },
    { title: "🩸 血の契約", desc: "最大HPが1になる代わりに、攻撃力が5倍になる。", 
      classes: null, isOwned: ()=>player.maxHp===1, f:()=>{player.maxHp=1; player.hp=1; stats.dmg*=5;} },
    { title: "🛡️ ゴッドモード", desc: "被弾時の無敵時間が3倍になる。", 
      classes: null, isOwned: ()=>player.invincibleMax>=60, f:()=>{player.invincibleMax=60;} },
    { title: "👥 ドッペルゲンガー", desc: "背後に分身が出現し、反対方向へ同時に攻撃する。", 
      classes: null, isOwned: ()=>stats.doppelganger, f:()=>{stats.doppelganger=true;} },
    { title: "⏳ ザ・ワールド", desc: "ダメージを受けると時が止まり、回避のチャンスを得る(CDあり)。", 
      classes: null, isOwned: ()=>stats.timeStop, f:()=>{stats.timeStop=true;} },
    { title: "🧬 ジャイアントキラー", desc: "攻撃時、敵の最大HPの2%分の追加ダメージを与える。", 
      classes: null, isOwned: ()=>false, f:()=>{stats.hpDamage += 0.02;} }, 
    { title: "🎯 フェイタル・クリティカル", desc: "クリティカルダメージ倍率 +50%", 
      classes: null, isOwned: ()=>stats.critMult >= 10.0, f:()=>{stats.critMult += 0.5;} },
    { title: "🩸 鮮血の爪", desc: "失ったHP割合に応じて攻撃力が上昇する (背水)", 
      classes: null, isOwned: ()=>stats.lowHpDmg, f:()=>{stats.lowHpDmg = true;} },

    // === アサルト (Assault) ===
    { title: "💣 爆裂弾", desc: "全ての通常弾が着弾時に爆発するようになる。", 
      classes: ['Assault'], isOwned: ()=>stats.shotExplode, f:()=>{stats.shotExplode=true;} },
    { title: "↩️ 跳弾", desc: "弾が画面端で跳ね返るようになる。", 
      classes: ['Assault'], isOwned: ()=>stats.shotBounce, f:()=>{stats.shotBounce=true;} },
    { title: "👯 ダブルトリガー", desc: "50%の確率で、一度に2発の弾を発射する。", 
      classes: ['Assault'], isOwned: ()=>stats.doubleShot, f:()=>{stats.doubleShot=true;} },
    { title: "🚀 ミサイル祭", desc: "射撃時に20%の確率で追加ミサイルを発射。", 
      classes: ['Assault'], isOwned: ()=>stats.missileChance>=0.2, f:()=>{stats.missileChance=0.2;} },
    { title: "♾️ 無限マガジン", desc: "一度の発射数+3。リロード時間がゼロになる。", 
      classes: ['Assault'], isOwned: ()=>stats.infiniteMag, f:()=>{stats.infiniteMag=true;} },
    { title: "⚙️ ガトリング", desc: "連射速度が限界突破し、凄まじい弾幕を張る。", 
      classes: ['Assault'], isOwned: ()=>stats.gatling, f:()=>{stats.rate=Math.max(1, stats.rate-10); stats.gatling=true;} },
    { title: "🔥 オーバーヒート", desc: "撃ち続けると連射速度が上がるが、自分が僅かにダメージを受ける。", 
      classes: ['Assault'], isOwned: ()=>stats.overheat, f:()=>{stats.overheat=true;} },
    { title: "🦶 リコイルジャンプ", desc: "射撃の反動で後ろに下がるようになり、機動力が上がる。", 
      classes: ['Assault'], isOwned: ()=>stats.recoilJump, f:()=>{stats.recoilJump=true;} },

    // === ヴァンガード (Melee) ===
    { title: "🦍 タイタン", desc: "HP2倍、サイズ1.5倍。攻撃判定も巨大化。", 
      classes: ['Melee'], isOwned: ()=>stats.titan, f:()=>{player.maxHp*=2; player.hp*=2; player.size*=1.5; stats.titan=true;} },
    { title: "⚫ ブラックホール", desc: "オーラが敵を強力に吸い寄せるようになる。", 
      classes: ['Melee'], isOwned: ()=>stats.blackHole, f:()=>{stats.blackHole=true;} },
    { title: "⚔️ ブレードストーム", desc: "回転刃の枚数が+4枚追加される。", 
      classes: ['Melee'], isOwned: ()=>stats.bladeStorm, f:()=>{stats.bladeStorm=true;} },
    { id: 'earthquake', title: "🌎 アースクエイク", desc: "2秒ごとに画面全体攻撃を行い、敵を気絶させる。", 
      classes: ['Melee'], isOwned: ()=>stats.earthquake, f:()=>{stats.earthquake=true;} },
    { title: "🌵 スパイクリフレクト", desc: "敵接触時のダメージを2倍にして反射する。", 
      classes: ['Melee'], isOwned: ()=>stats.spikeReflect, f:()=>{stats.spikeReflect=true;} },
    { title: "🧛 ブラッドラスト", desc: "敵を倒すとHPが1%回復する。", 
      classes: ['Melee'], isOwned: ()=>stats.bloodLust, f:()=>{stats.bloodLust=true;} },
    { title: "🤺 パリィ", desc: "15%の確率でダメージを無効化し、周囲を吹き飛ばす。", 
      classes: ['Melee'], isOwned: ()=>stats.parry, f:()=>{stats.parry=true;} },
    { title: "🌊 ソードウェーブ", desc: "回転刃から定期的に真空波が飛び、遠くの敵を斬る。", 
      classes: ['Melee'], isOwned: ()=>stats.swordWave, f:()=>{stats.swordWave=true;} },

    // === スナイパー (Sniper) ===
    { title: "🚅 レールガン", desc: "弾速2倍、サイズ2倍。全ての敵を貫通する。", 
      classes: ['Sniper'], isOwned: ()=>stats.railgun, f:()=>{stats.bulletSpeed*=2; stats.railgun=true; stats.infinitePierce=true;} },
    { title: "🔪 処刑人", desc: "HP30%以下の敵に攻撃すると即死させる。", 
      classes: ['Sniper'], isOwned: ()=>stats.execute, f:()=>{stats.execute=true;} },
    { title: "👁️ デッドアイ", desc: "全ての攻撃がクリティカル(3倍ダメージ)になる。", 
      classes: ['Sniper'], isOwned: ()=>stats.deadeye, f:()=>{stats.deadeye=true;} },
    { id: 'electroFence', title: "⚡ エレクトロフェンス", desc: "周囲の敵を麻痺させ、弾き飛ばす電気柵を展開。", 
      classes: ['Sniper'], isOwned: ()=>stats.electroFence, f:()=>{stats.electroFence=true;} },
    { title: "💥 チェーンバースト", desc: "敵を倒すと連鎖爆発が発生し、周囲を巻き込む。", 
      classes: ['Sniper'], isOwned: ()=>stats.chainBurst, f:()=>{stats.chainBurst=true;} },
    { title: "☄️ 天罰", desc: "ランダムな位置に強力な衛星レーザーが降り注ぐ。", 
      classes: ['Sniper'], isOwned: ()=>stats.orbital, f:()=>{stats.orbital=true;} },
    { title: "👻 ファントムバレット", desc: "壁や敵をすり抜け、画面外から戻ってくる魔法の弾丸。", 
      classes: ['Sniper'], isOwned: ()=>stats.phantom, f:()=>{stats.phantom=true; stats.ghostShot=true;} },
    { title: "🎯 サーマルスコープ", desc: "画面外の敵にもホーミングが適用され、クリティカル率が上がる。", 
      classes: ['Sniper'], isOwned: ()=>stats.thermal, f:()=>{stats.thermal=true; stats.homing+=2;} },

    // === ガーディアン (Guardian) ===
    { title: "🏗️ セントリーシステム", desc: "10秒ごとに自動攻撃タレットを設置する。", 
      classes: ['Guardian'], isOwned: ()=>stats.sentrySystem, f:()=>{stats.sentrySystem=true; spawnSentry();} },
    { title: "🏯 シージモード", desc: "立ち止まっている間、攻撃速度とダメージが2倍。", 
      classes: ['Guardian'], isOwned: ()=>stats.siegeMode, f:()=>{stats.siegeMode=true;} },
    { title: "⚡ リアクティブアーマー", desc: "ダメージを受けると、周囲に電撃カウンターを放つ。", 
      classes: ['Guardian'], isOwned: ()=>stats.reactiveArmor, f:()=>{stats.reactiveArmor=true;} },
    { title: "❤️ ナノマシン修復", desc: "HPが30%以下になると超高速で自然回復する。", 
      classes: ['Guardian'], isOwned: ()=>stats.nanoRepair, f:()=>{stats.nanoRepair=true;} },
    { title: "💣 クラスターマイン", desc: "ダッシュ時に大量の地雷をばら撒く。", 
      classes: ['Guardian'], isOwned: ()=>stats.clusterMine, f:()=>{stats.clusterMine=true;} },
    { title: "🛡️ フォースフィールド", desc: "定期的にダメージを完全無効化するバリアを展開。", 
      classes: ['Guardian'], isOwned: ()=>stats.forceField, f:()=>{stats.forceField=true;} },
    { title: "🚁 護衛ドローン", desc: "プレイヤーの周囲を旋回し、近づく敵を迎撃するドローンを配備。", 
      classes: ['Guardian'], isOwned: ()=>stats.guardDrone, f:()=>{stats.guardDrone=true;} },
    { title: "🏰 移動要塞", desc: "移動速度が半減する代わりに、防御力とHPが大幅に上昇する。", 
      classes: ['Guardian'], isOwned: ()=>stats.armor>=25, f:()=>{stats.spd*=0.5; stats.armor+=10; player.maxHp+=500; player.hp+=500;} },

    // === アルケミスト (Alchemist) ===
    { title: "☣️ パンデミック", desc: "毒を受けた敵が死ぬと、その場に毒ガスを発生させる。", 
      classes: ['Alchemist'], isOwned: ()=>stats.pandemic, f:()=>{stats.pandemic=true;} },
    { title: "🧪 神経毒", desc: "毒ガスの範囲内にいる敵の移動速度を大幅に下げる。", 
      classes: ['Alchemist'], isOwned: ()=>stats.neurotoxin, f:()=>{stats.neurotoxin=true;} },
    { title: "🧊 コールドフラスコ", desc: "攻撃時、10%の確率で敵を凍結させる。", 
      classes: ['Alchemist'], isOwned: ()=>stats.coldFlask, f:()=>{stats.coldFlask=true;} },
    { title: "🤢 腐食液", desc: "毒ガスのダメージ間隔が半分になり、火力が倍増する。", 
      classes: ['Alchemist'], isOwned: ()=>stats.corrosion, f:()=>{stats.corrosion=true;} },
    { title: "💊 違法な興奮剤", desc: "移動速度+20、連射速度+20%。ただし被ダメージが1.5倍になる。", 
      classes: ['Alchemist'], isOwned: ()=>stats.drugMode, f:()=>{stats.spd+=20; stats.rate-=5; stats.armor-=5; stats.drugMode=true;} },
    { title: "🌧️ アシッドレイン", desc: "3秒ごとにランダムな場所に強力な酸の雨（毒沼）を降らせる。", 
      classes: ['Alchemist'], isOwned: ()=>stats.acidRain, f:()=>{stats.acidRain=true;} },
    { title: "🧟 ゾンビウイルス", desc: "倒した敵が一定確率で味方のミニオンとして復活する。", 
      classes: ['Alchemist'], isOwned: ()=>stats.zombieVirus, f:()=>{stats.zombieVirus=true;} },
    { title: "⚗️ ケミカル・バーン", desc: "毒状態の敵に攻撃すると、追加で爆発ダメージを与える。", 
      classes: ['Alchemist'], isOwned: ()=>stats.chemicalBurn, f:()=>{stats.chemicalBurn=true;} },

    // === トリックスター (Trickster) ===
    { title: "🎰 スロットマシン", desc: "5秒ごとにランダムなステータスが劇的に変化する。", 
      classes: ['Trickster'], isOwned: ()=>stats.slotMachine, f:()=>{stats.slotMachine=true;} },
    { title: "🃏 ジョーカー", desc: "HPが減るほど、クリティカル率と回避率が超上昇する。", 
      classes: ['Trickster'], isOwned: ()=>stats.joker, f:()=>{stats.joker=true;} },
    { title: "🎲 ロシアンルーレット", desc: "1/6の確率でダメージが10倍になるが、たまに不発になる。", 
      classes: ['Trickster'], isOwned: ()=>stats.russianRoulette, f:()=>{stats.russianRoulette=true;} },
    { title: "✨ マジックカード", desc: "弾が敵を貫通し、壁で跳ね返るようになる。", 
      classes: ['Trickster'], isOwned: ()=>stats.shotBounce, f:()=>{stats.pierce+=2; stats.shotBounce=true;} },
    { title: "💰 ジャックポット", desc: "敵を倒した時、稀に大量の経験値オーブが爆発四散する。", 
      classes: ['Trickster'], isOwned: ()=>stats.jackpot, f:()=>{stats.jackpot=true;} },
    { title: "🌀 カオス弾", desc: "弾が不規則に蛇行し、サイズもバラバラになる。", 
      classes: ['Trickster'], isOwned: ()=>stats.chaosShot, f:()=>{stats.chaosShot=true;} },
    { title: "🎲 ラッキーセブン", desc: "7発ごとの攻撃が必ずクリティカル＆範囲攻撃になる。", 
      classes: ['Trickster'], isOwned: ()=>stats.luckySeven, f:()=>{stats.luckySeven=true;} },
    { title: "🃏 ワイルドカード", desc: "他のクラスの禁断の力（スキル）がランダムで1つ発動する。", 
      classes: ['Trickster'], isOwned: ()=>stats.wildCard, f:()=>{stats.wildCard=true;} }
];

// --- 第1次進化 (Level 5) ---
const EVO_DATA = [
    { id: 'Samurai', icon: '⚔️', title: '侍・剣豪', desc: '一閃: 射程は短いが、前方の敵を一瞬で葬る「斬撃」を放つ。', 
      color: '#ffffff', func: ()=>{
        stats.samuraiMode = true; stats.rate = 20; stats.dmg = 300; 
        stats.spd += 5; stats.pierce = 999; stats.knockback = 0;
      }},
    { id: 'Tempest', icon: '⚡', title: '雷帝', desc: '天変地異: 常に周囲に落雷が発生し、攻撃弾も連鎖雷撃を引き起こす。', 
      color: '#8A2BE2', func: ()=>{
        stats.tempestMode = true; stats.rate = 8; stats.dmg = 15; 
        stats.lightning = 3; stats.bulletSpeed = 25;
      }},
    { id: 'Assault', icon: '🔫', title: 'アサルト', desc: '連射特化: マシンガン(連射・2発・貫通)解禁', 
      color: '#00ffff', func: ()=>{
        stats.rate=4; stats.dmg+=10; stats.multi=1; stats.pierce=1;
      }},
    { id: 'Melee', icon: '🛡️', title: 'ヴァンガード', desc: '近接: 超・広範囲 & HP+500/リジェネ+10', 
      color: '#ff3333', func: ()=>{
        stats.aura=true; stats.auraRange=180; stats.spd+=1; 
        player.maxHp+=500; player.hp+=500; stats.regen+=10;
      }},
    { id: 'Sniper', icon: '🔭', title: 'スナイパー', desc: '遠距離: 💥破片 & 🔙ノックバック', 
      color: '#ffff00', func: ()=>{
        stats.rate=35; stats.dmg=200; stats.pierce=2; stats.bulletSpeed=30; stats.multi=0;
        stats.drones+=1; stats.shrapnel=true; stats.knockback=1;
      }},
    { id: 'Guardian', icon: '🧱', title: 'ガーディアン', desc: '機動要塞: タレット8基展開・反射装甲・高耐久', 
      color: '#00ff88', func: ()=>{
        stats.armor+=20; player.maxHp+=1500; player.hp=player.maxHp; 
        stats.spd-=0.5; stats.magnet+=200; stats.sentryRate=2.5; 
        stats.sentryMax=6; stats.sentrySystem=true; spawnSentry(); stats.spikeReflect=true;
      }},
    { id: 'Alchemist', icon: '⚗️', title: 'アルケミスト', desc: '毒物劇物: 毒ガス・凍結・弱体化をバラ撒く', 
      color: '#aa00ff', func: ()=>{
        stats.poison = 5; stats.dmg *= 0.7; stats.rate *= 0.9; 
        stats.alchemistMode = true; stats.neurotoxin = false; stats.pandemic = false;
      }},
    { id: 'Trickster', icon: '🃏', title: 'トリックスター', desc: '運否天賦: 弾の性能が毎回ランダムに変化する。', 
      color: '#ff00ff', func: ()=>{
        stats.rate = 5; stats.dmg = 18; stats.tricksterMode = true; 
        stats.slotMachine = false; stats.joker = false;
      }}
];

// --- 第2次進化 (Level 40) ---
const SECOND_EVO_DATA = [
    // Samurai
    { parent: 'Samurai', id: 'Ashura', icon: '👹', title: '阿修羅', desc: '乱舞: 攻撃速度が極限まで上昇し、目にも止まらぬ連続斬りを繰り出す。', 
      color: '#ff0033', func: ()=>{ stats.rate = 15; stats.dmg *= 0.8; } },
    { parent: 'Samurai', id: 'Kensei', icon: '🌀', title: '剣聖', desc: '真空波: 斬撃と同時に、遠くまで飛ぶ鋭い衝撃波を放つ。', 
      color: '#ccccff', func: ()=>{ stats.swordWave = true; stats.dmg *= 1.5; } },

    // Tempest
    { parent: 'Tempest', id: 'Thor', icon: '⛈️', title: 'トール', desc: '雷神: 落雷の同時攻撃数が劇的に増え、画面全体を焼き払う。', 
      color: '#ffff00', func: ()=>{ stats.lightning += 5; stats.lightningDmgMult = 2.0; } },
    { parent: 'Tempest', id: 'PlasmaLord', icon: '⚛️', title: 'プラズマロード', desc: '球状稲妻: 弾が「超低速で進みながら周囲を感電させる球体」に変化する。', 
      color: '#aa00ff', func: ()=>{ stats.bulletSpeed = 3; stats.pierce = 999; stats.dmg *= 2.0; player.size = 20; } },

    // Alchemist
    { parent: 'Alchemist', id: 'NecroToxin', icon: '🧟', title: 'ネクロトキシコロジスト', desc: '死者蘇生: 毒で倒した敵が高確率で味方のゾンビとして蘇る。', 
      color: '#00ff00', func: ()=>{ stats.zombieVirus = true; } },
    { parent: 'Alchemist', id: 'MadScientist', icon: '💥', title: 'マッドサイエンティスト', desc: '連鎖爆発: 毒ガスが引火性になり、攻撃を当てると大爆発を起こす。', 
      color: '#ff00ff', func: ()=>{ stats.chemicalBurn = true; stats.dmg *= 1.5; } },

    // Trickster
    { parent: 'Trickster', id: 'Gambler', icon: '🎰', title: 'ギャンブラー', desc: 'ジャックポット: 敵撃破時の経験値獲得量が稀に100倍になる。', 
      color: '#ffd700', func: ()=>{ stats.jackpotChance = 0.1; } },
    { parent: 'Trickster', id: 'JokerMaster', icon: '🃏', title: 'ジョーカー', desc: 'ワイルドカード: 全クラスの最強スキルがランダムで発動する。', 
      color: '#ffffff', func: ()=>{ stats.wildCard = true; } },

    // Assault
    { parent: 'Assault', id: 'ClusterStriker', icon: '💥', title: 'クラスター・ストライカー', desc: '爆発特化: 着弾時に「子爆弾」が周囲に飛び散り、誘爆連鎖を引き起こす。', 
      color: '#ff8800', func: ()=>{ stats.clusterStriker = true; stats.dmg *= 1.2; } },
    { parent: 'Assault', id: 'BulletStorm', icon: '🌪️', title: 'バレット・ストーム', desc: '弾幕特化: 攻撃中、連射速度と拡散範囲が無限に上昇する。画面を埋め尽くせ！', 
      color: '#0088ff', func: ()=>{ stats.bulletStorm = true; } },

    // Melee
    { parent: 'Melee', id: 'FlyingSwords', icon: '🗡️', title: '御剣', desc: '遠隔斬撃: 回転刃がプレイヤーから離れ、自律して敵を追尾・切り刻む。', 
      color: '#ff0066', func: ()=>{ /* ロジック側で処理 */ } },
    { parent: 'Melee', id: 'SunCrusher', icon: '☀️', title: 'サン・クラッシャー', desc: '灼熱領域: 停止中にエネルギー充填。移動開始時に超広範囲の爆熱波を放つ。', 
      color: '#ffd700', func: ()=>{ stats.auraRange += 50; } },

    // Sniper
    { parent: 'Sniper', id: 'DimensionWalker', icon: '🌌', title: 'ディメンション・ウォーカー', desc: '次元干渉: 弾が画面端をループする度、巨大化し威力が倍増する。', 
      color: '#88ff88', func: ()=>{ stats.ghostShot = true; stats.infinitePierce = true; } },
    { parent: 'Sniper', id: 'PrismShooter', icon: '💎', title: 'プリズム・シューター', desc: '幾何学反射: 弾が敵や壁に当たるたびに2つに分裂し、レーザー網を形成する。', 
      color: '#ff00ff', func: ()=>{ stats.prismSplit = true; stats.dmg *= 0.8; } },

    // Guardian
    { parent: 'Guardian', id: 'TeslaEngineer', icon: '⚡', title: 'テスラ・エンジニア', desc: '電気柵: 設置したタレット同士が「高圧電流」で接続され、触れた敵を焼き尽くす。', 
      color: '#00ffcc', func: ()=>{ stats.teslaGrid = true; stats.sentryMax = 12; } },
    { parent: 'Guardian', id: 'EarthShaker', icon: '🦍', title: 'アース・シェイカー', desc: '重戦車: 巨大化し、歩くだけで足元に衝撃波が発生。敵を弾き飛ばし粉砕する。', 
      color: '#885500', func: ()=>{ stats.isEarthShaker = true; player.size = 30; player.maxHp += 1000; player.hp += 1000; stats.armor += 10; } }
];

// 1. 敵の出現パターン（WAVEデータ）
// time: 開始時間(秒), enemies: その時間帯に出る敵のリスト
const WAVE_DATA = [
    { time: 0,   enemies: ['normal'] },
    { time: 30,  enemies: ['normal', 'splitter'] },
    { time: 60,  enemies: ['normal', 'splitter', 'bat'] },
    { time: 120, enemies: ['normal', 'bat', 'dasher'] },
    { time: 150, enemies: ['splitter', 'dasher', 'shooter'] },
    { time: 180, enemies: ['dasher', 'shooter', 'tank'] },
    { time: 240, enemies: ['shooter', 'tank',] },
    // 時間経過でもっと難しい組み合わせを追加可能
];

// 2. スキル表示用リスト
// key: statsの変数名, label: 表示名, color: 文字色
const SKILL_DISPLAY_LIST = [
    { key: 'omegaLaser',    label: '⚡ OMEGA LASER', color: '#f0f' },
    { key: 'absoluteZero',  label: '❄️ ZERO AURA',   color: '#0ff' },
    { key: 'titan',         label: '🦍 TITAN',       color: '#f00' },
    { key: 'gatling',       label: '⚙️ GATLING',     color: '#0ff' },
    { key: 'railgun',       label: '🚅 RAILGUN',     color: '#ff0' },
    { key: 'chainBurst',    label: '💥 CHAIN BURST', color: '#0ff' },
    { key: 'electroFence',  label: '⚡ ELECTRO FENCE', color: '#0ff' },
    { key: 'shrapnel',      label: '💥 SHRAPNEL',    color: '#ff0' },
    { key: 'reactiveArmor', label: '⚡ REACTIVE ARMOR', color: '#0f0' },
    // 以下、条件付き表示やフォーマットが必要なものは別途処理しますが、基本はここに足すだけ
];

// ★ スキル効果の定義（ロジックの分離）
// ここに書くことで game.js を汚さずに複雑なスキルを追加できる

// ファントムストライク（攻撃時、確率で追撃）
SkillSystem.on('onHit', (ctx) => {
    // 必要なデータを取り出す
    const { enemy, dmg, isPhantom } = ctx;

    // 条件判定: スキル未取得、または既に追撃(Phantom)なら発動しない
    if (!stats.phantomStrike || stats.phantomStrike <= 0 || isPhantom) return;

    // 発動確率
    let chance = 0.2 + (stats.phantomStrike * 0.1);
    if (Math.random() > chance) return;

    // クラスごとの効果分岐
    let phantomDmg = dmg * 0.5;
    let isCrit = false;
    let target = enemy; // 基本は攻撃した相手

    if(player.class === 'Samurai' || player.subClass === 'Ashura' || player.subClass === 'Kensei') {
        phantomDmg = dmg * 1.0; isCrit = true; 
    } else if(player.class === 'Sniper' || player.subClass === 'DimensionWalker') {
        // スナイパーは最も弱った敵を狙う
        let weakest = null; let minHp = Infinity;
        enemies.forEach(tg => { if(!tg.dead && tg.hp < minHp) { minHp=tg.hp; weakest=tg; } });
        if(weakest && weakest !== enemy) {
            target = weakest;
            phantomDmg = dmg * 1.5;
        }
    } else if(player.class === 'Melee' || player.class === 'Vanguard') {
        phantomDmg = dmg * 0.3;
        //if(player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 0.5);
    } else if(player.class === 'Assault') {
        phantomDmg = dmg * 0.3;
        // アサルトは少し遅れてダメージ（別関数呼び出しが必要なため、ここでは即時適用とする簡易化も可だが、元の挙動を再現）
        // ※setTimeoutはthis等のコンテキストに注意が必要だが、ここではシンプルに実装
    } else if(player.class === 'Guardian') {
        phantomDmg = dmg * 0.3;
        // 周囲の敵を引き寄せる
        enemies.forEach(sub => {
            if(!sub.dead && Math.hypot(sub.x-enemy.x, sub.y-enemy.y) < 100) {
                sub.x += (sub.x - enemy.x) * 0.1; sub.y += (sub.y - enemy.y) * 0.1;
            }
        });
    } else if(player.class === 'Alchemist') {
        phantomDmg = dmg * 0.4;
        enemy.hpDamageTakenMult = 1.2; // 被ダメアップデバフ(概念)
        phantomDmg += 10; 
    } else if(player.class === 'Trickster') {
        phantomDmg = dmg * (Math.random() * 5.0);
    } else if(player.class === 'Tempest') {
        phantomDmg = dmg * 0.6; enemy.frozen = 30;
    }

    // 追撃ダメージ適用（isPhantomフラグをtrueにして無限ループ防止）
    damageEnemy(target, phantomDmg, true);
    
    // エフェクト
    if(target && typeof particles !== 'undefined') {
        // ★追加1: 音で知らせる (デジタルのような高い音)
        // hit音のピッチを2.0(倍速)にして、キンッ！という鋭い音にする
        Sound.play('hit', 2.0);

        const pColor = '#d0f'; // ネオンパープル
        const pSize = 6;       // サイズアップ (4 -> 6)
        const pSpeed = 3;      // スピードダウン (6 -> 3) 残像が見やすくなる
        const pLife = 20;      // 表示時間アップ (10 -> 20)

        // ★追加2: 十字クロス (ゆっくり広がる)
        particles.push({x:target.x, y:target.y, vx:0, vy:-pSpeed, life:pLife, size:pSize, color:pColor}); // 上
        particles.push({x:target.x, y:target.y, vx:0, vy:pSpeed,  life:pLife, size:pSize, color:pColor}); // 下
        particles.push({x:target.x, y:target.y, vx:-pSpeed, vy:0, life:pLife, size:pSize, color:pColor}); // 左
        particles.push({x:target.x, y:target.y, vx:pSpeed, vy:0,  life:pLife, size:pSize, color:pColor}); // 右

        // ★追加3: 幾何学的リング (ショックウェーブ)
        // 敵を中心に紫の円がスッと広がる
        particles.push({
            type: 'shockwave', 
            x: target.x, 
            y: target.y, 
            size: target.size, // 敵のサイズから開始
            life: 15,          // 一瞬で消える
            color: '#d0f'      // 紫
        });
    }
});

SkillSystem.on('onBeforeDamage', (ctx) => {
    const { enemy } = ctx;

    // 1. ジャイアントキラー (ボス・タンク特攻)
    if(stats.giantSlayer && (enemy.type === 'boss' || enemy.ai === 'tank')) {
        ctx.dmg *= 2;
    }

    // 2. 処刑人 (残りHP20%以下で即死級ダメージ)
    if(stats.executioner && (enemy.hp < enemy.maxHp * 0.2)) {
        ctx.dmg = enemy.hp + 999;
    }

    // 3. 処刑 (スナイパー用: 残りHP30%以下)
    if(stats.execute && (enemy.hp < enemy.maxHp * 0.3)) {
        ctx.dmg = enemy.hp + 9999;
    }

    // 4. ジャイアントキラー (割合ダメージ追加)
    if(stats.hpDamage > 0) {
        let percentDmg = enemy.maxHp * stats.hpDamage;
        let cap = stats.dmg * 50; // 上限キャップ
        ctx.dmg += Math.min(percentDmg, cap);
    }

    // 5. 鮮血の爪 (背水: HPが減るほど攻撃UP)
    if(stats.lowHpDmg) {
        let lostHpRatio = 1.0 - (player.hp / player.maxHp);
        ctx.dmg *= (1.0 + lostHpRatio * 2.0);
        // HP半分以下なら確定クリティカル扱いにフラグを立てる
        if(lostHpRatio > 0.5) ctx.isCrit = true;
    }
    
    // 6. シージモード (静止時ダメージ倍)
    if(stats.siegeMode && stats.isStationary) {
        ctx.dmg *= 2;
    }
});

SkillSystem.on('onKill', (ctx) => {
    const { enemy, player } = ctx; // playerも参照できるように渡す

    // 1. チェーンバースト (連鎖爆発)
    if(stats.chainBurst) {
        Sound.play('explode', 2.0);
        let range = 100;
        let burstDmg = stats.dmg * 2;
        if(Math.random() < 0.3) createParticles(enemy.x, enemy.y, '#0ff', 5, 3);
        enemies.forEach(subE => {
            if(!subE.dead && Math.hypot(subE.x - enemy.x, subE.y - enemy.y) < range) {
                damageEnemy(subE, burstDmg);
            }
        });
    }

    // 2. シュラプネル (破片飛び散り)
    if(stats.shrapnel) {
        for(let i=0; i<3; i++) {
            let ang = Math.random() * Math.PI * 2;
            bullets.push({
                type:'normal', x:enemy.x, y:enemy.y, 
                vx:Math.cos(ang)*8, vy:Math.sin(ang)*8, 
                size:3, hit:[enemy.id], pierce:1, isMini:true, life:15
            });
        }
    }

    // 3. ネクロマンサー (怨霊召喚)
    if(stats.necromancer) {
        // 現在画面上にいる 'spirit' の数を数える
        const spiritCount = bullets.filter(b => b.type === 'spirit').length;
        
        // 上限（ここでは5体）を超えていたら召喚しない
        if(spiritCount < 50) {
            bullets.push({type: 'spirit', x: enemy.x, y: enemy.y, vx: 0, vy: 0, speed: 8, size: 6, hit: [], isMini: false});
        }
    }

    // 4. ブラッドラスト (撃破時HP1%回復)
    if(stats.bloodLust) { 
        player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.01);
        updateUI(); // UI更新が必要
    }

    // 5. ジャックポット (経験値爆発)
    if(stats.jackpot && Math.random() < 0.05) { 
        Sound.play('levelup');
        for(let k=0; k<5; k++) {
            let angle = Math.random() * Math.PI * 2;
            let dist = Math.random() * 30;
            expOrbs.push({
                x: enemy.x + Math.cos(angle)*dist, y: enemy.y + Math.sin(angle)*dist, 
                size: 8, val: 100, color: '#ffd700', pitch: 1.5
            });
        }
        if(texts.length < MAX_TEXTS) texts.push({x:enemy.x, y:enemy.y, str:"JACKPOT!", life:60, color:'#ffd700'});
    }

    // 6. ライフスティール (固定値回復)
    if(stats.lifesteal > 0) { 
        player.hp = Math.min(player.maxHp, player.hp + stats.lifesteal); 
        updateUI(); 
    }
});

const ACTIVE_SKILLS_DATA = {
    'earthquake': {
        interval: 120, // クールダウンフレーム数
        onUpdate: (state, ts) => {
            state.timer -= ts;
            if(state.timer <= 0) {
                state.timer = 120; // リセット
                
                // --- 旧 game.js にあったロジック ---
                screenShake = 15; 
                Sound.play('bash');
                // stats.dmg などを参照して攻撃
                enemies.forEach(e => { if(!e.dead) damageEnemy(e, stats.dmg * 2); });
                particles.push({type:'shockwave', x:player.x, y:player.y, size:400, life:30, color:'#f80'});
            }
        }
    },
    'electroFence': {
        interval: 60,
        onUpdate: (state, ts) => {
            state.timer -= ts;
            if(state.timer <= 0) {
                state.timer = 60;
                
                // --- 旧 game.js にあったロジック ---
                let r = 150;
                Sound.play('spark');
                particles.push({type:'shockwave', x:player.x, y:player.y, size:r, life:20, color:'#88ffff'});
                enemies.forEach(e => {
                    if(!e.dead && Math.hypot(e.x-player.x, e.y-player.y) < r + e.size) {
                        damageEnemy(e, stats.dmg);
                        e.frozen = 30; 
                        let ang = Math.atan2(e.y-player.y, e.x-player.x);
                        e.x += Math.cos(ang) * 30; e.y += Math.sin(ang) * 30; 
                        createLightningEffect(player.x, player.y, e.x, e.y);
                    }
                });
            }
        }
    }
};
