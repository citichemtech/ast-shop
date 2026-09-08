/* ============================================================== ส่งบัญชี

   งานบัญชีเป็นคนละเส้นทางกับงานส่งของ ใบที่ของถึงมือลูกค้าแล้วแต่ยังไม่ได้ส่งบัญชี
   เกิดขึ้นทุกวัน ถ้าใช้ช่องสถานะเดียวกันจะเห็นได้ทีละเรื่อง แล้วใบที่ตกหล่นจะรู้อีกที
   ตอนสิ้นเดือน ซึ่งสายไปแล้วสำหรับการยื่นภาษี — จึงแยกเป็นสถานะของตัวเอง (คอลัมน์ V)

   "ส่งบัญชี" ในที่นี้คือ ก๊อปเอกสารเข้าโฟลเดอร์ไดรฟ์ของบัญชี แล้วจดไว้ในชีทว่า
   ส่งอะไรไปเมื่อไร ไม่ใช่ส่งอีเมล — เจ้าของร้านเลือกทางนี้เอง เพราะบัญชีเปิดดูได้
   ตลอดเวลาโดยไม่ต้องค้นหาในกล่องจดหมาย

   ระบบไม่แตะสลิปโอนเงิน เพราะร้านรับเงินผ่านธนาคารและบัญชีดูจากรายการเดินบัญชีเอง
   ถ้าวันหนึ่งต้องแนบสลิปจริง ค่อยเพิ่มทีหลัง ตอนนี้ไม่ทำของที่ไม่มีใครใช้            */

/* ที่เก็บไอดีโฟลเดอร์ — จำไว้ในพร็อพเพอร์ตี้ ไม่ต้องค้นชื่อโฟลเดอร์ทุกครั้ง
   และค้นด้วยชื่อก็อันตราย ถ้ามีโฟลเดอร์ชื่อซ้ำจะไปลงผิดที่โดยไม่มีใครรู้ */
var ACCT_FOLDER_PROP = 'ACCT_FOLDER_ID';
var ACCT_FOLDER_NAME = 'AST_ส่งบัญชี';

/**
 * รายการที่ส่งบัญชีได้ของออเดอร์ใบหนึ่ง — อ่านอย่างเดียว
 *
 * คืนเฉพาะของที่ "มีอยู่จริง" ไม่ใช่รายการตัวเลือกตายตัว ใบไหนยังไม่ได้ออกเอกสาร
 * จะไม่มีอะไรให้ติ๊ก ซึ่งเป็นคำตอบที่ตรงกว่าการโชว์ช่องติ๊กที่กดแล้วไม่มีอะไรเกิดขึ้น
 */
