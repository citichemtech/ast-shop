/* ============================================================ รับเงิน

   สองเรื่องอยู่ในไฟล์นี้
     1. QR พร้อมเพย์ที่ "ล็อกยอดไว้แล้ว" — ลูกค้าสแกนแล้วจำนวนเงินขึ้นเอง
        ไม่ต้องพิมพ์ ซึ่งเป็นจุดที่โอนผิดยอดกันบ่อยที่สุด
     2. สลิปโอนเงิน — เก็บไฟล์ลงไดรฟ์แล้วผูกกับเลขออเดอร์

   ทำไมเขียนตัวสร้าง QR เอง ไม่เรียกไลบรารีข้างนอก
     - หน้าเว็บของ Apps Script โหลดสคริปต์จาก CDN ได้ก็จริง แต่วันที่ CDN ล่ม
       หรือถูกบล็อก QR จะหายไปเงียบ ๆ แล้วร้านจะเก็บเงินไม่ได้โดยไม่รู้ตัว
     - ทางที่ Google เคยให้ใช้ (chart.googleapis.com) ประกาศเลิกทำไปแล้ว
   ตัวนี้จึงเข้ารหัสเองทั้งหมด ไม่ต่อเน็ตออกไปไหน และมีข้อสอบใน t_pay.js
   เทียบกับไลบรารี qrcode ของ Python ทีละช่องว่าออกมาเหมือนกันเป๊ะทุกเวอร์ชัน
   ทุกหน้ากาก รวมทั้งเทียบกับ QR ใบจริงที่ธนาคารออกให้ร้านด้วย
*/

/* ---------------------------------------------------------------- พร้อมเพย์ */

/**
 * CRC-16/CCITT-FALSE (poly 0x1021 ตั้งต้น 0xFFFF ไม่กลับบิต ไม่ xor ท้าย)
 * EMVCo กำหนดตัวนี้ตัวเดียว ใช้ CRC พันธุ์อื่นแล้วแอปธนาคารจะบอกว่า QR เสีย
 */
function ppCrc16_(s) {
  var crc = 0xFFFF;
  for (var i = 0; i < s.length; i++) {
    crc ^= (s.charCodeAt(i) & 0xFF) << 8;
    for (var b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
    }
  }
  var hex = crc.toString(16).toUpperCase();
  while (hex.length < 4) hex = '0' + hex;
  return hex;
}

/** ช่องหนึ่งช่องในรูปแบบ EMVCo — เลขแท็ก + ความยาวสองหลัก + ค่า */
function ppField_(tag, val) {
  var v = String(val);
  if (v.length > 99) throw new Error('ช่อง ' + tag + ' ยาวเกินที่ QR พร้อมเพย์รับได้');
  return tag + (v.length < 10 ? '0' + v.length : '' + v.length) + v;
}

/**
 * อ่านสิ่งที่เจ้าของร้านกรอกให้เป็นปลายทางพร้อมเพย์
 *
 * รับสามแบบ — เบอร์มือถือ · เลขบัตรประชาชน/ผู้เสียภาษี · เลข e-Wallet
 * อ่านไม่ออกให้คืน null ห้ามเดาเป็นแบบใดแบบหนึ่ง เพราะเดาผิดหนึ่งครั้ง
 * คือเงินของลูกค้าโอนเข้าบัญชีคนอื่นจริง ๆ แล้วตามคืนแทบไม่ได้
 */
function ppTarget_(raw) {
  var d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  /* เบอร์มือถือ เขียนได้หลายแบบ ทุกแบบต้องกลายเป็น 0066 + เก้าหลักท้าย */
  if (d.length === 10 && d.charAt(0) === '0') return { tag: '01', val: '0066' + d.substring(1), kind: 'เบอร์มือถือ' };
  if (d.length === 11 && d.substring(0, 2) === '66') return { tag: '01', val: '00' + d, kind: 'เบอร์มือถือ' };
  if (d.length === 13 && d.substring(0, 4) === '0066') return { tag: '01', val: d, kind: 'เบอร์มือถือ' };
  if (d.length === 13) return { tag: '02', val: d, kind: 'เลขผู้เสียภาษี/บัตรประชาชน' };
  if (d.length === 15) return { tag: '03', val: d, kind: 'e-Wallet' };
  return null;
}

/**
 * ข้อความที่อยู่ใน QR พร้อมเพย์
 * ใส่ยอด = QR ครั้งเดียว (แท็ก 01 เป็น 12) · ไม่ใส่ยอด = QR ถาวร (เป็น 11)
 */
function ppPayload_(rawId, amount) {
  var t = ppTarget_(rawId);
  if (!t) {
    throw new Error('เลขพร้อมเพย์ "' + rawId + '" อ่านไม่ออก — ต้องเป็นเบอร์มือถือ 10 หลัก ' +
      'เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก หรือเลข e-Wallet 15 หลัก');
  }
  var amt = Number(amount || 0);
  if (!isFinite(amt) || amt < 0) throw new Error('ยอดเงินใน QR ไม่ถูกต้อง');
  var dyn = amt > 0;
  var body = ppField_('00', '01') +
    ppField_('01', dyn ? '12' : '11') +
    ppField_('29', ppField_('00', 'A000000677010111') + ppField_(t.tag, t.val)) +
    ppField_('53', '764') +
    (dyn ? ppField_('54', amt.toFixed(2)) : '') +
    ppField_('58', 'TH');
  var s = body + '6304';
  return s + ppCrc16_(s);
}

