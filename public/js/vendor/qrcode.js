/**
 * Genuine ISO/IEC 18004 QR Code Model 2 SVG Generator (Pure JavaScript, Zero Dependencies)
 * Supports Byte Mode encoding (Versions 1-6, Error Correction Level M), Reed-Solomon ECC,
 * 8-pattern optimal masking, and crisp high-contrast output with standard 4-module quiet zone.
 */
(function (global) {
  'use strict';

  // GF(256) log & antilog tables for Reed-Solomon (primitive polynomial 0x11d)
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      EXP[i] = EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  function rsGeneratorPoly(ecCount) {
    let poly = [1];
    for (let i = 0; i < ecCount; i++) {
      const next = new Array(poly.length + 1).fill(0);
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], EXP[i]);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(dataBytes, ecCount) {
    const gen = rsGeneratorPoly(ecCount);
    const res = new Uint8Array(dataBytes.length + ecCount);
    res.set(dataBytes);
    for (let i = 0; i < dataBytes.length; i++) {
      const coef = res[i];
      if (coef !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return Array.from(res.slice(dataBytes.length));
  }

  // QR Version tables for Error Correction Level M (capacity, total data bytes, ec per block, blocks)
  // Supports up to 106 UTF-8 bytes comfortably (e.g., any LAN URL or IPv6/hostname)
  const VERSIONS_M = [
    null,
    { version: 1, size: 21, dataBytes: 16, ecPerBlock: 10, blocks: [16], align: [] },
    { version: 2, size: 25, dataBytes: 28, ecPerBlock: 16, blocks: [28], align: [6, 18] },
    { version: 3, size: 29, dataBytes: 44, ecPerBlock: 26, blocks: [44], align: [6, 22] },
    { version: 4, size: 33, dataBytes: 64, ecPerBlock: 18, blocks: [32, 32], align: [6, 26] },
    { version: 5, size: 37, dataBytes: 86, ecPerBlock: 24, blocks: [43, 43], align: [6, 30] },
    { version: 6, size: 41, dataBytes: 108, ecPerBlock: 16, blocks: [27, 27, 27, 27], align: [6, 34] }
  ];

  // Format information bits for EC Level M (00) + Mask (0..7), pre-computed BCH(15,5) XOR 0x5412
  const FORMAT_INFO_M = [
    0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0
  ];

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(str));
    }
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return bytes;
  }

  function createBitBuffer() {
    const buffer = [];
    let bitLen = 0;
    return {
      put(num, len) {
        for (let i = len - 1; i >= 0; i--) {
          const bit = ((num >>> i) & 1) === 1;
          const byteIdx = Math.floor(bitLen / 8);
          if (buffer.length <= byteIdx) buffer.push(0);
          if (bit) buffer[byteIdx] |= (0x80 >>> (bitLen % 8));
          bitLen++;
        }
      },
      getLengthInBits() { return bitLen; },
      getBytes() { return buffer; }
    };
  }

  function encodeData(text) {
    const rawBytes = utf8Bytes(String(text));
    let vInfo = null;
    for (let v = 1; v < VERSIONS_M.length; v++) {
      // Need 4 bits mode (0100) + 8 bits length + 8*N bits data
      const requiredBytes = Math.ceil((4 + 8 + rawBytes.length * 8) / 8);
      if (requiredBytes <= VERSIONS_M[v].dataBytes) {
        vInfo = VERSIONS_M[v];
        break;
      }
    }
    if (!vInfo) {
      // Truncate cleanly if exceedingly long to guarantee valid scannable QR
      vInfo = VERSIONS_M[VERSIONS_M.length - 1];
    }

    const maxChars = Math.min(rawBytes.length, vInfo.dataBytes - 2);
    const bb = createBitBuffer();
    bb.put(0b0100, 4); // Byte mode indicator
    bb.put(maxChars, 8);
    for (let i = 0; i < maxChars; i++) {
      bb.put(rawBytes[i], 8);
    }

    const maxBits = vInfo.dataBytes * 8;
    // Terminator up to 4 zeros
    for (let i = 0; i < 4 && bb.getLengthInBits() < maxBits; i++) {
      bb.put(0, 1);
    }
    // Pad to byte boundary
    while (bb.getLengthInBits() % 8 !== 0) {
      bb.put(0, 1);
    }
    // Pad codewords alternating 0xEC, 0x11
    const bytes = bb.getBytes();
    let padToggle = true;
    while (bytes.length < vInfo.dataBytes) {
      bytes.push(padToggle ? 0xEC : 0x11);
      padToggle = !padToggle;
    }

    // Split into Reed-Solomon blocks and interleave
    const dataBlocks = [];
    const ecBlocks = [];
    let offset = 0;
    for (const blockLen of vInfo.blocks) {
      const slice = bytes.slice(offset, offset + blockLen);
      offset += blockLen;
      dataBlocks.push(slice);
      ecBlocks.push(rsEncode(slice, vInfo.ecPerBlock));
    }

    const codewords = [];
    const maxDataLen = Math.max(...dataBlocks.map(b => b.length));
    for (let i = 0; i < maxDataLen; i++) {
      for (const b of dataBlocks) {
        if (i < b.length) codewords.push(b[i]);
      }
    }
    for (let i = 0; i < vInfo.ecPerBlock; i++) {
      for (const b of ecBlocks) {
        if (i < b.length) codewords.push(b[i]);
      }
    }

    return { vInfo, codewords };
  }

  function buildMatrix(text) {
    const { vInfo, codewords } = encodeData(text);
    const size = vInfo.size;

    // -1 = empty, 0 = light, 1 = dark; isFunc tracks fixed function patterns
    const modules = Array.from({ length: size }, () => new Int8Array(size).fill(-1));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

    function setFunc(r, c, val) {
      if (r >= 0 && r < size && c >= 0 && c < size) {
        modules[r][c] = val ? 1 : 0;
        isFunc[r][c] = 1;
      }
    }

    // 1. Place Finder Patterns + Separators
    function placeFinder(top, left) {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const r = top + dr;
          const c = left + dc;
          if (r < 0 || r >= size || c < 0 || c >= size) continue;
          const inOuter = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6);
          const inInner = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
          setFunc(r, c, inOuter || inInner);
        }
      }
    }
    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // 2. Place Alignment Pattern (Versions 2-6 have 1 at (size-7, size-7))
    if (vInfo.align.length >= 2) {
      const center = vInfo.align[1];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const val = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
          setFunc(center + dr, center + dc, val);
        }
      }
    }

    // 3. Timing Patterns
    for (let i = 8; i < size - 8; i++) {
      const val = i % 2 === 0;
      if (!isFunc[6][i]) setFunc(6, i, val);
      if (!isFunc[i][6]) setFunc(i, 6, val);
    }

    // 4. Dark Module & Reserve Format Areas
    setFunc(size - 8, 8, true);
    for (let i = 0; i < 9; i++) {
      if (!isFunc[8][i]) setFunc(8, i, false);
      if (!isFunc[i][8]) setFunc(i, 8, false);
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunc[8][size - 1 - i]) setFunc(8, size - 1 - i, false);
      if (!isFunc[size - 1 - i][8]) setFunc(size - 1 - i, 8, false);
    }

    // 5. Place Data Bits (Zig-Zag upward/downward from bottom-right)
    let bitIndex = 0;
    const totalBits = codewords.length * 8;
    let upward = true;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5; // Skip vertical timing column
      for (let step = 0; step < size; step++) {
        const r = upward ? (size - 1 - step) : step;
        for (let lr = 0; lr < 2; lr++) {
          const c = right - lr;
          if (!isFunc[r][c]) {
            let dark = false;
            if (bitIndex < totalBits) {
              dark = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) === 1;
            }
            modules[r][c] = dark ? 1 : 0;
            bitIndex++;
          }
        }
      }
      upward = !upward;
    }

    // 6. Try all 8 mask patterns and select the lowest penalty score
    function maskBit(mask, r, c) {
      switch (mask) {
        case 0: return (r + c) % 2 === 0;
        case 1: return r % 2 === 0;
        case 2: return c % 3 === 0;
        case 3: return (r + c) % 3 === 0;
        case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
        case 5: return ((r * c) % 2 + (r * c) % 3) === 0;
        case 6: return (((r * c) % 2 + (r * c) % 3) % 2) === 0;
        case 7: return (((r + c) % 2 + (r * c) % 3) % 2) === 0;
      }
      return false;
    }

    function applyFormat(grid, mask) {
      const bits = FORMAT_INFO_M[mask];
      for (let i = 0; i < 15; i++) {
        const dark = ((bits >>> i) & 1) === 1 ? 1 : 0;
        // Vertical near top-left, horizontal near top-right
        if (i < 6) grid[i][8] = dark;
        else if (i < 8) grid[i + 1][8] = dark;
        else grid[size - 15 + i][8] = dark;

        if (i < 8) grid[8][size - 1 - i] = dark;
        else if (i < 9) grid[8][15 - i] = dark;
        else grid[8][15 - i - 1] = dark;
      }
    }

    function scorePenalty(grid) {
      let penalty = 0;
      // N1: 5+ consecutive same color in row or col
      for (let r = 0; r < size; r++) {
        let runRow = 1, runCol = 1;
        for (let c = 1; c < size; c++) {
          if (grid[r][c] === grid[r][c - 1]) runRow++;
          else { if (runRow >= 5) penalty += 3 + (runRow - 5); runRow = 1; }
          if (grid[c][r] === grid[c - 1][r]) runCol++;
          else { if (runCol >= 5) penalty += 3 + (runCol - 5); runCol = 1; }
        }
        if (runRow >= 5) penalty += 3 + (runRow - 5);
        if (runCol >= 5) penalty += 3 + (runCol - 5);
      }
      // N2: 2x2 blocks of same color
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const v = grid[r][c];
          if (v === grid[r + 1][c] && v === grid[r][c + 1] && v === grid[r + 1][c + 1]) {
            penalty += 3;
          }
        }
      }
      // N4: balance of dark vs light modules
      let darkCount = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid[r][c]) darkCount++;
        }
      }
      const percent = Math.abs(Math.round((darkCount * 100) / (size * size)) - 50);
      penalty += Math.floor(percent / 5) * 10;
      return penalty;
    }

    let bestMask = 0;
    let bestScore = Infinity;
    let bestGrid = null;

    for (let m = 0; m < 8; m++) {
      const candidate = modules.map((row, r) =>
        row.map((val, c) => (isFunc[r][c] ? val : (val ^ (maskBit(m, r, c) ? 1 : 0))))
      );
      applyFormat(candidate, m);
      const score = scorePenalty(candidate);
      if (score < bestScore) {
        bestScore = score;
        bestMask = m;
        bestGrid = candidate;
      }
    }

    return { size, grid: bestGrid };
  }

  function generateQRCodeSVG(text, sizePx = 180) {
    if (!text) return '';
    try {
      const { size, grid } = buildMatrix(String(text));
      const quiet = 4; // Mandatory 4-module white quiet zone for reliable Google Lens / Camera scanning
      const total = size + quiet * 2;

      let pathD = '';
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (grid[r][c] === 1) {
            pathD += `M${c + quiet},${r + quiet}h1v1h-1z`;
          }
        }
      }

      return `
        <div class="qr-code-wrapper" style="text-align:center; display:inline-block;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" style="background:#ffffff; border-radius:12px; display:block; box-shadow:0 8px 24px rgba(0,0,0,0.45);">
            <rect width="${total}" height="${total}" fill="#ffffff"/>
            <path d="${pathD}" fill="#000000"/>
          </svg>
        </div>
      `;
    } catch (e) {
      return '';
    }
  }

  global.generateQRCodeSVG = generateQRCodeSVG;

})(typeof window !== 'undefined' ? window : this);
