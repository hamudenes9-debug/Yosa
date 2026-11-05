// Yosa AI — Complete Zero-Keyboard Phone Call, Google News & Homework Controller
(function () {
  const STORAGE_KEY = "yosa_ai_state_v1";

  const state = {
    voiceId: "elif",
    speedId: "normal",
    ringtoneId: "ring_yosa",
    homeworks: [],
    callState: "idle", // idle | incoming | dialing | active
    callReason: "Sesli Asistan Araması",
    callStartPrompt: null,
    callSeconds: 0,
    isMuted: false,
    speakerOn: true,
    history: [],
    lastArticles: [],
    scheduledAt: null,
    scheduledReason: "",
    activeHubMicMode: null // null | "general" | "homework" | "schedule"
  };

  let callTimerInterval = null;
  let scheduleTickInterval = null;
  let toastTimer = null;
  let dialTimeout = null;

  // DOM Elements
  const el = {
    screenHub: document.getElementById("screen-hub"),
    screenIncoming: document.getElementById("screen-incoming"),
    screenIncall: document.getElementById("screen-incall"),
    btnDownloadApk: document.getElementById("btn-download-apk"),

    labelCurrentVoice: document.getElementById("label-current-voice"),
    labelCurrentRingtone: document.getElementById("label-current-ringtone"),
    tileVoiceSub: document.getElementById("tile-voice-sub"),
    tileRingSub: document.getElementById("tile-ring-sub"),

    btnIncomingNow: document.getElementById("btn-incoming-now"),
    btnOutboundCall: document.getElementById("btn-outbound-call"),

    scheduledBanner: document.getElementById("scheduled-banner"),
    schedCountdownText: document.getElementById("sched-countdown-text"),
    schedReasonText: document.getElementById("sched-reason-text"),
    btnCancelSchedule: document.getElementById("btn-cancel-schedule"),

    btnHubVoice: document.getElementById("btn-hub-voice"),
    hubMicLabel: document.getElementById("hub-mic-label"),
    hubVoiceFeedback: document.getElementById("hub-voice-feedback"),

    hwCountBadge: document.getElementById("hw-count-badge"),
    hwList: document.getElementById("hw-list"),
    overlayHwList: document.getElementById("overlay-hw-list"),
    btnVoiceAddHw: document.getElementById("btn-voice-add-hw"),
    btnReadAllHw: document.getElementById("btn-read-all-hw"),
    btnVoiceSchedule: document.getElementById("btn-voice-schedule"),

    incomingReason: document.getElementById("incoming-reason"),
    incomingVoicePill: document.getElementById("incoming-voice-pill"),
    btnAnswerCall: document.getElementById("btn-answer-call"),
    btnDeclineCall: document.getElementById("btn-decline-call"),
    btnSnoozeCall: document.getElementById("btn-snooze-call"),

    incallVoiceBadge: document.getElementById("incall-voice-badge"),
    incallTimer: document.getElementById("incall-timer"),
    incallStateLabel: document.getElementById("incall-state-label"),
    voiceVisualizer: document.getElementById("voice-visualizer"),
    captionSpeaker: document.getElementById("caption-speaker"),
    captionText: document.getElementById("caption-text"),
    incallNewsStrip: document.getElementById("incall-news-strip"),

    btnCallPushToTalk: document.getElementById("btn-call-pushtotalk"),
    labelPushToTalk: document.getElementById("label-pushtotalk"),
    btnCallMute: document.getElementById("btn-call-mute"),
    icoMute: document.getElementById("ico-mute"),
    labelMute: document.getElementById("label-mute"),
    btnCallSpeaker: document.getElementById("btn-call-speaker"),
    btnCallVoice: document.getElementById("btn-call-voice"),
    btnCallHw: document.getElementById("btn-call-hw"),
    btnCallNews: document.getElementById("btn-call-news"),
    btnHangupCall: document.getElementById("btn-hangup-call"),

    sheetBackdrop: document.getElementById("sheet-backdrop"),
    sheetVoices: document.getElementById("sheet-voices"),
    sheetRingtones: document.getElementById("sheet-ringtones"),
    sheetHwOverlay: document.getElementById("sheet-hw-overlay"),
    sheetNewsOverlay: document.getElementById("sheet-news-overlay"),
    voicesList: document.getElementById("voices-list"),
    speedPills: document.getElementById("speed-pills"),
    ringtonesList: document.getElementById("ringtones-list"),
    overlayNewsList: document.getElementById("overlay-news-list"),

    toast: document.getElementById("toast")
  };

  // =========================================================
  // Persistence (LocalStorage + Native Android SharedPreferences)
  // =========================================================
  function loadPersistedState() {
    let raw = null;
    if (window.YosaNative && typeof window.YosaNative.loadData === "function") {
      try {
        raw = window.YosaNative.loadData(STORAGE_KEY);
      } catch (_) {}
    }
    if (!raw) {
      try {
        raw = localStorage.getItem(STORAGE_KEY);
      } catch (_) {}
    }
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.voiceId) state.voiceId = parsed.voiceId;
        if (parsed.speedId) state.speedId = parsed.speedId;
        if (parsed.ringtoneId) state.ringtoneId = parsed.ringtoneId;
        if (Array.isArray(parsed.homeworks)) state.homeworks = parsed.homeworks;
      } catch (_) {}
    }
  }

  function savePersistedState() {
    const data = JSON.stringify({
      voiceId: state.voiceId,
      speedId: state.speedId,
      ringtoneId: state.ringtoneId,
      homeworks: state.homeworks
    });
    try {
      localStorage.setItem(STORAGE_KEY, data);
    } catch (_) {}
    if (window.YosaNative && typeof window.YosaNative.saveData === "function") {
      try {
        window.YosaNative.saveData(STORAGE_KEY, data);
      } catch (_) {}
    }
  }

  function showToast(msg) {
    if (!el.toast) return;
    el.toast.textContent = msg;
    el.toast.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.add("hidden");
    }, 3000);
  }

  function formatMMSS(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // =========================================================
  // Screen & Sheet Navigation
  // =========================================================
  function showScreen(name) {
    el.screenHub.classList.toggle("active", name === "hub");
    el.screenIncoming.classList.toggle("active", name === "incoming");
    el.screenIncall.classList.toggle("active", name === "incall");
  }

  function openSheet(sheetEl) {
    closeAllSheets();
    el.sheetBackdrop.classList.remove("hidden");
    sheetEl.classList.remove("hidden");
  }

  function closeAllSheets() {
    el.sheetBackdrop.classList.add("hidden");
    [el.sheetVoices, el.sheetRingtones, el.sheetHwOverlay, el.sheetNewsOverlay].forEach((s) =>
      s.classList.add("hidden")
    );
  }

  // =========================================================
  // Render Preferences, Voices, Ringtones & Homeworks
  // =========================================================
  function renderPrefsLabels() {
    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    const ring =
      YosaRingtones.RINGTONES.find((r) => r.id === state.ringtoneId) ||
      YosaRingtones.RINGTONES[0];

    el.labelCurrentVoice.textContent = voice.name;
    el.labelCurrentRingtone.textContent = ring.name.replace(" Zili", "");
    el.tileVoiceSub.textContent = `Aktif: ${voice.name} (${voice.role.split(" ")[0]})`;
    el.tileRingSub.textContent = `Aktif: ${ring.name}`;
    el.incallVoiceBadge.textContent = `Ses: ${voice.name}`;
  }

  function renderVoicesSheet() {
    el.speedPills.innerHTML = "";
    for (const sp of YosaSpeech.SPEED_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "speed-pill" + (state.speedId === sp.id ? " active" : "");
      btn.textContent = sp.label;
      btn.onclick = () => {
        state.speedId = sp.id;
        savePersistedState();
        renderVoicesSheet();
        showToast(`Konuşma hızı: ${sp.label}`);
      };
      el.speedPills.appendChild(btn);
    }

    el.voicesList.innerHTML = "";
    for (const v of YosaSpeech.VOICES) {
      const row = document.createElement("div");
      row.className = "option-item" + (state.voiceId === v.id ? " selected" : "");

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className = "opt-main";
      mainBtn.innerHTML = `<strong>${v.name} ${state.voiceId === v.id ? "✓" : ""}</strong><span>${v.role}</span>`;
      mainBtn.onclick = () => {
        state.voiceId = v.id;
        savePersistedState();
        renderPrefsLabels();
        renderVoicesSheet();
        showToast(`${v.name} sesi seçildi`);
      };

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "preview-btn";
      prevBtn.textContent = "▶ Dinle";
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        YosaRingtones.ensureContext();
        prevBtn.textContent = "🔊 Konuşuyor";
        YosaSpeech.speak(v.sample, {
          voiceId: v.id,
          speedId: state.speedId,
          onEnd: () => {
            prevBtn.textContent = "▶ Dinle";
          }
        });
      };

      row.appendChild(mainBtn);
      row.appendChild(prevBtn);
      el.voicesList.appendChild(row);
    }
  }

  function renderRingtonesSheet() {
    el.ringtonesList.innerHTML = "";
    for (const r of YosaRingtones.RINGTONES) {
      const row = document.createElement("div");
      row.className = "option-item" + (state.ringtoneId === r.id ? " selected" : "");

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className = "opt-main";
      mainBtn.innerHTML = `<strong>${r.name} ${state.ringtoneId === r.id ? "✓" : ""}</strong><span>${r.subtitle}</span>`;
      mainBtn.onclick = () => {
        state.ringtoneId = r.id;
        savePersistedState();
        renderPrefsLabels();
        renderRingtonesSheet();
        showToast(`Zil sesi: ${r.name}`);
      };

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "preview-btn";
      prevBtn.textContent = "🔔 Çaldır";
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        YosaRingtones.ensureContext();
        prevBtn.textContent = "⏹ Durdur";
        YosaRingtones.previewRingtone(r.id, () => {
          prevBtn.textContent = "🔔 Çaldır";
        });
      };

      row.appendChild(mainBtn);
      row.appendChild(prevBtn);
      el.ringtonesList.appendChild(row);
    }
  }

  function addHomeworkItem(hw) {
    const entry = {
      id: "hw_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      subject: hw.subject || "Genel Ödev",
      icon: hw.icon || "📚",
      color: hw.color || "#10b981",
      due: hw.due || "Yakında",
      task: hw.task || "Ödev çalışması",
      completed: false,
      createdAt: Date.now()
    };
    state.homeworks.unshift(entry);
    savePersistedState();
    renderHomeworkLists();
    return entry;
  }

  function renderHomeworkLists() {
    const pendingCount = state.homeworks.filter((h) => !h.completed).length;
    el.hwCountBadge.textContent = String(pendingCount);

    const buildInto = (container) => {
      if (!container) return;
      container.innerHTML = "";
      if (state.homeworks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "hw-empty";
        empty.innerHTML =
          'Henüz kayıtlı ödev yok.<br/><strong>"Matematik ödevimi kaydet Cuma gününe sayfa 48"</strong> gibi sesle söyleyebilirsin.';
        container.appendChild(empty);
        return;
      }

      for (const item of state.homeworks) {
        const card = document.createElement("div");
        card.className = "hw-card" + (item.completed ? " done" : "");

        const checkBtn = document.createElement("button");
        checkBtn.type = "button";
        checkBtn.className = "hw-check-btn";
        checkBtn.textContent = item.completed ? "✓" : "";
        checkBtn.onclick = () => {
          item.completed = !item.completed;
          savePersistedState();
          renderHomeworkLists();
          showToast(item.completed ? "Ödev tamamlandı! 🎉" : "Ödev bekleyenlere alındı");
        };

        const body = document.createElement("div");
        body.className = "hw-body";
        body.innerHTML = `
          <div class="hw-top-row">
            <span class="hw-subj">${item.icon || "📚"} ${item.subject}</span>
            <span class="hw-due">${item.due}</span>
          </div>
          <div class="hw-task"></div>
        `;
        body.querySelector(".hw-task").textContent = item.task;

        const actions = document.createElement("div");
        actions.className = "hw-actions";

        const readBtn = document.createElement("button");
        readBtn.type = "button";
        readBtn.className = "hw-icon-btn";
        readBtn.textContent = "🔊";
        readBtn.title = "Sesli Oku";
        readBtn.onclick = () => {
          YosaSpeech.speak(
            `${item.subject} ödevin, teslim zamanı ${item.due}. Konu: ${item.task}`,
            { voiceId: state.voiceId, speedId: state.speedId }
          );
        };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "hw-icon-btn";
        delBtn.textContent = "🗑️";
        delBtn.title = "Sil";
        delBtn.onclick = () => {
          state.homeworks = state.homeworks.filter((h) => h.id !== item.id);
          savePersistedState();
          renderHomeworkLists();
          showToast("Ödev silindi");
        };

        actions.appendChild(readBtn);
        actions.appendChild(delBtn);

        card.appendChild(checkBtn);
        card.appendChild(body);
        card.appendChild(actions);
        container.appendChild(card);
      }
    };

    buildInto(el.hwList);
    buildInto(el.overlayHwList);
  }

  function renderNewsSources(articles) {
    state.lastArticles = articles || [];
    if (!articles || articles.length === 0) {
      el.incallNewsStrip.classList.add("hidden");
      el.overlayNewsList.innerHTML =
        '<div class="hw-empty">Henüz haber sorgulanmadı. Arama sırasında "Galatasaray maçını özetle" veya "Gündemde ne var?" diye sorabilirsin.</div>';
      return;
    }

    el.incallNewsStrip.innerHTML = "";
    el.incallNewsStrip.classList.remove("hidden");
    for (const art of articles.slice(0, 5)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "news-mini-badge";
      chip.textContent = `📰 ${art.source}: ${art.title}`;
      chip.onclick = () => openSheet(el.sheetNewsOverlay);
      el.incallNewsStrip.appendChild(chip);
    }

    el.overlayNewsList.innerHTML = "";
    for (const art of articles) {
      const div = document.createElement("div");
      div.className = "news-card-item";
      const src = document.createElement("div");
      src.className = "news-card-source";
      src.textContent = art.source;
      const ttl = document.createElement("div");
      ttl.className = "news-card-title";
      ttl.textContent = art.title;
      div.appendChild(src);
      div.appendChild(ttl);
      el.overlayNewsList.appendChild(div);
    }
  }

  // =========================================================
  // Scheduled Call Manager ("Beni Arasın")
  // =========================================================
  function scheduleIncomingCall(seconds, reason) {
    cancelScheduledCall(false);
    const delaySec = Math.max(3, Math.round(seconds));
    state.scheduledAt = Date.now() + delaySec * 1000;
    state.scheduledReason = reason || "Zamanlı Yosa AI Araması";

    // Also register Native Android AlarmManager wake trigger if inside APK
    if (window.YosaNative && typeof window.YosaNative.scheduleCall === "function") {
      try {
        window.YosaNative.scheduleCall(delaySec, state.scheduledReason);
      } catch (_) {}
    }

    updateScheduleBanner();
    el.scheduledBanner.classList.remove("hidden");

    scheduleTickInterval = setInterval(() => {
      const remSec = Math.ceil((state.scheduledAt - Date.now()) / 1000);
      if (remSec <= 0) {
        const r = state.scheduledReason;
        cancelScheduledCall(false);
        if (state.callState === "idle") {
          triggerIncomingCall(r);
        }
        return;
      }
      updateScheduleBanner();
    }, 500);

    showToast(`⏰ ${delaySec < 60 ? delaySec + " sn" : Math.round(delaySec / 60) + " dk"} sonra Yosa seni arayacak!`);
  }

  function updateScheduleBanner() {
    if (!state.scheduledAt) return;
    const remSec = Math.max(0, Math.ceil((state.scheduledAt - Date.now()) / 1000));
    el.schedCountdownText.textContent = `${formatMMSS(remSec)} sonra Yosa AI seni arayacak`;
    el.schedReasonText.textContent = state.scheduledReason;
  }

  function cancelScheduledCall(notify = true) {
    if (scheduleTickInterval) {
      clearInterval(scheduleTickInterval);
      scheduleTickInterval = null;
    }
    state.scheduledAt = null;
    el.scheduledBanner.classList.add("hidden");
    if (window.YosaNative && typeof window.YosaNative.cancelScheduledCall === "function") {
      try {
        window.YosaNative.cancelScheduledCall();
      } catch (_) {}
    }
    if (notify) showToast("Zamanlı arama iptal edildi");
  }

  // Exposed for Native Android CallAlarmReceiver wakeup
  window.__yosaTriggerIncomingCall = function (reason) {
    cancelScheduledCall(false);
    if (state.callState === "idle") {
      triggerIncomingCall(reason || "Zamanlı Yosa AI Araması");
    }
  };

  // =========================================================
  // Realistic Telephony State Machine (Incoming / Outbound / Active)
  // =========================================================
  function setVisualizerMode(mode, labelText) {
    el.voiceVisualizer.className = "voice-visualizer " + mode;
    if (labelText) el.incallStateLabel.textContent = labelText;
  }

  function setCaption(speaker, text) {
    el.captionSpeaker.textContent = speaker;
    el.captionText.textContent = text;
  }

  function triggerIncomingCall(reason = "Sesli Asistan Araması", autoPrompt = null) {
    YosaSpeech.stopSpeaking();
    YosaSpeech.stopListening();
    closeAllSheets();

    state.callState = "incoming";
    state.callReason = reason;
    state.callStartPrompt = autoPrompt;

    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    const ring =
      YosaRingtones.RINGTONES.find((r) => r.id === state.ringtoneId) ||
      YosaRingtones.RINGTONES[0];

    el.incomingReason.textContent = reason;
    el.incomingVoicePill.textContent = `Ses: ${voice.name} • ${ring.name}`;

    showScreen("incoming");
    YosaRingtones.startRingtone(state.ringtoneId, true);
  }

  function startOutboundCall(initialUserQuestion = null) {
    YosaRingtones.ensureContext();
    YosaSpeech.stopSpeaking();
    YosaSpeech.stopListening();
    closeAllSheets();

    state.callState = "dialing";
    state.callReason = "Giden Sesli Arama";
    state.callStartPrompt = initialUserQuestion;
    state.callSeconds = 0;
    state.history = [];
    renderNewsSources([]);
    renderPrefsLabels();

    el.incallTimer.textContent = "Aranıyor...";
    setVisualizerMode("thinking", "Çalıyor...");
    setCaption("Telefon", "Yosa AI aranıyor...");
    showScreen("incall");

    YosaRingtones.startDialbackTone();

    clearTimeout(dialTimeout);
    dialTimeout = setTimeout(() => {
      if (state.callState !== "dialing") return;
      YosaRingtones.stopDialbackTone();
      enterActiveCall();
    }, 1850);
  }

  function answerIncomingCall() {
    if (state.callState !== "incoming") return;
    YosaRingtones.ensureContext();
    YosaRingtones.stopRingtone();
    enterActiveCall();
  }

  function enterActiveCall() {
    state.callState = "active";
    state.callSeconds = 0;
    state.history = [];
    YosaRingtones.playCallConnectedTone();
    showScreen("incall");
    renderPrefsLabels();

    el.incallTimer.textContent = "00:00";
    clearInterval(callTimerInterval);
    callTimerInterval = setInterval(() => {
      state.callSeconds++;
      el.incallTimer.textContent = formatMMSS(state.callSeconds);
    }, 1000);

    // If launched from a quick topic chip ("Galatasaray maçını özetle"), answer it right after a quick "Alo!"
    if (state.callStartPrompt) {
      const q = state.callStartPrompt;
      state.callStartPrompt = null;
      handleUserTurnInCall(q);
      return;
    }

    // Contextual proactive greeting based on why Yosa called
    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    const pending = state.homeworks.filter((h) => !h.completed);

    if (state.callReason.toLowerCase().includes("haber") || state.callReason.toLowerCase().includes("gündem")) {
      speakInCall(
        `Alo! Merhaba, ben Yosa ${voice.name}. Gündem özeti araması için seni aradım, Google News başlıklarını hemen kontrol ediyorum.`,
        () => {
          handleUserTurnInCall("Bugün gündemde ne var?");
        }
      );
      return;
    }

    if (state.callReason.toLowerCase().includes("ödev")) {
      const msg =
        pending.length > 0
          ? `Alo! Merhaba, ben Yosa ${voice.name}. Seni ödev kontrolü için aradım. Şu an bekleyen ${pending.length} ödevin var, ilk sırada ${pending[0].subject} ödevin görünüyor. Detayları okumamı ya da yeni ödev eklememi ister misin?`
          : `Alo! Merhaba, ben Yosa ${voice.name}. Ödev kontrolü için aradım ama bekleyen hiç ödevin kalmamış, harikasın! Yeni bir ödev kaydetmek ya da haberleri dinlemek ister misin?`;
      speakInCall(msg);
      return;
    }

    const greet =
      pending.length > 0
        ? `Alo! Merhaba, ben Yosa ${voice.name}. Seni dinliyorum! İstediğin maç veya gündem haberini sorabilir ya da bekleyen ${pending.length} ödevini yönetebilirsin.`
        : `Alo! Merhaba, ben Yosa ${voice.name}. Seni dinliyorum! Örneğin Galatasaray maçını özetle diyebilir veya ödevlerini sesle kaydettirebilirsin.`;
    speakInCall(greet);
  }

  function endCall() {
    clearTimeout(dialTimeout);
    clearInterval(callTimerInterval);
    callTimerInterval = null;

    YosaRingtones.stopRingtone();
    YosaRingtones.stopDialbackTone();
    YosaSpeech.stopSpeaking();
    YosaSpeech.stopListening();

    if (state.callState === "active" || state.callState === "dialing") {
      YosaRingtones.playCallEndedTone();
    }

    state.callState = "idle";
    closeAllSheets();
    showScreen("hub");
    renderHomeworkLists();
  }

  function speakInCall(text, customAfterSpeak = null) {
    if (state.callState !== "active") return;
    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    setVisualizerMode("speaking", `${voice.name} konuşuyor...`);
    setCaption(`Yosa AI (${voice.name})`, text);
    el.labelPushToTalk.textContent = "Sözünü Kes";

    YosaSpeech.speak(text, {
      voiceId: state.voiceId,
      speedId: state.speedId,
      onStart: () => {
        if (state.callState === "active") {
          setVisualizerMode("speaking", `${voice.name} konuşuyor...`);
        }
      },
      onEnd: () => {
        if (state.callState !== "active") return;
        el.labelPushToTalk.textContent = "Konuş";
        if (typeof customAfterSpeak === "function") {
          customAfterSpeak();
          return;
        }
        if (!state.isMuted) {
          listenInCall();
        } else {
          setVisualizerMode("idle", "Mikrofon sessizde");
        }
      }
    });
  }

  function listenInCall() {
    if (state.callState !== "active" || state.isMuted) return;
    YosaRingtones.playListeningCue();
    setVisualizerMode("listening", "Seni dinliyorum... Konuşabilirsin");
    el.labelPushToTalk.textContent = "Dinleniyor";

    YosaSpeech.startListening({
      onStart: () => {
        if (state.callState === "active") {
          setVisualizerMode("listening", "Seni dinliyorum... Konuşabilirsin");
        }
      },
      onPartial: (partial) => {
        if (state.callState === "active") {
          setCaption("Sen (Canlı Ses)", partial);
        }
      },
      onResult: (finalText) => {
        if (state.callState !== "active") return;
        el.labelPushToTalk.textContent = "Konuş";
        handleUserTurnInCall(finalText);
      },
      onError: (err) => {
        if (state.callState !== "active") return;
        el.labelPushToTalk.textContent = "Konuş";
        if (err === "no-speech") {
          setVisualizerMode("idle", "Tekrar konuşmak için 'Konuş' tuşuna dokun");
          // Gently re-arm listening once after short pause if still active
          setTimeout(() => {
            if (
              state.callState === "active" &&
              !state.isMuted &&
              !YosaSpeech.isSpeaking() &&
              !YosaSpeech.isListening()
            ) {
              listenInCall();
            }
          }, 1600);
        } else if (err === "unsupported") {
          setVisualizerMode("idle", "Üstteki hazır sesli konulara dokunabilirsin");
          showToast("Bu tarayıcıda ses tanıma yok; APK içinde tam çalışır!");
        } else {
          setVisualizerMode("idle", "Konuşmak için 'Konuş' tuşuna dokun");
        }
      }
    });
  }

  async function executeStructuredAction(action) {
    if (!action) return null;

    if (action.type === "add_homework") {
      addHomeworkItem(action.homework);
      showToast(`📚 ${action.homework.subject} ödevi kaydedildi!`);
      return null;
    }

    if (action.type === "complete_homework") {
      const target = state.homeworks.find(
        (h) =>
          !h.completed &&
          (h.subject.toLocaleLowerCase("tr-TR") === action.subject.toLocaleLowerCase("tr-TR") ||
            action.subject === "Genel Ödev")
      );
      if (target) {
        target.completed = true;
        savePersistedState();
        renderHomeworkLists();
        return `Harika! ${target.subject} ödevini tamamlandı olarak işaretledim, ellerine sağlık!`;
      }
      return "Tamamlanacak bekleyen bir ödev bulamadım ama istersen yeni ödev ekleyebiliriz.";
    }

    if (action.type === "delete_homework") {
      if (action.all) {
        state.homeworks = [];
        savePersistedState();
        renderHomeworkLists();
        return "Tüm kayıtlı ödevlerini temizledim.";
      }
      const idx = state.homeworks.findIndex(
        (h) => h.subject.toLocaleLowerCase("tr-TR") === action.subject.toLocaleLowerCase("tr-TR")
      );
      if (idx !== -1) {
        const removed = state.homeworks.splice(idx, 1)[0];
        savePersistedState();
        renderHomeworkLists();
        return `${removed.subject} ödevini listeden sildim.`;
      }
      if (state.homeworks.length > 0) {
        const removed = state.homeworks.shift();
        savePersistedState();
        renderHomeworkLists();
        return `Son eklenen ${removed.subject} ödevini sildim.`;
      }
      return "Silinecek kayıtlı bir ödev görünmüyor.";
    }

    if (action.type === "switch_voice") {
      const voices = YosaSpeech.VOICES;
      let nextId = action.voiceId;
      if (!nextId) {
        const curIdx = voices.findIndex((v) => v.id === state.voiceId);
        nextId = voices[(curIdx + 1) % voices.length].id;
      }
      state.voiceId = nextId;
      savePersistedState();
      renderPrefsLabels();
      const newV = YosaSpeech.getVoiceProfile(nextId);
      return `Merhaba! Sesimi ${newV.name} olarak değiştirdim. Şimdi bu sesle devam ediyoruz!`;
    }

    if (action.type === "schedule_call") {
      scheduleIncomingCall(action.seconds, action.reason);
      return "hangup_after_speak";
    }

    if (action.type === "hangup") {
      return "hangup_after_speak";
    }

    return null;
  }

  async function handleUserTurnInCall(userText) {
    if (!userText || state.callState !== "active") return;
    YosaSpeech.stopListening();
    YosaSpeech.stopSpeaking();

    setCaption("Sen", userText);
    setVisualizerMode("thinking", "Yosa düşünüyor...");

    const voice = YosaSpeech.getVoiceProfile(state.voiceId);

    const result = await YosaBrain.generateVoiceResponse({
      userText,
      history: state.history,
      homeworks: state.homeworks,
      voiceName: voice.name,
      onStatus: (st) => {
        if (state.callState === "active") {
          setVisualizerMode("thinking", st);
        }
      }
    });

    if (state.callState !== "active") return;

    if (result.articles && result.articles.length > 0) {
      renderNewsSources(result.articles);
    }

    const actionOverrideReply = await executeStructuredAction(result.action);
    const shouldHangup = actionOverrideReply === "hangup_after_speak";
    const finalReply =
      actionOverrideReply && actionOverrideReply !== "hangup_after_speak"
        ? actionOverrideReply
        : result.reply;

    state.history.push({ role: "user", content: userText });
    state.history.push({ role: "assistant", content: finalReply });

    speakInCall(finalReply, shouldHangup ? () => setTimeout(endCall, 450) : null);
  }

  // =========================================================
  // Hub Outside-Call Voice Capture (Homework / Timer / General)
  // =========================================================
  function startHubVoiceCapture(mode) {
    YosaRingtones.ensureContext();
    if (YosaSpeech.isListening()) {
      YosaSpeech.stopListening();
      resetHubMicButtons();
      return;
    }

    state.activeHubMicMode = mode;
    YosaRingtones.playListeningCue();

    if (mode === "homework") {
      el.btnVoiceAddHw.classList.add("listening");
      el.btnVoiceAddHw.innerHTML = "<span>🎙️</span><span>Dinleniyor... Ödevini Söyle</span>";
    } else {
      el.btnHubVoice.classList.add("listening");
      el.hubMicLabel.textContent =
        mode === "schedule"
          ? 'Dinleniyor... Örn: "1 dakika sonra ara"'
          : "Dinleniyor... Sorunu Söyle";
    }

    el.hubVoiceFeedback.classList.remove("hidden");
    el.hubVoiceFeedback.textContent = "🎙️ Seni dinliyorum...";

    YosaSpeech.startListening({
      onPartial: (txt) => {
        el.hubVoiceFeedback.textContent = `🗣️ "${txt}"`;
      },
      onResult: async (finalText) => {
        resetHubMicButtons();
        el.hubVoiceFeedback.textContent = `🗣️ "${finalText}" — İşleniyor...`;

        if (mode === "homework") {
          const hw = YosaBrain.extractHomeworkDetails(finalText);
          addHomeworkItem(hw);
          const msg = `${hw.subject} ödevin (${hw.due}) kaydedildi: ${hw.task}`;
          el.hubVoiceFeedback.textContent = `✅ ${msg}`;
          YosaSpeech.speak(msg, { voiceId: state.voiceId, speedId: state.speedId });
          return;
        }

        if (mode === "schedule") {
          const intent = YosaBrain.detectVoiceIntent(
            finalText.includes("ara") ? finalText : finalText + " sonra beni ara"
          );
          const secs = intent.seconds || 60;
          scheduleIncomingCall(secs, intent.reason || "Zamanlı Yosa AI Araması");
          const msg = `Tamamdır! ${secs < 60 ? secs + " saniye" : Math.round(secs / 60) + " dakika"} sonra seni arayacağım.`;
          el.hubVoiceFeedback.textContent = `⏰ ${msg}`;
          YosaSpeech.speak(msg, { voiceId: state.voiceId, speedId: state.speedId });
          return;
        }

        // General Hub Voice Command
        const voice = YosaSpeech.getVoiceProfile(state.voiceId);
        const res = await YosaBrain.generateVoiceResponse({
          userText: finalText,
          history: [],
          homeworks: state.homeworks,
          voiceName: voice.name,
          onStatus: (st) => {
            el.hubVoiceFeedback.textContent = `⏳ ${st}`;
          }
        });

        const override = await executeStructuredAction(res.action);
        const reply =
          override && override !== "hangup_after_speak" ? override : res.reply;
        el.hubVoiceFeedback.textContent = `🤖 Yosa: ${reply}`;
        YosaSpeech.speak(reply, { voiceId: state.voiceId, speedId: state.speedId });
      },
      onError: (err) => {
        resetHubMicButtons();
        el.hubVoiceFeedback.textContent =
          err === "unsupported"
            ? "Bu tarayıcıda ses tanıma desteklenmiyor; Yosa-AI.apk içinde doğrudan çalışır veya alttaki örnek ses tuşlarına dokunabilirsin."
            : "Ses duyulamadı, tekrar dokunup konuşabilirsin.";
      }
    });
  }

  function resetHubMicButtons() {
    state.activeHubMicMode = null;
    el.btnHubVoice.classList.remove("listening");
    el.hubMicLabel.textContent = "Konuşmak İçin Dokun";
    el.btnVoiceAddHw.classList.remove("listening");
    el.btnVoiceAddHw.innerHTML = "<span>🎙️</span><span>Sesle Yeni Ödev Kaydet</span>";
  }

  // =========================================================
  // Event Listeners Initialization
  // =========================================================
  function init() {
    // Hide APK download button if already running inside the Native Android APK!
    if (window.YosaNative) {
      el.btnDownloadApk.classList.add("hidden");
    }

    loadPersistedState();
    renderPrefsLabels();
    renderHomeworkLists();
    renderNewsSources([]);

    // Primary Call Buttons
    el.btnIncomingNow.onclick = () => {
      YosaRingtones.ensureContext();
      triggerIncomingCall("Yosa AI Gelen Arama");
    };

    el.btnOutboundCall.onclick = () => {
      startOutboundCall(null);
    };

    // Quick Try Pills on Hub -> Places live call asking that question!
    document.querySelectorAll("[data-quick-call]").forEach((btn) => {
      btn.onclick = () => {
        const q = btn.getAttribute("data-quick-call");
        startOutboundCall(q);
      };
    });

    // Scheduled Call Preset Buttons
    document.querySelectorAll(".timer-btn[data-sec]").forEach((btn) => {
      btn.onclick = () => {
        YosaRingtones.ensureContext();
        const sec = parseInt(btn.getAttribute("data-sec"), 10);
        const reason = btn.getAttribute("data-reason");
        scheduleIncomingCall(sec, reason);
      };
    });

    el.btnCancelSchedule.onclick = () => cancelScheduledCall(true);
    el.btnVoiceSchedule.onclick = () => startHubVoiceCapture("schedule");
    el.btnHubVoice.onclick = () => startHubVoiceCapture("general");
    el.btnVoiceAddHw.onclick = () => startHubVoiceCapture("homework");

    el.btnReadAllHw.onclick = () => {
      YosaRingtones.ensureContext();
      const pending = state.homeworks.filter((h) => !h.completed);
      if (pending.length === 0) {
        showToast("Bekleyen ödevin yok!");
        YosaSpeech.speak("Şu an bekleyen hiçbir ödevin yok.", {
          voiceId: state.voiceId,
          speedId: state.speedId
        });
        return;
      }
      const text =
        `Toplam ${pending.length} bekleyen ödevin var. ` +
        pending.map((h, i) => `${i + 1}. ${h.subject}, ${h.due}: ${h.task}`).join(". ");
      YosaSpeech.speak(text, { voiceId: state.voiceId, speedId: state.speedId });
    };

    // Incoming Call Screen Buttons
    el.btnAnswerCall.onclick = answerIncomingCall;
    el.btnDeclineCall.onclick = endCall;
    el.btnSnoozeCall.onclick = () => {
      const r = state.callReason;
      endCall();
      scheduleIncomingCall(60, r);
    };

    // Active In-Call Controls
    el.btnHangupCall.onclick = endCall;

    el.btnCallPushToTalk.onclick = () => {
      if (state.callState !== "active") return;
      state.isMuted = false;
      updateMuteUI();
      if (YosaSpeech.isSpeaking()) {
        YosaSpeech.stopSpeaking();
      }
      listenInCall();
    };

    el.btnCallMute.onclick = () => {
      state.isMuted = !state.isMuted;
      updateMuteUI();
      if (state.isMuted) {
        YosaSpeech.stopListening();
        if (!YosaSpeech.isSpeaking()) {
          setVisualizerMode("idle", "Mikrofon sessize alındı");
        }
      } else if (!YosaSpeech.isSpeaking()) {
        listenInCall();
      }
    };

    el.btnCallSpeaker.onclick = () => {
      state.speakerOn = !state.speakerOn;
      el.btnCallSpeaker.classList.toggle("active-toggle", state.speakerOn);
      if (window.YosaNative && typeof window.YosaNative.setSpeakerphone === "function") {
        try {
          window.YosaNative.setSpeakerphone(state.speakerOn);
        } catch (_) {}
      }
      showToast(state.speakerOn ? "🔊 Hoparlör açık" : "🔈 Ahize modu");
    };

    el.btnCallVoice.onclick = () => {
      renderVoicesSheet();
      openSheet(el.sheetVoices);
    };

    el.btnCallHw.onclick = () => {
      renderHomeworkLists();
      openSheet(el.sheetHwOverlay);
    };

    el.btnCallNews.onclick = () => {
      openSheet(el.sheetNewsOverlay);
    };

    document.querySelectorAll(".incall-chip[data-say]").forEach((chip) => {
      chip.onclick = () => {
        if (state.callState === "active") {
          handleUserTurnInCall(chip.getAttribute("data-say"));
        }
      };
    });

    // Open Voice & Ringtone Sheets from Hub
    const openVoices = () => {
      renderVoicesSheet();
      openSheet(el.sheetVoices);
    };
    const openRingtones = () => {
      renderRingtonesSheet();
      openSheet(el.sheetRingtones);
    };

    document.getElementById("btn-open-voices").onclick = openVoices;
    document.getElementById("chip-open-voices").onclick = openVoices;
    document.getElementById("btn-open-ringtones").onclick = openRingtones;
    document.getElementById("chip-open-ringtones").onclick = openRingtones;

    el.sheetBackdrop.onclick = () => {
      YosaRingtones.stopRingtone();
      closeAllSheets();
    };
    document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
      btn.onclick = () => {
        if (state.callState !== "incoming") YosaRingtones.stopRingtone();
        closeAllSheets();
      };
    });

    // Check URL or Native Intent if app was opened from a scheduled incoming call alarm!
    const params = new URLSearchParams(window.location.search);
    if (params.get("incoming") === "1") {
      setTimeout(() => {
        triggerIncomingCall(params.get("reason") || "Zamanlı Yosa AI Araması");
      }, 350);
    }
  }

  function updateMuteUI() {
    el.btnCallMute.classList.toggle("muted-toggle", state.isMuted);
    el.icoMute.textContent = state.isMuted ? "🔇" : "🎤";
    el.labelMute.textContent = state.isMuted ? "Sessizde" : "Sessiz";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