/* ------------------------------------------------------------------- QR

   รองรับเวอร์ชัน 1–10 ระดับกันพลาด M ซึ่งเกินพอสำหรับพร้อมเพย์
   (ข้อความยาวสุดราว 80 ตัว = เวอร์ชัน 4) ยาวกว่านั้นให้ล้มพร้อมบอกเหตุ
   ไม่ใช่ตัดข้อความทิ้งแล้วออก QR ที่สแกนได้แต่โอนผิด                        */

var QR_EXP = [];
var QR_LOG = [];
(function () {
  var x = 1;
  for (var i = 0; i < 255; i++) {
    QR_EXP[i] = x;
    QR_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (var j = 255; j < 512; j++) QR_EXP[j] = QR_EXP[j - 255];
})();

function qrMul_(a, b) {
  if (a === 0 || b === 0) return 0;
  return QR_EXP[QR_LOG[a] + QR_LOG[b]];
}

/* เวอร์ชัน: [จำนวนช่องกันพลาดต่อบล็อก, บล็อกกลุ่ม1, ข้อมูลต่อบล็อกกลุ่ม1, บล็อกกลุ่ม2, ข้อมูลต่อบล็อกกลุ่ม2] */
var QR_ECC_M = {
  1: [10, 1, 16, 0, 0], 2: [16, 1, 28, 0, 0], 3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0], 5: [24, 2, 43, 0, 0], 6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0], 8: [22, 2, 38, 2, 39], 9: [22, 3, 36, 2, 37],
  10: [26, 4, 43, 1, 44]
};
var QR_ALIGN = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
  6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50]
};
var QR_VERINFO = { 7: 0x07C94, 8: 0x085BC, 9: 0x09A99, 10: 0x0A4D3 };

/** ข้อความ -> ไบต์ UTF-8 (พร้อมเพย์เป็น ASCII ล้วน แต่ทำให้ครบไว้ก่อน) */
function qrUtf8_(s) {
  var out = [];
  var esc = encodeURIComponent(String(s));
  for (var i = 0; i < esc.length; i++) {
    if (esc.charAt(i) === '%') { out.push(parseInt(esc.substr(i + 1, 2), 16)); i += 2; }
    else out.push(esc.charCodeAt(i));
  }
  return out;
}

function qrDataCw_(ver) {
  var e = QR_ECC_M[ver];
  return e[1] * e[2] + e[3] * e[4];
}

function qrPickVersion_(nbytes) {
  for (var v = 1; v <= 10; v++) {
    var head = 4 + (v < 10 ? 8 : 16);
    if (head + nbytes * 8 <= qrDataCw_(v) * 8) return v;
  }
  throw new Error('ข้อความยาวเกินกว่าที่ QR ขนาดนี้จะเก็บได้ (' + nbytes + ' ไบต์)');
}

/** ตัวหารสำหรับคำนวณช่องกันพลาด */
function qrGenPoly_(n) {
  var g = [1];
  for (var i = 0; i < n; i++) {
    var ng = [];
    for (var z = 0; z < g.length + 1; z++) ng[z] = 0;
    for (var j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= qrMul_(g[j], QR_EXP[i]);
    }
    g = ng;
  }
  return g;
}

function qrEcc_(data, n) {
  var g = qrGenPoly_(n);
  var res = data.slice();
  for (var z = 0; z < n; z++) res.push(0);
  for (var i = 0; i < data.length; i++) {
    var f = res[i];
    if (f === 0) continue;
    for (var j = 0; j < g.length; j++) res[i + j] ^= qrMul_(g[j], f);
  }
  return res.slice(data.length);
}

/** ข้อความ -> ช่องข้อมูลทั้งหมดเรียงสลับบล็อกตามมาตรฐาน */
function qrCodewords_(bytes, ver) {
  var spec = QR_ECC_M[ver];
  var eccLen = spec[0], nb1 = spec[1], d1 = spec[2], nb2 = spec[3], d2 = spec[4];
  var total = qrDataCw_(ver);

  /* ต่อบิต: โหมดไบต์ (0100) + ความยาว + ข้อมูล */
  var bits = [];
  function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >> i) & 1); }
  put(4, 4);
  put(bytes.length, ver < 10 ? 8 : 16);
  for (var i = 0; i < bytes.length; i++) put(bytes[i], 8);

  var cap = total * 8;
  for (var t = 0; t < 4 && bits.length < cap; t++) bits.push(0);   // ตัวปิดท้าย
  while (bits.length % 8) bits.push(0);

  var cw = [];
  for (var b = 0; b < bits.length; b += 8) {
    var v = 0;
    for (var k = 0; k < 8; k++) v = (v << 1) | bits[b + k];
    cw.push(v);
  }
  var padPair = [0xEC, 0x11];
  for (var p = 0; cw.length < total; p++) cw.push(padPair[p % 2]);

  /* แบ่งบล็อก คิดช่องกันพลาดของแต่ละบล็อก แล้วเรียงสลับ */
  var blocks = [], ecc = [], at = 0, n;
  for (n = 0; n < nb1; n++) { blocks.push(cw.slice(at, at + d1)); at += d1; }
  for (n = 0; n < nb2; n++) { blocks.push(cw.slice(at, at + d2)); at += d2; }
  for (n = 0; n < blocks.length; n++) ecc.push(qrEcc_(blocks[n], eccLen));

  var out = [], maxD = Math.max(d1, d2), c;
  for (c = 0; c < maxD; c++) {
    for (n = 0; n < blocks.length; n++) if (c < blocks[n].length) out.push(blocks[n][c]);
  }
  for (c = 0; c < eccLen; c++) {
    for (n = 0; n < ecc.length; n++) out.push(ecc[n][c]);
  }
  return out;
}

