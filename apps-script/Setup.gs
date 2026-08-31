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
  if (s.getMaxColumns() < 21) s.insertColumnsAfter(s.getMaxColumns(), 21 - s.getMaxColumns());

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
    'หมายเหตุ', 'เหตุผลที่ยกเลิก', 'รายการในใบ\n(ระบบใช้พิมพ์ซ้ำ ห้ามแก้)'];
  s.getRange(HEAD_ROW, 1, 1, head.length).setValues([head])
    .setBackground(C_HEAD_BG).setFontColor(C_HEAD_FG).setFontWeight('bold')
    .setVerticalAlignment('middle').setWrap(true);

  var n = DOC_LAST - DATA_ROW + 1;
  fillFormula_(s, 1, n, '=IF($B6="","",COUNTA($B$6:$B6))');

  var inCols = [];
  for (var c = 2; c <= 21; c++) inCols.push(c);
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

  return (fresh ? 'สร้างชีท ' : 'อัปเดตชีท ') + name + ' (รองรับ ' + n + ' ใบ ราวปีครึ่งที่ 20 ใบ/วัน)';
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
function repairStockSheet() {
  var s = sheet_('stock');
  var cols = s.getLastColumn();
  var tmpl = s.getRange(DATA_ROW, 1, 1, cols);
  var f = tmpl.getFormulas()[0];

  if (f.join('').indexOf('#REF') > -1 || f[1].indexOf(SH.prod.name) < 0) {
    throw new Error('แถว 6 ของชีท ' + SH.stock.name + ' ก็เสียด้วย จึงไม่มีต้นแบบให้ซ่อม ' +
      '— ต้องแก้แถว 6 ด้วยมือก่อน');
  }

  var before = countRef_(s, cols);
  if (!before) return 'ชีท ' + SH.stock.name + ': สูตรปกติดีอยู่แล้ว ไม่ต้องซ่อม';

  tmpl.copyTo(s.getRange(DATA_ROW + 1, 1, STOCK_LAST - DATA_ROW, cols));
  SpreadsheetApp.flush();
  var after = countRef_(s, cols);

  var extra = repairSummaryRange_();
  return 'ชีท ' + SH.stock.name + ': ซ่อมสูตร #REF! ' + before + ' ช่อง เหลือ ' + after + extra;
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
    ['ใบเสนอราคายืนราคากี่วัน', 7]
  ];
  for (var i = 0; i < rows.length; i++) {
    var r = DATA_ROW + i;
    s.getRange(r, 1).setValue(rows[i][0]);
    // เบอร์โทรต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
    /* ช่องที่ขึ้นต้นด้วยศูนย์ต้องเป็นช่องข้อความ ไม่งั้นชีทแปลงเป็นตัวเลขแล้วศูนย์นำหน้าหาย
       เลขผู้เสียภาษี 0105558055790 จะกลายเป็น 105558055790 แล้วใบกำกับภาษีใช้ไม่ได้ */
    if (/เบอร์โทร|มือถือ|แฟกซ์|ผู้เสียภาษี/.test(rows[i][0])) s.getRange(r, 2).setNumberFormat('@');
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
