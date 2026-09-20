/*
 * ชีทจำลองสำหรับทดสอบด้วย node
 *
 * ทำไมต้องมี: โค้ดฝั่งหลังบ้านมีจุดที่ผิดแล้วเงียบ — เขียนทับสูตร บันทึกครึ่งใบ เลขออเดอร์ซ้ำ
 * ทั้งหมดนี้เห็นได้ก็ต่อเมื่อได้ลองเขียนจริงแล้วอ่านกลับ ไฟล์นี้จึงจำลอง SpreadsheetApp
 * มากพอที่จะรัน Sheets.gs / Api.gs ได้ทั้งไฟล์ โดยไม่ต้องยิงขึ้น Google
 *
 * ช่องหนึ่งช่องเก็บเป็น { v: ค่าที่แสดง, f: สูตร }  — เลียนแบบชีทจริงที่ใส่สูตรรอไว้ทุกแถว
 * ทดสอบจึงจับได้ทันทีถ้าโค้ดเผลอเขียนทับช่องที่มี f อยู่
 */
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var HEAD_ROW = 5, DATA_ROW = 6;

function Sheet(name, cols, maxRows) {
  this.name = name;
  this.cols = cols;
  this.maxRows = maxRows;
  this.cells = {};
  this.overwrittenFormulas = [];   // หลักฐานว่ามีการเขียนทับสูตร
}
Sheet.prototype.key = function (r, c) { return r + ',' + c; };
Sheet.prototype.cell = function (r, c) {
  var k = this.key(r, c);
  if (!this.cells[k]) this.cells[k] = { v: '', f: null };
  return this.cells[k];
};
Sheet.prototype.setFormulaDown = function (col, fromRow, toRow, tag) {
  for (var r = fromRow; r <= toRow; r++) this.cell(r, col).f = tag || ('=F' + col);
};
Sheet.prototype.getName = function () { return this.name; };
Sheet.prototype.getMaxRows = function () { return this.maxRows; };
Sheet.prototype.getMaxColumns = function () { return this.cols; };
Sheet.prototype.getLastRow = function () {
  var last = 0;
  for (var k in this.cells) {
    var p = k.split(',');
    if (this.cells[k].v !== '' && this.cells[k].v !== null) last = Math.max(last, +p[0]);
  }
  return last;
};
Sheet.prototype.getLastColumn = function () { return this.cols; };
function colNum(letters) {
  var n = 0;
  for (var i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n;
}
Sheet.prototype.getRange = function (r, c, nr, nc) {
  if (typeof r === 'string') {
    var m = r.replace(/\$/g, '').toUpperCase().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!m) throw new Error('ชีทจำลองยังอ่าน A1 แบบนี้ไม่ได้: ' + r);
    var c1 = colNum(m[1]), r1 = +m[2];
    var c2 = m[3] ? colNum(m[3]) : c1, r2 = m[4] ? +m[4] : r1;
    return new Range(this, r1, c1, r2 - r1 + 1, c2 - c1 + 1);
  }
  return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
};
Sheet.prototype.setFrozenRows = function () { return this; };
Sheet.prototype.setColumnWidth = function () { return this; };
Sheet.prototype.hideColumns = function () { return this; };
Sheet.prototype.insertRowsAfter = function (after, n) { this.maxRows += n; return this; };
Sheet.prototype.insertColumnsAfter = function (after, n) { this.cols += n; return this; };

function Range(sheet, r, c, nr, nc) {
  this.s = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc;
}
/* นับช่องที่ถูกอ่านออกจากชีท — ของจริงคิดค่าตรงนี้เป็นเวลารอของคนกดปุ่ม
   ทุกช่องต้องเดินทางข้ามเน็ตจาก Google กลับมา ข้อสอบเรื่องความเร็วจึงวัดตัวนี้
   ไม่ใช่จับเวลา ซึ่งบนเครื่องทดสอบเร็วจนไม่เห็นความต่าง */
var CELLS_READ = { n: 0 };

Range.prototype.getValues = function () {
  CELLS_READ.n += this.nr * this.nc;
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var row = [];
    for (var j = 0; j < this.nc; j++) row.push(this.s.cell(this.r + i, this.c + j).v);
    out.push(row);
  }
  return out;
};
Range.prototype.getValue = function () { return this.getValues()[0][0]; };
/* ชีทจำลองไม่ได้คิดสูตรจริง ค่าที่เห็นจึงคือค่าที่เก็บไว้ตรง ๆ
   ข้อสอบที่ต้องการ error จึงวางสตริง "#REF!" ลงช่องเอง ซึ่งตรงกับที่ตาคนเห็นในชีทจริง */
