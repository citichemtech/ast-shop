/* ทดสอบตรรกะเอกสารขาย — ตัวหนังสือจำนวนเงิน ภาษี และเลขเอกสาร
   รันด้วย: node tools/t_doc.js                                          */
var fs = require('fs'), path = require('path'), vm = require('vm');

var ctx = { Math: Math, String: String, Number: Number, isFinite: isFinite,
            parseInt: parseInt, isNaN: isNaN, Error: Error };
vm.createContext(ctx);
var api = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Api.gs'), 'utf8');
var m = /function round2_\(n\) \{[\s\S]*?\n\}/.exec(api);
if (!m) { console.log('หา round2_ ใน Api.gs ไม่เจอ'); process.exit(1); }
vm.runInContext(m[0], ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Doc.gs'), 'utf8'), ctx);

var fail = 0, n = 0;
function eq(what, got, want) {
  n++;
  var ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'ผิด ') + what + '  ได้ ' + JSON.stringify(got) +
              (ok ? '' : '  ควรได้ ' + JSON.stringify(want)));
}
function head(s) { console.log('\n' + s); }

head('1. จำนวนเต็มเป็นตัวหนังสือ');
[[0,'ศูนย์'],[1,'หนึ่ง'],[2,'สอง'],[9,'เก้า'],
 [10,'สิบ'],[11,'สิบเอ็ด'],[12,'สิบสอง'],[20,'ยี่สิบ'],[21,'ยี่สิบเอ็ด'],[25,'ยี่สิบห้า'],
 [30,'สามสิบ'],[91,'เก้าสิบเอ็ด'],
 [100,'หนึ่งร้อย'],[101,'หนึ่งร้อยเอ็ด'],[110,'หนึ่งร้อยสิบ'],[111,'หนึ่งร้อยสิบเอ็ด'],
 [121,'หนึ่งร้อยยี่สิบเอ็ด'],[149,'หนึ่งร้อยสี่สิบเก้า'],
 [1000,'หนึ่งพัน'],[1001,'หนึ่งพันเอ็ด'],[2578,'สองพันห้าร้อยเจ็ดสิบแปด'],
 [2400,'สองพันสี่ร้อย'],[10000,'หนึ่งหมื่น'],[100000,'หนึ่งแสน'],
 [999999,'เก้าแสนเก้าหมื่นเก้าพันเก้าร้อยเก้าสิบเก้า'],
 [1000000,'หนึ่งล้าน'],[1000001,'หนึ่งล้านหนึ่ง'],[1000011,'หนึ่งล้านสิบเอ็ด'],
 [2000000,'สองล้าน'],[1234567,'หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ด'],
 [1000000000,'หนึ่งพันล้าน']
].forEach(function (c) { eq(String(c[0]), ctx.intText_(c[0]), c[1]); });

head('2. เงินบาทเป็นตัวหนังสือ');
// ใบจริงของร้าน ONIV26-00230 พิมพ์ว่า ( หนึ่งร้อยสี่สิบเก้าบาทถ้วน )
eq('149 ตรงกับใบจริง', ctx.bahtText_(149), 'หนึ่งร้อยสี่สิบเก้าบาทถ้วน');
eq('0', ctx.bahtText_(0), 'ศูนย์บาทถ้วน');
eq('0.50 ไม่มีบาท', ctx.bahtText_(0.5), 'ห้าสิบสตางค์');
eq('0.25', ctx.bahtText_(0.25), 'ยี่สิบห้าสตางค์');
eq('1.01 สตางค์หลักเดียว', ctx.bahtText_(1.01), 'หนึ่งบาทหนึ่งสตางค์');
eq('1.21 สตางค์สองหลักลงท้าย 1 เป็น เอ็ด', ctx.bahtText_(1.21), 'หนึ่งบาทยี่สิบเอ็ดสตางค์');
eq('139.25 ฐานภาษีของใบจริง', ctx.bahtText_(139.25), 'หนึ่งร้อยสามสิบเก้าบาทยี่สิบห้าสตางค์');
eq('2578 ยอดออเดอร์จริง', ctx.bahtText_(2578), 'สองพันห้าร้อยเจ็ดสิบแปดบาทถ้วน');
eq('2400', ctx.bahtText_(2400), 'สองพันสี่ร้อยบาทถ้วน');
eq('208', ctx.bahtText_(208), 'สองร้อยแปดบาทถ้วน');
// 0.999 ปัดขึ้นเป็น 1 บาท ต้องไม่กลายเป็น "ร้อยสตางค์"
eq('0.999 ปัดแล้วทดขึ้นบาท', ctx.bahtText_(0.999), 'หนึ่งบาทถ้วน');
eq('9.995 ปัดแล้วทดขึ้นบาท', ctx.bahtText_(9.995), 'สิบบาทถ้วน');
eq('ติดลบ', ctx.bahtText_(-50), 'ลบห้าสิบบาทถ้วน');

