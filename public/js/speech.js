// Yosa AI - Hybrid Turkish Voice (TTS + STT) Engine with 6 Voice Options
(function () {
  const VOICES = [
    {
      id: "elif",
      name: "Elif",
      role: "Sıcak & Doğal Kadın Sesi",
      gender: "female",
      pitch: 1.06,
      rate: 1.0,
      accentColor: "#10b981",
      sample: "Merhaba! Ben Yosa Elif. Seninle konuşmaya, haberleri özetlemeye ve ödevlerini kaydetmeye hazırım."
    },
    {
      id: "mert",
      name: "Mert",
      role: "Tok & Güvenilir Erkek Sesi",
      gender: "male",
      pitch: 0.80,
      rate: 0.96,
      accentColor: "#3b82f6",
      sample: "Selam! Ben Yosa Mert. Galatasaray maçını veya günün haberlerini istediğin an özetleyebilirim."
    },
    {
      id: "zeynep",
      name: "Zeynep",
      role: "Enerjik & Neşeli Asistan",
      gender: "female",
      pitch: 1.20,
      rate: 1.08,
      accentColor: "#f59e0b",
      sample: "Selam! Ben Zeynep! Ödevlerini kaydetmek ve son dakika gelişmelerini anlatmak için buradayım!"
    },
    {
      id: "kerem",
      name: "Kerem",
      role: "Sakin & Bilge Rehber",
      gender: "male",
      pitch: 0.72,
      rate: 0.90,
      accentColor: "#8b5cf6",
      sample: "Merhaba, ben Kerem. Ödevlerini ve günlük planını sakin bir şekilde birlikte takip edelim."
    },
    {
      id: "ada",
      name: "Ada",
      role: "Akıcı Haber Spikeri",
      gender: "female",
      pitch: 1.02,
      rate: 1.14,
      accentColor: "#06b6d4",
      sample: "İyi günler, ben Ada. Google News üzerinden en sıcak gelişmeleri senin için hızla aktarıyorum."
    },
    {
      id: "nova",
      name: "Nova",
      role: "Modern Yapay Zeka Sesi",
      gender: "neutral",
      pitch: 0.92,
      rate: 1.03,
      accentColor: "#ec4899",
      sample: "Merhaba, ben Yosa Nova. Klavyeye dokunmadan bana her şeyi sesli sorabilirsin."
    }
  ];

  const SPEED_PRESETS = [
    { id: "slow", label: "Yavaş", factor: 0.88 },
    { id: "normal", label: "Normal", factor: 1.0 },
    { id: "fast", label: "Akıcı", factor: 1.14 }
  ];

  let browserVoices = [];
  let currentSpeakToken = 0;
  let activeCloudAudio = null;
  let speakingState = false;
  let listeningState = false;
  let webRecognition = null;
  let nativeTtsCallbacks = null;
  let sttHandlers = null;

  function loadBrowserVoices() {
    if (!("speechSynthesis" in window)) return;
    const list = window.speechSynthesis.getVoices() || [];
    if (list.length > 0) browserVoices = list;
  }

  if ("speechSynthesis" in window) {
    loadBrowserVoices();
    window.speechSynthesis.onvoiceschanged = loadBrowserVoices;
  }

  function getVoiceProfile(voiceId) {
    return VOICES.find((v) => v.id === voiceId) || VOICES[0];
  }

  function pickBrowserTurkishVoice(profile) {
    loadBrowserVoices();
    const trVoices = browserVoices.filter(
      (v) => v.lang && v.lang.toLowerCase().startsWith("tr")
    );
    if (trVoices.length === 0) return null;
    if (trVoices.length === 1) return trVoices[0];

    const maleHints = ["tolga", "cem", "ahmet", "male", "erkek", "murat"];
    const femaleHints = ["emel", "yelda", "filiz", "female", "kadin", "kadın", "seda"];

    if (profile.gender === "male") {
      const hit = trVoices.find((v) =>
        maleHints.some((h) => v.name.toLowerCase().includes(h))
      );
      if (hit) return hit;
      return trVoices[trVoices.length - 1];
    }
    if (profile.gender === "female") {
      const hit = trVoices.find((v) =>
        femaleHints.some((h) => v.name.toLowerCase().includes(h))
      );
      if (hit) return hit;
      return trVoices[0];
    }
    return trVoices[Math.min(1, trVoices.length - 1)];
  }

  function splitIntoSentences(text) {
    const cleaned = String(text || "")
      .replace(/[*#_`~>]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) return [];

    const rawParts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    const chunks = [];
    let current = "";
    for (const part of rawParts) {
      const p = part.trim();
      if (!p) continue;
      if ((current + " " + p).trim().length <= 175) {
        current = (current + " " + p).trim();
      } else {
        if (current) chunks.push(current);
        if (p.length <= 175) {
          current = p;
        } else {
          // Split long clause by commas/spaces
          const words = p.split(" ");
          let sub = "";
          for (const w of words) {
            if ((sub + " " + w).trim().length <= 170) {
              sub = (sub + " " + w).trim();
            } else {
              if (sub) chunks.push(sub);
              sub = w;
            }
          }
          current = sub;
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  function stopSpeaking() {
    currentSpeakToken++;
    speakingState = false;

    if (nativeTtsCallbacks) {
      nativeTtsCallbacks = null;
    }
    if (window.YosaNative && typeof window.YosaNative.stopSpeaking === "function") {
      try {
        window.YosaNative.stopSpeaking();
      } catch (_) {}
    }
    if ("speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
    if (activeCloudAudio) {
      try {
        activeCloudAudio.pause();
        activeCloudAudio.src = "";
      } catch (_) {}
      activeCloudAudio = null;
    }
  }

  // Native Android TTS callback bridge
  window.__yosaNativeTtsEvent = function (eventType) {
    if (!nativeTtsCallbacks) return;
    if (eventType === "start") {
      speakingState = true;
      if (nativeTtsCallbacks.onStart) nativeTtsCallbacks.onStart();
    } else if (eventType === "done" || eventType === "error") {
      const cb = nativeTtsCallbacks;
      nativeTtsCallbacks = null;
      speakingState = false;
      if (cb && cb.onEnd) cb.onEnd();
    }
  };

  function speakViaCloudFallback(chunks, profile, speedFactor, token, callbacks) {
    let idx = 0;
    const nextChunk = () => {
      if (token !== currentSpeakToken) return;
      if (idx >= chunks.length) {
        speakingState = false;
        if (callbacks.onEnd) callbacks.onEnd();
        return;
      }
      const chunk = chunks[idx++];
      const encoded = encodeURIComponent(chunk);
      // StreamElements / Google TTS compatible stream fallback for browsers lacking local tr-TR voice
      const urls = [
        `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=tr&q=${encoded}`,
        `https://api.streamelements.com/kappa/v2/speech?voice=Filiz&text=${encoded}`
      ];

      let urlIdx = 0;
      const tryUrl = () => {
        if (token !== currentSpeakToken) return;
        if (urlIdx >= urls.length) {
          // Simulated reading delay if browser blocks external audio or offline
          const estMs = Math.min(5000, Math.max(1400, chunk.length * 55));
          setTimeout(nextChunk, estMs);
          return;
        }
        const audio = new Audio(urls[urlIdx++]);
        activeCloudAudio = audio;
        // Differentiate voice pitch/timbre when using single cloud stream
        const rateShift =
          profile.gender === "male"
            ? 0.90 * speedFactor
            : profile.id === "zeynep"
            ? 1.12 * speedFactor
            : profile.rate * speedFactor;
        if ("preservesPitch" in audio) audio.preservesPitch = profile.gender !== "male";
        if ("webkitPreservesPitch" in audio) audio.webkitPreservesPitch = profile.gender !== "male";
        audio.playbackRate = Math.max(0.75, Math.min(1.35, rateShift));

        let settled = false;
        const safety = setTimeout(() => {
          if (!settled) {
            settled = true;
            nextChunk();
          }
        }, Math.max(4500, chunk.length * 120));

        audio.onended = () => {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          nextChunk();
        };
        audio.onerror = () => {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          tryUrl();
        };
        audio.play().catch(() => {
          if (settled) return;
          settled = true;
          clearTimeout(safety);
          tryUrl();
        });
      };

      tryUrl();
    };

    speakingState = true;
    if (callbacks.onStart) callbacks.onStart();
    nextChunk();
  }

  function speak(text, options = {}) {
    stopSpeaking();
    const token = ++currentSpeakToken;
    const profile = getVoiceProfile(options.voiceId || "elif");
    const speedPreset =
      SPEED_PRESETS.find((s) => s.id === options.speedId) || SPEED_PRESETS[1];
    const effectiveRate = Math.max(0.7, Math.min(1.4, profile.rate * speedPreset.factor));
    const callbacks = {
      onStart: options.onStart || null,
      onEnd: options.onEnd || null
    };

    const chunks = splitIntoSentences(text);
    if (chunks.length === 0) {
      if (callbacks.onEnd) callbacks.onEnd();
      return;
    }

    const cleanFull = chunks.join(" ");

    // 1. Native Android TTS inside APK
    if (window.YosaNative && typeof window.YosaNative.speak === "function") {
      try {
        nativeTtsCallbacks = callbacks;
        speakingState = true;
        const started = window.YosaNative.speak(
          cleanFull,
          profile.id,
          profile.pitch,
          effectiveRate,
          profile.gender
        );
        if (started) {
          // Safety watchdog in case Android TTS engine hangs
          const maxWait = Math.max(6000, cleanFull.length * 125);
          setTimeout(() => {
            if (token === currentSpeakToken && speakingState) {
              window.__yosaNativeTtsEvent("done");
            }
          }, maxWait);
          return;
        }
        nativeTtsCallbacks = null;
      } catch (_) {
        nativeTtsCallbacks = null;
      }
    }

    // 2. Browser SpeechSynthesis if Turkish voice is available
    const trVoice = pickBrowserTurkishVoice(profile);
    if ("speechSynthesis" in window && trVoice) {
      let cIdx = 0;
      speakingState = true;
      if (callbacks.onStart) callbacks.onStart();

      const speakNextSentence = () => {
        if (token !== currentSpeakToken) return;
        if (cIdx >= chunks.length) {
          speakingState = false;
          if (callbacks.onEnd) callbacks.onEnd();
          return;
        }
        const sentence = chunks[cIdx++];
        const utter = new SpeechSynthesisUtterance(sentence);
        utter.lang = trVoice.lang || "tr-TR";
        utter.voice = trVoice;
        utter.pitch = profile.pitch;
        utter.rate = effectiveRate;
        utter.volume = 1.0;

        let finished = false;
        const guard = setTimeout(() => {
          if (!finished && token === currentSpeakToken) {
            finished = true;
            speakNextSentence();
          }
        }, Math.max(4500, sentence.length * 115));

        utter.onend = () => {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          speakNextSentence();
        };
        utter.onerror = () => {
          if (finished) return;
          finished = true;
          clearTimeout(guard);
          speakNextSentence();
        };

        try {
          window.speechSynthesis.speak(utter);
        } catch (_) {
          clearTimeout(guard);
          speakViaCloudFallback(chunks.slice(cIdx - 1), profile, speedPreset.factor, token, {
            onStart: null,
            onEnd: callbacks.onEnd
          });
        }
      };

      speakNextSentence();
      return;
    }

    // 3. Cloud Turkish TTS Audio Stream Fallback (for desktop browsers without tr-TR pack)
    speakViaCloudFallback(chunks, profile, speedPreset.factor, token, callbacks);
  }

  // Native Android STT callbacks
  window.__yosaNativeSttPartial = function (partialText) {
    if (sttHandlers && sttHandlers.onPartial) {
      sttHandlers.onPartial(partialText);
    }
  };

  window.__yosaNativeSttResult = function (finalText) {
    listeningState = false;
    const h = sttHandlers;
    sttHandlers = null;
    if (h && h.onResult) {
      h.onResult(finalText);
    }
  };

  window.__yosaNativeSttError = function (errCode) {
    listeningState = false;
    const h = sttHandlers;
    sttHandlers = null;
    if (h && h.onError) {
      h.onError(errCode || "speech_error");
    }
  };

  function startListening(handlers = {}) {
    stopListening();
    // If Yosa is currently speaking, barge-in stops TTS immediately
    if (speakingState) {
      stopSpeaking();
    }

    sttHandlers = handlers;

    // 1. Native Android SpeechRecognizer inside APK
    if (window.YosaNative && typeof window.YosaNative.startListening === "function") {
      try {
        listeningState = true;
        if (handlers.onStart) handlers.onStart();
        window.YosaNative.startListening("tr-TR");
        return true;
      } catch (err) {
        listeningState = false;
      }
    }

    // 2. Web Speech API (Chrome / Edge / Safari / Android Chrome)
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      listeningState = false;
      if (handlers.onError) {
        handlers.onError("unsupported");
      }
      return false;
    }

    try {
      const rec = new SR();
      webRecognition = rec;
      rec.lang = "tr-TR";
      rec.interimResults = true;
      rec.continuous = false;
      rec.maxAlternatives = 1;

      let finalTranscript = "";
      let latestInterim = "";
      let resolved = false;

      rec.onstart = () => {
        listeningState = true;
        if (handlers.onStart) handlers.onStart();
      };

      rec.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += " " + t;
          } else {
            interim += t;
          }
        }
        latestInterim = (finalTranscript + " " + interim).trim();
        if (latestInterim && handlers.onPartial) {
          handlers.onPartial(latestInterim);
        }
      };

      rec.onerror = (event) => {
        if (resolved) return;
        resolved = true;
        listeningState = false;
        webRecognition = null;
        if (handlers.onError) {
          handlers.onError(event.error || "mic_error");
        }
      };

      rec.onend = () => {
        if (resolved) return;
        resolved = true;
        listeningState = false;
        webRecognition = null;
        const text = (finalTranscript || latestInterim).trim();
        if (text) {
          if (handlers.onResult) handlers.onResult(text);
        } else {
          if (handlers.onError) handlers.onError("no-speech");
        }
      };

      rec.start();
      return true;
    } catch (e) {
      listeningState = false;
      if (handlers.onError) handlers.onError("start_failed");
      return false;
    }
  }

  function stopListening() {
    listeningState = false;
    sttHandlers = null;
    if (window.YosaNative && typeof window.YosaNative.stopListening === "function") {
      try {
        window.YosaNative.stopListening();
      } catch (_) {}
    }
    if (webRecognition) {
      try {
        webRecognition.abort();
      } catch (_) {}
      webRecognition = null;
    }
  }

  window.YosaSpeech = {
    VOICES,
    SPEED_PRESETS,
    getVoiceProfile,
    speak,
    stopSpeaking,
    startListening,
    stopListening,
    isSpeaking: () => speakingState,
    isListening: () => listeningState
  };
})();
