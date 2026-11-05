package tr.yosa.ai

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

class CallAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        val reason = intent?.getStringExtra("call_reason") ?: "Zamanlı Yosa AI Araması"

        val callIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("incoming_call", true)
            putExtra("call_reason", reason)
        }

        // Post High-Priority Full-Screen Call Notification so Android 10+ surfaces incoming call reliably
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            if (nm != null) {
                val channelId = "yosa_incoming_calls"
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val chan = NotificationChannel(
                        channelId,
                        "Yosa AI Gelen Aramalar",
                        NotificationManager.IMPORTANCE_HIGH
                    ).apply {
                        description = "Yosa AI zamanlı sesli arama bildirimleri"
                        enableVibration(true)
                    }
                    nm.createNotificationChannel(chan)
                }

                val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                val fullScreenPi = PendingIntent.getActivity(context, 7702, callIntent, piFlags)

                val iconId = context.resources.getIdentifier("ic_launcher", "drawable", context.packageName)
                    .let { if (it != 0) it else android.R.drawable.sym_call_incoming }

                val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    Notification.Builder(context, channelId)
                } else {
                    @Suppress("DEPRECATION")
                    Notification.Builder(context)
                }

                val notif = builder
                    .setSmallIcon(iconId)
                    .setContentTitle("📞 Yosa AI Arıyor...")
                    .setContentText(reason)
                    .setCategory(Notification.CATEGORY_CALL)
                    .setContentIntent(fullScreenPi)
                    .setFullScreenIntent(fullScreenPi, true)
                    .setAutoCancel(true)
                    .build()

                nm.notify(7703, notif)
            }
        } catch (_: Exception) {}

        // Also start activity directly when foreground/allowed
        try {
            context.startActivity(callIntent)
        } catch (_: Exception) {}
    }
}