Range.prototype.getDisplayValues = function () {
  return this.getValues().map(function (row) {
    return row.map(function (v) { return v === null || v === undefined ? '' : String(v) });
  });
};
Range.prototype.getA1Notation = function () {
  function L(n) { var s2 = ''; while (n > 0) { var m = (n - 1) % 26; s2 = String.fromCharCode(65 + m) + s2; n = (n - 1 - m) / 26; } return s2 }
  return L(this.c) + this.r;
};
Range.prototype.getFormula = function () { return this.getFormulas()[0][0]; };
Range.prototype.getDisplayValue = function () { return this.getDisplayValues()[0][0]; };
Range.prototype.getFormulas = function () {
  CELLS_READ.n += this.nr * this.nc;
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var row = [];
    for (var j = 0; j < this.nc; j++) row.push(this.s.cell(this.r + i, this.c + j).f || '');
    out.push(row);
  }
  return out;
};
Range.prototype.setValues = function (vals) {
  for (var i = 0; i < this.nr; i++) {
    for (var j = 0; j < this.nc; j++) {
      var cell = this.s.cell(this.r + i, this.c + j);
      // นี่คือจุดสำคัญของทั้งไฟล์: เขียนทับสูตรเมื่อไร ให้จดไว้เป็นหลักฐาน
      if (cell.f && this.r + i >= DATA_ROW) {
        this.s.overwrittenFormulas.push(this.s.name + ' R' + (this.r + i) + 'C' + (this.c + j));
      }
      cell.v = vals[i][j];
      cell.f = null;
    }
  }
  return this;
};
Range.prototype.setValue = function (v) {
  var vals = [];
  for (var i = 0; i < this.nr; i++) {
    var row = [];
    for (var j = 0; j < this.nc; j++) row.push(v);
    vals.push(row);
  }
  return this.setValues(vals);
};
Range.prototype.clearContent = function () {
  for (var i = 0; i < this.nr; i++) {
    for (var j = 0; j < this.nc; j++) {
      var cell = this.s.cell(this.r + i, this.c + j);
      if (cell.f && this.r + i >= DATA_ROW) {
        this.s.overwrittenFormulas.push('CLEARED ' + this.s.name + ' R' + (this.r + i) + 'C' + (this.c + j));
      }
      cell.v = '';
    }
  }
  return this;
};
Range.prototype.setFormula = function (f) {
  for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) this.s.cell(this.r + i, this.c + j).f = f;
  return this;
};
/* setFormulas = ใส่สูตรทีละหลายแถว ใช้ตอนเขียนสูตร VAT คืนทั้งคอลัมน์ */
Range.prototype.setFormulas = function (rows) {
  for (var i = 0; i < this.nr; i++) {
    for (var j = 0; j < this.nc; j++) this.s.cell(this.r + i, this.c + j).f = rows[i][j];
  }
  return this;
};
Range.prototype.copyTo = function (dst) {
  var f = this.s.cell(this.r, this.c).f;
  for (var i = 0; i < dst.nr; i++) for (var j = 0; j < dst.nc; j++) dst.s.cell(dst.r + i, dst.c + j).f = f;
  return this;
};
/* จำรูปแบบช่องไว้ตรวจได้ เบอร์โทรกับเลขภาษีต้องถูกตั้งเป็นข้อความก่อนเขียนเสมอ */
Range.prototype.setNumberFormat = function (f) {
  for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++)
    this.s.cell(this.r + i, this.c + j).fmt = f;
  return this;
};
['setBackground', 'setFontColor', 'setFontWeight', 'setFontSize', 'setVerticalAlignment',
  'setHorizontalAlignment', 'setWrap', 'setDataValidation', 'setNote'
].forEach(function (m) { Range.prototype[m] = function () { return this; }; });

/* ------------------------------------------------------------ สร้างชีทตัวอย่าง */

