/**
 * ติดตั้งส่วนล็อต/วันหมดอายุเข้ากับชีทที่เจ้าของร้านทำไว้แล้ว
 *
 * สั่งครั้งเดียวจากเมนู Apps Script → เลือกฟังก์ชัน setup → Run
 * สั่งซ้ำได้ ไม่พัง ไม่ลบข้อมูล — ฟังก์ชันนี้เขียนทับเฉพาะหัวตารางกับช่องสูตรเท่านั้น
 *
 * สิ่งที่ทำ
 *   1. สร้างชีท "ล็อตสินค้า"  — ทะเบียนล็อต 1 ล็อต = 1 แถว
 *   2. สร้างชีท "ตัดล็อต"     — สมุดบันทึกว่าออเดอร์ไหนตัดล็อตไหนไปเท่าไร (เขียนต่อท้ายอย่างเดียว)
 *   3. เพิ่มคอลัมน์ Q "ล็อตที่ตัด" ที่ชีท ออเดอร์_รายการ เป็นสูตรดึงจากชีท ตัดล็อต
 *   4. สร้างชีท "เอกสาร"    — ทะเบียนใบเสนอราคา/ใบแจ้งหนี้/ใบกำกับภาษี/ใบรับเงินมัดจำ
 *
 * 9 ชีทเดิมไม่ถูกแตะ ยกเว้นคอลัมน์ Q ที่เพิ่มต่อท้าย ออเดอร์_รายการ (คอลัมน์ว่างอยู่แล้ว)
 */

var LOT_LAST = 1005;   // ล็อตสินค้า รองรับ 1000 ล็อต
var CUT_LAST = 3005;   // ตัดล็อต รองรับ 3000 บรรทัด
/* เอกสาร — เจ้าของร้านออกวันละราว 20 ใบ ปีหนึ่งราว 5,000 ใบ
   เผื่อไว้ 8,000 ใบ ราวปีครึ่ง แล้วระบบจะเตือนล่วงหน้าตอนใกล้เต็ม
   (ของเดิมทำใบละหนึ่งแท็บ ที่ 20 ใบต่อวันจะชนขีดจำกัดของ Google Sheets ใน 2 เดือน) */
var DOC_LAST = 8005;
var SLIP_LAST = 3005;  // หลักฐานการชำระเงิน รองรับ 3000 สลิป
var REQ_LAST = 3005;   // คำขอสั่งซื้อจากหน้าเว็บ
var LINK_LAST = 3005;  // ลิงก์ชำระเงิน รองรับ 3000 ลิงก์
var MONTH_LAST = 305;  // สรุปเดือน รองรับ 300 แถว = 60 เดือน × 5 ช่องทาง
var STOCK_LAST = 150;  // ขอบล่างของชีท สต๊อกคงเหลือ ที่ใช้ในสูตรตรวจยอด

var C_HEAD_BG = '#1f3864';
var C_HEAD_FG = '#ffffff';
var C_CALC_BG = '#f2f2f2';
var C_IN_FG = '#0000ff';
var C_SUB_FG = '#555555';

function setup() {
  requireStaff_();
  var ss = ss_();
  var made = [];
  /* ตัดล็อต ต้องมีและต้องสูงครบก่อน เพราะสูตรคอลัมน์ "ตัดออกแล้ว" ของ ล็อตสินค้า
     อ้างช่วงในชีทนี้ — อ้างเกินจำนวนแถวจริงเมื่อไร ทั้งคอลัมน์กลายเป็น error */
  made.push(setupCutSheet_(ss));
  made.push(setupLotSheet_(ss));
  made.push(setupDocSheet_(ss));
  made.push(setupAppSheet_(ss));
  made.push(setupMonthSheet_(ss));
  made.push(setupSlipSheet_(ss));
  made.push(setupReqSheet_(ss));
  made.push(setupBanSheet_(ss));
  made.push(setupScatSheet_(ss));
  made.push(setupProdTagCol_(ss));
  made.push(setupLinkSheet_(ss));
  made.push(setupItemLotColumn_(ss));
  made.push(setupAccounting_(ss));
  made.push(setupCarrierList_(ss));
  made.push(setupStatusList_(ss));
  made.push(setupRecvTypeList_(ss));
  // ซ่อมให้อัตโนมัติ แต่ห้ามล้มทั้ง setup ถ้าซ่อมไม่ได้ — ส่วนอื่นติดตั้งไปแล้ว
  try { made.push(repairStockSheet()); }
  catch (e) { made.push('ซ่อมชีทสต๊อกไม่สำเร็จ: ' + e.message); }
  SpreadsheetApp.flush();
  var msg = 'ติดตั้งเรียบร้อย\n\n' + made.join('\n');
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------------- ตรวจสุขภาพของชีท */

var ERR_RE = /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|ERROR!)/;

/**
 * ตรวจว่าชีทไหนมีช่องที่ขึ้น error อยู่บ้าง — อ่านอย่างเดียว ไม่แก้ ไม่เขียนอะไรเลย
 *
 * ช่องสูตรที่พังไม่ได้ส่งเสียงร้อง มันแค่แสดง #N/A เงียบ ๆ อยู่ในคอลัมน์ที่ไม่มีใครดู
 * แล้ววันหนึ่งระบบตัดล็อตก็ทำงานไม่ได้โดยไม่มีใครรู้ว่าเริ่มพังตั้งแต่เมื่อไร
 * สั่งฟังก์ชันนี้แล้วดูใน Log จะได้รู้ทันทีว่าพังตรงไหนและสูตรในช่องนั้นเขียนว่าอะไร
 */
function checkSheets() {
  requireStaff_();
  var ss = ss_();
  var names = [SH.lot.name, SH.cut.name, SH.stock.name, SH.prod.name,
               SH.head.name, SH.item.name, SH.recv.name];
  var out = [], bad = 0;

  for (var i = 0; i < names.length; i++) {
    var sh = findSheet_(ss, names[i]);
    if (!sh) { out.push('✗ ไม่มีชีท ' + names[i]); bad++; continue; }

    /* แท็บที่สะกดต่างจากชื่อในโค้ดนิดเดียว โปรแกรมยังหาเจอ แต่สูตรในชีทหาไม่เจอ
       เรื่องนี้ต้องขึ้นให้เห็นชัด ๆ เพราะมันคือสาเหตุที่ทำให้ช่องขึ้น #REF! โดยดูไม่ออก */
    var real = sh.getName();
    var size = names[i] + (real === names[i] ? '' : '  ⚠ ชื่อแท็บจริงคือ "' + real + '"') +
      ' — ' + sh.getMaxRows() + ' แถว × ' + sh.getMaxColumns() + ' คอลัมน์';
    var rows = sh.getLastRow(), cols = sh.getLastColumn();
    if (rows < 1 || cols < 1) { out.push('· ' + size + ' (ยังไม่มีข้อมูล)'); continue; }

    var dv = sh.getRange(1, 1, rows, cols).getDisplayValues();
    var hits = [];
    for (var r = 0; r < dv.length; r++) {
      for (var c = 0; c < dv[r].length; c++) {
        if (ERR_RE.test(String(dv[r][c] || ''))) hits.push([r + 1, c + 1, dv[r][c]]);
      }
    }
    if (!hits.length) { out.push('✓ ' + size); continue; }

    bad++;
    var lines = ['✗ ' + size + ' — เจอ ' + hits.length + ' ช่องที่ขึ้น error'];
    /* พอเห็นสามช่องแรกก็รู้แล้วว่าคอลัมน์ไหนพัง ไม่ต้องพ่นมาทั้งพันแถว */
    for (var k = 0; k < Math.min(3, hits.length); k++) {
      var cell = sh.getRange(hits[k][0], hits[k][1]);
      lines.push('     ' + cell.getA1Notation() + ' = ' + hits[k][2] +
        '   สูตร: ' + (cell.getFormula() || '(ไม่มีสูตร เป็นค่านิ่ง)'));
    }
    if (hits.length > 3) lines.push('     และอีก ' + (hits.length - 3) + ' ช่อง');
    out.push(lines.join('\n'));
  }

  var msg = (bad ? 'เจอปัญหา ' + bad + ' ชีท — สั่ง setup อีกครั้งเพื่อเขียนสูตรใหม่'
                 : 'ทุกชีทปกติดี ไม่มีช่องไหนขึ้น error') + '\n\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * ตรวจ + ซ่อมชีท ล็อตสินค้า ในการสั่งครั้งเดียว แล้วพิมพ์ออกมาว่าเจออะไร
 *
 * มีไว้เพราะ "สั่ง setup แล้วยังเหมือนเดิม" ไม่ได้บอกอะไรเลยว่าเหมือนเดิมตรงไหน
 * ตัวนี้พิมพ์ของจริงที่อยู่ในช่องออกมาก่อนซ่อม แล้วซ่อม แล้วพิมพ์ผลหลังซ่อมให้ดู
 * ในการรันครั้งเดียว — ถ้ายังไม่หาย ภาพหน้าจอของ Log จะบอกได้เองว่าติดตรงไหน
 */
function fixLotSheet() {
  requireStaff_();
  var ss = ss_();
  var out = [];
  var COLS = 'ABCDEFGHIJKLMNOP';

  function dump(sh, rows, wide) {
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      for (var c = 1; c <= wide; c++) {
        var cell = sh.getRange(r, c);
        var f = cell.getFormula();
        var v = String(cell.getDisplayValue());
        if (!f && v === '') continue;
        out.push('    ' + COLS.charAt(c - 1) + r + ' = ' + (v === '' ? '(ว่าง)' : v) +
          (f ? '\n         สูตร: ' + f : ''));
      }
    }
  }

  var cut = findSheet_(ss, SH.cut.name);
  var lot = findSheet_(ss, SH.lot.name);

  out.push('===== ก่อนซ่อม =====');
  if (!cut) {
    out.push('  ✗ ไม่พบชีท ' + SH.cut.name + ' — นี่คือสาเหตุ');
  } else {
    out.push('  ชีท ' + SH.cut.name + ' : ' + cut.getMaxRows() + ' แถว × ' +
      cut.getMaxColumns() + ' คอลัมน์');
    out.push('    หัวตาราง: ' + cut.getRange(HEAD_ROW, 1, 1, cut.getMaxColumns())
      .getDisplayValues()[0].join(' | '));
  }

  if (!lot) {
    out.push('  ✗ ไม่พบชีท ' + SH.lot.name);
  } else {
    out.push('  ชีท ' + SH.lot.name + ' : ' + lot.getMaxRows() + ' แถว × ' +
      lot.getMaxColumns() + ' คอลัมน์');
    out.push('    หัวตาราง: ' + lot.getRange(HEAD_ROW, 1, 1, Math.min(16, lot.getMaxColumns()))
      .getDisplayValues()[0].join(' | '));
    /* แถว 3 คือช่องตรวจยอดบนหัวชีท · แถว 6 กับ 7 คือสองแถวข้อมูลแรก */
    dump(lot, [3, DATA_ROW, DATA_ROW + 1], Math.min(16, lot.getMaxColumns()));
  }

  out.push('');
  out.push('===== ซ่อม =====');
  out.push('  ' + setupCutSheet_(ss));
  out.push('  ' + setupLotSheet_(ss));
  SpreadsheetApp.flush();

  out.push('');
  out.push('===== หลังซ่อม =====');
  lot = findSheet_(ss, SH.lot.name);
  dump(lot, [3, DATA_ROW, DATA_ROW + 1], Math.min(16, lot.getMaxColumns()));

  /* คำตอบที่เจ้าของร้านอยากรู้จริง ๆ มีข้อเดียว: ตอนนี้ขายของที่คุมล็อตได้หรือยัง */
  var bad = 0, rows = 0;
  var last = Math.min(lot.getMaxRows(), LOT_LAST);
  var vals = lot.getRange(DATA_ROW, 2, last - DATA_ROW + 1, 8).getDisplayValues();
  for (var i = 0; i < vals.length; i++) {
    if (!String(vals[i][0] || '').trim()) continue;   // B = SKU
    rows++;
    var remain = String(vals[i][7] || '');            // I = คงเหลือ
    if (remain === '' || ERR_RE.test(remain) || isNaN(Number(remain.replace(/,/g, '')))) bad++;
  }
  out.push('');
  out.push(bad
    ? '✗ ยังเหลือ ' + bad + ' แถวจาก ' + rows + ' ที่ช่องคงเหลือไม่มีตัวเลข — ' +
      'ส่งภาพ Log นี้มาให้ดูได้เลย บรรทัด "สูตร:" ข้างบนจะบอกว่าติดตรงไหน'
    : '✓ ช่องคงเหลือมีตัวเลขครบทั้ง ' + rows + ' แถว — ระบบตัดล็อตใช้งานได้แล้ว');

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------- ช่องสูตรที่ถูกพิมพ์ทับ

   กฎข้อเดียวที่ห้ามลืมเวลาแก้ชีทเองคือ "ช่องพื้นเทาคือสูตร ห้ามพิมพ์ทับ"
   แต่กฎนี้ไม่มีอะไรบังคับ พิมพ์ทับได้เงียบ ๆ ไม่มีอะไรเตือน และผลที่ตามมา
   ก็เงียบเหมือนกัน — เลขในช่องนั้นนิ่งอยู่อย่างนั้นตลอดไป ไม่อัปเดตตามอีกเลย
   คนที่มาอ่านทีหลังแยกไม่ออกเลยว่าเลขไหนคำนวณมาจริง เลขไหนเป็นเลขนิ่ง

   ของจริงที่เจอ: ชีท รับเข้า แถว 401 มีเลขนิ่งค้างอยู่ในคอลัมน์สูตร

   ตัวนี้เดินหาให้ทั้งชีท แล้วซ่อมสองแบบตามสิ่งที่เจอจริง
     - แถวนั้นมีข้อมูลอยู่ → เอาสูตรจากแถวที่ยังดีมาวางคืน (copyTo ปรับแถวให้เอง)
     - แถวนั้นว่างทั้งแถว เหลือแต่ช่องนี้ → เป็นเศษที่ค้างไว้ ล้างทิ้ง
   ค่าเดิมทุกช่องถูกเขียนลง Log ก่อนเสมอ ไม่มีอะไรหายไปเงียบ ๆ            */

/** อ่านอย่างเดียว — บอกว่ามีช่องสูตรไหนถูกพิมพ์ทับบ้าง ไม่แตะอะไรทั้งนั้น */
function checkStaticCells() { requireStaff_(); return staticCells_(false); }

/** ซ่อมจริง — เอาสูตรกลับมา หรือล้างเศษที่ค้างไว้ พร้อมลง Log ทุกช่อง */
function fixStaticCells() { requireStaff_(); return staticCells_(true); }

function staticCells_(doFix) {
  var ss = ss_();
  var COLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var keys = ['lot', 'cut', 'stock', 'head', 'item', 'recv'];
  /* สต๊อกคงเหลือเป็นสูตรทั้งแผ่น (CALC_ALL) ไม่มีช่องกรอกสักช่อง
     ช่องไหนไม่มีสูตรแต่มีค่า = ถูกพิมพ์ทับแน่นอน ไม่ต้องเดา */
  function calcCols(cfg, wide) {
    if (cfg.CALC && cfg.CALC.length) return cfg.CALC;
    if (!cfg.CALC_ALL) return [];
    var all = [];
    for (var i = 1; i <= wide; i++) all.push(i);
    return all;
  }
  var out = [], found = 0, fixed = 0, cleared = 0;

  for (var k = 0; k < keys.length; k++) {
    var cfg = SH[keys[k]];
    if (!cfg) continue;
    var sh = findSheet_(ss, cfg.name);
    if (!sh) { out.push('✗ ไม่มีชีท ' + cfg.name); continue; }

    /* สูตรมักลากไว้ยาวกว่าแถวที่มีข้อมูลจริง ต้องดูให้ถึงแถวสุดท้ายที่ยังมีสูตร
       ไม่งั้นแถวที่ถูกพิมพ์ทับจนไม่เหลือสูตร จะหาสูตรต้นแบบมาวางคืนไม่เจอ */
    var lim = formulaLimit_(keys[k]);
    var last = Math.min(sh.getMaxRows(), Math.max(sh.getLastRow(), lim));
    if (last < DATA_ROW) { out.push('· ' + cfg.name + ' — ยังไม่มีข้อมูล'); continue; }
    var n = last - DATA_ROW + 1;
    var wide = sh.getLastColumn();
    var cols = calcCols(cfg, wide);
    if (!cols.length) continue;
    var hits = [];

    for (var c = 0; c < cols.length; c++) {
      var col = cols[c];
      if (col > wide) continue;
      var rng = sh.getRange(DATA_ROW, col, n, 1);
      var fs = rng.getFormulas();
      var vs = rng.getDisplayValues();
      /* แถวที่ยังมีสูตรดีอยู่ ไว้เป็นต้นแบบตอนวางคืน */
      var good = -1;
      for (var i = 0; i < fs.length; i++) if (fs[i][0]) { good = i; break; }

      for (var j = 0; j < fs.length; j++) {
        if (fs[j][0]) continue;                                  /* มีสูตร = ปกติ */
        if (String(vs[j][0] || '').trim() === '') continue;       /* ว่าง = ปกติ */
        hits.push({ col: col, i: j, row: DATA_ROW + j, val: vs[j][0], good: good });
      }
    }

    if (!hits.length) { out.push('✓ ' + cfg.name + ' — ไม่มีช่องสูตรถูกพิมพ์ทับ'); continue; }

    found += hits.length;
    out.push((doFix ? '⚙ ' : '✗ ') + cfg.name + ' — เจอ ' + hits.length + ' ช่อง');

    for (var h = 0; h < hits.length; h++) {
      var t = hits[h];
      var a1 = COLS.charAt(t.col - 1) + t.row;
      /* แถวนี้มีของอยู่จริงไหม ดูจากช่องกรอกทั้งแถว ไม่ใช่จากช่องที่กำลังซ่อม */
      var alive = true;
      if (cfg.IN) {
        var rowVals = sh.getRange(t.row, 1, 1, wide).getDisplayValues()[0];
        alive = false;
        for (var q in cfg.IN) {
          var cc = cfg.IN[q];
          if (cc <= wide && String(rowVals[cc - 1] || '').trim() !== '') { alive = true; break; }
        }
      }

      var how;
      if (!alive) how = 'แถวว่างทั้งแถว เหลือแต่ช่องนี้ — เป็นเศษที่ค้างไว้ ล้างทิ้ง';
      else if (t.good < 0) how = 'ทั้งคอลัมน์ไม่เหลือสูตรให้ก๊อปเลย — ต้องสั่ง setup เขียนสูตรใหม่';
      else how = 'เอาสูตรจากแถว ' + (DATA_ROW + t.good) + ' มาวางคืน';
      out.push('    ' + a1 + ' = ' + t.val + '   ' + (doFix ? '→ ' : '') + how);

      if (!doFix) continue;
      if (!alive) {
        sh.getRange(t.row, t.col).clearContent();
        cleared++;
      } else if (t.good >= 0) {
        sh.getRange(DATA_ROW + t.good, t.col).copyTo(sh.getRange(t.row, t.col));
        fixed++;
      } else {
        continue;   /* ซ่อมเองไม่ได้ ไม่ต้องลง Log ว่าซ่อมแล้ว */
      }
      /* ค่าเดิมต้องอยู่ใน Log เสมอ เผื่อวันหนึ่งมีคนถามว่าเลขนั้นหายไปไหน */
      writeLog_('ระบบ', 'ซ่อมช่องสูตร', cfg.name, a1, 'ค่าเดิม',
        t.val, alive ? '(คืนสูตร)' : '(ล้างทิ้ง)',
        'ช่องสูตรถูกพิมพ์ทับ ซ่อมด้วย fixStaticCells');
    }
  }

  if (doFix) SpreadsheetApp.flush();

  var head;
  if (!found) head = '✓ ไม่มีช่องสูตรไหนถูกพิมพ์ทับเลย ทุกชีทปกติดี';
  else if (!doFix) head = 'เจอ ' + found + ' ช่องที่ถูกพิมพ์ทับ — สั่ง fixStaticCells เพื่อซ่อม';
  else head = '✓ ซ่อมแล้ว ' + fixed + ' ช่อง · ล้างเศษทิ้ง ' + cleared + ' ช่อง' +
    (found > fixed + cleared
      ? ' · เหลือ ' + (found - fixed - cleared) + ' ช่องที่ต้องสั่ง setup ก่อน' : '') +
    '\nค่าเดิมทุกช่องถูกบันทึกไว้ในชีท Log แล้ว';

  var msg = head + '\n\n' + out.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- ล็อตสินค้า */

/**
 * ขอบล่างของช่วงที่อ้างข้ามชีท — ต้องไม่เกินจำนวนแถวจริงของชีทนั้น
 *
 * สูตรที่อ้างเลยขอบชีทปลายทางไปแม้แถวเดียว Google จะให้ทั้งช่องเป็น #REF!
 * แล้วช่องอื่นที่อ้างต่อจากช่องนั้นพังตามไปทั้งแถบ — ของจริงที่เจอคือ
 * ล็อตสินค้า คอลัมน์ "ตัดออกแล้ว" ขึ้น error ทุกแถว จนคอลัมน์ "คงเหลือ" ว่างหมด
 * ซึ่งแปลว่าระบบตัดล็อต FEFO ทำงานไม่ได้เลยทั้งชีท
 */
/**
 * ชื่อชีทที่จะเอาไปใส่ในสูตร — ต้องเป็นชื่อจริงของแท็บ ไม่ใช่ชื่อที่เขียนไว้ในโค้ด
 *
 * findSheet_ หาแท็บแบบไม่ถือสา — ช่องว่างหัวท้าย อักขระความกว้างศูนย์ และการสะกดต่าง
 * เล็กน้อยอย่าง "สต๊อกคงเหลือ" กับ "สต๊อคคงเหลือ" ถือว่าเป็นชีทเดียวกัน
 * แต่ "สูตรในชีท" ถือสาเป๊ะทุกตัวอักษร
 *
 * ถ้าเอาชื่อในโค้ดไปเขียนลงสูตรตรง ๆ สูตรจะชี้ไปที่แท็บที่ไม่มีอยู่จริง แล้วขึ้น #REF!
 * ทั้งช่อง ทั้งที่โปรแกรมอ่านเขียนชีทนั้นได้ปกติดี — อาการที่เจอจริงคือช่องตรวจยอด
 * บนหัวชีท ล็อตสินค้า ขึ้น #REF! ทั้งที่ checkSheets บอกว่าชีทสต๊อกไม่มีปัญหาอะไรเลย
 */
function sheetRef_(ss, name) {
  var sh = findSheet_(ss, name);
  var real = sh ? sh.getName() : name;
  /* ชื่อชีทที่มีเครื่องหมายคำพูดเดี่ยวต้องคูณสอง ไม่งั้นสูตรขาดกลางคัน */
  return "'" + String(real).replace(/'/g, "''") + "'";
}

function boundLast_(ss, name, want) {
  var s = findSheet_(ss, name);
  if (!s) return want;
  return Math.max(DATA_ROW, Math.min(want, s.getMaxRows()));
}

function setupLotSheet_(ss) {
  var name = SH.lot.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < LOT_LAST) s.insertRowsAfter(s.getMaxRows(), LOT_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 13) s.insertColumnsAfter(s.getMaxColumns(), 13 - s.getMaxColumns());

  s.getRange('A2').setValue('ทะเบียนล็อตสินค้า — สำหรับสินค้าที่มีวันหมดอายุ')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'สินค้าตัวไหนไม่ต้องคุมล็อต ไม่ต้องใส่ในชีทนี้  |  ระบบจะตัดล็อตที่หมดอายุก่อนให้อัตโนมัติ (FEFO)'
  ).setFontColor(C_SUB_FG);

  s.getRange('H3').setValue('SKU ที่ยอดล็อตไม่ตรงกับสต๊อก').setFontColor(C_SUB_FG)
    .setHorizontalAlignment('right');
  var ST = boundLast_(ss, SH.stock.name, STOCK_LAST);
  var SR = sheetRef_(ss, SH.stock.name);
  s.getRange('I3').setFormula(
    '=SUMPRODUCT(--(COUNTIF($B$6:$B$' + LOT_LAST + ',' + SR + '!$B$6:$B$' + ST + ')>0),' +
    '--(ROUND(SUMIF($B$6:$B$' + LOT_LAST + ',' + SR + '!$B$6:$B$' + ST +
    ',$I$6:$I$' + LOT_LAST + '),3)<>ROUND(' + SR + '!$I$6:$I$' + ST + ',3)))'
  ).setFontWeight('bold');
  s.getRange('J3').setValue('← ถ้าไม่ใช่ 0 แปลว่ายอดล็อตกับยอดสต๊อกเริ่มเพี้ยน ต้องตรวจ')
    .setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'รหัสสินค้า (SKU)', 'ชื่อสินค้า', 'เลขล็อต', 'วันหมดอายุ', 'วันรับเข้า',
    'จำนวนรับ\n(ชิ้น)', 'ตัดออกแล้ว\n(ชิ้น)', 'คงเหลือ\n(ชิ้น)', 'สถานะล็อต', 'หมายเหตุ',
    'คีย์ล็อต', 'ตรวจสอบ'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = LOT_LAST - DATA_ROW + 1;
  var L = LOT_LAST, C = boundLast_(ss, SH.cut.name, CUT_LAST);

  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');
  fillFormula_(s, 3, n,
    '=IF($B6="","",IFERROR(VLOOKUP($B6,' + sheetRef_(ss, SH.prod.name) +
    '!$B$6:$D$200,3,FALSE),"ไม่พบ SKU"))');
  /* อ้างทั้งคอลัมน์ ไม่ใส่เลขแถว — สองช่วงจึงสูงเท่ากันเสมอโดยไม่ต้องเชื่อว่าชีทปลายทาง
     สูงเท่าไร ต่อให้มีคนไปลบแถวออก หรือชีทถูกสร้างมาคนละขนาด ก็ไม่มีทางเพี้ยน

     ของจริงที่เจอ: คอลัมน์นี้ขึ้น #N/A ทุกแถวจนคอลัมน์คงเหลือว่างหมด ตัดล็อตไม่ได้ทั้งชีท
     ทั้ง SUMIFS และ SUMIF แบบระบุแถวต่างก็ให้ #N/A เหมือนกัน เพราะช่วงที่อ้างไปไม่ถึง
     ของจริงในชีทปลายทาง — แบบทั้งคอลัมน์ไม่มีทางอ้างพลาดแบบนั้น
     (แถวหัวตารางไม่กวน เพราะกุญแจล็อตหน้าตาเป็น SKU|เลขล็อต ไม่มีทางไปตรงกับหัวตาราง) */
  var CR = sheetRef_(ss, SH.cut.name);
  fillFormula_(s, 8, n,
    '=IF($L6="","",SUMIF(' + CR + '!$I:$I,$L6,' + CR + '!$F:$F))');
  fillFormula_(s, 9, n, '=IF($B6="","",IFERROR($G6-$H6,""))');
  fillFormula_(s, 10, n,
    '=IF($B6="","",IF(NOT(ISNUMBER($I6)),"",IF($I6<=0,"หมดแล้ว",' +
    'IF($E6="","ไม่ระบุวันหมดอายุ",IF($E6<TODAY(),"หมดอายุแล้ว",' +
    'IF($E6<=TODAY()+60,"ใกล้หมดอายุ","ปกติ"))))))');
  fillFormula_(s, 12, n, '=IF(OR($B6="",$D6=""),"",$B6&"|"&$D6)');
  fillFormula_(s, 13, n,
    '=IF($B6="","",IF($D6="","ยังไม่ใส่เลขล็อต",' +
    /* ช่องสูตรที่พังไม่ส่งเสียงร้อง มันขึ้น #N/A เงียบ ๆ แล้วคอลัมน์คงเหลือก็ว่างตามไป
       ช่องตรวจสอบต้องแปลให้เป็นคำ ไม่งั้นคนอ่านชีทไม่รู้ว่าระบบตัดล็อตหยุดทำงานไปแล้ว */
    'IF(ISERROR($H6),"สูตรช่องตัดออกแล้วเสีย — สั่ง setup ใหม่",' +
    'IF(COUNTIF($L$6:$L$' + L + ',$L6)>1,"เลขล็อตซ้ำ",' +
    'IF(NOT(ISNUMBER($G6)),"ยังไม่ใส่จำนวนรับ",' +
    'IF($G6<=0,"จำนวนรับต้องมากกว่า 0",' +
    'IF($H6>$G6,"ตัดออกเกินจำนวนที่รับเข้า",' +
    'IF($C6="ไม่พบ SKU","SKU ไม่มีในฐานสินค้า","OK"))))))))');

  paintCols_(s, n, [2, 4, 5, 6, 7, 11], [1, 3, 8, 9, 10, 12, 13]);

  s.getRange(DATA_ROW, 5, n, 2).setNumberFormat('dd/mm/yyyy');
  s.getRange(DATA_ROW, 7, n, 3).setNumberFormat('#,##0');

  var skuRange = findSheet_(ss, SH.prod.name).getRange('B6:B200');
  s.getRange(DATA_ROW, 2, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInRange(skuRange, true).setAllowInvalid(true).build()
  );

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(2, 110); s.setColumnWidth(3, 300); s.setColumnWidth(4, 110);
  s.setColumnWidth(5, 100); s.setColumnWidth(6, 100); s.setColumnWidth(11, 180);
  s.hideColumns(12);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + (LOT_LAST - DATA_ROW + 1) + ' ล็อต)';
}

/* ------------------------------------------------------------------ ตัดล็อต */

function setupCutSheet_(ss) {
  var name = SH.cut.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < CUT_LAST) s.insertRowsAfter(s.getMaxRows(), CUT_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 9) s.insertColumnsAfter(s.getMaxColumns(), 9 - s.getMaxColumns());

  s.getRange('A2').setValue('บันทึกการตัดล็อต — ระบบเขียนให้เอง')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ทุกครั้งที่บันทึกออเดอร์ ระบบจะลงว่าตัดล็อตไหนไปกี่ชิ้น  |  ห้ามแก้ด้วยมือ ' +
    'ถ้าต้องแก้ให้บันทึกเหตุผลที่ชีต Log ด้วย'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขที่ออเดอร์', 'ลำดับในบิล', 'รหัสสินค้า (SKU)', 'เลขล็อต',
    'จำนวนที่ตัด\n(ชิ้น)', 'วันที่', 'คีย์อ้างอิง', 'คีย์ล็อต'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = CUT_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');
  fillFormula_(s, 8, n, '=IF($B6="","",$B6&"|"&$C6)');
  fillFormula_(s, 9, n, '=IF(OR($D6="",$E6=""),"",$D6&"|"&$E6)');

  paintCols_(s, n, [2, 3, 4, 5, 6, 7], [1, 8, 9]);
  s.getRange(DATA_ROW, 7, n, 1).setNumberFormat('dd/mm/yyyy');
  s.getRange(DATA_ROW, 6, n, 1).setNumberFormat('#,##0');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(2, 130); s.setColumnWidth(4, 110); s.setColumnWidth(5, 110);
  s.hideColumns(8, 2);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + (CUT_LAST - DATA_ROW + 1) + ' บรรทัด)';
}

