package com.animestream.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
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
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.zip.GZIPInputStream;

import org.json.JSONObject;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View mCustomView;
    private WebViewAssetLoader assetLoader;

    public class AndroidBridge {
        private Context mContext;

        AndroidBridge(Context c) {
            mContext = c;
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
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    saveServerUrl(url);
                    if (webView != null) {
                        webView.loadUrl(url);
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
                        return fetchUrl(location, headersJson);
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

        webView = findViewById(R.id.main_webview);
        customViewContainer = findViewById(R.id.custom_view_container);

        // Initialize WebViewAssetLoader to resolve local assets safely without CORS restrictions
        assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

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
        settings.setSupportMultipleWindows(false);

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
                    if (host != null) {
                        String lowerHost = host.toLowerCase();
                        // Block intrusive ad networks, clickjackers, and popunders that hijack video players
                        if (lowerHost.contains("popads") || lowerHost.contains("adcash") ||
                            lowerHost.contains("clickadu") || lowerHost.contains("exdynsrv") ||
                            lowerHost.contains("syndication") || lowerHost.contains("adrun") ||
                            lowerHost.contains("propeller") || lowerHost.contains("bet365") ||
                            lowerHost.contains("onclick") || lowerHost.contains("trafficjunky") ||
                            lowerHost.contains("adxprts") || lowerHost.contains("doubleclick") ||
                            lowerHost.contains("adnxs") || lowerHost.contains("criteo") ||
                            lowerHost.contains("bidgear") || lowerHost.contains("yllix") ||
                            lowerHost.contains("adsterra") || lowerHost.contains("monetag")) {
                            return new WebResourceResponse("text/plain", "UTF-8", new java.io.ByteArrayInputStream(new byte[0]));
                        }
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

                // Block intent:, market:, and non-web scheme redirects from crashing or taking over
                if (scheme != null && !scheme.equalsIgnoreCase("http") && !scheme.equalsIgnoreCase("https")) {
                    return true;
                }

                // If request is for the main frame (top-level app window):
                if (request.isForMainFrame()) {
                    // Allow our local appassets domain
                    if (host != null && host.equals("appassets.androidplatform.net")) {
                        return false;
                    }

                    // If a custom remote PC server was configured, allow it
                    SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
                    String serverUrl = prefs.getString("server_url", "");
                    if (serverUrl != null && !serverUrl.isEmpty() && host != null && serverUrl.contains(host)) {
                        return false;
                    }

                    // If external community link (X/Twitter, GitHub), open outside in Android browser / native app
                    if (host != null && (host.contains("x.com") || host.contains("twitter.com") || host.contains("github.com"))) {
                        try {
                            android.content.Intent intent = new android.content.Intent(android.content.Intent.ACTION_VIEW, uri);
                            startActivity(intent);
                        } catch (Exception ignored) {}
                        return true;
                    }

                    // NEVER allow third-party player iframes or ad clicks to replace our main app window!
                    return true;
                }

                // Subframes (video players): allow them to load their video player embeds
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Only redirect to unreachable screen if explicitly failing to connect to a custom remote PC server:
                if (request != null && request.isForMainFrame()) {
                    SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
                    String serverUrl = prefs.getString("server_url", "");
                    Uri failingUri = request.getUrl();
                    if (serverUrl != null && !serverUrl.isEmpty() && failingUri != null && serverUrl.contains(failingUri.getHost())) {
                        webView.post(new Runnable() {
                            @Override
                            public void run() {
                                String redirectUrl = "https://appassets.androidplatform.net/assets/public/index.html?error=unreachable&server=" + Uri.encode(serverUrl);
                                webView.loadUrl(redirectUrl);
                            }
                        });
                    }
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                // Block all popup windows from video player iframes so they never hijack the app
                return false;
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
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}