function acctPack(orderNo) {
  requireStaff_();
  var no = String(orderNo || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าจะส่งบัญชีของออเดอร์ใบไหน');

  var rows = readOrders_({ limit: 0, match: function (o) { return o.no === no; } });
  var ord = rows[0];
  if (!ord) throw new Error('ไม่พบออเดอร์ ' + no + ' ในชีท');

  /* ใบที่ยกเลิกไปแล้วไม่ส่งบัญชี — ส่งไปก็ต้องตามไปบอกให้ถอนออกทีหลัง */
  var docs = listDocs(no).filter(function (d) { return !d.voidWhy; });

  return jsonSafe_({
    no: ord.no, date: ord.date, channel: ord.channel, cust: ord.cust,
    net: ord.net, vatAmt: ord.vatAmt, status: ord.status,
    acct: ord.acct || ACCT_FIRST, acctAt: ord.acctAt || '', acctWhat: ord.acctWhat || '',
    docs: docs.map(function (d) {
      return { no: d.no, type: d.type, date: d.date, total: d.total, hasSnap: d.hasSnap };
    })
  });
}

/**
 * เปลี่ยนสถานะบัญชีอย่างเดียว ไม่ส่งไฟล์
 *
 * มีไว้สำหรับ "รอเอกสาร" กับ "บัญชีตีกลับ" ซึ่งเป็นสถานะที่ไม่มีไฟล์เกี่ยวข้อง
 * และสำหรับแก้สถานะที่กดผิด
 */
function setAcctStatus(orderNo, status, why) {
  var email = requireStaff_();
  var no = String(orderNo || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าจะแก้สถานะบัญชีของใบไหน');

  var lists = cfgLists_();
  var want = pickFrom_(status, lists.acct.length ? lists.acct : ACCT_LIST, 'สถานะบัญชี');

  var found = findOrderRow_(no);
  var before = String(found.sheet.getRange(found.row, SH.head.IN.acct).getValue() || '').trim();
  writeRow_('head', found.row, { acct: want });

  writeLog_(email, 'แก้สถานะบัญชี', SH.head.name, no, 'เปลี่ยนสถานะบัญชี',
    before || '(ว่าง)', want, String(why || '').trim() || 'แก้จากในแอปโดย ' + email);

  return jsonSafe_({ ok: true, no: no, acct: want });
}

/**
 * ส่งบัญชี — เขียนไฟล์ลงโฟลเดอร์ไดรฟ์ แล้วจดในชีทว่าส่งอะไรไปเมื่อไร
 *
 * ลำดับสำคัญ: เขียนไฟล์ให้ครบก่อน ค่อยแตะชีท
 * ถ้าจดในชีทว่า "ส่งแล้ว" แต่ไฟล์เขียนไม่สำเร็จ จะไม่มีใครรู้เลยว่าบัญชีไม่ได้ของ
 * กลับกัน ถ้าไฟล์ลงแล้วแต่ชีทยังไม่ขยับ อย่างน้อยกดซ้ำได้ และของไม่หาย
 *
 * files มาจากหน้าจอ เป็นรูปใบที่วาดด้วย canvas ตัวเดียวกับที่ใช้พิมพ์
 * จึงเป็นภาพเดียวกับใบที่ลูกค้าถืออยู่เป๊ะ ไม่ใช่ใบที่ประกอบใหม่ตอนส่ง
 */
function sendToAccounting(payload) {
  var email = requireStaff_();
  var p = payload || {};
  var no = String(p.no || '').trim();
  if (!no) throw new Error('ไม่ได้บอกว่าจะส่งบัญชีของออเดอร์ใบไหน');

  var files = p.files || [];
  var extras = p.extras || [];
  if (!files.length && !extras.length) {
    throw new Error('ยังไม่ได้เลือกว่าจะส่งอะไรให้บัญชี');
  }

  var clientKey = String(p.clientKey || '').trim();
  if (!clientKey) throw new Error('คำขอไม่มี clientKey — ระบบกันส่งซ้ำไม่ได้ ไม่ส่งให้');
  var props = PropertiesService.getScriptProperties();
  var already = props.getProperty('ak_' + clientKey);
  if (already) return jsonSafe_({ ok: true, no: no, folderUrl: already, duplicate: true });

  var found = findOrderRow_(no);
  var folder = acctMonthFolder_(p.date || '');
  var made = [];

  try {
    for (var i = 0; i < files.length; i++) {
      made.push(acctWriteImage_(folder, files[i], no));
    }
    if (extras.length) {
      made.push(acctWriteSummary_(folder, no, p, extras));
    }
  } catch (err) {
    /* เขียนไปได้ครึ่งทางแล้วล้ม — เก็บกวาดไฟล์ที่เพิ่งสร้าง ไม่ทิ้งของครึ่ง ๆ ไว้ให้บัญชี
       เดาว่าใบไหนครบไม่ครบ ลบเองไม่ได้ (ไฟล์ลงถังขยะ กู้คืนได้ 30 วัน) */
    for (var c = 0; c < made.length; c++) {
      try { made[c].file.setTrashed(true); } catch (e2) {}
    }
    throw new Error('ส่งบัญชีไม่สำเร็จ ไม่ได้เขียนอะไรลงชีท — ' + err.message);
  }

  var names = made.map(function (m) { return m.label; });
  var at = Utilities.formatDate(new Date(), tz_(), 'yyyy-MM-dd HH:mm');
  writeRow_('head', found.row, {
    acct: 'ส่งบัญชีแล้ว',
    acctAt: at,
    acctWhat: names.join(' · ')
  });

  props.setProperty('ak_' + clientKey, folder.getUrl());
  writeLog_(email, 'ส่งบัญชี', SH.head.name, no, 'ส่งเอกสารเข้าโฟลเดอร์บัญชี',
    '', names.join(' · '),
    'โฟลเดอร์ ' + folder.getName() + ' โดย ' + (String(p.by || '').trim() || email));

  return jsonSafe_({
    ok: true, no: no, at: at, sent: names,
    folderUrl: folder.getUrl(), folderName: folder.getName(),
    /* บอกด้วยว่าที่ลงไปเป็น PDF หรือรูป — ตัวแปลงของ Google ไม่ได้ทำงานทุกที่
       ถ้าบอกไม่ตรง คนจะไปหาไฟล์ PDF ที่ไม่มีอยู่จริงในโฟลเดอร์ */
    kinds: made.map(function (m) { return m.kind; })
  });
}

/* ------------------------------------------------------------------ ไดรฟ์ */

/** โฟลเดอร์หลัก — อยู่ที่เดียวกับไฟล์ชีท จะได้ไม่ต้องตามหา */
function acctRootFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = String(props.getProperty(ACCT_FOLDER_PROP) || '').trim();
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) {
      /* โฟลเดอร์ถูกลบหรือถูกย้ายจนเข้าไม่ได้ — สร้างใหม่ดีกว่าค้างทั้งระบบ
         ไฟล์เก่ายังอยู่ในถังขยะของไดรฟ์ ไม่ได้หายไปไหน */
      props.deleteProperty(ACCT_FOLDER_PROP);
    }
  }

  var parent = null;
  try {
    var it = DriveApp.getFileById(SHEET_ID).getParents();
    if (it.hasNext()) parent = it.next();
  } catch (e3) { parent = null; }

  var f = parent ? parent.createFolder(ACCT_FOLDER_NAME) : DriveApp.createFolder(ACCT_FOLDER_NAME);
  props.setProperty(ACCT_FOLDER_PROP, f.getId());
  return f;
}

