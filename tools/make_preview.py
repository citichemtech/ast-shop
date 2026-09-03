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
    "file": {"name": "AST_Stock List Tooling chemical newapp",
             "url": "https://docs.google.com/spreadsheets/d/FAKEID/edit"},
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
    "vatAmt": 0,
}, {
    # ใบที่รับ VAT — ตัวเลขชุดนี้มาจากของจริงที่ลูกค้าทักมาว่า "บวกผิด"
    # 237 + ค่าส่ง 50 = 287 แต่ยอดชำระ 303.59 เพราะ VAT 16.59 ไม่ได้ถูกพิมพ์ในข้อความ
    # วันที่เดียวกับใบแรกโดยตั้งใจ — ถ้าตั้งเป็น "วันนี้" ข้อสอบหน้าสรุปยอด
    # จะได้ผลต่างกันตามวันที่รันทดสอบ ซึ่งเป็นข้อสอบที่เชื่อไม่ได้
    "no": "AST-26-0006", "date": "2026-08-28", "channel": "เพจ Facebook",
    "cust": "ลูกค้าตัวอย่าง ข", "tel": "0800000001",
    "addr": "37/4 หมู่17 ต.ลำลูกกา อ.ลำลูกกา ปทุมธานี 12150",
    "carrier": "Flash Express", "track": "", "vat": "รับ VAT",
    "discount": 0, "ship": 50, "status": "รอชำระ", "staff": "somchai@chem-inno-tech.com",
    "note": "", "subtotal": 237, "vatAmt": 16.59, "net": 303.59,
    "cost": 105, "profit": 132, "check": "OK",
    "items": [{"sku": "SKU-141", "name": PRODUCTS[0]["name"], "unit": "ชิ้น",
               "qty": 3, "price": 79, "total": 237, "lot": ""}],
}]