function build(opts) {
  opts = opts || {};
  var headLimit = opts.headLimit || 500;
  var itemLimit = opts.itemLimit || 1200;

  var sheets = {};
  function mk(name, cols, maxRows) { return (sheets[name] = new Sheet(name, cols, maxRows)); }

  /* ตั้งค่า */
  var cfg = mk('ตั้งค่า', 8, 28);
  cfg.cell(6, 2).v = 'AST Chem-Tooling';
  cfg.cell(7, 2).v = 'AST-26-';
  cfg.cell(8, 2).v = 0.07;
  cfg.cell(9, 2).v = 10;
  [['หน้าร้าน', 'Flash Express', 'ไม่รับ VAT', 'รอชำระ', 'ซื้อเข้า'],
   ['Shopee', 'Kerry Express', 'รับ VAT', 'ชำระแล้ว', 'ตรวจนับ'],
   ['เพจ Facebook', 'ไปรษณีย์ไทย', '', 'จัดของแล้ว', 'คืนจากลูกค้า'],
   ['', 'ส่งด่วน (ไรเดอร์)', '', 'ส่งแล้ว', 'ปรับเพิ่ม'],
   ['', 'รับเองที่ร้าน', '', 'ยกเลิก', 'ปรับลด']
  ].forEach(function (row, i) {
    row.forEach(function (v, j) { if (v) cfg.cell(7 + i, 4 + j).v = v; });
  });

  /* ฐานสินค้า */
  var prod = mk('ฐานสินค้า', 13, 152);
  var demo = opts.products || [
    { sku: 'SKU-141', name: 'End Mill Corn cut 2F 3.0*15*3.175*38L (1pcs)', price: 129, cost: 35 },
    { sku: 'SKU-143', name: 'End Mill Corn cut 2F 3.175*22*3.175*45L (1pcs)', price: 149, cost: 100 },
    { sku: 'CHEM-001', name: 'น้ำยาหล่อเย็น 20L', price: 1200, cost: 800 }
  ];
  [1, 11, 12, 13].forEach(function (c) { prod.setFormulaDown(c, DATA_ROW, 150, '=calc'); });
  demo.forEach(function (p, i) {
    var r = DATA_ROW + i;
    prod.cell(r, 2).v = p.sku; prod.cell(r, 3).v = 'TOOLING'; prod.cell(r, 4).v = p.name;
    prod.cell(r, 5).v = 1; prod.cell(r, 6).v = 'ชิ้น';
    prod.cell(r, 7).v = p.cost; prod.cell(r, 8).v = p.price;
    prod.cell(r, 9).v = (p.opening === undefined) ? 1000 : p.opening;
    prod.cell(r, 10).v = 10;
  });

  /* สต๊อกคงเหลือ — สูตรล้วน */
  var stock = mk('สต๊อกคงเหลือ', 15, 151);
  for (var sc = 1; sc <= 15; sc++) stock.setFormulaDown(sc, DATA_ROW, 150, '=calc');
  demo.forEach(function (p, i) {
    var r = DATA_ROW + i;
    stock.cell(r, 2).v = p.sku;
    stock.cell(r, 9).v = 1000;
  });

  /* ออเดอร์_หัวบิล — สูตรใส่รอไว้ทุกแถวถึง headLimit */
  /* กว้างเท่า SH.head.width จริง — ชีทของจริงถูก setup ขยายให้ครบแล้ว
   ชีทจำลองแคบกว่าเมื่อไร ช่องท้าย ๆ จะอ่านกลับมาเป็น 0 เงียบ ๆ
   แล้วข้อสอบจะผ่านทั้งที่เขียนลงไปแล้วอ่านไม่เจอ */
var head = mk('ออเดอร์_หัวบิล', 26, headLimit + 1);
  [10, 13, 14, 15, 16, 18, 21].forEach(function (c) {
    head.setFormulaDown(c, DATA_ROW, headLimit, '=headcalc');
  });

  /* ออเดอร์_รายการ */
  var item = mk('ออเดอร์_รายการ', 17, itemLimit + 1);
  [1, 3, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17].forEach(function (c) {
    item.setFormulaDown(c, DATA_ROW, itemLimit, '=itemcalc');
  });
  /* ช่องชื่อสินค้าเป็น VLOOKUP ของจริง ไม่ใช่ป้ายหลอก
     เพราะจุดที่พังคือ "ช่วงที่ VLOOKUP มองไปถึง" ไม่ใช่ตัวการคำนวณ
     ป้ายหลอกทำให้ข้อสอบมองไม่เห็นความพังนี้เลยแม้แต่ข้อเดียว */
  item.setFormulaDown(5, DATA_ROW, itemLimit,
    '=IF($D6="","",IFERROR(VLOOKUP($D6,\'ฐานสินค้า\'!$B$6:$D$' +
    (opts.nameLookupLast || 150) + ',3,FALSE),"ไม่พบ SKU"))');

  /* รับเข้า / Log */
  var recv = mk('รับเข้า', 13, 401);
  [1, 7, 10, 12].forEach(function (c) { recv.setFormulaDown(c, DATA_ROW, 400, '=calc'); });
  var log = mk('Log', 10, 305);
  log.setFormulaDown(1, DATA_ROW, 304, '=calc');

  /* ล็อตสินค้า / ตัดล็อต */
  var lot = mk('ล็อตสินค้า', 13, 1006);
  [1, 3, 8, 9, 10, 12, 13].forEach(function (c) { lot.setFormulaDown(c, DATA_ROW, 1005, '=lotcalc'); });
  var cut = mk('ตัดล็อต', 9, 3006);
  [1, 8, 9].forEach(function (c) { cut.setFormulaDown(c, DATA_ROW, 3005, '=cutcalc'); });

  (opts.lots || []).forEach(function (l, i) {
    var r = DATA_ROW + i;
    lot.cell(r, 2).v = l.sku;
    lot.cell(r, 4).v = l.lotNo;
    lot.cell(r, 5).v = l.exp ? new Date(l.exp + 'T00:00:00') : '';
    lot.cell(r, 6).v = l.recv ? new Date(l.recv + 'T00:00:00') : '';
    lot.cell(r, 7).v = l.qty;
  });

  /* เอกสาร — ทะเบียนใบที่ออกให้ลูกค้าไปแล้ว
     ใบพวกนี้อยู่ต่อแม้ออเดอร์จะถูกล้าง เลขออเดอร์จึงต้องเดินต่อจากที่นี่ด้วย */
  var doc = mk('เอกสาร', 21, 501);
  doc.setFormulaDown(1, DATA_ROW, 500, '=doccalc');

  /* ---- คิดสูตรที่ทดสอบต้องใช้จริง ---- */
  function recalc() {
    /* ราคามาตรฐานอ่านจากชีท ฐานสินค้า ไม่ใช่จากรายการตั้งต้น
       เพราะแอปเพิ่มสินค้าเข้าฐานเองได้ (ของซื้อมาขายไปที่พิมพ์ชื่อเอง)
       ถ้าอ่านจากรายการตั้งต้น สินค้าที่เพิ่งเพิ่มจะหายไปจากสูตรของชีทจำลอง */
    var std = {}, pname = {};
    /* ชื่อสินค้าอ่านได้แค่ในช่วงที่สูตรมองถึงจริง ๆ — อ่านช่วงนั้นจากตัวสูตรเอง
       เพื่อให้ fixProductLinks ที่ไปขยายช่วง มีผลกับชีทจำลองทันทีเหมือนของจริง */
    var nameLast = 150;
    var nameM = /ฐานสินค้า'?!\$?[A-Z]+\$?\d+:\$?[A-Z]+\$?(\d+)/
      .exec(String(item.cell(DATA_ROW, 5).f || ''));
    if (nameM) nameLast = Number(nameM[1]);
    for (var pr = DATA_ROW; pr <= 150; pr++) {
      var psku = prod.cell(pr, 2).v;
      if (psku) {
        std[psku] = Number(prod.cell(pr, 8).v || 0);
        if (pr <= nameLast) pname[psku] = String(prod.cell(pr, 4).v || '');
      }
    }

    var seen = {};
    for (var r = DATA_ROW; r <= itemLimit; r++) {
      var no = item.cell(r, 2).v;
      if (!no) { [10, 15, 16].forEach(function (c) { item.cell(r, c).v = ''; }); continue; }
      var sku = item.cell(r, 4).v;
      var qty = Number(item.cell(r, 7).v || 0);
      var pv = item.cell(r, 9).v;
      var unit = (pv === '' || pv === null || pv === undefined) ? Number(std[sku] || 0) : Number(pv);
      /* ช่องชื่อสินค้าเป็นสูตร VLOOKUP หารหัสในฐานสินค้า หาไม่เจอได้ "ไม่พบ SKU"
         ของจริงเป็นแบบนี้ และคำนั้นเคยไปพิมพ์บนใบกำกับภาษีที่ส่งลูกค้าจริง
         ชีทจำลองไม่เคยคิดช่องนี้เลย ข้อสอบจึงไม่มีทางจับได้ */
      item.cell(r, 5).v = (pname[sku] === undefined) ? 'ไม่พบ SKU' : pname[sku];
      item.cell(r, 8).v = Number(std[sku] || 0);
      item.cell(r, 10).v = Math.round(qty * unit * 100) / 100;
      seen[no] = (seen[no] || 0) + 1;
      item.cell(r, 15).v = seen[no];
      item.cell(r, 16).v = no + '|' + seen[no];
    }

    var cutBy = {};
    for (var cr = DATA_ROW; cr <= 3005; cr++) {
      var cno = cut.cell(cr, 2).v;
      if (!cno) continue;
      var key = cno + '|' + cut.cell(cr, 3).v;
      cut.cell(cr, 8).v = key;
      cut.cell(cr, 9).v = cut.cell(cr, 4).v + '|' + cut.cell(cr, 5).v;
      var lk = cut.cell(cr, 9).v;
      cutBy[lk] = (cutBy[lk] || 0) + Number(cut.cell(cr, 6).v || 0);
    }
    for (var lr = DATA_ROW; lr <= 1005; lr++) {
      var lsku = lot.cell(lr, 2).v;
      if (!lsku) { lot.cell(lr, 9).v = ''; continue; }
      var lkey = lsku + '|' + lot.cell(lr, 4).v;
      lot.cell(lr, 12).v = lkey;
      lot.cell(lr, 8).v = cutBy[lkey] || 0;
      lot.cell(lr, 9).v = Number(lot.cell(lr, 7).v || 0) - (cutBy[lkey] || 0);
    }

    /* สต๊อกคงเหลือ = ยกมา + รับเข้า − ปรับลด − ขายออก  (ตรงกับ STOCK_ROW6 ใน Setup.gs)
       ของเดิมชีทจำลองตั้งคงเหลือเป็นเลขนิ่ง 1000 ไว้เฉย ๆ ไม่เคยคิดจากเอกสารเลย
       ตัวที่เขียนแถว รับเข้า แล้วหวังให้ยอดขยับจึงทดสอบอะไรไม่ได้ — ผ่านทุกครั้ง
       เพราะไม่มีอะไรขยับตั้งแต่แรก ไม่ใช่เพราะโค้ดถูก */
    var gotBy = {}, adjBy = {}, soldBy = {};
    for (var vr = DATA_ROW; vr <= 400; vr++) {
      var vsku = recv.cell(vr, 6).v;
      if (!vsku) continue;
      var vq = Number(recv.cell(vr, 8).v || 0);
      var vt = String(recv.cell(vr, 4).v || '');
      if (vt.indexOf('ปรับลด') > -1) adjBy[vsku] = (adjBy[vsku] || 0) + vq;
      else gotBy[vsku] = (gotBy[vsku] || 0) + vq;
    }
    for (var xr = DATA_ROW; xr <= itemLimit; xr++) {
      var xsku = item.cell(xr, 4).v;
      if (!xsku || !item.cell(xr, 2).v) continue;
      soldBy[xsku] = (soldBy[xsku] || 0) + Number(item.cell(xr, 7).v || 0);
    }
    var openBy = {};
    for (var pr2 = DATA_ROW; pr2 <= 150; pr2++) {
      var psku2 = prod.cell(pr2, 2).v;
      if (psku2) openBy[psku2] = Number(prod.cell(pr2, 9).v || 0);
    }
    for (var sr = DATA_ROW; sr <= 150; sr++) {
      var ssku = stock.cell(sr, 2).v;
      if (!ssku) continue;
      var op = openBy[ssku] || 0, gt = gotBy[ssku] || 0;
      var ad = adjBy[ssku] || 0, sd = soldBy[ssku] || 0;
      stock.cell(sr, 5).v = op; stock.cell(sr, 6).v = gt;
      stock.cell(sr, 7).v = ad; stock.cell(sr, 8).v = sd;
      stock.cell(sr, 9).v = Math.round((op + gt - ad - sd) * 1000) / 1000;
    }

    for (var hr = DATA_ROW; hr <= headLimit; hr++) {
      var hno = head.cell(hr, 1).v;
      if (!hno) { head.cell(hr, 10).v = ''; head.cell(hr, 14).v = ''; continue; }
      var sum = 0;
      for (var ir = DATA_ROW; ir <= itemLimit; ir++) {
        if (item.cell(ir, 2).v === hno) sum += Number(item.cell(ir, 10).v || 0);
      }
      head.cell(hr, 10).v = Math.round(sum * 100) / 100;
      var disc = Number(head.cell(hr, 11).v || 0), ship = Number(head.cell(hr, 12).v || 0);
      /* ค่าส่งอยู่ในฐานภาษีด้วย — ต้องตรงกับ HEAD_VAT_FORMULA ใน Setup.gs เป๊ะ ๆ
         ซึ่งยึดตามใบที่ออกให้ลูกค้าไปแล้ว (ONIV26-00246 ฐาน 1,350 VAT 94.50 ฯลฯ)
         ชีทจำลองคิดคนละแบบกับชีทจริงเมื่อไร ข้อสอบจะรับรองยอดเงินที่ผิด */
      var vat = head.cell(hr, 9).v === 'รับ VAT'
        ? Math.round((sum - disc + ship) * 0.07 * 100) / 100 : 0;
      head.cell(hr, 13).v = vat;
      head.cell(hr, 14).v = Math.round((sum - disc + ship + vat) * 100) / 100;
    }
  }

  recalc();   // ชีทจริงมีค่าจากสูตรอยู่แล้วตั้งแต่ก่อนเปิดแอป ชีทจำลองก็ต้องเหมือนกัน
  return { sheets: sheets, recalc: recalc, demo: demo };
}

