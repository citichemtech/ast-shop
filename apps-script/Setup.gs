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
var STOCK_LAST = 150;  // ขอบล่างของชีท สต๊อกคงเหลือ ที่ใช้ในสูตรตรวจยอด

var C_HEAD_BG = '#1f3864';
var C_HEAD_FG = '#ffffff';
var C_CALC_BG = '#f2f2f2';
var C_IN_FG = '#0000ff';
var C_SUB_FG = '#555555';

function setup() {
  var ss = ss_();
  var made = [];
  made.push(setupLotSheet_(ss));
  made.push(setupCutSheet_(ss));
  made.push(setupDocSheet_(ss));
  made.push(setupAppSheet_(ss));
  made.push(setupItemLotColumn_(ss));
  // ซ่อมให้อัตโนมัติ แต่ห้ามล้มทั้ง setup ถ้าซ่อมไม่ได้ — ส่วนอื่นติดตั้งไปแล้ว
  try { made.push(repairStockSheet()); }
  catch (e) { made.push('ซ่อมชีทสต๊อกไม่สำเร็จ: ' + e.message); }
  SpreadsheetApp.flush();
  var msg = 'ติดตั้งเรียบร้อย\n\n' + made.join('\n');
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------- ล็อตสินค้า */

function setupLotSheet_(ss) {
  var name = SH.lot.name;
  var s = ss.getSheetByName(name);
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
  s.getRange('I3').setFormula(
    '=SUMPRODUCT(--(COUNTIF($B$6:$B$' + LOT_LAST + ",'สต๊อกคงเหลือ'!$B$6:$B$" + STOCK_LAST + ')>0),' +
    "--(ROUND(SUMIF($B$6:$B$" + LOT_LAST + ",'สต๊อกคงเหลือ'!$B$6:$B$" + STOCK_LAST +
    ',$I$6:$I$' + LOT_LAST + "),3)<>ROUND('สต๊อกคงเหลือ'!$I$6:$I$" + STOCK_LAST + ',3)))'
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
  var L = LOT_LAST, C = CUT_LAST;

  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');
  fillFormula_(s, 3, n,
    '=IF($B6="","",IFERROR(VLOOKUP($B6,\'ฐานสินค้า\'!$B$6:$D$200,3,FALSE),"ไม่พบ SKU"))');
  fillFormula_(s, 8, n,
    '=IF($L6="","",SUMIFS(\'' + SH.cut.name + '\'!$F$6:$F$' + C + ',\'' + SH.cut.name + '\'!$I$6:$I$' + C + ',$L6))');
  fillFormula_(s, 9, n, '=IF($B6="","",IFERROR($G6-$H6,""))');
  fillFormula_(s, 10, n,
    '=IF($B6="","",IF(NOT(ISNUMBER($I6)),"",IF($I6<=0,"หมดแล้ว",' +
    'IF($E6="","ไม่ระบุวันหมดอายุ",IF($E6<TODAY(),"หมดอายุแล้ว",' +
    'IF($E6<=TODAY()+60,"ใกล้หมดอายุ","ปกติ"))))))');
  fillFormula_(s, 12, n, '=IF(OR($B6="",$D6=""),"",$B6&"|"&$D6)');
  fillFormula_(s, 13, n,
    '=IF($B6="","",IF($D6="","ยังไม่ใส่เลขล็อต",' +
    'IF(COUNTIF($L$6:$L$' + L + ',$L6)>1,"เลขล็อตซ้ำ",' +
    'IF(NOT(ISNUMBER($G6)),"ยังไม่ใส่จำนวนรับ",' +
    'IF($G6<=0,"จำนวนรับต้องมากกว่า 0",' +
    'IF($H6>$G6,"ตัดออกเกินจำนวนที่รับเข้า",' +
    'IF($C6="ไม่พบ SKU","SKU ไม่มีในฐานสินค้า","OK")))))))');

  paintCols_(s, n, [2, 4, 5, 6, 7, 11], [1, 3, 8, 9, 10, 12, 13]);

  s.getRange(DATA_ROW, 5, n, 2).setNumberFormat('dd/mm/yyyy');
  s.getRange(DATA_ROW, 7, n, 3).setNumberFormat('#,##0');

  var skuRange = ss.getSheetByName(SH.prod.name).getRange('B6:B200');
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
  var s = ss.getSheetByName(name);
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
function setupDocSheet_(ss) {
  var name = SH.doc.name;
  var s = ss.getSheetByName(name);
  var fresh = !s;
  if (fresh) s = ss.insertSheet(name);

  if (s.getMaxRows() < DOC_LAST) s.insertRowsAfter(s.getMaxRows(), DOC_LAST - s.getMaxRows());
  if (s.getMaxColumns() < 23) s.insertColumnsAfter(s.getMaxColumns(), 23 - s.getMaxColumns());

  s.getRange('A2').setValue('ทะเบียนเอกสารขาย — ระบบเขียนให้เอง')
    .setFontWeight('bold').setFontSize(12);
  s.getRange('A3').setValue(
    'ออกใบจากหน้าออเดอร์ในแอป แล้วใบจะมาโผล่ที่นี่  |  ห้ามแก้เลขที่เอกสารด้วยมือ ' +
    'เลขต้องเรียงไม่ซ้ำไม่ข้าม  |  ยกเลิกใบให้กรอกเหตุผลช่อง "เหตุผลที่ยกเลิก" ไม่ใช่ลบแถวทิ้ง'
  ).setFontColor(C_SUB_FG);

  var head = ['ลำดับ', 'เลขที่เอกสาร', 'ชนิดเอกสาร', 'วันที่', 'เลขที่ออเดอร์',
    'ชื่อลูกค้า', 'เลขประจำตัว\nผู้เสียภาษี', 'สำนักงานใหญ่\n/ สาขา', 'ที่อยู่ตามใบกำกับภาษี',
    'โทรศัพท์', 'อีเมล', 'รหัสลูกค้า', 'เลขที่ PO', 'เงื่อนไขชำระเงิน',
    'มูลค่าสินค้า\n(ก่อน VAT)', 'ภาษีมูลค่าเพิ่ม', 'รวมทั้งสิ้น', 'ผู้ออกเอกสาร',
    'หมายเหตุ', 'เหตุผลที่ยกเลิก', 'รายการในใบ\n(ระบบใช้พิมพ์ซ้ำ ห้ามแก้)',
    'ลายเซ็นผู้รับของ\n(ลูกค้าเซ็นในแอป ห้ามแก้)',
    'ส่งให้ลูกค้าแล้วเมื่อ\n(ว่าง = ยังแก้ใบได้)'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = DOC_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 23; c++) inCols.push(c);
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
  var WORD = 'ล้างออเดอร์เก่า';
  if (String(confirm || '').trim() !== WORD) {
    throw new Error('เพื่อกันกดพลาด ต้องสั่งแบบนี้:  clearOldOrders(\'' + WORD + '\')' +
      '  — ล้างแล้วกู้คืนไม่ได้ อยากดูก่อนว่าจะหายกี่ใบให้สั่ง previewClearOldOrders() ก่อน');
  }
  return runClearOld_(true);
}

/** ดูก่อนว่าจะหายใบไหนบ้าง โดยยังไม่ลบอะไรเลย */
function previewClearOldOrders() {
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
    if (ss_().getSheetByName(SH.doc.name)) {
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

/** นับช่องที่ควรเป็นสูตรตาม CALC แต่กลายเป็นค่านิ่ง พร้อมบอกแถวต้นแบบที่ยังดี */
function scanCalc_(key) {
  var cfg = SH[key];
  var cols = cfg.CALC || [];
  var out = { flat: 0, rows: 0, good: 0, cols: cols };
  /* ชีทที่ยังไม่มีในไฟล์ให้ข้ามไป ไม่ใช่ล้มทั้งการซ่อม ชีทอื่นจะได้ซ่อมต่อได้ */
  if (!cols.length || !ss_().getSheetByName(cfg.name)) { out.cols = []; return out; }
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
      var isF = c <= out.f[i].length && String(out.f[i][c - 1] || '').charAt(0) === '=';
      if (!isF) { out.flat++; whole = false; }
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
    if (!before.flat) { out.push('  ' + cfg.name + ': ปกติดีอยู่แล้ว'); continue; }
    if (!before.good) {
      out.push('  ' + cfg.name + ': เสีย ' + before.flat + ' ช่อง แต่ไม่มีแถวไหนสูตรครบเลย ' +
        'จึงไม่มีต้นแบบให้คัดลอก — ต้องซ่อมด้วยมือ');
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
          bad = !(c <= row.length && String(row[c - 1] || '').charAt(0) === '=');
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
    out.push('  ' + cfg.name + ': ซ่อม ' + fixedCells + ' ช่อง (เหลือ ' + after.flat + ') ' +
      'ใช้แถว ' + before.good + ' เป็นต้นแบบ');
  }

  var msg = 'ซ่อมสูตรของชีทออเดอร์\n' + (out.length ? out.join('\n') : '  ไม่มีอะไรต้องซ่อม') +
    '\n\nรวมซ่อม ' + total + ' ช่อง' +
    '\nคอลัมน์ที่คนกรอกเองไม่ถูกแตะเลย คัดลอกเฉพาะช่องสูตรอย่างเดียว';
  Logger.log(msg);
  return msg;
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

function repairStockSheet() {
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
    s.getRange(DATA_ROW, col).setFormula(STOCK_ROW6[col]);
    fixed.push(s.getRange(DATA_ROW, col).getA1Notation());
  }
  if (fixed.length) {
    SpreadsheetApp.flush();
    f = tmpl.getFormulas()[0];
  }

  var before = countRef_(s, cols);
  var skew = countSkew_(s);
  var flat = countFlat_(s, cols);
  if (!before && !skew && !flat && !fixed.length) {
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
    '  ซ่อมช่องที่กลายเป็นเลขนิ่ง ' + flat + ' ช่อง (เหลือ ' + flatAfter + ')' + extra;
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
  var s = ss_().getSheetByName('สรุปยอดขาย');
  if (!s) return '';
  var cell = s.getRange('B23');
  var f = String(cell.getFormula() || '');
  var m = f.match(/COUNTA\('ฐานสินค้า'!\$B\$6:\$B\$(\d+)\)/);
  if (!m || Number(m[1]) >= STOCK_LAST) return '';
  cell.setFormula("=COUNTA('ฐานสินค้า'!$B$6:$B$" + STOCK_LAST + ')');
  return ' · ขยายช่วงนับ SKU ในชีท สรุปยอดขาย จากแถว ' + m[1] + ' เป็น ' + STOCK_LAST;
}

/* -------------------------------------------------------------- ตั้งค่าแอป */

/**
 * ค่าที่ใบปะหน้าพัสดุต้องใช้ ชีทเดิมไม่มี — สร้างเป็นชีทของแอปเอง
 * ค่าที่มีอยู่แล้วจะไม่ถูกเขียนทับ สั่ง setup ซ้ำได้
 */
function setupAppSheet_(ss) {
  var name = SH.app.name;
  var s = ss.getSheetByName(name);
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
    ['ลายเซ็นผู้มีอำนาจลงนาม', '']
  ];
  for (var i = 0; i < rows.length; i++) {
    var r = DATA_ROW + i;
    s.getRange(r, 1).setValue(rows[i][0]);
    // เบอร์โทรต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
    /* ช่องที่ขึ้นต้นด้วยศูนย์ต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
       เลขผู้เสียภาษี 0105558055790 จะกลายเป็น 105558055790 แล้วใบกำกับภาษีใช้ไม่ได้ */
    if (/เบอร์โทร|มือถือ|แฟกซ์|ผู้เสียภาษี|ลายเซ็น/.test(rows[i][0])) s.getRange(r, 2).setNumberFormat('@');
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

/* ------------------------------------ คอลัมน์ "ล็อตที่ตัด" ที่ ออเดอร์_รายการ */

function setupItemLotColumn_(ss) {
  var s = ss.getSheetByName(SH.item.name);
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

  var C = CUT_LAST;
  fillFormula_(s, col, n,
    '=IF($P6="","",IFERROR(TEXTJOIN(", ",TRUE,ARRAYFORMULA(' +
    'IF(\'' + SH.cut.name + '\'!$H$6:$H$' + C + '=$P6,' +
    '\'' + SH.cut.name + '\'!$E$6:$E$' + C + '&" x"&TEXT(\'' + SH.cut.name + '\'!$F$6:$F$' + C + ',"0"),""))),""))');

  s.getRange(DATA_ROW, col, n, 1).setBackground(C_CALC_BG);
  s.setColumnWidth(col, 200);

  return 'เพิ่มคอลัมน์ Q "ล็อตที่ตัด" ที่ชีท ' + SH.item.name + ' ถึงแถว ' + last;
}

/* ------------------------------------------------------------------- helpers */

/** ใส่สูตรเดียวกันทั้งคอลัมน์ ตั้งแต่แถว 6 ลงไป n แถว (อ้างอิงสัมพัทธ์ขยับตามแถวเอง) */
function fillFormula_(s, col, n, formula) {
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