/* ----------------------------------------------------------------- เอกสาร */

/**
 * ทะเบียนเอกสารขาย — ใบเสนอราคา ใบแจ้งหนี้ ใบเสร็จ/ใบกำกับภาษี ใบรับเงินมัดจำ
 *
 * เก็บยอดเป็นเลขนิ่ง ไม่ใช่สูตรดึงจากออเดอร์ เพราะใบที่ออกไปแล้วและลูกค้าถืออยู่
 * ต้องไม่ขยับตามการแก้ออเดอร์ทีหลัง มีคอลัมน์สูตรอยู่คอลัมน์เดียวคือลำดับ
 */
/* ------------------------------------------------------------ สรุปรายเดือน

   เดือนละหนึ่งแถว เก็บสองอย่างที่ระบบไม่มีทางรู้เอง
     ค่าแอด    บิลค่าโฆษณาไม่ได้ผ่านระบบออเดอร์
     เดือนเก่า ยอดของเดือนก่อนเริ่มใช้ระบบ ที่อยู่ในไฟล์ Excel เดิม

   ยอดขาย/ต้นทุนของเดือนที่มีออเดอร์ในระบบแล้ว ไม่ต้องกรอก — ปล่อยว่างไว้
   แล้วแอปจะคิดจากชีทหัวบิลให้เอง ที่กรอกไว้เองจะชนะเสมอ (เผื่อเดือนไหน
   ตัวเลขในระบบไม่ครบ จะได้ทับด้วยตัวเลขที่ปิดบัญชีจริงได้)                */

function setupMonthSheet_(ss) {
  var name = SH.month.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < MONTH_LAST) s.insertRowsAfter(s.getMaxRows(), MONTH_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 8) s.insertColumnsAfter(s.getMaxColumns(), 8 - s.getMaxColumns());

  s.getRange('A2').setValue('สรุปยอดรายเดือน')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'หนึ่งแถว = หนึ่งเดือน × หนึ่งช่องทางขาย (Shopee · เพจ Facebook · หน้าร้าน ...)  |  ' +
    'กรอกจากแอป หน้าใบเสนอราคา → ปุ่มแฟ้มเอกสาร  |  ' +
    'เดือนที่มีออเดอร์ในระบบแล้ว เว้นยอดขาย/ต้นทุนว่างไว้ได้ แอปคิดให้เอง  |  ' +
    'ช่องพื้นเทาเป็นสูตร ห้ามพิมพ์ทับ'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'ปี-เดือน\n(2026-01)', 'ช่องทางขาย', 'ยอดขาย\n(กรอกเองถ้าไม่มีในระบบ)',
    'ต้นทุน\n(กรอกเองถ้าไม่มีในระบบ)', 'ค่าแอด\n(กรอกเองเสมอ)', 'หมายเหตุ',
    'กำไรสุทธิ\n(ยอดขาย−ต้นทุน−ค่าแอด)'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = MONTH_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');
  /* กำไรสุทธิคิดในชีทด้วย เผื่อคนเปิดชีทดูตรง ๆ โดยไม่ผ่านแอป
     ต้องได้เลขเดียวกับที่แอปโชว์เสมอ ไม่งั้นจะเถียงกันเองว่าเลขไหนจริง */
  fillFormula_(s, 8, n,
    '=IF($B6="","",N($D6)-N($E6)-N($F6))');

  paintCols_(s, n, [2, 3, 4, 5, 6, 7], [1, 8]);
  s.getRange(DATA_ROW, SH.month.IN.ym, n, 1).setNumberFormat('@');
  s.getRange(DATA_ROW, SH.month.IN.chan, n, 1).setNumberFormat('@');
  s.getRange(DATA_ROW, SH.month.IN.sales, n, 3).setNumberFormat('#,##0.00');
  s.getRange(DATA_ROW, 8, n, 1).setNumberFormat('#,##0.00');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.month.IN.ym, 120);
  s.setColumnWidth(SH.month.IN.chan, 150);
  s.setColumnWidth(SH.month.IN.sales, 150);
  s.setColumnWidth(SH.month.IN.cost, 150);
  s.setColumnWidth(SH.month.IN.ads, 150);
  s.setColumnWidth(SH.month.IN.note, 240);
  s.setColumnWidth(8, 160);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name +
    ' (รองรับ ' + n + ' แถว = เดือน × ช่องทาง)';
}

function setupDocSheet_(ss) {
  var name = SH.doc.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < DOC_LAST) s.insertRowsAfter(s.getMaxRows(), DOC_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 24) s.insertColumnsAfter(s.getMaxColumns(), 24 - s.getMaxColumns());

  s.getRange('A2').setValue('ทะเบียนเอกสารขาย — ระบบเขียนให้เอง')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ออกใบจากหน้าออเดอร์ในแอป แล้วใบจะมาโผล่ที่นี่  |  ห้ามแก้เลขที่เอกสารด้วยมือ ' +
    'เลขต้องเรียงไม่ซ้ำไม่ข้าม  |  ยกเลิกใบให้กรอกเหตุผลช่อง "เหตุผลที่ยกเลิก" ไม่ใช่ลบแถวทิ้ง' +
    '  |  ช่อง "หมายเหตุ" ถูกพิมพ์ลงใบที่ส่งลูกค้า อย่าใช้จดเรื่องภายในร้าน'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขที่เอกสาร', 'ชนิดเอกสาร', 'วันที่', 'เลขที่ออเดอร์',
    'ชื่อลูกค้า', 'เลขประจำตัว\nผู้เสียภาษี', 'สำนักงานใหญ่\n/ สาขา', 'ที่อยู่ตามใบกำกับภาษี',
    'โทรศัพท์', 'อีเมล', 'รหัสลูกค้า', 'เลขที่ PO', 'เงื่อนไขชำระเงิน',
    'มูลค่าสินค้า\n(ก่อน VAT)', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น', 'ผู้ออกเอกสาร',
    'หมายเหตุ', 'เหตุผลที่ยกเลิก', 'รายการในใบ\n(ระบบใช้พิมพ์ซ้ำ ห้ามแก้)',
    'ลายเซ็นผู้รับของ\n(ลูกค้าเซ็นในแอป ห้ามแก้)',
    'ส่งให้ลูกค้าแล้วเมื่อ\n(ว่าง = ยังแก้ใบได้)',
    'ประวัติการแก้ใบ\n(ระบบจดเอง ไม่พิมพ์ลงใบ)'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = DOC_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 24; c++) inCols.push(c);
  paintCols_(s, n, inCols, [1]);

  s.getRange(DATA_ROW, SH.doc.IN.date, n, 1).setNumberFormat('dd/mm/yyyy');
  s.getRange(DATA_ROW, SH.doc.IN.base, n, 3).setNumberFormat('#,##0.00');
  /* เลขผู้เสียภาษีกับเบอร์โทรขึ้นต้นด้วยศูนย์ ถ้าปล่อยเป็นตัวเลขศูนย์หน้าจะหาย
     แล้วใบที่ออกซ้ำทีหลังจะพิมพ์เลขผิด ใบใช้ไม่ได้ทั้งใบ */
  s.getRange(DATA_ROW, SH.doc.IN.custTaxId, n, 1).setNumberFormat('@');
  s.getRange(DATA_ROW, SH.doc.IN.custTel, n, 1).setNumberFormat('@');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.doc.IN.no, 130);
  s.setColumnWidth(SH.doc.IN.type, 150);
  s.setColumnWidth(SH.doc.IN.custName, 220);
  s.setColumnWidth(SH.doc.IN.custTaxId, 130);
  s.setColumnWidth(SH.doc.IN.custAddr, 300);
  /* ช่องภาพถ่ายของใบเป็น JSON ยาว บีบให้แคบไว้ คนจะได้ไม่เผลอไปแก้
     (ข้อมูลยังอยู่ครบ แค่ไม่เกะกะสายตาตอนเปิดชีทดู) */
  s.setColumnWidth(SH.doc.IN.snap, 60);
  s.getRange(DATA_ROW, SH.doc.IN.snap, n, 1).setFontColor('#9aa0a6').setNumberFormat('@');
  s.setColumnWidth(SH.doc.IN.sign, 60);
  s.getRange(DATA_ROW, SH.doc.IN.sign, n, 1).setFontColor('#9aa0a6').setNumberFormat('@');
  /* ประวัติการแก้ใบเป็นของให้คนย้อนมาอ่านตอนสงสัย ไม่ใช่ของที่ต้องเห็นทุกวัน
     ทำให้จางและแคบเหมือนช่องระบบอื่น ๆ จะได้ไม่มีใครเผลอไปพิมพ์ทับ
     แต่ไม่ซ่อน เพราะวันที่ต้องใช้คือวันที่ต้องหาให้เจอโดยไม่ต้องถามใคร */
  s.setColumnWidth(SH.doc.IN.revise, 90);
  s.getRange(DATA_ROW, SH.doc.IN.revise, n, 1).setFontColor('#9aa0a6').setNumberFormat('@');

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' ใบ ราวปีครึ่งที่ 20 ใบ/วัน)';
}

/* --------------------------------------------- ล้างออเดอร์ทดลองก่อนใช้งานจริง */

/**
 * ล้างออเดอร์ทั้งหมดออกให้เหลือศูนย์ — สำหรับตอนเลิกทดลองแล้วจะเริ่มคีย์ของจริง
 *
 * ล้างสามชีทที่ผูกกันเป็นชุดเดียว ต้องล้างพร้อมกัน ไม่งั้นข้อมูลค้างครึ่ง ๆ กลาง ๆ:
 *   ออเดอร์_หัวบิล · ออเดอร์_รายการ · ตัดล็อต
 * สต๊อกคงเหลือกับสรุปยอดขายเป็นสูตร จะกลับไปเป็นยอดยกมาเองเมื่อออเดอร์หายไป
 * และล็อตที่เคยถูกตัดจะคืนจำนวนกลับให้เอง เพราะยอดตัดมาจากชีท ตัดล็อต
 *
 * ไม่แตะ: ฐานสินค้า · ล็อตสินค้า · รับเข้า · ตั้งค่า · ตั้งค่าแอป
 * และ **ไม่แตะชีท เอกสาร** เพราะใบกำกับภาษีที่ออกไปแล้วเป็นเอกสารทางภาษีจริง
 * ลบทิ้งไม่ได้แม้ออเดอร์ต้นทางจะถูกล้าง (ใบพิมพ์ซ้ำได้อยู่ เพราะเก็บรายการไว้ในใบ)
 *
 * ล้างแล้วเลขออเดอร์ใบต่อไปกลับไปเริ่มที่ AST-26-0001 ใหม่
 * ส่วนเลขเอกสาร ONIV26 เดินต่อจากเดิม ไม่ถอยกลับ
 *
 * ต้องพิมพ์คำยืนยันมาด้วย กันกดพลาดจากเมนู เพราะกู้คืนไม่ได้
 *   clearAllOrders('ล้างออเดอร์ทั้งหมด')
 */
