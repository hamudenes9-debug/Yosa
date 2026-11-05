// Yosa AI - Live Google News (TR) + Free Built-in AI + Turkish Voice Intent Engine
(function () {
  let nativeReqCounter = 0;
  const pendingNativeReqs = new Map();

  window.__yosaNativeHttpCallback = function (reqId, status, body) {
    const entry = pendingNativeReqs.get(reqId);
    if (!entry) return;
    pendingNativeReqs.delete(reqId);
    clearTimeout(entry.timer);
    if (status >= 200 && status < 400 && typeof body === "string") {
      entry.resolve(body);
    } else {
      entry.reject(new Error("HTTP " + status));
    }
  };

  function nativeHttp(method, url, jsonBody, timeoutMs = 11000) {
    return new Promise((resolve, reject) => {
      if (!window.YosaNative || typeof window.YosaNative.httpRequest !== "function") {
        reject(new Error("no_native_http"));
        return;
      }
      const reqId = "req_" + ++nativeReqCounter + "_" + Date.now();
      const timer = setTimeout(() => {
        pendingNativeReqs.delete(reqId);
        reject(new Error("native_http_timeout"));
      }, timeoutMs);
      pendingNativeReqs.set(reqId, { resolve, reject, timer });
      try {
        window.YosaNative.httpRequest(reqId, method, url, jsonBody || "");
      } catch (e) {
        clearTimeout(timer);
        pendingNativeReqs.delete(reqId);
        reject(e);
      }
    });
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 9000) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      clearTimeout(id);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.text();
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  function decodeHtmlEntities(str) {
    if (!str) return "";
    const doc = new DOMParser().parseFromString(
      str.replace(/<[^>]+>/g, " "),
      "text/html"
    );
    return (doc.documentElement.textContent || "").replace(/\s+/g, " ").trim();
  }

  function parseRssXml(xmlString) {
    if (!xmlString || typeof xmlString !== "string") return [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");
    const itemNodes = Array.from(doc.querySelectorAll("item"));
    const articles = [];

    for (const node of itemNodes) {
      const rawTitle = node.querySelector("title")?.textContent || "";
      const link = node.querySelector("link")?.textContent || "";
      const pubDateRaw = node.querySelector("pubDate")?.textContent || "";
      const sourceNode = node.querySelector("source")?.textContent || "";
      const descRaw = node.querySelector("description")?.textContent || "";

      // Google News titles usually end with " - Source Name"
      let title = rawTitle.trim();
      let source = sourceNode.trim();
      const dashIdx = title.lastIndexOf(" - ");
      if (dashIdx > 12) {
        if (!source) source = title.slice(dashIdx + 3).trim();
        title = title.slice(0, dashIdx).trim();
      }

      const cleanDesc = decodeHtmlEntities(descRaw);
      const ts = Date.parse(pubDateRaw) || 0;

      if (title) {
        articles.push({
          title: decodeHtmlEntities(title),
          source: source || "Google News",
          pubDate: pubDateRaw,
          timestamp: ts,
          snippet: cleanDesc && cleanDesc !== title ? cleanDesc.slice(0, 220) : "",
          link
        });
      }
    }

    // Sort newest first so sports/match summaries are always fresh
    articles.sort((a, b) => b.timestamp - a.timestamp);

    // Deduplicate near-identical headlines
    const seen = new Set();
    const unique = [];
    for (const art of articles) {
      const key = art.title.toLowerCase().slice(0, 45);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(art);
      }
      if (unique.length >= 8) break;
    }
    return unique;
  }

  async function fetchRawRssUrl(rssUrl) {
    // 1. Inside Android APK: Direct native HTTPS (zero CORS!)
    if (window.YosaNative && typeof window.YosaNative.httpRequest === "function") {
      const xml = await nativeHttp("GET", rssUrl, "", 9500);
      const parsed = parseRssXml(xml);
      if (parsed.length > 0) return parsed;
    }

    // 2. Inside Web Browser Preview: Multi-proxy CORS cascade
    const encoded = encodeURIComponent(rssUrl);
    const proxyRunners = [
      async () => {
        const xml = await fetchWithTimeout(`https://api.allorigins.win/raw?url=${encoded}`, {}, 7500);
        const items = parseRssXml(xml);
        if (!items.length) throw new Error("empty");
        return items;
      },
      async () => {
        const xml = await fetchWithTimeout(`https://api.codetabs.com/v1/proxy?quest=${encoded}`, {}, 7500);
        const items = parseRssXml(xml);
        if (!items.length) throw new Error("empty");
        return items;
      },
      async () => {
        const jsonTxt = await fetchWithTimeout(`https://api.rss2json.com/v1/api.json?rss_url=${encoded}`, {}, 7500);
        const data = JSON.parse(jsonTxt);
        if (!data || !Array.isArray(data.items) || !data.items.length) throw new Error("empty");
        return data.items.slice(0, 8).map((it) => {
          let title = it.title || "";
          let source = it.author || "Google News";
          const dashIdx = title.lastIndexOf(" - ");
          if (dashIdx > 12) {
            source = title.slice(dashIdx + 3).trim();
            title = title.slice(0, dashIdx).trim();
          }
          return {
            title: decodeHtmlEntities(title),
            source,
            pubDate: it.pubDate || "",
            timestamp: Date.parse(it.pubDate || "") || 0,
            snippet: decodeHtmlEntities(it.description || "").slice(0, 200),
            link: it.link || ""
          };
        });
      }
    ];

    for (const runner of proxyRunners) {
      try {
        const res = await runner();
        if (res && res.length > 0) return res;
      } catch (_) {}
    }
    return [];
  }

  function buildGoogleNewsQuery(userText) {
    const lower = userText.toLocaleLowerCase("tr-TR");

    // General top headlines check
    const generalTriggers = [
      "gündemde ne var",
      "bugün ne oldu",
      "son dakika haber",
      "günün haberleri",
      "haberleri anlat",
      "haberleri özetle",
      "türkiye gündemi"
    ];
    if (generalTriggers.some((t) => lower.includes(t))) {
      return {
        isTopHeadlines: true,
        topicLabel: "Türkiye Gündemi",
        urls: ["https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr"]
      };
    }

    // Clean conversational Turkish command words to isolate the search topic
    let cleaned = lower
      .replace(
        /(?:^|\s)(yosa|bana|lütfen|acaba|hakkında|ilgili|bilgi ver|bilgileri|anlat|özetle|özet geç|özeti|nedir|ne oldu|ne durumda|son durum|google news'ten|google newsten|haberleri|haberlerini|söyle|araştır|bakar mısın)(?=\s|$|[.,!?])/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();

    if (!cleaned || cleaned.length < 2) {
      cleaned = userText.trim();
    }

    // Sports / Match enrichment (e.g., "Galatasaray maçını özetle")
    const sportsTeams = [
      "galatasaray",
      "fenerbahçe",
      "fenerbahce",
      "beşiktaş",
      "besiktas",
      "trabzonspor",
      "başakşehir",
      "samsunspor",
      "göztepe",
      "eyüpspor",
      "milli takım",
      "real madrid",
      "barcelona",
      "arsenal",
      "liverpool"
    ];
    const isMatchQuery =
      /\b(maç|mac|maçı|maçını|skor|gol|derbi|lig|şampiyonlar ligi|puan durumu)\b/i.test(lower) ||
      sportsTeams.some((team) => lower.includes(team));

    if (isMatchQuery) {
      const matchedTeam = sportsTeams.find((t) => lower.includes(t));
      const baseTopic = matchedTeam ? `${matchedTeam} maç özeti skor` : `${cleaned} maç sonucu özeti`;
      return {
        isTopHeadlines: false,
        topicLabel: matchedTeam
          ? matchedTeam.charAt(0).toLocaleUpperCase("tr-TR") + matchedTeam.slice(1) + " Maç & Spor"
          : cleaned,
        urls: [
          `https://news.google.com/rss/search?q=${encodeURIComponent(baseTopic + " when:7d")}&hl=tr&gl=TR&ceid=TR:tr`,
          `https://news.google.com/rss/search?q=${encodeURIComponent((matchedTeam || cleaned) + " when:7d")}&hl=tr&gl=TR&ceid=TR:tr`
        ]
      };
    }

    return {
      isTopHeadlines: false,
      topicLabel: cleaned,
      urls: [
        `https://news.google.com/rss/search?q=${encodeURIComponent(cleaned + " when:7d")}&hl=tr&gl=TR&ceid=TR:tr`,
        `https://news.google.com/rss/search?q=${encodeURIComponent(cleaned)}&hl=tr&gl=TR&ceid=TR:tr`
      ]
    };
  }

  async function searchGoogleNews(userText) {
    const plan = buildGoogleNewsQuery(userText);
    for (const url of plan.urls) {
      const items = await fetchRawRssUrl(url);
      if (items && items.length > 0) {
        return { topic: plan.topicLabel, articles: items };
      }
    }
    return { topic: plan.topicLabel, articles: [] };
  }

  // =========================================================================
  // Deterministic Turkish Voice Intent Detection (Homework, Call Timer, Voice)
  // =========================================================================

  const SUBJECT_MAP = [
    { keys: ["matematik", "mat "], name: "Matematik", icon: "📐", color: "#3b82f6" },
    { keys: ["geometri"], name: "Geometri", icon: "📏", color: "#6366f1" },
    { keys: ["fizik"], name: "Fizik", icon: "⚡", color: "#f59e0b" },
    { keys: ["kimya"], name: "Kimya", icon: "🧪", color: "#10b981" },
    { keys: ["biyoloji"], name: "Biyoloji", icon: "🧬", color: "#22c55e" },
    { keys: ["fen bilimleri", "fen "], name: "Fen Bilimleri", icon: "🔬", color: "#14b8a6" },
    { keys: ["türkçe", "turkce", "kompozisyon", "dil bilgisi"], name: "Türkçe", icon: "📖", color: "#ec4899" },
    { keys: ["edebiyat", "roman", "şiir"], name: "Edebiyat", icon: "✒️", color: "#d946ef" },
    { keys: ["tarih", "inkılap"], name: "Tarih", icon: "🏛️", color: "#eab308" },
    { keys: ["coğrafya", "cografya"], name: "Coğrafya", icon: "🌍", color: "#06b6d4" },
    { keys: ["ingilizce", "english"], name: "İngilizce", icon: "🗣️", color: "#8b5cf6" },
    { keys: ["almanca"], name: "Almanca", icon: "🇩🇪", color: "#f97316" },
    { keys: ["felsefe"], name: "Felsefe", icon: "💭", color: "#a855f7" },
    { keys: ["din kültürü", "din "], name: "Din Kültürü", icon: "🌙", color: "#10b981" },
    { keys: ["sosyal bilgiler", "sosyal"], name: "Sosyal Bilgiler", icon: "🧭", color: "#0ea5e9" },
    { keys: ["bilişim", "kodlama", "yazılım", "bilgisayar"], name: "Bilişim & Kodlama", icon: "💻", color: "#06b6d4" }
  ];

  function extractHomeworkDetails(rawText) {
    const lower = " " + rawText.toLocaleLowerCase("tr-TR") + " ";
    let matchedSubject = { name: "Genel Ödev", icon: "📚", color: "#10b981" };
    for (const s of SUBJECT_MAP) {
      if (s.keys.some((k) => lower.includes(k))) {
        matchedSubject = s;
        break;
      }
    }

    let due = "Yakında";
    const duePatterns = [
      { rx: /(?:^|\s)(yarına|yarın)(?=\s|$|[.,!?])/i, label: "Yarın" },
      { rx: /(?:^|\s)(bu akşam|akşama|bugün)(?=\s|$|[.,!?])/i, label: "Bugün" },
      { rx: /(?:^|\s)pazartesi(ye| günü)?(?=\s|$|[.,!?])/i, label: "Pazartesi" },
      { rx: /(?:^|\s)salı(ya| günü)?(?=\s|$|[.,!?])/i, label: "Salı" },
      { rx: /(?:^|\s)çarşamba(ya| günü)?(?=\s|$|[.,!?])/i, label: "Çarşamba" },
      { rx: /(?:^|\s)perşembe(ye| günü)?(?=\s|$|[.,!?])/i, label: "Perşembe" },
      { rx: /(?:^|\s)cuma(ya| günü| gününe)?(?=\s|$|[.,!?])/i, label: "Cuma" },
      { rx: /(?:^|\s)cumartesi(ye| günü)?(?=\s|$|[.,!?])/i, label: "Cumartesi" },
      { rx: /(?:^|\s)pazar(a| günü)?(?=\s|$|[.,!?])/i, label: "Pazar" },
      { rx: /(?:^|\s)haftaya(?=\s|$|[.,!?])/i, label: "Gelecek Hafta" }
    ];
    for (const p of duePatterns) {
      if (p.rx.test(lower)) {
        due = p.label;
        break;
      }
    }

    let task = rawText
      .replace(
        /(?:^|\s)(yosa|merhaba|selam|lütfen|benim|ödevimi kaydet|ödevi kaydet|ödev kaydet|ödev ekle|ödevi ekle|ödev olarak kaydet|ödevimi not al|ödev not al|yeni ödev)(?=\s|$|[.,!?:;-])/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .replace(/^[:,\-\s]+|[:,\-\s]+$/g, "")
      .trim();

    if (!task || task.length < 3) {
      task = `${matchedSubject.name} ödevi çalışılacak`;
    } else {
      task = task.charAt(0).toLocaleUpperCase("tr-TR") + task.slice(1);
    }

    return {
      subject: matchedSubject.name,
      icon: matchedSubject.icon,
      color: matchedSubject.color,
      due,
      task
    };
  }

  function parseTurkishDurationSeconds(text) {
    const lower = text.toLocaleLowerCase("tr-TR");
    if (lower.includes("yarım saat")) return 1800;
    if (lower.includes("çeyrek saat")) return 900;

    const wordNums = {
      bir: 1,
      iki: 2,
      üç: 3,
      uc: 3,
      dört: 4,
      dort: 4,
      beş: 5,
      bes: 5,
      altı: 6,
      alti: 6,
      yedi: 7,
      sekiz: 8,
      dokuz: 9,
      on: 10,
      "on beş": 15,
      onbeş: 15,
      yirmi: 20,
      otuz: 30,
      kırk: 40,
      kirk: 40,
      elli: 50,
      altmış: 60
    };

    let normalized = " " + lower + " ";
    normalized = normalized.replace(/(?<=\s)on beş(?=\s)/g, "15");
    for (const [word, val] of Object.entries(wordNums)) {
      normalized = normalized.replace(
        new RegExp(`(?<=\\s)${word}(?=\\s)`, "g"),
        String(val)
      );
    }

    const secMatch = normalized.match(/(\d+)\s*(saniye|sn)/);
    if (secMatch) return Math.max(5, parseInt(secMatch[1], 10));

    const minMatch = normalized.match(/(\d+)\s*(dakika|dk)/);
    if (minMatch) return Math.max(10, parseInt(minMatch[1], 10) * 60);

    const hourMatch = normalized.match(/(\d+)\s*(saat)/);
    if (hourMatch) return Math.max(60, parseInt(hourMatch[1], 10) * 3600);

    return null;
  }

  function detectVoiceIntent(userText) {
    const lower = userText.toLocaleLowerCase("tr-TR").trim();

    // 1. End Call intent
    if (
      /^(görüşürüz|aramayı kapat|kapatabiliriz|telefonu kapat|hoşça kal|hoşçakal|bay bay|iyi geceler kapat)$/i.test(
        lower
      ) ||
      lower.includes("aramayı sonlandır") ||
      lower.includes("telefonu kapat")
    ) {
      return { type: "hangup" };
    }

    // 2. Schedule Call intent ("5 dakika sonra beni ara", "10 saniye sonra ara")
    if (
      (lower.includes("ara") || lower.includes("çaldır")) &&
      (lower.includes("sonra") ||
        lower.includes("dakika") ||
        lower.includes("saniye") ||
        lower.includes("saat"))
    ) {
      const seconds = parseTurkishDurationSeconds(lower) || 60;
      const reason = lower.includes("ödev")
        ? "Ödev Hatırlatma Araması"
        : lower.includes("haber") || lower.includes("maç")
        ? "Gündem & Maç Özeti Araması"
        : "Zamanlı Yosa AI Araması";
      return { type: "schedule_call", seconds, reason };
    }

    // 3. Switch Voice intent
    if (
      lower.includes("sesini değiştir") ||
      lower.includes("ses değiştir") ||
      lower.includes("farklı ses") ||
      lower.includes("erkek ses") ||
      lower.includes("kadın ses") ||
      /\b(elif|mert|zeynep|kerem|ada|nova)\s+sesine\b/.test(lower)
    ) {
      let targetVoice = null;
      for (const v of ["elif", "mert", "zeynep", "kerem", "ada", "nova"]) {
        if (lower.includes(v)) targetVoice = v;
      }
      if (!targetVoice) {
        if (lower.includes("erkek")) targetVoice = "mert";
        else if (lower.includes("kadın")) targetVoice = "elif";
      }
      return { type: "switch_voice", voiceId: targetVoice };
    }

    // 4. List / Read Homeworks
    if (
      lower.includes("ödevlerimi oku") ||
      lower.includes("ödevlerimi söyle") ||
      lower.includes("ödevlerim neler") ||
      lower.includes("hangi ödevlerim var") ||
      lower.includes("ödev listem") ||
      lower.includes("bekleyen ödev") ||
      lower === "ödevlerim"
    ) {
      return { type: "list_homework" };
    }

    // 5. Complete / Delete Homework
    if (
      lower.includes("ödev") &&
      (lower.includes("bitirdim") ||
        lower.includes("tamamladım") ||
        lower.includes("tamamlandı") ||
        lower.includes("yaptım"))
    ) {
      const info = extractHomeworkDetails(userText);
      return { type: "complete_homework", subject: info.subject, raw: userText };
    }

    if (
      lower.includes("ödev") &&
      (lower.includes("sil") || lower.includes("kaldır") || lower.includes("iptal"))
    ) {
      const all = lower.includes("tüm") || lower.includes("hepsini");
      const info = extractHomeworkDetails(userText);
      return { type: "delete_homework", all, subject: info.subject };
    }

    // 6. Save Homework
    if (
      lower.includes("ödevimi kaydet") ||
      lower.includes("ödevi kaydet") ||
      lower.includes("ödev kaydet") ||
      lower.includes("ödev ekle") ||
      lower.includes("ödevi ekle") ||
      lower.includes("ödevimi not al") ||
      lower.includes("ödev not al") ||
      (lower.includes("ödevim var") && !lower.includes("hangi"))
    ) {
      return {
        type: "add_homework",
        homework: extractHomeworkDetails(userText)
      };
    }

    // 7. News / Sports / Current Events Check
    const newsSignals = [
      "haber",
      "gündem",
      "son dakika",
      "özetle",
      "özeti",
      "maç",
      "mac ",
      "skor",
      "gol",
      "derbi",
      "lig",
      "galatasaray",
      "fenerbahçe",
      "beşiktaş",
      "trabzonspor",
      "milli takım",
      "dolar",
      "euro",
      "altın",
      "borsa",
      "ekonomi",
      "hava durumu",
      "deprem",
      "teknoloji",
      "seçim",
      "ne oldu",
      "son durum",
      "google news"
    ];
    if (newsSignals.some((kw) => lower.includes(kw))) {
      return { type: "news_query" };
    }

    return { type: "chat" };
  }

  // =========================================================================
  // Free Built-in AI Brain (Pollinations OpenAI-compatible + GET + Smart Fallback)
  // =========================================================================

  function buildLocalNewsSummary(userText, newsResult) {
    const articles = newsResult.articles || [];
    if (articles.length === 0) {
      return `${newsResult.topic} konusuyla ilgili şu an Google News'te yeni bir başlık bulamadım, istersen farklı bir konu veya takım sorabilirsin.`;
    }
    const top = articles.slice(0, 3);
    const parts = top.map((a, idx) => {
      if (idx === 0) return `${a.source} kaynağına göre, ${a.title}`;
      return `Ayrıca ${a.source} haberinde ${a.title} bilgisi öne çıkıyor`;
    });
    return `Google News'teki en güncel bilgilere baktım. ${parts.join(". ")}. İstersen detayları veya başka bir gelişmeyi de sorabilirsin.`;
  }

  function buildLocalChatFallback(userText, homeworks) {
    const lower = userText.toLocaleLowerCase("tr-TR");
    if (lower.includes("nasılsın") || lower.includes("naber") || lower.includes("ne haber")) {
      const pending = homeworks.filter((h) => !h.completed).length;
      return pending > 0
        ? `Harikayım, teşekkür ederim! Senin bekleyen ${pending} ödevin var, istersen onları okuyabilirim ya da Google News'ten günün haberlerini özetleyebilirim.`
        : "Çok iyiyim, aradığın için teşekkürler! Sana güncel maç özetlerini anlatmamı ya da yeni bir ödevini kaydetmemi ister misin?";
    }
    if (lower.includes("merhaba") || lower.includes("selam") || lower.includes("alo")) {
      return "Alo, merhaba! Ben Yosa AI, seni net duyuyorum. İstediğin haberi sorabilir ya da ödevlerini bana yazdırabilirsin.";
    }
    if (lower.includes("kimsin") || lower.includes("adın ne") || lower.includes("ne yapabilirsin")) {
      return "Ben Yosa AI, senin kişisel sesli telefon asistanınım. Seni zil sesiyle arayabilirim, Google News'ten maç ve gündem özetleri geçebilirim ve ödevlerini sesle kaydedebilirim.";
    }
    return "Seni dinliyorum! Bana istediğin maçı veya gündem konusunu sorabilir, ya da ders ödevini söyleyip kaydettirebilirsin.";
  }

  async function callFreeLLM(messages) {
    const payload = JSON.stringify({
      model: "openai",
      messages,
      temperature: 0.65
    });

    // 1. Inside Android APK: Direct native HTTPS POST
    if (window.YosaNative && typeof window.YosaNative.httpRequest === "function") {
      try {
        const raw = await nativeHttp("POST", "https://text.pollinations.ai/openai", payload, 12000);
        const parsed = JSON.parse(raw);
        const content = parsed?.choices?.[0]?.message?.content;
        if (content && content.trim()) return content.trim();
      } catch (_) {}

      try {
        const promptJoined = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n");
        const txt = await nativeHttp(
          "GET",
          `https://text.pollinations.ai/${encodeURIComponent(promptJoined)}`,
          "",
          11000
        );
        if (txt && txt.trim()) return txt.trim();
      } catch (_) {}
    }

    // 2. Browser Direct Fetch
    try {
      const raw = await fetchWithTimeout(
        "https://text.pollinations.ai/openai",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload
        },
        11000
      );
      const parsed = JSON.parse(raw);
      const content = parsed?.choices?.[0]?.message?.content;
      if (content && content.trim()) return content.trim();
    } catch (_) {}

    try {
      const lastUser = messages[messages.length - 1]?.content || "";
      const sys = messages[0]?.content || "";
      const txt = await fetchWithTimeout(
        `https://text.pollinations.ai/${encodeURIComponent(sys + "\nKullanıcı: " + lastUser + "\nYosa AI:")}`,
        {},
        10000
      );
      if (txt && txt.trim() && !txt.trim().startsWith("<!DOCTYPE")) return txt.trim();
    } catch (_) {}

    return null;
  }

  async function generateVoiceResponse({ userText, history, homeworks, voiceName, onStatus }) {
    const intent = detectVoiceIntent(userText);

    // Handle deterministic actions immediately for rock-solid reliability
    if (intent.type === "hangup") {
      return {
        action: { type: "hangup" },
        reply: "Tamamdır, konuşmak çok güzeldi! İhtiyacın olduğunda tekrar ara, görüşürüz!",
        articles: []
      };
    }

    if (intent.type === "schedule_call") {
      const mins = Math.round(intent.seconds / 60);
      const timeText =
        intent.seconds < 60
          ? `${intent.seconds} saniye`
          : `${mins} dakika`;
      return {
        action: {
          type: "schedule_call",
          seconds: intent.seconds,
          reason: intent.reason
        },
        reply: `Anlaştık! ${timeText} sonra telefonunu çaldırıp seni arayacağım. Şimdilik hoşça kal!`,
        articles: []
      };
    }

    if (intent.type === "switch_voice") {
      return {
        action: { type: "switch_voice", voiceId: intent.voiceId },
        reply: "", // App controller fills greeting with new voice name
        articles: []
      };
    }

    if (intent.type === "add_homework") {
      const hw = intent.homework;
      return {
        action: { type: "add_homework", homework: hw },
        reply: `Tamamdır, ${hw.subject} ödevini kaydettim! Teslim zamanı ${hw.due}, detay olarak "${hw.task}" notunu aldım. Başka ödevin var mı?`,
        articles: []
      };
    }

    if (intent.type === "list_homework") {
      const pending = homeworks.filter((h) => !h.completed);
      if (pending.length === 0) {
        return {
          action: { type: "list_homework" },
          reply: "Şu an kayıtlı bekleyen hiçbir ödevin görünmüyor! Yeni bir ödev eklemek istersen ders adını ve konuyu söylemen yeterli.",
          articles: []
        };
      }
      const listSpeech = pending
        .slice(0, 5)
        .map((h, i) => `${i + 1}. ${h.subject}, teslim: ${h.due}, konu: ${h.task}`)
        .join(". ");
      return {
        action: { type: "list_homework" },
        reply: `Şu an bekleyen ${pending.length} ödevin var. ${listSpeech}. Başarılar dilerim!`,
        articles: []
      };
    }

    if (intent.type === "complete_homework") {
      return {
        action: { type: "complete_homework", subject: intent.subject },
        reply: "",
        articles: []
      };
    }

    if (intent.type === "delete_homework") {
      return {
        action: { type: "delete_homework", all: intent.all, subject: intent.subject },
        reply: "",
        articles: []
      };
    }

    // News or General AI Query
    let newsResult = { topic: "", articles: [] };
    if (intent.type === "news_query") {
      if (onStatus) onStatus("Google News taranıyor...");
      newsResult = await searchGoogleNews(userText);
    }

    if (onStatus) onStatus("Yosa yanıt hazırlıyor...");

    const hwSummary =
      homeworks.filter((h) => !h.completed).length > 0
        ? homeworks
            .filter((h) => !h.completed)
            .map((h) => `- ${h.subject} (${h.due}): ${h.task}`)
            .join("\n")
        : "Bekleyen ödev yok.";

    const newsContext =
      newsResult.articles.length > 0
        ? "\nCANLI GOOGLE NEWS HABERLERİ (En güncelden eskiye):\n" +
          newsResult.articles
            .slice(0, 6)
            .map(
              (a, i) =>
                `${i + 1}. [${a.source}] ${a.title}${a.snippet ? " — " + a.snippet : ""} (${a.pubDate})`
            )
            .join("\n")
        : "";

    const systemPrompt = [
      `Senin adın Yosa AI (aktif ses karakterin: ${voiceName || "Elif"}).`,
      "Kullanıcıyla gerçek bir sesli telefon görüşmesindesin. Klavye yok, yanıtın doğrudan sesli okunacak.",
      "Kurallar:",
      "1. Sadece doğal, samimi ve akıcı Türkçe konuş. Kısa ve öz ol (en fazla 2-4 cümle).",
      "2. Asla yıldız (*), madde işareti, emoji, link veya markdown kullanma; düz konuşma metni üret.",
      "3. Eğer Google News haberleri verilmişse, en güncel haberleri ve maç/skor/gündem detaylarını doğal bir spiker/arkadaş gibi özetle.",
      `Kullanıcının mevcut bekleyen ödevleri:\n${hwSummary}`,
      newsContext
    ]
      .filter(Boolean)
      .join("\n");

    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []).slice(-6),
      { role: "user", content: userText }
    ];

    const llmReply = await callFreeLLM(messages);
    if (llmReply) {
      const cleaned = llmReply
        .replace(/[*#_`~]/g, "")
        .replace(/https?:\/\/\S+/g, "")
        .replace(/\s+/g, " ")
        .trim();
      return {
        action: null,
        reply: cleaned,
        articles: newsResult.articles
      };
    }

    // Offline / Fallback natural response
    if (intent.type === "news_query") {
      return {
        action: null,
        reply: buildLocalNewsSummary(userText, newsResult),
        articles: newsResult.articles
      };
    }

    return {
      action: null,
      reply: buildLocalChatFallback(userText, homeworks),
      articles: []
    };
  }

  window.YosaBrain = {
    searchGoogleNews,
    extractHomeworkDetails,
    detectVoiceIntent,
    generateVoiceResponse
  };
})();