/* ------------------------------------------------- โหลด .gs เข้ามารันใน node */

/* ------------------------------------------------ ไดรฟ์จำลอง (ใช้ตอนส่งบัญชี)

   จำลองแค่เท่าที่ Acct.gs เรียกจริง: หาโฟลเดอร์จากไอดี · สร้างโฟลเดอร์ย่อย ·
   สร้างไฟล์ · ทิ้งไฟล์ลงถังขยะ  พอสำหรับพิสูจน์เรื่องที่พลาดแล้วเจ็บ คือ
   เขียนไฟล์ไม่ครบแล้วชีทดันจดว่าส่งแล้ว                                        */

function blob_(data, type, name, opts) {
  var b = {
    _data: data, _type: type, _name: name,
    getName: function () { return b._name; },
    setName: function (n) { b._name = n; return b; },
    getContentType: function () { return b._type; },
    setContentType: function (t) { b._type = t; return b; },
    getDataAsString: function () { return String(b._data); },
    /* ของจริงคืนไบต์เสมอ ไม่ว่าตอนสร้างจะส่งข้อความหรือไบต์เข้ามา
       ถ้าจำลองให้คืนข้อความ ตัว zip กับ base64 จะได้ผลคนละอย่างกับของจริง */
    getBytes: function () {
      return Buffer.isBuffer(b._data) ? b._data : Buffer.from(String(b._data), 'utf8');
    },
    getAs: function (want) {
      /* ตัวแปลงของ Google ไม่ได้ทำงานทุกกรณี — เปิดสวิตช์ให้ข้อสอบทดสอบทางที่แปลงไม่ได้ */
      if (opts && opts.noPdf) throw new Error('Converting from image/png to application/pdf is not supported.');
      return blob_(b._data, want, String(b._name).replace(/\.[^.]+$/, ''), opts);
    }
  };
  return b;
}