function clearAllOrders(confirm) {
  var WORD = 'ล้างออเดอร์ทั้งหมด';
  if (String(confirm || '').trim() !== WORD) {
    throw new Error('เพื่อกันกดพลาด ต้องสั่งแบบนี้:  clearAllOrders(\'' + WORD + '\')' +
      '  — ล้างแล้วกู้คืนไม่ได้ ถ้ายังไม่แน่ใจให้สำรองชีทไว้ก่อน (ไฟล์ > สร้างสำเนา)');
  }
  var email = requireStaff_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var out = [], total = 0;
    /* ล้างเฉพาะช่องกรอก ช่องสูตรไม่ถูกแตะเลย (clearRow_ เดินตาม IN เท่านั้น) */
    [['head', SH.head.IN.no], ['item', SH.item.IN.no], ['cut', SH.cut.IN.no]]
      .forEach(function (pair) {
        var key = pair[0], col = pair[1];
        var sh = sheet_(key);
        var last = formulaLimit_(key);
        var n = 0;
        if (last >= DATA_ROW) {
          var v = sh.getRange(DATA_ROW, col, last - DATA_ROW + 1, 1).getValues();
          for (var i = 0; i < v.length; i++) {
            if (v[i][0] !== '' && v[i][0] !== null) { clearRow_(key, DATA_ROW + i); n++; }
          }
        }
        total += n;
        out.push('  ' + SH[key].name + ': ล้าง ' + n + ' แถว');
      });

    SpreadsheetApp.flush();
    writeLog_(email, 'ล้างออเดอร์', SH.head.name, '', 'ทั้งหมด', total, 0,
      'เลิกทดลอง เริ่มคีย์ของจริง');

    var msg = 'ล้างออเดอร์เรียบร้อย รวม ' + total + ' แถว\n' + out.join('\n') +
      '\n\nใบต่อไปจะเป็น ' + peekNextOrderNo_() +
      '\nชีท เอกสาร ไม่ถูกแตะ — ใบกำกับภาษีที่ออกไปแล้วยังอยู่ครบ';
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/* ---------------------------------------- ปุ่ม Run ส่งค่าเข้าฟังก์ชันไม่ได้ */

/**
 * ตัวปลดล็อกสองขั้น สำหรับสั่งจากหน้าจอ Apps Script
 *
 * ปุ่ม Run ในหน้า Apps Script เรียกฟังก์ชันแบบไม่ส่งค่าเข้าไปเลย
 * คำยืนยันที่ต้องพิมพ์ (clearAllOrders('...')) จึงไปไม่ถึงตัวฟังก์ชัน
 * กด Run ทีไรก็ติดด่านกันกดพลาดทุกที ทั้งที่ตั้งใจจะล้างจริง ๆ
 *
 * เปลี่ยนเป็นสองขั้นแทน ซึ่งกันพลาดได้เท่ากันแต่กดจากหน้าจอได้จริง
 *   ขั้น 1  เลือก armClear         แล้วกด Run
 *   ขั้น 2  เลือก clearOldOrdersNow (หรือ clearAllOrdersNow) แล้วกด Run ภายใน 5 นาที
 *
 * ปลดล็อกแล้วใช้ได้ครั้งเดียว หมดเวลาหรือใช้ไปแล้วต้องปลดล็อกใหม่
 * เผลอกด Run ค้างไว้ข้ามวันจึงไม่ล้างข้อมูลทิ้งโดยไม่ตั้งใจ
 */
var ARM_KEY = 'arm_clear';
var ARM_MINUTES = 5;

function armClear() {
  requireStaff_();
  [OLD_KEY_, ALL_KEY_].forEach(function (k) {
    PropertiesService.getScriptProperties().setProperty(k, String(Date.now()));
  });
  var msg = 'ปลดล็อกแล้ว มีเวลา ' + ARM_MINUTES + ' นาที\n\n' +
    'ขั้นต่อไป เลือกฟังก์ชันข้างบนแล้วกด Run\n' +
    '  clearOldOrdersNow  = ล้างออเดอร์เก่า เก็บของวันนี้ไว้\n' +
    '  clearAllOrdersNow  = ล้างออเดอร์ทั้งหมด ไม่เหลือสักใบ';
  Logger.log(msg);
  return msg;
}

/**
 * กด Run ครั้งแรก = ยังไม่ลบ แต่รายงานว่าจะหายกี่ใบ แล้วปลดล็อกไว้ให้เอง
 * กด Run ครั้งที่สองภายใน 5 นาที = ล้างจริง
 *
 * ไม่ต้องสลับช่องฟังก์ชันไปมา และไม่มีทางลบโดยยังไม่ได้เห็นตัวเลขก่อน
 * เพราะครั้งแรกบังคับให้เห็นเสมอ
 *
 * ปลดล็อกแยกกันคนละฟังก์ชัน กด Run ที่ตัวล้างเฉพาะของเก่าไว้
 * แล้วเผลอไปกดตัวล้างทั้งหมด จึงไม่ทะลุผ่านไปได้
 */
var OLD_KEY_ = ARM_KEY + '_old';
var ALL_KEY_ = ARM_KEY + '_all';

function armed_(key) {
  var p = PropertiesService.getScriptProperties();
  var t = Number(p.getProperty(key) || 0);
  if (t && Date.now() - t < ARM_MINUTES * 60000) {
    p.deleteProperty(key);   // ใช้แล้วหมดไป กด Run ซ้ำโดยไม่ตั้งใจจึงไม่ล้างซ้ำ
    return true;
  }
  p.setProperty(key, String(Date.now()));
  return false;
}

function again_(what) {
  return '↑ ยังไม่ได้ลบอะไรเลย — ถ้าตัวเลขข้างบนถูกต้องแล้ว\n' +
    '   กด Run ที่ ' + what + ' อีกครั้งภายใน ' + ARM_MINUTES + ' นาที จึงจะล้างจริง';
}

/** ล้างออเดอร์เก่า เก็บของวันนี้ไว้ — กด Run สองครั้ง */
function clearOldOrdersNow() {
  requireStaff_();
  if (!armed_(OLD_KEY_)) {
    var msg = runClearOld_(false) + '\n\n' + again_('clearOldOrdersNow');
    Logger.log(msg);
    return msg;
  }
  return runClearOld_(true);
}

/** ล้างออเดอร์ทั้งหมด ไม่เหลือสักใบ — กด Run สองครั้ง */
function clearAllOrdersNow() {
  if (!armed_(ALL_KEY_)) {
    requireStaff_();
    var n = countOrders_();
    var msg = 'ทดลองดูก่อน — ยังไม่ได้ลบอะไรเลย\n' +
      '  จะล้างออเดอร์ทั้งหมด ' + n + ' ใบ ไม่เหลือสักใบ\n' +
      '  ' + SH.doc.name + ': ไม่แตะเลย\n\n' + again_('clearAllOrdersNow');
    Logger.log(msg);
    return msg;
  }
  return clearAllOrders('ล้างออเดอร์ทั้งหมด');
}

function countOrders_() {
  var s = sheet_('head');
  var last = formulaLimit_('head');
  if (last < DATA_ROW) return 0;
  var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
  var n = 0;
  for (var i = 0; i < v.length; i++) if (String(v[i][0] || '').trim()) n++;
  return n;
}

/**
 * ล้างเฉพาะออเดอร์เก่า เก็บของวันนี้ไว้
 *
 * ใช้ตอนเลิกทดลองแล้วเริ่มคีย์ของจริง แต่ของจริงคีย์ไปแล้วบางส่วน
 * clearAllOrders() ล้างหมดทั้งชีท ซึ่งจะกินใบจริงที่เพิ่งคีย์ไปด้วย
 *
 * "วันนี้" ยึดจากช่องวันที่ในหัวบิล ไม่ใช่เวลาที่กดบันทึก จะได้ตรงกับเลข
 * ที่หน้าสรุปยอดโชว์ในแท็บ "วันนี้" เป๊ะ ๆ ไม่มีทางเถียงกันเอง
 *
 * แถวใน ตัดล็อต ของใบที่ล้าง ถูกล้างไปด้วย ของในล็อตจึงคืนกลับมาเอง
 * ไม่ใช่หายไปพร้อมออเดอร์ทดลอง
 *
 * ชีท เอกสาร ไม่ถูกแตะ (เหมือน clearAllOrders) เพราะใบกำกับภาษีที่ออกไปแล้ว
 * ลบไม่ได้ตามกฎหมาย แต่รายงานจะบอกว่ามีกี่ใบที่อ้างออเดอร์ที่กำลังจะหายไป
 */
function clearOldOrders(confirm) {
  requireStaff_();
  var WORD = 'ล้างออเดอร์เก่า';
  if (String(confirm || '').trim() !== WORD) {
    throw new Error('เพื่อกันกดพลาด ต้องสั่งแบบนี้:  clearOldOrders(\'' + WORD + '\')' +
      '  — ล้างแล้วกู้คืนไม่ได้ อยากดูก่อนว่าจะหายกี่ใบให้สั่ง previewClearOldOrders() ก่อน');
  }
  return runClearOld_(true);
}

/** ดูก่อนว่าจะหายใบไหนบ้าง โดยยังไม่ลบอะไรเลย */
function previewClearOldOrders() {
  requireStaff_();
  return runClearOld_(false);
}

function runClearOld_(doIt) {
  var email = requireStaff_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var today = isoDate_(new Date());
    var hs = sheet_('head');
    var hLast = formulaLimit_('head');
    if (hLast < DATA_ROW) return 'ยังไม่มีออเดอร์ในชีทเลย';

    var hv = hs.getRange(DATA_ROW, 1, hLast - DATA_ROW + 1, SH.head.net).getValues();
    var killRows = [], killNos = {}, keep = 0, keepNet = 0, killNet = 0, noDate = [];

    for (var i = 0; i < hv.length; i++) {
      var no = String(hv[i][SH.head.IN.no - 1] || '').trim();
      if (!no) continue;
      var d = hv[i][SH.head.IN.date - 1];
      var iso = (d instanceof Date) ? isoDate_(d) : String(d || '').slice(0, 10);
      var net = Number(hv[i][SH.head.net - 1] || 0);
      if (iso === today) { keep++; keepNet += net; continue; }
      /* วันที่อ่านไม่ออก = ไม่ใช่ของวันนี้แน่ ๆ จึงล้าง แต่ต้องขึ้นในรายงานให้เห็นชัด
         จะได้ไม่มีใบไหนหายไปเงียบ ๆ โดยเจ้าของร้านไม่รู้ว่าหายเพราะอะไร */
      if (!iso) noDate.push(no);
      killRows.push(DATA_ROW + i);
      killNos[no] = true;
      killNet += net;
    }

    var nKill = killRows.length;
    var lines = [];
    lines.push((doIt ? 'ล้างออเดอร์เก่าเรียบร้อย' : 'ทดลองดูก่อน — ยังไม่ได้ลบอะไรเลย'));
    lines.push('วันนี้คือ ' + today);
    lines.push('  เก็บไว้ (ของวันนี้): ' + keep + ' ใบ  ยอดรวม ' + money_(keepNet));
    lines.push('  ' + (doIt ? 'ล้างไป' : 'จะล้าง') + ' (ก่อนวันนี้): ' + nKill + ' ใบ  ยอดรวม ' + money_(killNet));
    if (noDate.length) {
      lines.push('  ในนั้นมี ' + noDate.length + ' ใบที่ช่องวันที่ว่างหรืออ่านไม่ออก: ' +
        noDate.slice(0, 10).join(', ') + (noDate.length > 10 ? ' …' : ''));
    }

    /* นับแถวลูกของใบที่จะหาย ทั้งตอนพรีวิวและตอนล้างจริง ใช้ทางเดินเดียวกัน
       เลขที่พรีวิวบอกจึงเป็นเลขเดียวกับที่จะเกิดขึ้นจริง ไม่ใช่คนละตัวนับ */
    [['item', SH.item.IN.no], ['cut', SH.cut.IN.no]].forEach(function (pair) {
      var key = pair[0], col = pair[1];
      var sh = sheet_(key);
      var last = formulaLimit_(key);
      var n = 0;
      if (last >= DATA_ROW) {
        var v = sh.getRange(DATA_ROW, col, last - DATA_ROW + 1, 1).getValues();
        for (var j = 0; j < v.length; j++) {
          var ono = String(v[j][0] || '').trim();
          if (!ono || !killNos[ono]) continue;
          if (doIt) clearRow_(key, DATA_ROW + j);
          n++;
        }
      }
      lines.push('  ' + SH[key].name + ': ' + (doIt ? 'ล้าง ' : 'จะล้าง ') + n + ' แถว');
    });

    if (doIt) for (var k = killRows.length - 1; k >= 0; k--) clearRow_('head', killRows[k]);

    /* ใบกำกับภาษีที่ออกไปแล้วลบไม่ได้ตามกฎหมาย จึงไม่แตะ แต่ต้องบอกให้รู้
       ว่ามีใบที่ชี้ไปหาออเดอร์ที่ไม่มีอยู่แล้ว จะได้ไม่งงตอนเปิดชีท เอกสาร */
    var orphan = 0;
    if (sheetIfAny_('doc')) {
      var ds = sheet_('doc'), dLast = formulaLimit_('doc');
      if (dLast >= DATA_ROW) {
        var dv = ds.getRange(DATA_ROW, SH.doc.IN.orderNo, dLast - DATA_ROW + 1, 1).getValues();
        for (var m = 0; m < dv.length; m++) {
          if (killNos[String(dv[m][0] || '').trim()]) orphan++;
        }
      }
    }
    lines.push('  ' + SH.doc.name + ': ไม่แตะเลย' +
      (orphan ? ' (แต่มี ' + orphan + ' ใบที่อ้างออเดอร์ที่หายไป)' : ''));

    if (doIt) {
      SpreadsheetApp.flush();
      writeLog_(email, 'ล้างออเดอร์', SH.head.name, '', 'เฉพาะก่อนวันที่ ' + today,
        nKill + keep, keep, 'ล้างออเดอร์ทดลอง เก็บของวันนี้ไว้');
      lines.push('');
      lines.push('ของในล็อตที่ใบเก่าตัดไป คืนกลับมาแล้ว');
      lines.push('ใบต่อไปจะเป็น ' + peekNextOrderNo_());
    } else {
      lines.push('');
      lines.push('ถ้าตัวเลขถูกต้องแล้ว สั่งจริงด้วย  clearOldOrders(\'' + 'ล้างออเดอร์เก่า' + '\')');
    }

    var msg = lines.join('\n');
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

function money_(n) {
  var v = Math.round(Number(n || 0) * 100) / 100;
  return '฿' + v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * ตั้งเขตเวลาของสเปรดชีตให้ตรงกับสคริปต์
 *
 * เมนู ไฟล์ > การตั้งค่า > เขตเวลา มีเฉพาะบนคอม แอป Sheets บนมือถือไม่มีให้
 * เจ้าของร้านทำงานบนมือถือเป็นหลัก จึงทำเป็นฟังก์ชันให้กด เรียกใช้ แทน
 *
 * ทำไมต้องตรง: สคริปต์สร้างวันที่ตามเขตเวลาของตัวเอง แต่ชีทแสดงตามเขตเวลาของชีท
 * ต่างกันเมื่อไรวันที่เลื่อน — ของจริงเจอมาแล้ว คีย์ 1 ก.ย. แต่ชีทลง 31 ส.ค. 10:00
 * และสูตรที่ใช้ TODAY() ก็เพี้ยนตาม เช่นสถานะ "ใกล้หมดอายุ" ของล็อตเคมี
 *
 * ของแถม: ออเดอร์ที่ลงไปแล้วด้วยเขตเวลาผิด จะกลับมาแสดงวันที่ถูกเองทันที
 * เพราะค่าที่เก็บไว้เป็นเวลาจริง ที่เพี้ยนคือการแสดงผลเท่านั้น
 */
function fixTimeZone() {
  requireStaff_();
  var want = 'Asia/Bangkok';
  var ss = ss_();
  var before = ss.getSpreadsheetTimeZone();
  var script = Session.getScriptTimeZone();

  var out = [];
  out.push('เขตเวลาของสคริปต์: ' + script);
  out.push('เขตเวลาของสเปรดชีต (ก่อน): ' + before);

  if (before === want) {
    out.push('');
    out.push('ตรงกันดีอยู่แล้ว ไม่ต้องแก้อะไร');
  } else {
    ss.setSpreadsheetTimeZone(want);
    SpreadsheetApp.flush();
    out.push('เขตเวลาของสเปรดชีต (หลัง): ' + ss.getSpreadsheetTimeZone());
    out.push('');
    out.push('ตั้งให้ตรงกันแล้ว');
    out.push('ออเดอร์ที่ลงไปแล้วด้วยเขตเวลาเดิม จะกลับมาแสดงวันที่ถูกเองทันที');
    out.push('สูตรที่ใช้ TODAY() เช่นสถานะใกล้หมดอายุของล็อต ก็นับวันถูกตั้งแต่ตอนนี้');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * ตรวจว่าแอปกำลังอ่านไฟล์ไหน และในไฟล์นั้นมีอะไรอยู่จริง
 *
 * ทำเพราะเถียงกันไม่จบว่า "รหัสในแอปไม่ตรงกับที่แก้ในชีท" ซึ่งมีได้สองสาเหตุ
 * คือแก้คนละไฟล์กัน หรือแก้ไฟล์ถูกแล้วแต่ยังไม่ได้บันทึก
 * ฟังก์ชันนี้อ่านอย่างเดียว ไม่แก้ ไม่ลบ ไม่เขียนอะไรทั้งนั้น กด Run ได้ไม่ต้องกลัว
 */
function checkSheet() {
  requireStaff_();
  var ss = ss_();
  var out = [];
  out.push('แอปกำลังอ่านไฟล์นี้');
  out.push('  ชื่อไฟล์: ' + ss.getName());
  out.push('  ลิงก์: ' + ss.getUrl());
  out.push('  (ถ้าไม่ใช่ไฟล์ที่เพิ่งแก้ แปลว่าแก้คนละไฟล์กัน)');

  /* เขตเวลาไม่ตรงกันทำให้วันที่เลื่อนไปหนึ่งวัน และสูตร TODAY() นับผิดวัน
     เป็นอาการที่ดูยังไงก็ไม่เห็น ถ้าไม่เอามาบอกตรงนี้ */
  var stz = ss.getSpreadsheetTimeZone(), ktz = Session.getScriptTimeZone();
  out.push('  เขตเวลา: สเปรดชีต ' + stz + ' · สคริปต์ ' + ktz +
    (stz === ktz ? '  (ตรงกันดี)' : '  ← ไม่ตรงกัน! ให้ Run ที่ fixTimeZone'));
  out.push('');

  var rows = readAll_('prod');
  var C = SH.prod.IN;
  var stock = readStock_();
  var all = 0, chem = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = String(rows[i][C.sku - 1] || '').trim();
    if (!sku) continue;
    all++;
    if (sku.toLowerCase().indexOf('chem') < 0) continue;
    chem.push('  ' + sku + '  ' + String(rows[i][C.name - 1] || '').slice(0, 46) +
      '  ยกมา ' + (rows[i][C.opening - 1] === '' ? '(ว่าง)' : rows[i][C.opening - 1]) +
      '  คงเหลือ ' + (stock[sku] === undefined ? '(ไม่มีในชีทสต๊อก)' : stock[sku]));
  }
  out.push('ฐานสินค้า: ' + all + ' รายการ  เป็นเคมี ' + chem.length + ' รายการ');
  out.push('รหัสเคมีที่อยู่ในชีทตอนนี้จริง ๆ (ยกมา = ช่องที่กรอกเอง, คงเหลือ = ที่สูตรคำนวณ)');
  out = out.concat(chem.slice(0, 30));
  if (chem.length > 30) out.push('  … อีก ' + (chem.length - 30) + ' รายการ');
  out.push('');

  /* ออเดอร์ที่อยู่ในไฟล์นี้จริง ๆ — ตอบคำถาม "คีย์ออเดอร์ไปเยอะ แต่ทำไมหาไม่เจอ"
     ถ้าตรงนี้ขึ้น 0 ทั้งที่คีย์ไปแล้ว แปลว่าแอปเขียนลงคนละไฟล์กับที่กำลังเปิดดูอยู่ */
  var hs = sheet_('head');
  var hLast = formulaLimit_('head');
  var nos = [];
  if (hLast >= DATA_ROW) {
    var hv = hs.getRange(DATA_ROW, SH.head.IN.no, hLast - DATA_ROW + 1, 1).getValues();
    for (var h = 0; h < hv.length; h++) {
      var hno = String(hv[h][0] || '').trim();
      if (hno) nos.push(hno);
    }
  }
  out.push('ออเดอร์ในไฟล์นี้: ' + nos.length + ' ใบ');
  if (nos.length) {
    out.push('  ห้าใบล่าสุด: ' + nos.slice(-5).join(', '));
    out.push('  ใบต่อไปจะเป็น: ' + peekNextOrderNo_());
    out.push('  (ชีท ใบสรุปออเดอร์ โชว์ทีละใบ ต้องพิมพ์เลขใบใดใบหนึ่งข้างบนลงช่องสีเหลือง B5');
    out.push('   ถ้าเลขในช่องนั้นไม่มีอยู่จริง ทั้งชีทจะขึ้น #N/A ซึ่งปกติ ไม่ใช่ของเสีย)');
  } else {
    out.push('  ไม่มีออเดอร์เลยสักใบในไฟล์นี้');
    out.push('  ถ้าคีย์ออเดอร์ไปแล้ว แปลว่าแอปเขียนลงคนละไฟล์กับที่กำลังเปิดดูอยู่');
    out.push('  ให้กดลิงก์ข้างบนเพื่อเปิดไฟล์ที่แอปเขียนจริง');
  }
  out.push('');

  /* อ่านอาการของชีทสต๊อกโดยไม่ซ่อม จะได้รู้ว่ายอดคงเหลือที่เห็นเชื่อได้ไหม */
  var st = sheet_('stock');
  var cols = st.getLastColumn();
  var ref = countRef_(st, cols), skew = countSkew_(st), flat = countFlat_(st, cols);
  out.push('อาการของชีท ' + SH.stock.name);
  out.push('  #REF! ' + ref + ' ช่อง');
  out.push('  แถวที่ชี้ผิดตัวสินค้า ' + skew + ' แถว');
  out.push('  สูตรที่ถูกพิมพ์ทับเป็นเลขนิ่ง ' + flat + ' ช่อง');
  out.push((ref || skew || flat)
    ? '  → ยอดคงเหลือที่เห็นในแอปยังเชื่อไม่ได้ ให้ Run ที่ repairStockSheet ก่อน'
    : '  → ปกติดี ยอดคงเหลือที่เห็นในแอปเชื่อได้');

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * เลขนิ่งที่ค้างอยู่ใต้แถวสุดท้ายที่ยังมีสูตร — อ่านอย่างเดียว ไม่ลบอะไร
 *
 * เกิดตอนมีคนก๊อปช่องสูตรแล้ว "วางเฉพาะค่า" ลากยาวเกินแถวที่มีสูตรจริง
 * ตอนนี้ยังไม่ทำอะไรผิดเพราะระบบไม่เขียนออเดอร์เกินแถวที่มีสูตรอยู่แล้ว
 * แต่วันที่ลากสูตรลงมาเพิ่ม ยอดผิดพวกนี้จะกลายเป็นยอดของออเดอร์ใหม่ทันที
 */
function calcJunkBelow_(key) {
  var cfg = SH[key];
  var out = { n: 0, from: 0, to: 0 };
  var cols = cfg.CALC || [];
  if (!cols.length) return out;
  var sh = sheetIfAny_(key);
  if (!sh) return out;
  var start = formulaLimit_(key) + 1;
  var last = sh.getLastRow();
  if (last < start) return out;

  var wide = sh.getLastColumn();
  var v = sh.getRange(start, 1, last - start + 1, wide).getValues();
  var f = sh.getRange(start, 1, last - start + 1, wide).getFormulas();
  for (var i = 0; i < v.length; i++) {
    for (var k = 0; k < cols.length; k++) {
      var c = cols[k];
      if (c > wide) continue;
      if (String(f[i][c - 1] || '').charAt(0) === '=') continue;
      var val = v[i][c - 1];
      if (val === '' || val === null || val === undefined) continue;
      out.n++;
      if (!out.from) out.from = start + i;
      out.to = start + i;
    }
  }
  return out;
}

/**
 * ช่องสูตรช่องนี้ยังใช้ได้ไหม — คำตอบเดียวที่ทั้งการตรวจและการซ่อมใช้ร่วมกัน
 *
 * '' = ปกติ · 'flat' = ถูกพิมพ์ทับจนไม่เหลือสูตร · 'ref' = ยังเป็นสูตรแต่ชี้ไปหาช่องที่ถูกลบ
 *
 * ตัว 'ref' สำคัญไม่แพ้กัน และเคยหลุดมาแล้ว: 7 ก.ย. 69 ช่อง VAT กับยอดสุทธิของ
 * ใบที่ "รับ VAT" เป็น =...#REF!... ทั้งคอลัมน์ ตัวตรวจเดิมเห็นว่าขึ้นต้นด้วย =
 * ก็นับว่าปกติ เลยไม่ซ่อมให้ ทั้งที่ใบละพันบาทอ่านยอดไม่ได้เลยสักใบ
 */
function calcBad_(f) {
  f = String(f == null ? '' : f);
  if (f.charAt(0) !== '=') return 'flat';
  if (f.indexOf('#REF!') > -1) return 'ref';
  return '';
}

/** นับช่องที่ควรเป็นสูตรตาม CALC แต่ใช้ไม่ได้แล้ว พร้อมบอกแถวต้นแบบที่ยังดี */
function scanCalc_(key) {
  var cfg = SH[key];
  var cols = cfg.CALC || [];
  var out = { flat: 0, ref: 0, bad: 0, rows: 0, good: 0, cols: cols };
  /* ชีทที่ยังไม่มีในไฟล์ให้ข้ามไป ไม่ใช่ล้มทั้งการซ่อม ชีทอื่นจะได้ซ่อมต่อได้ */
  if (!cols.length || !sheetIfAny_(key)) { out.cols = []; return out; }
  var sh = sheet_(key);
  var limit = formulaLimit_(key);
  if (limit < DATA_ROW) return out;
  var n = limit - DATA_ROW + 1;
  out.rows = n;
  out.f = sh.getRange(DATA_ROW, 1, n, sh.getLastColumn()).getFormulas();
  for (var i = 0; i < n; i++) {
    var whole = true;
    for (var k = 0; k < cols.length; k++) {
      var c = cols[k];
      var why = c <= out.f[i].length ? calcBad_(out.f[i][c - 1]) : 'flat';
      if (!why) continue;
      out[why]++; out.bad++; whole = false;
    }
    /* แถวต้นแบบคือแถวแรกที่ทุกช่องสูตรยังครบ ใช้เป็นตัวคัดลอกไปซ่อมแถวที่พัง */
    if (whole && !out.good) out.good = DATA_ROW + i;
  }
  return out;
}

/**
 * ซ่อมสูตรของชีทที่มีคอลัมน์สูตรปนกับคอลัมน์กรอก
 *
 * ต่างจาก repairStockSheet ตรงที่ชีทพวกนี้มีข้อมูลที่คนกรอกเองปนอยู่ในแถวเดียวกัน
 * จะคัดลอกทั้งแถวแบบชีทสต๊อกไม่ได้ เพราะข้อมูลออเดอร์จะถูกทับหาย
 * จึงคัดลอกเฉพาะคอลัมน์ที่อยู่ใน CALC และวางแบบ "เฉพาะสูตร" เท่านั้น
 *
 * และไม่ฮาร์ดโค้ดสูตรไว้ในโค้ด เพราะสูตรพวกนี้เจ้าของร้านเขียนเอง
 * เดาผิดแม้ช่องเดียวคือใบเสร็จยอดผิด — ใช้แถวที่ยังดีในชีทเดียวกันเป็นต้นแบบแทน
 * อ้างอิงสัมพัทธ์จะขยับตามแถวให้เอง
 */
function repairOrderSheets() {
  requireStaff_();
  var keys = ['head', 'item', 'prod', 'recv', 'lot', 'cut', 'doc'];
  var out = [], total = 0;

  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var cfg = SH[key];
    var before = scanCalc_(key);
    if (!before.cols.length) continue;
    /* formulaLimit_ วัดจากคอลัมน์เดียว ถ้าคอลัมน์นั้นถูกล้างหมดทั้งชีท
       จะดูเหมือนไม่มีสูตรเลยและถูกข้ามไปเงียบ ๆ ต้องบอกให้รู้ */
    if (!before.rows) {
      out.push('  ' + cfg.name + ': ไม่เหลือสูตรเลยแม้แต่แถวเดียว ' +
        '(วัดจากคอลัมน์ที่ ' + cfg.probe + ') — ต้องกู้ชีทจากประวัติเวอร์ชันของ Google');
      continue;
    }
    /* เลขนิ่งที่ค้างอยู่ "ใต้" แถวสุดท้ายที่มีสูตร ตัวซ่อมไม่แตะ เพราะไม่รู้ว่า
       เจ้าของร้านตั้งใจเขียนอะไรไว้เองหรือเปล่า แต่ต้องบอกให้รู้ทุกครั้ง
       ถึงจะไม่มีอะไรต้องซ่อมก็ตาม — วันที่ลากสูตรลงมาเพิ่ม ยอดผิดพวกนี้จะติดมาด้วย */
    var junk = calcJunkBelow_(key);
    var junkMsg = junk.n
      ? '  ' + cfg.name + ': มีเลขนิ่งค้างอยู่ใต้แถวสุดท้ายที่มีสูตร ' + junk.n +
        ' ช่อง (แถว ' + junk.from + '-' + junk.to + ') — เลือกช่วงนั้นแล้วกด Delete ทิ้ง ' +
        'ตัวซ่อมไม่ลบให้เพราะไม่รู้ว่าตั้งใจเขียนไว้เองหรือเปล่า'
      : '';

    if (!before.bad) {
      out.push('  ' + cfg.name + ': ปกติดีอยู่แล้ว');
      if (junkMsg) out.push(junkMsg);
      continue;
    }
    if (!before.good) {
      out.push('  ' + cfg.name + ': เสีย ' + before.bad + ' ช่อง แต่ไม่มีแถวไหนสูตรครบเลย ' +
        'จึงไม่มีต้นแบบให้คัดลอก — ต้องซ่อมด้วยมือ');
      if (junkMsg) out.push(junkMsg);
      continue;
    }

    var sh = sheet_(key);
    var fixedCells = 0;
    for (var k = 0; k < before.cols.length; k++) {
      var c = before.cols[k];
      /* รวมแถวที่พังซึ่งติดกันเป็นช่วงเดียว แล้วคัดลอกทีเดียว ลดรอบคุยกับ Google */
      var start = 0, len = 0;
      for (var r = 0; r <= before.rows; r++) {
        var bad = false;
        if (r < before.rows) {
          var row = before.f[r];
          bad = c > row.length || !!calcBad_(row[c - 1]);
        }
        if (bad) { if (!len) start = DATA_ROW + r; len++; continue; }
        if (len) {
          sh.getRange(before.good, c).copyTo(sh.getRange(start, c, len, 1),
            SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
          fixedCells += len;
          len = 0;
        }
      }
    }

    SpreadsheetApp.flush();
    var after = scanCalc_(key);
    total += fixedCells;
    out.push('  ' + cfg.name + ': ซ่อม ' + fixedCells + ' ช่อง (เหลือ ' + after.bad + ') ' +
      '— เลขนิ่ง ' + before.flat + ' · #REF! ' + before.ref + ' ' +
      'ใช้แถว ' + before.good + ' เป็นต้นแบบ');

    if (junkMsg) out.push(junkMsg);
  }

  var msg = 'ซ่อมสูตรของชีทออเดอร์\n' + (out.length ? out.join('\n') : '  ไม่มีอะไรต้องซ่อม') +
    '\n\nรวมซ่อม ' + total + ' ช่อง' +
    '\nคอลัมน์ที่คนกรอกเองไม่ถูกแตะเลย คัดลอกเฉพาะช่องสูตรอย่างเดียว';
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------- เลขเอกสารที่หายไปจากเล่ม */

/** เลขที่หายไปของแต่ละชุดเอกสาร — อ่านอย่างเดียว ไม่เขียนอะไร */
function docGaps_() {
  var cfg = appCfg_();
  var s = sheetIfAny_('doc');
  var out = [];
  if (!s) return out;
  var last = formulaLimit_('doc');
  if (last < DATA_ROW) return out;

  var C = SH.doc.IN;
  var v = s.getRange(DATA_ROW, C.no, last - DATA_ROW + 1, 1).getValues();

  for (var k = 0; k < DOC_TYPES.length; k++) {
    var t = DOC_TYPES[k];
    var prefix = cfg.docPrefix[t.key] || (t.code + '26-');
    var used = {}, max = 0, min = 0;
    for (var i = 0; i < v.length; i++) {
      var no = String(v[i][0] || '').trim();
      if (no.indexOf(prefix) !== 0) continue;
      var n = parseInt(no.substring(prefix.length), 10);
      if (isNaN(n)) continue;
      used[n] = true;
      if (n > max) max = n;
      if (!min || n < min) min = n;
    }
    if (!max) continue;

    /* เริ่มนับช่องว่างจากเลขแรกที่ระบบออกเอง ไม่ใช่จากเลข 1
       เล่มก่อนหน้าที่ยกยอดมาไม่ได้อยู่ในชีทนี้ จึงไม่ใช่ช่องว่างของเรา */
    var floor = Number(cfg.docStart[t.key] || 0) || 0;
    var from = Math.max(min, floor + 1);
    var miss = [];
    for (var n2 = from; n2 <= max; n2++) if (!used[n2]) miss.push(prefix + pad5_(n2));
    if (miss.length) out.push({ key: t.key, th: t.th, prefix: prefix, miss: miss });
  }
  return out;
}

function pad5_(n) {
  var t = String(n);
  while (t.length < 5) t = '0' + t;
  return t;
}

/** ดูก่อนว่าเล่มขาดเลขอะไรบ้าง โดยยังไม่เขียนอะไรลงชีท */
function previewDocGaps() {
  requireStaff_();
  var g = docGaps_();
  if (!g.length) {
    var okMsg = 'เลขเอกสารเรียงครบทุกชุด ไม่มีเลขขาด';
    Logger.log(okMsg);
    return okMsg;
  }
  var out = ['เลขที่หายไปจากเล่ม (ยังไม่ได้เติมให้)'];
  var n = 0;
  for (var i = 0; i < g.length; i++) {
    out.push('  ' + g[i].th + ': ' + g[i].miss.join(', '));
    n += g[i].miss.length;
  }
  out.push('');
  out.push('รวม ' + n + ' เลข — สั่ง fillDocGaps() เพื่อเติมกลับเข้าเล่ม');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * เติมเลขที่หายไปกลับเข้าเล่ม เพื่อให้เลขเอกสารเรียงครบไม่มีรู
 *
 * สิ่งที่สรรพากรถามเวลาตรวจคือ "เลขนี้ไปไหน" — เลขที่หายไปเฉย ๆ ตอบไม่ได้
 * ส่วนใบที่ยกเลิกแล้วแต่ยังอยู่ในเล่มพร้อมเหตุผล ตอบได้ทันทีและถือว่าถูกต้อง
 *
 * เลขหายได้สองทาง และทั้งสองทางเกิดขึ้นจริงกับร้านนี้แล้ว
 *   ตั้งช่องยกยอดสูงกว่าเลขที่ออกไปจริง ระบบเลยข้ามไปเลขถัดไป (ONIV26-00241)
 *   ลบแถวใบที่ยกเลิกทิ้งทั้งแถว แทนที่จะปล่อยไว้พร้อมเหตุผล (00248-00250)
 *
 * ตัวนี้เติมแถวใหม่ให้เฉพาะเลขที่ไม่มีในชีทเลย ไม่แตะแถวที่มีอยู่แล้วแม้แต่แถวเดียว
 * และกรอกเหตุผลกลาง ๆ ไว้ให้ ต้องไปแก้เป็นเหตุผลจริงทีหลัง
 *
 * ใบที่เคยออกแล้วยกเลิกไป ถ้ายังอยากได้ยอดกับชื่อลูกค้าเดิมคืน
 * ให้กู้จากประวัติเวอร์ชันของ Google ก่อน (ไฟล์ › ประวัติเวอร์ชัน) แล้วค่อยสั่งตัวนี้
 * ตัวนี้ทำได้แค่ทำให้เลขครบ ไม่รู้ว่าใบที่หายไปเคยมีอะไรอยู่
 */
function fillDocGaps() {
  var email = requireStaff_();
  var g = docGaps_();
  if (!g.length) {
    var okMsg = 'เลขเอกสารเรียงครบทุกชุดอยู่แล้ว ไม่มีอะไรต้องเติม';
    Logger.log(okMsg);
    return okMsg;
  }

  var total = 0;
  for (var i = 0; i < g.length; i++) total += g[i].miss.length;
  if (total > 50) {
    throw new Error('เลขที่หายไปมีถึง ' + total + ' เลข ซึ่งมากผิดปกติ — ' +
      'น่าจะตั้งช่องยกยอดผิดมากกว่าเลขหายจริง ให้สั่ง previewDocGaps() ดูก่อน ' +
      'แล้วแก้ช่อง "ยกยอดเลข...มาจาก" ในชีท ตั้งค่าแอป ให้ตรงกับเล่มเดิมก่อน');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('ระบบกำลังยุ่งอยู่ ลองใหม่อีกครั้ง');
  try {
    var why = 'ไม่ได้ใช้เลขนี้ — เติมกลับเข้าเล่มให้เลขครบ ' +
      '(ถ้าเคยออกใบจริงแล้วยกเลิก ให้แก้เหตุผลตรงนี้ให้ตรงกับของจริง)';
    var done = [];
    for (var a = 0; a < g.length; a++) {
      for (var b = 0; b < g[a].miss.length; b++) {
        var no = g[a].miss[b];
        var row = nextRow_('doc', SH.doc.IN.no);
        if (!row) throw new Error('ชีท ' + SH.doc.name + ' เต็มแล้ว — สั่ง setup() อีกครั้งเพื่อขยายแถว');
        /* เขียนแค่สามช่อง เลข ชนิด และเหตุผล — ไม่ใส่วันที่และไม่ใส่ยอด
           เพราะใบนี้ไม่ได้ออกจริง ใส่ตัวเลขไปจะกลายเป็นยอดขายผีในรายงาน */
        writeRow_('doc', row, { no: no, type: g[a].th, voidWhy: why });
        writeLog_(email, 'เติมเลขเอกสาร', SH.doc.name, no, g[a].th, '', 'ไม่ได้ใช้',
          'เติมกลับเข้าเล่มให้เลขเรียงครบ โดย ' + email);
        done.push(no);
      }
    }
    SpreadsheetApp.flush();

    var msg = 'เติมเลขกลับเข้าเล่มแล้ว ' + done.length + ' เลข\n  ' + done.join(', ') +
      '\n\nทุกแถวใส่เหตุผลกลาง ๆ ไว้ให้ — ให้เปิดชีท ' + SH.doc.name +
      ' แล้วแก้ช่อง "เหตุผลที่ยกเลิก" ของแถวที่เคยออกใบจริงให้ตรงกับความจริง' +
      '\nเลขใบถัดไปไม่เปลี่ยน เพราะเลขที่เติมเป็นเลขที่ต่ำกว่าเลขล่าสุดอยู่แล้ว';
    Logger.log(msg);
    return msg;
  } finally {
    lock.releaseLock();
  }
}

/**
 * ส่องสูตรของชีทออเดอร์ ว่ายังคำนวณได้อยู่ไหม
 *
 * ทำเพราะบันทึกออเดอร์แล้วชีทคำนวณยอดสินค้าได้ 0 ทั้งที่ควรได้ 178
 * ด่านตรวจยอดจึงถอยใบนั้นออก (ซึ่งถูกแล้ว ดีกว่าปล่อยบิลยอดผิดค้างไว้)
 * แต่ต้องรู้ให้ได้ว่าสูตรช่องไหนพัง ถึงจะซ่อมถูกจุด
 *
 * อ่านอย่างเดียว ไม่แก้ ไม่ลบ ไม่เขียนอะไรทั้งนั้น
 */
function checkFormulas() {
  requireStaff_();
  var out = [];

  function dump(key, cols, labels) {
    var cfg = SH[key];
    var sh = sheet_(key);
    var limit = formulaLimit_(key);
    out.push('— ชีท ' + cfg.name + ' (สูตรลากถึงแถว ' + limit + ') —');
    if (limit < DATA_ROW) { out.push('  ไม่มีสูตรเลยสักแถว'); out.push(''); return; }

    /* แถว 6 เป็นแถวต้นแบบ ถ้าตรงนี้ไม่ใช่สูตร แถวอื่นก็มักไม่ใช่ตามไปด้วย */
    for (var i = 0; i < cols.length; i++) {
      var c = cols[i];
      var f = sh.getRange(DATA_ROW, c).getFormula();
      var v = sh.getRange(DATA_ROW, c).getValue();
      out.push('  ' + sh.getRange(DATA_ROW, c).getA1Notation() + ' ' + labels[i] + ': ' +
        (f ? f.slice(0, 96) : 'ไม่ใช่สูตรแล้ว! ค่าที่ค้างอยู่ = ' + JSON.stringify(v)));
    }

    /* นับทั้งชีทว่าช่องที่ควรเป็นสูตร กลายเป็นค่านิ่งไปกี่ช่อง */
    var n = limit - DATA_ROW + 1;
    var all = sh.getRange(DATA_ROW, 1, n, sh.getLastColumn()).getFormulas();
    var flat = 0;
    for (var r = 0; r < all.length; r++) {
      for (var k = 0; k < (cfg.CALC || []).length; k++) {
        var col = cfg.CALC[k];
        if (col > all[r].length) continue;
        if (String(all[r][col - 1] || '').charAt(0) !== '=') flat++;
      }
    }
    out.push('  ช่องที่ควรเป็นสูตรแต่ไม่ใช่สูตรแล้ว: ' + flat + ' ช่อง');
    out.push('');
  }

  dump('head', [SH.head.subtotal, 13, SH.head.net],
       ['ยอดสินค้า', 'VAT', 'ยอดชำระสุทธิ']);
  dump('item', [8, 10, 15, 16],
       ['ราคามาตรฐาน', 'ยอดรวม', 'ลำดับในบิล', 'คีย์อ้างอิง']);

  /* ราคาขายของสินค้าตัวอย่าง ใช้ดูว่าตัวคูณที่สูตรจะไปดึงมีค่าจริงไหม */
  var rows = readAll_('prod');
  var shown = 0;
  out.push('— ราคาขายใน ฐานสินค้า (ตัวอย่าง) —');
  for (var i = 0; i < rows.length && shown < 5; i++) {
    var sku = String(rows[i][SH.prod.IN.sku - 1] || '').trim();
    if (!sku) continue;
    out.push('  ' + sku + '  ราคาขาย ' + JSON.stringify(rows[i][SH.prod.IN.price - 1]) +
      '  ต้นทุน ' + JSON.stringify(rows[i][SH.prod.IN.cost - 1]));
    shown++;
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* ------------------------------------------------- ซ่อมชีทสต๊อกที่ขึ้น #REF! */

/**
 * ซ่อมสูตรในชีท สต๊อกคงเหลือ ที่พังเป็น #REF!
 *
 * ต้นเหตุ: เวลาลบ "ทั้งแถว" ออกจากชีท ฐานสินค้า สูตรของชีทอื่นที่ชี้มาที่แถวนั้น
 * จะกลายเป็น #REF! ถาวร — ตอนเอาสินค้าออก 33 ตัว ชีทสต๊อกพังไป 38 แถวแบบนี้
 * ผลคือมูลค่าสต๊อกรวมในชีท สรุปยอดขาย ก็ขึ้น #REF! ตามไปด้วย
 *
 * วิธีซ่อม: ชีทนี้เป็นสูตรล้วนทุกช่อง เอาสูตรแถว 6 ที่ยังดีคัดลอกลงมาทับทั้งชีท
 * อ้างอิงสัมพัทธ์จะขยับตามแถวเอง ทุกแถวจึงกลับไปชี้ ฐานสินค้า แถวตรงกัน
 *
 * ปลอดภัยเพราะไม่มีข้อมูลที่คนกรอกเองอยู่ในชีทนี้เลย ทุกช่องคำนวณจากที่อื่นทั้งหมด
 *
 * > เลี่ยงปัญหานี้ในอนาคต: เอาสินค้าออกด้วยการ **ลบค่าในช่อง** ไม่ใช่ **ลบทั้งแถว**
 */
/**
 * สูตรตั้งต้นของแถว 6 ในชีท สต๊อกคงเหลือ
 *
 * ชีทนี้เป็นสูตรล้วนทุกช่อง ไม่มีอะไรที่คนต้องกรอกเอง แต่เคยเจอกรณีที่คนวาง
 * "เฉพาะค่า" ทับลงไป ทำให้ห้าคอลัมน์ (C, E, I, K, M) กลายเป็นเลขนิ่ง
 * ผลคือขายของแล้วยอดคงเหลือไม่ลด ระบบตัดสต๊อกตายเงียบโดยไม่มีอะไรฟ้อง
 *
 * ตัวซ่อมเดิมใช้แถว 6 เป็นต้นแบบคัดลอกลงมา ถ้าแถว 6 เองกลายเป็นเลขนิ่ง
 * มันจะคัดลอกเลขนิ่งลงไปทั้งชีท คือทำให้พังหนักกว่าเดิม
 * จึงต้องรู้ว่าสูตรที่ถูกต้องหน้าตาเป็นอย่างไร เพื่อประกอบแถว 6 คืนก่อนคัดลอก
 */
var STOCK_ROW6 = {
  1:  '=IF($B6="","",COUNTA($B$6:$B6))',
  2:  '=IF(\'ฐานสินค้า\'!$B6="","",\'ฐานสินค้า\'!$B6)',
  3:  '=IF($B6="","",\'ฐานสินค้า\'!$D6)',
  4:  '=IF($B6="","",\'ฐานสินค้า\'!$F6)',
  5:  '=IF($B6="","",\'ฐานสินค้า\'!$I6)',
  9:  '=IF($B6="","",$E6+$F6-$G6-$H6)',
  10: '=IF($B6="","",\'ฐานสินค้า\'!$J6)',
  11: '=IF($B6="","",\'ฐานสินค้า\'!$G6)',
  12: '=IF($B6="","",ROUND($I6*$K6,2))',
  13: '=IF($B6="","",\'ฐานสินค้า\'!$H6)',
  14: '=IF($B6="","",ROUND($I6*$M6,2))'
};

/**
 * บอกว่า SKU ไหนที่ยอดล็อตไม่ตรงกับยอดสต๊อก และไม่ตรงเพราะอะไร
 *
 * ช่อง I3 ของชีท ล็อตสินค้า นับจำนวน SKU ที่เพี้ยนไว้ให้แล้ว แต่บอกแค่ตัวเลข
 * เห็นเลข 4 ก็รู้แค่ว่ามีปัญหา ไม่รู้ว่าตัวไหน ต้องไล่ดูเองทีละแถวจากร้อยกว่าแถว
 * คำเตือนที่ไม่บอกว่าตัวไหนคือคำเตือนที่ลงมือแก้ไม่ได้ ฟังก์ชันนี้จึงบอกให้ครบ
 *
 * สองชีทนับคนละทาง จึงเพี้ยนกันได้:
 *   ล็อตสินค้า   คงเหลือ = จำนวนรับ − ตัดออกแล้ว   (นับจากทะเบียนล็อต)
 *   สต๊อกคงเหลือ คงเหลือ = ยกมา + รับเข้า − ปรับลด − ขายออก  (นับจากเอกสาร)
 * ลงล็อตไว้แต่ไม่ได้ลง รับเข้า คู่กัน สองฝั่งก็ไม่มีวันตรงกัน
 */
function checkLotStock() {
  requireStaff_();
  var ls = sheet_('lot'), last = formulaLimit_('lot');
  var lot = {};
  if (last >= DATA_ROW) {
    var lv = ls.getRange(DATA_ROW, 1, last - DATA_ROW + 1, SH.lot.remain).getValues();
    for (var i = 0; i < lv.length; i++) {
      var k = String(lv[i][SH.lot.IN.sku - 1] || '').trim();
      if (!k) continue;
      if (!lot[k]) lot[k] = { got: 0, cut: 0, left: 0, rows: 0 };
      lot[k].got  += Number(lv[i][SH.lot.IN.qty - 1] || 0);
      lot[k].cut  += Number(lv[i][7] || 0);              /* H ตัดออกแล้ว */
      lot[k].left += Number(lv[i][SH.lot.remain - 1] || 0);
      lot[k].rows += 1;
    }
  }

  var ss = sheet_('stock'), slast = ss.getLastRow(), stock = {};
  if (slast >= DATA_ROW) {
    var sv = ss.getRange(DATA_ROW, 1, slast - DATA_ROW + 1, SH.stock.remain).getValues();
    for (var j = 0; j < sv.length; j++) {
      var sk = String(sv[j][SH.stock.sku - 1] || '').trim();
      if (!sk) continue;
      stock[sk] = { open: Number(sv[j][4] || 0), got: Number(sv[j][5] || 0),
                    adj: Number(sv[j][6] || 0), sold: Number(sv[j][7] || 0),
                    left: Number(sv[j][SH.stock.remain - 1] || 0) };
    }
  }

  /* สต๊อกติดลบคือหลักฐานว่าระบบขายของที่ตัวเองไม่รู้ว่ามี — ผิดเสมอ ไม่มีข้อยกเว้น
     ต้องไล่ทุก SKU ในชีทสต๊อก ไม่ใช่เฉพาะตัวที่มีล็อต เพราะตัวที่ไม่มีล็อตเลย
     จะไม่มีอะไรให้เทียบ แล้วหลุดจากรายงานไปเงียบ ๆ ทั้งที่ยอดพังหนักกว่า
     (ของจริง: SKU-169 กับ SKU-170 รับมาพร้อมกัน 6,000 ชิ้น เปิดล็อตไว้ตัวเดียว
      ตัวที่ไม่ได้เปิดล็อตจึงไม่เคยถูกฟ้องเลย) */
  var minus = [];
  for (var ns in stock) {
    if (!(stock[ns].left < 0)) continue;
    var m = stock[ns];
    minus.push('  ' + ns + ' : คงเหลือ ' + m.left +
      ' (ยกมา ' + m.open + ' + รับเข้า ' + m.got + ' − ปรับลด ' + m.adj +
      ' − ขายออก ' + m.sold + ')' + (lot[ns] ? '' : ' · ไม่มีล็อตในทะเบียนเลย'));
  }

  var bad = [];
  for (var sku in lot) {
    var st = stock[sku];
    if (!st) { bad.push('  ' + sku + ' : มีล็อต ' + lot[sku].rows + ' ล็อต คงเหลือ ' +
      lot[sku].left + ' แต่ไม่มี SKU นี้ในชีท ' + SH.stock.name); continue; }
    if (Math.round(lot[sku].left * 1000) === Math.round(st.left * 1000)) continue;

    /* แยกให้เห็นว่าเพี้ยนฝั่งของเข้าหรือฝั่งของออก จะได้รู้ว่าต้องไปแก้ที่ไหน */
    var inGap  = Math.round((lot[sku].got - (st.open + st.got)) * 1000) / 1000;
    var outGap = Math.round((lot[sku].cut - (st.sold + st.adj)) * 1000) / 1000;
    var why = [];
    if (inGap)  why.push(inGap > 0
      ? 'ของเข้าในล็อตมากกว่าในสต๊อก ' + inGap + ' ชิ้น — ลงล็อตแล้วแต่ยังไม่ได้ลง ' +
        SH.recv.name + ' หรือยอดยกมาใน ' + SH.prod.name + ' ยังเป็น 0'
      : 'ของเข้าในสต๊อกมากกว่าในล็อต ' + (-inGap) + ' ชิ้น — ลง ' + SH.recv.name +
        ' แล้วแต่ยังไม่ได้เปิดล็อตคู่กัน');
    if (outGap) why.push(outGap > 0
      ? 'ตัดล็อตมากกว่าที่สต๊อกหักออก ' + outGap + ' ชิ้น'
      : 'สต๊อกหักออกมากกว่าที่ตัดล็อต ' + (-outGap) + ' ชิ้น — ขายไปแล้วแต่ล็อตไม่ถูกตัด ' +
        '(สินค้าตัวนี้อาจขายตอนที่ยังไม่มีล็อตในทะเบียน)');
    if (!why.length) why.push('ยอดรวมสองฝั่งเท่ากัน แต่คงเหลือไม่เท่า — สูตรช่องคงเหลือน่าจะเสีย');

    bad.push('  ' + sku +
      '\n      ล็อต   : รับ ' + lot[sku].got + ' · ตัด ' + lot[sku].cut +
      ' · คงเหลือ ' + lot[sku].left + ' (' + lot[sku].rows + ' ล็อต)' +
      '\n      สต๊อก  : ยกมา ' + st.open + ' + รับเข้า ' + st.got +
      ' − ปรับลด ' + st.adj + ' − ขายออก ' + st.sold + ' = คงเหลือ ' + st.left +
      '\n      ต่างกัน : ' + (Math.round((lot[sku].left - st.left) * 1000) / 1000) + ' ชิ้น' +
      '\n      สาเหตุ : ' + why.join(' · '));
  }

  var head = minus.length
    ? '⚠ สต๊อกติดลบ ' + minus.length + ' SKU — ระบบขายของที่ไม่รู้ว่ามี ต้องแก้ก่อนเรื่องอื่น\n' +
      minus.join('\n') + '\n\n'
    : '';
  var msg = head + (bad.length
    ? 'ยอดล็อตไม่ตรงกับสต๊อก ' + bad.length + ' SKU\n' + bad.join('\n') +
      '\n\nแก้ที่ต้นเหตุ ไม่ต้องไปพิมพ์ทับช่องคงเหลือ เพราะเป็นช่องสูตร พิมพ์ทับแล้วจะนิ่งค้างไว้'
    : 'ยอดล็อตตรงกับยอดสต๊อกทุก SKU ที่มีล็อต (' + Object.keys(lot).length + ' SKU)');
  /* Apps Script เปิดกล่อง Log มาให้ดูบรรทัดท้ายสุดเสมอ ของยาว ๆ ต้องเลื่อนขึ้นไปหาเอง
     เรื่องด่วนที่สุดจึงต้องอยู่ท้ายด้วย ไม่ใช่อยู่แต่หัว — ไม่งั้นคนเปิดดูแล้วไม่เห็น
     แล้วก็ไม่รู้ว่ามีสต๊อกติดลบอยู่ (เจ้าของร้านเปิดดูรอบแรกแล้วไม่เห็น 16 ก.ย. 69) */
  var tail = '\n\n── สรุป ──\n' +
    (minus.length ? '⚠ สต๊อกติดลบ ' + minus.length + ' SKU (' +
       minus.map(function (t) { return t.trim().split(' ')[0]; }).join(' · ') +
       ') ← เลื่อนขึ้นไปบนสุดดูรายละเอียด\n'
     : 'ไม่มี SKU ไหนสต๊อกติดลบ\n') +
    (bad.length ? 'ยอดล็อตไม่ตรงกับสต๊อก ' + bad.length + ' SKU'
     : 'ยอดล็อตตรงกับสต๊อกทุกตัว');
  msg = msg + tail;

  Logger.log(msg);
  return msg;
}

/**
 * ขยายช่วงแถวในสูตรของคอลัมน์ รับเข้า · ปรับลด · ขายออก ให้ครอบข้อมูลทั้งชีท
 *
 * ---------------------------------------------------------------------------
 * อาการที่เจอจริง และเหตุผลที่ต้องมีฟังก์ชันนี้
 * ---------------------------------------------------------------------------
 * เจ้าของร้านนับสต๊อกทุกวันแล้วบอกว่า "ใส่แล้วไม่ตัดให้ เลขมั่วไปหมด"
 * ไล่ดูของจริงในชีทแล้วพบว่าแอปเขียนลง รับเข้า ครบถ้วนทุกแถว ไม่มีอะไรหาย
 * แต่คอลัมน์ "รับเข้า" ในชีท สต๊อกคงเหลือ นับได้แค่ถึงแถว 16 ของชีท รับเข้า
 *
 *   แถว 6–16   ตรงกันหมด
 *   แถว 17–25  เป็นศูนย์ทั้งหมด ทั้งที่มีของ 5,435 ชิ้น
 *
 * เพราะสูตร SUMIFS เขียนช่วงไว้ตายตัว เช่น รับเข้า!$H$6:$H$16 ตั้งแต่ตอนที่
 * ชีทยังมีข้อมูลไม่กี่แถว พอกรอกเกินแถวนั้นไป ชีทก็มองไม่เห็นอีกเลย
 * และไม่มีอะไรฟ้องสักอย่าง — ไม่ error ไม่ขึ้นเตือน ตัวเลขยังดูสวยปกติ
 * อาการจึงออกมาเป็น "ยอดคงเหลือติดลบ" ทั้งที่ของเต็มชั้น
 *
 * สามคอลัมน์นี้เป็นสูตรที่เจ้าของร้านเขียนเอง กติกาของโปรเจกต์คือห้ามเขียนทับ
 * ฟังก์ชันนี้จึงไม่ประกอบสูตรใหม่ แต่ "ขยายเลขแถวท้ายช่วง" ในสูตรเดิมเท่านั้น
 * เงื่อนไขว่านับประเภทไหนบ้าง คิดยังไง ยังเป็นของเดิมทุกตัวอักษร
 */
function fixStockSumRange() {
  requireStaff_();
  var out = fixStockSumRange_(true);
  Logger.log(out.text);
  return out.text;
}

/* คอลัมน์ที่เป็นสูตรของเจ้าของร้าน — ไม่มีใน STOCK_ROW6 โดยตั้งใจ */
var STOCK_SUM_COLS = { 6: 'รับเข้า', 7: 'ปรับลด', 8: 'ขายออก' };

/**
 * เติม "ประเภทรับเข้า" ที่มีในดรอปดาวน์แต่ไม่มีสูตรไหนนับ เข้าไปในสูตร
 *
 * ---------------------------------------------------------------------------
 * อาการที่เจอจริง
 * ---------------------------------------------------------------------------
 * ร้านนี้กรอกน้ำยาจากถัง 200 ลิตรใส่ขวดขายทุกวัน แล้วลงแถว รับเข้า ประเภท
 * "เติมน้ำยา" — คำนี้ระบบเป็นคนเติมเข้าดรอปดาวน์ให้เอง (EXTRA_RECV_TYPE)
 * เพื่อไม่ให้ช่องขึ้นสามเหลี่ยมเตือน แต่ไม่เคยมีใครเพิ่มคำนี้เข้าไปในสูตร
 * ของชีท สต๊อกคงเหลือ ซึ่งนับแค่ ซื้อเข้า · ปรับเพิ่ม · คืนจากลูกค้า
 *
 * ผลคือน้ำยาทุกขวดที่เติมมาตลอด ไม่เคยถูกนับเข้าสต๊อกเลยสักขวด
 * IPA 1000ml: เติมไป 230 ขวด แต่ชีทแสดง รับเข้า = 0 คงเหลือ −19
 * แล้วหน้าร้านขึ้นว่า "สินค้าหมด" ลูกค้ากดสั่งไม่ได้ ทั้งที่ของเต็มชั้น
 *
 * เลือกที่จะไม่ประกอบสูตรใหม่ทับ — ก๊อป SUMIFS ก้อนเดิมในสูตรนั้นมาหนึ่งก้อน
 * เปลี่ยนเฉพาะคำที่ใช้เทียบ แล้วต่อท้ายด้วย + ช่วงและคอลัมน์ที่อ้างจึงเหมือนเดิมเป๊ะ
 *
 * "ตรวจนับ" ไม่เติมให้ เพราะการตรวจนับคือ "ยอดจริงมีเท่านี้" ไม่ใช่ "เพิ่มมาเท่านี้"
 * เติมเข้าไปในสูตรบวกเมื่อไร ยอดจะเด้งเป็นสองเท่าทันที
 * ตอนนับสต๊อกจากแอป ระบบเขียนเป็นส่วนต่างด้วยคำที่สูตรนับอยู่แล้ว (pickStockType_)
 */
var STOCK_TYPE_SKIP = ['ตรวจนับ'];

function fixStockRecvTypes() {
  requireStaff_();
  var out = fixStockRecvTypes_();
  Logger.log(out.text);
  return out.text;
}

function fixStockRecvTypes_() {
  var s = sheet_('stock');
  var fx = stockTypeWords_();
  var types = (cfgLists_().recvType || []);

  var miss = [];
  for (var i = 0; i < types.length; i++) {
    var t = String(types[i] || '').trim();
    if (!t || STOCK_TYPE_SKIP.indexOf(t) > -1) continue;
    var seen = fx.up.concat(fx.down).some(function (w) {
      return t.indexOf(w) > -1 || w.indexOf(t) > -1;
    });
    if (!seen) miss.push(t);
  }
  if (!miss.length) {
    return { changed: 0, text: 'ทุกประเภทในดรอปดาวน์มีสูตรนับให้อยู่แล้ว' };
  }

  /* ประเภทที่ชื่อบอกว่าเป็นการลด ให้เข้าช่องปรับลด ที่เหลือถือเป็นของเข้า
     เดาจากชื่อได้แค่นี้ จึงต้องรายงานออกไปให้เห็นทุกตัวว่าเอาเข้าช่องไหน */
  var up = [], dn = [];
  for (var k = 0; k < miss.length; k++) {
    (/ลด|จ่ายออก|เสียหาย|ทิ้ง/.test(miss[k]) ? dn : up).push(miss[k]);
  }

  var notes = [], changed = 0;
  [[6, up], [7, dn]].forEach(function (pair) {
    var col = pair[0], words = pair[1];
    if (!words.length) return;
    var cell = s.getRange(DATA_ROW, col);
    var f = String(cell.getFormula() || '');
    var built = addSumifsTerms_(f, words);
    if (!built) {
      notes.push('  ' + STOCK_SUM_COLS[col] + ': หาก้อน SUMIFS ในสูตรไม่เจอ ' +
        'จึงเติม ' + words.join(' · ') + ' ให้ไม่ได้ — ต้องเพิ่มเองในชีท');
      return;
    }
    cell.setFormula(built);
    cell.copyTo(s.getRange(DATA_ROW + 1, col, STOCK_LAST - DATA_ROW, 1));
    changed++;
    notes.push('  ' + STOCK_SUM_COLS[col] + ': เพิ่ม ' + words.join(' · '));
  });
  SpreadsheetApp.flush();

  return { changed: changed,
    text: (changed ? 'เพิ่มประเภทที่ไม่เคยถูกนับ เข้าไปในสูตรของ ' + SH.stock.name
                   : 'เจอประเภทที่ไม่มีสูตรนับ แต่เติมให้ไม่ได้') + '\n' +
      notes.join('\n') +
      '\n  ข้ามให้ตั้งใจ: ' + STOCK_TYPE_SKIP.join(' · ') +
      ' (เป็นยอดจริง ไม่ใช่ยอดที่เพิ่มมา เติมเข้าสูตรบวกแล้วยอดจะเด้งสองเท่า)' };
}

/**
 * ต่อ SUMIFS ก้อนใหม่ท้ายก้อนสุดท้าย โดยใช้ก้อนเดิมเป็นแม่แบบ
 *
 * คัดลอกก้อนเดิมมาทั้งดุ้นแล้วเปลี่ยนเฉพาะข้อความในเครื่องหมายคำพูดตัวสุดท้าย
 * ช่วงแถว คอลัมน์ที่เทียบ และวิธีอ้างอิง จึงตรงกับของเดิมทุกตัวอักษร
 * ปลอดภัยกว่าประกอบสูตรใหม่เอง ซึ่งต้องเดาว่าเจ้าของร้านอ้างคอลัมน์ไหนไว้บ้าง
 */
function addSumifsTerms_(f, words) {
  var i = f.indexOf('SUMIFS(');
  if (i < 0) return '';

  var last = null, from = 0;
  while (true) {
    var at = f.indexOf('SUMIFS(', from);
    if (at < 0) break;
    var depth = 0, end = -1;
    for (var j = at + 6; j < f.length; j++) {
      if (f.charAt(j) === '(') depth++;
      else if (f.charAt(j) === ')') { depth--; if (!depth) { end = j; break } }
    }
    if (end < 0) break;
    last = { start: at, end: end, text: f.slice(at, end + 1) };
    from = end + 1;
  }
  if (!last) return '';

  var add = '';
  for (var k = 0; k < words.length; k++) {
    /* แทนที่ข้อความในคำพูดตัวสุดท้ายของก้อนแม่แบบ = เงื่อนไขประเภท */
    var t = last.text.replace(/"((?:[^"]|"")*)"(?=[^"]*$)/, '"' + String(words[k]).replace(/"/g, '""') + '"');
    if (t === last.text) return '';        /* ไม่มีคำพูดให้เปลี่ยน แปลว่าเดาผิด */
    add += '+' + t;
  }
  return f.slice(0, last.end + 1) + add + f.slice(last.end + 1);
}

function fixStockSumRange_(loud) {
  var ss = ss_();
  var s = sheet_('stock');
  var notes = [], changed = 0;

  for (var col in STOCK_SUM_COLS) {
    col = Number(col);
    if (col > s.getLastColumn()) continue;
    var cell = s.getRange(DATA_ROW, col);
    var f = String(cell.getFormula() || '');
    if (f.charAt(0) !== '=') {
      notes.push('  ' + cell.getA1Notation() + ' (' + STOCK_SUM_COLS[col] +
        ') ไม่มีสูตร เป็นเลขนิ่ง — ต้องใส่สูตรเองก่อน');
      continue;
    }
    var out = widenRanges_(ss, f);
    if (out.text === f) continue;
    cell.setFormula(out.text);
    changed++;
    notes.push('  ' + cell.getA1Notation() + ' (' + STOCK_SUM_COLS[col] + ') ' +
      out.hits.join(' · '));
  }

  if (!changed) {
    return { changed: 0, text: loud ? 'ช่วงแถวในสูตร ' + SH.stock.name +
      ' ครอบข้อมูลครบอยู่แล้ว ไม่ต้องขยาย' : '' };
  }

  /* ขยายแถว 6 แล้วต้องลากลงทั้งชีท ไม่งั้นแถวอื่นยังอ่านไม่ถึงเหมือนเดิม
     ช่วงที่ตรึงด้วย $ จะไม่ถูกขยับตอนคัดลอก จึงได้ช่วงใหม่เท่ากันทุกแถว */
  for (var c2 in STOCK_SUM_COLS) {
    c2 = Number(c2);
    if (c2 > s.getLastColumn()) continue;
    s.getRange(DATA_ROW, c2).copyTo(s.getRange(DATA_ROW + 1, c2, STOCK_LAST - DATA_ROW, 1));
  }
  SpreadsheetApp.flush();

  return { changed: changed,
    text: 'ขยายช่วงแถวในสูตรของ ' + SH.stock.name + ' ' + changed + ' คอลัมน์\n' +
      notes.join('\n') +
      '\n  (ลากลงครบทุกแถวถึงแถว ' + STOCK_LAST + ' แล้ว)' };
}

/**
 * ขยายเลขแถวท้ายของทุกช่วงที่ชี้ไปชีทอื่น ให้ครอบทั้งชีทนั้น
 *
 * แตะเฉพาะช่วงที่มีชื่อชีทนำหน้า — ช่วงที่ไม่มีชื่อชีทคืออ้างในชีทตัวเอง
 * ซึ่งเป็นคนละเรื่องและขยายมั่วไม่ได้ และไม่ยุ่งกับช่วงที่กว้างอยู่แล้ว
 */
function widenRanges_(ss, f) {
  var hits = [];
  var re = /((?:'(?:[^']|'')+'|[^\s!+\-*\/(),;:=<>&"]+)!)(\$?)([A-Z]{1,3})(\$?)(\d+):(\$?)([A-Z]{1,3})(\$?)(\d+)/g;
  var text = f.replace(re, function (all, pre, d1, c1, d2, r1, d3, c2, d4, r2) {
    var nm = pre.slice(0, -1);
    if (nm.charAt(0) === "'") nm = nm.slice(1, -1).replace(/''/g, "'");
    var sh = findSheet_(ss, nm);
    if (!sh) return all;
    var want = sh.getMaxRows();
    if (Number(r2) >= want) return all;
    hits.push(nm + '!' + c1 + r1 + ':' + c2 + r2 + ' → ' + c2 + want);
    return pre + d1 + c1 + d2 + r1 + ':' + d3 + c2 + d4 + want;
  });
  return { text: text, hits: hits };
}

function repairStockSheet() {
  requireStaff_();
  var s = sheet_('stock');
  var cols = s.getLastColumn();
  var tmpl = s.getRange(DATA_ROW, 1, 1, cols);
  var f = tmpl.getFormulas()[0];

  if (f.join('').indexOf('#REF') > -1) {
    throw new Error('แถว 6 ของชีท ' + SH.stock.name + ' ขึ้น #REF! จึงไม่มีต้นแบบให้ซ่อม ' +
      '— ต้องแก้แถว 6 ด้วยมือก่อน');
  }

  /* ช่องไหนในแถว 6 ถูกพิมพ์ทับจนไม่เหลือสูตร ให้ประกอบคืนก่อน
     ไม่งั้นการคัดลอกแถว 6 ลงมาจะแพร่เลขนิ่งไปทั้งชีท */
  var fixed = [];
  for (var col in STOCK_ROW6) {
    col = Number(col);
    if (col > cols) continue;
    if (String(f[col - 1] || '').charAt(0) === '=') continue;
    /* สูตรต้นแบบเขียนชื่อ 'ฐานสินค้า' ไว้ตรง ๆ ถ้าแท็บจริงสะกดต่างไปนิดเดียว
       สูตรที่เขียนลงไปจะกลายเป็น #REF! ทันที — ต้องสลับเป็นชื่อจริงก่อนเสมอ */
    s.getRange(DATA_ROW, col).setFormula(
      STOCK_ROW6[col].replace(/'ฐานสินค้า'/g, sheetRef_(ss_(), SH.prod.name)));
    fixed.push(s.getRange(DATA_ROW, col).getA1Notation());
  }
  if (fixed.length) {
    SpreadsheetApp.flush();
    f = tmpl.getFormulas()[0];
  }

  /* ช่วงแถวที่สั้นเกินข้อมูลคืออาการที่เงียบที่สุดในบรรดาทั้งหมด — ไม่ error
     ไม่มีเลขนิ่ง ไม่มี #REF! ตัวเลขยังดูปกติทุกช่อง แค่ "ไม่นับ" ของที่กรอกใหม่
     จึงต้องตรวจตรงนี้ด้วย ไม่งั้นซ่อมอย่างอื่นเสร็จแล้วยอดก็ยังผิดเหมือนเดิม */
  var wide = fixStockSumRange_(false);
  /* ประเภทที่มีในดรอปดาวน์แต่ไม่มีสูตรไหนนับ เป็นอาการเงียบพอ ๆ กัน —
     ระบบเองเป็นคนเติมคำว่า "เติมน้ำยา" เข้าดรอปดาวน์ แต่ไม่มีใครเพิ่มเข้าสูตร
     น้ำยาที่กรอกใส่ขวดขายทุกวันจึงไม่เคยถูกนับเข้าสต๊อกเลยสักขวด */
  var kinds = fixStockRecvTypes_();

  var before = countRef_(s, cols);
  var skew = countSkew_(s);
  var flat = countFlat_(s, cols);
  if (!before && !skew && !flat && !fixed.length && !wide.changed && !kinds.changed) {
    var okMsg = 'ชีท ' + SH.stock.name + ': สูตรปกติดีอยู่แล้ว ไม่ต้องซ่อม';
    Logger.log(okMsg);
    return okMsg;
  }

  tmpl.copyTo(s.getRange(DATA_ROW + 1, 1, STOCK_LAST - DATA_ROW, cols));
  SpreadsheetApp.flush();
  var after = countRef_(s, cols), skewAfter = countSkew_(s);

  var flatAfter = countFlat_(s, cols);
  var extra = repairSummaryRange_();
  var msg = 'ชีท ' + SH.stock.name + ':\n' +
    (fixed.length ? '  ประกอบสูตรแถว 6 ที่ถูกพิมพ์ทับคืน ' + fixed.length + ' ช่อง (' +
      fixed.join(', ') + ')\n' : '') +
    '  ซ่อม #REF! ' + before + ' ช่อง (เหลือ ' + after + ')\n' +
    '  ซ่อมแถวที่ชี้ผิดตัวสินค้า ' + skew + ' แถว (เหลือ ' + skewAfter + ')\n' +
    '  ซ่อมช่องที่กลายเป็นเลขนิ่ง ' + flat + ' ช่อง (เหลือ ' + flatAfter + ')' +
    (wide.changed ? '\n' + wide.text : '') +
    (kinds.changed ? '\n' + kinds.text : '') + extra;
  Logger.log(msg);
  return msg;
}

/**
 * นับแถวที่ชี้ไปผิดตัวสินค้า
 *
 * ชีทนี้ผูกกับ ฐานสินค้า แบบแถวต่อแถว — แถว 20 ต้องชี้ไป ฐานสินค้า แถว 20
 * พอมีคน "แทรกแถว" หรือ "ลบทั้งแถว" ในฐานสินค้า Google จะขยับเลขแถวในสูตรตาม
 * ทั้งชีทจึงเลื่อนไม่ตรงกัน แถว 47 ไปชี้แถว 50 เป็นต้น
 *
 * อันตรายกว่า #REF! เพราะ #REF! เห็นชัดว่าพัง แต่แบบนี้ยังโชว์ตัวเลขสวย ๆ
 * เพียงแต่เป็นยอดสต๊อกของสินค้าคนละตัว ไม่มีอะไรฟ้องเลยสักอย่าง
 */
function countSkew_(s) {
  var f = s.getRange(DATA_ROW, 2, STOCK_LAST - DATA_ROW + 1, 1).getFormulas();
  var n = 0;
  for (var i = 0; i < f.length; i++) {
    var m = /ฐานสินค้า'!\$B(\d+)/.exec(f[i][0] || '');
    if (m && Number(m[1]) !== DATA_ROW + i) n++;
  }
  return n;
}

/**
 * นับช่องที่ควรเป็นสูตรแต่กลายเป็นเลขนิ่ง
 *
 * อาการนี้เงียบที่สุดในบรรดาทั้งหมด — ตัวเลขยังโชว์ปกติ ไม่มี error ไม่มีอะไรผิดสังเกต
 * แต่ช่อง "คงเหลือ" ที่เป็นเลขนิ่งแปลว่าขายของแล้วสต๊อกไม่ลด ซึ่งคือหัวใจของทั้งระบบ
 */
function countFlat_(s, cols) {
  var last = STOCK_LAST;
  var f = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, cols).getFormulas();
  var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, cols).getValues();
  var n = 0;
  for (var i = 0; i < f.length; i++) {
    if (v[i][1] === '' || v[i][1] === null) continue;   /* แถวว่างไม่ต้องนับ */
    for (var col in STOCK_ROW6) {
      col = Number(col);
      if (col > cols) continue;
      if (String(f[i][col - 1] || '').charAt(0) !== '=') n++;
    }
  }
  return n;
}

function countRef_(s, cols) {
  var f = s.getRange(DATA_ROW, 1, STOCK_LAST - DATA_ROW + 1, cols).getFormulas();
  var n = 0;
  for (var i = 0; i < f.length; i++) {
    for (var j = 0; j < f[i].length; j++) if (f[i][j].indexOf('#REF') > -1) n++;
  }
  return n;
}

/**
 * ช่อง "จำนวน SKU ทั้งหมด" ในชีท สรุปยอดขาย หดช่วงตามแถวที่ถูกลบ
 * (จาก $B$150 เหลือ $B$117) ถ้าเพิ่มสินค้าเกินแถวนั้นจะนับไม่ครบเงียบ ๆ
 */
function repairSummaryRange_() {
  var s = findSheet_(ss_(), 'สรุปยอดขาย');
  if (!s) return '';
  var cell = s.getRange('B23');
  var f = String(cell.getFormula() || '');
  var m = f.match(/COUNTA\('ฐานสินค้า'!\$B\$6:\$B\$(\d+)\)/);
  if (!m || Number(m[1]) >= STOCK_LAST) return '';
  cell.setFormula('=COUNTA(' + sheetRef_(ss_(), SH.prod.name) +
    '!$B$6:$B$' + STOCK_LAST + ')');
  return ' · ขยายช่วงนับ SKU ในชีท สรุปยอดขาย จากแถว ' + m[1] + ' เป็น ' + STOCK_LAST;
}

/* -------------------------------------------------------------- ตั้งค่าแอป */

/**
 * ค่าที่ใบปะหน้าพัสดุต้องใช้ ชีทเดิมไม่มี — สร้างเป็นชีทของแอปเอง
 * ค่าที่มีอยู่แล้วจะไม่ถูกเขียนทับ สั่ง setup ซ้ำได้
 */
/**
 * ชีท หลักฐานการชำระเงิน — 1 สลิป = 1 แถว
 *
 * เก็บลิงก์ไฟล์ในไดรฟ์ ไม่ใช่ตัวรูป รูปสลิปใบละหลายร้อยกิโล
 * ฝังลงชีทไม่กี่ร้อยใบก็เปิดชีทไม่ไหวแล้ว
 */
function setupSlipSheet_(ss) {
  var name = SH.slip.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < SLIP_LAST) s.insertRowsAfter(s.getMaxRows(), SLIP_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 14) s.insertColumnsAfter(s.getMaxColumns(), 14 - s.getMaxColumns());

  s.getRange('A2').setValue('หลักฐานการชำระเงิน — ระบบเขียนให้เอง')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'แนบสลิปจากหน้าออเดอร์ในแอป แล้วแถวจะมาโผล่ที่นี่  |  ' +
    'ไฟล์จริงอยู่ในโฟลเดอร์ไดรฟ์ ช่องลิงก์คือทางไปเปิดดู  |  ' +
    'สลิปที่แนบผิดใบ ให้เปลี่ยนสถานะเป็น "ไม่ใช่ของใบนี้" ไม่ใช่ลบแถวทิ้ง'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขที่ออเดอร์', 'แนบเมื่อ', 'วันที่โอน\n(ตามสลิป)',
    'ยอดตามสลิป', 'โอนเข้าบัญชี', 'ชื่อไฟล์', 'ลิงก์ไฟล์', 'ผู้แนบ',
    'สถานะ', 'ผู้ตรวจสอบ', 'ตรวจสอบเมื่อ', 'หมายเหตุ',
    'รหัสไฟล์ในไดรฟ์\n(ระบบใช้อ้างอิง ห้ามแก้)'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = SLIP_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 14; c++) inCols.push(c);
  paintCols_(s, n, inCols, [1]);

  s.getRange(DATA_ROW, SH.slip.IN.at, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.slip.IN.paidAt, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.slip.IN.amount, n, 1).setNumberFormat('#,##0.00');
  s.getRange(DATA_ROW, SH.slip.IN.checkAt, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.slip.IN.fileId, n, 1).setNumberFormat('@')
    .setFontColor('#9aa0a6');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.slip.IN.no, 130);
  s.setColumnWidth(SH.slip.IN.at, 140);
  s.setColumnWidth(SH.slip.IN.paidAt, 140);
  s.setColumnWidth(SH.slip.IN.bank, 150);
  s.setColumnWidth(SH.slip.IN.fileName, 220);
  s.setColumnWidth(SH.slip.IN.fileUrl, 260);
  s.setColumnWidth(SH.slip.IN.status, 130);
  s.setColumnWidth(SH.slip.IN.fileId, 70);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' สลิป)';
}

/**
 * ชีท ลิงก์ชำระเงิน — ทะเบียนกุญแจของลิงก์ที่ส่งให้ลูกค้า
 *
 * ช่อง "ปิดลิงก์" มีไว้ให้เจ้าของร้านพิมพ์ว่า ปิด ลงไปเองได้ทันที
 * เวลาส่งลิงก์ผิดคน — ต้องปิดได้จากในชีทโดยไม่ต้องรอใครมาแก้โค้ดให้
 */
function setupLinkSheet_(ss) {
  var name = SH.link.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < LINK_LAST) s.insertRowsAfter(s.getMaxRows(), LINK_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 10) s.insertColumnsAfter(s.getMaxColumns(), 10 - s.getMaxColumns());

  s.getRange('A2').setValue('ลิงก์ชำระเงินที่ส่งให้ลูกค้า — ระบบเขียนให้เอง')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'กุญแจในลิงก์คือสิ่งเดียวที่กั้นคนนอกออกจากออเดอร์ใบนั้น ห้ามแก้ด้วยมือ  |  ' +
    'ส่งผิดคน ให้พิมพ์ "ปิด" ที่ช่องปิดลิงก์ ลิงก์เดิมจะใช้ไม่ได้ทันที  |  ' +
    'ลบแถวทิ้ง = ลิงก์ที่ส่งไปแล้วกลายเป็นลิงก์เสีย โดยลูกค้าไม่รู้ว่าเกิดอะไรขึ้น'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขที่ออเดอร์', 'กุญแจ\n(ห้ามแก้)', 'สร้างเมื่อ', 'ผู้สร้าง',
    'ลูกค้าเปิดกี่ครั้ง', 'เปิดล่าสุด', 'ลูกค้าแจ้งชำระเมื่อ',
    'ปิดลิงก์\n(พิมพ์ ปิด)', 'หมายเหตุ'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = LINK_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 10; c++) inCols.push(c);
  paintCols_(s, n, inCols, [1]);

  s.getRange(DATA_ROW, SH.link.IN.key, n, 1).setNumberFormat('@').setFontColor('#9aa0a6');
  s.getRange(DATA_ROW, SH.link.IN.at, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.link.IN.lastOpen, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.link.IN.told, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.link.IN.no, 130);
  s.setColumnWidth(SH.link.IN.key, 90);
  s.setColumnWidth(SH.link.IN.at, 140);
  s.setColumnWidth(SH.link.IN.by, 180);
  s.setColumnWidth(SH.link.IN.lastOpen, 140);
  s.setColumnWidth(SH.link.IN.told, 150);
  s.setColumnWidth(SH.link.IN.note, 220);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' ลิงก์)';
}

