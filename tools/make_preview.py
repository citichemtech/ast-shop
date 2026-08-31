#!/usr/bin/env python3
"""ประกอบไฟล์ Apps Script ให้เป็นหน้าเว็บไฟล์เดียวที่เปิดในเบราว์เซอร์ธรรมดาได้

ตอนอยู่บน Google หน้าเว็บถูกประกอบด้วย HtmlService (<?!= include_('X') ?>)
และคุยกับหลังบ้านผ่าน google.script.run ซึ่งทั้งสองอย่างไม่มีในเครื่อง
สคริปต์นี้จึงแทนที่ทั้งสองอย่างด้วยของจำลอง เพื่อให้ขับหน้าจอด้วย Playwright
ได้จริง — เห็นว่าปุ่มทำงานไหม ยอดรวมถูกไหม ใบปะหน้าวาดออกมาได้ไหม

    python3 tools/make_preview.py [ไฟล์ผลลัพธ์]

ไม่มีข้อมูลลูกค้าจริงอยู่ในไฟล์นี้ ทุกอย่างเป็นข้อมูลสมมติ
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script"

PRODUCTS = [
    {"sku": "SKU-141", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 129, "remain": 980,
     "name": "End Mill Corn cut 2F  3.0*15*3.175*38L (1pcs)"},
    {"sku": "SKU-143", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 149, "remain": 500,
     "name": "End Mill Corn cut 2F  3.175*22*3.175*45L (1pcs)"},
    {"sku": "SKU-160", "group": "TOOLING", "unit": "ชุด", "perPack": 10, "price": 750, "remain": 40,
     "name": "Set D1.8×8.5×3.175×38L Endmill Corn Cut 2F (10pcs)"},
    {"sku": "SKU-161", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 95, "remain": 300,
     "name": "End Mill Corn cut 2F 1.8*8.5*3.175*38L (1pcs)"},
    {"sku": "CHEM-001", "group": "CHEMICAL", "unit": "แกลลอน", "perPack": 1, "price": 1200, "remain": 14,
     "name": "น้ำยาหล่อเย็น 20L"},
]

BOOT = {
    "staff": "somchai@chem-inno-tech.com",
    "shop": "AST Chem-Tooling",
    "vatRate": 0.07,
    "lists": {
        "channel": ["หน้าร้าน", "Shopee", "เพจ Facebook"],
        "carrier": ["Flash Express", "Kerry Express", "ไปรษณีย์ไทย", "ส่งด่วน (ไรเดอร์)", "รับเองที่ร้าน"],
        "vat": ["ไม่รับ VAT", "รับ VAT"],
        "status": ["รอชำระ", "ชำระแล้ว", "จัดของแล้ว", "ส่งแล้ว", "ยกเลิก"],
        "recvType": ["ซื้อเข้า", "ตรวจนับ", "คืนจากลูกค้า", "ปรับเพิ่ม", "ปรับลด"],
    },
    "app": {
        "sender": {"name": "",
                   "addr": "2/1 ซ.พัฒนาชนบท 3 แยก 9 แขวงคลองสองต้นนุ่น "
                           "เขตลาดกระบัง กรุงเทพมหานคร 10520",
                   "tel": "096-192-9993"},
        "head1": "บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด",
        "head2": "AST CHEM-TOOLING SHOP",
        "staffList": ["น้องเอ", "น้องบี", "พี่หนึ่ง"],
        "shipFee": 50, "freeOver": 1000, "codFee": 0,
        "line": "https://line.me/R/ti/p/@citiofficial",
        "track": {"Flash Express": "https://www.flashexpress.com/fle/tracking?se={track}"},
        # ข้อมูลผู้ขายบนเอกสาร — ค่าเดียวกับที่ setup() ใส่ให้ในชีท ตั้งค่าแอป
        # ตัวอย่างที่เรนเดอร์ออกมาจึงเป็นหน้าตาเดียวกับของจริง ไม่ใช่ใบที่หัวหาย
        "co": {
            "name": "บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด",
            "nameEn": "Chemical Innovation Technology & Instruments Co.,Ltd.",
            "shortName": "บริษัท เคมีคอลอินโนเวชั่น",
            "addr": "70/72 ซ.เคหะร่มเกล้า78 ถ.ราษฎร์พัฒนา แขวงสะพานสูง "
                    "เขตสะพานสูง กทม. 10240.",
            "taxId": "0105558055790", "branch": "สำนักงานใหญ่",
            "tel": "094-827-9999 / 096-192-9993",
            "email": "siripong@chem-inno-tech.com",
        },
        "website": "www.cheminnotech.com",
        "docSeller": "Citisales01",
        "docSellerEmail": "Citisales01@chem-inno-tech.com",
        "bank": "เลขบัญชี 431-039-4355 ธนาคารไทยพาณิชย์ บริษัทเคมีคอลอินโนเวชั่น "
                "เทคโนโลยี แอนด์อินสตรูเมนท์ จำกัด",
        "thanks": "บริษัทขอขอบคุณทุกท่าน  ที่ให้ความไว้ใจในการเลือกใช้บริการ"
                  "หรือผลิตภัณฑ์ของบริษัท",
        "docTerms": "ได้รับสินค้าตามรายการข้างบนไว้ถูกต้องแล้วถ้าสินค้าไม่เรียบร้อย"
                    "กรุณาแจ้งภายใน 5 วัน",
        "quoteDays": 7,
    },
    "products": PRODUCTS,
    "lots": {
        "CHEM-001": {"total": 14, "count": 2,
                     "next": {"lotNo": "L-2610", "exp": 1793404800000, "remain": 4}},
    },
    "nextNo": "AST-26-0006",
}

ORDERS = [{
    "no": "AST-26-0005", "date": "2026-08-28", "channel": "เพจ Facebook",
    "cust": "ลูกค้าตัวอย่าง ก", "tel": "0800000000",
    "addr": "1/2 ถ.ตัวอย่าง\nต.ในเมือง อ.เมือง\nเชียงใหม่ 50000",
    "carrier": "Flash Express", "track": "TH0000000001", "vat": "ไม่รับ VAT",
    "discount": 0, "ship": 50, "status": "ส่งแล้ว", "staff": "somchai@chem-inno-tech.com",
    "note": "", "subtotal": 750, "net": 800, "cost": 400, "profit": 350, "check": "OK",
    "items": [{"sku": "SKU-160", "name": PRODUCTS[2]["name"], "unit": "ชุด",
               "qty": 1, "price": 750, "total": 750, "lot": ""}],
}]

MOCK = """
<script>
/* google.script.run จำลอง — ใช้เฉพาะตอนดูหน้าจอในเครื่อง ไม่ได้ขึ้นไปอยู่บน Google */
var MOCK_BOOT = __BOOT__;
var MOCK_ORDERS = __ORDERS__;
var MOCK_DOCS = [];       /* ทะเบียนเอกสารที่ออกไปแล้วในรอบนี้ */
window.SENT = [];
window.google = { script: { run: (function(){
  var ok=null, bad=null;
  var api = {
    withSuccessHandler: function(f){ ok=f; return api },
    withFailureHandler: function(f){ bad=f; return api },
    getBootstrap: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_BOOT)) }) },
    getOrders: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_ORDERS)) }) },
    setTracking: function(no,track,status){
      reply(function(){
        MOCK_ORDERS.forEach(function(o){ if(o.no===no){ o.track=track; o.status=status } });
        return {ok:true,no:no,changed:true};
      });
    },
    /* ออกเอกสารแบบจำลอง — คิดเงินด้วยตรรกะเดียวกับ Doc.gs ตัวจริง
       (สคริปต์นี้แปะสำเนาของ buildDoc_ ไว้ให้หน้าเว็บใช้ ดูตัวแปร DOC_SRV ข้างล่าง) */
    issueDoc: function(p){
      reply(function(){
        var src = (p.type === "quote")
          ? { items: p.items || [], ship: p.ship, discount: p.discount }
          : (function(){
              var o = MOCK_ORDERS.filter(function(x){ return x.no === p.orderNo })[0];
              if(!o) throw new Error("ไม่พบออเดอร์ " + p.orderNo);
              return { items:o.items, ship:o.ship, discount:o.discount };
            })();
        var d = DOC_SRV.buildDoc_(p.type, src,
          { vatRate: p.novat ? 0 : 0.07, vatMode: p.vatMode || "excl" });
        var pre = { rec:"ONIV26-", inv:"IV26-", quote:"QO26-", dep:"DR26-" }[p.type] || "DOC-";
        var seq = { rec:231, inv:1, quote:114, dep:1 }[p.type] || 1;
        var no = pre + ("0000"+seq).slice(-5);
        var th = { rec:"ใบเสร็จรับเงิน", inv:"ใบแจ้งหนี้", quote:"ใบเสนอราคา", dep:"ใบรับเงินมัดจำ" }[p.type];
        /* เก็บใบที่ออกไว้ในทะเบียน เพื่อให้กดพิมพ์ซ้ำได้เหมือนของจริง */
        MOCK_DOCS.push({ no:no, type:th, date:p.date||"", orderNo:p.orderNo||"",
                         cust:p.cust||{}, po:p.po||"", terms:p.terms||"", note:p.note||"",
                         form:p.form||[],
                         doc:JSON.parse(JSON.stringify(d)) });
        return { ok:true, no: no, doc:d, row:7 };
      });
    },
    /* ทะเบียนเอกสารจำลอง — เก็บภาพถ่ายของใบเหมือนชีทจริง เพื่อทดสอบการพิมพ์ซ้ำ */
    listDocs: function(orderNo){
      reply(function(){
        var want = String(orderNo || "");
        return MOCK_DOCS.filter(function(d){
          return want ? d.orderNo === want : !d.orderNo;
        }).map(function(d){
          return { no:d.no, type:d.type, date:d.date, orderNo:d.orderNo,
                   custName:d.cust.name, total:d.doc.total, voidWhy:d.voidWhy||"",
                   hasSnap:true };
        }).reverse();
      });
    },
    getDoc: function(no){
      reply(function(){
        var f = MOCK_DOCS.filter(function(d){ return d.no === String(no) })[0];
        if(!f) throw new Error("ไม่พบใบ " + no + " ในชีท เอกสาร");
        return { ok:true, exact:true,
                 meta:{ no:f.no, date:f.date, orderNo:f.orderNo, po:f.po||"", terms:f.terms||"",
                        note:f.note||"", voidWhy:f.voidWhy||"", cust:f.cust, form:f.form||[] },
                 saved:{ base:f.doc.base, vat:f.doc.vat, total:f.doc.total },
                 doc: JSON.parse(JSON.stringify(f.doc)) };
      });
    },
    createOrder: function(p){
      window.SENT.push(p);
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        var sub=0;
        p.items.forEach(function(it){
          var pr=MOCK_BOOT.products.filter(function(x){return x.sku===it.sku})[0];
          var unit=(it.price===""||it.price==null)?(pr?pr.price:0):Number(it.price);
          sub+=Math.round(Number(it.qty)*unit*100)/100;
        });
        return {ok:true,no:MOCK_BOOT.nextNo,subtotal:sub,
                net:sub-(Number(p.discount)||0)+(Number(p.ship)||0),lots:[]};
      });
    }
  };
  function reply(make){
    var s=ok, f=bad; ok=null; bad=null;
    setTimeout(function(){
      var r; try{ r=make() }catch(e){ if(f) f(e); return }
      if(s) s(r);
    }, 10);
  }
  return api;
})() } };
</script>
"""


def main():
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "out" / "preview.html"
    out.parent.mkdir(parents=True, exist_ok=True)

    # รับ Index.html ที่รวมไฟล์แล้วได้ด้วย เพื่อพิสูจน์ว่าตัวที่เอาไปวางจริงยังทำงานได้
    src = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else GS / "Index.html"
    index = src.read_text(encoding="utf-8")

    def sub_include(m):
        name = m.group(1)
        return (GS / (name + ".html")).read_text(encoding="utf-8")

    page, n = re.subn(r"<\?!=\s*include_\('(\w+)'\);?\s*\?>", sub_include, index)
    if n not in (0, 5):
        sys.exit("คาดว่าจะมี include 5 อัน (หรือ 0 ถ้ารวมไฟล์มาแล้ว) แต่เจอ %d อัน" % n)

    page = page.replace('"<?= staffEmail ?>"', json.dumps(BOOT["staff"]))
    if "<?" in page:
        sys.exit("ยังมี scriptlet ของ HtmlService เหลืออยู่ ประกอบไฟล์ไม่ครบ")

    # ตรรกะคิดเงินฝั่งเซิร์ฟเวอร์ตัวจริง ยัดเข้าหน้าเว็บจำลอง
    # ทดสอบจึงเจอบั๊กของ buildDoc_ ตัวจริง ไม่ใช่ของที่เขียนขึ้นมาหลอกตัวเอง
    api_src = (GS / "Api.gs").read_text(encoding="utf-8")
    m_r2 = re.search(r"function round2_\(n\) \{[\s\S]*?\n\}", api_src)
    if not m_r2:
        sys.exit("หา round2_ ใน Api.gs ไม่เจอ")
    doc_src = (GS / "Doc.gs").read_text(encoding="utf-8")
    srv = ("<script>var DOC_SRV=(function(){" + m_r2.group(0) + "\n" + doc_src +
           "\nreturn {buildDoc_:buildDoc_,bahtText_:bahtText_,vatSplit_:vatSplit_,"
           "taxIdValid_:taxIdValid_,nextDocNo_:nextDocNo_};})();</script>")

    mock = (srv + MOCK.replace("__BOOT__", json.dumps(BOOT, ensure_ascii=False))
                      .replace("__ORDERS__", json.dumps(ORDERS, ensure_ascii=False)))

    # ตัวจริงมีหัวเอกสารของตัวเองแล้ว (และ HtmlService เป็นคนเติม viewport ให้ตอนเสิร์ฟ)
    # ที่นี่จึงเติม viewport กับ title ลงใน <head> เดิม แล้วแทรกของจำลองหลัง <body>
    # ห้ามครอบ <html> ซ้อนอีกชั้น ไม่งั้นที่ทดสอบก็ไม่ใช่หน้าเดียวกับที่เอาไปวางจริง
    if page.lstrip().startswith("<!DOCTYPE"):
        extra = ('<meta name="viewport" content="width=device-width, initial-scale=1">'
                 '<title>ตัวอย่างหน้าคีย์ออเดอร์ (ข้อมูลสมมติ)</title>')
        html, n = re.subn(r"</head>", extra + "</head>", page, count=1)
        if not n:
            sys.exit("มี <!DOCTYPE> แต่ไม่เจอ </head> — โครงไฟล์เปลี่ยนไป")
        html, n = re.subn(r"<body[^>]*>", lambda m: m.group(0) + mock, html, count=1)
        if not n:
            sys.exit("มี <!DOCTYPE> แต่ไม่เจอ <body> — โครงไฟล์เปลี่ยนไป")
    else:
        html = ('<!DOCTYPE html><html lang="th"><head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width, initial-scale=1">'
                '<title>ตัวอย่างหน้าคีย์ออเดอร์ (ข้อมูลสมมติ)</title></head><body>'
                + mock + page + '</body></html>')
    out.write_text(html, encoding="utf-8")
    print("เขียน %s (%.0f KB)" % (out, len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
