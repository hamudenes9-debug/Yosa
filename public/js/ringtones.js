// Yosa AI - Ringtone & Telephony Sound Engine (Native Android + Web Audio)
(function () {
  const RINGTONES = [
    {
      id: "ring_yosa",
      name: "Yosa İmza Zili",
      subtitle: "Sıcak akıllı telefon melodisi",
      file: "ringtones/ring_yosa.wav",
      badge: "Varsayılan"
    },
    {
      id: "ring_phone",
      name: "Klasik Ahize Zili",
      subtitle: "Gerçekçi çift tonlu telefon zili",
      file: "ringtones/ring_phone.wav",
      badge: "Gerçekçi"
    },
    {
      id: "ring_crystal",
      name: "Kristal Melodi",
      subtitle: "Berrak çan armonileri",
      file: "ringtones/ring_crystal.wav",
      badge: "Parlak"
    },
    {
      id: "ring_night",
      name: "Gece Ritmi",
      subtitle: "Sakin ve yumuşak arama tonu",
      file: "ringtones/ring_night.wav",
      badge: "Yumuşak"
    },
    {
      id: "ring_pulse",
      name: "Dijital Nabız",
      subtitle: "Modern yapay zeka arama sinyali",
      file: "ringtones/ring_pulse.wav",
      badge: "Modern"
    }
  ];

  let audioCtx = null;
  let activeAudio = null;
  let previewTimeout = null;
  let vibrateInterval = null;
  let dialbackTimer = null;
  let synthFallbackTimer = null;

  function ensureContext() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  function playToneBurst(freq, durationSec, volume, type, delaySec) {
    const ctx = ensureContext();
    if (!ctx) return;
    const start = ctx.currentTime + (delaySec || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(volume || 0.18, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + durationSec + 0.02);
  }

  function startSynthRingLoop(ringId) {
    stopSynthRingLoop();
    const triggerOnce = () => {
      if (ringId === "ring_phone") {
        playToneBurst(440, 0.65, 0.18, "sine", 0);
        playToneBurst(480, 0.65, 0.18, "sine", 0);
        playToneBurst(440, 0.65, 0.18, "sine", 0.9);
        playToneBurst(480, 0.65, 0.18, "sine", 0.9);
      } else if (ringId === "ring_crystal") {
        [880, 1108.73, 1318.51, 1760].forEach((f, idx) => {
          playToneBurst(f, 0.55, 0.16, "sine", idx * 0.22);
        });
      } else if (ringId === "ring_night") {
        [392, 493.88, 587.33, 739.99].forEach((f, idx) => {
          playToneBurst(f, 0.75, 0.16, "triangle", idx * 0.28);
        });
      } else if (ringId === "ring_pulse") {
        playToneBurst(587.33, 0.16, 0.2, "sine", 0);
        playToneBurst(587.33, 0.16, 0.2, "sine", 0.18);
        playToneBurst(880, 0.35, 0.22, "sine", 0.38);
      } else {
        [523.25, 659.25, 783.99, 987.77, 1046.5].forEach((f, idx) => {
          playToneBurst(f, 0.45, 0.18, "sine", idx * 0.18);
        });
      }
    };
    triggerOnce();
    synthFallbackTimer = setInterval(triggerOnce, 2600);
  }

  function stopSynthRingLoop() {
    if (synthFallbackTimer) {
      clearInterval(synthFallbackTimer);
      synthFallbackTimer = null;
    }
  }

  function startVibration() {
    stopVibration();
    if (window.YosaNative && typeof window.YosaNative.vibrateCall === "function") {
      try {
        window.YosaNative.vibrateCall(true);
        return;
      } catch (_) {}
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate([700, 400, 700, 1100]);
        vibrateInterval = setInterval(() => {
          try {
            navigator.vibrate([700, 400, 700, 1100]);
          } catch (_) {}
        }, 2900);
      } catch (_) {}
    }
  }

  function stopVibration() {
    if (vibrateInterval) {
      clearInterval(vibrateInterval);
      vibrateInterval = null;
    }
    if (window.YosaNative && typeof window.YosaNative.vibrateCall === "function") {
      try {
        window.YosaNative.vibrateCall(false);
      } catch (_) {}
    }
    if (navigator.vibrate) {
      try {
        navigator.vibrate(0);
      } catch (_) {}
    }
  }

  function startRingtone(ringtoneId, withVibration = true) {
    stopRingtone();
    const item = RINGTONES.find((r) => r.id === ringtoneId) || RINGTONES[0];

    if (withVibration) {
      startVibration();
    }

    // Prefer Native Android MediaPlayer on Ringtone Stream when inside APK
    if (window.YosaNative && typeof window.YosaNative.startRingtone === "function") {
      try {
        const ok = window.YosaNative.startRingtone(item.id);
        if (ok) return;
      } catch (_) {}
    }

    try {
      const audio = new Audio(item.file);
      audio.loop = true;
      audio.volume = 0.95;
      activeAudio = audio;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          startSynthRingLoop(item.id);
        });
      }
    } catch (_) {
      startSynthRingLoop(item.id);
    }
  }

  function stopRingtone() {
    if (previewTimeout) {
      clearTimeout(previewTimeout);
      previewTimeout = null;
    }
    stopVibration();
    stopSynthRingLoop();

    if (window.YosaNative && typeof window.YosaNative.stopRingtone === "function") {
      try {
        window.YosaNative.stopRingtone();
      } catch (_) {}
    }

    if (activeAudio) {
      try {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      } catch (_) {}
      activeAudio = null;
    }
  }

  function previewRingtone(ringtoneId, onDone) {
    startRingtone(ringtoneId, false);
    previewTimeout = setTimeout(() => {
      stopRingtone();
      if (typeof onDone === "function") onDone();
    }, 3200);
  }

  function startDialbackTone() {
    stopDialbackTone();
    const beep = () => {
      // Standard 425Hz Turkish/European telephone ringback tone
      playToneBurst(425, 0.9, 0.14, "sine", 0);
    };
    beep();
    dialbackTimer = setInterval(beep, 2600);
  }

  function stopDialbackTone() {
    if (dialbackTimer) {
      clearInterval(dialbackTimer);
      dialbackTimer = null;
    }
  }

  function playCallConnectedTone() {
    playToneBurst(587.33, 0.11, 0.12, "sine", 0);
    playToneBurst(880.0, 0.16, 0.14, "sine", 0.09);
  }

  function playCallEndedTone() {
    // Classic 3-short-beep disconnect tone
    playToneBurst(425, 0.16, 0.15, "sine", 0);
    playToneBurst(425, 0.16, 0.15, "sine", 0.24);
    playToneBurst(425, 0.22, 0.15, "sine", 0.48);
  }

  function playListeningCue() {
    playToneBurst(660, 0.08, 0.07, "sine", 0);
    playToneBurst(880, 0.10, 0.08, "sine", 0.06);
  }

  window.YosaRingtones = {
    RINGTONES,
    ensureContext,
    startRingtone,
    stopRingtone,
    previewRingtone,
    startDialbackTone,
    stopDialbackTone,
    playCallConnectedTone,
    playCallEndedTone,
    playListeningCue
  };
})();