function setupAppSheet_(ss) {
  var name = SH.app.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);
  if (s.getMaxColumns() < 5) s.insertColumnsAfter(s.getMaxColumns(), 5 - s.getMaxColumns());

  s.getRange('A2').setValue('ตั้งค่าแอปคีย์ออเดอร์').setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ค่าพวกนี้ใช้กับใบปะหน้าพัสดุและข้อความแจ้งลูกค้า  |  แก้ได้เลย ไม่ต้องแก้โค้ด'
  ).setFontColor(C_SUB_FG);

  s.getRange(HEAD_ROW, 1, 1, 5).setValues([['ค่า', 'ตั้งเป็น', '', 'ขนส่ง', 'ลิงก์ติดตามพัสดุ']])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold');

  // ค่าตั้งต้นยกมาจากที่ตั้งไว้ในแอปเดิม เพื่อให้พฤติกรรมไม่เปลี่ยนเงียบ ๆ ตอนย้ายระบบ
  var rows = [
    ['ชื่อผู้ส่ง', 'AST Chem-Tooling'],
    ['ที่อยู่ผู้ส่ง', ''],
    ['เบอร์โทรผู้ส่ง', '0961929993'],
    ['ค่าจัดส่งเริ่มต้น', 50],
    ['ส่งฟรีเมื่อยอดถึง', 1000],
    ['ค่าธรรมเนียมเก็บปลายทาง', 0],
    ['ลิงก์ LINE ของร้าน', 'https://line.me/R/ti/p/@citiofficial'],
    ['รายชื่อพนักงาน', 'แอดมิน'],
    ['หัวใบปะหน้า บรรทัด 1', 'บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด'],
    ['หัวใบปะหน้า บรรทัด 2', 'AST CHEM-TOOLING SHOP'],

    /* ---- ข้อมูลผู้ขายบนเอกสารขาย ----
       ที่อยู่จดทะเบียนของบริษัท (สะพานสูง) คนละที่กับที่อยู่ผู้ส่งพัสดุข้างบน (ลาดกระบัง)
       จึงแยกกันสองชุด ห้ามเอามาใช้ทับกัน ใบกำกับภาษีต้องใช้ที่อยู่จดทะเบียนเท่านั้น */
    ['ชื่อบริษัท (ใบกำกับภาษี)', 'บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด'],
    ['ชื่อบริษัท ภาษาอังกฤษ', 'CHEMICAL INNOVATION TECHNOLOGY AND INSTRUMENTS CO., LTD.'],
    ['ชื่อบริษัท แบบสั้น (ช่องเซ็น)', 'บริษัท เคมีคอล อินโนเวชั่นฯ'],
    ['ที่อยู่บริษัท (ใบกำกับภาษี)',
      '70/72 ซ.เคหะร่มเกล้า 78 ถ.ราษฎร์พัฒนา แขวงสะพานสูง เขตสะพานสูง กรุงเทพมหานคร 10240'],
    ['เลขประจำตัวผู้เสียภาษีบริษัท', '0105558055790'],
    ['สำนักงานใหญ่ / สาขา', 'สำนักงานใหญ่'],
    ['เบอร์โทรบริษัท', '02-130-7815'],
    ['แฟกซ์บริษัท', '02-130-7814'],
    ['มือถือบริษัท', '0948279999'],
    ['อีเมลบริษัท', 'siripong@chem-inno-tech.com'],
    ['เว็บไซต์บริษัท', 'www.cheminnotech.com'],
    ['ชื่อผู้เสนอ/พนักงานขาย บนเอกสาร', 'Citisales01'],
    ['อีเมลผู้เสนอ บนเอกสาร', 'Citisales01@chem-inno-tech.com'],
    ['เลขที่บัญชีธนาคาร',
      'เลขที่บัญชี 431-039-4355 ธนาคารไทยพาณิชย์  บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด'],
    ['ข้อความขอบคุณท้ายหัวเอกสาร',
      'บริษัทขอขอบคุณทุกท่าน ที่ให้ความไว้วางใจในการเลือกใช้บริการหรือผลิตภัณฑ์ของบริษัท'],
    ['ข้อความในช่องหมายเหตุ',
      'ผู้ซื้อได้รับสินค้าตามรายการข้างบนไว้ถูกต้องแล้ว ถ้าสินค้าไม่เรียบร้อยกรุณาแจ้งภายใน 5 วัน'],
    /* ใบจริง ONIV26-00212: 1,123.00 + 78.61 = 1,201.61 คือบวกภาษีเพิ่มจากราคา
       ใส่ "รวมแล้ว" เมื่อไรราคาที่คีย์จะถูกถอดภาษีออกแทน (แบบราคาปลีกหน้าเพจ) */
    ['ราคาสินค้ารวม VAT แล้วหรือยัง', 'ยังไม่รวม'],
    /* ชุดเลขเดิมเดินมาถึง ONIV26-00230 ระบบจะนับต่อจากใบสูงสุดที่มีในชีท เอกสาร */
    ['คำนำหน้าเลขใบเสร็จ/ใบกำกับภาษี', 'ONIV26-'],
    ['คำนำหน้าเลขใบแจ้งหนี้', 'IV26-'],
    ['คำนำหน้าเลขใบเสนอราคา', 'QO26-'],
    ['คำนำหน้าเลขใบรับเงินมัดจำ', 'DR26-'],
    /* ชุด ONIV26 ในไฟล์ Excel เดิมเดินมาถึง 00230 แล้ว ใบแรกที่ระบบออกจึงต้องเป็น 00231
       ไม่ใช่ 00001 ไม่งั้นเลขใบกำกับภาษีจะซ้ำกับใบที่ส่งลูกค้าไปแล้ว 230 ใบ */
    ['ยกยอดเลขใบเสร็จ/ใบกำกับภาษีมาจาก', 230],
    ['ยกยอดเลขใบแจ้งหนี้มาจาก', 0],
    ['ยกยอดเลขใบเสนอราคามาจาก', 0],
    ['ยกยอดเลขใบรับเงินมัดจำมาจาก', 0],
    ['ใบเสนอราคายืนราคากี่วัน', 7],
    /* ลายเซ็นฝั่งร้าน — เซ็นในแอปครั้งเดียว (ตั้งค่า → ลายเซ็น) แล้วประทับให้ทุกใบ
       เก็บเป็นพิกัดเส้นแบบ JSON ไม่ใช่รูป จะได้คมตอนพิมพ์และไม่ล้นช่อง
       ห้ามพิมพ์ทับด้วยมือ ให้เซ็นใหม่ในแอปแทน */
    ['ลายเซ็นผู้รับเงิน/พนักงานขาย', ''],
    ['ลายเซ็นผู้มีอำนาจลงนาม', ''],

    /* ============================================================
       ค่าที่เพิ่มทีหลัง ต้องต่อท้ายตรงนี้เท่านั้น ห้ามแทรกกลางรายการเด็ดขาด

       ตัวเขียนข้างล่างจับคู่ "ป้ายกับค่า" ด้วยลำดับแถว ไม่ใช่ด้วยชื่อป้าย
       และค่าที่เจ้าของร้านกรอกไว้แล้วจะไม่ถูกทับ (เขียนให้เฉพาะตอนช่องยังว่าง)
       แทรกแถวกลางรายการเมื่อไร ป้ายทั้งหมดที่อยู่ต่ำกว่าจะเลื่อนลงหนึ่งแถว
       แต่ค่าอยู่ที่เดิม — ทุกค่าตั้งแต่จุดนั้นลงไปจะไปจับคู่กับป้ายผิดตัวทันที
       เช่น 230 ที่เป็น "ยกยอดเลขใบกำกับภาษี" จะกลายเป็นคำนำหน้าเลขของอีกชุดหนึ่ง

       ต่อท้ายอย่างเดียวจึงปลอดภัยเสมอ และถ้าเคยเลื่อนไปแล้ว สั่ง setup อีกครั้ง
       ด้วยลำดับที่ถูกต้อง ป้ายจะกลับมาตรงกับค่าเดิมของมันเองทั้งหมด
       ============================================================ */
    /* บิลเงินสดต้องเป็นคนละชุดเลขกับ ONIV เด็ดขาด — ชุด ONIV คือชุดใบกำกับภาษี
       ที่ต้องเรียงต่อกันไม่ขาดและเป็นชุดที่สรรพากรตรวจ ถ้าบิลเงินสดไปกินเลขในชุดนั้น
       เล่มใบกำกับภาษีจะมีเลขที่ไม่ใช่ใบกำกับภาษีปนอยู่ อธิบายตอนถูกตรวจไม่ได้ */
    ['คำนำหน้าเลขบิลเงินสด', 'CS26-'],
    ['ยกยอดเลขบิลเงินสดมาจาก', 0],

    /* ---- บัญชีรับเงิน (ยังต่อท้ายอย่างเดียวตามกฎด้านบน) ----
       ร้านใช้สองบัญชีจริง ๆ แยกตามว่าใบนั้นออก VAT หรือไม่ออก
       ระบบจะเลือกให้เองตามช่อง VAT ของออเดอร์ พนักงานไม่ต้องจำ

       ชุด "ไม่มี VAT" เว้นว่างไว้ตั้งใจ เพราะเป็นบัญชีชื่อบุคคล
       ไม่ควรอยู่ในไฟล์โค้ดที่คนนอกเปิดดูได้ ให้กรอกลงชีทเอาเอง

       ช่องพร้อมเพย์กรอกได้สามแบบ เบอร์มือถือ 10 หลัก · เลขผู้เสียภาษี/บัตรประชาชน
       13 หลัก · เลข e-Wallet 15 หลัก  ว่างไว้ก็ได้ แค่จะไม่มี QR ให้ มีแต่เลขบัญชี */
    ['ธนาคารที่รับเงิน บิลมี VAT', 'ไทยพาณิชย์ (SCB)'],
    ['ชื่อบัญชี บิลมี VAT', 'บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด'],
    ['เลขบัญชี บิลมี VAT', '431-039435-5'],
    ['พร้อมเพย์ บิลมี VAT', ''],
    ['ธนาคารที่รับเงิน บิลไม่มี VAT', ''],
    ['ชื่อบัญชี บิลไม่มี VAT', ''],
    ['เลขบัญชี บิลไม่มี VAT', ''],
    ['พร้อมเพย์ บิลไม่มี VAT', ''],

    /* ลิงก์ให้ลูกค้ากดเปิดแอพธนาคาร — ไม่ได้กรอกเลขบัญชีหรือยอดให้
       ลูกค้ายังต้องพิมพ์เองทั้งหมด ลิงก์นี้แค่ช่วยให้ไม่ต้องไปหาแอพเอง

       ไม่ฝังลิงก์ของธนาคารไว้ในโค้ดตั้งใจ — ลิงก์พวกนี้ธนาคารเปลี่ยนเองได้ตลอด
       ฝังไว้แล้ววันที่มันตาย จะไม่มีอะไรฟ้อง ลูกค้ากดแล้วเจอหน้าว่างไปเรื่อย ๆ
       ให้เจ้าของร้านวางลิงก์ที่กดแล้วใช้ได้จริงในวันที่กรอกลงมาเอง
       เว้นว่าง = ไม่มีบรรทัดลิงก์ในข้อความ */
    ['ลิงก์แอพธนาคาร บิลมี VAT', ''],
    ['ลิงก์แอพธนาคาร บิลไม่มี VAT', ''],

    /* ---- ใบวางบิล (ยังต่อท้ายอย่างเดียวตามกฎด้านบน) ----
       เลขใบวางบิลเป็นคนละรูปแบบกับเอกสารอื่น — BL + ปีเดือนวัน + ลำดับในวันนั้น
       เช่น BL260822-001 ตามใบจริงที่ร้านใช้ ช่องนี้กรอกแค่ตัว "BL" ที่เหลือระบบต่อให้

       ใบวางบิลไม่ใช่เอกสารภาษี เลขจึงไม่ต้องเรียงต่อกันไม่ขาดเหมือนชุด ONIV
       เครดิตกี่วันใช้ตอนคิดช่อง "วันครบกำหนด" ของแต่ละบรรทัด ถ้าอ่านจากข้อความ
       เงื่อนไขชำระเงินของใบนั้นไม่ออก */
    ['คำนำหน้าเลขใบวางบิล', 'BL'],
    ['เครดิตกี่วัน (ใบวางบิล)', 30],

    /* ลิงก์ที่ส่งให้ลูกค้าเปิดดูยอดและแนบสลิป

       ต้องเป็นลิงก์ของ deploy อีกตัวที่ตั้งเป็น "ทุกคน รวมถึงผู้ใช้ที่ไม่ระบุตัวตน"
       ไม่ใช่ลิงก์ที่พนักงานใช้ ลูกค้าไม่มีบัญชีบริษัทจึงเปิดตัวนั้นไม่ได้

       เว้นว่าง = ยังไม่เปิดใช้ ระบบจะบอกตรง ๆ ว่ายังส่งลิงก์ให้ลูกค้าไม่ได้
       ห้ามเดา URL เอง เพราะเดาผิดคือส่งลิงก์เสียให้ลูกค้าโดยไม่มีใครรู้ */
    ['ลิงก์เว็บแอปสำหรับลูกค้า', '']
  ];
  for (var i = 0; i < rows.length; i++) {
    var r = DATA_ROW + i;
    s.getRange(r, 1).setValue(rows[i][0]);
    // เบอร์โทรต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
    /* ช่องที่ขึ้นต้นด้วยศูนย์ต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
       เลขผู้เสียภาษี 0105558055790 จะกลายเป็น 105558055790 แล้วใบกำกับภาษีใช้ไม่ได้ */
    if (/เบอร์โทร|มือถือ|แฟกซ์|ผู้เสียภาษี|ลายเซ็น|พร้อมเพย์|เลขบัญชี/.test(rows[i][0])) {
      s.getRange(r, 2).setNumberFormat('@');
    }
    // ค่าที่เจ้าของร้านกรอกไว้แล้ว ห้ามทับ — เติมให้เฉพาะตอนที่ยังว่าง
    if (s.getRange(r, 2).getValue() === '') s.getRange(r, 2).setValue(rows[i][1]);
  }

  var carriers = cfgLists_().carrier;
  var known = {
    'Flash Express': 'https://www.flashexpress.com/fle/tracking?se={track}',
    'Kerry Express': 'https://th.kerryexpress.com/th/track/?track={track}',
    'ไปรษณีย์ไทย': 'https://track.thailandpost.co.th/?trackNumber={track}'
  };
  for (var j = 0; j < carriers.length; j++) {
    var rr = DATA_ROW + j;
    s.getRange(rr, 4).setValue(carriers[j]);
    if (s.getRange(rr, 5).getValue() === '') {
      s.getRange(rr, 5).setValue(known[carriers[j]] || '');
    }
  }

  s.getRange(DATA_ROW, 2, rows.length, 1).setFontColor(C_IN_FG);
  s.getRange(DATA_ROW, 5, Math.max(carriers.length, 1), 1).setFontColor(C_IN_FG);
  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(1, 200); s.setColumnWidth(2, 340);
  s.setColumnWidth(4, 160); s.setColumnWidth(5, 380);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name +
    (fresh ? ' — อย่าลืมกรอกที่อยู่และเบอร์โทรผู้ส่ง ใบปะหน้าพัสดุใช้ค่านี้' : '');
}