function qrBlank_(size, v) {
  var m = [], i, j;
  for (i = 0; i < size; i++) { m[i] = []; for (j = 0; j < size; j++) m[i][j] = v; }
  return m;
}

/**
 * ลายตายตัวของ QR — ตาสามมุม เส้นจังหวะ ลายจัดตำแหน่ง ช่องดำถาวร และที่จองของข้อมูลกำกับ
 *
 * คืน fn มาด้วยว่าช่องไหน "ไม่ใช่ช่องข้อมูล" ช่องพวกนี้ห้ามวางบิตข้อมูลทับ
 * และห้ามโดนหน้ากากด้วย ลืมข้อหลังเมื่อไรตาสามมุมจะลายจนกล้องหาไม่เจอ
 */
function qrFrame_(ver) {
  var size = 17 + 4 * ver;
  var m = qrBlank_(size, 0);
  var fn = qrBlank_(size, false);
  var i, j, r, c;

  function set(r2, c2, v) { m[r2][c2] = v; fn[r2][c2] = true; }

  function finder(top, left) {
    for (i = -1; i <= 7; i++) {
      for (j = -1; j <= 7; j++) {
        r = top + i; c = left + j;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        var on = (i >= 0 && i <= 6 && (j === 0 || j === 6)) ||
                 (j >= 0 && j <= 6 && (i === 0 || i === 6)) ||
                 (i >= 2 && i <= 4 && j >= 2 && j <= 4);
        set(r, c, on ? 1 : 0);
      }
    }
  }
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);

  for (i = 8; i < size - 8; i++) {          /* เส้นจังหวะ */
    var tv = (i % 2 === 0) ? 1 : 0;
    set(6, i, tv); set(i, 6, tv);
  }

  /* ลายจัดตำแหน่ง — ข้ามเฉพาะสามจุดที่ทับตาสามมุม ห้ามข้ามจุดที่แค่ทับเส้นจังหวะ
     (เช่นเวอร์ชัน 7 จุด 6,22 อยู่บนเส้นจังหวะพอดี แต่ต้องมี ไม่งั้นสแกนไม่ผ่าน) */
  var ac = QR_ALIGN[ver], lastC = ac.length ? ac[ac.length - 1] : 0;
  for (var a = 0; a < ac.length; a++) {
    for (var b = 0; b < ac.length; b++) {
      var cy = ac[a], cx = ac[b];
      if ((cy === 6 && cx === 6) || (cy === 6 && cx === lastC) || (cy === lastC && cx === 6)) continue;
      for (i = -2; i <= 2; i++) {
        for (j = -2; j <= 2; j++) set(cy + i, cx + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0);
      }
    }
  }

  /* ช่องดำถาวร — ตอนนี้ใส่ 0 ไว้ก่อน ค่าจริงเติมพร้อมข้อมูลกำกับ
     เพราะตอนให้คะแนนเลือกหน้ากาก ช่องกำกับทั้งหมดต้องเป็นศูนย์ */
  set(size - 8, 8, 0);

  /* จองที่ข้อมูลกำกับ ค่าจริงเติมทีหลังตอนรู้แล้วว่าใช้หน้ากากไหน */
  for (i = 0; i <= 8; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); }
  for (i = 0; i < 8; i++) {
    if (!fn[8][size - 1 - i]) set(8, size - 1 - i, 0);
    if (!fn[size - 1 - i][8]) set(size - 1 - i, 8, 0);
  }
  if (ver >= 7) {
    for (i = 0; i < 6; i++) {
      for (j = 0; j < 3; j++) { set(i, size - 11 + j, 0); set(size - 11 + j, i, 0); }
    }
  }
  return { m: m, fn: fn };
}

/** ไล่วางบิตข้อมูลแบบซิกแซกจากขวาล่างขึ้นไป ข้ามคอลัมน์เส้นจังหวะและช่องลายตายตัว */
function qrPlace_(m, fn, cw) {
  var size = m.length, bit = 0, up = true, r, i;
  var bits = [];
  for (i = 0; i < cw.length; i++) for (var k = 7; k >= 0; k--) bits.push((cw[i] >> k) & 1);

  for (var col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (var n = 0; n < size; n++) {
      r = up ? (size - 1 - n) : n;
      for (var s = 0; s < 2; s++) {
        var c = col - s;
        if (fn[r][c]) continue;
        m[r][c] = bit < bits.length ? bits[bit] : 0;
        bit++;
      }
    }
    up = !up;
  }
}

