package com.animestream.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public class MainActivity extends Activity {

    private WebView webView;
    private FrameLayout customViewContainer;
    private WebChromeClient.CustomViewCallback customViewCallback;
    private View mCustomView;

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

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return false;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
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

        // Determine default URL (check saved host or default local/bundled)
        SharedPreferences prefs = getSharedPreferences("animestream_prefs", MODE_PRIVATE);
        String serverUrl = prefs.getString("server_url", "file:///android_asset/public/index.html");

        webView.loadUrl(serverUrl);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (mCustomView != null) {
                // Exit fullscreen video
                webView.getWebChromeClient().onHideCustomView();
                return true;
            }
            if (webView.canGoBack()) {
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
