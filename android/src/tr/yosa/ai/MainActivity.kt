package tr.yosa.ai

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.speech.RecognizerIntent
import android.view.WindowManager
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.net.URLEncoder

class MainActivity : Activity() {

    companion object {
        const val REQ_PERMISSIONS = 1001
        const val REQ_SPEECH_FALLBACK = 1002
    }

    lateinit var webView: WebView
    private lateinit var bridge: YosaNativeBridge
    private var pageLoaded = false
    private var pendingIncomingReason: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Wake screen & show over lockscreen for realistic incoming Yosa AI phone calls
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        requestRuntimePermissionsIfNeeded()

        webView = WebView(this)
        webView.setBackgroundColor(Color.BLACK)
        setContentView(webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = true
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        bridge = YosaNativeBridge(this, webView)
        webView.addJavascriptInterface(bridge, "YosaNative")

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                request?.grant(request.resources)
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageLoaded = true
                pendingIncomingReason?.let { reason ->
                    pendingIncomingReason = null
                    triggerJsIncomingCall(reason)
                }
            }
        }

        val isIncoming = intent?.getBooleanExtra("incoming_call", false) == true
        val reason = intent?.getStringExtra("call_reason") ?: "Zamanlı Yosa AI Araması"

        if (isIncoming) {
            val encodedReason = URLEncoder.encode(reason, "UTF-8")
            webView.loadUrl("file:///android_asset/index.html?incoming=1&reason=$encodedReason")
        } else {
            webView.loadUrl("file:///android_asset/index.html")
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.getBooleanExtra("incoming_call", false) == true) {
            val reason = intent.getStringExtra("call_reason") ?: "Zamanlı Yosa AI Araması"
            if (pageLoaded) {
                triggerJsIncomingCall(reason)
            } else {
                pendingIncomingReason = reason
            }
        }
    }

    private fun triggerJsIncomingCall(reason: String) {
        val quoted = JSONObject.quote(reason)
        webView.post {
            webView.evaluateJavascript(
                "if(window.__yosaTriggerIncomingCall){window.__yosaTriggerIncomingCall($quoted);}",
                null
            )
        }
    }

    fun hasMicPermission(): Boolean {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }

    fun requestRuntimePermissionsIfNeeded() {
        val needed = mutableListOf<String>()
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            needed.add(Manifest.permission.RECORD_AUDIO)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        if (needed.isNotEmpty()) {
            requestPermissions(needed.toTypedArray(), REQ_PERMISSIONS)
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_SPEECH_FALLBACK) {
            if (resultCode == RESULT_OK && data != null) {
                val matches = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                val first = matches?.firstOrNull()?.trim()
                if (!first.isNullOrEmpty()) {
                    bridge.deliverFallbackSpeechResult(first)
                    return
                }
            }
            bridge.deliverFallbackSpeechError("no-speech")
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        webView.evaluateJavascript(
            "(function(){ " +
                "const inc = document.getElementById('screen-incoming'); " +
                "const act = document.getElementById('screen-incall'); " +
                "if((inc && inc.classList.contains('active')) || (act && act.classList.contains('active'))){ " +
                "  document.getElementById('btn-hangup-call').click(); return 'handled'; " +
                "} return 'exit'; })()"
        ) { res ->
            if (res == null || !res.contains("handled")) {
                super.onBackPressed()
            }
        }
    }

    override fun onDestroy() {
        bridge.shutdown()
        webView.destroy()
        super.onDestroy()
    }
}