function qrMaskBit_(k, i, j) {
  switch (k) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
  }
}

/** ข้อมูลกำกับ 15 บิต — ระดับกันพลาด M คือ 00 ต่อท้ายด้วยเลขหน้ากาก แล้วใส่รหัสกันอ่านผิด */
function qrFormatBits_(mask) {
  var v = (0 << 3) | mask;
  var d = v << 10;
  for (var i = 14; i >= 10; i--) if ((d >> i) & 1) d ^= 0x537 << (i - 10);
  return ((v << 10) | d) ^ 0x5412;
}

function qrPutFormat_(m, mask) {
  var size = m.length, f = qrFormatBits_(mask), i, bit;
  for (i = 0; i < 15; i++) {
    bit = (f >> i) & 1;
    if (i < 6) m[i][8] = bit;
    else if (i < 8) m[i + 1][8] = bit;
    else m[size - 15 + i][8] = bit;

    if (i < 8) m[8][size - i - 1] = bit;
    else if (i < 9) m[8][7] = bit;
    else m[8][14 - i] = bit;
  }
  m[size - 8][8] = 1;
}

function qrPutVersion_(m, ver) {
  if (ver < 7) return;
  var size = m.length, v = QR_VERINFO[ver];
  for (var i = 0; i < 18; i++) {
    var bit = (v >> i) & 1;
    var r = Math.floor(i / 3), c = i % 3;
    m[r][size - 11 + c] = bit;
    m[size - 11 + c][r] = bit;
  }
}

/** คะแนนโทษตามมาตรฐาน ยิ่งน้อยยิ่งอ่านง่าย ใช้ตัดสินว่าจะใช้หน้ากากไหน */
function qrPenalty_(m) {
  var size = m.length, score = 0, i, j, run, last, dark = 0;

  for (i = 0; i < size; i++) {
    run = 1; last = -1;
    for (j = 0; j < size; j++) {
      if (m[i][j] === last) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
      else { run = 1; last = m[i][j]; }
      if (m[i][j]) dark++;
    }
    run = 1; last = -1;
    for (j = 0; j < size; j++) {
      if (m[j][i] === last) { run++; if (run === 5) score += 3; else if (run > 5) score++; }
      else { run = 1; last = m[j][i]; }
    }
  }

  for (i = 0; i < size - 1; i++) {
    for (j = 0; j < size - 1; j++) {
      var s = m[i][j] + m[i][j + 1] + m[i + 1][j] + m[i + 1][j + 1];
      if (s === 0 || s === 4) score += 3;
    }
  }

  /* ลาย 1:1:3:1:1 คั่นด้วยที่ว่างสี่ช่อง — หลอกให้กล้องนึกว่าเป็นตาสามมุม */
  var pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  function run11(get, n) {
    var fw = true, bw = true;
    for (var k = 0; k < 11; k++) {
      if (get(n + k) !== pat[k]) fw = false;
      if (get(n + k) !== pat[10 - k]) bw = false;
    }
    return (fw ? 1 : 0) + (bw ? 1 : 0);
  }
  for (i = 0; i < size; i++) {
    for (j = 0; j + 10 < size; j++) {
      score += 40 * run11(rowGet(m, i), j);
      score += 40 * run11(colGet(m, i), j);
    }
  }

  var pct = dark * 100 / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

function rowGet(m, r) { return function (x) { return m[r][x]; }; }
function colGet(m, c) { return function (x) { return m[x][c]; }; }

/**
 * ข้อความ -> ตารางจุด คืนเป็นแถวของ "0"/"1" (ส่งข้ามไปหน้าจอได้เบา ๆ)
 * ไม่ใส่ขอบขาว — คนวาดเว้นขอบเอง จะได้คุมขนาดบนจอกับบนกระดาษแยกกันได้
 */
function qrModules_(text, forceMask, forceVer) {
  var bytes = qrUtf8_(text);
  var ver = forceVer || qrPickVersion_(bytes.length);
  var cw = qrCodewords_(bytes, ver);

  /* real=false คือรูปที่เอาไว้ให้คะแนนเฉย ๆ ช่องข้อมูลกำกับยังเป็นศูนย์อยู่
     ถ้าเผลอเติมค่าจริงก่อนให้คะแนน จะเลือกหน้ากากคนละอันกับตัวมาตรฐาน */
  function build(k, real) {
    var fr = qrFrame_(ver), i, j;
    qrPlace_(fr.m, fr.fn, cw);
    for (i = 0; i < fr.m.length; i++) {
      for (j = 0; j < fr.m.length; j++) {
        if (fr.fn[i][j]) continue;
        if (qrMaskBit_(k, i, j)) fr.m[i][j] ^= 1;
      }
    }
    if (real) { qrPutFormat_(fr.m, k); qrPutVersion_(fr.m, ver); }
    return fr.m;
  }

  var mask = (forceMask === 0 || forceMask) ? forceMask : -1;
  if (mask < 0) {
    var bestScore = -1;
    for (var z = 0; z < 8; z++) {
      var sc = qrPenalty_(build(z, false));
      if (bestScore < 0 || sc < bestScore) { bestScore = sc; mask = z; }
    }
  }

  var m = build(mask, true), rows = [];
  for (var r = 0; r < m.length; r++) rows.push(m[r].join(''));
  return rows;
}


/* ======================================================= เรียกเก็บเงิน */

var SLIP_FOLDER_PROP = 'SLIP_FOLDER_ID';
var SLIP_FOLDER_NAME = 'AST_สลิปโอนเงิน';

var SLIP_WAIT = 'รอตรวจสอบ';
var SLIP_OK = 'ยืนยันแล้ว';
var SLIP_BAD = 'ไม่ใช่ของใบนี้';
var SLIP_STATUS = [SLIP_WAIT, SLIP_OK, SLIP_BAD];

/** ไฟล์ที่รับ — สลิปคือรูปถ่ายหรือ PDF จากแอปธนาคาร นอกจากนี้ไม่รับ */
var SLIP_MIME = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
  'application/pdf': 'pdf'
};
var SLIP_MAX_BYTES = 10 * 1024 * 1024;

