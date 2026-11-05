package tr.yosa.ai

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class YosaNativeBridge(
    private val activity: MainActivity,
    private val webView: WebView
) : TextToSpeech.OnInitListener {

    private val mainHandler = Handler(Looper.getMainLooper())
    private val ioPool = Executors.newCachedThreadPool()

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var speechRecognizer: SpeechRecognizer? = null
    private var ringtonePlayer: MediaPlayer? = null

    init {
        mainHandler.post {
            try {
                tts = TextToSpeech(activity.applicationContext, this)
            } catch (_: Exception) {
                ttsReady = false
            }
        }
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val trLocale = Locale("tr", "TR")
            val res = tts?.setLanguage(trLocale)
            ttsReady = res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED

            tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                override fun onStart(utteranceId: String?) {
                    evalJs("window.__yosaNativeTtsEvent && window.__yosaNativeTtsEvent('start');")
                }

                override fun onDone(utteranceId: String?) {
                    evalJs("window.__yosaNativeTtsEvent && window.__yosaNativeTtsEvent('done');")
                }

                @Deprecated("Deprecated in Java")
                override fun onError(utteranceId: String?) {
                    evalJs("window.__yosaNativeTtsEvent && window.__yosaNativeTtsEvent('error');")
                }
            })
        } else {
            ttsReady = false
        }
    }

    private fun evalJs(script: String) {
        mainHandler.post {
            try {
                webView.evaluateJavascript(script, null)
            } catch (_: Exception) {}
        }
    }

    // =====================================================================
    // 1. Native Turkish Text-To-Speech with 6 Voice Personas
    // =====================================================================
    @JavascriptInterface
    fun speak(text: String, voiceId: String, pitch: Float, rate: Float, gender: String): Boolean {
        val engine = tts
        if (!ttsReady || engine == null) return false

        mainHandler.post {
            try {
                selectMatchingTurkishVoice(engine, voiceId, gender)
                engine.setPitch(pitch.coerceIn(0.6f, 1.5f))
                engine.setSpeechRate(rate.coerceIn(0.65f, 1.5f))

                val params = Bundle()
                params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC)
                engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "yosa_utt_${System.currentTimeMillis()}")
            } catch (_: Exception) {
                evalJs("window.__yosaNativeTtsEvent && window.__yosaNativeTtsEvent('error');")
            }
        }
        return true
    }

    private fun selectMatchingTurkishVoice(engine: TextToSpeech, voiceId: String, gender: String) {
        try {
            val allVoices: Set<Voice> = engine.voices ?: return
            val trVoices = allVoices
                .filter { it.locale != null && it.locale.language.lowercase(Locale.ROOT).startsWith("tr") }
                .sortedBy { it.name }

            if (trVoices.isEmpty()) {
                engine.language = Locale("tr", "TR")
                return
            }

            if (trVoices.size == 1) {
                engine.voice = trVoices[0]
                return
            }

            // Google TTS on Android names Turkish voices like tr-tr-x-ama-local, tr-tr-x-cfs-local, tr-tr-x-efu-local, tr-tr-x-mfm-local, tr-tr-x-tmc-local
            val maleCandidates = trVoices.filter {
                val n = it.name.lowercase(Locale.ROOT)
                n.contains("male") || n.contains("efu") || n.contains("tmc") || n.contains("tolga")
            }
            val femaleCandidates = trVoices.filter {
                val n = it.name.lowercase(Locale.ROOT)
                n.contains("female") || n.contains("ama") || n.contains("cfs") || n.contains("mfm") || n.contains("emel")
            }

            val chosen: Voice = when {
                gender == "male" && maleCandidates.isNotEmpty() -> {
                    val idx = if (voiceId == "kerem" && maleCandidates.size > 1) 1 else 0
                    maleCandidates[idx % maleCandidates.size]
                }
                gender == "female" && femaleCandidates.isNotEmpty() -> {
                    val idx = when (voiceId) {
                        "zeynep" -> 1
                        "ada" -> 2
                        else -> 0
                    }
                    femaleCandidates[idx % femaleCandidates.size]
                }
                else -> {
                    val hashIdx = kotlin.math.abs(voiceId.hashCode()) % trVoices.size
                    trVoices[hashIdx]
                }
            }
            engine.voice = chosen
        } catch (_: Exception) {
            engine.language = Locale("tr", "TR")
        }
    }

    @JavascriptInterface
    fun stopSpeaking() {
        mainHandler.post {
            try {
                tts?.stop()
            } catch (_: Exception) {}
        }
    }

    // =====================================================================
    // 2. Native Turkish Speech-To-Text (Zero Keyboard!)
    // =====================================================================
    @JavascriptInterface
    fun startListening(lang: String): Boolean {
        if (!activity.hasMicPermission()) {
            activity.requestRuntimePermissionsIfNeeded()
            evalJs("window.__yosaNativeSttError && window.__yosaNativeSttError('permission_requested');")
            return true
        }

        mainHandler.post {
            try {
                destroySpeechRecognizer()

                if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                    launchIntentSpeechFallback(lang)
                    return@post
                }

                val sr = SpeechRecognizer.createSpeechRecognizer(activity)
                speechRecognizer = sr

                var latestPartial = ""

                sr.setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) {}
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) {}
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() {}
                    override fun onEvent(eventType: Int, params: Bundle?) {}

                    override fun onPartialResults(partialResults: Bundle?) {
                        val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val text = list?.firstOrNull()?.trim() ?: ""
                        if (text.isNotEmpty()) {
                            latestPartial = text
                            val q = JSONObject.quote(text)
                            evalJs("window.__yosaNativeSttPartial && window.__yosaNativeSttPartial($q);")
                        }
                    }

                    override fun onResults(results: Bundle?) {
                        val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        val finalStr = (list?.firstOrNull()?.trim()?.takeIf { it.isNotEmpty() }) ?: latestPartial
                        if (finalStr.isNotEmpty()) {
                            val q = JSONObject.quote(finalStr)
                            evalJs("window.__yosaNativeSttResult && window.__yosaNativeSttResult($q);")
                        } else {
                            evalJs("window.__yosaNativeSttError && window.__yosaNativeSttError('no-speech');")
                        }
                    }

                    override fun onError(error: Int) {
                        if (latestPartial.isNotEmpty() && (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                            val q = JSONObject.quote(latestPartial)
                            evalJs("window.__yosaNativeSttResult && window.__yosaNativeSttResult($q);")
                            return
                        }
                        val code = when (error) {
                            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
                            else -> "err_$error"
                        }
                        val q = JSONObject.quote(code)
                        evalJs("window.__yosaNativeSttError && window.__yosaNativeSttError($q);")
                    }
                })

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, lang)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                }

                sr.startListening(intent)
            } catch (_: Exception) {
                launchIntentSpeechFallback(lang)
            }
        }
        return true
    }

    private fun launchIntentSpeechFallback(lang: String) {
        try {
            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                putExtra(RecognizerIntent.EXTRA_PROMPT, "Yosa AI seni dinliyor...")
            }
            activity.startActivityForResult(intent, MainActivity.REQ_SPEECH_FALLBACK)
        } catch (_: Exception) {
            evalJs("window.__yosaNativeSttError && window.__yosaNativeSttError('unsupported');")
        }
    }

    fun deliverFallbackSpeechResult(text: String) {
        val q = JSONObject.quote(text)
        evalJs("window.__yosaNativeSttResult && window.__yosaNativeSttResult($q);")
    }

    fun deliverFallbackSpeechError(code: String) {
        val q = JSONObject.quote(code)
        evalJs("window.__yosaNativeSttError && window.__yosaNativeSttError($q);")
    }

    @JavascriptInterface
    fun stopListening() {
        mainHandler.post {
            destroySpeechRecognizer()
        }
    }

    private fun destroySpeechRecognizer() {
        try {
            speechRecognizer?.cancel()
            speechRecognizer?.destroy()
        } catch (_: Exception) {}
        speechRecognizer = null
    }

    // =====================================================================
    // 3. Native Ringtone & Phone Vibration
    // =====================================================================
    @JavascriptInterface
    fun startRingtone(ringtoneId: String): Boolean {
        stopRingtone()
        val safeName = ringtoneId.replace(Regex("[^a-z0-9_]"), "")
        val resId = activity.resources.getIdentifier(safeName, "raw", activity.packageName)
        if (resId == 0) return false

        mainHandler.post {
            try {
                val mp = MediaPlayer()
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                val afd = activity.resources.openRawResourceFd(resId)
                mp.setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()
                mp.isLooping = true
                mp.prepare()
                mp.start()
                ringtonePlayer = mp
            } catch (_: Exception) {}
        }
        return true
    }

    @JavascriptInterface
    fun stopRingtone() {
        mainHandler.post {
            try {
                ringtonePlayer?.stop()
            } catch (_: Exception) {}
            try {
                ringtonePlayer?.release()
            } catch (_: Exception) {}
            ringtonePlayer = null
        }
    }

    @JavascriptInterface
    fun vibrateCall(enable: Boolean) {
        try {
            @Suppress("DEPRECATION")
            val vibrator = activity.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator ?: return
            if (!enable) {
                vibrator.cancel()
                return
            }
            val pattern = longArrayOf(0, 700, 450, 700, 1200)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, 0)
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun setSpeakerphone(enabled: Boolean) {
        try {
            val am = activity.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = enabled
        } catch (_: Exception) {}
    }

    // =====================================================================
    // 4. Direct Native HTTP Client (Google News RSS + Free AI — Zero CORS!)
    // =====================================================================
    @JavascriptInterface
    fun httpRequest(reqId: String, method: String, urlStr: String, body: String) {
        ioPool.execute {
            var conn: HttpURLConnection? = null
            try {
                val url = URL(urlStr)
                conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = method.uppercase(Locale.ROOT)
                    connectTimeout = 9000
                    readTimeout = 11000
                    instanceFollowRedirects = true
                    setRequestProperty(
                        "User-Agent",
                        "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
                    )
                    setRequestProperty("Accept-Language", "tr-TR,tr;q=0.9,en-US;q=0.7")
                }

                if (method.equals("POST", ignoreCase = true) && body.isNotEmpty()) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                        writer.write(body)
                        writer.flush()
                    }
                }

                val code = conn.responseCode
                val stream = if (code in 200..399) conn.inputStream else conn.errorStream
                val text = if (stream != null) {
                    BufferedReader(InputStreamReader(stream, Charsets.UTF_8)).use { it.readText() }
                } else {
                    ""
                }

                val qId = JSONObject.quote(reqId)
                val qBody = JSONObject.quote(text)
                evalJs("window.__yosaNativeHttpCallback && window.__yosaNativeHttpCallback($qId, $code, $qBody);")
            } catch (e: Exception) {
                val qId = JSONObject.quote(reqId)
                val qErr = JSONObject.quote(e.message ?: "error")
                evalJs("window.__yosaNativeHttpCallback && window.__yosaNativeHttpCallback($qId, 0, $qErr);")
            } finally {
                conn?.disconnect()
            }
        }
    }

    // =====================================================================
    // 5. Scheduled Incoming Call AlarmManager ("Beni Arasın")
    // =====================================================================
    @JavascriptInterface
    fun scheduleCall(seconds: Int, reason: String) {
        try {
            val am = activity.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(activity, CallAlarmReceiver::class.java).apply {
                putExtra("call_reason", reason)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(activity, 7701, intent, flags)
            val triggerAt = System.currentTimeMillis() + (seconds.coerceAtLeast(3) * 1000L)

            if (Build.VERSION.SDK_INT >= 31) {
                if (am.canScheduleExactAlarms()) {
                    am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                } else {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                }
            } else {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
            }
        } catch (_: Exception) {}
    }

    @JavascriptInterface
    fun cancelScheduledCall() {
        try {
            val am = activity.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            val intent = Intent(activity, CallAlarmReceiver::class.java)
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pi = PendingIntent.getBroadcast(activity, 7701, intent, flags)
            am.cancel(pi)
        } catch (_: Exception) {}
    }

    // =====================================================================
    // 6. Persistent Homework & Preferences Storage
    // =====================================================================
    @JavascriptInterface
    fun saveData(key: String, value: String) {
        val prefs = activity.getSharedPreferences("yosa_ai_store", Context.MODE_PRIVATE)
        prefs.edit().putString(key, value).apply()
    }

    @JavascriptInterface
    fun loadData(key: String): String? {
        val prefs = activity.getSharedPreferences("yosa_ai_store", Context.MODE_PRIVATE)
        return prefs.getString(key, null)
    }

    fun shutdown() {
        stopRingtone()
        vibrateCall(false)
        destroySpeechRecognizer()
        try {
            tts?.stop()
            tts?.shutdown()
        } catch (_: Exception) {}
        ioPool.shutdownNow()
    }
}
