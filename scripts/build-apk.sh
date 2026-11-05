#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TC_DIR="/tmp/android-toolchain"
BUILD_DIR="$ROOT_DIR/android/build"
OUT_APK="$ROOT_DIR/Yosa-AI.apk"

echo "[1/6] Checking Android build toolchain..."
mkdir -p "$TC_DIR"

if [ ! -x "$TC_DIR/py/jdk4py/java-runtime/bin/java" ]; then
  python3 -m pip install --target "$TC_DIR/py" --quiet "jdk4py"
fi

if [ ! -x "$TC_DIR/pkgs/aaptjs3/package/bin/x64/linux/aapt2" ]; then
  (
    cd "$TC_DIR"
    npm pack --quiet aaptjs3 kotlin-compiler
    mkdir -p pkgs/aaptjs3 pkgs/kotlin
    tar -xzf aaptjs3-*.tgz -C pkgs/aaptjs3
    tar -xzf kotlin-compiler-*.tgz -C pkgs/kotlin
    chmod +x pkgs/aaptjs3/package/bin/x64/linux/aapt2 pkgs/kotlin/package/bin/kotlinc*
  )
fi

if [ ! -f "$TC_DIR/h2apk/tools/d8.jar" ]; then
  (
    cd "$TC_DIR"
    git clone --depth 1 --filter=blob:none --sparse https://github.com/HashShin/H2APK.git h2apk
    cd h2apk && git sparse-checkout set tools
  )
fi

if [ ! -x "$TC_DIR/pkgs/kotlin/package/bin/kotlinc" ]; then
  (
    cd "$TC_DIR"
    npm pack --quiet kotlin-compiler
    mkdir -p pkgs/kotlin
    tar -xzf kotlin-compiler-*.tgz -C pkgs/kotlin
    chmod +x pkgs/kotlin/package/bin/kotlinc*
  )
fi

export JAVA_HOME="$TC_DIR/py/jdk4py/java-runtime"
export PATH="$JAVA_HOME/bin:$PATH"

JAVA="$JAVA_HOME/bin/java"
KEYTOOL="$JAVA_HOME/bin/keytool"
AAPT2="$TC_DIR/pkgs/aaptjs3/package/bin/x64/linux/aapt2"
KOTLINC="$TC_DIR/pkgs/kotlin/package/bin/kotlinc"
D8_JAR="$TC_DIR/h2apk/tools/d8.jar"
APKSIGNER_JAR="$TC_DIR/h2apk/tools/apksigner.jar"
ANDROID_JAR="$TC_DIR/h2apk/tools/android.jar"

chmod +x "$AAPT2" "$KOTLINC"

rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/compiled_res" "$BUILD_DIR/dex" "$BUILD_DIR/assets_stage"

echo "[2/6] Generating icons & ringtone assets..."
python3 "$ROOT_DIR/scripts/generate-assets.py"

# Stage web app into APK assets/
cp -R "$ROOT_DIR/public/"* "$BUILD_DIR/assets_stage/"

echo "[3/6] Compiling & linking Android resources with aapt2..."
"$AAPT2" compile --dir "$ROOT_DIR/android/res" -o "$BUILD_DIR/compiled_res/res.zip"

"$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT_DIR/android/AndroidManifest.xml" \
  -A "$BUILD_DIR/assets_stage" \
  -0 wav \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  -o "$BUILD_DIR/unsigned.apk" \
  "$BUILD_DIR/compiled_res/res.zip"

echo "[4/6] Compiling Native Kotlin Android classes..."
"$KOTLINC" \
  -jvm-target 11 \
  -cp "$ANDROID_JAR" \
  -include-runtime \
  "$ROOT_DIR/android/src/tr/yosa/ai/MainActivity.kt" \
  "$ROOT_DIR/android/src/tr/yosa/ai/YosaNativeBridge.kt" \
  "$ROOT_DIR/android/src/tr/yosa/ai/CallAlarmReceiver.kt" \
  -d "$BUILD_DIR/app-classes.jar"

echo "[5/6] Converting JVM bytecode to Dalvik/ART DEX with D8..."
"$JAVA" -cp "$D8_JAR" com.android.tools.r8.D8 \
  --release \
  --min-api 24 \
  --lib "$ANDROID_JAR" \
  --output "$BUILD_DIR/dex" \
  "$BUILD_DIR/app-classes.jar"

# Add classes.dex into unsigned APK root
(
  cd "$BUILD_DIR/dex"
  zip -q -u "$BUILD_DIR/unsigned.apk" classes.dex
)

echo "[5.5/6] Aligning uncompressed APK resources to 4-byte boundaries (zipalign)..."
python3 "$ROOT_DIR/scripts/zipalign.py" "$BUILD_DIR/unsigned.apk" "$BUILD_DIR/aligned.apk"

echo "[6/6] Signing APK (Scheme v1 + v2 + v3) & verifying..."
KEYSTORE="$TC_DIR/yosa-release.keystore"
if [ ! -f "$KEYSTORE" ]; then
  "$KEYTOOL" -genkeypair \
    -v \
    -keystore "$KEYSTORE" \
    -alias yosa_key \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -storepass yosa123456 \
    -keypass yosa123456 \
    -dname "CN=Yosa AI, OU=Mobile, O=Yosa, L=Istanbul, ST=Istanbul, C=TR" >/dev/null 2>&1
fi

"$JAVA" --enable-native-access=ALL-UNNAMED -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias yosa_key \
  --ks-pass pass:yosa123456 \
  --key-pass pass:yosa123456 \
  --min-sdk-version 21 \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUT_APK" \
  "$BUILD_DIR/aligned.apk"

rm -f "$OUT_APK.idsig"
rm -rf "$BUILD_DIR"

echo "=== APK VERIFICATION ==="
"$JAVA" --enable-native-access=ALL-UNNAMED -jar "$APKSIGNER_JAR" verify --verbose "$OUT_APK"
"$AAPT2" dump badging "$OUT_APK" | head -n 15 || true
ls -lh "$OUT_APK"
echo "SUCCESS: Built $OUT_APK"