/** โฟลเดอร์ย่อยรายเดือน — บัญชีทำงานเป็นรอบเดือน จึงแบ่งตามเดือนของออเดอร์ */
function acctMonthFolder_(dateStr) {
  var root = acctRootFolder_();
  var d = parseDate_(dateStr) || new Date();
  var name = Utilities.formatDate(d, tz_(), 'yyyy-MM');
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}

/**
 * เขียนรูปใบลงโฟลเดอร์ พยายามแปลงเป็น PDF ก่อน
 *
 * บัญชีอยากได้ PDF แต่ตัวแปลงของ Google ไม่ได้ทำงานได้ทุกกรณี
 * แปลงไม่ได้ก็ยังต้องได้ไฟล์ — ยอมลงเป็นรูปแล้วบอกให้รู้ ดีกว่าล้มทั้งการส่ง
 */
function acctWriteImage_(folder, item, orderNo) {
  var name = String((item && item.name) || '').trim() || orderNo;
  var data = String((item && item.data) || '');
  var m = /^data:([^;]+);base64,(.*)$/.exec(data);
  if (!m) throw new Error('ไฟล์ "' + name + '" ส่งมาไม่ครบ (ไม่ใช่รูปที่วาดเสร็จ)');

  var bytes = Utilities.base64Decode(m[2]);
  var img = Utilities.newBlob(bytes, m[1], name + '.' + (m[1] === 'image/png' ? 'png' : 'jpg'));

  var file, kind;
  try {
    file = folder.createFile(img.getAs('application/pdf').setName(name + '.pdf'));
    kind = 'pdf';
  } catch (e) {
    file = folder.createFile(img);
    kind = 'image';
  }
  return { file: file, label: name, kind: kind };
}