/* --------------------------------------------- ขนส่งที่ Shopee ใช้ส่งของให้ */

/** ขนส่งที่ต้องมีเพิ่ม เพราะออเดอร์จากแพลตฟอร์มใช้ชื่อพวกนี้ ไม่ใช่ชื่อที่ร้านเลือกเอง
 *  ใส่ตัวย่อ (SPX) ไว้ในชื่อด้วยตั้งใจ เพราะไฟล์ที่ Shopee ส่งออกมาเขียนว่า
 *  "Standard Delivery - ส่งธรรมดาในประเทศ-SPX Express" ซึ่งจับคู่ด้วยคำว่า SPX ได้ */
var EXTRA_CARRIERS = ['Shopee Xpress (SPX)', 'J&T Express'];

/**
 * เติมขนส่งที่ขาด และขยายช่วง dropdown ให้ครอบของใหม่
 *
 * ของเดิม dropdown ผูกกับช่วงแคบ ๆ แค่ห้าแถว เติมชื่อที่หกลงไปเฉย ๆ ชีทจะขึ้น
 * สามเหลี่ยมเตือนทุกแถวที่ใช้ค่าใหม่ ทั้งที่ค่านั้นถูกต้อง — จึงต้องผูกช่วงใหม่ด้วย
 * ผูกกว้างไว้เลย 20 แถว เจ้าของร้านเติมเองรอบหน้าจะได้ไม่ต้องมาสั่ง setup อีก
 */
