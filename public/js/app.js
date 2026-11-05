// Yosa AI — Liquid Monochrome Telephony, Google News & Homework Controller
(function () {
  const STORAGE_KEY = "yosa_ai_state_v1";

  const SVG_PLAY =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>';
  const SVG_STOP =
    '<svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  const SVG_CHECK =
    '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const SVG_SPEAKER =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
  const SVG_TRASH =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  const SVG_BELL =
    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

  const state = {
    voiceId: "elif",
    speedId: "normal",
    ringtoneId: "ring_yosa",
    homeworks: [],
    callState: "idle",
    callReason: "Sesli Asistan",
    callStartPrompt: null,
    callSeconds: 0,
    isMuted: false,
    speakerOn: true,
    history: [],
    lastArticles: [],
    scheduledAt: null,
    scheduledReason: "",
    activeTab: "assistant"
  };

  let callTimerInterval = null;
  let scheduleTickInterval = null;
  let toastTimer = null;
  let dialTimeout = null;

  const el = {
    screenHub: document.getElementById("screen-hub"),
    screenIncoming: document.getElementById("screen-incoming"),
    screenIncall: document.getElementById("screen-incall"),
    btnDownloadApk: document.getElementById("btn-download-apk"),

    labelCurrentVoice: document.getElementById("label-current-voice"),
    chipOpenVoices: document.getElementById("chip-open-voices"),

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
    labelAddHw: document.getElementById("label-add-hw"),
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
    labelMute: document.getElementById("label-mute"),
    btnCallSpeaker: document.getElementById("btn-call-speaker"),
    btnCallVoice: document.getElementById("btn-call-voice"),
    btnCallHw: document.getElementById("btn-call-hw"),
    btnCallNews: document.getElementById("btn-call-news"),
    btnHangupCall: document.getElementById("btn-hangup-call"),

    sheetBackdrop: document.getElementById("sheet-backdrop"),
    sheetVoices: document.getElementById("sheet-voices"),
    sheetHwOverlay: document.getElementById("sheet-hw-overlay"),
    sheetNewsOverlay: document.getElementById("sheet-news-overlay"),

    voicesList: document.getElementById("voices-list"),
    modalVoicesList: document.getElementById("modal-voices-list"),
    speedPills: document.getElementById("speed-pills"),
    ringtonesList: document.getElementById("ringtones-list"),
    overlayNewsList: document.getElementById("overlay-news-list"),

    toast: document.getElementById("toast")
  };

  // =========================================================
  // Persistence
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
    }, 2600);
  }

  function formatMMSS(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  // =========================================================
  // Navigation (Screens, Tabs, Subviews, Sheets)
  // =========================================================
  function showScreen(name) {
    el.screenHub.classList.toggle("active", name === "hub");
    el.screenIncoming.classList.toggle("active", name === "incoming");
    el.screenIncall.classList.toggle("active", name === "incall");
  }

  function switchTab(tabId) {
    state.activeTab = tabId;
    document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId);
    });
    document.getElementById("tab-assistant").classList.toggle("active", tabId === "assistant");
    document.getElementById("tab-tasks").classList.toggle("active", tabId === "tasks");
    document.getElementById("tab-audio").classList.toggle("active", tabId === "audio");
  }

  function openSheet(sheetEl) {
    closeAllSheets();
    el.sheetBackdrop.classList.remove("hidden");
    sheetEl.classList.remove("hidden");
  }

  function closeAllSheets() {
    el.sheetBackdrop.classList.add("hidden");
    [el.sheetVoices, el.sheetHwOverlay, el.sheetNewsOverlay].forEach((s) =>
      s.classList.add("hidden")
    );
  }

  // =========================================================
  // Studio Renderers (Voices, Ringtones, Homeworks, News)
  // =========================================================
  function renderPrefsLabels() {
    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    el.labelCurrentVoice.textContent = voice.name;
    el.incallVoiceBadge.textContent = `HD • ${voice.name}`;
  }

  function renderVoicesInto(container) {
    if (!container) return;
    container.innerHTML = "";
    for (const v of YosaSpeech.VOICES) {
      const selected = state.voiceId === v.id;
      const row = document.createElement("div");
      row.className = "studio-item" + (selected ? " selected" : "");

      const mono = document.createElement("div");
      mono.className = "monogram";
      mono.textContent = v.name.charAt(0);

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className = "studio-main";
      mainBtn.innerHTML = `<strong>${v.name}</strong><span>${v.role}</span>`;
      mainBtn.onclick = () => {
        state.voiceId = v.id;
        savePersistedState();
        renderPrefsLabels();
        renderAudioStudio();
        showToast(`Ses karakteri: ${v.name}`);
      };

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "play-circle-btn";
      prevBtn.innerHTML = SVG_PLAY;
      prevBtn.title = "Sesini Dinle";
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        YosaRingtones.ensureContext();
        prevBtn.innerHTML = SVG_STOP;
        YosaSpeech.speak(v.sample, {
          voiceId: v.id,
          speedId: state.speedId,
          onEnd: () => {
            prevBtn.innerHTML = SVG_PLAY;
          }
        });
      };

      row.onclick = () => mainBtn.click();
      row.appendChild(mono);
      row.appendChild(mainBtn);
      row.appendChild(prevBtn);
      container.appendChild(row);
    }
  }

  function renderAudioStudio() {
    el.speedPills.innerHTML = "";
    for (const sp of YosaSpeech.SPEED_PRESETS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "speed-chip" + (state.speedId === sp.id ? " active" : "");
      btn.textContent = sp.label;
      btn.onclick = () => {
        state.speedId = sp.id;
        savePersistedState();
        renderAudioStudio();
        showToast(`Konuşma hızı: ${sp.label}`);
      };
      el.speedPills.appendChild(btn);
    }

    renderVoicesInto(el.voicesList);
    renderVoicesInto(el.modalVoicesList);

    el.ringtonesList.innerHTML = "";
    for (const r of YosaRingtones.RINGTONES) {
      const selected = state.ringtoneId === r.id;
      const row = document.createElement("div");
      row.className = "studio-item" + (selected ? " selected" : "");

      const mono = document.createElement("div");
      mono.className = "monogram";
      mono.innerHTML = SVG_BELL;

      const mainBtn = document.createElement("button");
      mainBtn.type = "button";
      mainBtn.className = "studio-main";
      mainBtn.innerHTML = `<strong>${r.name}</strong><span>${r.subtitle}</span>`;
      mainBtn.onclick = () => {
        state.ringtoneId = r.id;
        savePersistedState();
        renderAudioStudio();
        showToast(`Zil sesi: ${r.name}`);
      };

      const prevBtn = document.createElement("button");
      prevBtn.type = "button";
      prevBtn.className = "play-circle-btn";
      prevBtn.innerHTML = SVG_PLAY;
      prevBtn.title = "Zili Dinle";
      prevBtn.onclick = (e) => {
        e.stopPropagation();
        YosaRingtones.ensureContext();
        prevBtn.innerHTML = SVG_STOP;
        YosaRingtones.previewRingtone(r.id, () => {
          prevBtn.innerHTML = SVG_PLAY;
        });
      };

      row.onclick = () => mainBtn.click();
      row.appendChild(mono);
      row.appendChild(mainBtn);
      row.appendChild(prevBtn);
      el.ringtonesList.appendChild(row);
    }
  }

  function addHomeworkItem(hw) {
    const entry = {
      id: "hw_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      subject: hw.subject || "Genel Ödev",
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
        empty.className = "empty-state";
        empty.innerHTML =
          '<strong>Henüz kayıtlı ödev yok</strong>"Matematik ödevimi kaydet Cuma gününe sayfa 48" diyerek sesle ekleyebilirsin.';
        container.appendChild(empty);
        return;
      }

      for (const item of state.homeworks) {
        const row = document.createElement("div");
        row.className = "hw-row" + (item.completed ? " done" : "");

        const checkBtn = document.createElement("button");
        checkBtn.type = "button";
        checkBtn.className = "hw-check";
        checkBtn.innerHTML = item.completed ? SVG_CHECK : "";
        checkBtn.onclick = () => {
          item.completed = !item.completed;
          savePersistedState();
          renderHomeworkLists();
          showToast(item.completed ? "Ödev tamamlandı" : "Bekleyenlere alındı");
        };

        const content = document.createElement("div");
        content.className = "hw-content";
        content.innerHTML = `
          <div class="hw-meta-line">
            <span class="hw-subject-tag"></span>
            <span class="hw-due-tag"></span>
          </div>
          <div class="hw-title"></div>
        `;
        content.querySelector(".hw-subject-tag").textContent = item.subject;
        content.querySelector(".hw-due-tag").textContent = item.due;
        content.querySelector(".hw-title").textContent = item.task;

        const btns = document.createElement("div");
        btns.className = "hw-row-btns";

        const readBtn = document.createElement("button");
        readBtn.type = "button";
        readBtn.className = "subtle-ico-btn";
        readBtn.innerHTML = SVG_SPEAKER;
        readBtn.onclick = () => {
          YosaSpeech.speak(
            `${item.subject} ödevin, teslim ${item.due}. Konu: ${item.task}`,
            { voiceId: state.voiceId, speedId: state.speedId }
          );
        };

        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "subtle-ico-btn";
        delBtn.innerHTML = SVG_TRASH;
        delBtn.onclick = () => {
          state.homeworks = state.homeworks.filter((h) => h.id !== item.id);
          savePersistedState();
          renderHomeworkLists();
          showToast("Ödev silindi");
        };

        btns.appendChild(readBtn);
        btns.appendChild(delBtn);

        row.appendChild(checkBtn);
        row.appendChild(content);
        row.appendChild(btns);
        container.appendChild(row);
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
        '<div class="empty-state"><strong>Henüz haber taranmadı</strong>Görüşme sırasında "Galatasaray maçını özetle" veya "Gündemde ne var?" diye sorabilirsin.</div>';
      return;
    }

    el.incallNewsStrip.innerHTML = "";
    el.incallNewsStrip.classList.remove("hidden");
    for (const art of articles.slice(0, 5)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "news-source-chip";
      chip.textContent = `${art.source} • ${art.title}`;
      chip.onclick = () => openSheet(el.sheetNewsOverlay);
      el.incallNewsStrip.appendChild(chip);
    }

    el.overlayNewsList.innerHTML = "";
    for (const art of articles) {
      const div = document.createElement("div");
      div.className = "news-row-card";
      const src = document.createElement("div");
      src.className = "news-row-src";
      src.textContent = art.source;
      const ttl = document.createElement("div");
      ttl.className = "news-row-ttl";
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
    state.scheduledReason = reason || "Zamanlı Yosa Araması";

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

    showToast(
      `${delaySec < 60 ? delaySec + " sn" : Math.round(delaySec / 60) + " dk"} sonra Yosa seni arayacak`
    );
  }

  function updateScheduleBanner() {
    if (!state.scheduledAt) return;
    const remSec = Math.max(0, Math.ceil((state.scheduledAt - Date.now()) / 1000));
    el.schedCountdownText.textContent = formatMMSS(remSec);
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

  window.__yosaTriggerIncomingCall = function (reason) {
    cancelScheduledCall(false);
    if (state.callState === "idle") {
      triggerIncomingCall(reason || "Zamanlı Yosa Araması");
    }
  };

  // =========================================================
  // Telephony State Machine
  // =========================================================
  function setVisualizerMode(mode, labelText) {
    el.voiceVisualizer.className = "incall-droplet-orb " + mode;
    if (labelText) el.incallStateLabel.textContent = labelText;
  }

  function setCaption(speaker, text) {
    el.captionSpeaker.textContent = speaker.toLocaleUpperCase("tr-TR");
    el.captionText.textContent = text;
  }

  function triggerIncomingCall(reason = "Sesli Asistan", autoPrompt = null) {
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
    el.incomingVoicePill.textContent = `${voice.name} • ${ring.name.replace(" Zili", "")}`;

    showScreen("incoming");
    YosaRingtones.startRingtone(state.ringtoneId, true);
  }

  function startOutboundCall(initialUserQuestion = null) {
    YosaRingtones.ensureContext();
    YosaSpeech.stopSpeaking();
    YosaSpeech.stopListening();
    closeAllSheets();

    state.callState = "dialing";
    state.callReason = "Giden Arama";
    state.callStartPrompt = initialUserQuestion;
    state.callSeconds = 0;
    state.history = [];
    renderNewsSources([]);
    renderPrefsLabels();

    el.incallTimer.textContent = "Aranıyor...";
    setVisualizerMode("thinking", "Çalıyor");
    setCaption("ARAMA", "Yosa AI aranıyor...");
    showScreen("incall");

    YosaRingtones.startDialbackTone();

    clearTimeout(dialTimeout);
    dialTimeout = setTimeout(() => {
      if (state.callState !== "dialing") return;
      YosaRingtones.stopDialbackTone();
      enterActiveCall();
    }, 1750);
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

    if (state.callStartPrompt) {
      const q = state.callStartPrompt;
      state.callStartPrompt = null;
      handleUserTurnInCall(q);
      return;
    }

    const voice = YosaSpeech.getVoiceProfile(state.voiceId);
    const pending = state.homeworks.filter((h) => !h.completed);

    if (
      state.callReason.toLowerCase().includes("haber") ||
      state.callReason.toLowerCase().includes("gündem")
    ) {
      speakInCall(
        `Alo! Merhaba, ben Yosa ${voice.name}. Gündem özeti için seni aradım, Google News başlıklarını hemen aktarıyorum.`,
        () => {
          handleUserTurnInCall("Bugün gündemde ne var?");
        }
      );
      return;
    }

    if (state.callReason.toLowerCase().includes("ödev")) {
      const msg =
        pending.length > 0
          ? `Alo! Merhaba, ben Yosa ${voice.name}. Ödev kontrolü için aradım. Şu an bekleyen ${pending.length} ödevin var, ilk sırada ${pending[0].subject} görünüyor. Okumamı ya da yeni ödev eklememi ister misin?`
          : `Alo! Merhaba, ben Yosa ${voice.name}. Ödev kontrolü için aradım ama bekleyen ödevin kalmamış. Yeni bir ödev kaydetmek ya da haberleri dinlemek ister misin?`;
      speakInCall(msg);
      return;
    }

    const greet =
      pending.length > 0
        ? `Alo! Merhaba, ben Yosa ${voice.name}. Seni dinliyorum. İstediğin maç veya gündem haberini sorabilir ya da bekleyen ${pending.length} ödevini yönetebilirsin.`
        : `Alo! Merhaba, ben Yosa ${voice.name}. Seni dinliyorum. Örneğin Galatasaray maçını özetle diyebilir veya ödevlerini sesle kaydettirebilirsin.`;
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
    setVisualizerMode("speaking", `${voice.name} konuşuyor`);
    setCaption(`YOSA • ${voice.name}`, text);
    el.labelPushToTalk.textContent = "Sözünü Kes";

    YosaSpeech.speak(text, {
      voiceId: state.voiceId,
      speedId: state.speedId,
      onStart: () => {
        if (state.callState === "active") {
          setVisualizerMode("speaking", `${voice.name} konuşuyor`);
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
          setVisualizerMode("idle", "Sessizde");
        }
      }
    });
  }

  function listenInCall() {
    if (state.callState !== "active" || state.isMuted) return;
    YosaRingtones.playListeningCue();
    setVisualizerMode("listening", "Seni dinliyorum");
    el.labelPushToTalk.textContent = "Dinleniyor";

    YosaSpeech.startListening({
      onStart: () => {
        if (state.callState === "active") {
          setVisualizerMode("listening", "Seni dinliyorum");
        }
      },
      onPartial: (partial) => {
        if (state.callState === "active") {
          setCaption("SEN", partial);
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
          setVisualizerMode("idle", "Konuş tuşuna dokunabilirsin");
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
          setVisualizerMode("idle", "Hazır sesli konulara dokunabilirsin");
          showToast("Tarayıcıda ses tanıma yok; APK içinde tam çalışır");
        } else {
          setVisualizerMode("idle", "Konuşmak için dokun");
        }
      }
    });
  }

  async function executeStructuredAction(action) {
    if (!action) return null;

    if (action.type === "add_homework") {
      addHomeworkItem(action.homework);
      showToast(`${action.homework.subject} ödevi kaydedildi`);
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
        return `Harika, ${target.subject} ödevini tamamlandı olarak işaretledim.`;
      }
      return "Tamamlanacak bekleyen bir ödev bulamadım.";
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
        return `${removed.subject} ödevini sildim.`;
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
      renderAudioStudio();
      const newV = YosaSpeech.getVoiceProfile(nextId);
      return `Sesimi ${newV.name} olarak değiştirdim. Şimdi bu sesle devam ediyoruz.`;
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

    setCaption("SEN", userText);
    setVisualizerMode("thinking", "Düşünüyor...");

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
  // Outside-Call Voice Capture (Droplet Tap / Homework / Timer)
  // =========================================================
  function startHubVoiceCapture(mode) {
    YosaRingtones.ensureContext();
    if (YosaSpeech.isListening()) {
      YosaSpeech.stopListening();
      resetHubMicUI();
      return;
    }

    YosaRingtones.playListeningCue();

    if (mode === "homework") {
      el.btnVoiceAddHw.classList.add("listening");
      el.labelAddHw.textContent = "Dinleniyor... Ödevini söyle";
    } else if (mode === "schedule") {
      switchTab("assistant");
      el.btnHubVoice.classList.add("listening");
      el.hubMicLabel.textContent = "Arama zamanını söyle";
      el.hubVoiceFeedback.textContent = 'Örnek: "İki dakika sonra ödev için beni ara"';
    } else {
      el.btnHubVoice.classList.add("listening");
      el.hubMicLabel.textContent = "Seni dinliyorum...";
      el.hubVoiceFeedback.textContent = "Konuşmaya başlayabilirsin";
    }

    YosaSpeech.startListening({
      onPartial: (txt) => {
        if (mode !== "homework") {
          el.hubVoiceFeedback.textContent = txt;
        } else {
          el.labelAddHw.textContent = txt;
        }
      },
      onResult: async (finalText) => {
        resetHubMicUI();

        if (mode === "homework") {
          const hw = YosaBrain.extractHomeworkDetails(finalText);
          addHomeworkItem(hw);
          const msg = `${hw.subject} ödevin (${hw.due}) kaydedildi: ${hw.task}`;
          showToast(`${hw.subject} ödevi eklendi`);
          YosaSpeech.speak(msg, { voiceId: state.voiceId, speedId: state.speedId });
          return;
        }

        if (mode === "schedule") {
          const intent = YosaBrain.detectVoiceIntent(
            finalText.includes("ara") ? finalText : finalText + " sonra beni ara"
          );
          const secs = intent.seconds || 60;
          scheduleIncomingCall(secs, intent.reason || "Zamanlı Yosa Araması");
          const msg = `Tamamdır, ${secs < 60 ? secs + " saniye" : Math.round(secs / 60) + " dakika"} sonra seni arayacağım.`;
          el.hubMicLabel.textContent = "Zamanlı arama kuruldu";
          el.hubVoiceFeedback.textContent = msg;
          YosaSpeech.speak(msg, { voiceId: state.voiceId, speedId: state.speedId });
          return;
        }

        el.hubMicLabel.textContent = "Yanıt hazırlanıyor...";
        el.hubVoiceFeedback.textContent = finalText;

        const voice = YosaSpeech.getVoiceProfile(state.voiceId);
        const res = await YosaBrain.generateVoiceResponse({
          userText: finalText,
          history: [],
          homeworks: state.homeworks,
          voiceName: voice.name,
          onStatus: (st) => {
            el.hubMicLabel.textContent = st;
          }
        });

        const override = await executeStructuredAction(res.action);
        const reply =
          override && override !== "hangup_after_speak" ? override : res.reply;

        el.hubMicLabel.textContent = `Yosa • ${voice.name}`;
        el.hubVoiceFeedback.textContent = reply;
        YosaSpeech.speak(reply, {
          voiceId: state.voiceId,
          speedId: state.speedId,
          onEnd: () => {
            el.hubMicLabel.textContent = "Dokun ve konuş";
          }
        });
      },
      onError: (err) => {
        resetHubMicUI();
        if (err === "unsupported") {
          el.hubVoiceFeedback.textContent =
            "Tarayıcıda ses tanıma yok; Yosa-AI.apk içinde doğrudan çalışır veya alttaki konulara dokunabilirsin.";
        } else {
          showToast("Ses algılanamadı, tekrar dokun");
        }
      }
    });
  }

  function resetHubMicUI() {
    el.btnHubVoice.classList.remove("listening");
    el.hubMicLabel.textContent = "Dokun ve konuş";
    el.btnVoiceAddHw.classList.remove("listening");
    el.labelAddHw.textContent = "Sesle Ödev Kaydet";
  }

  // =========================================================
  // Initialization
  // =========================================================
  function init() {
    if (window.YosaNative) {
      el.btnDownloadApk.classList.add("hidden");
    }

    loadPersistedState();
    renderPrefsLabels();
    renderAudioStudio();
    renderHomeworkLists();
    renderNewsSources([]);

    // Bottom Navigation Tabs
    document.querySelectorAll(".nav-item[data-tab]").forEach((btn) => {
      btn.onclick = () => switchTab(btn.getAttribute("data-tab"));
    });

    // Header Voice Pill -> Jump to Audio tab
    el.chipOpenVoices.onclick = () => switchTab("audio");

    // Segmented Sub-tabs in Tasks Tab
    document.querySelectorAll("[data-task-sub]").forEach((btn) => {
      btn.onclick = () => {
        const sub = btn.getAttribute("data-task-sub");
        document.querySelectorAll("[data-task-sub]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        document.getElementById("subview-hw").classList.toggle("active", sub === "hw");
        document.getElementById("subview-timer").classList.toggle("active", sub === "timer");
      };
    });

    // Segmented Sub-tabs in Audio Tab
    document.querySelectorAll("[data-audio-sub]").forEach((btn) => {
      btn.onclick = () => {
        const sub = btn.getAttribute("data-audio-sub");
        document.querySelectorAll("[data-audio-sub]").forEach((b) =>
          b.classList.toggle("active", b === btn)
        );
        document.getElementById("subview-voices").classList.toggle("active", sub === "voices");
        document
          .getElementById("subview-ringtones")
          .classList.toggle("active", sub === "ringtones");
      };
    });

    // Call Actions
    el.btnIncomingNow.onclick = () => {
      YosaRingtones.ensureContext();
      triggerIncomingCall("Sesli Asistan Araması");
    };

    el.btnOutboundCall.onclick = () => startOutboundCall(null);

    document.querySelectorAll("[data-quick-call]").forEach((btn) => {
      btn.onclick = () => startOutboundCall(btn.getAttribute("data-quick-call"));
    });

    // Scheduled Timers
    document.querySelectorAll(".bento-timer-card[data-sec]").forEach((btn) => {
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
        showToast("Bekleyen ödev yok");
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

    // Incoming Call Screen
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
          setVisualizerMode("idle", "Sessizde");
        }
      } else if (!YosaSpeech.isSpeaking()) {
        listenInCall();
      }
    };

    el.btnCallSpeaker.onclick = () => {
      state.speakerOn = !state.speakerOn;
      el.btnCallSpeaker.classList.toggle("toggled", state.speakerOn);
      if (window.YosaNative && typeof window.YosaNative.setSpeakerphone === "function") {
        try {
          window.YosaNative.setSpeakerphone(state.speakerOn);
        } catch (_) {}
      }
      showToast(state.speakerOn ? "Hoparlör açık" : "Ahize modu");
    };

    el.btnCallVoice.onclick = () => {
      renderAudioStudio();
      openSheet(el.sheetVoices);
    };

    el.btnCallHw.onclick = () => {
      renderHomeworkLists();
      openSheet(el.sheetHwOverlay);
    };

    el.btnCallNews.onclick = () => openSheet(el.sheetNewsOverlay);

    document.querySelectorAll(".glass-chip[data-say]").forEach((chip) => {
      chip.onclick = () => {
        if (state.callState === "active") {
          handleUserTurnInCall(chip.getAttribute("data-say"));
        }
      };
    });

    el.sheetBackdrop.onclick = () => {
      if (state.callState !== "incoming") YosaRingtones.stopRingtone();
      closeAllSheets();
    };
    document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
      btn.onclick = () => {
        if (state.callState !== "incoming") YosaRingtones.stopRingtone();
        closeAllSheets();
      };
    });

    const params = new URLSearchParams(window.location.search);
    if (params.get("incoming") === "1") {
      setTimeout(() => {
        triggerIncomingCall(params.get("reason") || "Zamanlı Yosa Araması");
      }, 350);
    }
  }

  function updateMuteUI() {
    el.btnCallMute.classList.toggle("toggled", state.isMuted);
    el.labelMute.textContent = state.isMuted ? "Sessizde" : "Sessiz";
  }

  document.addEventListener("DOMContentLoaded", init);
})();