/** ใบปะหน้าที่บอกว่าออเดอร์ใบนี้คืออะไร — บัญชีเปิดไฟล์เดียวก็เห็นครบ */
function acctWriteSummary_(folder, no, p, extras) {
  var want = {};
  for (var i = 0; i < extras.length; i++) want[String(extras[i])] = true;

  var pack = acctPack(no);
  var lines = ['ออเดอร์ ' + pack.no, ''];

  if (want.order) {
    lines.push('เลขออเดอร์      : ' + pack.no);
    lines.push('วันที่           : ' + pack.date);
    lines.push('ช่องทางขาย      : ' + (pack.channel || '-'));
    lines.push('สถานะออเดอร์    : ' + (pack.status || '-'));
    lines.push('ยอดชำระสุทธิ    : ' + money_(pack.net) + ' บาท');
    lines.push('ในนั้นเป็น VAT   : ' + money_(pack.vatAmt) + ' บาท');
    lines.push('');
  }

  if (want.cust) {
    /* ข้อมูลผู้เสียภาษีอยู่ที่ใบเอกสาร ไม่ได้อยู่ที่ออเดอร์ — ใบเดียวกันจึงเชื่อถือได้
       ถ้าไม่เคยออกเอกสารให้ใบนี้ ก็ยังไม่มีเลขผู้เสียภาษีให้ส่ง บอกไปตรง ๆ */
      var tax = acctTaxInfo_(no);
    lines.push('ชื่อลูกค้า        : ' + (pack.cust || '-'));
    if (tax) {
      lines.push('ชื่อผู้เสียภาษี    : ' + (tax.custName || '-'));
      lines.push('เลขผู้เสียภาษี    : ' + (tax.custTaxId || '-'));
      lines.push('สำนักงานใหญ่/สาขา : ' + (tax.custBranch || '-'));
      lines.push('ที่อยู่           : ' + (tax.custAddr || '-'));
      lines.push('เบอร์โทร         : ' + (tax.custTel || '-'));
      lines.push('อีเมล            : ' + (tax.custEmail || '-'));
    } else {
      lines.push('(ใบนี้ยังไม่เคยออกเอกสาร จึงยังไม่มีข้อมูลผู้เสียภาษีในระบบ)');
    }
    lines.push('');
  }

  if (pack.docs.length) {
    lines.push('เอกสารของออเดอร์ใบนี้ที่มีในระบบ');
    for (var d = 0; d < pack.docs.length; d++) {
      lines.push('  - ' + pack.docs[d].type + ' ' + pack.docs[d].no +
        ' ลงวันที่ ' + pack.docs[d].date + ' ยอด ' + money_(pack.docs[d].total) + ' บาท');
    }
    lines.push('');
  }

  lines.push('การชำระเงิน: โอนผ่านธนาคาร — ตรวจสอบจากรายการเดินบัญชี');
  lines.push('');
  lines.push('ไฟล์นี้สร้างจากระบบคีย์ออเดอร์ เมื่อ ' +
    Utilities.formatDate(new Date(), tz_(), 'd/M/yyyy HH:mm') +
    ' โดย ' + (String(p.by || '').trim() || whoami_()));

  var blob = Utilities.newBlob(lines.join('\n'), 'text/plain', 'สรุป-' + no + '.txt');
  return { file: folder.createFile(blob), label: 'สรุป-' + no + '.txt', kind: 'text' };
}

/** ข้อมูลผู้เสียภาษีจากเอกสารล่าสุดที่ยังไม่ถูกยกเลิกของออเดอร์ใบนี้ */
function acctTaxInfo_(no) {
  var s = sheet_('doc');
  var last = formulaLimit_('doc');
  if (last < DATA_ROW) return null;
  var C = SH.doc.IN;
  var v = s.getRange(DATA_ROW, C.no, last - DATA_ROW + 1, C.sentAt - C.no + 1).getValues();
  var at = function (col) { return col - C.no; };
  var hit = null;
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][at(C.orderNo)] || '').trim() !== no) continue;
    if (String(v[i][at(C.voidWhy)] || '').trim()) continue;
    hit = {
      custName: String(v[i][at(C.custName)] || ''),
      custTaxId: String(v[i][at(C.custTaxId)] || ''),
      custBranch: String(v[i][at(C.custBranch)] || ''),
      custAddr: String(v[i][at(C.custAddr)] || ''),
      custTel: String(v[i][at(C.custTel)] || ''),
      custEmail: String(v[i][at(C.custEmail)] || '')
    };
  }
  return hit;
}

/** แถวของออเดอร์ในชีทหัวบิล */
function findOrderRow_(no) {
  var s = sheet_('head');
  var last = formulaLimit_('head');
  if (last < DATA_ROW) throw new Error('ชีท ' + SH.head.name + ' ยังไม่มีข้อมูล');
  var v = s.getRange(DATA_ROW, SH.head.IN.no, last - DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][0] || '').trim() === no) return { sheet: s, row: DATA_ROW + i };
  }
  throw new Error('ไม่พบออเดอร์ ' + no + ' ในชีท ' + SH.head.name);
}

function tz_() {
  try { return ss_().getSpreadsheetTimeZone() || 'Asia/Bangkok'; }
  catch (e) { return 'Asia/Bangkok'; }
}
