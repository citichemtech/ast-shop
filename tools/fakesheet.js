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
Range.prototype.getValues = function () {
  var out = [];
  for (var i = 0; i < this.nr; i++) {
    var row = [];
    for (var j = 0; j < this.nc; j++) row.push(this.s.cell(this.r + i, this.c + j).v);
    out.push(row);
  }
  return out;
};
Range.prototype.getValue = function () { return this.getValues()[0][0]; };
Range.prototype.getFormulas = function () {
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
Range.prototype.copyTo = function (dst) {
  var f = this.s.cell(this.r, this.c).f;
  for (var i = 0; i < dst.nr; i++) for (var j = 0; j < dst.nc; j++) dst.s.cell(dst.r + i, dst.c + j).f = f;
  return this;
};
['setBackground', 'setFontColor', 'setFontWeight', 'setFontSize', 'setVerticalAlignment',
  'setHorizontalAlignment', 'setWrap', 'setNumberFormat', 'setDataValidation'
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
    prod.cell(r, 9).v = 1000; prod.cell(r, 10).v = 10;
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
  var head = mk('ออเดอร์_หัวบิล', 21, headLimit + 1);
  [10, 13, 14, 15, 16, 18, 21].forEach(function (c) {
    head.setFormulaDown(c, DATA_ROW, headLimit, '=headcalc');
  });

  /* ออเดอร์_รายการ */
  var item = mk('ออเดอร์_รายการ', 17, itemLimit + 1);
  [1, 3, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16, 17].forEach(function (c) {
    item.setFormulaDown(c, DATA_ROW, itemLimit, '=itemcalc');
  });

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

  /* ---- คิดสูตรที่ทดสอบต้องใช้จริง ---- */
  function recalc() {
    var std = {};
    demo.forEach(function (p) { std[p.sku] = p.price; });

    var seen = {};
    for (var r = DATA_ROW; r <= itemLimit; r++) {
      var no = item.cell(r, 2).v;
      if (!no) { [10, 15, 16].forEach(function (c) { item.cell(r, c).v = ''; }); continue; }
      var sku = item.cell(r, 4).v;
      var qty = Number(item.cell(r, 7).v || 0);
      var pv = item.cell(r, 9).v;
      var unit = (pv === '' || pv === null || pv === undefined) ? Number(std[sku] || 0) : Number(pv);
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

    for (var hr = DATA_ROW; hr <= headLimit; hr++) {
      var hno = head.cell(hr, 1).v;
      if (!hno) { head.cell(hr, 10).v = ''; head.cell(hr, 14).v = ''; continue; }
      var sum = 0;
      for (var ir = DATA_ROW; ir <= itemLimit; ir++) {
        if (item.cell(ir, 2).v === hno) sum += Number(item.cell(ir, 10).v || 0);
      }
      head.cell(hr, 10).v = Math.round(sum * 100) / 100;
      var disc = Number(head.cell(hr, 11).v || 0), ship = Number(head.cell(hr, 12).v || 0);
      var vat = head.cell(hr, 9).v === 'รับ VAT' ? Math.round((sum - disc) * 0.07 * 100) / 100 : 0;
      head.cell(hr, 13).v = vat;
      head.cell(hr, 14).v = Math.round((sum - disc + ship + vat) * 100) / 100;
    }
  }

  recalc();   // ชีทจริงมีค่าจากสูตรอยู่แล้วตั้งแต่ก่อนเปิดแอป ชีทจำลองก็ต้องเหมือนกัน
  return { sheets: sheets, recalc: recalc, demo: demo };
}

/* ------------------------------------------------- โหลด .gs เข้ามารันใน node */

function load(fixture, opts) {
  opts = opts || {};
  var props = {};
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
      openById: function () {
        // opts.canOpen === false = บัญชีนี้ไม่มีสิทธิ์เปิดชีท Google โยน error แบบนี้
        if (opts.canOpen === false) throw new Error('You do not have permission to access the requested document.');
        return {
          getName: function () { return 'AST_ระบบออเดอร์และสต๊อก3008'; },
          getSheetByName: function (n) { return fixture.sheets[n] || null; },
          insertSheet: function (n) { return (fixture.sheets[n] = new Sheet(n, 13, 1006)); }
        };
      },
      flush: function () { fixture.recalc(); },
      newDataValidation: function () {
        var b = { requireValueInRange: function () { return b; }, setAllowInvalid: function () { return b; }, build: function () { return {}; } };
        return b;
      }
    },
    Session: { getActiveUser: function () { return { getEmail: function () { return opts.email === undefined ? 'somchai@chem-inno-tech.com' : opts.email; } }; } },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (k) { return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null; },
          setProperty: function (k, v) { props[k] = String(v); }
        };
      }
    },
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
  ['Sheets.gs', 'Fefo.gs', 'Setup.gs', 'Api.gs'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  });
  ctx.__props = props;
  return ctx;
}

module.exports = { build: build, load: load, DATA_ROW: DATA_ROW, HEAD_ROW: HEAD_ROW };