function setupCarrierList_(ss) {
  var cfg = sheet_('cfg');
  var head = findSheet_(ss, SH.head.name);
  if (!head) throw new Error('ไม่พบชีท ' + SH.head.name);

  var TOP = DATA_ROW + 1;          // แถว 7 = ค่าแรกของชุด dropdown
  var ROWS = 20;                   // ช่วงที่ผูกไว้ กว้างกว่าที่ใช้จริงเผื่ออนาคต
  if (cfg.getMaxRows() < TOP + ROWS - 1) {
    cfg.insertRowsAfter(cfg.getMaxRows(), TOP + ROWS - 1 - cfg.getMaxRows());
  }

  var col = 5;                     // E = ช่องทางจัดส่ง
  var have = {}, firstFree = 0;
  var v = cfg.getRange(TOP, col, ROWS, 1).getValues();
  for (var i = 0; i < ROWS; i++) {
    var x = String(v[i][0] || '').trim();
    if (x) have[x.toLowerCase()] = true;
    else if (!firstFree) firstFree = TOP + i;
  }

  var added = [];
  for (var k = 0; k < EXTRA_CARRIERS.length; k++) {
    var want = EXTRA_CARRIERS[k];
    if (have[want.toLowerCase()]) continue;
    if (!firstFree) break;         // เต็มช่วงแล้ว ไม่ไปเขียนทับของใคร
    cfg.getRange(firstFree, col).setValue(want).setFontColor(C_IN_FG);
    have[want.toLowerCase()] = true;
    added.push(want);
    firstFree = (firstFree - TOP + 1 < ROWS) ? firstFree + 1 : 0;
  }

  /* ผูก dropdown ของช่องขนส่งในหัวบิลใหม่ ให้ครอบช่วงที่กว้างขึ้น
     allowInvalid ไว้ ค่าที่มีอยู่เดิมจึงไม่ถูกตีว่าผิดแม้แต่แถวเดียว */
  var last = formulaLimit_('head');
  if (last >= DATA_ROW) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(cfg.getRange(TOP, col, ROWS, 1), true)
      .setAllowInvalid(true).build();
    head.getRange(DATA_ROW, SH.head.IN.carrier, last - DATA_ROW + 1, 1).setDataValidation(rule);
  }

  return added.length
    ? 'เพิ่มขนส่ง ' + added.join(' · ') + ' ในชีท ' + SH.cfg.name + ' และขยายช่วงตัวเลือกให้แล้ว'
    : 'ขนส่งครบอยู่แล้ว (ขยายช่วงตัวเลือกให้เผื่อเติมเองภายหลัง)';
}

/* ------------------------------------------ สถานะ "ตีกลับ" ที่ ออเดอร์_หัวบิล */

/**
 * เพิ่มสถานะ "ตีกลับ" เข้าชุด dropdown ของสถานะออเดอร์ (ชีท ตั้งค่า คอลัมน์ G)
 *
 * ยกเลิก = ยังไม่ได้ส่ง ลูกค้าเปลี่ยนใจก่อนแพ็ค
 * ตีกลับ = ส่งไปแล้วแต่ของเดินทางกลับมา (ที่อยู่ผิด · ลูกค้าไม่รับ · เก็บเงินปลายทางไม่ได้)
 *
 * ผลต่อสต๊อกและยอดขายเหมือนกันเป๊ะ แต่ในสายตาเจ้าของร้านคนละเรื่อง —
 * ตีกลับคือเสียค่าส่งไปแล้วสองเที่ยวและของอาจบุบ ถ้านับรวมกับยกเลิกจะไม่มีวันรู้ว่า
 * เดือนนี้เสียค่าส่งฟรีไปกี่ใบ เพราะอะไร
 */
/* "รอชำระเครดิต 30วัน" แยกจาก "รอชำระ" เพราะสองอย่างนี้ทวงคนละเวลา
   เงินสด   = ครบกำหนดวันที่ขายเลย ค้างข้ามวันคือเริ่มสาย
   เครดิต 30 = ครบกำหนดอีก 30 วัน ยังไม่ถึงกำหนดก็ยังไม่ใช่ลูกหนี้ที่ต้องโทรตาม
   ถ้าใช้คำว่า "รอชำระ" อย่างเดียว ใบเครดิตจะขึ้นแดงตั้งแต่วันแรกทั้งที่ยังไม่ถึงกำหนด
   แล้วคนจะเลิกเชื่อสีแดงทั้งหน้า */
/* "เก็บเงินปลายทาง" เป็นสถานะ ไม่ใช่ค่าบริการ — เจ้าของร้านยืนยันว่าเลือกปลายทาง
   ก็คิดค่าส่ง 50 บาทเท่าเดิม ไม่บวกเพิ่ม ระบบจึงไม่แตะยอดเงินของใบเลย
   ที่ต้องแยกสถานะเพราะเงินของใบปลายทางเดินคนละทางกับใบอื่น: ลูกค้าจ่ายให้
   พนักงานส่งของแล้วขนส่งโอนเข้าบัญชีร้านทีหลัง ถ้าไม่มีสถานะนี้ ใบปลายทางจะกอง
   รวมอยู่ในกลุ่ม "ค้างชำระ" แล้วขึ้นแดงว่าเกินกำหนดตั้งแต่วันแรก ทั้งที่ของยัง
   เดินทางอยู่ — พอมีใบแดงปลอมทุกวัน ใบที่ค้างจริงก็จะถูกมองข้ามไปด้วย */
var EXTRA_STATUS = ['ตีกลับ', 'รอชำระเครดิต 30วัน', 'เก็บเงินปลายทาง'];

function setupStatusList_(ss) {
  var cfg = sheet_('cfg');
  var head = findSheet_(ss, SH.head.name);
  if (!head) throw new Error('ไม่พบชีท ' + SH.head.name);

  var TOP = DATA_ROW + 1;
  var ROWS = 20;
  if (cfg.getMaxRows() < TOP + ROWS - 1) {
    cfg.insertRowsAfter(cfg.getMaxRows(), TOP + ROWS - 1 - cfg.getMaxRows());
  }

  var col = 7;                     // G = สถานะออเดอร์
  var have = {}, firstFree = 0;
  var v = cfg.getRange(TOP, col, ROWS, 1).getValues();
  for (var i = 0; i < ROWS; i++) {
    var x = String(v[i][0] || '').trim();
    if (x) have[x] = true;
    else if (!firstFree) firstFree = TOP + i;
  }

  var added = [];
  for (var k = 0; k < EXTRA_STATUS.length; k++) {
    var want = EXTRA_STATUS[k];
    if (have[want]) continue;
    if (!firstFree) break;         // เต็มช่วงแล้ว ไม่ไปเขียนทับของใคร
    cfg.getRange(firstFree, col).setValue(want).setFontColor(C_IN_FG);
    have[want] = true;
    added.push(want);
    firstFree = (firstFree - TOP + 1 < ROWS) ? firstFree + 1 : 0;
  }

  var last = formulaLimit_('head');
  if (last >= DATA_ROW) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(cfg.getRange(TOP, col, ROWS, 1), true)
      .setAllowInvalid(true).build();
    head.getRange(DATA_ROW, SH.head.IN.status, last - DATA_ROW + 1, 1).setDataValidation(rule);
  }

  return added.length
    ? 'เพิ่มสถานะ ' + added.join(' · ') + ' ในชีท ' + SH.cfg.name + ' และขยายช่วงตัวเลือกให้แล้ว'
    : 'สถานะครบอยู่แล้ว (ขยายช่วงตัวเลือกให้เผื่อเติมเองภายหลัง)';
}

/* ------------------------------------------- ประเภทรับเข้า ที่ชีท ตั้งค่า (H) */

/**
 * ตัวเลือกประเภทของแถว รับเข้า ที่ระบบต้องใช้เอง
 *
 * "เติมน้ำยา" คือการกรอกน้ำยาจากถัง 200 ลิตรใส่ขวดขาย ซึ่งที่ร้านทำทุกวัน
 * ถ้าคำนี้ไม่มีในชีท ตั้งค่า แถวที่ระบบเขียนจะขึ้นสามเหลี่ยมเตือนทุกแถว
 * เพราะช่องประเภทมี data validation ผูกกับรายการนี้อยู่
 */
var EXTRA_RECV_TYPE = ['เติมน้ำยา'];

function setupRecvTypeList_(ss) {
  var cfg = sheet_('cfg');
  var recv = findSheet_(ss, SH.recv.name);
  if (!recv) throw new Error('ไม่พบชีท ' + SH.recv.name);

  var TOP = DATA_ROW + 1;
  var ROWS = 20;
  if (cfg.getMaxRows() < TOP + ROWS - 1) {
    cfg.insertRowsAfter(cfg.getMaxRows(), TOP + ROWS - 1 - cfg.getMaxRows());
  }

  var col = 8;                     // H = ประเภทรับเข้า
  var have = {}, firstFree = 0;
  var v = cfg.getRange(TOP, col, ROWS, 1).getValues();
  for (var i = 0; i < ROWS; i++) {
    var x = String(v[i][0] || '').trim();
    if (x) have[x] = true;
    else if (!firstFree) firstFree = TOP + i;
  }

  var added = [];
  for (var k = 0; k < EXTRA_RECV_TYPE.length; k++) {
    var want = EXTRA_RECV_TYPE[k];
    if (have[want]) continue;
    if (!firstFree) break;         // เต็มช่วงแล้ว ไม่ไปเขียนทับของใคร
    cfg.getRange(firstFree, col).setValue(want).setFontColor(C_IN_FG);
    have[want] = true;
    added.push(want);
    firstFree = (firstFree - TOP + 1 < ROWS) ? firstFree + 1 : 0;
  }

  var last = formulaLimit_('recv');
  if (last >= DATA_ROW) {
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(cfg.getRange(TOP, col, ROWS, 1), true)
      .setAllowInvalid(true).build();
    recv.getRange(DATA_ROW, SH.recv.IN.type, last - DATA_ROW + 1, 1).setDataValidation(rule);
  }

  return added.length
    ? 'เพิ่มประเภทรับเข้า ' + added.join(' · ') + ' ในชีท ' + SH.cfg.name
    : 'ประเภทรับเข้าครบอยู่แล้ว';
}

/* ----------------------------------------------- สถานะบัญชี ที่ ออเดอร์_หัวบิล */

/** ตัวเลือกสถานะบัญชี — เจ้าของร้านแก้/เพิ่มเองในชีท ตั้งค่า คอลัมน์ I ได้ */
var ACCT_LIST = ['ยังไม่ส่งบัญชี', 'รอเอกสาร', 'พร้อมส่งบัญชี', 'ส่งบัญชีแล้ว', 'บัญชีตีกลับ'];
var ACCT_FIRST = ACCT_LIST[0];

/**
 * สามคอลัมน์ท้าย ออเดอร์_หัวบิล สำหรับงานส่งบัญชี
 *
 * ทำไมต้องแยกจากช่องสถานะออเดอร์ (Q): ของส่งถึงมือลูกค้าแล้วแต่ยังไม่ได้ส่งบัญชี
 * เป็นเรื่องที่เกิดทุกวัน ถ้าใช้ช่องเดียวกันจะเห็นได้ทีละเรื่อง แล้วใบที่ตกหล่น
 * จะรู้อีกทีตอนสิ้นเดือน — ซึ่งสายไปสำหรับการยื่นภาษี
 *
 * ไม่ยุ่งกับคอลัมน์เดิมสักช่อง เขียนเฉพาะ V W X ที่ยังว่างอยู่
 * และไม่เขียนทับหัวคอลัมน์ที่มีของอื่นอยู่ก่อน — เจอแล้วหยุด ไม่ทับ
 */
/** เลขคอลัมน์ → ตัวอักษรแบบที่คนอ่านชีทเห็น (1 = A · 26 = Z · 27 = AA) */
function colLetter_(n) {
  var out = '';
  n = Number(n) || 0;
  while (n > 0) {
    var r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = (n - 1 - r) / 26;
  }
  return out || '?';
}

function setupAccounting_(ss) {
  var s = findSheet_(ss, SH.head.name);
  if (!s) throw new Error('ไม่พบชีท ' + SH.head.name);

  var C = SH.head.IN;
  var cols = [
    { col: C.acct, head: 'สถานะบัญชี', width: 130 },
    { col: C.acctAt, head: 'วันที่ส่งบัญชี', width: 150 },
    { col: C.acctWhat, head: 'ส่งบัญชีอะไรไปบ้าง', width: 320 },
    /* เงินที่แพลตฟอร์มหักไปก่อนโอนเข้าร้าน — เป็นรายจ่ายของร้าน ไม่ใช่ส่วนลดลูกค้า
       จึงห้ามเอาไปลดยอดขายหรือยอดในใบกำกับภาษี ต้องอยู่คนละช่องกันคนละเรื่อง */
    { col: C.fee, head: 'ค่าธรรมเนียม\nแพลตฟอร์ม', width: 120 },
    { col: C.shipCost, head: 'ค่าส่งที่ร้าน\nออกเอง', width: 110 },
    /* คนละช่องกับ "วันที่" (B) ซึ่งเป็นวันของออเดอร์ที่คนคีย์เลือกเอง ย้อนหลังได้
       ช่องนี้ระบบเขียนเองตอนกดบันทึก ใช้ตอบว่าใบนี้เข้ามาตอนกี่โมง */
    { col: C.keyedAt, head: 'เวลาที่คีย์\nเข้าระบบ', width: 140, fmt: 'dd/mm/yyyy HH:mm' }
  ];

  var need = SH.head.width;
  if (s.getMaxColumns() < need) s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns());

  for (var i = 0; i < cols.length; i++) {
    var cur = String(s.getRange(HEAD_ROW, cols[i].col).getValue() || '').trim();
    if (cur && cur !== cols[i].head) {
      throw new Error('คอลัมน์ที่ ' + cols[i].col + ' ของชีท ' + SH.head.name +
        ' มีหัวข้อ "' + cur + '" อยู่แล้ว — หยุดไว้ก่อน ไม่เขียนทับของเดิม');
    }
    s.getRange(HEAD_ROW, cols[i].col).setValue(cols[i].head)
      .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
      .setVerticalAlignment('middle').setWrap(true);
    s.setColumnWidth(cols[i].col, cols[i].width);
    if (cols[i].fmt) {
      var n = Math.max(1, s.getMaxRows() - DATA_ROW + 1);
      s.getRange(DATA_ROW, cols[i].col, n, 1).setNumberFormat(cols[i].fmt);
    }
  }

  /* รายการตัวเลือกไปอยู่ในชีท ตั้งค่า ที่เดียวกับ dropdown ชุดอื่น
     เพื่อให้เจ้าของร้านเพิ่มสถานะเองได้โดยไม่ต้องแก้โค้ด */
  var cfg = sheet_('cfg');
  if (cfg.getMaxColumns() < 9) cfg.insertColumnsAfter(cfg.getMaxColumns(), 9 - cfg.getMaxColumns());
  /* หัวตารางของชุด dropdown อยู่แถว 6 ค่าเริ่มแถว 7 — คนละที่กับหัวชีทอื่น
     เขียนผิดแถวคือ cfgLists_ อ่านไม่เจอ แล้วสถานะบัญชีจะไม่มีให้เลือกสักตัว */
  var LIST_HEAD = DATA_ROW, LIST_TOP = DATA_ROW + 1;
  if (String(cfg.getRange(LIST_HEAD, 9).getValue() || '').trim() === '') {
    cfg.getRange(LIST_HEAD, 9).setValue('สถานะบัญชี')
      .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold');
  }
  var wrote = 0;
  for (var k = 0; k < ACCT_LIST.length; k++) {
    var cell = cfg.getRange(LIST_TOP + k, 9);
    if (String(cell.getValue() || '').trim() === '') { cell.setValue(ACCT_LIST[k]); wrote++; }
  }
  cfg.setColumnWidth(9, 140);

  /* ผูก dropdown กับช่วงในชีท ตั้งค่า ไม่ใช่รายการตายตัวในโค้ด
     เพิ่มสถานะในชีทแล้วช่องในหัวบิลรับค่าใหม่ได้ทันทีโดยไม่ต้อง deploy */
  var last = formulaLimit_('head');
  if (last >= DATA_ROW) {
    var n = last - DATA_ROW + 1;
    var rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(cfg.getRange(LIST_TOP, 9, ACCT_LIST.length, 1), true)
      .setAllowInvalid(true).build();
    s.getRange(DATA_ROW, C.acct, n, 1).setDataValidation(rule).setFontColor(C_IN_FG);
    s.getRange(DATA_ROW, C.acctAt, n, 1).setFontColor(C_IN_FG);
    s.getRange(DATA_ROW, C.acctWhat, n, 1).setFontColor(C_IN_FG);
    s.getRange(DATA_ROW, C.fee, n, 1).setFontColor(C_IN_FG).setNumberFormat('#,##0.00');
    s.getRange(DATA_ROW, C.shipCost, n, 1).setFontColor(C_IN_FG).setNumberFormat('#,##0.00');
  }

  /* ข้อความสรุปต้องมาจากของที่ทำจริง ไม่ใช่พิมพ์ชื่อคอลัมน์ทิ้งไว้ตายตัว
     ของเดิมเขียน "V W X" ไว้เฉย ๆ พอเพิ่มคอลัมน์ใหม่เข้ามา รายงานก็ยังบอกว่า V W X
     เจ้าของร้านอ่านแล้วนึกว่าคอลัมน์ใหม่ไม่ได้ถูกสร้าง ทั้งที่สร้างไปแล้ว
     รายงานที่ไม่ตรงกับของจริง อ่านแล้วตัดสินใจผิดได้พอ ๆ กับไม่มีรายงาน */
  var letters = cols.map(function (c) { return colLetter_(c.col); }).join(' ');
  return 'เพิ่มคอลัมน์ ' + letters + ' ที่ชีท ' + SH.head.name +
    ' (' + cols.map(function (c) { return c.head.replace(/\n/g, ''); }).join(' · ') + ')' +
    (wrote ? ' และเติมตัวเลือกสถานะบัญชี ' + wrote + ' ค่าในชีท ' + SH.cfg.name : '');
}

/* ------------------------------------ คอลัมน์ "ล็อตที่ตัด" ที่ ออเดอร์_รายการ */

