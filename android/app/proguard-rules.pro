# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ===================================
# React Native Core
# ===================================
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip
-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}
-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

# Hermes
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ===================================
# WatermelonDB
# ===================================
# Keep database models
-keep class * extends com.nozbe.watermelondb.Model { *; }
-keep class com.nozbe.watermelondb.** { *; }

# Keep SQL interfaces
-keep interface com.nozbe.watermelondb.** { *; }

# Keep simdjson
-keep class com.nozbe.simdjson.** { *; }

# JSI
-keep class com.facebook.jsi.** { *; }

# ===================================
# Google ML Kit
# ===================================
# Keep ML Kit Image Labeling
-keep class com.google.mlkit.vision.label.** { *; }
-keep class com.google.android.gms.vision.** { *; }

# Keep ML Kit Text Recognition
-keep class com.google.mlkit.vision.text.** { *; }

# Keep common ML Kit classes
-keep class com.google.mlkit.common.** { *; }
-keep class com.google.mlkit.vision.common.** { *; }

# Keep model classes
-keep class com.google.android.gms.internal.** { *; }

# ===================================
# MMKV
# ===================================
-keep class com.tencent.mmkv.** { *; }
-keepclassmembers class com.tencent.mmkv.MMKV {
    native <methods>;
    long nativeHandle;
}

# ===================================
# React Native Reanimated
# ===================================
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ===================================
# React Native Gesture Handler
# ===================================
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.facebook.react.bridge.** { *; }

# ===================================
# React Native Screens
# ===================================
-keep class com.swmansion.rnscreens.** { *; }

# ===================================
# Notifee
# ===================================
-keep class app.notifee.** { *; }
-keep class io.invertase.notifee.** { *; }

# ===================================
# Fast Image
# ===================================
-keep class com.dylanvann.fastimage.** { *; }
-keep class com.bumptech.glide.** { *; }

# ===================================
# React Native Camera Roll
# ===================================
-keep class com.reactnativecommunity.cameraroll.** { *; }

# ===================================
# React Native Vision Camera
# ===================================
-keep class com.mrousavy.camera.** { *; }

# ===================================
# General Rules
# ===================================
# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep setters in Views
-keepclassmembers public class * extends android.view.View {
   void set*(***);
   *** get*();
}

# Keep Parcelables
-keepclassmembers class * implements android.os.Parcelable {
  public static final android.os.Parcelable$Creator CREATOR;
}

# Keep Enums
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ===================================
# Suppress Warnings
# ===================================
-dontwarn com.facebook.react.**
-dontwarn com.google.android.gms.**
-dontwarn com.google.mlkit.**
-dontwarn okhttp3.**
-dontwarn okio.**