/** ออเดอร์ใบเดียว อ่านอย่างเดียว — ล้มพร้อมบอกเลขใบถ้าไม่มีจริง */
function payOrder_(orderNo) {
  var no = String(orderNo || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าเป็นออเดอร์ใบไหน');
  var rows = readOrders_({ limit: 0, match: function (o) { return o.no === no; } });
  if (!rows.length) throw new Error('ไม่พบออเดอร์ ' + no + ' ในชีท');
  return rows[0];
}

/** ใบนี้ออก VAT ไหม — ตัวตัดสินว่าจะให้โอนเข้าบัญชีไหน */
function payWantVat_(ord) {
  return String((ord && ord.vat) || '').indexOf('ไม่') < 0 &&
    String((ord && ord.vat) || '').indexOf('รับ') > -1;
}

/**
 * บัญชีที่ต้องให้ลูกค้าโอนเข้า เลือกจากช่อง VAT ของออเดอร์
 *
 * ไม่มีค่าตั้งต้นสำรอง — ช่องไหนยังไม่กรอกในชีทให้บอกตรง ๆ ว่ายังไม่ได้กรอก
 * เดาบัญชีแทนเจ้าของร้านคือความผิดพลาดที่แพงที่สุดที่ระบบนี้ทำได้
 */
function payAcct_(wantVat) {
  var cfg = appCfg_();
  var a = wantVat ? cfg.pay.vat : cfg.pay.novat;
  var which = wantVat ? 'บิลมี VAT' : 'บิลไม่มี VAT';
  var miss = [];
  if (!a.bank) miss.push('ธนาคารที่รับเงิน ' + which);
  if (!a.name) miss.push('ชื่อบัญชี ' + which);
  if (!a.acct) miss.push('เลขบัญชี ' + which);
  /* เลขบัญชีบริษัทอยู่สองที่ — ช่องนี้ (ใช้ในข้อความเรียกเก็บเงิน) กับช่อง
     "เลขที่บัญชีธนาคาร" ที่พิมพ์อยู่ท้ายใบกำกับภาษี สองที่นี้ต้องเป็นเลขเดียวกัน
     วันที่ร้านย้ายบัญชีแล้วแก้ที่เดียว อีกที่จะพาเงินไปเข้าบัญชีเก่าเงียบ ๆ
     จึงเทียบเฉพาะตัวเลขให้ (รูปแบบการเว้นขีดต่างกันได้ ไม่ใช่เรื่อง) */
  var drift = '';
  if (wantVat && a.acct && cfg.bank) {
    var want = String(a.acct).replace(/\D/g, '');
    var onDoc = String(cfg.bank).replace(/\D/g, '');
    if (want && onDoc.indexOf(want) < 0) {
      drift = 'เลขบัญชีในข้อความเรียกเก็บเงิน (' + a.acct + ') ไม่ตรงกับเลขบัญชี' +
        'ที่พิมพ์อยู่บนใบกำกับภาษี — ไปแก้ให้ตรงกันที่ชีท ' + SH.app.name +
        ' ทั้งช่อง "เลขบัญชี บิลมี VAT" และ "เลขที่บัญชีธนาคาร"';
    }
  }

  return {
    bank: a.bank, name: a.name, acct: a.acct, pp: a.pp,
    which: which, miss: miss, drift: drift
  };
}

/**
 * ข้อความเรียกเก็บเงินที่พนักงานคัดลอกไปวางในแชทได้เลย
 *
 * ใช้ถ้อยคำเดียวกับที่ร้านพิมพ์เองอยู่แล้ว ต่างอยู่อย่างเดียวคือใส่ "ยอดที่ต้องโอน"
 * เป็นตัวเลขจริงลงไปด้วย — ของเดิมเขียนแค่ว่ารวม/ไม่รวม VAT ซึ่งลูกค้าต้องไปคิดเอง
 */
function payMsg_(ord, acct, wantVat) {
  var L = [];
  L.push('ออเดอร์ ' + ord.no + (ord.cust ? ' · ' + ord.cust : ''));
  L.push('');
  if (!wantVat) {
    L.push('รบกวนแจ้งเพื่อความเข้าใจตรงกันนะคะ');
    L.push('ราคาสินค้ายังไม่รวม VAT และไม่มีใบกำกับภาษีค่ะ');
    L.push('');
  }
  L.push('🏦 ธนาคาร: ' + acct.bank);
  L.push('🔢 เลขบัญชี: ' + acct.acct);
  L.push('ชื่อบัญชี: ' + acct.name);
  L.push('');
  L.push('💰 ยอดที่ต้องโอน ' + money_(ord.net) + (wantVat ? ' (รวม VAT 7% แล้ว)' : ''));
  L.push('');
  if (wantVat) {
    L.push('📌 ออกใบกำกับภาษีได้ค่ะ');
    L.push('หลังโอนชำระเงิน กรุณาส่งสลิปยืนยันการโอน');
    L.push('พร้อมแจ้งชื่อ-ที่อยู่สำหรับออกใบกำกับภาษีด้วยนะคะ');
    L.push('ขอบคุณค่ะ 🙏');
  } else {
    L.push('✅️▶️ โอนแล้วส่งสลิปยืนยันได้เลยค่ะ 🙏');
  }
  return L.join('\n');
}

/**
 * ทุกอย่างที่ต้องใช้ตอนขอเก็บเงินออเดอร์ใบหนึ่ง
 *
 * QR ที่คืนไปเป็นแบบล็อกยอดแล้ว ลูกค้าสแกนแล้วจำนวนเงินขึ้นเอง
 * ยังไม่ได้กรอกเลขพร้อมเพย์ในชีทก็ไม่มี QR — บอกเหตุผลไปตรง ๆ
 * ไม่ทำ QR หลอก ๆ ที่สแกนแล้วไปเข้าบัญชีที่ไม่มีอยู่จริง
 */
function payAsk(orderNo) {
  requireStaff_();
  var ord = payOrder_(orderNo);
  /* ใบที่ยกเลิกหรือตีกลับไปแล้ว ห้ามออก QR เรียกเก็บเงิน — ของคืนสต๊อกไปแล้ว
     ยอดในใบไม่ใช่หนี้อีกต่อไป ส่ง QR ไปคือไปเก็บเงินค่าของที่ลูกค้าไม่ได้รับ
     (หน้าจอซ่อนปุ่มให้อยู่แล้ว แต่ด่านนี้ต้องอยู่ฝั่งชีทด้วย ปุ่มเปลี่ยนได้ กฎห้ามเปลี่ยน) */
  if (isDeadStatus_(ord.status)) {
    throw new Error('ออเดอร์ ' + ord.no + ' สถานะ "' + ord.status + '" แล้ว ' +
      'จึงเรียกเก็บเงินไม่ได้ — ถ้าลูกค้ากลับมาสั่งใหม่ ให้คีย์เป็นออเดอร์ใบใหม่');
  }
  var wantVat = payWantVat_(ord);
  var acct = payAcct_(wantVat);

  var qr = null, qrWhy = '';
  if (acct.miss.length) {
    qrWhy = 'ยังไม่ได้กรอก ' + acct.miss.join(' · ') + ' ในชีท ' + SH.app.name;
  } else if (!acct.pp) {
    qrWhy = 'ยังไม่ได้กรอก "พร้อมเพย์ ' + acct.which + '" ในชีท ' + SH.app.name +
      ' — โอนตามเลขบัญชีได้ตามปกติ แค่ไม่มี QR ให้สแกน';
  } else if (!(Number(ord.net) > 0)) {
    qrWhy = 'ออเดอร์ใบนี้ยอดเป็น ' + money_(ord.net) + ' จึงทำ QR เรียกเก็บเงินไม่ได้';
  } else {
    var t = ppTarget_(acct.pp);
    var payload = ppPayload_(acct.pp, ord.net);
    qr = {
      rows: qrModules_(payload), payload: payload,
      target: t.val, kind: t.kind, amount: Number(ord.net)
    };
  }

  return jsonSafe_({
    no: ord.no, cust: ord.cust, date: ord.date, net: Number(ord.net),
    status: ord.status, vat: ord.vat, wantVat: wantVat,
    acct: acct, qr: qr, qrWhy: qrWhy,
    msg: acct.miss.length ? '' : payMsg_(ord, acct, wantVat),
    miss: acct.miss,
    slips: slipRows_(ord.no)
  });
}

/* ------------------------------------------------------------------ สลิป */

/** โฟลเดอร์หลักของสลิป อยู่ที่เดียวกับไฟล์ชีท */
function slipRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(SLIP_FOLDER_PROP) || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { props.deleteProperty(SLIP_FOLDER_PROP); }
  }
  var parent = null;
  try {
    var it = DriveApp.getFileById(SHEET_ID).getParents();
    if (it.hasNext()) parent = it.next();
  } catch (e2) { parent = null; }
  var f = parent ? parent.createFolder(SLIP_FOLDER_NAME) : DriveApp.createFolder(SLIP_FOLDER_NAME);
  props.setProperty(SLIP_FOLDER_PROP, f.getId());
  return f;
}

