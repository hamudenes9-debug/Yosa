const express = require("express");
const compression = require("compression");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

app.disable("x-powered-by");
app.use(compression());

// Allow embedding in Arena preview & enable microphone permission delegation
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Permissions-Policy", "microphone=*");
  next();
});

// Direct APK download endpoint
app.get("/download/Yosa-AI.apk", (req, res) => {
  const apkPath = path.join(__dirname, "Yosa-AI.apk");
  if (!fs.existsSync(apkPath)) {
    return res.status(404).send("Yosa-AI.apk henüz derlenmedi.");
  }
  res.setHeader("Content-Type", "application/vnd.android.package-archive");
  res.setHeader("Content-Disposition", 'attachment; filename="Yosa-AI.apk"');
  res.sendFile(apkPath);
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    app: "Yosa AI",
    apkReady: fs.existsSync(path.join(__dirname, "Yosa-AI.apk"))
  });
});

app.use(express.static(path.join(__dirname, "public")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`Yosa AI sunucusu çalışıyor: http://${HOST}:${PORT}`);
});
