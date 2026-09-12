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
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
GS = ROOT / "apps-script"

PRODUCTS = [
    {"sku": "SKU-141", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 129, "remain": 980,
     "cost": 64, "name": "End Mill Corn cut 2F  3.0*15*3.175*38L (1pcs)"},
    {"sku": "SKU-143", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 149, "remain": 500,
     "name": "End Mill Corn cut 2F  3.175*22*3.175*45L (1pcs)"},
    {"sku": "SKU-160", "group": "TOOLING", "unit": "ชุด", "perPack": 10, "price": 750, "remain": 40,
     "name": "Set D1.8×8.5×3.175×38L Endmill Corn Cut 2F (10pcs)"},
    {"sku": "SKU-161", "group": "TOOLING", "unit": "ชิ้น", "perPack": 1, "price": 95, "remain": 300,
     "name": "End Mill Corn cut 2F 1.8*8.5*3.175*38L (1pcs)"},
    {"sku": "CHEM-001", "group": "CHEMICAL", "unit": "แกลลอน", "perPack": 1, "price": 1200, "remain": 14,
     "name": "น้ำยาหล่อเย็น 20L", "reorder": 20},
]

BOOT = {
    "staff": "somchai@chem-inno-tech.com",
    "shop": "AST Chem-Tooling",
    "vatRate": 0.07,
    # จุดสั่งซื้อกลาง ใช้กับสินค้าที่ไม่ได้ตั้งจุดสั่งซื้อของตัวเอง
    "reorderDefault": 50,
    "lists": {
        "channel": ["หน้าร้าน", "Shopee", "เพจ Facebook"],
        "carrier": ["Flash Express", "Kerry Express", "ไปรษณีย์ไทย", "ส่งด่วน (ไรเดอร์)",
                    "รับเองที่ร้าน", "Shopee Xpress (SPX)", "J&T Express"],
        "vat": ["ไม่รับ VAT", "รับ VAT"],
        "status": ["รอชำระ", "ชำระแล้ว", "จัดของแล้ว", "ส่งแล้ว", "ยกเลิก"],
        "acct": ["ยังไม่ส่งบัญชี", "รอเอกสาร", "พร้อมส่งบัญชี", "ส่งบัญชีแล้ว",
                 "บัญชีตีกลับ"],
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
var MOCK_MONTHS = {};     /* ยอดที่กรอกเองในชีท สรุปเดือน คีย์เป็น "ปี-เดือน|ช่องทาง" */
var MOCK_SIGN = {};       /* ลายเซ็นฝั่งร้านที่เซ็นเก็บไว้ (ของจริงอยู่ในชีท ตั้งค่าแอป) */
var MOCK_SLIPS = [];      /* สลิปที่แนบในรอบนี้ (ของจริงอยู่ในชีท หลักฐานการชำระเงิน) */
window.SENT = [];
window.google = { script: { run: (function(){
  var ok=null, bad=null;
  var api = {
    withSuccessHandler: function(f){ ok=f; return api },
    withFailureHandler: function(f){ bad=f; return api },
    getBootstrap: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_BOOT)) }) },
    getOrders: function(){ reply(function(){ return JSON.parse(JSON.stringify(MOCK_ORDERS)) }) },
    /* ค้นออเดอร์ทั้งชีท — ของจริงค้นในชีท ที่นี่ค้นในรายการจำลอง */
    searchOrders: function(q, limit){
      reply(function(){
        var want = String(q||"").trim().toLowerCase();
        if(want.length < 2) return [];
        var digits = want.replace(/\D/g,"");
        return JSON.parse(JSON.stringify(MOCK_ORDERS.filter(function(o){
          if(String(o.no||"").toLowerCase().indexOf(want) > -1) return true;
          if(String(o.cust||"").toLowerCase().indexOf(want) > -1) return true;
          if(String(o.track||"").toLowerCase().indexOf(want) > -1) return true;
          if(String(o.channel||"").toLowerCase().indexOf(want) > -1) return true;
          if(digits.length >= 3 &&
             String(o.tel||"").replace(/\D/g,"").indexOf(digits) > -1) return true;
          return false;
        }))).slice(0, Number(limit)||30);
      });
    },
    /* สรุปยอดรายวัน — ของจริงกรองในชีท ที่นี่กรองในรายการจำลอง */
    getDayReport: function(iso, days){
      reply(function(){
        var day = String(iso||"").trim();
        if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("วันที่ไม่ถูกต้อง: " + day);
        var back = Math.max(1, Math.min(31, Number(days)||7));
        function shift(n){
          var p = day.split("-");
          var d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2])+n);
          var z = function(x){ return x<10?"0"+x:""+x };
          return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
        }
        var trend=[], byDate={};
        for(var i=0;i<back;i++){
          var dd = shift(-(back-1-i));
          byDate[dd] = { date:dd, n:0, net:0, profit:0 };
          trend.push(byDate[dd]);
        }
        var orders=[];
        MOCK_ORDERS.forEach(function(o){
          if(o.date === day) orders.push(JSON.parse(JSON.stringify(o)));
          if(String(o.status||"").trim() === "ยกเลิก") return;
          var t = byDate[o.date];
          if(t){ t.n++; t.net += Number(o.net)||0; t.profit += Number(o.profit)||0 }
        });
        orders.sort(function(a,b){ return a.no < b.no ? -1 : (a.no > b.no ? 1 : 0) });
        return { date:day, orders:orders, trend:trend };
      });
    },
    setTracking: function(no,track,status,carrier){
      window.SENT.push({fn:"setTracking", no:no, track:track, status:status, carrier:carrier});
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        MOCK_ORDERS.forEach(function(o){
          if(o.no!==no) return;
          /* null = ไม่ได้จะแก้ช่องนั้น · "" = แก้ให้เป็นค่าว่างจริง ๆ */
          if(track!==null && track!==undefined) o.track = track;
          if(status) o.status = status;
          if(carrier!==null && carrier!==undefined) o.carrier = carrier;
        });
        var cur = MOCK_ORDERS.filter(function(o){ return o.no===no })[0] || {};
        return {ok:true,no:no,changed:true,track:cur.track||"",carrier:cur.carrier||""};
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
        /* บิลเงินสดมีชุดเลขของตัวเอง (CS) แยกจากชุดใบกำกับภาษี (ONIV) เหมือนของจริง
           ถ้าที่นี่ให้ใช้ชุดเดียวกัน ข้อสอบจะผ่านทั้งที่ของจริงยังปนกันอยู่ */
        var pre = { rec:"ONIV26-", inv:"IV26-", quote:"QO26-", dep:"DR26-",
                    cash:"CS26-" }[p.type] || "DOC-";
        var th = { rec:"ใบเสร็จรับเงิน", inv:"ใบแจ้งหนี้", quote:"ใบเสนอราคา",
                   dep:"ใบรับเงินมัดจำ", cash:"บิลเงินสด" }[p.type];
        /* เลขวิ่งต่อทีละใบเหมือนของจริง (nextDocNo_ = เลขสูงสุดในเล่ม + 1)
           ถ้าตรึงเลขไว้ตัวเดียว ใบที่สองจะทับเลขใบแรกและข้อสอบจะหลอกตัวเอง */
        var seq = ({ rec:231, inv:1, quote:114, dep:1, cash:1 }[p.type] || 1)
          + MOCK_DOCS.filter(function(x){ return x.type === th }).length;
        var no = pre + ("0000"+seq).slice(-5);
        /* เก็บใบที่ออกไว้ในทะเบียน เพื่อให้กดพิมพ์ซ้ำได้เหมือนของจริง */
        MOCK_DOCS.push({ no:no, type:th, date:p.date||"", orderNo:p.orderNo||"",
                         cust:p.cust||{}, po:p.po||"", terms:p.terms||"", note:p.note||"",
                         form:p.form||[], vatMode:p.vatMode||"", novat:!!p.novat,
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
          var rv = (String(d.note||"").match(/\[แก้ไขครั้งที่ [^\]]*\]/g) || []);
          return { no:d.no, type:d.type, date:d.date, orderNo:d.orderNo,
                   custName:d.cust.name, total:d.doc.total, voidWhy:d.voidWhy||"",
                   sentAt:d.sentAt||"", hasSnap:true, revised:rv.length,
                   lastRevise: rv.length ? rv[rv.length-1].replace(/^\[|\]$/g,"") : "" };
        }).reverse();
      });
    },
    /* ---------------- รับเงิน ----------------
       บัญชีสองชุดล้อของจริง ชุดไม่มี VAT ในระบบจริงเว้นว่างไว้ให้กรอกในชีท
       ที่นี่ใส่ค่าสมมติเพื่อให้กดดูหน้าจอได้ครบทาง (ไม่ใช่เลขบัญชีจริงของร้าน) */
    payAsk: function(orderNo){
      reply(function(){
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(orderNo) })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + orderNo + " ในชีท");
        var wantVat = String(o.vat||"").indexOf("ไม่") < 0 && String(o.vat||"").indexOf("รับ") > -1;
        var acct = wantVat
          ? { bank:"ไทยพาณิชย์ (SCB)", acct:"431-039435-5",
              name:"บริษัท เคมีคอล อินโนเวชั่น เทคโนโลยี แอนด์ อินสตรูเมนท์ จำกัด",
              pp:"0105558055790", which:"บิลมี VAT", miss:[],
              link:"https://www.scb.co.th/th/personal-banking.html" }
          /* ชุดไม่มี VAT ตั้งเป็นไม่ใช้พร้อมเพย์ ให้ตรงกับที่ร้านตั้งไว้จริง
             พรีวิวจะได้โชว์ทางที่ "ไม่มี QR" ด้วย ไม่ใช่โชว์แต่ทางที่มี */
          : { bank:"กรุงศรีอยุธยา", acct:"000-000000-0", name:"ชื่อบัญชีสมมติ",
              pp:"", which:"บิลไม่มี VAT", miss:[], link:"" };
        var qr = null, qrWhy = "", qrOff = false;
        if(!acct.pp){
          qrOff = true;
          qrWhy = "รับเงินด้วยการโอนเข้าบัญชี ไม่ได้ใช้ QR (เปิดใช้ได้ที่ช่องพร้อมเพย์ ในชีท ตั้งค่าแอป)";
        }else if(Number(o.net) > 0){
          var payload = PAY_SRV.ppPayload_(acct.pp, o.net);
          var t = PAY_SRV.ppTarget_(acct.pp);
          qr = { rows: PAY_SRV.qrModules_(payload), payload: payload,
                 target: t.val, kind: t.kind, amount: Number(o.net) };
        }else{
          qrWhy = "ออเดอร์ใบนี้ยอดเป็นศูนย์ จึงทำ QR เรียกเก็บเงินไม่ได้";
        }
        var L = ["ออเดอร์ " + o.no + (o.cust ? " · " + o.cust : ""), ""];
        if(!wantVat){
          L.push("รบกวนแจ้งเพื่อความเข้าใจตรงกันนะคะ");
          L.push("ราคาสินค้ายังไม่รวม VAT และไม่มีใบกำกับภาษีค่ะ");
          L.push("");
        }
        L.push("🏦 ธนาคาร: " + acct.bank);
        L.push("🔢 เลขบัญชี: " + acct.acct);
        L.push("ชื่อบัญชี: " + acct.name);
        L.push("");
        /* ใส่จุลภาคให้เหมือน money_ ตัวจริงฝั่งชีท ไม่งั้นพรีวิวจะสอนเราผิด
           ว่าข้อความที่ลูกค้าได้หน้าตาเป็นแบบไม่มีจุลภาค */
        var amtTxt = "฿" + Number(o.net).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        L.push("💰 ยอดที่ต้องโอน " + amtTxt + (wantVat ? " (รวม VAT 7% แล้ว)" : ""));
        L.push("");
        if(acct.link){ L.push("📲 เปิดแอพธนาคาร: " + acct.link); L.push("") }
        if(wantVat){
          L.push("📌 ออกใบกำกับภาษีได้ค่ะ");
          L.push("หลังโอนชำระเงิน กรุณาส่งสลิปยืนยันการโอน");
          L.push("พร้อมแจ้งชื่อ-ที่อยู่สำหรับออกใบกำกับภาษีด้วยนะคะ");
          L.push("ขอบคุณค่ะ 🙏");
        }else{
          L.push("✅️▶️ โอนแล้วส่งสลิปยืนยันได้เลยค่ะ 🙏");
        }
        return { no:o.no, cust:o.cust, date:o.date, net:Number(o.net),
                 status:o.status, vat:o.vat, wantVat:wantVat, acct:acct,
                 qr:qr, qrWhy:qrWhy, qrOff:qrOff, msg:L.join("\\n"), miss:[],
                 slips: MOCK_SLIPS.filter(function(x){ return x.no === o.no }).slice().reverse() };
      });
    },
    addSlip: function(orderNo, p){
      reply(function(){
        p = p || {};
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(orderNo) })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + orderNo + " ในชีท");
        var m = /^data:([^;]+);base64,/.exec(String(p.data||""));
        if(!m) throw new Error("ยังไม่ได้เลือกไฟล์สลิป หรือไฟล์อ่านไม่ออก");
        var okMime = /^(image\\/(jpeg|jpg|png|webp|heic|heif)|application\\/pdf)$/.test(m[1].toLowerCase());
        if(!okMime) throw new Error("ไฟล์ชนิด " + m[1] + " แนบไม่ได้ — รับเฉพาะรูปกับ PDF");
        var amt = Number(p.amount||0);
        var fid = "mock-slip-" + (MOCK_SLIPS.length + 1);
        MOCK_SLIPS.push({ no:o.no, at:new Date().toISOString(), paidAt:p.paidAt||"",
          amount:amt, bank:p.bank||"", fileName:"สลิป " + o.no + " " + fid + ".jpg",
          fileUrl:"https://drive.google.com/file/d/" + fid + "/view",
          by:MOCK_BOOT.staff, status:"รอตรวจสอบ", checkBy:"", checkAt:"", note:"", fileId:fid });
        var warn = (amt > 0 && Math.abs(amt - Number(o.net)) >= 0.01)
          ? "ยอดในสลิป ฿" + amt.toFixed(2) + " ไม่เท่ายอดออเดอร์ ฿" + Number(o.net).toFixed(2) : "";
        return { ok:true, no:o.no, fileId:fid, warn:warn,
                 fileName:"สลิป " + o.no + " " + fid + ".jpg",
                 fileUrl:"https://drive.google.com/file/d/" + fid + "/view",
                 slips: MOCK_SLIPS.filter(function(x){ return x.no === o.no }).slice().reverse() };
      });
    },
    setSlipStatus: function(fileId, status, why, alsoPaid){
      reply(function(){
        var sp = MOCK_SLIPS.filter(function(x){ return x.fileId === String(fileId) })[0];
        if(!sp) throw new Error("ไม่พบสลิปใบนี้ในชีท หลักฐานการชำระเงิน");
        if(["รอตรวจสอบ","ยืนยันแล้ว","ไม่ใช่ของใบนี้"].indexOf(String(status)) < 0){
          throw new Error("สถานะสลิป \\"" + status + "\\" ไม่มีในตัวเลือกของชีท ตั้งค่า");
        }
        sp.status = String(status); sp.checkBy = MOCK_BOOT.staff;
        sp.checkAt = new Date().toISOString(); sp.note = String(why||"");
        if(alsoPaid && sp.status === "ยืนยันแล้ว"){
          MOCK_ORDERS.forEach(function(o){ if(o.no === sp.no) o.status = "ชำระแล้ว" });
        }
        return { ok:true, no:sp.no, fileId:sp.fileId, status:sp.status,
                 slips: MOCK_SLIPS.filter(function(x){ return x.no === sp.no }).slice().reverse() };
      });
    },
    slipMonths: function(){
      reply(function(){
        var seen = {}, out = [];
        MOCK_SLIPS.forEach(function(x){
          var ym = String(x.paidAt || x.at).slice(0, 7);
          if(ym.length === 7 && !seen[ym]){ seen[ym] = 1; out.push(ym) }
        });
        out.sort(); out.reverse();
        return { months: out, total: MOCK_SLIPS.length };
      });
    },
    /* ของจริงคืนไฟล์ .xlsx ที่ Apps Script ประกอบด้วย Utilities.zip
       ในเบราว์เซอร์เปล่า ๆ บีบ zip เองไม่ได้ พรีวิวจึงคืนเป็นไฟล์ข้อความแทน
       เส้นทางที่พรีวิวพิสูจน์ได้คือ "กดแล้วไฟล์ถูกบันทึกลงเครื่องไหม"
       ส่วนหน้าตาข้างในไฟล์ .xlsx มีข้อสอบฝั่งชีทคุมไว้ใน t_pay.js แล้ว */
    exportSlips: function(ym){
      reply(function(){
        var want = String(ym || "");
        var rows = MOCK_SLIPS.filter(function(x){
          return !want || String(x.paidAt || x.at).slice(0, 7) === want;
        });
        if(!rows.length){
          throw new Error(want ? "เดือน " + want + " ไม่มีสลิปสักใบ จึงไม่มีอะไรให้ส่งออก"
                               : "ยังไม่มีสลิปในระบบเลย");
        }
        var txt = ["เลขที่ออเดอร์\\tยอดตามสลิป\\tสถานะ"].concat(rows.map(function(x){
          return x.no + "\\t" + x.amount + "\\t" + x.status;
        })).join("\\n");
        /* ชื่ออังกฤษล้วนเหมือนของจริง — Chrome ทิ้งชื่อไฟล์ที่มีอักษรไทยทั้งชื่อ */
        return { ok:true, name:"AST-slip-" + (want || "all") + ".txt",
                 mime:"text/plain", count:rows.length, ym:want,
                 data:"data:text/plain;base64," + btoa(unescape(encodeURIComponent(txt))) };
      });
    },
    slipsWaiting: function(){
      reply(function(){
        var by = {}, n = 0;
        MOCK_SLIPS.forEach(function(x){
          if(x.status !== "รอตรวจสอบ") return;
          by[x.no] = (by[x.no]||0) + 1; n++;
        });
        return { total:n, byOrder:by };
      });
    },
    /* ค้นเอกสารทั้งชีท ทุกชนิด — ของจริงคือ findDocs ใน Api.gs
       ต่างจาก listDocs ตรงที่ไม่กรองใบที่มีเลขออเดอร์ทิ้ง (ใบกำกับภาษีมีเลขออเดอร์ทุกใบ) */
    findDocs: function(p){
      reply(function(){
        p = p || {};
        var want = String(p.q||"").trim().toLowerCase();
        var type = String(p.type||"").trim();
        var limit = Math.min(Math.max(Number(p.limit)||30, 1), 200);
        var hit = [], counts = {};
        MOCK_DOCS.slice().reverse().forEach(function(d){
          var rv = (String(d.note||"").match(/\[แก้ไขครั้งที่ [^\]]*\]/g) || []);
          var row = { no:d.no, type:d.type, date:d.date, orderNo:d.orderNo||"",
                      custName:d.cust.name, total:d.doc.total, voidWhy:d.voidWhy||"",
                      sentAt:d.sentAt||"", hasSnap:true,
                      revised: rv.length,
                      lastRevise: rv.length ? rv[rv.length-1].replace(/^\[|\]$/g,"") : "" };
          if(want){
            var hay = (row.no+" "+row.custName+" "+row.orderNo+" "+row.type).toLowerCase();
            if(hay.indexOf(want) < 0) return;
          }
          var c = counts[row.type] || (counts[row.type] = {n:0,live:0,revised:0,dead:0});
          c.n++;
          if(row.voidWhy) c.dead++; else if(row.revised) c.revised++; else c.live++;
          if(type && row.type !== type) return;
          hit.push(row);
        });
        return { rows: hit.slice(0, limit), total: hit.length, counts: counts };
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
        var tk = { "ใบเสร็จรับเงิน":"rec", "ใบแจ้งหนี้":"inv", "ใบเสนอราคา":"quote",
                   "ใบรับเงินมัดจำ":"dep", "บิลเงินสด":"cash" }[f.type] || "rec";
        /* ใบที่ใช้เลขชุดใบกำกับภาษี แก้ให้กลายเป็นใบไม่มี VAT ไม่ได้ — เหมือนของจริง */
        if(p.novat && tk !== "cash"){
          throw new Error("ใบ " + f.no + " เป็น" + f.type + " ซึ่งใช้เลขชุดใบกำกับภาษี "
            + "แก้ให้กลายเป็นใบไม่มี VAT ไม่ได้ — ให้ยกเลิกใบนี้ "
            + "แล้วออกใหม่เป็น “บิลเงินสด” ซึ่งมีชุดเลขของตัวเอง");
        }
        var d = DOC_SRV.buildDoc_(tk,
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
    /* ประวัติคำสั่งซื้อของลูกค้ารายเดียว — ของจริงกรองในชีทด้วยชื่อลูกค้า */
    getCustomerHistory: function(name, limit){
      reply(function(){
        var want = String(name||"").trim().toLowerCase();
        if(!want) return { cust:"", orders:[], n:0, total:0, profit:0, due:0, dueN:0 };
        var list = MOCK_ORDERS.filter(function(o){
          return String(o.cust||"").trim().toLowerCase() === want;
        }).slice(0, Number(limit)||60);
        var t = { cust:String(name).trim(), orders:JSON.parse(JSON.stringify(list)),
                  n:0, total:0, profit:0, due:0, dueN:0 };
        list.forEach(function(o){
          var st = String(o.status||"").trim();
          if(["ยกเลิก","ตีกลับ"].indexOf(st) > -1) return;
          t.n++; t.total += Number(o.net)||0; t.profit += Number(o.profit)||0;
          if(st !== "ชำระแล้ว"){ t.dueN++; t.due += Number(o.net)||0 }
        });
        return t;
      });
    },
    /* ลูกค้าคืนของ / ของตีกลับ — ของจริงคืนของเข้าล็อตแล้ววางแผนใบใหม่ */
    returnOrder: function(p){
      reply(function(){
        p = p || {};
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(p.no||"") })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ " + p.no);
        if(["ยกเลิก","ตีกลับ"].indexOf(String(o.status||"").trim()) > -1)
          throw new Error("ออเดอร์ " + o.no + " ขึ้นสถานะ " + o.status + " ไปแล้ว");
        if(String(p.why||"").trim().length < 5)
          throw new Error("ต้องบอกเหตุผลที่ของตีกลับอย่างน้อย 5 ตัวอักษร");
        var sold = (o.items||[]).filter(function(it){ return it.sku && Number(it.qty) > 0 });
        if(!sold.length) throw new Error("ออเดอร์ " + o.no + " ไม่มีรายการสินค้าให้คืน");

        var whole = !p.lines || !p.lines.length;
        var byS = {};
        (p.lines||[]).forEach(function(l){
          if(l && l.sku && Number(l.qty) > 0) byS[l.sku] = (byS[l.sku]||0) + Number(l.qty);
        });
        for(var extra in byS){
          if(!sold.filter(function(it){ return it.sku === extra }).length)
            throw new Error("ออเดอร์ " + o.no + " ไม่มีสินค้า " + extra + " อยู่ในใบ — คืนไม่ได้");
        }

        var left = [], back = [], n = 0;
        sold.forEach(function(it){
          var q = Number(it.qty), ret = whole ? q : (byS[it.sku]||0);
          if(ret > q) throw new Error(it.sku + " ขายไป " + q + " ชิ้น คืนกลับมา " + ret + " ชิ้นไม่ได้");
          if(ret > 0){ back.push(it.sku + " x" + ret); n += ret }
          if(q - ret > 0){
            var c = JSON.parse(JSON.stringify(it));
            c.qty = q - ret; c.total = c.qty * Number(c.price||0);
            left.push(c);
          }
        });
        if(!n) throw new Error("ยังไม่ได้เลือกว่าจะคืนสินค้าตัวไหนกี่ชิ้น");

        o.items = left;
        o.ship = 0;
        o.subtotal = left.reduce(function(a,x){ return a + Number(x.total||0) }, 0);
        o.net = o.subtotal + Number(o.vatAmt||0) - Number(o.discount||0);
        if(!left.length){
          o.subtotal = 0; o.vatAmt = 0; o.discount = 0; o.net = 0;
          o.cost = 0; o.profit = 0; o.status = "ตีกลับ";
          o.note = (o.note ? o.note + " " : "") + "[ตีกลับ: " + p.why + "]";
        } else {
          o.note = (o.note ? o.note + " " : "")
            + "[ตีกลับบางส่วน: " + back.join(", ") + " — " + p.why + "]";
        }
        return { ok:true, no:o.no, whole:!left.length, kind:"ตีกลับ",
                 returned:back, qtyBack:n, items:left.length };
      });
    },
    /* สรุปรายเดือน — ของจริงคิดจากชีทหัวบิลแล้วผสมกับที่กรอกไว้ในชีท สรุปเดือน
       แยกตามช่องทางขาย ยอดของเดือนคือผลรวมของช่องทาง ไม่ได้เก็บซ้ำอีกที่ */
    getMonthReport: function(months){
      reply(function(){
        var typed = MOCK_MONTHS, calc = {};
        MOCK_ORDERS.forEach(function(o){
          var st = String(o.status||"").trim();
          if(st==="ยกเลิก" || st==="ตีกลับ") return;
          var m = /^(\d{4})-(\d{2})/.exec(String(o.date||""));
          if(!m) return;
          var k = m[1]+"-"+m[2]+"|"+(String(o.channel||"").trim() || "อื่น ๆ");
          var c = calc[k] || (calc[k] = { n:0, sales:0, cost:0 });
          c.n++; c.sales += Number(o.net)||0; c.cost += Number(o.cost)||0;
        });
        var byMonth = {};
        function slot(ym, chan){
          var m = byMonth[ym] || (byMonth[ym] = { ym:ym, chans:{} });
          return m.chans[chan] || (m.chans[chan] = 1);
        }
        for(var a in typed){ var pa = a.split("|"); slot(pa[0], pa[1]) }
        for(var b in calc){  var pb = b.split("|"); slot(pb[0], pb[1]) }
        var want = Number(months)||0, now = new Date();
        for(var i=0;i<want;i++){
          var d = new Date(now.getFullYear(), now.getMonth()-i, 1);
          var y = d.getFullYear()+"-"+(d.getMonth()<9?"0":"")+(d.getMonth()+1);
          if(!byMonth[y]) byMonth[y] = { ym:y, chans:{} };
        }
        var out = [];
        for(var ym in byMonth){
          var chans = [], tot = { orders:0, sales:0, cost:0, ads:0 };
          for(var chan in byMonth[ym].chans){
            var key = ym+"|"+chan;
            var t = typed[key] || {}, g = calc[key] || { n:0, sales:0, cost:0 };
            var sales = (t.sales===null||t.sales===undefined) ? g.sales : t.sales;
            var cost  = (t.cost===null ||t.cost===undefined)  ? g.cost  : t.cost;
            var ads   = Number(t.ads)||0;
            tot.orders += g.n; tot.sales += sales; tot.cost += cost; tot.ads += ads;
            chans.push({ chan:chan, orders:g.n, sales:sales, cost:cost, ads:ads,
                         gross:sales-cost, net:sales-cost-ads,
                         typedSales:t.sales!==null&&t.sales!==undefined,
                         typedCost:t.cost!==null&&t.cost!==undefined,
                         note:t.note||"" });
          }
          chans.sort(function(a,b){ return b.sales-a.sales || (a.chan<b.chan?-1:1) });
          out.push({ ym:ym, orders:tot.orders, sales:tot.sales, cost:tot.cost, ads:tot.ads,
                     gross:tot.sales-tot.cost, net:tot.sales-tot.cost-tot.ads,
                     chans:chans });
        }
        out.sort(function(a,b){ return a.ym<b.ym?1:(a.ym>b.ym?-1:0) });
        return out;
      });
    },
    saveMonth: function(p){
      reply(function(){
        p = p || {};
        var m = /^(\d{4})-(\d{2})/.exec(String(p.ym||""));
        if(!m) throw new Error("ยังไม่ได้บอกว่าเดือนไหน (ต้องเป็นแบบ 2026-01)");
        var key = m[1]+"-"+m[2]+"|"+(String(p.chan||"").trim() || "อื่น ๆ");
        var cur = MOCK_MONTHS[key]
          || (MOCK_MONTHS[key] = { sales:null, cost:null, ads:null, note:"" });
        ["sales","cost","ads"].forEach(function(f){
          if(!Object.prototype.hasOwnProperty.call(p,f)) return;
          cur[f] = (p[f]===""||p[f]===null||p[f]===undefined) ? null : Number(p[f])||0;
        });
        if(Object.prototype.hasOwnProperty.call(p,"note")) cur.note = String(p.note||"");
        return { ok:true, ym:m[1]+"-"+m[2], chan:key.split("|")[1] };
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
                                      branch:"", email:"", last:"", n:0,
                                      okN:0, deadN:0, total:0, profit:0, due:0, dueN:0 });
          c.n++;
          /* ใบที่ยกเลิก/ตีกลับไม่ใช่ยอดซื้อ — ของจริงคิดแบบเดียวกันในชีท */
          var st = String(o.status||"").trim();
          if(st==="ยกเลิก" || st==="ตีกลับ") c.deadN++;
          else {
            c.okN++;
            c.total  += Number(o.net)||0;
            c.profit += Number(o.profit)||0;
            if(st !== "ชำระแล้ว"){ c.dueN++; c.due += Number(o.net)||0 }
          }
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
                                      branch:"", email:"", last:"", n:0,
                                      okN:0, deadN:0, total:0, profit:0, due:0, dueN:0 });
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
                        note:f.note||"", voidWhy:f.voidWhy||"", cust:f.cust, form:f.form||[],
                        vatMode:f.vatMode||"", novat:!!f.novat },
                 saved:{ base:f.doc.base, vat:f.doc.vat, total:f.doc.total },
                 doc: JSON.parse(JSON.stringify(f.doc)) };
      });
    },
    /* รับของเข้า — ของจริงเขียนสองชีท ที่นี่ขยับตัวเลขในข้อมูลจำลองให้เหมือนกัน
       สำคัญตรงที่ต้องคืน remain / lotRemain กลับมา เพราะหน้าจอเอาไปโชว์ */
    receiveStock: function(p){
      window.SENT.push(p);
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        var pr = MOCK_BOOT.products.filter(function(x){ return x.sku===p.sku })[0];
        if(!pr) throw new Error("ไม่มีรหัส "+p.sku+" ในชีท ฐานสินค้า");
        var qty = Number(p.qty)||0;
        if(!(qty>0)) throw new Error("จำนวนที่รับเข้าต้องมากกว่า 0");
        var lot = MOCK_BOOT.lots[p.sku];
        if(lot && !p.lotNo) throw new Error(p.sku+" เป็นสินค้าที่คุมล็อต — ต้องใส่เลขล็อตด้วย");
        if(pr.remain !== null && pr.remain !== undefined) pr.remain = Number(pr.remain) + qty;
        if(p.lotNo){
          if(!lot) lot = MOCK_BOOT.lots[p.sku] = { total:0, count:0, next:null };
          lot.total += qty; lot.count += 1;
        }
        return { ok:true, sku:p.sku, name:pr.name, qty:qty, lotNo:p.lotNo||"",
                 exp:p.exp||"", remain:(pr.remain===undefined?null:pr.remain),
                 lotRemain:(p.lotNo && lot)?lot.total:null, recvRow:9, lotRow:p.lotNo?9:0 };
      });
    },
    /* ตรวจออเดอร์ Shopee ก่อนนำเข้า — ล้อตรรกะฝั่งชีทตัวจริง (Api.gs)
       จับคู่ด้วยรหัสก่อน แล้วค่อยชื่อ · ใบที่เคยนำเข้าแล้วดูจากคำว่า Shopee ในหมายเหตุ */
    shopeeMatch: function(list){
      window.SENT.push({fn:"shopeeMatch", n:(list||[]).length});
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        function norm(s){
          return String(s==null?"":s).replace(/[()\[\]{}]/g," ")
            .replace(/\s+/g," ").trim().toLowerCase();
        }
        var bySku={}, byName={};
        MOCK_BOOT.products.forEach(function(p){
          bySku[String(p.sku).trim().toLowerCase()]=p;
          var n=norm(p.name); if(n && !byName[n]) byName[n]=p;
        });
        var done={};
        MOCK_ORDERS.forEach(function(o){
          var m=/Shopee\s+([A-Za-z0-9]+)/.exec(String(o.note||""));
          if(m) done[m[1]]=o.no;
        });
        function hit(sku,name){
          var s=String(sku||"").trim().toLowerCase();
          if(s && bySku[s]) return bySku[s];
          var n=norm(name); if(!n) return null;
          if(byName[n]) return byName[n];
          for(var k in byName){
            if(k && (n.indexOf(k)===0 || k.indexOf(n)===0)) return byName[k];
          }
          return null;
        }
        var already=0;
        var out=(list||[]).map(function(o){
          var issues=[], sub=0, cost=0, costKnown=true;
          var items=(o.lines||[]).map(function(ln){
            var p=hit(ln.sku, ln.name);
            var qty=Number(ln.qty);
            var price=(ln.price===""||ln.price==null)?null:Number(ln.price);
            if(!p) issues.push('จับคู่สินค้าไม่ได้: "'+(ln.name||ln.sku||"(ไม่มีชื่อ)")+'"');
            if(!(qty>0)||qty!==Math.floor(qty)) issues.push('จำนวนไม่ถูกต้อง: "'+ln.qty+'"');
            if(p && qty>0){
              sub+=Math.round(qty*(price===null?Number(p.price||0):price)*100)/100;
              if(p.cost===""||p.cost==null) costKnown=false;
              else cost+=Math.round(qty*Number(p.cost)*100)/100;
            }
            return { sku:p?p.sku:"", name:p?p.name:String(ln.name||""),
                     shopeeName:String(ln.name||""), shopeeSku:String(ln.sku||""),
                     qty:qty, price:price, ok:!!p,
                     cost:(p && p.cost!=="" && p.cost!=null)?Number(p.cost):null };
          });
          if(!items.length) issues.push("ใบนี้ไม่มีรายการสินค้า");
          if(!o.sn) issues.push("ไม่มีหมายเลขคำสั่งซื้อของ Shopee — กันนำเข้าซ้ำไม่ได้");
          var dup=!!(o.sn && done[o.sn]);
          if(dup) already++;
          return { sn:o.sn||"", date:o.date||"", cust:o.cust||"",
                   status:o.status||"", back:!!o.back, done:!!o.done,
                   backWhy:o.backWhy||"",
                   items:items, subtotal:Math.round(sub*100)/100,
                   costTotal: costKnown?Math.round(cost*100)/100:null,
                   profit: costKnown?Math.round((sub-cost)*100)/100:null,
                   issues:issues, ok:(!issues.length && !dup), already:dup,
                   existingNo:dup?done[o.sn]:"" };
        });
        return { orders:out, already:already };
      });
    },
    /* ส่งบัญชี — ของจริงเขียนไฟล์ลงไดรฟ์ ที่นี่แค่จำไว้ว่าส่งอะไรไป
       ข้อสอบสนใจว่าหน้าจอส่ง "อะไร" ขึ้นไป ไม่ใช่ไฟล์ไปโผล่ที่ไหน */
    acctPack: function(no){
      window.SENT.push({fn:"acctPack", no:no});
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        var o = MOCK_ORDERS.filter(function(x){ return x.no === String(no) })[0];
        if(!o) throw new Error("ไม่พบออเดอร์ "+no);
        return {
          no:o.no, date:o.date, channel:o.channel, cust:o.cust,
          net:o.net, vatAmt:o.vatAmt||0, status:o.status,
          acct:o.acct||"ยังไม่ส่งบัญชี", acctAt:o.acctAt||"", acctWhat:o.acctWhat||"",
          docs: MOCK_DOCS.filter(function(d){ return d.orderNo === o.no && !d.voidWhy })
            .map(function(d){ return {no:d.no, type:d.type, date:d.date, total:d.total, hasSnap:true} })
        };
      });
    },
    setAcctStatus: function(no, st){
      window.SENT.push({fn:"setAcctStatus", no:no, acct:st});
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        MOCK_ORDERS.forEach(function(o){ if(o.no===String(no)) o.acct = st });
        return {ok:true, no:no, acct:st};
      });
    },
    sendToAccounting: function(p){
      window.SENT.push(p);
      reply(function(){
        if(window.MOCK_FAIL) throw new Error(window.MOCK_FAIL);
        var sent = (p.files||[]).map(function(f){ return f.name });
        if((p.extras||[]).length) sent.push("สรุป-"+p.no+".txt");
        var at = "2026-09-08 10:30";
        MOCK_ORDERS.forEach(function(o){
          if(o.no===String(p.no)){ o.acct="ส่งบัญชีแล้ว"; o.acctAt=at; o.acctWhat=sent.join(" · ") }
        });
        return {ok:true, no:p.no, at:at, sent:sent,
                folderUrl:"https://drive.google.com/drive/folders/FAKE",
                folderName:"2026-09",
                kinds: sent.map(function(){ return "pdf" })};
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


def check_scripts(html):
    """คอมไพล์ทุกก้อน <script> ด้วย node ก่อนเขียนไฟล์

    เคยเสีย escape ไปหนึ่งชั้นในตัวจำลอง (\\t ในซอร์ส Python กลายเป็นแท็บจริง)
    หน้าเว็บบูตไม่ขึ้นทั้งหน้า แต่สิ่งที่เห็นคือข้อสอบเบราว์เซอร์ค้างสี่นาที
    แล้วบอกแค่ว่า "รอ #form ไม่เจอ" ซึ่งไม่ได้ชี้ว่าพังตรงไหนเลย
    ตรวจตรงนี้เสียเวลาไม่ถึงวินาที และบอกบรรทัดที่ผิดให้ตรง ๆ
    """
    node = shutil.which("node")
    if not node:
        return          # เครื่องที่ไม่มี node ก็ยังสร้างพรีวิวได้ แค่ไม่มีด่านนี้
    blocks = re.findall(r"<script>([\s\S]*?)</script>", html)
    for i, code in enumerate(blocks):
        with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False,
                                         encoding="utf-8") as fh:
            fh.write(code)
            path = fh.name
        try:
            r = subprocess.run([node, "--check", path], capture_output=True, text=True)
            if r.returncode:
                head = code.strip().split("\n")[0][:70]
                sys.exit("สคริปต์ก้อนที่ %d ในหน้าพรีวิวคอมไพล์ไม่ผ่าน\n  ขึ้นต้นด้วย: %s\n%s"
                         % (i, head, r.stderr.strip()))
        finally:
            os.unlink(path)


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
    if n not in (0, 9):
        sys.exit("คาดว่าจะมี include 9 อัน (หรือ 0 ถ้ารวมไฟล์มาแล้ว) แต่เจอ %d อัน" % n)

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

    # ตัวสร้าง QR พร้อมเพย์ตัวจริง ยัดเข้าหน้าจำลองด้วย
    # QR ที่เห็นในพรีวิวจึงเป็น QR ที่สแกนได้จริง ไม่ใช่ลายสี่เหลี่ยมที่วาดหลอกตา
    pay_src = (GS / "Pay.gs").read_text(encoding="utf-8")
    cut = pay_src.find("/* ======================================================= เรียกเก็บเงิน")
    if cut < 0:
        sys.exit("หาจุดตัดส่วนที่ต้องใช้ Apps Script ใน Pay.gs ไม่เจอ")
    srv += ("<script>var PAY_SRV=(function(){" + pay_src[:cut] +
            "\nreturn {ppPayload_:ppPayload_,ppTarget_:ppTarget_,qrModules_:qrModules_};})();</script>")

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
    check_scripts(html)
    out.write_text(html, encoding="utf-8")
    print("เขียน %s (%.0f KB)" % (out, len(html.encode("utf-8")) / 1024))


if __name__ == "__main__":
    main()