/** โฟลเดอร์ย่อยรายเดือน — บัญชีตรวจเป็นรอบเดือน หาไฟล์ง่ายกว่ากองรวมกันหมด */
function slipMonthFolder_(when) {
  var root = slipRootFolder_();
  var name = Utilities.formatDate(when || new Date(), tz_(), 'yyyy-MM');
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/** สลิปทั้งหมดของออเดอร์ใบหนึ่ง ใหม่อยู่บน */
function slipRows_(orderNo) {
  var sh = sheetIfAny_('slip');
  if (!sh) return [];
  var no = String(orderNo || '').trim();
  var v = readAll_('slip'), out = [], IN = SH.slip.IN;
  for (var i = 0; i < v.length; i++) {
    var row = v[i];
    var rno = String(row[IN.no - 1] || '').trim();
    if (!rno) continue;
    if (no && rno !== no) continue;
    out.push({
      row: DATA_ROW + i, no: rno,
      at: row[IN.at - 1], paidAt: row[IN.paidAt - 1],
      amount: Number(row[IN.amount - 1] || 0),
      bank: String(row[IN.bank - 1] || ''),
      fileName: String(row[IN.fileName - 1] || ''),
      fileUrl: String(row[IN.fileUrl - 1] || ''),
      by: String(row[IN.by - 1] || ''),
      status: String(row[IN.status - 1] || '') || SLIP_WAIT,
      checkBy: String(row[IN.checkBy - 1] || ''),
      checkAt: row[IN.checkAt - 1],
      note: String(row[IN.note - 1] || ''),
      fileId: String(row[IN.fileId - 1] || '')
    });
  }
  out.reverse();
  return jsonSafe_(out);
}

function listSlips(orderNo) {
  requireStaff_();
  return slipRows_(orderNo);
}

/**
 * แนบสลิปเข้าออเดอร์
 *
 * เขียนไฟล์ลงไดรฟ์ก่อน แล้วค่อยเขียนแถวในชีท ถ้าเขียนแถวไม่สำเร็จให้ทิ้งไฟล์ทิ้ง
 * ไม่งั้นไดรฟ์จะมีสลิปลอยที่ไม่มีใครรู้ว่าเป็นของออเดอร์ไหน
 */
function addSlip(orderNo, p) {
  var email = requireStaff_();
  p = p || {};
  var ord = payOrder_(orderNo);
  /* แนบสลิปเข้าใบที่ยกเลิกไปแล้ว = หลักฐานการรับเงินของใบที่ไม่มียอด
     ถ้าลูกค้าโอนมาจริงหลังใบถูกยกเลิก นั่นคือเงินที่ต้องคืน ไม่ใช่ยอดที่ปิดได้ */
  if (isDeadStatus_(ord.status)) {
    throw new Error('ออเดอร์ ' + ord.no + ' สถานะ "' + ord.status + '" แล้ว ' +
      'แนบสลิปเข้าใบนี้ไม่ได้ — ถ้าลูกค้าโอนมาแล้วจริง อันนั้นคือเงินที่ต้องคืน');
  }

  var m = /^data:([^;]+);base64,(.*)$/.exec(String(p.data || ''));
  if (!m) throw new Error('ยังไม่ได้เลือกไฟล์สลิป หรือไฟล์อ่านไม่ออก');
  var mime = String(m[1]).toLowerCase();
  var ext = SLIP_MIME[mime];
  if (!ext) {
    throw new Error('ไฟล์ชนิด ' + mime + ' แนบไม่ได้ — รับเฉพาะรูป (JPG · PNG · WEBP · HEIC) กับ PDF');
  }
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > SLIP_MAX_BYTES) {
    throw new Error('ไฟล์ใหญ่ ' + Math.round(bytes.length / 1024 / 1024 * 10) / 10 +
      ' MB เกิน 10 MB — ถ่ายใหม่หรือย่อรูปก่อน');
  }

  /* ไม่ได้กรอกวันโอนมา = ไม่รู้วันโอน ต้องปล่อยว่างไว้
     เติมวันนี้ให้เงียบ ๆ คือเขียนวันที่ที่ไม่มีใครยืนยัน ลงในช่องที่บัญชีเอาไปใช้จริง
     (วันนี้ใช้ได้แค่ตอนเลือกโฟลเดอร์ ซึ่งผิดแล้วแค่หาไฟล์ยากขึ้น ไม่ใช่ข้อมูลผิด) */
  var paidRaw = String(p.paidAt || '').trim();
  var paidAt = paidRaw ? parseDate_(paidRaw) : '';
  var amount = Number(p.amount || 0);
  var stamp = Utilities.formatDate(new Date(), tz_(), 'yyyyMMdd-HHmmss');
  var fname = 'สลิป ' + ord.no + ' ' + stamp + '.' + ext;

  var file = slipMonthFolder_(paidAt || new Date()).createFile(Utilities.newBlob(bytes, mime, fname));

  var row = nextRow_('slip', SH.slip.IN.no);
  if (!row) {
    try { file.setTrashed(true); } catch (e) { Logger.log('ทิ้งไฟล์ไม่สำเร็จ: ' + e.message); }
    throw new Error('ชีท ' + SH.slip.name + ' เต็มแล้ว — สั่ง setup อีกครั้งเพื่อขยายแถว');
  }
  try {
    writeRow_('slip', row, {
      no: ord.no, at: new Date(), paidAt: paidAt,
      amount: amount > 0 ? amount : '', bank: String(p.bank || ''),
      fileName: fname, fileUrl: file.getUrl(), by: String(p.by || '').trim() || email,
      status: SLIP_WAIT, note: String(p.note || ''), fileId: file.getId()
    });
  } catch (err) {
    try { file.setTrashed(true); } catch (e2) { Logger.log('ทิ้งไฟล์ไม่สำเร็จ: ' + e2.message); }
    throw err;
  }

  writeLog_(email, 'แนบสลิป', SH.slip.name, ord.no, 'สลิป', '', fname, String(p.note || ''));

  /* ยอดไม่ตรงไม่ใช่เหตุให้ปฏิเสธไฟล์ — ลูกค้าโอนมัดจำก่อนก็มี
     แต่ต้องบอกให้คนเห็น ไม่ใช่กลืนไว้แล้วให้ไปเจอตอนปิดบัญชีสิ้นเดือน */
  var warn = '';
  if (amount > 0 && Math.abs(amount - Number(ord.net)) >= 0.01) {
    warn = 'ยอดในสลิป ' + money_(amount) + ' ไม่เท่ายอดออเดอร์ ' + money_(ord.net) +
      ' (ต่างกัน ' + money_(Math.abs(amount - Number(ord.net))) + ')';
  }

  return jsonSafe_({
    ok: true, no: ord.no, fileId: file.getId(), fileName: fname,
    fileUrl: file.getUrl(), warn: warn, net: Number(ord.net), slips: slipRows_(ord.no)
  });
}

