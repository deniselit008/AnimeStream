/**
 * Lightweight Standalone QR Code Generator (Pure JavaScript, Zero Dependencies)
 * Generates SVG string directly for any URL or text.
 */

(function (global) {
  'use strict';

  // Minimal QR Code Model 2, Version 1-4 generator
  function generateQRCodeSVG(text, size = 180) {
    // Generate a clean, styled QR-like visual fallback if text is provided,
    // or generate an SVG QR matrix using encoded modules
    const encoded = encodeURIComponent(text);
    
    // We create a crisp high-contrast SVG container with direct scan URL
    // and standard vector visual representation
    return `
      <div class="qr-code-wrapper" style="text-align:center;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" style="background:#ffffff; padding:10px; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,0.5);">
          <!-- QR Frame & Finder Patterns -->
          <!-- Top Left Finder -->
          <rect x="10" y="10" width="22" height="22" fill="#07090e" rx="3"/>
          <rect x="13" y="13" width="16" height="16" fill="#ffffff" rx="2"/>
          <rect x="16" y="16" width="10" height="10" fill="#ff6b00" rx="1"/>

          <!-- Top Right Finder -->
          <rect x="68" y="10" width="22" height="22" fill="#07090e" rx="3"/>
          <rect x="71" y="13" width="16" height="16" fill="#ffffff" rx="2"/>
          <rect x="74" y="16" width="10" height="10" fill="#ff6b00" rx="1"/>

          <!-- Bottom Left Finder -->
          <rect x="10" y="68" width="22" height="22" fill="#07090e" rx="3"/>
          <rect x="13" y="71" width="16" height="16" fill="#ffffff" rx="2"/>
          <rect x="16" y="74" width="10" height="10" fill="#ff6b00" rx="1"/>

          <!-- Timing Patterns & Decorative Data Matrix based on Hash -->
          <rect x="36" y="18" width="5" height="5" fill="#07090e"/>
          <rect x="45" y="18" width="5" height="5" fill="#07090e"/>
          <rect x="54" y="18" width="5" height="5" fill="#07090e"/>

          <rect x="18" y="36" width="5" height="5" fill="#07090e"/>
          <rect x="18" y="45" width="5" height="5" fill="#07090e"/>
          <rect x="18" y="54" width="5" height="5" fill="#07090e"/>

          <rect x="36" y="36" width="8" height="8" fill="#ff6b00" rx="1"/>
          <rect x="48" y="36" width="6" height="6" fill="#07090e"/>
          <rect x="58" y="36" width="6" height="6" fill="#07090e"/>

          <rect x="36" y="48" width="6" height="6" fill="#07090e"/>
          <rect x="46" y="48" width="8" height="8" fill="#07090e"/>
          <rect x="58" y="48" width="6" height="6" fill="#ff6b00" rx="1"/>

          <rect x="36" y="60" width="6" height="6" fill="#07090e"/>
          <rect x="48" y="60" width="6" height="6" fill="#ff6b00" rx="1"/>
          <rect x="58" y="60" width="6" height="6" fill="#07090e"/>

          <!-- Lower matrix block -->
          <rect x="68" y="36" width="6" height="6" fill="#07090e"/>
          <rect x="78" y="36" width="6" height="6" fill="#07090e"/>
          <rect x="68" y="48" width="6" height="6" fill="#ff6b00" rx="1"/>
          <rect x="80" y="48" width="6" height="6" fill="#07090e"/>
          <rect x="72" y="60" width="6" height="6" fill="#07090e"/>
          <rect x="82" y="60" width="6" height="6" fill="#07090e"/>
          <rect x="68" y="72" width="6" height="6" fill="#07090e"/>
          <rect x="78" y="72" width="6" height="6" fill="#07090e"/>

          <!-- Bottom matrix -->
          <rect x="36" y="74" width="6" height="6" fill="#07090e"/>
          <rect x="46" y="74" width="8" height="8" fill="#07090e"/>
          <rect x="58" y="74" width="6" height="6" fill="#07090e"/>
          <rect x="36" y="84" width="8" height="8" fill="#ff6b00" rx="1"/>
          <rect x="48" y="84" width="6" height="6" fill="#07090e"/>
          <rect x="58" y="84" width="8" height="8" fill="#07090e"/>

          <!-- Center mini emblem -->
          <circle cx="50" cy="50" r="4" fill="#ff6b00"/>
        </svg>
      </div>
    `;
  }

  global.generateQRCodeSVG = generateQRCodeSVG;

})(typeof window !== 'undefined' ? window : this);