head('3. แยกภาษีมูลค่าเพิ่ม');
var a = ctx.vatSplit_(149, 0.07);
eq('149 รวม VAT → ฐานภาษี', a.base, 139.25);
eq('149 รวม VAT → ภาษี', a.vat, 9.75);
eq('ฐาน + ภาษี ต้องเท่ายอดรวมเป๊ะ', ctx.round2_(a.base + a.vat), 149);
eq('รับ rate เป็น 7 ก็ได้', ctx.vatSplit_(149, 7).base, 139.25);
var b = ctx.vatSplit_(139.25, 0.07, 'excl');
eq('โหมดบวกเพิ่ม → ยอดรวม', b.gross, 149);
eq('โหมดบวกเพิ่ม → ภาษี', b.vat, 9.75);
eq('ไม่คิดภาษี ยอดไม่เปลี่ยน', ctx.vatSplit_(2578, 0), { base: 2578, vat: 0, gross: 2578, rate: 0 });
// ยอดที่ปัดแล้วเศษไม่ลงตัว ห้ามทำให้ผลรวมเพี้ยน
[1, 7, 33.33, 99.99, 1234.56, 2578, 20000].forEach(function (g) {
  var s = ctx.vatSplit_(g, 0.07);
  eq('ผลรวมตรงที่ยอด ' + g, ctx.round2_(s.base + s.vat), ctx.round2_(g));
});

head('4. เลขเอกสาร');
// ชุดจริงของร้านเดินมาถึง ONIV26-00230 แล้ว ใบต่อไปต้องเป็น 00231 ไม่ใช่ 00001
eq('ต่อจากเลขจริงของร้าน',
   ctx.nextDocNo_('ONIV26-', ['ONIV26-00227', 'ONIV26-00228', 'ONIV26-00229', 'ONIV26-00230']),
   'ONIV26-00231');
eq('ชุดว่าง เริ่มที่ 1', ctx.nextDocNo_('QO26-', []), 'QO26-00001');
eq('ไม่นับเลขชุดอื่น', ctx.nextDocNo_('QO26-', ['ONIV26-00230', 'QO26-00004']), 'QO26-00005');
eq('เลขหายกลางชุด ยังเดินต่อจากตัวสูงสุด',
   ctx.nextDocNo_('IV26-', ['IV26-00001', 'IV26-00009']), 'IV26-00010');
eq('ข้ามหลักพัน', ctx.nextDocNo_('ONIV26-', ['ONIV26-09999']), 'ONIV26-10000');

head('5. ชนิดเอกสาร');
eq('มีครบสี่ชนิด', ctx.DOC_TYPES.length, 4);
eq('ใบเสนอราคาต้องแยก ไม่ผูกออเดอร์', ctx.docType_('quote').quote, true);
['inv', 'rec', 'dep'].forEach(function (k) {
  eq(k + ' ผูกกับออเดอร์', ctx.docType_(k).quote, false);
});

head('6. ประกอบใบเอกสารจากออเดอร์');
var cfg = { vatRate: 0.07, vatMode: 'incl' };
var d = ctx.buildDoc_('rec', {
  items: [{ name: 'เอทิลแอลกอฮอล์ 99.9% (1000ml)', qty: 1, unit: 'Can', price: 149 }]
}, cfg);
eq('ใบจริง — ฐานภาษี', d.base, 139.25);
eq('ใบจริง — ภาษี', d.vat, 9.75);
eq('ใบจริง — รวมทั้งสิ้น', d.total, 149);
eq('ใบจริง — ตัวหนังสือ', d.totalText, 'หนึ่งร้อยสี่สิบเก้าบาทถ้วน');
eq('ใบจริง — หนึ่งบรรทัด', d.lines.length, 1);

