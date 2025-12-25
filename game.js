// --- Game Logic ---

function loop(timestamp) {
    if(!gameActive) return;
    const dt = timestamp - lastTime;
    lastTime = timestamp;
    let timeScale = dt / (1000 / 60);
    if(timeScale > 4) timeScale = 4;
    
    Sound.update();

    update(timeScale);
    draw(); // Defined in ui.js
    requestAnimationFrame(loop);
}

function update(ts) {
    // 1. システム・時間管理
    let gameTimeSec = updateSystem(ts);

    // 2. プレイヤー状態 (移動・HP回復・CD)
    updatePlayer(ts);

    // 3. スキル発動判定 (パッシブ・アクティブ)
    updateSkills(ts);

    // 4. 攻撃処理 (射撃・オーラ・近接)
    updateCombat(ts);

    // 5. 弾丸・エフェクト更新 (プレイヤー弾・敵弾)
    updateProjectiles(ts);

    // 6. 敵の処理 (スポーン・AI・衝突)
    updateEnemies(ts, gameTimeSec);

    // 7. アイテム・演出 (オーブ・テキスト・パーティクル)
    updateObjects(ts);
}

// --- Sub Functions ---

function updateSystem(ts) {
    let gameTimeSec = (Date.now() - startTime) / 1000;

    // ★ 追加: ダメージを受けていない時間を計測 (tsは1.0=1/60秒なので、60で割って秒換算)
    if(gameActive) {
        noDamageTimer += ts / 60;
    }
    
    // シンギュラリティ
    if(level >= 100 && !singularityMode) {
        singularityMode = true;
        Sound.play('milestone');
    }

    // 時間表示
    let m = Math.floor(gameTimeSec/60);
    let s = Math.floor(gameTimeSec%60);
    document.getElementById('disp-time').innerText = `${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;

    if(screenShake > 0) screenShake *= 0.9;
    
    return gameTimeSec;
}

function updatePlayer(ts) {
    // ★修正: 変数が未定義の場合に初期化する処理を追加
    if(typeof player.shootCd === 'undefined') player.shootCd = 0;
    if(typeof player.missileCd === 'undefined') player.missileCd = 0;

    // クールダウン減算
    if(player.dashCd > 0) player.dashCd -= ts;
    if(player.invincible > 0) player.invincible -= ts;
    if(player.slamCd > 0) player.slamCd -= ts;
    if(player.missileCd > 0) player.missileCd -= ts; 
    if(player.shootCd > 0) player.shootCd -= ts;     

    // 自然回復
    if(player.hp < player.maxHp) {
        // 確率ではなく、経過時間(ts)に応じて毎フレーム少しずつ回復させる
        // stats.regen は「1秒あたりの回復量」なので 60 で割る
        let healAmount = (stats.regen / 60) * ts;
        player.hp = Math.min(player.maxHp, player.hp + healAmount);
    }
    
    // HPの変化を毎フレーム描画に反映させる
    updateUI();
    
    // ナノリペア
    if(stats.nanoRepair && player.hp < player.maxHp * 0.3) {
        player.hp = Math.min(player.maxHp, player.hp + (50/60)*ts);
    }

    // 移動入力
    let dx = 0, dy = 0;
    if(keys['w'] || keys['ArrowUp']) dy = -1;
    if(keys['s'] || keys['ArrowDown']) dy = 1;
    if(keys['a'] || keys['ArrowLeft']) dx = -1;
    if(keys['d'] || keys['ArrowRight']) dx = 1;
    if(joyTouchId !== null) { dx = joyMoveX; dy = joyMoveY; }

    if(dx!==0 || dy!==0) {
        let len = Math.hypot(dx, dy);
        if(len > 1) { dx/=len; dy/=len; }
        player.x += dx * stats.spd * ts;
        player.y += dy * stats.spd * ts;
        stats.isStationary = false;
        player.isMoving = true;
        
        // アースシェイカー(移動時攻撃)
        if(stats.isEarthShaker && Math.floor(Date.now() / 200) % 2 === 0) { 
            screenShake = 2;
            enemies.forEach(e => {
                if(!e.dead && Math.hypot(e.x-player.x, e.y-player.y) < player.size + 40) {
                    damageEnemy(e, stats.dmg * 0.5); 
                    let pushAng = Math.atan2(e.y - player.y, e.x - player.x);
                    e.x += Math.cos(pushAng) * 10 * ts; e.y += Math.sin(pushAng) * 10 * ts; 
                }
            });
        }
    } else {
        stats.isStationary = true;
        player.isMoving = false;
    }

    // ドッペルゲンガー位置
    if(stats.doppelganger) {
        if(!player.clone) player.clone = {x:player.x, y:player.y};
        let lerp = 0.1;
        let targetX = player.x - (player.isMoving ? Math.sign(player.x - player.clone.x)*40 : 40);
        player.clone.x += (targetX - player.clone.x) * lerp;
        player.clone.y += (player.y - player.clone.y) * lerp;
    }
}

function updateSkills(ts) {
    // アクティブスキル
    activeSkills.forEach(skill => {
        if(skill.def && skill.def.onUpdate) skill.def.onUpdate(skill, ts);
    });

    // セントリー
    if(stats.sentrySystem) {
        sentryTimer -= ts;
        if(sentryTimer <= 0) { spawnSentry(); sentryTimer = 600 / stats.sentryRate; }
        sentries.forEach(s => {
            s.cooldown -= ts;
            if(s.cooldown <= 0) {
                let target = null, minDSq = 400*400; 
                enemies.forEach(e => {
                    if(e.dead) return;
                    let dSq = (e.x - s.x)**2 + (e.y - s.y)**2;
                    if(dSq < minDSq) { minDSq = dSq; target = e; }
                });
                if(target) {
                    let ang = Math.atan2(target.y - s.y, target.x - s.x);
                    let count = Math.floor(stats.multi);
                    if(count < 1) count = 1;
                    
                    // 複数発射時の拡散角度 (0.2ラジアンずつ広げる)
                    let spread = 0.2; 
                    let startAngle = ang - (spread * (count - 1)) / 2;

                    for(let i=0; i<count; i++) {
                        let currentAngle = startAngle + spread * i;
                        bullets.push({
                            type:'normal', 
                            x:s.x, y:s.y, 
                            vx:Math.cos(currentAngle)*stats.bulletSpeed, 
                            vy:Math.sin(currentAngle)*stats.bulletSpeed, 
                            size:6, color:'#0f0', hit:[], pierce:stats.pierce
                        });
                    }
                    Sound.play('shoot', 1.5);
                    s.cooldown = Math.max(5, stats.rate * (1/stats.sentryRate));
                }
            }
        });
        // テスラグリッド
        if(stats.teslaGrid && sentries.length >= 2) {
            for(let i=0; i<sentries.length; i++) {
                let s1 = sentries[i], s2 = sentries[(i+1)%sentries.length];
                enemies.forEach(e => {
                    if(!e.dead && pointToLineDistance(e.x, e.y, s1.x, s1.y, s2.x, s2.y) < e.size + 5) {
                        damageEnemy(e, stats.dmg * 2.0);
                        if(Math.random()<0.2*ts) createParticles(e.x, e.y, '#0ff', 2, 2);
                    }
                });
            }
        }
    }

    // スロットマシン
    if(stats.slotMachine) {
        if(typeof player.slotTimer === 'undefined') player.slotTimer = 300;
        player.slotTimer -= ts;
        if(player.slotTimer <= 0) {
            player.slotTimer = 300; Sound.play('powerup');
            let luck = Math.random();
            if(luck < 0.3) { stats.rate = 2; texts.push({x:player.x, y:player.y-20, str:"FEVER!!", life:60, color:'#ff0'}); } 
            else if(luck < 0.6) { stats.bulletSpeed = 40; texts.push({x:player.x, y:player.y-20, str:"SPEED UP!", life:60, color:'#0ff'}); } 
            else if(luck < 0.8) { player.size = 50; texts.push({x:player.x, y:player.y-20, str:"BIG MODE", life:60, color:'#f00'}); } 
            else { stats.multi = 10; texts.push({x:player.x, y:player.y-20, str:"MULTI!!", life:60, color:'#f0f'}); }
            setTimeout(()=>{ stats.rate = 5; stats.bulletSpeed = 16; player.size = 15; stats.multi = 1; }, 3000);
        }
    }

    // オメガレーザー
    if(stats.omegaLaser) {
        player.laserCd = (player.laserCd || 0) - ts;
        if(player.laserCd <= 0) { fireOmegaLaser(); player.laserCd = 180; }
    }

    // ヴォイドリフト
    if(stats.voidRift > 0) {
        if(typeof player.voidTimer === 'undefined') player.voidTimer = 0;
        player.voidTimer -= ts;
        if(player.voidTimer <= 0) {
            let interval = Math.max(10, Math.max(20, 120 - (stats.voidRift * 5)) * (stats.rate / 20));
            player.voidTimer = interval;
            let targets = enemies.filter(e => !e.dead && Math.hypot(e.x-player.x, e.y-player.y) < 600);
            if(targets.length > 0) {
                let count = 1 + Math.floor(stats.voidRift / 5);
                for(let k=0; k<count; k++) {
                    if(targets.length === 0) break;
                    let idx = Math.floor(Math.random() * targets.length);
                    triggerVoidRift(targets[idx]); targets.splice(idx, 1);
                }
            }
        }
    }

    // テンペスト雷
    if(stats.tempestMode && Math.random() < 0.1 * ts) { 
        let targets = enemies.filter(e => !e.dead && Math.hypot(e.x-player.x, e.y-player.y) < 500);
        if(targets.length > 0) triggerLightning(targets[Math.floor(Math.random() * targets.length)], stats.lightning);
    }

    // アブソリュートゼロ
    if(stats.absoluteZero) {
        enemies.forEach(e => {
            if(!e.dead && Math.hypot(e.x-player.x, e.y-player.y) < 200 && Math.random() < 0.5) e.frozen = 2;
        });
        if(Math.random() < 0.2*ts && particles.length < MAX_PARTICLES) createParticles(player.x + (Math.random()-0.5)*500, player.y + (Math.random()-0.5)*500, '#88ffff', 1, 1);
    }
    
    // フォースフィールド
    if(stats.forceField && stats.forceFieldCd > 0) stats.forceFieldCd -= ts;
    
    // オービタル
    if(stats.orbital && Math.random() < 0.05 * ts) {
        let t = enemies[Math.floor(Math.random()*enemies.length)];
        if(t && !t.dead) {
            createParticles(t.x, t.y, '#f0f', 10, 3); damageEnemy(t, stats.dmg * 5); Sound.play('laser');
            particles.push({type:'shockwave', x:t.x, y:t.y, size:50, life:10, color:'#f0f'});
        }
    }
    
    // 毒ガス発生
    if(stats.poison > 0 && Math.random() < (1/30)*ts) {
        let spawnCount = Math.max(1, Math.floor(stats.multi));
        let targets = enemies.filter(e => !e.dead && Math.hypot(e.x - player.x, e.y - player.y) < 500);
        for(let k=0; k<spawnCount; k++) {
            if(targets.length === 0 && k===0) {
                gasClouds.push({ x: player.x, y: player.y, r: (30 + stats.poison * 10) * stats.areaScale, life: (180 + stats.poison * 30) * stats.duration, dmg: stats.dmg * (0.2 + stats.poison * 0.1), tick: 0 }); break;
            } else if(targets.length > 0) {
                let idx = Math.floor(Math.random() * targets.length); let t = targets[idx];
                gasClouds.push({ x: t.x, y: t.y, r: (30 + stats.poison * 10) * stats.areaScale, life: (180 + stats.poison * 30) * stats.duration, dmg: stats.dmg * (0.2 + stats.poison * 0.1), tick: 0 });
                targets.splice(idx, 1);
            }
        }
    }
}

function updateCombat(ts) {
    // 1. オーラ攻撃
    if(stats.aura) {
        let r = stats.auraRange * stats.auraScale * stats.areaScale;
        let auraRate = 0.1 + (player.class === 'Melee' && stats.homing > 0 ? stats.homing * 0.05 : 0);
        
        if(player.subClass === 'SunCrusher') {
            if(player.isMoving && player.sunCharge > 0) {
                player.sunCharge -= ts * 5; r += player.sunCharge * 2; auraRate = 0.5;
                if(Math.random() < 0.3) createParticles(player.x+(Math.random()-0.5)*r, player.y+(Math.random()-0.5)*r, '#fa0', 1, 3);
            } else if(!player.isMoving) {
                player.sunCharge = Math.min(100, player.sunCharge + ts); r = 10;
                if(Math.random()<0.1) createParticles(player.x, player.y, '#fa0', 1, 1);
            }
        }

        enemies.forEach(e => { 
            if(e.dead) return;
            let dist = Math.hypot(e.x-player.x, e.y-player.y);
            if(dist < r + e.size) {
                if(Math.random() < auraRate * ts) {
                    let d = stats.dmg;
                    if(player.class === 'Melee' || player.class === 'Guardian') d += (player.maxHp * 0.05) + (stats.armor * 10);
                    if(player.subClass === 'SunCrusher' && player.isMoving) d *= (1 + player.sunCharge/20);
                    damageEnemy(e, d);
                    if(player.class === 'Melee' && stats.lightning > 0 && Math.random() < 0.3) triggerLightning(e, stats.lightning);
                }
                if(stats.gravityAura || stats.blackHole) {
                    let pull = (stats.blackHole ? 3.0 : 1.0) * ts; 
                    e.x += (player.x - e.x) / dist * pull; e.y += (player.y - e.y) / dist * pull;
                }
            } 
        });
    } 
    // 2. 射撃
    else {
        let currentRate = stats.rate;
        if(stats.siegeMode && stats.isStationary) currentRate /= 2;
        if(stats.bulletStorm) currentRate = 3; 

        if(player.shootCd <= 0) {
            shoot();
            if(stats.chakram > 0 && Math.random() < 0.3) fireChakram();
            player.shootCd = currentRate;
        }
    }

    // 3. ミサイル自動発射
    if(stats.missile > 0) {
        if(typeof player.missileCd === 'undefined') player.missileCd = 0;
        player.missileCd -= ts;
        if(player.missileCd <= 0) {
            fireMissile();
            player.missileCd = Math.max(10, 60 - stats.missile * 5);
        }
    }

    // 4. ドローン
    if(drones.length < stats.drones) drones.push({ x: player.x, y: player.y, angle: Math.random()*Math.PI*2, state: 'orbit', target: null, timer: 0 });
    let droneSpeedMult = stats.drones > 2 ? 1.5 : 1.0; 
    drones.forEach(d => {
        if(d.state === 'orbit') {
            d.angle += 0.05 * ts * droneSpeedMult;
            let ox = player.x + Math.cos(d.angle) * 80, oy = player.y + Math.sin(d.angle) * 80;
            d.x += (ox - d.x) * 0.1 * ts; d.y += (oy - d.y) * 0.1 * ts;
            let minD = 350;
            enemies.forEach(e => { if(e.dead) return; let dist = Math.hypot(e.x - player.x, e.y - player.y); if(dist < minD) { minD = dist; d.target = e; d.state = 'attack'; } });
        } else if(d.state === 'attack') {
            if(!d.target || d.target.dead) { d.state = 'return'; return; }
            let ang = Math.atan2(d.target.y - d.y, d.target.x - d.x);
            d.x += Math.cos(ang) * 12 * ts * droneSpeedMult; d.y += Math.sin(ang) * 12 * ts * droneSpeedMult;
            if(Math.hypot(d.x - d.target.x, d.y - d.target.y) < 20) {
                damageEnemy(d.target, stats.dmg * 2);
                if(stats.lightning > 0) triggerLightning(d.target, stats.lightning);
                if(particles.length < MAX_PARTICLES) createParticles(d.x, d.y, '#ff0', 5, 2);
                d.state = 'return'; d.timer = 30 / droneSpeedMult; 
            }
        } else if(d.state === 'return') {
            d.timer -= ts;
            if(d.timer <= 0) {
                let ox = player.x + Math.cos(d.angle) * 80, oy = player.y + Math.sin(d.angle) * 80;
                let ang = Math.atan2(oy - d.y, ox - d.x);
                d.x += Math.cos(ang) * 15 * ts; d.y += Math.sin(ang) * 15 * ts;
                if(Math.hypot(ox - d.x, oy - d.y) < 20) d.state = 'orbit';
            }
        }
    });

    // 5. 近接回転刃 / 飛剣
    if(player.class === 'Melee' && (stats.multi > 0 || stats.bladeStorm)) {
        // 数値が小数にならないように整数化
        let count = Math.floor(stats.multi + (stats.bladeStorm ? 4 : 0));
        
        if(player.subClass === 'FlyingSwords') {
             // ★修正1: 進化前の回転刃が残らないようにここで明示的に消す
             if(spikeBits.length > 0) spikeBits = [];

             // 配列の初期化（数が変わった時だけ再生成）
             if(flyingSwords.length !== count) { 
                 flyingSwords = []; 
                 for(let i=0; i<count; i++) flyingSwords.push({x:player.x, y:player.y, target:null, cooldown:0}); 
             }
             
             flyingSwords.forEach(sw => {
                 if(sw.cooldown > 0) sw.cooldown -= ts;
                 
                 // ターゲット探索（範囲内に敵がいなければプレイヤーの近くに戻る）
                 if(!sw.target || sw.target.dead || Math.hypot(sw.target.x-player.x, sw.target.y-player.y) > 500) {
                     sw.target = null; 
                     let minD = 450;
                     enemies.forEach(e => { 
                         if(e.dead) return; 
                         let d = Math.hypot(e.x-player.x, e.y-player.y); 
                         if(d < minD) { minD=d; sw.target=e; } 
                     });
                 }
                 
                 let tx, ty;
                 if(sw.target) { 
                     tx = sw.target.x; ty = sw.target.y; 
                 } else { 
                     // 待機中はプレイヤーの周りをフワフワする
                     let angle = Date.now() * 0.002 + (flyingSwords.indexOf(sw) * (Math.PI*2/count)); 
                     tx = player.x + Math.cos(angle) * 80; 
                     ty = player.y + Math.sin(angle) * 80; 
                 }
                 
                 // 移動処理（追従速度を少し上げました 0.15 -> 0.2）
                 sw.x += (tx - sw.x) * 0.2 * ts; 
                 sw.y += (ty - sw.y) * 0.2 * ts;
                 
                 // ★修正2: 当たり判定に敵のサイズ(e.size)を含めることで攻撃が当たるようにする
                 enemies.forEach(e => {
                     let hitRange = 15 + e.size; // 飛剣の半径15 + 敵の半径
                     if(!e.dead && Math.hypot(e.x-sw.x, e.y-sw.y) < hitRange && sw.cooldown <= 0) {
                         damageEnemy(e, stats.dmg * 0.8); 
                         createParticles(e.x, e.y, '#f0a', 1, 1); 
                         sw.cooldown = 15; // ヒット間隔
                     }
                 });
             });
        } else {
            // --- ここは変更なし（通常の回転刃ロジック） ---
            // 飛剣モードじゃない時は、逆に飛剣データを消しておくと安心
            if(flyingSwords.length > 0) flyingSwords = [];

            if(spikeBits.length !== count) { spikeBits = []; for(let i=0; i<count; i++) spikeBits.push({angle:0}); }
            let rotSpd = 0.1 * ts;
            spikeBits.forEach((bit, i) => {
                bit.angle += rotSpd;
                let currentAngle = bit.angle + (Math.PI*2/count)*i;
                let radius = 25 + player.size/2 + (stats.titan ? 20 : 0);
                if(stats.isColossus) radius += 20;
                bit.x = player.x + Math.cos(currentAngle) * radius; bit.y = player.y + Math.sin(currentAngle) * radius;
                enemies.forEach(e => {
                    // ここもついでに敵サイズを考慮しておくと親切です
                    if(!e.dead && Math.hypot(e.x-bit.x, e.y-bit.y) < 15 + e.size && Math.random() < 0.1 * ts) damageEnemy(e, stats.dmg * 0.5);
                });
            });
        }
    }
    
    // 6. 回転オーブ
    if(stats.spinBlade > 0) {
        let orbitalSpeed = (Date.now() / 1000) * 2;
        if(orbitals.length !== stats.spinBlade) { orbitals = []; for(let i=0; i<stats.spinBlade; i++) orbitals.push({}); }
        orbitals.forEach((orb, i) => {
            let angle = orbitalSpeed + (Math.PI * 2 / stats.spinBlade) * i;
            orb.x = player.x + Math.cos(angle) * 110; orb.y = player.y + Math.sin(angle) * 110;
            enemies.forEach(e => { if(!e.dead && Math.hypot(e.x-orb.x, e.y-orb.y) < 20 + e.size && Math.random() < 0.12 * ts) damageEnemy(e, stats.dmg * 1.5); });
        });
    }
}

function updateProjectiles(ts) {
    // 1. プレイヤーの弾
    for(let i=bullets.length-1; i>=0; i--) {
        let b = bullets[i];
        
        // --- 特殊弾処理 ---
        if(b.type === 'slash') {
            b.x += b.vx * ts; b.y += b.vy * ts; b.life -= ts;
            if(b.life > 12) {
                enemies.forEach(e => {
                    if(e.dead || b.hit.has(e.id)) return;
                    let range = b.size + e.size;
                    if((b.x - e.x)**2 + (b.y - e.y)**2 < range * range) {
                        damageEnemy(e, stats.dmg * 2.0);
                        if(Math.random() < 0.3) createParticles(e.x, e.y, '#fff', 3, 2); 
                        if(stats.lightning > 0 && Math.random() < 0.05) triggerLightning(e, stats.lightning);
                        b.hit.add(e.id);
                    }
                });
            }
            if(b.life <= 0) bullets.splice(i, 1);
            continue;
        }
        else if(b.type === 'omega') {
            b.x += b.vx * ts; b.y += b.vy * ts; b.life -= ts; b.tick = (b.tick || 0) + ts;
            if(b.tick >= 5) {
                b.tick = 0;
                enemies.forEach(e => { if(!e.dead && Math.abs(e.x - b.x) < b.size && Math.abs(e.y - b.y) < b.size) { damageEnemy(e, stats.dmg * 5); if(Math.random() < 0.3) createParticles(e.x, e.y, '#f0f', 1, 1); } });
            }
            if(b.life <= 0) bullets.splice(i,1);
            continue;
        }
        else if(b.type === 'void') {
            b.life -= ts;
            if(b.life <= 0) {
                Sound.play('explode', 0.8); screenShake = 5;
                enemies.forEach(e => { if(!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < b.size + e.size) { damageEnemy(e, b.dmg); if(b.extra) b.extra(e); } });
                createParticles(b.x, b.y, b.color, 10, 4); particles.push({type:'shockwave', x:b.x, y:b.y, size:b.size*1.5, life:20, color:b.color});
                bullets.splice(i, 1);
            }
            continue; 
        }
        else if(b.type === 'chakram') {
            b.x += b.vx * ts; b.y += b.vy * ts; b.life -= ts; 
            if(b.life <= 0) { bullets.splice(i, 1); continue; }
            let camHalfW = canvas.width / 2, camHalfH = canvas.height / 2;
            let left = player.x - camHalfW, right = player.x + camHalfW, top = player.y - camHalfH, bottom = player.y + camHalfH;

            if(b.x < left) { b.x = left; b.vx *= -1; Sound.play('bounce'); } 
            else if(b.x > right) { b.x = right; b.vx *= -1; Sound.play('bounce'); }
            if(b.y < top) { b.y = top; b.vy *= -1; Sound.play('bounce'); } 
            else if(b.y > bottom) { b.y = bottom; b.vy *= -1; Sound.play('bounce'); }

            for(let j=enemies.length-1; j>=0; j--) {
                let e = enemies[j];
                if(e.dead || b.hit.includes(e.id)) continue;
                if(Math.hypot(b.x-e.x, b.y-e.y) < b.size + e.size) {
                    damageEnemy(e, stats.dmg * 1.5); if(particles.length < MAX_PARTICLES) createParticles(b.x, b.y, '#0ff', 2, 2);
                    if(b.bounceCd <= 0) {
                        let ang = Math.atan2(b.y - e.y, b.x - e.x), spd = Math.hypot(b.vx, b.vy);
                        b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd; b.bounceCd = 10; Sound.play('bounce');
                    }
                }
            }
            if(b.bounceCd > 0) b.bounceCd -= ts;
            continue;
        }

        // --- 通常弾・誘導弾の移動 ---
        if(b.type !== 'missile' && stats.homing > 0) {
            let detectRange = 250 + (stats.homing * 50), target = null, minDSq = detectRange * detectRange;
            enemies.forEach(e => { if(e.dead) return; let dSq = (e.x-b.x)**2 + (e.y-b.y)**2; if(dSq < minDSq && !b.hit.includes(e.id)) { minDSq = dSq; target = e; } });
            if(target) {
                let desired = Math.atan2(target.y - b.y, target.x - b.x), current = Math.atan2(b.vy, b.vx);
                let turn = (0.05 + stats.homing * 0.05) * ts, diff = desired - current;
                if(diff > Math.PI) diff -= Math.PI*2; if(diff < -Math.PI) diff += Math.PI*2;
                if(Math.abs(diff) < Math.PI) { current += Math.sign(diff) * Math.min(Math.abs(diff), turn); let s = Math.hypot(b.vx, b.vy); b.vx = Math.cos(current) * s; b.vy = Math.sin(current) * s; }
            }
        }
        if(b.type === 'missile' || b.type === 'spirit') {
            let minD = 400, target = null;
            enemies.forEach(e => { if(e.dead) return; let d = Math.hypot(e.x-b.x, e.y-b.y); if(d < minD) { minD=d; target=e; } });
            if(target) {
                let ang = Math.atan2(target.y - b.y, target.x - b.x), cur = Math.atan2(b.vy, b.vx);
                let diff = ang - cur; if(diff > Math.PI) diff -= Math.PI*2; if(diff < -Math.PI) diff += Math.PI*2;
                cur += Math.sign(diff) * 0.1 * ts; b.vx = Math.cos(cur) * b.speed; b.vy = Math.sin(cur) * b.speed;
            }
            b.x += b.vx * ts; b.y += b.vy * ts; 

            // ミサイルタイプでも life が設定されていれば時間を進めて消す処理
            if(b.life !== undefined) { 
                b.life -= ts; 
                if(b.life <= 0) { 
                    bullets.splice(i, 1); 
                    continue; 
                } 
            }
        } else {
            b.x += b.vx * ts; b.y += b.vy * ts;
            if(b.life !== undefined) { b.life -= ts; if(b.life <= 0) { bullets.splice(i, 1); continue; } }
            if(stats.ghostShot) {
                let w = canvas.width/2, h = canvas.height/2;
                if(b.x < player.x-w || b.x > player.x+w || b.y < player.y-h || b.y > player.y+h) {
                    if(b.x < player.x-w) b.x = player.x+w-5; else if(b.x > player.x+w) b.x = player.x-w+5;
                    if(b.y < player.y-h) b.y = player.y+h-5; else if(b.y > player.y+h) b.y = player.y-h+5;
                    b.size = Math.min(50, b.size * 1.5); b.damageMult = Math.min(8.0, (b.damageMult || 1) * 1.5);
                    b.life = (b.life || 180) - 60; if(b.life <= 0) { bullets.splice(i, 1); continue; }
                    b.pierce = 999;
                }
            } else if(Math.hypot(b.x - player.x, b.y - player.y) > 2000) { bullets.splice(i, 1); continue; }
        }

        if(stats.shotBounce && (b.type === 'normal' || b.type === 'chakram')) {
            let l = player.x - canvas.width/2, r = player.x + canvas.width/2, t = player.y - canvas.height/2, bt = player.y + canvas.height/2;
            if(b.x < l || b.x > r) { b.vx *= -1; Sound.play('bounce'); }
            if(b.y < t || b.y > bt) { b.vy *= -1; Sound.play('bounce'); }
        }

        // --- 弾丸の衝突判定 ---
        let hit = false;
        for(let j=enemies.length-1; j>=0; j--) {
            let e = enemies[j];
            if(e.dead || b.hit.includes(e.id)) continue;
            let hitSize = (player.class === 'Sniper' && b.type === 'normal') ? b.size + 15 : b.size;
            if(stats.titan) hitSize *= 1.5;
            let r = hitSize + e.size;
            if(Math.abs(b.x - e.x) > r || Math.abs(b.y - e.y) > r) continue;
            if((b.x - e.x)**2 + (b.y - e.y)**2 < r*r) {
                if(b.type === 'missile') {
                    Sound.play('explode'); particles.push({type:'shockwave', x:b.x, y:b.y, size:10, life:15, color:'#f80'});
                    let blastR = 100 * stats.missileBlast, blastDmg = stats.dmg * 3 * stats.missileBlast;
                    enemies.forEach(subE => { if(!subE.dead && Math.hypot(subE.x - b.x, subE.y - b.y) < blastR) { damageEnemy(subE, blastDmg); if(stats.napalm && Math.random()<0.5) gasClouds.push({x:subE.x, y:subE.y, r:30, life:120, dmg:stats.dmg*0.2}); } });
                    if(particles.length < MAX_PARTICLES) createParticles(b.x, b.y, '#f00', 10 * stats.missileBlast, 5 * stats.missileBlast);
                    bullets.splice(i, 1); hit = true; break;
                } else {
                    let finalDmg = stats.dmg * (b.damageMult || 1);
                    damageEnemy(e, finalDmg);
                    // Hit Effects
                    if(stats.coldFlask && Math.random() < 0.1) { e.frozen = 60; createParticles(e.x, e.y, '#0ff', 5, 2); }
                    if(stats.knockback > 0 && !b.isMini && e.knockbackTimer <= 0 && e.ai !== 'iron' && e.type !== 'boss') {
                        let ang = Math.atan2(e.y - player.y, e.x - player.x);
                        let force = stats.knockback * 20; // ボスは除外されたので単純化
                        e.x += Math.cos(ang) * force; e.y += Math.sin(ang) * force; 
                        e.knockbackTimer = 60; // クールダウンを増加 (10 -> 30)
                    }
                    if(stats.clusterStriker && !b.isMini) {
                        Sound.play('explode', 2.0);
                        for(let k=0; k<6; k++) { 
                            let ang = (Math.PI*2/6)*k; 
                            // ↓ life: 60 を追加（約1秒で自然消滅するようにする）
                            bullets.push({
                                type:'missile', 
                                x:e.x, y:e.y, 
                                vx:Math.cos(ang)*5, vy:Math.sin(ang)*5, 
                                size:4, 
                                speed:0, 
                                hit:[e.id], 
                                isMini:true, 
                                life: 300 // ★ここを追加！ (60フレーム = 約1秒)
                            }); 
                        }
                    }
                    if(stats.prismSplit && !b.isMini && (b.splitCount || 0) < 2) {
                        for(let k=0; k<2; k++) { let ang = Math.atan2(b.vy, b.vx) + (k===0 ? 0.5 : -0.5); bullets.push({type:'normal', x:e.x, y:e.y, vx:Math.cos(ang)*stats.bulletSpeed, vy:Math.sin(ang)*stats.bulletSpeed, size:b.size*0.8, hit:[e.id], pierce:0, isMini:false, color:'#f0f', splitCount: (b.splitCount||0)+1}); }
                    }
                    if(stats.absoluteZero && Math.random()<0.3) e.frozen = 60; 
                    if(stats.shotExplode) { Sound.play('explode', 2.0); enemies.forEach(subE => { if(!subE.dead && Math.hypot(subE.x-e.x, subE.y-e.y) < 50) damageEnemy(subE, stats.dmg*0.5); }); createParticles(e.x, e.y, '#fa0', 3, 2); }
                    if(stats.napalm && Math.random()<0.2) gasClouds.push({x:e.x, y:e.y, r:20, life:100, dmg:stats.dmg*0.2});
                    if(stats.splitShot && !b.isMini) { for(let k=0; k<2; k++) { let ang = (Math.random()*Math.PI*2); bullets.push({type:'normal', x:e.x, y:e.y, vx:Math.cos(ang)*10, vy:Math.sin(ang)*10, size:3, hit:[e.id], pierce:0, isMini:true}); } }
                    if(stats.lightning > 0 && Math.random() < 0.5) triggerLightning(e, stats.lightning);
                    b.hit.push(e.id);
                    if(particles.length < MAX_PARTICLES) createParticles(b.x, b.y, '#ffffaa', 3, 2); 
                    if(b.pierce <= 0 && !stats.infinitePierce) { bullets.splice(i, 1); hit = true; break; } else { b.pierce--; }
                }
            }
        }
        if(hit) continue;
    }

    // 2. 敵の弾
    for(let i=enemyBullets.length-1; i>=0; i--) {
        let b = enemyBullets[i];
        b.x += b.vx * ts; b.y += b.vy * ts;
        if(Math.hypot(b.x - player.x, b.y - player.y) > 2000) { enemyBullets.splice(i, 1); continue; }
        if(Math.hypot(player.x-b.x, player.y-b.y) < player.size + b.size) { 
            takeDamage(10 + Math.floor(level * 0.5)); enemyBullets.splice(i, 1); 
        }
    }
}

function updateEnemies(ts, gameTimeSec) {
    // スポーン
    if(enemies.length < MAX_ENEMIES) {
        let spawnDenom = Math.max(5, 25 - (level * 0.6)); 
        let hordeMult = (level >= 5 ? 2.0 + Math.min(1.0, (level - 5) / 25) : 1.0) * (singularityMode ? 3.0 : 1.0);
        
        // 【改善】ダイナミックスポーンレート
        // 敵が少ない（＝瞬殺している）時ほど、次が湧きやすくなる
        let currentCountRatio = enemies.length / MAX_ENEMIES; // 0.0(いない) ~ 1.0(満員)
        if(currentCountRatio < 0.2) hordeMult *= 3.0; // 敵が少なければ3倍湧く
        else if(currentCountRatio < 0.5) hordeMult *= 1.5;

        let spawnProb = (hordeMult / spawnDenom) * ts;
        
        // HP満タン時のスポーン倍率も少しマイルドにしつつ維持
        if(level >= 5 && player.hp >= player.maxHp * 0.9) spawnProb *= 2.0;

        if(Math.random() < spawnProb) spawnEnemy('random', gameTimeSec);
    }

    // ボス警告
    let cycleTime = gameTimeSec % 300; 
    let cycleWave = Math.floor(gameTimeSec / 300);
    if(cycleTime > 295 && !bossWarningActive && cycleWave === bossCycleCounter) { bossWarningActive = true; triggerWarning(); }
    if(cycleWave > bossCycleCounter) { bossCycleCounter = cycleWave; bossWarningActive = false; document.getElementById('warning-overlay').style.display = 'none'; spawnEnemy('boss', gameTimeSec); }

    // AI更新
    enemies.forEach(e => {
        if(e.dead) return;
        if(e.ai === 'iron' || e.type === 'boss') {
            e.frozen = 0;          // 凍結(停止)しない
            e.knockbackTimer = 0;  // ノックバック状態にならない
        }
        if(e.knockbackTimer > 0) e.knockbackTimer -= ts;
        if(e.frozen > 0) { e.frozen -= ts; if(Math.random()<0.1 && particles.length < MAX_PARTICLES) createParticles(e.x, e.y, '#88ffff', 1, 1); }
        else {
            let dist = Math.hypot(player.x - e.x, player.y - e.y);
            let angle = Math.atan2(player.y - e.y, player.x - e.x);
            if (e.flash > 0) e.flash -= ts;
            
            if(e.ai === 'dasher') {
                if(!e.state) e.state = 'chase';
                if(e.state === 'chase') { e.x += Math.cos(angle)*e.speed*ts; e.y += Math.sin(angle)*e.speed*ts; if(dist < 250) { e.state = 'aim'; e.timer = 30; } }
                else if(e.state === 'aim') { e.timer -= ts; if(e.timer <= 0) { e.state = 'dash'; e.timer = 30; e.vx = Math.cos(angle) * 14; e.vy = Math.sin(angle) * 14; } }
                else if(e.state === 'dash') { e.x += e.vx * ts; e.y += e.vy * ts; e.timer -= ts; if(e.timer <= 0) { e.state = 'cooldown'; e.timer = 50; } }
                else if(e.state === 'cooldown') { e.timer -= ts; e.x += Math.cos(angle)*(e.speed*0.2)*ts; e.y += Math.sin(angle)*(e.speed*0.2)*ts; if(e.timer <= 0) e.state = 'chase'; }

            } else if(e.ai === 'shooter') {
                if(dist > 250) { e.x += Math.cos(angle)*e.speed*ts; e.y += Math.sin(angle)*e.speed*ts; }
                else if(dist < 150) { e.x -= Math.cos(angle)*e.speed*0.5*ts; e.y -= Math.sin(angle)*e.speed*0.5*ts; }
                if(Math.random() < (1/120)*ts && dist < 600) { enemyBullets.push({x: e.x, y: e.y, vx: Math.cos(angle)*6, vy: Math.sin(angle)*6, size: 6, color: '#f0a'}); }

            } else if(e.ai === 'bat') {
                let zig = Math.sin(gameTimeSec * 5) * 0.8; e.x += Math.cos(angle + zig) * e.speed * ts; e.y += Math.sin(angle + zig) * e.speed * ts;

            } else if(e.type === 'boss') {
                // 初期化: 状態がない場合は 'chase' に設定
                if(!e.state) { e.state = 'chase'; e.timer = 180; e.attackCount = 0; }
                e.timer -= ts;

                if(e.state === 'chase') {
                    // 通常移動（プレイヤーを追尾）
                    e.x += Math.cos(angle) * e.speed * ts;
                    e.y += Math.sin(angle) * e.speed * ts;
                    
                    // 時間経過で攻撃パターンへ移行
                    if(e.timer <= 0) {
                        e.attackCount++;
                        // ランダムで「突進」か「弾幕」を選択
                        // HPが減ると弾幕頻度アップ
                        let actRand = Math.random();
                        if(actRand < 0.5) {
                            e.state = 'charge_warn'; e.timer = 60; // 突進予兆
                            Sound.play('alert'); 
                        } else {
                            e.state = 'barrage'; e.timer = 120; e.subTimer = 0; // 弾幕開始
                        }
                    }
                } 
                else if(e.state === 'charge_warn') {
                    // 突進予兆: その場で震える
                    e.x += (Math.random()-0.5) * 5; e.y += (Math.random()-0.5) * 5;
                    e.flash = 2; // 点滅させる
                    
                    if(e.timer <= 0) {
                        e.state = 'charge_go'; e.timer = 40; 
                        // 突進方向を確定
                        e.vx = Math.cos(angle) * (e.speed * 4.0); // 通常の4倍速
                        e.vy = Math.sin(angle) * (e.speed * 4.0);
                        Sound.play('dash');
                    }
                }
                else if(e.state === 'charge_go') {
                    // 突進実行
                    e.x += e.vx * ts; e.y += e.vy * ts;
                    // 通り過ぎた場所にパーティクルを残す
                    if(Math.random() < 0.5) createParticles(e.x, e.y, e.color, 1, 3);
                    
                    if(e.timer <= 0) { e.state = 'cooldown'; e.timer = 60; }
                }
                else if(e.state === 'barrage') {
                    // 回転弾幕攻撃
                    e.subTimer -= ts;
                    if(e.subTimer <= 0) {
                        e.subTimer = 5; // 発射間隔
                        let shotAngle = (e.timer * 0.2) + Math.sin(e.timer * 0.1); // スパイラル計算
                        
                        // 3方向発射
                        for(let k=0; k<3; k++) {
                            let a = shotAngle + (Math.PI*2/3)*k;
                            enemyBullets.push({
                                x: e.x, y: e.y, 
                                vx: Math.cos(a)*5, vy: Math.sin(a)*5, 
                                size: 8, color: '#f0f'
                            });
                        }
                        Sound.play('shoot', 0.5);
                    }
                    if(e.timer <= 0) { e.state = 'cooldown'; e.timer = 60; }
                }
                else if(e.state === 'cooldown') {
                    // 攻撃後の硬直（少しゆっくり移動）
                    e.x += Math.cos(angle) * (e.speed * 0.3) * ts;
                    e.y += Math.sin(angle) * (e.speed * 0.3) * ts;
                    
                    if(e.timer <= 0) { e.state = 'chase'; e.timer = 120 + Math.random()*60; }
                }
            } else {
                e.x += Math.cos(angle) * e.speed * ts; e.y += Math.sin(angle) * e.speed * ts;
            }

            // プレイヤーとの衝突
            if(dist < player.size + e.size) {
                if(stats.spikeArmor && Math.random() < 0.2 * ts) { damageEnemy(e, stats.dmg * 0.5); if(particles.length < MAX_PARTICLES) createParticles((player.x+e.x)/2, (player.y+e.y)/2, '#fff', 1, 2); }
                if(stats.spikeReflect) { damageEnemy(e, (e.dmg * 2.0) + (stats.armor * 50)); Sound.play('hit'); if(particles.length < MAX_PARTICLES) createParticles(e.x, e.y, '#0f0', 3, 2); }
                if(stats.isEarthShaker) { damageEnemy(e, stats.dmg * 2); Sound.play('bash'); let kick = Math.atan2(e.y - player.y, e.x - player.x); e.x += Math.cos(kick) * 30; e.y += Math.sin(kick) * 30; }
                if(player.class === 'Melee' && player.slamCd <= 0) {
                    player.slamCd = Math.max(10, 60 - stats.rate); let bonus = player.maxHp * 0.2; damageEnemy(e, (stats.dmg * 2) + bonus);
                    let wave = 15 + (stats.pierce * 5); Sound.play('bash'); if(particles.length < MAX_PARTICLES) createParticles(e.x, e.y, '#fff', 5, 2); particles.push({type:'shockwave', x:player.x, y:player.y, size:wave, life:10, color:'#f00'});
                    enemies.forEach(subE => { if(!subE.dead && Math.hypot(subE.x - player.x, subE.y - player.y) < wave * 3) damageEnemy(subE, (stats.dmg * 0.5) + (bonus * 0.5)); });
                } else {
                    takeDamage(e.dmg);
                }
            }
        }
    });
    enemies = enemies.filter(e => !e.dead);
}

function updateObjects(ts) {
    // 毒ガス
    for(let i=gasClouds.length-1; i>=0; i--) {
        let g = gasClouds[i]; g.life -= ts; g.tick = (g.tick || 0) - ts;
        if(g.tick <= 0) {
            g.tick = 15; enemies.forEach(e => { if(!e.dead && Math.hypot(e.x - g.x, e.y - g.y) < g.r + e.size) { damageEnemy(e, g.dmg); if(Math.random() < 0.3) createParticles(e.x, e.y, '#aa00ff', 1, 2); } });
        }
        if(g.life <= 0) gasClouds.splice(i, 1);
    }
    // 経験値
    if(expOrbs.length > MAX_ORBS) { let removed = expOrbs.splice(0, expOrbs.length - MAX_ORBS); removed.forEach(o => { if(gameActive) addExp(Math.floor(o.val * 0.7), true); }); }
    for(let i=expOrbs.length-1; i>=0; i--) {
        if(!gameActive) break; let o = expOrbs[i], d = Math.hypot(player.x - o.x, player.y - o.y);
        if(o.forceCollect || d < stats.magnet) { let ang = Math.atan2(player.y - o.y, player.x - o.x), spd = (stats.spd * 1.5) + (d * 0.05) + 10; o.x += Math.cos(ang)*spd*ts; o.y += Math.sin(ang)*spd*ts; }
        if(Math.hypot(player.x - o.x, player.y - o.y) < 20) { addExp(o.val); Sound.play('exp', o.pitch); expOrbs.splice(i, 1); }
    }
    // アイテム
    for(let i=items.length-1; i>=0; i--) {
        let it = items[i], d = Math.hypot(player.x - it.x, player.y - it.y);
        if(d < 200) { it.x += (player.x - it.x) * 0.1 * ts; it.y += (player.y - it.y) * 0.1 * ts; }
        if(d < 30) { if(it.type === 'magnet') { Sound.play('powerup'); particles.push({type:'shockwave', x:player.x, y:player.y, size:500, life:30, color:'#fff'}); expOrbs.forEach(o => o.forceCollect = true); } else if(it.type === 'bomb') { triggerBomb(); } items.splice(i, 1); }
    }
    // エフェクト
    if(particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    for(let i=particles.length-1; i>=0; i--) {
        let p = particles[i];
        if(p.type === 'lightning') p.life -= ts; else if(p.type === 'shockwave') { p.size += 3 * ts; p.life -= ts; } else { p.x += p.vx * ts; p.y += p.vy * ts; p.life -= ts; p.size *= 0.9; }
        if(p.life <= 0) particles.splice(i, 1);
    }
    // テキスト
    if(texts.length > MAX_TEXTS) texts.splice(0, texts.length - MAX_TEXTS);
    for(let i=texts.length-1; i>=0; i--) { texts[i].y -= 1 * ts; texts[i].life -= ts; if(texts[i].life<=0) texts.splice(i, 1); }
}

function triggerBomb() {
    Sound.play('bomb');
    let overlay = document.getElementById('bomb-overlay');
    overlay.style.display = 'block';
    overlay.style.opacity = '0.8';
    setTimeout(() => { overlay.style.opacity = '0'; setTimeout(()=>overlay.style.display='none', 500); }, 100);

    enemies.forEach(e => {
        if(!e.dead && e.type !== 'boss') {
            damageEnemy(e, e.hp + 9999);
            createParticles(e.x, e.y, '#fff', 5, 5);
        }
    });
    screenShake = 30;
}

function shoot() {
    if(stats.samuraiMode) {
        let target = null, minD = Infinity;
        enemies.forEach(e => { if(e.dead) return; let d = Math.hypot(e.x-player.x, e.y-player.y); if(d<minD){minD=d; target=e;} });
        
        let angle = target ? Math.atan2(target.y-player.y, target.x-player.x) : (player.isMoving ? Math.atan2(joyMoveY||0, joyMoveX||1) : -Math.PI/2);
        if(!target && !player.isMoving && joyTouchId === null) angle = -Math.PI/2; 

        let slashSpeed = stats.bulletSpeed * 0.9; 
        
        Sound.play('missile', 2.0); 
        bullets.push({
            type: 'slash', x: player.x, y: player.y, 
            vx: Math.cos(angle) * slashSpeed, vy: Math.sin(angle) * slashSpeed, 
            angle: angle,
            size: 220 * stats.areaScale,
            life: 15,  
            color: '#fff', hit: new Set(), pierce: 999, 
            damageMult: 1.0
        });
        
        if(stats.swordWave || stats.multi > 1) {
             let waveCount = stats.multi;
             let waveDmgMult = 1.0;
             let waveSize = 5 * stats.areaScale; 
             if(waveCount > 6) {
                 let extra = waveCount - 6;
                 waveDmgMult += extra * 0.3; 
                 waveSize += Math.min(15, extra * 0.5); 
                 waveCount = 6; 
             }
             for(let i=0; i<waveCount; i++) {
                 let waveAng = angle + (Math.random()-0.5)*0.5;
                 bullets.push({
                    type:'normal', 
                    x:player.x, y:player.y, 
                    vx:Math.cos(waveAng)*stats.bulletSpeed*1.2, 
                    vy:Math.sin(waveAng)*stats.bulletSpeed*1.2, 
                    size:waveSize, 
                    color:'#adf', 
                    pierce:5, 
                    life:40,
                    hit: [],  
                    damageMult: waveDmgMult
                });
             }
        }
        return; 
    }

    let target = null;
    let minD = Infinity;
    
    enemies.forEach(e => {
        if (e.dead) return;
        let d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < minD) { minD = d; target = e; }
    });

    let angle;
    if (target) { angle = Math.atan2(target.y - player.y, target.x - player.x); } 
    else { angle = Math.random() * Math.PI * 2; }

    let count = stats.multi;
    if(player.class === 'Sniper') count = 1; 
    if(stats.infiniteMag) count += 3; 
    
    let currentDmg = stats.dmg;
    if(stats.siegeMode && stats.isStationary) currentDmg *= 2;
    if(stats.doubleShot && Math.random() < 0.5) count *= 2; 

    let bDmgMultBase = 1.0;
    let bSizeBase = stats.railgun ? 10 : 5;
    
    if(count > 20) {
        let extra = count - 20;
        bDmgMultBase += extra * 0.1; 
        count = 20; 
    }

    let spread = 0.1;
    if(stats.bulletStorm) {
        spread = 0.5 + Math.sin(Date.now()*0.01)*0.5; 
        count += 3; 
    }
    let startAngle = angle - (spread * (count-1)) / 2;

    for(let i=0; i<count; i++) {
        let currentAngle = startAngle + spread * i;
        let vx = Math.cos(currentAngle) * stats.bulletSpeed;
        let vy = Math.sin(currentAngle) * stats.bulletSpeed;
        
        let bType = 'normal';
        let bColor = stats.ghostShot ? '#88ff88' : (stats.prismSplit ? '#f0f' : '#fff');
        let bDmgMult = bDmgMultBase;
        
        let bSize = bSizeBase * stats.areaScale; 

        if(stats.tempestMode) {
             bColor = '#d0f'; 
             bSize = 6 * stats.areaScale;
        }

        if(stats.tricksterMode) {
            let cols = ['#f00', '#0f0', '#00f', '#ff0', '#f0f', '#0ff'];
            bColor = cols[Math.floor(Math.random()*cols.length)];
            if(stats.chaosShot) bSize = (3 + Math.random() * 10) * stats.areaScale;
            let roll = Math.random();
            if(roll < 0.25) stats.pierce = 99; 
            else if(roll < 0.5) stats.homing = 1; 
            else stats.homing = 0;

            if(stats.russianRoulette) {
                if(Math.random() < 0.16) { bDmgMult *= 10; bSize *= 2; bColor='#fff'; } 
                else if(Math.random() < 0.1) { bDmgMult *= 0.5; bSize = 2; bColor='#444'; } 
            }
        }

        bullets.push({
            type: bType, x: player.x, y: player.y,
            vx: vx, vy: vy,
            size: bSize, color: bColor,
            hit: [], pierce: stats.pierce,
            damageMult: bDmgMult, isMini: false
        });
    }

    if(stats.doppelganger && player.clone) {
        bullets.push({
            type: 'normal', x: player.clone.x, y: player.clone.y,
            vx: -Math.cos(startAngle)*stats.bulletSpeed, vy: -Math.sin(startAngle)*stats.bulletSpeed,
            size: 5 * stats.areaScale,
            color: '#fff', hit: [], pierce: stats.pierce, damageMult: 1, isMini: false
        });
    }

    if(stats.missileChance > 0 && Math.random() < stats.missileChance) fireMissile();
    Sound.play('shoot', 1.0 + Math.random()*0.2);
}

function dash() {
    if(player.dashCd > 0) return;
    player.dashCd = player.maxDashCd;
    player.invincible = 30; 
    
    let dx = 0, dy = 0;
    if(keys['w'] || keys['ArrowUp']) dy = -1;
    if(keys['s'] || keys['ArrowDown']) dy = 1;
    if(keys['a'] || keys['ArrowLeft']) dx = -1;
    if(keys['d'] || keys['ArrowRight']) dx = 1;
    
    if(joyTouchId !== null) { dx = joyMoveX; dy = joyMoveY; }
    if(dx === 0 && dy === 0) dx = 1; 

    let len = Math.hypot(dx, dy);
    if(len > 0) { dx /= len; dy /= len; }

    player.x += dx * 100;
    player.y += dy * 100;
    
    if(stats.clusterMine) {
     for(let i=0; i<3; i++) {
         let mx = player.x - dx * (20 + i*10);
         let my = player.y - dy * (20 + i*10);
         // ↓ ここにも life を追加 (例: 600フレーム = 10秒で消える)
         bullets.push({
             type:'missile', 
             x:mx, y:my, 
             vx:0, vy:0, 
             speed:0, 
             size:5, 
             hit:[], 
             isMini:false,
             life: 600 // ★ここを追加！
         });
     }
}
    createParticles(player.x, player.y, '#fff', 10, 2);
    Sound.play('dash'); 
}

function spawnSentry() {
    if(sentries.length >= stats.sentryMax) sentries.shift(); 
    sentries.push({x: player.x, y: player.y, cooldown: 0});
    createParticles(player.x, player.y, '#0f0', 10, 3);
    Sound.play('spark');
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
    let A = px - x1; let B = py - y1;
    let C = x2 - x1; let D = y2 - y1;
    let dot = A * C + B * D;
    let len_sq = C * C + D * D;
    let param = -1;
    if (len_sq !== 0) param = dot / len_sq;
    let xx, yy;
    if (param < 0) { xx = x1; yy = y1; }
    else if (param > 1) { xx = x2; yy = y2; }
    else { xx = x1 + param * C; yy = y1 + param * D; }
    let dx = px - xx; let dy = py - yy;
    return Math.hypot(dx, dy);
}

function fireMissile() {
    Sound.play('missile');
    bullets.push({ type: 'missile', x: player.x, y: player.y, vx: (Math.random()-0.5)*4, vy: -5, speed: 10, size: 8, hit: [], isMini: false });
}

function fireOmegaLaser() {
    Sound.play('laser');
    screenShake = 10;
    bullets.push({ type: 'omega', x: player.x, y: player.y, vx: 50, vy: 0, size: 300, life: 30, hit: [], tick: 0 });
    particles.push({type:'shockwave', x:player.x, y:player.y, size:100, life:20, color:'#f0f'});
}

function fireChakram() {
    let ang = Math.random() * Math.PI * 2;
    bullets.push({ 
        type: 'chakram', x: player.x, y: player.y, 
        vx: Math.cos(ang)*12, vy: Math.sin(ang)*12, 
        size: 10 + stats.chakram*2, life: 180 + stats.chakram*30, 
        hit: [], bounceCd: 0 
    });
}

function triggerLightning(target, lv) {
    let range = 200 + (lv * 30); let count = 0; let maxTargets = lv; 
    enemies.forEach(e => {
        if(!e.dead && e !== target && count < maxTargets) {
            if(Math.hypot(e.x - target.x, e.y - target.y) < range) {
                damageEnemy(e, stats.dmg * 0.5);
                createLightningEffect(target.x, target.y, e.x, e.y);
                Sound.play('lightning'); count++;
            }
        }
    });
}
function createLightningEffect(x1, y1, x2, y2) { 
    if(particles.length > MAX_PARTICLES) return;
    particles.push({ type: 'lightning', x1: x1, y1: y1, x2: x2, y2: y2, life: 10, color: '#88ffff' }); 
}

function takeDamage(dmg) {
    if(Math.random() < stats.dodge) {
        if(texts.length < MAX_TEXTS) texts.push({x:player.x, y:player.y-20, str:"MISS", life:30, color:'#88ff88'});
        return; 
    }
    
    if(stats.forceField && stats.forceFieldCd <= 0) {
        stats.forceFieldCd = 300; 
        Sound.play('bounce');
        particles.push({type:'shockwave', x:player.x, y:player.y, size:50, life:20, color:'#0ff'});
        return; 
    }
    
    if(player.invincible > 0) return;
    
    dmg = Math.max(1, dmg - stats.armor);

    player.hp -= dmg; 
    player.invincible = 20; 

    // ★ 追加: ダメージを受けたので緊張度リセット
    noDamageTimer = 0;

    screenShake = 15;
    createParticles(player.x, player.y, '#f00', 10, 4); updateUI();
    
    if(stats.reactiveArmor) {
        Sound.play('spark');
        particles.push({type:'shockwave', x:player.x, y:player.y, size:150, life:10, color:'#0f0'});
        enemies.forEach(e => {
             if(!e.dead && Math.hypot(e.x - player.x, e.y - player.y) < 150) {
                 damageEnemy(e, stats.dmg);
                 let ang = Math.atan2(e.y - player.y, e.x - player.x);
                 e.x += Math.cos(ang) * 50; e.y += Math.sin(ang) * 50; 
             }
        });
    }

    if(player.hp <= 0) gameOver();
}

function spawnEnemy(mode, time) {
    // ボス戦や上限チェックはそのまま維持
    if(enemies.length >= MAX_ENEMIES && mode !== 'boss') return; 

    let dist = Math.max(canvas.width, canvas.height)/2 + 50;
    let ang = Math.random()*Math.PI*2;
    let ex = player.x + Math.cos(ang)*dist; 
    let ey = player.y + Math.sin(ang)*dist; 
    
    let type = mode;

    // 'random' の場合、現在のWAVEデータに基づいて敵を決める
    if(mode === 'random') {
        // ▼▼▼ 修正箇所ここから ▼▼▼
        // 現在のレベルに対応するWAVE定義を探す（timeではなくlevelを見るように変更）
        let wave = WAVE_DATA[0];
        for (let i = WAVE_DATA.length - 1; i >= 0; i--) {
            // ここでグローバル変数 'level' と WAVE_DATAの 'level' を比較
            if (level >= WAVE_DATA[i].level) {
                wave = WAVE_DATA[i];
                break;
            }
        }
        // ▲▲▲ 修正箇所ここまで ▲▲▲

        // 定義された敵リストからランダムに1つ選ぶ
        if (wave && wave.enemies.length > 0) {
            type = wave.enemies[Math.floor(Math.random() * wave.enemies.length)];
        } else {
            type = 'normal';
        }
        
        // レベル50以上なら低確率でGolemを混ぜる（既存ロジック維持）
        if (level >= 50 && Math.random() < 0.05) type = 'golem';

        if (level >= 60 && Math.random() < 0.05) type = 'iron_will';
    }

    createEnemy(type, ex, ey);
}

function createEnemy(type, x, y) {
    const data = ENEMY_DATA[type] || ENEMY_DATA['normal'];

    let e = { 
        id: Math.random(), 
        x: x, 
        y: y, 
        flash: 0, 
        type: (type === 'boss' || type === 'golem') ? type : 'mob',
        ai: data.ai,
        frozen: 0, 
        knockbackTimer: 0 
    };
    
    // 基本HP倍率
    let hpMult = Math.pow(1.07, level - 1); 

    // ★ 追加: 緊張感システム (Tension System)
    // ダメージを受けていない秒数 × 2% ずつ敵のHPが増加
    // 例: 30秒無傷ならHP1.6倍、1分ならHP2.2倍。最大でHP4倍(150秒)まで制限
    let tensionMult = 1.0 + Math.min(3.0, noDamageTimer * 0.02);
    hpMult *= tensionMult;

    if(singularityMode) hpMult *= 2.0;

    // HP満タン時のペナルティ（既存の仕様）も維持しつつ乗算
    if (level >= 5 && player.hp >= player.maxHp * 0.9) {
        let dangerLevel = Math.min(3.0, 1.0 + (level / 50));
        hpMult *= 1.3; 
        e.speedMultOverride = 1.3 * dangerLevel; 
        e.dmgMultOverride = 1.5; 
    }

    e.hp = data.baseHp * hpMult;
    e.size = data.size;
    e.color = data.color;

    let spdBase = data.baseSpeed + (level * 0.01 || 0);
    if (type === 'normal') spdBase += Math.random();
    
    let spdMult = (data.speedMult !== undefined) ? data.speedMult : 1.0;
    if (e.speedMultOverride) spdMult *= e.speedMultOverride;

    e.speed = spdBase * spdMult;
    
    let dmgBase = 10 + Math.floor(level * 1.5);
    if (e.dmgMultOverride) dmgBase *= e.dmgMultOverride;
    e.dmg = dmgBase;

    // ボス補正
    if(type === 'boss') { 
        e.variant = Math.floor(Math.random() * 4);
        e.dmg = 50 + (level * 2);
        let cycleMult = 1 + (bossCycleCounter * 0.5);
        if(bossCycleCounter >= 3) {
            let lateGameFactor = bossCycleCounter - 2;
            cycleMult *= Math.pow(1.15, lateGameFactor);
            e.speed = Math.min(8.0, e.speed + (lateGameFactor * 0.8));
        }
        e.hp *= cycleMult;
    }

    if(singularityMode) { 
        e.speed *= 1.3; 
    }

    e.maxHp = e.hp; 
    enemies.push(e);
}

function damageEnemy(e, dmg, isPhantom = false) {
    if(e.dead) return; 

    // クリティカル判定 (ファントム以外)
    let isCrit = false;
    if(!isPhantom && (Math.random() < stats.critChance || stats.deadeye)) { 
        let multiplier = stats.deadeye ? (stats.critMult + 1.0) : stats.critMult;
        dmg *= multiplier; 
        isCrit = true; 
    } 

    // ▼▼▼ 変更点: ここにあった長いif文の羅列を削除し、この処理に変更 ▼▼▼
    
    // 計算用コンテキストを作成 (オブジェクト経由で数値を書き換えてもらう)
    let ctx = { enemy: e, dmg: dmg, isCrit: isCrit };
    
    // 「ダメージ計算するよ！」と通知 -> data.js の onBeforeDamage が動いて ctx.dmg を書き換える
    SkillSystem.trigger('onBeforeDamage', ctx);
    
    // 書き換えられた結果を反映
    dmg = ctx.dmg;
    isCrit = ctx.isCrit;
    
    // ▲▲▲ 変更点ここまで ▲▲▲

    e.hp -= dmg; e.flash = 5; 
    
    // 攻撃ヒット後のイベント (ファントムストライク等はここで発動)
    SkillSystem.trigger('onHit', { enemy: e, dmg: dmg, isPhantom: isPhantom });

    let textColor = isPhantom ? '#e0aaff' : (isCrit ? '#ff0' : '#fff');

    // 追撃発生時のパーティクル（通常のヒット演出も少し出す）
    if(isPhantom) {
        if(Math.random() < 0.2) createParticles(e.x, e.y, '#e0aaff', 2, 2);
    } else {
        if(particles.length < MAX_PARTICLES && Math.random() < 0.2) createParticles(e.x, e.y, '#fff', 1, 2); 
        Sound.play('hit');
    }

    // ダメージテキスト表示（アイコン等の装飾は一切なし）
    // ファントム(isPhantom)の場合も必ず表示するように条件に追加
    if(isCrit || e.type === 'boss' || texts.length < 5 || Math.random() < 0.2 || isPhantom) {
        if(texts.length < MAX_TEXTS) {
            texts.push({
                x: e.x, 
                y: e.y, 
                str: Math.floor(dmg), // 数字のみ
                life: 20, 
                color: textColor 
            });
        }
    }

    if(isCrit || e.type === 'boss' || texts.length < 5 || Math.random() < 0.2) {
        if(texts.length < MAX_TEXTS) texts.push({x:e.x, y:e.y, str:Math.floor(dmg), life:20, color: textColor});
    }
    
    // 敵死亡時の処理 (ここはまだ長いので、次の段階で整理しても良い)
    if(e.hp <= 0) {
        e.dead = true; 
        
        if(e.type === 'boss') {
            Sound.play('boss_kill');
            // ★追加: 演出のために少し遅らせて報酬画面を出す (1.5秒後)
            setTimeout(() => {
                if(gameActive) showBossReward();
            }, 1500);
        } else {
            Sound.play('explode'); 
        }

        screenShake = e.type === 'boss' ? 20 : 2;

        // ▼▼▼ 修正: ここにあった大量のスキル分岐をこの1行に集約 ▼▼▼
        SkillSystem.trigger('onKill', { enemy: e, player: player });
        // ▲▲▲ 修正完了 ▲▲▲
        
        // --- 以下の演出・ドロップ処理はゲームの基本ルールなので残してOK ---
        
        if(particles.length < MAX_PARTICLES) createParticles(e.x, e.y, e.color, e.type==='boss'?30:3, 4);

        let levelScaler = 1 + (level * 0.5); 
        if(singularityMode) levelScaler *= 2;
        let baseVal = 25 * levelScaler;
        let val = baseVal;
        if(e.type === 'boss') val = baseVal * 50;
        else if(e.ai === 'tank') val = Math.max(300, baseVal * 3);

        // オーブの見た目決定
        let orbType = { val: val, color: '#0ff', size: 4, pitch: 1.0 }; 
        if(val >= 20000) orbType = { val: val, color: '#f0f', size: 16, pitch: 0.5 }; 
        else if(val >= 6000) orbType = { val: val, color: '#f00', size: 14, pitch: 0.6 }; 
        else if(val >= 1500) orbType = { val: val, color: '#f80', size: 12, pitch: 0.7 }; 
        else if(val >= 300) orbType = { val: val, color: '#00f', size: 10, pitch: 0.8 }; 
        else if(val >= 80) orbType = { val: val, color: '#0f0', size: 8, pitch: 0.9 }; 
        
        if(e.ai === 'splitter') { createEnemy('minion', e.x+10, e.y); createEnemy('minion', e.x-10, e.y); }
        score += val; updateUI(); 
        
        expOrbs.push({x: e.x, y: e.y, size: orbType.size, val: orbType.val, color: orbType.color, pitch: orbType.pitch});

        if(Math.random() < 0.002) {
            if(items.length >= MAX_ITEMS) items.shift(); // 上限なら古いものを消す
            items.push({type: 'magnet', x: e.x, y: e.y});
        }
        if(Math.random() < 0.0005) {
            if(items.length >= MAX_ITEMS) items.shift(); // 上限なら古いものを消す
            items.push({type: 'bomb', x: e.x, y: e.y});
        }
        // ▲▲▲ 修正 ▲▲▲
    }
}

function addExp(v, silent) {
    if(!gameActive) return; 
    exp += v; 
    if(exp >= nextExp) { 
        exp = 0; level++; 
        
        // ▼▼▼ 修正箇所 ▼▼▼
        if (level < 40) {
            if (level >= 5) {
                // Lv5以降: 必要経験値を大幅に増やし、爆速レベルアップを抑制
                // (倍率を1.2倍、固定加算を+1500に強化)
                nextExp = Math.floor(nextExp * 1.20) + 1500;
            } else {
                // Lv5未満: 今まで通りサクサク
                nextExp = Math.floor(nextExp * 1.15) + 500;
            }
        } else {
            // Lv40以降は従来通りのペース
            nextExp = Math.floor(nextExp * 1.02) + 1000;
        }
        // ▲▲▲ 修正ここまで ▲▲▲

        Sound.play('levelup'); updateUI(); 
        
        if(level === 5) showEvo(); 
        else if(level === 40) showSecondEvo(); 
        else if(level >= 20 && level % 10 === 0) showMilestone(); 
        else showUpgrade(); 
    }
    document.getElementById('xp-fill').style.width = Math.min(100, (exp/nextExp*100))+'%';
}

function triggerVoidRift(target) {
    if(!target || target.dead) return;

    let dmg = stats.dmg * 2.5; 
    let range = 60 * stats.areaScale;
    let color = '#8000ff'; 
    let delay = 30; 
    let extraEffect = null;

    if(player.class === 'Samurai' || player.subClass === 'Ashura') {
        delay = 0; dmg *= 1.2; color = '#ff0033'; Sound.play('missile', 3.0); 
    } else if(player.class === 'Melee' || player.class === 'Vanguard') {
        delay = 45; range *= 1.5;
        extraEffect = (e) => {
            let angle = Math.atan2(target.y - e.y, target.x - e.x);
            e.x += Math.cos(angle) * 30; e.y += Math.sin(angle) * 30; 
        };
    } else if(player.class === 'Sniper') {
        dmg *= 3.0; range *= 0.5; color = '#ff0';
        extraEffect = (e) => { e.x += (e.x - player.x) * 0.1; };
    } else if(player.class === 'Guardian') {
        dmg *= 0.5; color = '#00ffff'; extraEffect = (e) => { e.frozen = 90; };
    } else if(player.class === 'Assault') {
        extraEffect = (e) => { for(let i=0; i<3; i++) fireMissile(); };
    } else if(player.class === 'Alchemist') {
        extraEffect = (e) => { gasClouds.push({x:e.x, y:e.y, r:40, life:120, dmg:stats.dmg*0.3}); };
        color = '#00ff00';
    } else if(player.class === 'Trickster') {
        range *= (0.5 + Math.random() * 2.0);
        dmg *= (Math.random() * 5.0);
        color = ['#f00','#0f0','#00f','#ff0'][Math.floor(Math.random()*4)];
    }

    bullets.push({
        type: 'void', x: target.x, y: target.y, vx: 0, vy: 0,
        life: delay, size: range, color: color, dmg: dmg,
        hit: [], extra: extraEffect, maxLife: delay 
    });
}