/* ข้อความจริงที่ Google ตอบมาเมื่อโปรเจกต์ยังไม่ได้รับอนุญาตให้ใช้ไดรฟ์
   คัดมาจากหน้าจอของเจ้าของร้านตอนกดแนบสลิปแล้วไม่ผ่าน */
var DRIVE_DENIED = 'สิทธิ์ที่ระบุไว้ไม่เพียงพอที่จะเรียกใช้ DriveApp.Folder.createFolder ' +
  'สิทธิ์ที่จำเป็นคือ https://www.googleapis.com/auth/drive';

function fakeDrive(opts) {
  var files = [], folders = {}, seq = { n: 0 };

  function mkFolder(name, parent) {
    var id = 'folder-' + (++seq.n);
    var f = {
      _id: id, _name: name, _parent: parent, _kids: [],
      getId: function () { return id; },
      getName: function () { return name; },
      getUrl: function () { return 'https://drive.google.com/drive/folders/' + id; },
      createFolder: function (n) {
        if (opts && opts.driveDenied) throw new Error(DRIVE_DENIED);
        var k = mkFolder(n, f); f._kids.push(k); return k;
      },
      getFoldersByName: function (n) {
        var hit = f._kids.filter(function (k) { return k._name === n; });
        var i = 0;
        return { hasNext: function () { return i < hit.length; }, next: function () { return hit[i++]; } };
      },
      createFile: function (b) {
        if (opts && opts.driveDenied) throw new Error(DRIVE_DENIED);
        if (opts && opts.driveFail && files.length >= opts.driveFail) {
          throw new Error('ไดรฟ์เต็ม (จำลอง)');
        }
        var fid = 'file-' + (++seq.n);
        var file = {
          _folder: f, _blob: b, _trashed: false,
          getId: function () { return fid; },
          getUrl: function () { return 'https://drive.google.com/file/d/' + fid + '/view'; },
          getName: function () { return b.getName(); },
          getBlob: function () { return b; },
          setTrashed: function (t) { file._trashed = !!t; return file; }
        };
        files.push(file);
        return file;
      }
    };
    folders[id] = f;
    return f;
  }

  var root = mkFolder('ไดรฟ์ของฉัน', null);
  return {
    files: files,
    live: function () { return files.filter(function (f) { return !f._trashed; }); },
    app: {
      getFolderById: function (id) {
        if (!folders[id]) throw new Error('ไม่พบโฟลเดอร์ ' + id);
        return folders[id];
      },
      createFolder: function (n) { return root.createFolder(n); },
      getFileById: function () {
        return { getParents: function () {
          var done = false;
          return { hasNext: function () { return !done; }, next: function () { done = true; return root; } };
        } };
      }
    }
  };
}

