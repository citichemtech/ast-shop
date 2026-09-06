/*
 * ทดสอบตัวสำรองชีทอัตโนมัติ — รัน Backup.gs จริงบน Drive จำลอง
 *
 *   node tools/t_backup.js
 *
 * สิ่งที่ต้องพิสูจน์ให้ได้ ไม่ใช่แค่ "ก๊อปไฟล์แล้วไม่ error"
 *   - ไฟล์ตัวจริงต้องไม่ถูกแตะไม่ว่ากรณีใด
 *   - ไฟล์ของคนอื่นที่บังเอิญอยู่ในโฟลเดอร์เดียวกันต้องไม่ถูกลบ
 *   - ก๊อปล้ม ต้องไม่ไปลบของเก่าทิ้ง (ไม่งั้นของสำรองจะหายไปวันละใบ)
 *   - ต่อให้เก่าหมดทุกใบ ก็ต้องเหลือของสำรองไว้จำนวนหนึ่งเสมอ
 */
'use strict';
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var fails = 0;
function eq(label, got, want) {
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? '  ok   ' : '  FAIL ') + label +
    '  ได้ ' + JSON.stringify(got) + (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}
function truthy(label, got) {
  if (!got) fails++;
  console.log((got ? '  ok   ' : '  FAIL ') + label + '  ได้ ' + JSON.stringify(got));
}

var REAL_ID = '1AcV0rYN6Mb_T3Z9e4mPaP6LsT1sP34Lop1l-22sSWCQ';

/* ------------------------------------------------------------- ไดรฟ์จำลอง */

function makeDrive(opts) {
  opts = opts || {};
  var files = {};      /* id -> {id, name, parent, trashed} */
  var folders = {};    /* name -> {name, id} */
  var seq = 0;

  function File(id, name, parent) {
    this.id = id; this.name = name; this.parent = parent; this.trashed = false;
    this.copies = 0;
  }
  File.prototype.getId = function () { return this.id };
  File.prototype.getName = function () { return this.name };
  File.prototype.getUrl = function () { return 'https://drive.fake/' + this.id };
  File.prototype.setTrashed = function (v) { this.trashed = !!v; return this };
  File.prototype.makeCopy = function (name, folder) {
    if (opts.copyFails) throw new Error('ก๊อปไฟล์ไม่ได้ (จำลอง)');
    var f = new File('copy-' + (++seq), name, folder.getName());
    files[f.id] = f;
    return f;
  };

  function Folder(name) { this.name = name }
  Folder.prototype.getName = function () { return this.name };
  Folder.prototype.getFiles = function () {
    var list = [], nm = this.name;
    for (var k in files) if (files[k].parent === nm && !files[k].trashed) list.push(files[k]);
    var i = 0;
    return { hasNext: function () { return i < list.length }, next: function () { return list[i++] } };
  };

  files[REAL_ID] = new File(REAL_ID, '⭐️AST_ระบบออเดอร์และสต๊อค-(ตัวใช้งานจริง)', null);

  var api = {
    getFileById: function (id) {
      if (!files[id] || files[id].trashed) throw new Error('ไม่พบไฟล์ ' + id);
      return files[id];
    },
    getFoldersByName: function (n) {
      var list = folders[n] ? [folders[n]] : [], i = 0;
      return { hasNext: function () { return i < list.length }, next: function () { return list[i++] } };
    },
    createFolder: function (n) { return (folders[n] = new Folder(n)) }
  };
  api._files = files;
  api._folders = folders;
  api._seed = function (name, parent, id) {
    var f = new File(id || ('seed-' + (++seq)), name, parent);
    files[f.id] = f;
    return f;
  };
  return api;
}

