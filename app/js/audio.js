'use strict';

// ==========================================
// WEB AUDIO API (Cockpit Sounds)
// ==========================================
let audioCtx;
let isAudioMuted = false;

function updateAudioButtonUI() {
    const btn = $('btn-audio');
    btn.textContent = isAudioMuted ? '🔇 SFX: OFF' : '🔊 SFX: ON';
    btn.classList.toggle('btn-cyan', !isAudioMuted);
    btn.classList.toggle('btn-muted', isAudioMuted);
}

function toggleAudio() {
    isAudioMuted = !isAudioMuted;
    try { localStorage.setItem('alopex_audio_muted', isAudioMuted ? 'true' : 'false'); } catch (e) {}
    updateAudioButtonUI();
    if (!isAudioMuted) {
        playTone('success');
        showToast('Cockpit audio enabled');
    } else {
        showToast('Cockpit audio muted');
    }
}

function loadAudioPref() {
    try { isAudioMuted = localStorage.getItem('alopex_audio_muted') === 'true'; } catch (e) {}
    updateAudioButtonUI();
}

function initAudio() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(type) {
    if (isAudioMuted) return;
    initAudio();
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
        gain.gain.setValueAtTime(0.05, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    } else if (type === 'success') {
        osc.type = 'square'; osc.frequency.setValueAtTime(440, now); osc.frequency.setValueAtTime(880, now + 0.1);
        gain.gain.setValueAtTime(0.03, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'alert') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, now); osc.frequency.setValueAtTime(400, now + 0.1); osc.frequency.setValueAtTime(300, now + 0.2);
        gain.gain.setValueAtTime(0.06, now); gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
}

document.body.addEventListener('mousedown', initAudio, { once: true });
document.body.addEventListener('touchstart', initAudio, { once: true });
