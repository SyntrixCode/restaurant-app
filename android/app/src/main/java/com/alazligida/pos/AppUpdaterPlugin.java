package com.alazligida.pos;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * In-app APK güncelleme — GitHub Releases'tan APK indirip yükleme intent'i tetikler.
 *
 * JS API:
 *   AppUpdater.downloadAndInstall({ url })
 *   AppUpdater.canInstallUnknownSources()  // Android 8+ izin kontrolü
 *   AppUpdater.openInstallSourcesSetting() // izin verme ekranını aç
 *
 * Events:
 *   'downloadProgress' → { downloaded, total, percent }
 *   'downloadComplete' → { path }
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final String APK_FILENAME = "syntrixpos-update.apk";

    @PluginMethod
    public void canInstallUnknownSources(PluginCall call) {
        JSObject ret = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            allowed = getContext().getPackageManager().canRequestPackageInstalls();
        }
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSourcesSetting(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
                call.resolve();
            } catch (Throwable t) {
                call.reject("Ayar ekranı açılamadı: " + t.getMessage());
            }
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url parametresi gerekli");
            return;
        }

        new Thread(() -> {
            try {
                File cacheDir = getContext().getExternalCacheDir();
                if (cacheDir == null) cacheDir = getContext().getCacheDir();
                File apkFile = new File(cacheDir, APK_FILENAME);
                if (apkFile.exists()) apkFile.delete();

                HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(60000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int code = conn.getResponseCode();
                if (code >= 400) {
                    call.reject("HTTP " + code + " — APK indirilemedi");
                    return;
                }

                int total = conn.getContentLength();
                long downloaded = 0;
                long lastEmit = 0;

                try (InputStream in = conn.getInputStream();
                     FileOutputStream out = new FileOutputStream(apkFile)) {
                    byte[] buf = new byte[16 * 1024];
                    int n;
                    while ((n = in.read(buf)) != -1) {
                        out.write(buf, 0, n);
                        downloaded += n;
                        long now = System.currentTimeMillis();
                        if (now - lastEmit > 150) {
                            JSObject progress = new JSObject();
                            progress.put("downloaded", downloaded);
                            progress.put("total", total);
                            progress.put("percent", total > 0 ? (downloaded * 100.0 / total) : 0.0);
                            notifyListeners("downloadProgress", progress);
                            lastEmit = now;
                        }
                    }
                }

                // Son progress emit (100%)
                JSObject doneProgress = new JSObject();
                doneProgress.put("downloaded", downloaded);
                doneProgress.put("total", total);
                doneProgress.put("percent", 100.0);
                notifyListeners("downloadProgress", doneProgress);

                JSObject done = new JSObject();
                done.put("path", apkFile.getAbsolutePath());
                done.put("size", apkFile.length());
                notifyListeners("downloadComplete", done);

                // Install intent
                Uri apkUri = FileProvider.getUriForFile(
                        getContext(),
                        getContext().getPackageName() + ".fileprovider",
                        apkFile
                );
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                getContext().startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("ok", true);
                ret.put("path", apkFile.getAbsolutePath());
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("Güncelleme hatası: " + t.getClass().getSimpleName() + " — " + t.getMessage());
            }
        }, "AppUpdaterDownload").start();
    }
}
