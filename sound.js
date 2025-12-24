const AudioCtx = window.AudioContext || window.webkitAudioContext;
let actx = null;
let lastSoundTime = {};

// ★ Sound Engine
const Sound = {
    activeEndTimes: [],
    init: () => { 
        if(!actx) {
            actx = new AudioCtx(); 
            const resumeFunc = () => {
                if(actx.state === 'suspended') actx.resume();
                window.removeEventListener('click', resumeFunc);
                window.removeEventListener('touchstart', resumeFunc);
                window.removeEventListener('keydown', resumeFunc);
            };
            window.addEventListener('click', resumeFunc);
            window.addEventListener('touchstart', resumeFunc);
            window.addEventListener('keydown', resumeFunc);
        }
    },
    update: () => {
        if(!actx) return;
        const now = actx.currentTime;
        Sound.activeEndTimes = Sound.activeEndTimes.filter(t => t > now);
    },
    play: (type, pitch = 1.0) => {
        if(!actx) Sound.init();
        if(!actx) return;
        if(actx.state === 'suspended') actx.resume().catch(()=>{});
        if(Sound.activeEndTimes.length >= MAX_SOUND_CONCURRENT) return;

        const now = actx.currentTime;
        if(lastSoundTime[type] && now - lastSoundTime[type] < 0.05) return;
        lastSoundTime[type] = now;

        const osc = actx.createOscillator();
        const gain = actx.createGain();
        osc.connect(gain);
        gain.connect(actx.destination);

        // ※ level変数はメインロジック側にあるグローバル変数を参照します
        // 実行時には定義されているはずなので問題ありません
        if(typeof level !== 'undefined' && level >= 100) pitch *= 0.8;

        let duration = 0.1;
        if(type === 'shoot') {
            duration = 0.1; osc.frequency.setValueAtTime(300 * pitch, now); osc.frequency.exponentialRampToValueAtTime(50, now+0.1); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now+0.1);
        } else if(type === 'missile') { 
            duration = 0.3; osc.type='square'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(400, now+0.2); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now+0.3);
        } else if(type === 'hit') {
            duration = 0.05; osc.type='square'; osc.frequency.setValueAtTime(100 * pitch, now); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now+0.05);
        } else if(type === 'dash') {
            duration = 0.2; osc.type='triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.linearRampToValueAtTime(200, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
        } else if(type === 'laser') {
            duration = 0.5; osc.type='sawtooth'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(200, now+0.5); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.5);
        } else if(type === 'freeze') {
            duration = 0.3; osc.type='sine'; osc.frequency.setValueAtTime(2000, now); osc.frequency.linearRampToValueAtTime(1000, now+0.3); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.3);
        } else if(type === 'explode') {
            duration = 0.2; osc.type='sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(10, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
        } else if(type === 'levelup') {
            duration = 0.6; osc.type='triangle'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(554, now+0.1); osc.frequency.setValueAtTime(659, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.6);
        } else if(type === 'milestone') {
            duration = 0.8; osc.type='sawtooth'; osc.frequency.setValueAtTime(110, now); osc.frequency.linearRampToValueAtTime(440, now+0.8); gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now+0.8);
        } else if(type === 'alert') {
            duration = 0.5; osc.type='sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(150, now+0.5); gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now+0.5);
        } else if(type === 'exp') {
            duration = 0.1; osc.type='sine'; let freq = 1000 * pitch; osc.frequency.setValueAtTime(freq, now); osc.frequency.linearRampToValueAtTime(freq + 500, now+0.05); gain.gain.setValueAtTime(0.03, now); gain.gain.linearRampToValueAtTime(0, now+0.1);
        } else if(type === 'bounce') {
            duration = 0.1; osc.type='triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.linearRampToValueAtTime(300, now+0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.1);
        } else if(type === 'bash') {
            duration = 0.2; osc.type='square'; osc.frequency.setValueAtTime(100, now); osc.frequency.linearRampToValueAtTime(50, now+0.2); gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
        } else if(type === 'lightning') {
            duration = 0.2; osc.type='sawtooth'; osc.frequency.setValueAtTime(800, now); osc.frequency.linearRampToValueAtTime(100, now+0.2); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now+0.2);
        } else if(type === 'spark') {
            duration = 0.15; osc.type='sawtooth'; osc.frequency.setValueAtTime(2000, now); osc.frequency.linearRampToValueAtTime(500, now+0.15); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now+0.15);
        } else if(type === 'powerup') {
            duration = 0.5; osc.type='sine'; osc.frequency.setValueAtTime(440, now); osc.frequency.linearRampToValueAtTime(880, now+0.25); osc.frequency.linearRampToValueAtTime(1760, now+0.5); gain.gain.setValueAtTime(0.2, now); gain.gain.linearRampToValueAtTime(0, now+0.5);
        } else if(type === 'bomb') {
            duration = 1.0; osc.type='sawtooth'; osc.frequency.setValueAtTime(50, now); osc.frequency.linearRampToValueAtTime(20, now+1.0); gain.gain.setValueAtTime(0.5, now); gain.gain.linearRampToValueAtTime(0, now+1.0);
        } else if(type === 'boss_kill') {
            duration = 3.0; // 長い余韻
            osc.type='sawtooth'; 
            // 重低音から急速に下がる
            osc.frequency.setValueAtTime(120, now); 
            osc.frequency.exponentialRampToValueAtTime(10, now+3.0); 
            // 揺らぎを加える（擬似的な和音感）
            gain.gain.setValueAtTime(0.6, now); 
            gain.gain.exponentialRampToValueAtTime(0.01, now+3.0);
        }
        
        
        osc.start(now); osc.stop(now + duration);
        Sound.activeEndTimes.push(now + duration + 0.05);
    }
};
