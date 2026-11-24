package com.animestream.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.text.format.Formatter;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JsResult;
import android.webkit.JsPromptResult;
import android.webkit.RenderProcessGoneDetail;
import android.view.ViewGroup;
import android.util.Log;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.zip.GZIPInputStream;
import java.util.zip.InflaterInputStream;

import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View mCustomView;
    private WebViewAssetLoader assetLoader;

    private static final String[] BLOCKED_AD_HOSTS = new String[]{
        "popads", "popcash", "adcash", "clickadu", "exdynsrv", "syndication", "adrun",
        "propeller", "bet365", "onclick", "trafficjunky", "adxprts", "doubleclick",
        "adnxs", "criteo", "bidgear", "yllix", "adsterra", "monetag", "deloton",
        "deloplen", "onclasrv", "tsyndicate", "adtrue", "vidoomy", "cortahewt",
        "dirdumaigre", "sxlzbz", "adkeeper", "alwingulla", "creativecdn", "exoclick",
        "juicyads", "hilltopads", "ad-maven", "ezmob", "realsrv", "zeroredirect",
        "stape.fun", "stape.cloud", "histats", "1xbet", "mgid", "adsco.re",
        "rtmark", "outbrain", "taboola", "adtarget", "propu.sh", "notix",
        "pushwhoosh", "evadav", "clickadilla", "rollerads", "tacdn", "fastclick",
        "bidvertiser", "trafficstars", "adxpansion", "revenuehits", "clouddelivery",
        "serving-sys", "rubiconproject", "openx.net", "pubmatic", "smartadserver",
        "infolinks", "conversantmedia", "sovrn", "yieldmo",
        "flawlessimmunizeguy", "phruk", "subgumgutwise", "lumbarssweepup", "greentrafsa",
        "advtpe", "shottervills", "greatdexchange", "mdstats", "pixibay", "mc.yandex",
        "yandex.ru", "hentaijk", "highcpmgate", "coinhive", "crypto-loot",
        "chaturbate", "bongacams", "stripchat", "livejasmin", "faphouse", "spankbang",
        "eporner", "pornhub", "xvideos", "adultfriendfinder", "crakrevenue", "clickdealer",
        "ero-advertising", "plugrush", "adcolony", "applovin", "ironSource", "springserve",
        "spotxchange", "connatix", "scorecardresearch", "quantserve", "clarity.ms",
        "adblade", "adform", "casalemedia", "indexexchange", "gumgum", "kargo",
        "sharethrough", "triplelift", "nativeads", "revcontent", "zemanta", "adnow", "content.ad"
    };

    private static boolean isAdHost(String host) {
        if (host == null || host.isEmpty()) return false;
        String lower = host.toLowerCase();
        for (String ad : BLOCKED_AD_HOSTS) {
            if (lower.contains(ad)) return true;
        }
        return false;
    }

    private static boolean isAdUrl(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        if (host != null && isAdHost(host)) return true;
        String full = uri.toString().toLowerCase();
        return full.contains("/ad?type=") ||
               full.contains("/ads?") ||
               full.contains("/xads.js") ||
               full.contains("ev-static.js") ||
               full.contains("/popunder") ||
               full.contains("prebid.min.js");
    }

    public class AndroidBridge {
        private Context mContext;

        AndroidBridge(Context c) {
            mContext = c;
        }

        @JavascriptInterface
        public void openExternal(String url) {
            if (url == null || url.trim().isEmpty()) return;
            try {
                String target = url.trim();
                if (target.startsWith("//")) {
                    target = "https:" + target;
                } else if (target.startsWith("/")) {
                    target = "https://myanimelist.net" + target;
                }
                Uri parsed = Uri.parse(target);
                String scheme = parsed.getScheme();
                String host = parsed.getHost();
                if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https"))) {
                    return;
                }
                if (host != null && host.equalsIgnoreCase("appassets.androidplatform.net")) {
                    return;
                }
                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, parsed);
                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                mContext.startActivity(intent);
            } catch (Exception e) {
                Log.e("AndroidBridge", "Error opening external URL: " + url, e);
            }
        }

        @JavascriptInterface
        public void saveServerUrl(String url) {
            SharedPreferences.Editor editor = getSharedPreferences("animestream_prefs", MODE_PRIVATE).edit();
            editor.putString("server_url", url != null ? url.trim() : "");
            editor.apply();
        }

        @JavascriptInterface
        public String getServerUrl() {
            return getSharedPreferences("animestream_prefs", MODE_PRIVATE).getString("server_url", "");
        }

        @JavascriptInterface
        public String getDeviceWifiIp() {
            try {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(WIFI_SERVICE);
                if (wm != null) {
                    int ip = wm.getConnectionInfo().getIpAddress();
                    return Formatter.formatIpAddress(ip);
                }
            } catch (Exception e) {}
            return "";
        }

        @JavascriptInterface
        public void connectToServer(final String url) {
            if (url == null) return;
            final String clean = url.trim();
            try {
                Uri parsed = Uri.parse(clean);
                String scheme = parsed.getScheme();
                String host = parsed.getHost();
                if (scheme == null || (!scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https")) || host == null || host.isEmpty()) {
                    return;
                }
            } catch (Exception ignored) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveServerUrl(clean);
                    if (webView != null) {
                        webView.loadUrl(clean);
                    }
                }
            });
        }

        @JavascriptInterface
        public void resetServer() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveServerUrl("");
                    if (webView != null) {
                        webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");
                    }
                }
            });
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public String fetchUrl(String urlString, String headersJson) {
            return fetchUrlWithDepth(urlString, headersJson, 0);
        }

        private String fetchUrlWithDepth(String urlString, String headersJson, int depth) {
            if (depth > 6) {
                try {
                    JSONObject res = new JSONObject();
                    res.put("status", 310);
                    res.put("body", "Error: Demasiadas redirecciones (Too Many Redirects)");
                    return res.toString();
                } catch (Exception e) {
                    return "{\"status\":310,\"body\":\"\"}";
                }
            }
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlString);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(12000);
                conn.setReadTimeout(15000);
                conn.setInstanceFollowRedirects(true);

                // Default realistic mobile browser headers
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36");
                conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8");
                conn.setRequestProperty("Accept-Language", "es-ES,es;q=0.9,en;q=0.8");
                conn.setRequestProperty("Accept-Encoding", "gzip, deflate");

                // Apply custom headers if passed
                if (headersJson != null && !headersJson.trim().isEmpty() && !headersJson.equals("{}")) {
                    try {
                        JSONObject headers = new JSONObject(headersJson);
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) {
                            String key = keys.next();
                            conn.setRequestProperty(key, headers.getString(key));
                        }
                    } catch (Exception ignored) {}
                }

                int status = conn.getResponseCode();

                // Handle HTTP redirects manually if response code is 301, 302, 303, 307, 308
                if (status == HttpURLConnection.HTTP_MOVED_TEMP || 
                    status == HttpURLConnection.HTTP_MOVED_PERM || 
                    status == HttpURLConnection.HTTP_SEE_OTHER ||
                    status == 307 || status == 308) {
                    String location = conn.getHeaderField("Location");
                    if (location != null && !location.isEmpty()) {
                        conn.disconnect();
                        if (!location.startsWith("http://") && !location.startsWith("https://")) {
                            URL base = new URL(urlString);
                            location = new URL(base, location).toString();
                        }
                        return fetchUrlWithDepth(location, headersJson, depth + 1);
                    }
                }

                InputStream is = (status >= 400) ? conn.getErrorStream() : conn.getInputStream();
                if (is == null) {
                    JSONObject res = new JSONObject();
                    res.put("status", status);
                    res.put("body", "");
                    return res.toString();
                }

                String encoding = conn.getHeaderField("Content-Encoding");
                if (encoding != null && encoding.equalsIgnoreCase("gzip")) {
                    is = new GZIPInputStream(is);
                } else if (encoding != null && encoding.equalsIgnoreCase("deflate")) {
                    is = new InflaterInputStream(is);
                }

                BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                char[] buffer = new char[8192];
                int charsRead;
                while ((charsRead = reader.read(buffer, 0, buffer.length)) > 0) {
                    sb.append(buffer, 0, charsRead);
                }
                reader.close();

                JSONObject res = new JSONObject();
                res.put("status", status);
                res.put("body", sb.toString());
                return res.toString();

            } catch (Exception e) {
                try {
                    JSONObject err = new JSONObject();
                    err.put("status", 500);
                    err.put("error", e.getMessage() != null ? e.getMessage() : e.toString());
                    err.put("body", "");
                    return err.toString();
                } catch (Exception ex) {
                    return "{\"status\":500,\"error\":\"Network error\",\"body\":\"\"}";
                }
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark Status & Navigation Bar
        Window window = getWindow();
        window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(Color.parseColor("#07090e"));
        window.setNavigationBarColor(Color.parseColor("#07090e"));

        setContentView(R.layout.activity_main);

        customViewContainer = findViewById(R.id.custom_view_container);

        // Initialize WebViewAssetLoader to resolve local assets safely without CORS restrictions
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        initWebView();
    }

    private void initWebView() {
        if (webView == null) {
            webView = findViewById(R.id.main_webview);
            if (webView == null) {
                webView = new WebView(this);
                webView.setId(R.id.main_webview);
                FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT
                );
                ViewGroup root = findViewById(android.R.id.content);
                if (root instanceof ViewGroup) {
                    ViewGroup fl = (ViewGroup) ((ViewGroup) root).getChildAt(0);
                    if (fl != null) fl.addView(webView, 0, params);
                }
            }
        }

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        // Expose Native Android Bridge to Web JavaScript
        webView.addJavascriptInterface(new AndroidBridge(this), "AndroidBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    Uri reqUri = request.getUrl();
                    String host = reqUri.getHost();
                    // 1. Native Android HLS Player & Proxy Interceptor for AnimeAV1 (zilla-networks)
                    if ("appassets.androidplatform.net".equalsIgnoreCase(host)) {
                        String path = reqUri.getPath();
                        if (path != null && path.startsWith("/android-hls/")) {
                            return handleAndroidHlsProxy(path);
                        }
                    }

                    if (isAdUrl(reqUri)) {
                        if (webView != null) {
                            webView.post(() -> webView.evaluateJavascript(
                                "window.dispatchEvent(new CustomEvent('animestream-android-adblock-hit', {detail:'" + (host != null ? host.toLowerCase().replace("'", "") : "anuncio") + "'}))",
                                null
                            ));
                        }
                        return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
                    }
                }
                if (assetLoader != null && request != null) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request == null || request.getUrl() == null) return false;
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                String host = uri.getHost();

                // 1. Block intent:, market:, and non-web scheme redirects from crashing or taking over
                if (scheme != null && !scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https")) {
                    return true;
                }

                // 2. Block any frame navigation to known ad hosts or ad URLs
                if (isAdUrl(uri)) {
                    if (webView != null) {
                        webView.post(() -> webView.evaluateJavascript(
                            "window.dispatchEvent(new CustomEvent('animestream-android-adblock-hit', {detail:'Redirección publicitaria bloqueada'}))",
                            null
                        ));
                    }
                    return true;
                }

                // 3. Main Frame (top-level app window) navigations:
                if (request.isForMainFrame()) {
                    // Allow our local appassets domain
                    if (host != null && host.equals("appassets.androidplatform.net")) {
                        return false;
                    }

                    // If a custom remote PC server was configured, allow exact host match
                    SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
                    String serverUrl = prefs.getString("server_url", "");
                    if (isConfiguredServerHost(serverUrl, host)) {
                        return false;
                    }

                    // If external community, reference or anime source link clicked from main window, open in external Android browser
                    if (host != null) {
                        String lower = host.toLowerCase();
                        if (lower.contains("x.com") || lower.contains("twitter.com") || lower.contains("github.com") ||
                            lower.contains("myanimelist.net") || lower.contains("anilist.co") ||
                            lower.contains("animeav1.com") || lower.contains("jkanime.net") || lower.contains("tioanime.com")) {
                            try {
                                android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
                                intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(intent);
                            } catch (Exception ignored) {}
                            return true;
                        }
                    }

                    // NEVER allow third-party player iframes or ad clicks to replace our main app window!
                    return true;
                }

                // 4. Subframes (video players): allow genuine video players to render inside their iframe without triggering external app intents
                return false;
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                Log.e("MainActivity", "WebView render process gone: " + (detail != null && detail.didCrash() ? "crash" : "killed"));
                if (webView != null) {
                    ViewGroup parent = (ViewGroup) webView.getParent();
                    if (parent != null) {
                        parent.removeView(webView);
                    }
                    webView.destroy();
                    webView = null;
                }
                initWebView();
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Only redirect to unreachable screen if explicitly failing to connect to a custom remote PC server:
                if (request != null && request.isForMainFrame()) {
                    SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
                    String serverUrl = prefs.getString("server_url", "");
                    Uri failingUri = request.getUrl();
                    if (isConfiguredServerHost(serverUrl, failingUri != null ? failingUri.getHost() : null)) {
                        final WebView targetView = view != null ? view : webView;
                        if (targetView != null) {
                            targetView.post(new Runnable() {
                                @Override
                                public void run() {
                                    String redirectUrl = "https://appassets.androidplatform.net/assets/public/index.html?error=unreachable&server=" + Uri.encode(serverUrl);
                                    targetView.loadUrl(redirectUrl);
                                }
                            });
                        }
                    }
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                // Strictly block all popup windows and popunders from third-party players
                if (webView != null) {
                    webView.post(() -> webView.evaluateJavascript(
                        "window.dispatchEvent(new CustomEvent('animestream-android-adblock-hit', {detail:'Ventana emergente bloqueada'}))",
                        null
                    ));
                }
                return false;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
                if (url != null && (url.contains("appassets.androidplatform.net") || url.contains("localhost") || url.startsWith("file:"))) {
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("AnimeStream")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                    return true;
                }
                result.cancel();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
                if (url != null && (url.contains("appassets.androidplatform.net") || url.contains("localhost") || url.startsWith("file:"))) {
                    new AlertDialog.Builder(MainActivity.this)
                        .setTitle("AnimeStream")
                        .setMessage(message)
                        .setPositiveButton(android.R.string.ok, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.confirm();
                            }
                        })
                        .setNegativeButton(android.R.string.cancel, new DialogInterface.OnClickListener() {
                            @Override
                            public void onClick(DialogInterface dialog, int which) {
                                result.cancel();
                            }
                        })
                        .setOnCancelListener(new DialogInterface.OnCancelListener() {
                            @Override
                            public void onCancel(DialogInterface dialog) {
                                result.cancel();
                            }
                        })
                        .show();
                    return true;
                }
                result.cancel();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message, String defaultValue, JsPromptResult result) {
                result.cancel();
                return true;
            }
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (mCustomView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                mCustomView = view;
                customViewCallback = callback;
                customViewContainer.addView(view);
                customViewContainer.setVisibility(View.VISIBLE);
                webView.setVisibility(View.GONE);
                getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
            }

            @Override
            public void onHideCustomView() {
                if (mCustomView == null) return;
                customViewContainer.removeView(mCustomView);
                customViewContainer.setVisibility(View.GONE);
                webView.setVisibility(View.VISIBLE);
                getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                mCustomView = null;
            }
        });

        // Determine default URL (check saved host or default local bundled assets)
        SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "");

        if (serverUrl != null && !serverUrl.isEmpty() && serverUrl.startsWith("http") && !serverUrl.contains("appassets")) {
            webView.loadUrl(serverUrl);
        } else {
            webView.loadUrl("https://appassets.androidplatform.net/assets/public/index.html");
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mCustomView != null) {
                // Exit fullscreen video
                if (customViewCallback != null) {
                    customViewCallback.onCustomViewHidden();
                }
                if (mCustomView != null) {
                    customViewContainer.removeView(mCustomView);
                    customViewContainer.setVisibility(View.GONE);
                    webView.setVisibility(View.VISIBLE);
                    getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
                    mCustomView = null;
                }
                return true;
            }
            if (webView != null && webView.canGoBack()) {
                webView.goBack();
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        if (webView != null && level >= TRIM_MEMORY_MODERATE) {
            webView.clearCache(false);
        }
    }

    private static final String ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
    private final Map<String, String> hlsCookieCache = new ConcurrentHashMap<>();

    private static boolean isConfiguredServerHost(String serverUrl, String candidateHost) {
        if (serverUrl == null || serverUrl.isEmpty() || candidateHost == null || candidateHost.isEmpty()) {
            return false;
        }
        try {
            Uri configured = Uri.parse(serverUrl.trim());
            String configuredHost = configured.getHost();
            return configuredHost != null && configuredHost.equalsIgnoreCase(candidateHost);
        } catch (Exception ignored) {
            return false;
        }
    }

    private WebResourceResponse handleAndroidHlsProxy(String path) {
        Map<String, String> corsHeaders = new HashMap<>();
        corsHeaders.put("Access-Control-Allow-Origin", "*");
        corsHeaders.put("Access-Control-Allow-Methods", "GET, OPTIONS");

        try {
            if (path.startsWith("/android-hls/player/")) {
                String hash = path.replace("/android-hls/player/", "").replaceAll("[^a-fA-F0-9]", "");
                String html = "<!DOCTYPE html><html lang=\"es\"><head><meta charset=\"UTF-8\">" +
                    "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">" +
                    "<script src=\"https://appassets.androidplatform.net/assets/public/vendor/hls.min.js\"></script>" +
                    "<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}" +
                    "video{width:100%;height:100%;object-fit:contain;outline:none}" +
                    "#err{display:none;position:absolute;inset:0;color:#ef4444;background:#090d16;align-items:center;justify-content:center;text-align:center;padding:20px;font-family:sans-serif;font-weight:600}</style>" +
                    "</head><body><video id=\"v\" controls playsinline autoplay></video>" +
                    "<div id=\"err\">⚠️ No se pudo reproducir este vídeo HLS. Prueba con otro servidor.</div>" +
                    "<script>(function(){var v=document.getElementById('v'),src='https://appassets.androidplatform.net/android-hls/m3u8/" + hash + "';" +
                    "window.addEventListener('message',function(e){if(!e.data||e.data.type!=='PLAYER_CMD'||!v)return;var d=e.data;" +
                    "if(d.cmd==='seek_relative'){var s=d.seconds!==undefined?d.seconds:(d.delta!==undefined?d.delta:10);v.currentTime=Math.max(0,Math.min(v.duration||999999,(v.currentTime||0)+s));}" +
                    "else if(d.cmd==='seek_forward'){v.currentTime=Math.max(0,Math.min(v.duration||999999,(v.currentTime||0)+10));}" +
                    "else if(d.cmd==='seek_backward'){v.currentTime=Math.max(0,Math.min(v.duration||999999,(v.currentTime||0)-10));}" +
                    "else if(d.cmd==='seek_to'){var s=(typeof d.seconds==='number'&&!isNaN(d.seconds)&&d.seconds>=0)?d.seconds:0;if(v.readyState>=1){v.currentTime=Math.max(0,Math.min(v.duration||999999,s));}else{v.addEventListener('loadedmetadata',function(){v.currentTime=Math.max(0,Math.min(v.duration||999999,s));},{once:true});}}" +
                    "else if(d.cmd==='set_rate'){v.playbackRate=parseFloat(d.rate)||1.0;}" +
                    "else if(d.cmd==='play'){if(v.paused)v.play();}" +
                    "else if(d.cmd==='pause'){if(!v.paused)v.pause();}" +
                    "else if(d.cmd==='toggle_play'){if(v.paused)v.play();else v.pause();}" +
                    "else if(d.cmd==='toggle_mute'){v.muted=!v.muted;}" +
                    "else if(d.cmd==='volume_up'){v.volume=Math.min(1,Math.round(((v.volume||1)+0.05)*100)/100);}" +
                    "else if(d.cmd==='volume_down'){v.volume=Math.max(0,Math.round(((v.volume||1)-0.05)*100)/100);}" +
                    "});" +
                    "v.addEventListener('timeupdate',function(){try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'ANIMESTREAM_TIME_UPDATE',currentTime:v.currentTime,duration:v.duration||0,playbackRate:v.playbackRate||1.0},'*');}}catch(_){}});" +
                    "v.addEventListener('pause',function(){try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'ANIMESTREAM_PAUSE'},'*');}}catch(_){}});" +
                    "v.addEventListener('ended',function(){try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:'ANIMESTREAM_ENDED'},'*');}}catch(_){}});" +
                    "if(window.Hls&&Hls.isSupported()){var h=new Hls({maxBufferLength:30,enableWorker:true});h.loadSource(src);h.attachMedia(v);" +
                    "h.on(Hls.Events.MANIFEST_PARSED,function(){v.play().catch(function(){});});" +
                    "h.on(Hls.Events.ERROR,function(e,d){if(d.fatal){if(d.type===Hls.ErrorTypes.NETWORK_ERROR)h.startLoad();" +
                    "else if(d.type===Hls.ErrorTypes.MEDIA_ERROR)h.recoverMediaError();" +
                    "else{document.getElementById('err').style.display='flex';h.destroy();}}});}" +
                    "else if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=src;v.play().catch(function(){});}})();</script></body></html>";
                corsHeaders.put("Cache-Control", "no-store");
                return new WebResourceResponse("text/html", "UTF-8", 200, "OK", corsHeaders, new ByteArrayInputStream(html.getBytes(StandardCharsets.UTF_8)));
            }

            if (path.startsWith("/android-hls/m3u8/")) {
                String hash = path.replace("/android-hls/m3u8/", "").replaceAll("[^a-fA-F0-9]", "");
                if (hash.isEmpty()) return null;

                // 1. Pre-warm /play/<hash> to collect session cookies
                String cookieHeader = hlsCookieCache.get(hash);
                try {
                    URL playUrl = new URL("https://player.zilla-networks.com/play/" + hash);
                    HttpURLConnection playConn = (HttpURLConnection) playUrl.openConnection();
                    playConn.setConnectTimeout(7000);
                    playConn.setReadTimeout(7000);
                    playConn.setRequestProperty("User-Agent", ANDROID_UA);
                    playConn.setRequestProperty("Referer", "https://animeav1.com/");
                    playConn.getResponseCode();
                    List<String> setCookies = playConn.getHeaderFields().get("Set-Cookie");
                    if (setCookies != null && !setCookies.isEmpty()) {
                        StringBuilder ck = new StringBuilder();
                        for (String sc : setCookies) {
                            String pair = sc.split(";", 2)[0];
                            if (ck.length() > 0) ck.append("; ");
                            ck.append(pair);
                        }
                        cookieHeader = ck.toString();
                        hlsCookieCache.put(hash, cookieHeader);
                    }
                    playConn.disconnect();
                } catch (Exception ignored) {}

                // 2. Fetch .m3u8 manifest
                URL m3u8Url = new URL("https://player.zilla-networks.com/m3u8/" + hash);
                HttpURLConnection mConn = (HttpURLConnection) m3u8Url.openConnection();
                StringBuilder sb = new StringBuilder();
                try {
                    mConn.setConnectTimeout(12000);
                    mConn.setReadTimeout(12000);
                    mConn.setRequestProperty("User-Agent", ANDROID_UA);
                    mConn.setRequestProperty("Referer", "https://player.zilla-networks.com/play/" + hash);
                    mConn.setRequestProperty("Origin", "https://player.zilla-networks.com");
                    if (cookieHeader != null && !cookieHeader.isEmpty()) {
                        mConn.setRequestProperty("Cookie", cookieHeader);
                    }

                    InputStream is = mConn.getInputStream();
                    String enc = mConn.getHeaderField("Content-Encoding");
                    if ("gzip".equalsIgnoreCase(enc)) is = new GZIPInputStream(is);
                    else if ("deflate".equalsIgnoreCase(enc)) is = new InflaterInputStream(is);

                    BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                    String line;
                    java.util.regex.Pattern uriPattern = java.util.regex.Pattern.compile("URI=\"([^\"]+)\"");
                    while ((line = br.readLine()) != null) {
                        if (line.contains("https://player.zilla-networks.com/segs/" + hash + "/")) {
                            line = line.replace("https://player.zilla-networks.com/segs/" + hash + "/",
                                "https://appassets.androidplatform.net/android-hls/seg/" + hash + "/");
                        } else if (line.startsWith("#")) {
                            java.util.regex.Matcher m = uriPattern.matcher(line);
                            StringBuffer uriBuf = new StringBuffer();
                            while (m.find()) {
                                String uriVal = m.group(1);
                                if (uriVal != null && !uriVal.startsWith("https://appassets.androidplatform.net/android-hls/") && !uriVal.startsWith("http://") && !uriVal.startsWith("https://")) {
                                    String cleanUri = uriVal.replaceFirst("^/segs/[^/]+/", "").split("\\?", 2)[0].replaceAll("[^a-zA-Z0-9_\\-\\.]", "");
                                    if (!cleanUri.isEmpty()) {
                                        m.appendReplacement(uriBuf, "URI=\"https://appassets.androidplatform.net/android-hls/seg/" + hash + "/" + cleanUri + "\"");
                                        continue;
                                    }
                                }
                                m.appendReplacement(uriBuf, java.util.regex.Matcher.quoteReplacement(m.group(0)));
                            }
                            m.appendTail(uriBuf);
                            line = uriBuf.toString();
                        } else if (line.startsWith("/segs/" + hash + "/")) {
                            line = "https://appassets.androidplatform.net/android-hls/seg/" + hash + "/" + line.substring(("/segs/" + hash + "/").length());
                        } else if (!line.isEmpty() && !line.startsWith("#") && !line.startsWith("http")) {
                            line = "https://appassets.androidplatform.net/android-hls/seg/" + hash + "/" + line;
                        }
                        sb.append(line).append("\n");
                    }
                    br.close();
                } finally {
                    mConn.disconnect();
                }

                corsHeaders.put("Cache-Control", "public, max-age=300");
                return new WebResourceResponse("application/vnd.apple.mpegurl", "UTF-8", 200, "OK", corsHeaders,
                    new ByteArrayInputStream(sb.toString().getBytes(StandardCharsets.UTF_8)));
            }

            if (path.startsWith("/android-hls/seg/")) {
                String rest = path.replace("/android-hls/seg/", "");
                int slash = rest.indexOf('/');
                if (slash <= 0) return null;
                String hash = rest.substring(0, slash).replaceAll("[^a-fA-F0-9]", "");
                String file = rest.substring(slash + 1).replaceAll("[^a-zA-Z0-9_\\-\\.]", "");
                if (hash.isEmpty() || file.isEmpty() || ".".equals(file) || "..".equals(file) || file.contains("..")) return null;

                URL segUrl = new URL("https://player.zilla-networks.com/segs/" + hash + "/" + file);
                HttpURLConnection sConn = (HttpURLConnection) segUrl.openConnection();
                sConn.setConnectTimeout(12000);
                sConn.setReadTimeout(20000);
                sConn.setRequestProperty("User-Agent", ANDROID_UA);
                sConn.setRequestProperty("Referer", "https://player.zilla-networks.com/play/" + hash);
                sConn.setRequestProperty("Origin", "https://player.zilla-networks.com");
                String cookieHeader = hlsCookieCache.get(hash);
                if (cookieHeader != null && !cookieHeader.isEmpty()) {
                    sConn.setRequestProperty("Cookie", cookieHeader);
                }

                String mime = file.endsWith(".ts") ? "video/mp2t" : (file.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "application/octet-stream");
                int segCode = sConn.getResponseCode();
                InputStream segStream = (segCode >= 400) ? sConn.getErrorStream() : sConn.getInputStream();
                if (segStream == null) {
                    segStream = new ByteArrayInputStream(new byte[0]);
                }
                corsHeaders.put("Cache-Control", segCode < 400 ? "public, max-age=86400" : "no-store");
                return new WebResourceResponse(mime, null, segCode, segCode < 400 ? "OK" : "Error", corsHeaders, segStream);
            }
        } catch (Exception ignored) {}
        return null;
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