MOCK = """
<script>
/* google.script.run จำลอง — ใช้เฉพาะตอนดูหน้าจอในเครื่อง ไม่ได้ขึ้นไปอยู่บน Google */
var MOCK_BOOT = __BOOT__;
var MOCK_ORDERS = __ORDERS__;
var MOCK_DOCS = [];       /* ทะเบียนเอกสารที่ออกไปแล้วในรอบนี้ */
var MOCK_SIGN = {};       /* ลายเซ็นฝั่งร้านที่เซ็นเก็บไว้ (ของจริงอยู่ในชีท ตั้งค่าแอป) */
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
                   sentAt:d.sentAt||"", hasSnap:true };
        }).reverse();
      });
    },
    editOrderItems: function(no, items, by, ck, opts){
      reply(function(){
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(no) })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + no);
        if(!items || !items.length)
          throw new Error("ออเดอร์ต้องมีสินค้าอย่างน้อยหนึ่งบรรทัด");
        var fix = !!(opts && opts.reviseDocs);
        var liveDocs = MOCK_DOCS.filter(function(d){
          return d.orderNo === String(no) && !d.voidWhy;
        });
        var live = liveDocs.map(function(d){ return d.no + " (" + d.type + ")" });
        if(live.length && !fix) throw new Error("ออเดอร์ " + no + " ออกเอกสารไปแล้ว: "
          + live.join(", ") + " — ถ้าใบยังไม่ได้ส่งให้ลูกค้า ให้ติ๊ก "
          + "“แก้ใบที่ออกไปแล้วตามด้วย” · ถ้าลูกค้าถือใบอยู่แล้ว ต้องยกเลิกใบเดิมก่อน");
        if(fix) liveDocs.forEach(function(d){
          if(d.sentAt) throw new Error("ใบ " + d.no + " ถูกทำเครื่องหมายว่าส่งให้ลูกค้าแล้ว");
        });
        /* ค่าส่งกับส่วนลดแก้พร้อมรายการได้ */
        if(opts && opts.ship !== undefined && opts.ship !== null && opts.ship !== "")
          o.ship = Number(opts.ship) || 0;
        if(opts && opts.discount !== undefined && opts.discount !== null && opts.discount !== "")
          o.discount = Number(opts.discount) || 0;
        var before = (o.items||[]).length, sub = 0;
        o.items = items.map(function(it, i){
          var qty = Number(it.qty)||0;
          var pr = it.price === "" ? 100 : Number(it.price);
          sub += qty * pr;
          return { sku: it.free ? ("SKU-X00"+(i+1)) : it.sku,
                   name: it.free ? it.name : ("สินค้า " + it.sku),
                   qty: qty, price: pr, total: qty*pr };
        });
        o.subtotal = sub;
        var vat35 = String(o.vat||"").indexOf("ไม่") !== 0
          ? Math.round((sub - Number(o.discount||0)) * 0.07 * 100) / 100 : 0;
        o.vatAmt = vat35;
        o.net = Math.round((sub - Number(o.discount||0) + Number(o.ship||0) + vat35) * 100) / 100;
        var fixed = [];
        if(fix) liveDocs.forEach(function(d){
          var b = DOC_SRV.buildDoc_(
            { "ใบเสร็จรับเงิน":"rec", "ใบแจ้งหนี้":"inv" }[d.type] || "rec",
            { items:o.items, ship:o.ship, discount:o.discount },
            { vatRate: 0.07, vatMode: "excl" });
          d.doc = JSON.parse(JSON.stringify(b));
          fixed.push(d.no + " → " + b.total);
        });
        return { ok:true, no:o.no, subtotal:sub, net:o.net, lots:[], before:before,
                 after:o.items.length, ship:o.ship, discount:o.discount, docs:fixed };
      });
    },
    /* แก้เนื้อใบเดิมโดยใช้เลขเดิม — ใช้ได้จนกว่าจะกดว่าส่งแล้ว */
    reviseDoc: function(p){
      reply(function(){
        var f = MOCK_DOCS.filter(function(d){ return d.no === String(p.no) })[0];
        if(!f) throw new Error("ไม่พบใบเลขที่ " + p.no + " ในชีท เอกสาร");
        if(f.voidWhy) throw new Error("ใบ " + p.no + " ถูกยกเลิกไปแล้ว");
        if(f.sentAt) throw new Error("ใบ " + p.no + " ถูกทำเครื่องหมายว่าส่งให้ลูกค้าแล้ว ("
          + f.sentAt + ") — แก้ไม่ได้ ให้ยกเลิกแล้วออกใบใหม่แทน");
        if(String(p.why||"").trim().length < 5)
          throw new Error("ต้องบอกเหตุผลที่แก้อย่างน้อย 5 ตัวอักษร");
        var o = MOCK_ORDERS.filter(function(x){ return x.no === f.orderNo })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + f.orderNo);
        var d = DOC_SRV.buildDoc_(
          { "ใบเสร็จรับเงิน":"rec", "ใบแจ้งหนี้":"inv", "ใบเสนอราคา":"quote",
            "ใบรับเงินมัดจำ":"dep" }[f.type] || "rec",
          { items:o.items, ship:o.ship, discount:o.discount },
          { vatRate: p.novat ? 0 : 0.07, vatMode: p.vatMode || "excl" });
        f.times = (f.times || 0) + 1;
        f.before = f.doc.total;
        f.doc = JSON.parse(JSON.stringify(d));
        if(p.cust) f.cust = p.cust;
        f.note = (f.note ? f.note + " " : "")
          + "[แก้ไขครั้งที่ " + f.times + ": " + p.why + " · ยอดเดิม " + f.before + "]";
        return { ok:true, no:f.no, doc:d, times:f.times, before:f.before };
      });
    },
    /* ทำเครื่องหมายว่าส่งให้ลูกค้าแล้ว — ปิดประตูการแก้ใบเดิม */
    markSent: function(no, by){
      reply(function(){
        var f = MOCK_DOCS.filter(function(d){ return d.no === String(no) })[0];
        if(!f) throw new Error("ไม่พบใบเลขที่ " + no + " ในชีท เอกสาร");
        if(f.sentAt) return { ok:true, no:f.no, at:f.sentAt, already:true };
        f.sentAt = "03/09/2026 21:30 โดย " + (by||"");
        return { ok:true, no:f.no, at:f.sentAt };
      });
    },
    /* ยกเลิกทั้งออเดอร์ — ของคืนเข้าสต๊อก ยอดกลายเป็นศูนย์ สถานะเป็นยกเลิก */
    cancelOrder: function(no, why, by, ck){
      reply(function(){
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(no) })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + no + " ในชีท");
        if(String(o.status||"").trim() === "ยกเลิก")
          throw new Error("ออเดอร์ " + no + " ถูกยกเลิกไปแล้ว");
        if(String(why||"").trim().length < 5)
          throw new Error("ต้องบอกเหตุผลที่ยกเลิกอย่างน้อย 5 ตัวอักษร");
        var live = MOCK_DOCS.filter(function(d){
          return d.orderNo === String(no) && !d.voidWhy;
        }).map(function(d){ return d.no + " (" + d.type + ")" });
        if(live.length) throw new Error("ออเดอร์ " + no + " ออกเอกสารไปแล้ว: "
          + live.join(", ") + " — ให้กดยกเลิกใบเดิมในหน้าเอกสารก่อน");
        var n = (o.items||[]).length;
        o.items = []; o.subtotal = 0; o.vatAmt = 0; o.discount = 0; o.ship = 0;
        o.net = 0; o.cost = 0; o.profit = 0;
        o.status = "ยกเลิก";
        o.note = (o.note ? o.note + " " : "") + "[ยกเลิก: " + why + " โดย " + (by||"") + "]";
        return { ok:true, no:o.no, cust:o.cust, netBefore:0, items:n, cuts:n, recv:0, lots:[] };
      });
    },
    /* รายชื่อลูกค้าเก่า — ของจริงอ่านจากชีทหัวบิลกับชีทเอกสาร แล้วรวมชื่อซ้ำเป็นคนเดียว */
    getCustomers: function(limit){
      reply(function(){
        var by = {};
        MOCK_ORDERS.forEach(function(o){
          var k = String(o.cust||"").trim();
          if(!k) return;
          var c = by[k] || (by[k] = { name:k, tel:"", addr:"", taxAddr:"", taxId:"",
                                      branch:"", email:"", last:"", n:0 });
          c.n++;
          if(String(o.date||"") >= c.last){
            c.last = String(o.date||"");
            if(o.tel) c.tel = o.tel;
            if(o.addr) c.addr = o.addr;
          }
        });
        MOCK_DOCS.forEach(function(d){
          var k = String((d.cust||{}).name||"").trim();
          if(!k) return;
          var c = by[k] || (by[k] = { name:k, tel:"", addr:"", taxAddr:"", taxId:"",
                                      branch:"", email:"", last:"", n:0 });
          if(d.cust.taxId) c.taxId = d.cust.taxId;
          if(d.cust.addr)  c.taxAddr = d.cust.addr;
          if(d.cust.tel)   c.tel = d.cust.tel;
          if(d.cust.email) c.email = d.cust.email;
          if(d.cust.branch) c.branch = d.cust.branch;
        });
        var out = [];
        for(var k in by) out.push(by[k]);
        out.sort(function(a,b){ return a.last < b.last ? 1 : (a.last > b.last ? -1 : 0) });
        return out.slice(0, Number(limit) || 400);
      });
    },
    saveSignature: function(which, sig){
      reply(function(){
        if(["cashier","auth"].indexOf(String(which)) < 0)
          throw new Error("ไม่รู้ว่าจะเก็บลายเซ็นของใคร");
        MOCK_SIGN[which] = String(sig||"");
        return { ok:true, which:which, has: !!MOCK_SIGN[which] };
      });
    },
    signDoc: function(no, sig, by){
      reply(function(){
        var f = MOCK_DOCS.filter(function(d){ return d.no === String(no) })[0];
        if(!f) throw new Error("ไม่พบเอกสารเลขที่ " + no + " ในชีท เอกสาร");
        if(f.voidWhy) throw new Error("ใบ " + no + " ถูกยกเลิกไปแล้ว (" + f.voidWhy + ")");
        if(!sig) throw new Error("ยังไม่ได้เซ็น");
        f.sign = String(sig);
        return { ok:true, no:f.no, at:"02/09/2026 13:20" };
      });
    },
    voidDoc: function(no, why, by){
      reply(function(){
        var f = MOCK_DOCS.filter(function(d){ return d.no === String(no) })[0];
        if(!f) throw new Error("ไม่พบเอกสารเลขที่ " + no + " ในชีท เอกสาร");
        if(f.voidWhy) throw new Error("ใบ " + no + " ถูกยกเลิกไปแล้ว (" + f.voidWhy + ")");
        var r = String(why||"").trim();
        if(r.length < 5) throw new Error("ต้องบอกเหตุผลที่ยกเลิกอย่างน้อย 5 ตัวอักษร");
        f.voidWhy = r + " [ยกเลิกโดย " + (by||"") + " 01/09/2026 19:45]";
        return { ok:true, no:f.no, type:f.type, orderNo:f.orderNo, voidWhy:f.voidWhy };
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
          if(it.free){
            sub+=Math.round(Number(it.qty)*(Number(it.price)||0)*100)/100;
            return;
          }
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
    if n not in (0, 7):
        sys.exit("คาดว่าจะมี include 7 อัน (หรือ 0 ถ้ารวมไฟล์มาแล้ว) แต่เจอ %d อัน" % n)

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