function load(drive, props) {
  var triggers = [];
  var ctx = {
    console: console, Date: Date, Math: Math, JSON: JSON, String: String,
    Number: Number, Object: Object, Array: Array, isNaN: isNaN, RegExp: RegExp,
    DriveApp: drive,
    Logger: { log: function () {} },
    PropertiesService: {
      getScriptProperties: function () {
        return {
          getProperty: function (k) {
            return Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null;
          },
          setProperty: function (k, v) { props[k] = String(v) },
          deleteProperty: function (k) { delete props[k] }
        };
      }
    },
    ScriptApp: {
      newTrigger: function (fn) {
        var t = { fn: fn, hour: null };
        return {
          timeBased: function () {
            return {
              atHour: function (h) { t.hour = h; return this },
              everyDays: function () { return this },
              create: function () { triggers.push(t); return t }
            };
          }
        };
      },
      getProjectTriggers: function () {
        return triggers.map(function (t) {
          return { getHandlerFunction: function () { return t.fn }, _t: t };
        });
      },
      deleteTrigger: function (h) {
        var i = triggers.indexOf(h._t);
        if (i > -1) triggers.splice(i, 1);
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Backup.gs'), 'utf8'),
    ctx, { filename: 'Backup.gs' });
  ctx.__triggers = triggers;
  return ctx;
}

function nameAt(y, m, d, hh, mm) {
  return 'AST สำรอง ' + y + '-' + m + '-' + d + ' ' + hh + mm;
}

/* ================================================== 1. สำรองรอบแรก */
console.log('\n1. สำรองครั้งแรก');
var drv1 = makeDrive();
var api1 = load(drv1, {});
var msg1 = api1.backupNow();

truthy('ได้ไฟล์สำรองใหม่หนึ่งใบ', Object.keys(drv1._files).length === 2);
truthy('สร้างโฟลเดอร์สำรองให้เอง', !!drv1._folders['AST_สำรองชีทอัตโนมัติ']);
truthy('ชื่อไฟล์อ่านออกด้วยตาเปล่า', /^AST สำรอง \d{4}-\d{2}-\d{2} \d{4}$/.test(
  Object.keys(drv1._files).map(function (k) { return drv1._files[k] })
    .filter(function (f) { return f.id !== REAL_ID })[0].name));
truthy('บอกที่เก็บและลิงก์กลับมาให้', /โฟลเดอร์ AST_สำรองชีทอัตโนมัติ/.test(msg1) && /https:/.test(msg1));
truthy('ไฟล์ตัวจริงไม่ถูกย้ายลงถังขยะ', drv1._files[REAL_ID].trashed === false);

console.log('\n   สำรองสองรอบต้องได้สองไฟล์ ไม่ใช่เขียนทับใบเดิม');
var drv1b = makeDrive();
var api1b = load(drv1b, {});
api1b.backupNow();
api1b.backupNow();
eq('มีไฟล์สำรองสองใบ', Object.keys(drv1b._files).length - 1, 2);

/* ================================================== 2. อ่านเวลาจากชื่อไฟล์ */
console.log('\n2. อ่านเวลาจากชื่อไฟล์ — ด่านกันลบผิดไฟล์');
var api2 = load(makeDrive(), {});
truthy('ชื่อของเราอ่านออก', !!api2.backupTime_(nameAt(2026, '09', '06', '01', '00')));
eq('ชื่ออื่นอ่านไม่ออก = ไม่ใช่ของเรา', api2.backupTime_('งบการเงิน 2569'), null);
eq('ชื่อคล้ายแต่ไม่ตรงรูปแบบ ก็ไม่ใช่', api2.backupTime_('AST สำรอง เมื่อวาน'), null);
eq('ชื่อว่างไม่พัง', api2.backupTime_(''), null);

/* ================================================== 3. ลบเฉพาะของเก่าของเรา */
console.log('\n3. เลือกไฟล์ที่จะทิ้ง');
var api3 = load(makeDrive(), {});
var now3 = new Date(2026, 8, 6, 1, 0);   /* 6 ก.ย. 2026 */
function old(days) {
  var d = new Date(now3.getTime() - days * 86400000);
  return api3.backupName_(d);
}
var list3 = [];
for (var i = 0; i < 40; i++) list3.push({ id: 'b' + i, name: old(i) });
list3.push({ id: 'other', name: 'ใบเสนอราคาลูกค้า' });          /* ของคนอื่น */
list3.push({ id: REAL_ID, name: api3.backupName_(now3) });        /* ตัวจริงหลงมา */

var kill3 = api3.pickExpired_(list3, now3, 30, 7);
truthy('ทิ้งเฉพาะที่เก่ากว่า 30 วัน', kill3.every(function (f) {
  return api3.backupTime_(f.name).getTime() < now3.getTime() - 30 * 86400000;
}));
eq('ไม่แตะไฟล์ของคนอื่น', kill3.filter(function (f) { return f.id === 'other' }).length, 0);
eq('ไม่แตะไฟล์ตัวจริงเด็ดขาด', kill3.filter(function (f) { return f.id === REAL_ID }).length, 0);
eq('เก่ากว่า 30 วันมี 9 ใบ (วันที่ 31-39)', kill3.length, 9);

console.log('\n   ต่อให้เก่าหมดทุกใบ ก็ต้องเหลือไว้อย่างน้อย 7');
var allOld = [];
for (var j = 0; j < 12; j++) allOld.push({ id: 'x' + j, name: old(100 + j) });
eq('ทิ้งได้แค่ 5 จาก 12', api3.pickExpired_(allOld, now3, 30, 7).length, 5);
eq('มีน้อยกว่าขั้นต่ำ ไม่ทิ้งเลยสักใบ',
  api3.pickExpired_(allOld.slice(0, 5), now3, 30, 7).length, 0);

/* ================================================== 4. ก๊อปล้ม */
console.log('\n4. ก๊อปไฟล์ล้ม — ห้ามไปลบของเก่าทิ้ง');
var drv4 = makeDrive({ copyFails: true });
drv4._folders['AST_สำรองชีทอัตโนมัติ'] = undefined;
var api4 = load(drv4, {});
/* วางของสำรองเก่าไว้ในโฟลเดอร์ก่อน */
api4.backupFolder_();
var oldName = 'AST สำรอง 2026-01-01 0100';
drv4._seed(oldName, 'AST_สำรองชีทอัตโนมัติ');

var threw = false;
try { api4.backupNow() } catch (e) { threw = true }
truthy('ล้มแล้วต้องโยน error ไม่ใช่เงียบ', threw);
truthy('ของสำรองเก่ายังอยู่ครบ ไม่ถูกลบตาม',
  Object.keys(drv4._files).filter(function (k) {
    return drv4._files[k].name === oldName && !drv4._files[k].trashed;
  }).length === 1);

var props4 = {};
var api4b = load(makeDrive({ copyFails: true }), props4);
try { api4b.backupNow() } catch (e) {}
truthy('จำไว้ว่าล้มเพราะอะไร', /สำรองไม่สำเร็จ/.test(props4.BACKUP_LAST_ERR || ''));

/* ================================================== 5. ตั้งและปิดทริกเกอร์ */
console.log('\n5. ตั้งสำรองอัตโนมัติ');
var drv5 = makeDrive();
var api5 = load(drv5, {});
api5.setupBackup();
eq('มีทริกเกอร์รายวันหนึ่งตัว', api5.__triggers.length, 1);
eq('ตั้งไว้ตอนตีหนึ่ง', api5.__triggers[0].hour, 1);
truthy('สำรองให้เลยหนึ่งรอบ ไม่ต้องรอพรุ่งนี้', Object.keys(drv5._files).length === 2);

api5.setupBackup();
eq('กดซ้ำก็ยังมีทริกเกอร์ตัวเดียว ไม่ซ้ำซ้อน', api5.__triggers.length, 1);

api5.stopBackup();
eq('ปิดแล้วไม่เหลือทริกเกอร์', api5.__triggers.length, 0);
truthy('ปิดแล้วไฟล์สำรองไม่ถูกลบตาม', Object.keys(drv5._files).length > 1);

/* ================================================== 6. รายงานสถานะ */
console.log('\n6. บอกสถานะให้เจ้าของร้านอ่านรู้เรื่อง');
var drv6 = makeDrive();
var api6 = load(drv6, {});
truthy('ยังไม่ได้ตั้ง ต้องบอกว่ายังไม่ได้ตั้ง',
  /ยังไม่ได้ตั้ง/.test(api6.backupStatus()) && /ยังไม่เคย/.test(api6.backupStatus()));
api6.setupBackup();
var st6 = api6.backupStatus();
truthy('ตั้งแล้วบอกว่าเปิดอยู่', /สำรองอัตโนมัติ: เปิดอยู่/.test(st6));
truthy('บอกว่ามีไฟล์สำรองกี่ไฟล์', /ไฟล์สำรองที่มีอยู่: 1 ไฟล์/.test(st6));
truthy('บอกด้วยว่ากำลังสำรองไฟล์ไหน', st6.indexOf(REAL_ID) > -1);

console.log('\n' + (fails ? 'ตก ' + fails + ' ข้อ' : 'ผ่านทั้งหมด'));
process.exit(fails ? 1 : 0);