function load(fixture, opts) {
  opts = opts || {};
  var drive = fakeDrive(opts);
  /* opts.props = คุณสมบัติสคริปต์ที่ตั้งไว้ก่อนโหลดโค้ด
     จำเป็นเพราะ SHEET_ID อ่าน property ตั้งแต่ตอนไฟล์ถูกโหลด ถ้าตั้งทีหลังจะไม่ทัน */
  var props = {};
  for (var pk in (opts.props || {})) props[pk] = String(opts.props[pk]);
  var cache = {};
  var lockHeld = { v: false };
  function cacheStub_() {
    return {
      get: function (k) { return Object.prototype.hasOwnProperty.call(cache, k) ? cache[k] : null; },
      put: function (k, v) { cache[k] = String(v); }
    };
  }
  var ctx = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number,
    Object: Object, Array: Array, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat,
    SpreadsheetApp: {
      /* วางแบบเฉพาะสูตร ใช้ตอนซ่อมชีทที่มีคอลัมน์กรอกปนกับคอลัมน์สูตร */
      CopyPasteType: { PASTE_FORMULA: 'PASTE_FORMULA', PASTE_NORMAL: 'PASTE_NORMAL' },
      openById: function () {
        // opts.canOpen === false = บัญชีนี้ไม่มีสิทธิ์เปิดชีท Google โยน error แบบนี้
        if (opts.canOpen === false) throw new Error('You do not have permission to access the requested document.');
        return {
          getName: function () { return 'AST_ระบบออเดอร์และสต๊อก3008'; },
          getSpreadsheetTimeZone: function () { return fixture.tz || opts.tz || 'Asia/Bangkok'; },
          setSpreadsheetTimeZone: function (t) { fixture.tz = t; },
          getUrl: function () { return 'https://docs.google.com/spreadsheets/d/FAKEID/edit'; },
          getSheetByName: function (n) { return fixture.sheets[n] || null; },
          /* ไล่ดูทุกแท็บ — โค้ดจริงใช้ตอนชื่อชีทไม่ตรงเป๊ะ (ช่องว่างหัวท้าย/ตัวพิมพ์) */
          getSheets: function () {
            var out = [];
            for (var n in fixture.sheets) out.push(fixture.sheets[n]);
            return out;
          },
          insertSheet: function (n) { return (fixture.sheets[n] = new Sheet(n, 13, 1006)); }
        };
      },
      flush: function () { fixture.recalc(); },
      newDataValidation: function () {
        var b = { requireValueInRange: function () { return b; }, requireValueInList: function () { return b; }, setAllowInvalid: function () { return b; }, build: function () { return {}; } };
        return b;
      }
    },
    Session: {
      getActiveUser: function () { return { getEmail: function () { return opts.email === undefined ? 'somchai@chem-inno-tech.com' : opts.email; } }; },
      /* บัญชีที่รันสคริปต์ ใช้บอกว่าต้องเอาไฟล์ไปแชร์ให้อีเมลไหนตอนเปิดชีทไม่ได้ */
      getEffectiveUser: function () { return { getEmail: function () { return opts.owner === undefined ? 'citisales01@chem-inno-tech.com' : opts.owner; } }; },
      /* เขตเวลาของสคริปต์ ตั้งไว้ใน appsscript.json เป็น Asia/Bangkok */
      getScriptTimeZone: function () { return 'Asia/Bangkok'; }
    },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
          setProperty: function (k, v) { props[k] = String(v); },
          deleteProperty: function (k) { delete props[k]; }
        };
      }
    },
    /* พอสร้างวันที่ตามเขตเวลาของสเปรดชีต ต้องมีตัวแปลงให้เรียกเหมือนของจริง */
    Utilities: {
      /* ของจริงใช้ตัวสุ่มของ Java ซึ่งเดาไม่ได้ ตัวจำลองใช้ crypto ของ node
         ไม่ใช้ Math.random เพราะข้อสอบมีข้อที่ดูว่ากุญแจซ้ำกันไหม
         ถ้าตัวจำลองสุ่มอ่อนกว่าของจริง ข้อสอบจะจับปัญหาที่ไม่มีจริง */
      getUuid: function () { return require('crypto').randomUUID(); },
      parseDate: function (txt, tz, fmt) {
        var m = String(txt).match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
        if (!m) throw new Error('parseDate: รูปแบบไม่ตรง ' + txt);
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
          Number(m[4]), Number(m[5]), Number(m[6]));
      },
      /* รองรับเฉพาะรูปแบบที่โค้ดของเราใช้จริง ไม่ทำตัวแปลงครบทุกแบบของ Google */
      formatDate: function (d, tz, fmt) {
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        if (fmt === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
        if (fmt === 'yyyy-MM-dd') {
          return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
        }
        if (fmt === 'yyyy-MM-dd HH:mm') {
          return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }
        if (fmt === 'yyyyMMdd-HHmmss') {
          return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' +
            p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
        }
        if (fmt === 'd/M/yyyy HH:mm') {
          return d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear() +
            ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
        }
        throw new Error('formatDate: ยังไม่ได้ทำรูปแบบ ' + fmt);
      },
      base64Decode: function (b64) { return Buffer.from(String(b64), 'base64'); },
      base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); },
      /* zip จริง แบบไม่บีบอัด (store) — พอให้ไฟล์ .xlsx ที่ออกมาเปิดได้จริง
         ถ้าจำลองแบบขอไปที ข้อสอบจะผ่านทั้งที่ไฟล์ที่ส่งให้บัญชีเปิดไม่ขึ้น */
      zip: function (blobs) {
        var zlib = require('zlib');
        var locals = [], central = [], off = 0;
        blobs.forEach(function (b) {
          var name = Buffer.from(String(b.getName()), 'utf8');
          var data = Buffer.from(b.getBytes());
          var crc = zlib.crc32(data) >>> 0;
          var lh = Buffer.alloc(30);
          lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6);
          lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
          lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18);
          lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
          lh.writeUInt16LE(0, 28);
          locals.push(lh, name, data);
          var ch = Buffer.alloc(46);
          ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
          ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
          ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20);
          ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
          ch.writeUInt32LE(off, 42);
          central.push(ch, name);
          off += lh.length + name.length + data.length;
        });
        var body = Buffer.concat(locals);
        var dir = Buffer.concat(central);
        var end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(blobs.length, 8); end.writeUInt16LE(blobs.length, 10);
        end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(body.length, 16);
        return blob_(Buffer.concat([body, dir, end]), 'application/zip', 'archive.zip', opts);
      },
      newBlob: function (data, type, name) { return blob_(data, type, name, opts); }
    },
    DriveApp: drive.app,
    LockService: {
      getScriptLock: function () {
        return {
          tryLock: function () { if (lockHeld.v) return false; lockHeld.v = true; return true; },
          releaseLock: function () { lockHeld.v = false; }
        };
      }
    },
    Logger: { log: function () {} },
    CacheService: {
      getScriptCache: cacheStub_,
      getUserCache: cacheStub_
    },
    HtmlService: {
      createHtmlOutput: function (h) { return { setTitle: function () { return { html: h }; }, html: h }; },
      createTemplateFromFile: function () { return { evaluate: function () { return { setTitle: function () { return this; }, addMetaTag: function () { return this; } }; } }; },
      createHtmlOutputFromFile: function () { return { getContent: function () { return ''; } }; }
    }
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  var dir = path.join(__dirname, '..', 'apps-script');
  /* Doc.gs ต้องโหลดด้วย ไม่งั้น issueDoc/voidDoc เรียก docType_ ไม่เจอ
     ทะเบียนเอกสารเป็นของที่แก้ทีหลังไม่ได้ จึงต้องมีข้อสอบคุมเหมือนส่วนอื่น */
  var files = ['Sheets.gs', 'Fefo.gs', 'Doc.gs', 'Setup.gs', 'Api.gs', 'Acct.gs', 'Pay.gs', 'Shop.gs',
    'Pub.gs'];
  /* BUNDLE=1 = สอบไฟล์ที่รวมแล้วแทนไฟล์ต้นฉบับ
     ไฟล์ที่เอาไปวางใน Apps Script จริงคือไฟล์ที่รวมแล้ว ถ้าตัวรวมทำอะไรพัง
     ข้อสอบที่อ่านแต่ต้นฉบับจะผ่านหมดโดยที่ของจริงใช้ไม่ได้ */
  if (process.env.BUNDLE) {
    dir = path.join(__dirname, '..', 'out', 'bundle');
    files = ['Code.gs'];
  }
  files.forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  });
  ctx.__props = props;
  ctx.__drive = drive;
  /* ปิดสิทธิ์ไดรฟ์กลางคัน — ของจริงก็เป็นแบบนี้ คือคีย์ออเดอร์ได้ตามปกติ
     แล้วมาพังตอนแตะไฟล์ ไม่ได้พังตั้งแต่เปิดแอป */
  fixture.__denyDrive = function () { opts.driveDenied = true; };
  return ctx;
}

module.exports = { build: build, load: load, DATA_ROW: DATA_ROW, HEAD_ROW: HEAD_ROW,
  CELLS_READ: CELLS_READ };