var d2 = ctx.buildDoc_('rec', {
  items: [{ name: 'ก', qty: 2, unit: 'ชิ้น', price: 100 }],
  ship: 50, discount: 30
}, cfg);
eq('ค่าจัดส่งลงเป็นบรรทัด', d2.lines[1].name, 'ค่าจัดส่ง');
eq('ส่วนลดลงเป็นบรรทัดติดลบ', d2.lines[2].amount, -30);
eq('ยอดรวม 200+50-30', d2.total, 220);
eq('ฐาน+ภาษี = ยอดรวม', ctx.round2_(d2.base + d2.vat), 220);

var d3 = ctx.buildDoc_('quote', { items: [{ name: 'ข', qty: 3, price: 149 }] }, cfg);
eq('ใบเสนอราคาก็คิดภาษีเหมือนกัน', d3.total, 447);
eq('ชื่อหัวใบเสนอราคา', d3.typeTh, 'ใบเสนอราคา');

var d4 = ctx.buildDoc_('rec', { items: [] }, cfg);
eq('ไม่มีรายการ ยอดเป็นศูนย์ ไม่ระเบิด', d4.total, 0);
eq('ไม่มีรายการ ตัวหนังสือ', d4.totalText, 'ศูนย์บาทถ้วน');

var threw = '';
try { ctx.buildDoc_('มั่ว', { items: [] }, cfg); } catch (e) { threw = e.message; }
eq('ชนิดมั่วต้องโยน error ไม่ใช่เงียบ', threw.indexOf('ไม่รู้จักชนิดเอกสาร') === 0, true);

head('7. เลขประจำตัวผู้เสียภาษี');
// เลขจริงของบริษัท ที่เจ้าของร้านส่งมา
eq('เลขบริษัทถูกต้อง', ctx.taxIdValid_('0105558055790'), true);
eq('มีขีดคั่นก็อ่านออก', ctx.taxIdValid_('0-1055-58055-79-0'), true);
// พิมพ์ผิดหลักเดียวต้องจับได้ ไม่ใช่ปล่อยผ่านไปพิมพ์ลงใบ
eq('สลับสองหลักท้าย', ctx.taxIdValid_('0105558055709'), false);
eq('หลักตรวจสอบผิด', ctx.taxIdValid_('0105558055791'), false);
eq('พิมพ์เกินหนึ่งหลัก', ctx.taxIdValid_('01055580557900'), false);
eq('พิมพ์ขาดหนึ่งหลัก', ctx.taxIdValid_('010555805579'), false);
eq('ว่าง', ctx.taxIdValid_(''), false);
eq('ไม่ใช่ตัวเลข', ctx.taxIdValid_('abcdefghijklm'), false);
// ศูนย์ล้วนคือค่าที่คนใส่ไว้ชั่วคราวเวลายังไม่รู้เลขจริง หลักตรวจสอบต้องปัดตก
eq('ศูนย์ล้วนต้องไม่ผ่าน', ctx.taxIdValid_('0000000000000'), false);

head('8. ชื่อชนิดเอกสารสองฝั่งต้องตรงกัน');
// Doc.html ต้องพิมพ์ชื่อชุดเดียวกับที่ Doc.gs ใช้ ถ้าแก้ที่เดียวใบจะพิมพ์ผิดชนิดโดยไม่มีใครรู้
var docHtml = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Doc.html'), 'utf8');
var mNames = /var DOC_TYPE_NAMES = (\[[\s\S]*?\]);/.exec(docHtml);
eq('หา DOC_TYPE_NAMES ใน Doc.html เจอ', !!mNames, true);
if (mNames) {
  var names = vm.runInNewContext('(' + mNames[1] + ')');
  eq('จำนวนชนิดเท่ากัน', names.length, ctx.DOC_TYPES.length);
  names.forEach(function (t) {
    var srv = ctx.docType_(t.key);
    eq('ชนิด ' + t.key + ' มีอยู่ทั้งสองฝั่ง', !!srv, true);
    if (srv) {
      eq('ชนิด ' + t.key + ' ชื่อไทยตรงกัน', t.th, srv.th);
      eq('ชนิด ' + t.key + ' ชื่ออังกฤษตรงกัน', t.en, srv.en);
    }
  });
  ctx.DOC_TYPES.forEach(function (srv) {
    eq('ชนิด ' + srv.key + ' ถูกพิมพ์บนกระดาษด้วย',
       names.filter(function (t) { return t.key === srv.key; }).length, 1);
  });
}

console.log('\n' + (fail ? 'ไม่ผ่าน ' + fail + ' จาก ' + n : 'ผ่านทั้งหมด ' + n + ' ข้อ'));
process.exit(fail ? 1 : 0);