function setupItemLotColumn_(ss) {
  var s = findSheet_(ss, SH.item.name);
  if (!s) throw new Error('ไม่พบชีท ' + SH.item.name);
  var col = SH.item.lot;  // 17 = Q

  if (s.getMaxColumns() < col) s.insertColumnsAfter(s.getMaxColumns(), col - s.getMaxColumns());

  var existing = String(s.getRange(HEAD_ROW, col).getValue() || '');
  if (existing && existing !== 'ล็อตที่ตัด') {
    throw new Error('คอลัมน์ Q ของชีท ' + SH.item.name + ' มีหัวข้อ "' + existing +
      '" อยู่แล้ว — หยุดไว้ก่อน ไม่เขียนทับของเดิม');
  }

  s.getRange(HEAD_ROW, col).setValue('ล็อตที่ตัด')
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var last = formulaLimit_('item');
  var n = last - DATA_ROW + 1;
  if (n < 1) throw new Error('ชีท ' + SH.item.name + ' ไม่มีสูตรในแถวข้อมูลเลย — ชีทอาจถูกแก้');

  var C = boundLast_(ss, SH.cut.name, CUT_LAST);
  var CR2 = sheetRef_(ss, SH.cut.name);
  fillFormula_(s, col, n,
    '=IF($P6="","",IFERROR(TEXTJOIN(", ",TRUE,ARRAYFORMULA(' +
    'IF(' + CR2 + '!$H$6:$H$' + C + '=$P6,' +
    CR2 + '!$E$6:$E$' + C + '&" x"&TEXT(' + CR2 + '!$F$6:$F$' + C + ',"0"),""))),""))');

  s.getRange(DATA_ROW, col, n, 1).setBackground(C_CALC_BG);
  s.setColumnWidth(col, 200);

  return 'เพิ่มคอลัมน์ Q "ล็อตที่ตัด" ที่ชีท ' + SH.item.name + ' ถึงแถว ' + last;
}

/* ------------------------------------------------------------------- helpers */

/** ใส่สูตรเดียวกันทั้งคอลัมน์ ตั้งแต่แถว 6 ลงไป n แถว (อ้างอิงสัมพัทธ์ขยับตามแถวเอง) */
function fillFormula_(s, col, n, formula) {
  /* เขียนสูตรเพิ่ม = คำตอบเก่าของ "สูตรมีถึงแถวไหน" ใช้ไม่ได้แล้ว
     ล้างทิ้งตรงนี้ที่เดียว เพราะนี่คือที่เดียวในระบบที่เขียนสูตรลงชีท */
  LIMIT_CACHE_ = {};
  s.getRange(DATA_ROW, col).setFormula(formula);
  if (n > 1) {
    s.getRange(DATA_ROW, col).copyTo(s.getRange(DATA_ROW + 1, col, n - 1, 1));
  }
}

/** ทาสีตามธรรมเนียมของชีทนี้ — ช่องกรอกตัวหนังสือน้ำเงิน ช่องสูตรพื้นเทา */
function paintCols_(s, n, inCols, calcCols) {
  for (var i = 0; i < inCols.length; i++) {
    s.getRange(DATA_ROW, inCols[i], n, 1).setBackground(null).setFontColor(C_IN_FG);
  }
  for (var j = 0; j < calcCols.length; j++) {
    s.getRange(DATA_ROW, calcCols[j], n, 1).setBackground(C_CALC_BG).setFontColor(null);
  }
}

/* ------------------------------- เขียนสูตร VAT / ยอดสุทธิ ที่ ออเดอร์_หัวบิล คืน */

/**
 * สูตรสองช่องที่ระบบยอมเขียนเองได้ — และเป็นที่เดียวในโปรแกรมทั้งหมด
 *
 * ปกติกฎเหล็กคือ "ไม่เดาสูตรของเจ้าของร้าน" repairOrderSheets จึงคัดลอกจากแถวที่ยังดี
 * ในชีทเดียวกันเสมอ แต่ 7 ก.ย. 69 เกิดกรณีที่วิธีนั้นช่วยไม่ได้เลย:
 * สูตร #REF! ถูกคัดลอกไปทับทั้งคอลัมน์ M กับ N จนไม่เหลือแถวดีให้เป็นต้นแบบสักแถว
 *
 * ทำไมถึงกล้าเขียนสูตรสองช่องนี้เอง — เพราะเทียบกับ "ใบที่ออกให้ลูกค้าไปแล้ว" ตรงทุกใบ:
 *   VAT   = (ยอดสินค้า − ส่วนลด + ค่าจัดส่ง) × อัตราใน ตั้งค่า!B8  เฉพาะใบที่ "รับ VAT"
 *   สุทธิ = ยอดสินค้า − ส่วนลด + ค่าจัดส่ง + VAT
 *
 * ค่าส่งอยู่ในฐานภาษีด้วย ตรงนี้เคยเข้าใจผิดมาก่อนแล้วเกือบทำพัง: ตัวเลขเก่าในชีท
 * คิด VAT จากยอดสินค้าอย่างเดียว แต่ใบเสร็จที่ลูกค้าถืออยู่คิดรวมค่าส่งมาตลอด
 *   ONIV26-00246 (AST-26-0020) ฐาน 1,350 VAT 94.50 · ONIV26-00247 (0023) ฐาน 287 VAT 20.09
 *   ONIV26-00252 (0026) 18.35 · ONIV26-00255 (0032) 238.63 · ONIV26-00259 (0050) 134.75
 * ชีทต่างหากที่เพี้ยนจากใบจริง ไม่ใช่ใบเพี้ยนจากชีท — ยึดใบที่ออกไปแล้วเป็นหลัก
 * และตรงกับที่ buildDoc_() คิดภาษีตอนออกเอกสารด้วย ทั้งระบบจึงพูดตรงกันหมด
 *
 * ตั้งค่า!B8 คือช่องเดียวกับที่ cfgGet_() อ่านอัตรา VAT มาใช้ทั้งระบบ
 */
var HEAD_VAT_FORMULA =
  '=IF($A{r}="","",IF($I{r}="รับ VAT",ROUND(($J{r}-$K{r}+$L{r})*ตั้งค่า!$B$8,2),0))';
var HEAD_NET_FORMULA = '=IF($A{r}="","",$J{r}-$K{r}+$L{r}+$M{r})';

/**
 * เขียนสูตร VAT (M) กับ ยอดชำระสุทธิ (N) ของ ออเดอร์_หัวบิล ใหม่ทั้งคอลัมน์
 *
 * ใช้เฉพาะตอนที่ repairOrderSheets ช่วยไม่ได้ เพราะไม่เหลือแถวดีให้เป็นต้นแบบ
 * ถ้าสูตรยังดีอยู่จะไม่ยอมเขียนทับ ต้องยืนยันด้วย writeVatFormulas('เขียนทับ')
 * เขียนแค่สองคอลัมน์นี้ ในช่วงแถวที่มีสูตรอยู่แล้วเท่านั้น ช่องกรอกไม่ถูกแตะ
 */
function writeVatFormulas(confirm) {
  var email = requireStaff_();
  var sh = sheet_('head');
  var limit = formulaLimit_('head');
  if (limit < DATA_ROW) {
    throw new Error('ชีท ' + SH.head.name + ' ไม่เหลือสูตรเลยแม้แต่แถวเดียว ' +
      'ต้องกู้ชีทจากประวัติเวอร์ชันของ Google ก่อน');
  }
  var n = limit - DATA_ROW + 1;
  var M = SH.head.vatAmt, N = SH.head.net;

  var before = countHeadRef_(sh, n, M, N);
  if (!before && String(confirm || '') !== 'เขียนทับ') {
    var okMsg = 'ช่อง VAT กับ ยอดชำระสุทธิ ไม่มี #REF! เลยสักช่อง จึงไม่เขียนทับให้\n' +
      'ถ้าตั้งใจจะเขียนสูตรใหม่จริง ๆ ให้สั่ง writeVatFormulas(\'เขียนทับ\')';
    Logger.log(okMsg);
    return okMsg;
  }

  var fm = [], fn = [];
  for (var i = 0; i < n; i++) {
    var r = DATA_ROW + i;
    fm.push([HEAD_VAT_FORMULA.replace(/\{r\}/g, r)]);
    fn.push([HEAD_NET_FORMULA.replace(/\{r\}/g, r)]);
  }
  sh.getRange(DATA_ROW, M, n, 1).setFormulas(fm);
  sh.getRange(DATA_ROW, N, n, 1).setFormulas(fn);
  SpreadsheetApp.flush();

  var after = countHeadRef_(sh, n, M, N);
  writeLog_(email, 'ซ่อมสูตร', SH.head.name, '', 'VAT + ยอดชำระสุทธิ',
    '#REF! ' + before + ' ช่อง', 'เขียนสูตรใหม่ ' + (n * 2) + ' ช่อง',
    'สูตรถูกคัดลอกทับจนไม่เหลือแถวต้นแบบ');

  var msg = 'เขียนสูตรใหม่ที่ ' + SH.head.name + ' แถว ' + DATA_ROW + '-' + limit + '\n' +
    '  ช่อง VAT (คอลัมน์ ' + M + ') และ ยอดชำระสุทธิ (คอลัมน์ ' + N + ') รวม ' + (n * 2) + ' ช่อง\n' +
    '  #REF! ก่อนซ่อม ' + before + ' ช่อง → เหลือ ' + after + ' ช่อง\n' +
    '  คอลัมน์อื่นไม่ถูกแตะเลย และลงบันทึกไว้ในชีท ' + SH.log.name + ' แล้ว';
  if (after) {
    msg += '\n\n  ยังเหลือ #REF! อยู่ แปลว่าชื่อชีท ตั้งค่า หรือช่อง B8 (อัตรา VAT) มีปัญหา — ' +
      'เปิดชีท ตั้งค่า ดูว่าช่อง B8 เป็น 7.0% จริงไหม';
  }
  Logger.log(msg);
  return msg;
}

/** นับ #REF! เฉพาะสองคอลัมน์นี้ ใช้ทั้งก่อนและหลังเขียน */
function countHeadRef_(sh, n, M, N) {
  var f = sh.getRange(DATA_ROW, 1, n, sh.getLastColumn()).getFormulas();
  var c = 0;
  for (var i = 0; i < f.length; i++) {
    if (String(f[i][M - 1] || '').indexOf('#REF!') > -1) c++;
    if (String(f[i][N - 1] || '').indexOf('#REF!') > -1) c++;
  }
  return c;
}

/* ------------------------------------------- ขยายที่ว่างของชีท ฐานสินค้า */

/**
 * ลากสูตรของชีท ฐานสินค้า ลงเพิ่ม เพื่อให้มีที่ว่างรับสินค้าตัวใหม่
 *
 * สินค้า "ซื้อมาขายไป" ที่พิมพ์ชื่อเองตอนคีย์ออเดอร์ จะถูกลงฐานสินค้าให้อัตโนมัติ
 * พอแถวที่มีสูตรเต็ม ระบบจะไม่ยอมบันทึกทั้งใบ แล้วบอกให้ "ลากสูตรลงเพิ่มก่อน"
 * ซึ่งเป็นงานที่ต้องไปทำในชีทด้วยมือ — และการแก้แถวด้วยมือในชีทนี้เคยทำให้
 * สูตรของชีท สต๊อกคงเหลือ พังเป็น #REF! ไป 38 แถวมาแล้ว
 * มีปุ่มให้กดจึงปลอดภัยกว่าบอกให้ไปลากเอง
 *
 * ไม่ขยายเกินแถวที่ชีท สต๊อกคงเหลือ มีสูตรถึง เพราะสองชีทผูกกันแบบแถวต่อแถว
 * สินค้าที่อยู่เลยขอบนั้นจะไม่มียอดคงเหลือ และไม่มีอะไรฟ้องให้รู้
 */
function growProducts() {
  requireStaff_();
  var s = sheet_('prod');
  var cfg = SH.prod;
  var from = formulaLimit_('prod');
  var stockLimit = formulaLimit_('stock');

  if (from < DATA_ROW) {
    var none = 'ชีท ' + cfg.name + ' ไม่มีแถวไหนมีสูตรเลย — ต้องสั่ง setup ก่อน';
    Logger.log(none);
    return none;
  }
  if (stockLimit <= from) {
    var blocked = 'ชีท ' + SH.stock.name + ' มีสูตรถึงแถว ' + stockLimit +
      ' ซึ่งไม่เกินชีท ' + cfg.name + ' (แถว ' + from + ') อยู่แล้ว\n' +
      'ขยาย ' + cfg.name + ' ไปก่อนจะได้สินค้าที่ไม่มียอดคงเหลือ — ' +
      'ต้องสั่ง repairStockSheet เพื่อลากสูตรของ ' + SH.stock.name + ' ลงก่อน';
    Logger.log(blocked);
    return blocked;
  }

  var want = stockLimit;
  if (s.getMaxRows() < want) s.insertRowsAfter(s.getMaxRows(), want - s.getMaxRows());

  /* ลอกเฉพาะคอลัมน์ที่เป็นสูตร ช่องกรอกต้องว่างไว้ให้คนกรอกเอง
     ลอกทั้งแถวเมื่อไร ชื่อสินค้ากับราคาของแถวสุดท้ายจะถูกก๊อปลงมาทุกแถว
     กลายเป็นสินค้าผีเต็มฐานที่ดูเหมือนของจริง */
  var calc = cfg.CALC || [];
  var n = want - from;
  for (var i = 0; i < calc.length; i++) {
    s.getRange(from, calc[i]).copyTo(s.getRange(from + 1, calc[i], n, 1));
  }
  SpreadsheetApp.flush();
  LIMIT_CACHE_ = {};

  var now = formulaLimit_('prod');
  var msg = 'ชีท ' + cfg.name + ': ลากสูตรจากแถว ' + from + ' ลงถึงแถว ' + now +
    ' (เพิ่มที่ว่างอีก ' + (now - from) + ' รายการ)\n' +
    'ลอกเฉพาะคอลัมน์สูตร ' + calc.join(' · ') + ' ช่องกรอกยังว่างไว้ให้กรอกเอง';
  if (now < want) {
    msg += '\n⚠ ได้ไม่ถึงแถว ' + want + ' ที่ตั้งใจไว้ — เปิดชีทดูว่าแถวท้าย ๆ ติดอะไรอยู่';
  }

  /* ขยายฐานสินค้าอย่างเดียวไม่พอ สูตรของชีทอื่นที่ชี้กลับมาหาฐานสินค้ายังมองช่วงเดิม
     สินค้าที่ลงแถวใหม่จึงมีตัวตน แต่ชีทอื่นหาชื่อไม่เจอ แล้วรหัสก็ไปโผล่บนใบกำกับภาษี
     — เกิดขึ้นจริงกับใบ ONIV26-00296 หลังสั่ง growProducts รอบแรก
     ไม่แก้ให้เองเพราะเป็นสูตรของเจ้าของชีท แต่ต้องบอกให้รู้ตัวตรงนี้ ไม่ใช่รู้ตอนใบออกไปแล้ว */
  var links = productLinks_(false, '');
  if (links.indexOf('ครบแล้ว') < 0) {
    msg += '\n\n⚠ ยังไม่จบแค่นี้ — สูตรของชีทอื่นที่ชี้มาที่ ' + cfg.name +
      ' ยังมองไม่ถึงแถวใหม่\n' +
      'ต้องสั่ง fixProductLinks ต่ออีกหนึ่งครั้ง ไม่งั้นสินค้าที่เพิ่มใหม่จะไม่มีชื่อ ' +
      'แล้วรหัสจะไปพิมพ์แทนชื่อสินค้าบนใบกำกับภาษี\n\n' + links;
  }
  Logger.log(msg);
  return msg;
}

/* ------------------------- สูตรที่มองมาที่ ฐานสินค้า ต้องมองให้ถึงแถวสุดท้าย */

/**
 * ชีทอื่นที่ดึงข้อมูลจาก ฐานสินค้า มองไปถึงแถวไหน
 *
 * ทำไมต้องมี: growProducts() ลากสูตรของ ฐานสินค้า ลงไปได้ถึงแถว 150 ก็จริง
 * แต่สูตร VLOOKUP ในชีทอื่นที่ชี้กลับมาหาฐานสินค้า ยังมองอยู่แค่ช่วงเดิม
 * สินค้าที่ลงแถวเลยขอบนั้นจึงมีตัวตนในฐานสินค้า แต่ชีทอื่นหาไม่เจอ
 *
 * อาการที่เจอจริง: ช่องชื่อสินค้าใน ออเดอร์_รายการ ว่างเปล่า ระบบเลยหยิบรหัส
 * มาพิมพ์แทน แล้ว "SKU-X020" ก็ไปนั่งอยู่ในช่องรายการของใบกำกับภาษี ONIV26-00296
 * ที่ส่งถึงมือลูกค้าไปแล้ว — ใบนั้นใช้ไม่ได้ ต้องออกใหม่ทั้งใบ
 *
 * เงียบสนิทเป็นปัญหาหลัก ไม่มีอะไรขึ้นเตือนสักอย่าง ยอดเงินก็ถูกทุกบาท
 * ผิดแค่ช่องเดียวคือช่องที่ลูกค้าอ่าน
 */
function checkProductLinks() { return productLinks_(false, requireStaff_()); }

/** ซ่อมจริง — ขยายเฉพาะเลขแถวท้ายช่วง ส่วนอื่นของสูตรไม่แตะสักตัวอักษร */
function fixProductLinks() { return productLinks_(true, requireStaff_()); }