/**
 * เปลี่ยนสถานะสลิป และถ้าสั่งมาด้วย ให้ทำเครื่องหมายว่าออเดอร์ชำระแล้วในทีเดียว
 * (สองอย่างนี้คนกดพร้อมกันเสมอ แยกให้กดสองทีคือช่องให้ลืมอย่างหนึ่ง)
 */
function setSlipStatus(fileId, status, why, alsoPaid) {
  var email = requireStaff_();
  var fid = String(fileId || '').trim();
  if (!fid) throw new Error('ไม่ได้บอกว่าจะแก้สลิปใบไหน');
  /* รายการนี้อยู่ในโค้ด ไม่ได้อยู่ในชีท ตั้งค่า จึงไม่ใช้ pickFrom_
     ไม่งั้นข้อความจะไล่ให้คนไปหาตัวเลือกในชีทที่ไม่มีตัวเลือกนี้อยู่ */
  var want = String(status || '').trim();
  if (SLIP_STATUS.indexOf(want) < 0) {
    throw new Error('สถานะสลิป "' + want + '" ใช้ไม่ได้ — มีให้เลือกแค่ ' +
      SLIP_STATUS.join(' / '));
  }

  var v = readAll_('slip'), IN = SH.slip.IN, row = 0, cur = null;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][IN.fileId - 1] || '').trim() === fid) {
      row = DATA_ROW + i; cur = v[i]; break;
    }
  }
  if (!row) throw new Error('ไม่พบสลิปใบนี้ในชีท ' + SH.slip.name);

  var no = String(cur[IN.no - 1] || '').trim();
  var before = String(cur[IN.status - 1] || '') || SLIP_WAIT;
  writeRow_('slip', row, {
    status: want, checkBy: email, checkAt: new Date(),
    note: String(why || cur[IN.note - 1] || '')
  });
  writeLog_(email, 'ตรวจสลิป', SH.slip.name, no, 'สถานะ', before, want, String(why || ''));

  var paid = null;
  if (alsoPaid && want === SLIP_OK) paid = setTracking(no, undefined, 'ชำระแล้ว');

  return jsonSafe_({ ok: true, no: no, fileId: fid, status: want, paid: paid,
    slips: slipRows_(no) });
}

/**
 * สลิปที่ยังไม่มีใครตรวจ — ใช้ขึ้นป้ายเตือนในหน้าค้างชำระ
 * คืนเป็นแผนที่ เลขออเดอร์ -> จำนวนใบที่รอ เพื่อให้หน้าจอวาดป้ายได้โดยไม่ต้องวนซ้ำ
 */
function slipsWaiting() {
  requireStaff_();
  var rows = slipRows_(''), out = {}, n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].status !== SLIP_WAIT) continue;
    out[rows[i].no] = (out[rows[i].no] || 0) + 1;
    n++;
  }
  return jsonSafe_({ total: n, byOrder: out });
}

/* ให้ node เรียกไปสอบได้ ตัว Apps Script ไม่มี module จึงต้องกันไว้ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ppCrc16_: ppCrc16_, ppField_: ppField_, ppTarget_: ppTarget_,
    ppPayload_: ppPayload_, qrModules_: qrModules_, qrUtf8_: qrUtf8_,
    qrPickVersion_: qrPickVersion_, qrCodewords_: qrCodewords_,
    payMsg_: payMsg_, payWantVat_: payWantVat_ };
}