/** ช่วงที่ชี้มาที่ชีทหนึ่ง พร้อมเลขแถวท้ายช่วง — ใช้หาสูตรที่มองไม่ถึงแถวล่าง ๆ */
function prodRefRe_(sheetName) {
  var esc = String(sheetName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* ชื่อชีทในสูตรมีทั้งแบบมีเครื่องหมายคำพูดและไม่มี แล้วแต่ Google จะใส่ให้
     จับทั้งสองแบบ ไม่งั้นชีทที่เขียนอีกแบบจะรอดด่านไปเงียบ ๆ */
  return new RegExp("(?:'" + esc + "'|" + esc + ")!\\$?[A-Za-z]{1,3}\\$?(\\d+)" +
    ":\\$?[A-Za-z]{1,3}\\$?(\\d+)", 'g');
}

function productLinks_(doFix, email) {
  var ss = ss_();
  var prodName = findSheet_(ss, SH.prod.name);
  prodName = prodName ? prodName.getName() : SH.prod.name;

  /* ต้องมองให้ถึงแถวที่ ฐานสินค้า มีสูตรถึง ไม่ใช่แค่แถวที่มีของอยู่ตอนนี้
     เพราะแถวว่างที่มีสูตรรออยู่ คือแถวที่สินค้าตัวถัดไปจะไปลง */
  var need = formulaLimit_('prod');
  var out = [], short = 0, changed = 0;
  out.push('ชีท ' + prodName + ' มีสูตรถึงแถว ' + need +
    ' — ชีทอื่นต้องมองมาถึงแถวนี้ให้ครบทุกสูตร');

  var keys = ['item', 'head', 'recv', 'lot', 'cut', 'stock', 'doc', 'month'];
  for (var k = 0; k < keys.length; k++) {
    var cfg = SH[keys[k]];
    if (!cfg || !cfg.name) continue;
    var sh = findSheet_(ss, cfg.name);
    if (!sh) continue;

    var wide = sh.getMaxColumns();
    var cols = (cfg.CALC && cfg.CALC.length) ? cfg.CALC.slice() : [];
    if (!cols.length && cfg.CALC_ALL) {
      for (var w = 1; w <= wide; w++) cols.push(w);
    }
    if (!cols.length) continue;

    var lim = formulaLimit_(keys[k]);
    for (var c = 0; c < cols.length; c++) {
      if (cols[c] > wide) continue;
      var f = sh.getRange(DATA_ROW, cols[c]).getFormula();
      if (!f || f.indexOf(prodName) < 0) continue;

      var re = prodRefRe_(prodName), m, worst = 0;
      while ((m = re.exec(f)) !== null) {
        var end = Number(m[2]);
        if (end < need && (!worst || end < worst)) worst = end;
      }
      if (!worst) continue;

      short++;
      var where = cfg.name + ' คอลัมน์ ' + colLetter_(cols[c]);
      out.push('✗ ' + where + ' มองมาที่ ' + prodName + ' แค่ถึงแถว ' + worst +
        ' (ขาดไป ' + (need - worst) + ' แถว)');

      if (!doFix) continue;

      var fixed = f.replace(prodRefRe_(prodName), function (whole, a, b) {
        return Number(b) < need
          ? whole.slice(0, whole.length - String(b).length) + need
          : whole;
      });
      /* เปลี่ยนได้เฉพาะตัวเลข ถ้ารูปสูตรขยับแม้แต่ตัวอักษรเดียวแปลว่าตัวแทนที่พลาด
         สูตรของชีทนี้เคยพังยกคอลัมน์มาแล้ว ยอมไม่ซ่อมดีกว่าซ่อมแล้วพัง */
      if (fixed.replace(/\d+/g, '#') !== f.replace(/\d+/g, '#')) {
        out.push('  … ไม่กล้าแก้ให้ รูปสูตรเปลี่ยนไปจากเดิม — ต้องดูด้วยตา');
        continue;
      }
      if (fixed === f) continue;

      var rows = Math.max(1, lim - DATA_ROW + 1);
      fillFormula_(sh, cols[c], rows, fixed);
      changed++;
      out.push('  → แก้เป็นถึงแถว ' + need + ' แล้ว ลากลงครบถึงแถว ' + lim);
      writeLog_(email || 'ระบบ', 'แก้สูตร', cfg.name, colLetter_(cols[c]),
        'ขยายช่วงที่มองมาที่ ' + prodName, f, fixed);
    }
  }

  /* ต้องให้ชีทคิดสูตรใหม่ก่อน ไม่งั้นรายชื่อแถวที่ไม่มีชื่อสินค้าข้างล่างนี้
     จะเป็นภาพก่อนซ่อม แล้วรายงานจะบอกว่ายังพังทั้งที่เพิ่งแก้ไปเอง */
  if (changed) SpreadsheetApp.flush();
  out.push('');
  out.push(namelessRows_(ss, need));

  var tail = short
    ? (doFix
      ? (changed ? '── สรุป ── แก้ให้แล้ว ' + changed + ' คอลัมน์ ' +
          '— ลองสั่ง checkProductLinks ซ้ำอีกรอบเพื่อยืนยันว่าเหลือ 0'
        : '── สรุป ── เจอ ' + short + ' คอลัมน์ที่สั้นไป แต่แก้ให้อัตโนมัติไม่ได้')
      : '── สรุป ── มี ' + short + ' คอลัมน์ที่มองมาไม่ถึงแถวล่างของ ' + prodName + '\n' +
        'สินค้าที่ลงแถวเลยขอบนั้นจะไม่มีชื่อบนใบที่ส่งลูกค้า — สั่ง fixProductLinks หนึ่งครั้ง')
    : '── สรุป ── ทุกสูตรที่มองมาที่ ' + prodName + ' มองถึงแถว ' + need + ' ครบแล้ว';
  out.push('');
  out.push(tail);

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * แถวไหนในชีทรายการที่ช่องชื่อสินค้าไม่มีชื่อ — และใบไหนที่ออกไปแล้วโดนด้วย
 *
 * ยอดเงินของแถวพวกนี้ถูกทุกบาท ผิดแค่ช่องเดียวคือช่องที่ลูกค้าอ่าน
 * จึงไม่มีทางรู้ตัวจากยอดขายหรือกำไร ต้องไล่ดูช่องนั้นตรง ๆ เท่านั้น
 */
function namelessRows_(ss, need) {
  var sh = findSheet_(ss, SH.item.name);
  if (!sh) return 'ไม่มีชีท ' + SH.item.name;
  var lim = formulaLimit_('item');
  if (lim < DATA_ROW) return 'ชีท ' + SH.item.name + ' ยังไม่มีข้อมูล';

  var v = sh.getRange(DATA_ROW, 1, lim - DATA_ROW + 1, Math.max(5, SH.item.IN.sku)).getValues();
  var hitOrders = {}, hits = [];
  for (var i = 0; i < v.length; i++) {
    var no = String(v[i][SH.item.IN.no - 1] || '').trim();
    if (!no) continue;
    var sku = v[i][SH.item.IN.sku - 1];
    if (!nameBroken_(v[i][4], sku)) continue;
    hits.push('แถว ' + (DATA_ROW + i) + ' · ' + no + ' · ' + String(sku || '(ไม่มีรหัส)'));
    hitOrders[no] = true;
  }
  if (!hits.length) return 'ชีท ' + SH.item.name + ': ทุกแถวมีชื่อสินค้าครบ';

  var lines = ['ชีท ' + SH.item.name + ': ' + hits.length + ' แถวไม่มีชื่อสินค้า ' +
    '(ระบบจะพิมพ์รหัสแทนชื่อ ซึ่งใช้บนใบกำกับภาษีไม่ได้)'];
  lines = lines.concat(hits.slice(0, 20).map(function (h) { return '  · ' + h; }));
  if (hits.length > 20) lines.push('  … อีก ' + (hits.length - 20) + ' แถว');

  /* ใบที่ออกไปแล้วสำคัญกว่าแถวในชีท เพราะใบพวกนั้นอยู่ในมือลูกค้าแล้ว
     และการแก้สูตรทีหลังไม่ได้ทำให้กระดาษที่ส่งไปแล้วถูกขึ้นมาเอง */
  var ds = findSheet_(ss, SH.doc.name);
  if (ds) {
    var dlim = formulaLimit_('doc');
    if (dlim >= DATA_ROW) {
      var dv = ds.getRange(DATA_ROW, 1, dlim - DATA_ROW + 1,
        Math.max(SH.doc.IN.no, SH.doc.IN.orderNo)).getValues();
      var docs = [];
      for (var d = 0; d < dv.length; d++) {
        var ono = String(dv[d][SH.doc.IN.orderNo - 1] || '').trim();
        if (ono && hitOrders[ono]) {
          docs.push(String(dv[d][SH.doc.IN.no - 1] || '') + ' (ออเดอร์ ' + ono + ')');
        }
      }
      if (docs.length) {
        lines.push('⚠ ใบที่ออกให้ลูกค้าไปแล้วและติดปัญหานี้ ' + docs.length + ' ใบ: ' +
          docs.slice(0, 10).join(' · ') + (docs.length > 10 ? ' …' : ''));
        lines.push('  ใบพวกนี้ต้องยกเลิกแล้วออกใหม่ — แก้สูตรอย่างเดียวไม่ทำให้ใบเก่าถูกขึ้นมา');
      }
    }
  }
  return lines.join('\n');
}


/**
 * เตรียมชีทให้พร้อมสำหรับหน้าร้านที่ลูกค้าเปิดเอง — สั่งครั้งเดียวพอ สั่งซ้ำได้ไม่พัง
 *
 * เพิ่มสามคอลัมน์ท้าย ฐานสินค้า (ต่อท้ายช่องสูตร ไม่แทรกกลาง ไม่งั้นสูตรของชีทอื่น
 * ที่ชี้มาที่คอลัมน์ K L M จะเลื่อนพังหมด แบบเดียวกับที่เคยเกิดตอนลบแถวทิ้ง)
 *
 *   N  ขายหน้าเว็บ   เว้นว่าง = ขาย · พิมพ์ "ไม่" = ซ่อนจากหน้าร้าน
 *   O  ลิงก์รูป 1    รูปหลัก ขึ้นบนการ์ดสินค้า เว้นว่างได้ หน้าร้านจะขึ้นกรอบชื่อสินค้าแทน
 *   P  ลิงก์รูป 2    รูปที่สอง ลูกค้ากดที่รูปแล้วเลื่อนดูได้ เว้นว่างก็มีรูปเดียว
 *
 * และเพิ่มสวิตช์ "เปิดรับออเดอร์หน้าเว็บ" ในชีท ตั้งค่าแอป ถ้ายังไม่มี
 */
function setupShopColumns() {
  var email = requireStaff_();
  var ss = ss_();
  var out = [];

  var s = findSheet_(ss, SH.prod.name);
  if (!s) throw new Error('ไม่เจอชีท ' + SH.prod.name);

  var need = SH.prod.IN.img2;                      // P = 16
  if (s.getMaxColumns() < need) s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns());

  /* หัวคอลัมน์เขียนทับได้เสมอ เพราะสามช่องนี้ไม่มีใครใช้นอกจากหน้าร้าน
     ชีทที่ตั้งไว้รอบก่อนจะได้ชื่อ "ลิงก์รูป" เฉย ๆ ที่ช่อง O — เขียนใหม่เป็น
     "ลิงก์รูป 1" ให้ตรงกับ "ลิงก์รูป 2" ที่เพิ่งเพิ่ม ลิงก์ที่กรอกไว้แล้วไม่หาย
     เพราะแตะแค่แถวหัว (HEAD_ROW) ไม่ได้แตะแถวข้อมูล */
  var head = s.getRange(HEAD_ROW, SH.prod.IN.web, 1, 3).getValues()[0];
  var had = String(head[0] || '').trim() && String(head[1] || '').trim();
  var had2 = String(head[2] || '').trim();

  s.getRange(HEAD_ROW, SH.prod.IN.web, 1, 3)
    .setValues([['ขายหน้าเว็บ', 'ลิงก์รูป 1', 'ลิงก์รูป 2']])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold');
  s.getRange(HEAD_ROW + 1, SH.prod.IN.web).setNote(
    'เว้นว่าง = ขายบนหน้าร้าน\n' +
    'พิมพ์ "ไม่" = ซ่อนจากหน้าร้าน (พนักงานยังคีย์ขายได้ตามปกติ)');
  s.getRange(HEAD_ROW + 1, SH.prod.IN.img).setNote(
    'รูปหลัก — รูปนี้ขึ้นบนการ์ดสินค้าและในตะกร้า\n' +
    'วางลิงก์แชร์จาก Google ไดรฟ์ได้เลย ระบบแปลงให้เอง\n' +
    'แต่รูปในไดรฟ์ต้องตั้งแชร์เป็น "ทุกคนที่มีลิงก์" ไม่งั้นลูกค้าเห็นกรอบเปล่า');
  s.getRange(HEAD_ROW + 1, SH.prod.IN.img2).setNote(
    'รูปที่สอง — ลูกค้ากดที่รูปแล้วเลื่อนดูได้\n' +
    'เว้นว่างได้ ถ้าเว้นก็มีรูปเดียว ไม่พัง\n' +
    'เหมาะกับรูปมุมที่รูปหลักไม่เห็น เช่น ปลายคม หรือฉลากข้างขวด');

  if (had && had2) {
    out.push('ฐานสินค้า มีคอลัมน์ ขายหน้าเว็บ กับ ลิงก์รูปครบทั้งสองช่องอยู่แล้ว');
  } else if (had) {
    out.push('เพิ่มคอลัมน์ ' + colLetter_(SH.prod.IN.img2) + ' ลิงก์รูป 2 ให้ ฐานสินค้า แล้ว');
    out.push('  ลิงก์รูปที่กรอกไว้ในคอลัมน์ ' + colLetter_(SH.prod.IN.img) + ' ยังอยู่ครบ ไม่ต้องกรอกใหม่');
    out.push('  ตัวไหนอยากให้ลูกค้าดูได้สองรูป ค่อยเติมลิงก์ที่สองในคอลัมน์ ' +
      colLetter_(SH.prod.IN.img2));
  } else {
    out.push('เพิ่มคอลัมน์ ' + colLetter_(SH.prod.IN.web) + ' ขายหน้าเว็บ · ' +
      colLetter_(SH.prod.IN.img) + ' ลิงก์รูป 1 · ' +
      colLetter_(SH.prod.IN.img2) + ' ลิงก์รูป 2 ให้ ฐานสินค้า แล้ว');
    out.push('  ทุกตัวเริ่มต้นเป็น "ขาย" เหมือนหน้าร้านชุดเดิม ตัวไหนไม่อยากให้ลูกค้าเห็น');
    out.push('  ให้พิมพ์คำว่า ไม่ ลงในคอลัมน์ ' + colLetter_(SH.prod.IN.web) + ' ของแถวนั้น');
  }

  out.push(shopSwitchRow_(ss));
  out.push('');
  out.push('สินค้าที่ลูกค้าจะเห็นตอนนี้: ' + shopItems_().length + ' รายการ');

  writeLog_(email, 'ตั้งค่า', SH.prod.name, '', 'เตรียมคอลัมน์หน้าร้าน', '', '');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** สองสวิตช์ของหน้าร้านในชีท ตั้งค่าแอป — เติมให้ถ้ายังไม่มี สั่งซ้ำได้ไม่เพิ่มซ้ำ */
function shopSwitchRow_(ss) {
  var s = findSheet_(ss, SH.app.name);
  if (!s) return 'ยังไม่มีชีท ' + SH.app.name + ' — สั่ง setup ก่อนแล้วค่อยสั่งตัวนี้ซ้ำ';

  var WANT = [
    ['เปิดรับออเดอร์หน้าเว็บ', 'เปิด',
      'พิมพ์ "ปิด" เมื่อไม่อยากให้ลูกค้าสั่งของจากหน้าเว็บชั่วคราว\n' +
      'ปิดแล้วลูกค้ายังดูสินค้าและราคาได้ตามปกติ แค่กดสั่งไม่ได้'],
    ['ออเดอร์จากเว็บ', 'เข้าคิวก่อน',
      'เข้าคิวก่อน = ไปรอในชีท คำขอสั่งซื้อ ให้พนักงานตรวจแล้วกด "รับเป็นออเดอร์"\n' +
      'เข้าชีทเลย   = เป็นออเดอร์จริงทันที ตัดสต๊อกทันที ไม่มีใครตรวจก่อน\n' +
      'แนะนำให้ใช้ "เข้าคิวก่อน" เพราะพลาดแล้วแก้ง่ายกว่ามาก'],
    ['โลโก้ร้าน (ลิงก์รูป)', '',
      'โลโก้กลม ๆ บนหัวหน้าร้าน เว้นว่างได้\n' +
      'ลิงก์แชร์ไดรฟ์ใช้ได้ แต่ต้องตั้งเป็น "ทุกคนที่มีลิงก์"'],
    ['ภาพหัวหน้าร้าน (ลิงก์รูป)', '',
      'ภาพพื้นหลังด้านบนสุดของหน้าร้าน เว้นว่างได้\n' +
      'เว้นว่าง = ใช้พื้นหลังไล่สีฟ้าของระบบแทน'],
    ['ลิงก์แผนที่ร้าน', '',
      'ลิงก์ Google Maps ของหน้าร้าน เว้นว่างได้\n' +
      'เว้นว่าง = ระบบเอาที่อยู่ผู้ส่งไปค้นใน Google Maps ให้เอง']
  ];

  var last = s.getLastRow();
  var have = {};
  if (last >= DATA_ROW) {
    var v = s.getRange(DATA_ROW, 1, last - DATA_ROW + 1, 1).getValues();
    for (var i = 0; i < v.length; i++) have[String(v[i][0] || '').trim()] = 1;
  }

  var added = [], kept = [];
  for (var k = 0; k < WANT.length; k++) {
    if (have[WANT[k][0]]) { kept.push(WANT[k][0]); continue; }
    last = Math.max(DATA_ROW - 1, s.getLastRow());
    var row = last + 1;
    s.getRange(row, 1, 1, 2).setValues([[WANT[k][0], WANT[k][1]]]);
    s.getRange(row, 2).setNote(WANT[k][2]);
    added.push(WANT[k][0] + ' = ' + WANT[k][1]);
  }

  if (!added.length) return 'ตั้งค่าแอป มีสวิตช์ของหน้าร้านครบอยู่แล้ว';
  return 'เพิ่มสวิตช์ในชีท ' + SH.app.name + ': ' + added.join(' · ') +
    (kept.length ? '  (มีอยู่แล้ว: ' + kept.join(' · ') + ')' : '');
}


/**
 * ชีท คำขอสั่งซื้อ — ที่พักของออเดอร์จากหน้าเว็บก่อนพนักงานกดรับ
 *
 * แยกจาก ออเดอร์_หัวบิล โดยตั้งใจ คนที่กรอกมาคือใครก็ได้บนอินเทอร์เน็ต
 * จะให้ไปปนกับใบจริงที่ใช้ปิดบัญชีและตัดสต๊อกไม่ได้
 */
function setupReqSheet_(ss) {
  var name = SH.req.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < REQ_LAST) s.insertRowsAfter(s.getMaxRows(), REQ_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 14) s.insertColumnsAfter(s.getMaxColumns(), 14 - s.getMaxColumns());

  s.getRange('A2').setValue('คำขอสั่งซื้อจากหน้าร้าน — ยังไม่ใช่ออเดอร์')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ลูกค้ากรอกเข้ามาเอง ระบบยังไม่ตัดสต๊อกและยังไม่ออกเลขออเดอร์  |  ' +
    'พนักงานกด "รับเป็นออเดอร์" ในระบบคีย์ออเดอร์ ถึงจะกลายเป็นใบจริง  |  ' +
    'ยอดในช่องประเมินเป็นราคา ณ วันที่ลูกค้ากด ไม่ใช่ยอดที่ตกลงกันจริง'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขคำขอ', 'เข้ามาเมื่อ', 'ชื่อผู้รับ', 'เบอร์โทร', 'ที่อยู่จัดส่ง',
    'ข้อความจากลูกค้า', 'รายการ\n(SKU*จำนวน)', 'ชื่อสินค้า', 'ยอดประเมิน',
    'สถานะ', 'เลขออเดอร์ที่รับเป็น', 'ผู้รับเรื่อง', 'เหตุผลที่ไม่รับ'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = REQ_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 14; c++) inCols.push(c);
  paintCols_(s, n, inCols, [1]);

  s.getRange(DATA_ROW, SH.req.IN.at, n, 1).setNumberFormat('dd/mm/yyyy HH:mm');
  s.getRange(DATA_ROW, SH.req.IN.tel, n, 1).setNumberFormat('@');
  s.getRange(DATA_ROW, SH.req.IN.lines, n, 1).setNumberFormat('@');
  s.getRange(DATA_ROW, SH.req.IN.est, n, 1).setNumberFormat('#,##0.00');

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.req.IN.no, 130);
  s.setColumnWidth(SH.req.IN.at, 140);
  s.setColumnWidth(SH.req.IN.cust, 160);
  s.setColumnWidth(SH.req.IN.tel, 110);
  s.setColumnWidth(SH.req.IN.addr, 300);
  s.setColumnWidth(SH.req.IN.note, 200);
  s.setColumnWidth(SH.req.IN.lines, 180);
  s.setColumnWidth(SH.req.IN.names, 280);
  s.setColumnWidth(SH.req.IN.status, 110);
  s.setColumnWidth(SH.req.IN.orderNo, 140);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' คำขอ)';
}


/* ============================================================================
   หน้าร้านแบบใหม่ — แบนเนอร์ · หมวดมีรูป · ป้ายสินค้าแนะนำ
   ========================================================================== */

var BAN_LAST = 105;    // แบนเนอร์หน้าร้าน รองรับ 100 แบนเนอร์
var SCAT_LAST = 85;    // หมวดหน้าร้าน รองรับ 80 หมวด

/** ตำแหน่งที่แบนเนอร์ไปโผล่บนหน้าแรก — ต้องตรงกับที่ Shop.gs อ่าน */
var BAN_SLOTS = ['ติดต่อเรา', 'โปรโมชั่นเด่น', 'โปรโมชั่นประจำเดือน'];

/** ป้ายที่ติดสินค้าได้ — ตัวที่ทำให้สินค้าไปขึ้นแถบพิเศษบนหน้าแรก */
var PROD_TAGS = ['แนะนำ', 'ใหม่', 'ขายดี', 'โปรโมชั่น'];

/**
 * เตรียมชีทสำหรับหน้าร้านหน้าตาใหม่ — สั่งครั้งเดียวพอ สั่งซ้ำได้ไม่พัง
 *
 * ทำสามอย่าง
 *   1. สร้างชีท แบนเนอร์หน้าร้าน  — รูปใหญ่สามแถบบนหน้าแรก
 *   2. สร้างชีท หมวดหน้าร้าน      — รูปไอคอนกับรูปปกของแต่ละหมวด (เติมชื่อหมวดให้เอง)
 *   3. เพิ่มคอลัมน์ Q "ป้ายหน้าร้าน" ที่ ฐานสินค้า — ติดป้าย แนะนำ/ใหม่/ขายดี/โปรโมชั่น
 *
 * ไม่มีอันไหนบังคับกรอก ปล่อยว่างทั้งหมดหน้าร้านก็ยังทำงานเหมือนเดิมทุกอย่าง
 * แค่ไม่มีแบนเนอร์ ไม่มีรูปหมวด และไม่มีแถบสินค้าแนะนำ
 */
function setupShopPages() {
  var email = requireStaff_();
  var ss = ss_();
  var out = [];

  out.push(setupBanSheet_(ss));
  out.push(setupScatSheet_(ss));
  out.push(setupProdTagCol_(ss));
  /* สวิตช์กับช่องโลโก้อยู่ในชีท ตั้งค่าแอป — เติมจากตรงนี้ด้วย
     เจ้าของร้านจะได้สั่งฟังก์ชันเดียวจบ ไม่ต้องจำว่าอันไหนสร้างอะไร */
  out.push(shopSwitchRow_(ss));

  out.push('');
  out.push('ต่อไปทำอะไร');
  out.push('  1. ใส่ลิงก์รูปแบนเนอร์ในชีท ' + SH.ban.name + ' แล้วพิมพ์ เปิด ในช่องเปิดใช้');
  out.push('  2. ใส่ลิงก์รูปหมวดในชีท ' + SH.scat.name + ' (ชื่อหมวดเติมมาให้แล้ว)');
  out.push('  3. ติดป้าย แนะนำ หรือ ขายดี ในคอลัมน์ ' + colLetter_(SH.prod.IN.tag) +
           ' ของ ฐานสินค้า ให้ตัวที่อยากดันขึ้นหน้าแรก');
  out.push('  ทุกช่องเว้นว่างได้หมด หน้าร้านไม่พัง แค่แถบนั้นไม่ขึ้น');

  writeLog_(email, 'ตั้งค่า', SH.ban.name, '', 'เตรียมหน้าร้านแบบใหม่', '', '');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

function setupBanSheet_(ss) {
  var name = SH.ban.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < BAN_LAST) s.insertRowsAfter(s.getMaxRows(), BAN_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 8) s.insertColumnsAfter(s.getMaxColumns(), 8 - s.getMaxColumns());

  s.getRange('A2').setValue('แบนเนอร์บนหน้าร้านที่ลูกค้าเปิด')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'รูปต้องเปิดดูได้จากข้างนอก — ลิงก์แชร์ไดรฟ์ใช้ได้ แต่ต้องตั้งเป็น "ทุกคนที่มีลิงก์"  |  ' +
    'ช่องเปิดใช้ต้องพิมพ์ เปิด ถึงจะขึ้นหน้าร้าน  |  ' +
    'ลิงก์ปุ่มใส่ได้สามแบบ: ที่อยู่เว็บ · หมวด:ชื่อหมวด · สินค้า:SKU'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'ตำแหน่ง', 'ชื่อแบนเนอร์\n(ไว้ดูเอง ลูกค้าไม่เห็น)', 'ลิงก์รูป',
    'ข้อความบนปุ่ม', 'ลิงก์ปุ่ม', 'เปิดใช้', 'หมายเหตุ'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = BAN_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($D6="","",COUNTA($D$6:$D6))');
  paintCols_(s, n, [2, 3, 4, 5, 6, 7, 8], [1]);

  s.getRange(DATA_ROW, SH.ban.IN.slot, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(BAN_SLOTS, true)
      .setAllowInvalid(false).build());
  s.getRange(DATA_ROW, SH.ban.IN.on, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['เปิด', 'ปิด'], true)
      .setAllowInvalid(false).build());

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.ban.IN.slot, 170);
  s.setColumnWidth(SH.ban.IN.title, 200);
  s.setColumnWidth(SH.ban.IN.img, 320);
  s.setColumnWidth(SH.ban.IN.btn, 130);
  s.setColumnWidth(SH.ban.IN.href, 260);
  s.setColumnWidth(SH.ban.IN.note, 200);

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' แบนเนอร์)';
}

/**
 * ชีทหมวดหน้าร้าน — เติมชื่อหมวดที่มีอยู่จริงใน ฐานสินค้า ให้เลย
 *
 * เติมให้เพราะถ้าปล่อยว่าง เจ้าของร้านต้องพิมพ์ชื่อหมวดเองให้ตรงเป๊ะกับคอลัมน์ C
 * พิมพ์ผิดตัวเดียวรูปก็ไม่ขึ้น โดยไม่มีอะไรบอกว่าผิดตรงไหน
 * หมวดที่มีแถวอยู่แล้วไม่แตะ — สั่งซ้ำแล้วรูปที่ใส่ไว้ต้องไม่หาย
 */
function setupScatSheet_(ss) {
  var name = SH.scat.name;
  var s = findSheet_(ss, name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < SCAT_LAST) s.insertRowsAfter(s.getMaxRows(), SCAT_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 7) s.insertColumnsAfter(s.getMaxColumns(), 7 - s.getMaxColumns());

  s.getRange('A2').setValue('หมวดสินค้าบนหน้าร้าน — ใส่ไว้แต่งรูป ไม่ได้สร้างหมวดใหม่')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ชื่อหมวดต้องตรงกับคอลัมน์ ' + colLetter_(SH.prod.IN.group) + ' ของ ฐานสินค้า เป๊ะ ๆ  |  ' +
    'หมวดที่ไม่มีแถวในนี้ก็ยังขึ้นหน้าร้าน แค่ไม่มีรูป  |  ' +
    'รูปไอคอนใช้บนหน้าแรก รูปปกใช้เป็นภาพใหญ่ด้านบนตอนกดเข้าไปในหมวด'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'หมวด\n(ตรงกับ ฐานสินค้า)', 'ชื่อที่โชว์ให้ลูกค้า\n(เว้นว่าง = ใช้ชื่อหมวด)',
    'ลิงก์รูปไอคอน', 'ลิงก์รูปปก', 'โชว์หน้าแรก', 'หมายเหตุ'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = SCAT_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');
  paintCols_(s, n, [2, 3, 4, 5, 6, 7], [1]);

  s.getRange(DATA_ROW, SH.scat.IN.home, n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['โชว์', 'ซ่อน'], true)
      .setAllowInvalid(false).build());

  s.setFrozenRows(HEAD_ROW);
  s.setColumnWidth(SH.scat.IN.group, 220);
  s.setColumnWidth(SH.scat.IN.label, 200);
  s.setColumnWidth(SH.scat.IN.icon, 300);
  s.setColumnWidth(SH.scat.IN.cover, 300);
  s.setColumnWidth(SH.scat.IN.note, 180);

  var added = seedScatRows_(s);
  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name +
    (added ? ' — เติมชื่อหมวดให้ใหม่ ' + added + ' หมวด' : ' — ชื่อหมวดครบอยู่แล้ว');
}

function seedScatRows_(s) {
  var have = {}, lastUsed = DATA_ROW - 1;
  var vals = s.getRange(DATA_ROW, SH.scat.IN.group, SCAT_LAST - DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    var g = String(vals[i][0] || '').trim();
    if (g) { have[g] = 1; lastUsed = DATA_ROW + i; }
  }

  var seen = {}, want = [];
  var prods = readProducts_();
  for (var k = 0; k < prods.length; k++) {
    var grp = String(prods[k].group || '').trim();
    if (!grp || seen[grp] || have[grp]) continue;
    seen[grp] = 1;
    want.push([grp]);
  }
  if (!want.length) return 0;
  if (lastUsed + want.length > SCAT_LAST) want = want.slice(0, SCAT_LAST - lastUsed);
  s.getRange(lastUsed + 1, SH.scat.IN.group, want.length, 1).setValues(want);
  /* หมวดที่เติมให้ใหม่ตั้งเป็น โชว์ ไว้ก่อน เจ้าของร้านค่อยไล่ปิดตัวที่ไม่อยากให้เห็น
     ตรงข้ามกับตั้งเป็น ซ่อน ซึ่งจะทำให้กรอกรูปเสร็จแล้วงงว่าทำไมไม่ขึ้น */
  var on = want.map(function () { return ['โชว์'] });
  s.getRange(lastUsed + 1, SH.scat.IN.home, want.length, 1).setValues(on);
  return want.length;
}

function setupProdTagCol_(ss) {
  var s = findSheet_(ss, SH.prod.name);
  if (!s) throw new Error('ไม่เจอชีท ' + SH.prod.name);

  var need = SH.prod.IN.tag;                       // Q = 17
  if (s.getMaxColumns() < need) s.insertColumnsAfter(s.getMaxColumns(), need - s.getMaxColumns());

  var had = String(s.getRange(HEAD_ROW, need).getValue() || '').trim();
  s.getRange(HEAD_ROW, need).setValue('ป้ายหน้าร้าน')
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold');
  s.getRange(HEAD_ROW + 1, need).setNote(
    'ติดป้ายให้สินค้าที่อยากดันขึ้นหน้าแรก เว้นว่างได้\n' +
    'เลือกได้: ' + PROD_TAGS.join(' · ') + '\n' +
    'ติดได้หลายป้าย คั่นด้วยเครื่องหมายจุลภาค เช่น  ใหม่, โปรโมชั่น\n' +
    'ป้าย "ขายดี" ติดเองได้ แต่ถึงไม่ติด ระบบก็จัดอันดับจากยอดขายจริงให้อยู่แล้ว');

  var last = s.getMaxRows();
  s.getRange(DATA_ROW, need, last - DATA_ROW + 1, 1).setFontColor(C_IN_FG);

  return had
    ? 'ฐานสินค้า มีคอลัมน์ ' + colLetter_(need) + ' ป้ายหน้าร้าน อยู่แล้ว'
    : 'เพิ่มคอลัมน์ ' + colLetter_(need) + ' ป้ายหน้าร้าน ให้ ฐานสินค้า แล้ว';
}


/**
 * บอกว่าสูตรของชีท สต๊อกคงเหลือ นับ "ประเภท" ไหนเข้าช่องไหน
 *
 * ทำไมต้องมี: ดรอปดาวน์ในชีท ตั้งค่า กับสูตรในชีท สต๊อกคงเหลือ เป็นคนละที่กัน
 * เลือกประเภทที่มีในดรอปดาวน์ได้ ไม่ได้แปลว่าสูตรจะนับให้
 * ของจริงที่เจอ 21 ก.ย. 69: นับสต๊อก SKU-134 ตั้งไว้ 2,500 แต่ชีทคิดออกมาเป็น −2
 * เพราะสูตรช่องรับเข้าไม่ได้นับคำว่า "ปรับเพิ่ม" ลงไปเท่าไรยอดก็ไม่ขึ้น
 *
 * ระบบเลือกคำที่สูตรนับให้เองแล้ว ฟังก์ชันนี้มีไว้ดูว่าเลือกอะไร และมีคำไหนตกหล่น
 */
function checkStockTypes() {
  requireStaff_();
  var out = [];
  var fx = stockTypeWords_();
  var lists = cfgLists_();
  var types = lists.recvType || [];

  var s = sheet_('stock');
  var f = s.getRange(DATA_ROW, 6, 1, 2).getFormulas()[0];

  out.push('สูตรของชีท ' + SH.stock.name + ' แถว ' + DATA_ROW);
  out.push('  ช่องรับเข้า (F) : ' + (f[0] || '(ไม่มีสูตร)'));
  out.push('  ช่องปรับลด (G) : ' + (f[1] || '(ไม่มีสูตร)'));
  out.push('');
  out.push('คำที่สูตรนับจริง');
  out.push('  เข้าช่องรับเข้า : ' + (fx.up.length ? fx.up.join(' · ') : '(อ่านไม่ออก)'));
  out.push('  เข้าช่องปรับลด : ' + (fx.down.length ? fx.down.join(' · ') : '(อ่านไม่ออก)'));
  out.push('');

  out.push('ประเภทในดรอปดาวน์ของชีท ' + SH.cfg.name + ' (' + types.length + ' ตัว)');
  var orphan = [];
  for (var i = 0; i < types.length; i++) {
    var t = String(types[i]);
    var inUp = fx.up.some(function (w) { return t.indexOf(w) > -1 || w.indexOf(t) > -1 });
    var inDn = fx.down.some(function (w) { return t.indexOf(w) > -1 || w.indexOf(t) > -1 });
    var where = inUp ? 'นับเข้า "รับเข้า"' : (inDn ? 'นับเข้า "ปรับลด"' : '⚠ ไม่มีสูตรไหนนับเลย');
    if (!inUp && !inDn) orphan.push(t);
    out.push('  ' + t + '  →  ' + where);
  }

  out.push('');
  var up = pickWord_(types, fx.up.concat(['ปรับเพิ่ม', 'รับเข้า', 'ซื้อ']));
  var dn = pickWord_(types, fx.down.concat(['ปรับลด']));
  out.push('ตอนนับสต๊อก ระบบจะใช้');
  out.push('  เพิ่มยอด : ' + (up || '⚠ ไม่มีคำที่ใช้ได้เลย'));
  out.push('  ลดยอด   : ' + (dn || '⚠ ไม่มีคำที่ใช้ได้เลย'));

  if (orphan.length) {
    out.push('');
    out.push('⚠ ประเภทที่ลงไปแล้วยอดไม่ขยับ: ' + orphan.join(' · '));
    out.push('  ลงประเภทพวกนี้ในชีท ' + SH.recv.name + ' ได้ แต่ ' + SH.stock.name +
      ' จะไม่นับให้ ยอดคงเหลือจึงไม่เปลี่ยน');
    out.push('  ถ้าตั้งใจให้นับ ต้องไปเติมคำนั้นในสูตรของชีท ' + SH.stock.name + ' เอง');
    out.push('  (ระบบไม่แก้สูตรให้ เพราะสูตรเป็นของเจ้าของร้าน เดาผิดคือยอดทั้งชีทเพี้ยน)');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
