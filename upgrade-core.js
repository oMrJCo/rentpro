/* RentPro 3.0 — deterministic accounting and compatible migration. */
var RP = (function(){
  'use strict';
  var clone=x=>JSON.parse(JSON.stringify(x));
  var money=x=>Math.round((Number(x)+Number.EPSILON)*100)/100;
  var same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function migrate(d){
    ['rooms','tenants','contracts','payments'].forEach(k=>{if(!Array.isArray(d[k]))d[k]=[];});
    d.owner=d.owner||{};
    d.rp3=d.rp3||{cycles:[],invoices:[],receipts:[],audit:[]};
    ['cycles','invoices','receipts','audit'].forEach(k=>{if(!Array.isArray(d.rp3[k]))d.rp3[k]=[];});
    d.payments.forEach(p=>{
      if(d.rp3.invoices.some(i=>i.legacyId===p.id||i.id===p.id))return;
      var y=Number(p.year);if(y>2400)y-=543;
      var i={id:p.id,legacyId:p.id,number:'เดิม-'+p.id.slice(-6),period:y+'-'+String(p.month).padStart(2,'0'),roomId:p.roomId,tenantId:p.tenantId,contractId:p.contractId||'',rent:Number(p.rent)||0,water:Number(p.water)||0,electric:Number(p.electric)||0,other:Number(p.other)||0,total:money(p.total||0),state:'issued',due:p.date||'',note:p.note||'',createdAt:p.date||'',legacy:true,tenantName:tenantName(d,p.tenantId),roomName:(d.rooms.find(r=>r.id===p.roomId)||{}).name||'ไม่ระบุห้อง',owner:clone(d.owner)};
      d.rp3.invoices.push(i);
      if(p.status==='paid')d.rp3.receipts.push({id:'legacy-'+p.id,invoiceId:i.id,amount:i.total,date:p.date||'',method:'ข้อมูลเดิม',note:'ยอดชำระจากระบบเดิม',number:'เดิม-'+p.id.slice(-6)});
    });
    d.schemaVersion=3;return d;
  }
  function tenantName(d,id){var t=d.tenants.find(t=>t.id===id);return t?((t.prefix||'')+(t.fname||'')+' '+(t.lname||'')).trim():'ไม่ระบุผู้เช่า';}
  function balance(d,i){return money(i.total-d.rp3.receipts.filter(r=>r.invoiceId===i.id&&!r.voided).reduce((s,r)=>s+Number(r.amount),0));}
  function status(d,i,today){if(i.state==='void')return'ยกเลิก';if(i.state==='draft')return'ร่าง';var b=balance(d,i);if(b<=0)return'ชำระแล้ว';if(i.due&&i.due<today)return'เกินกำหนด';if(b<i.total)return'ชำระบางส่วน';return'รอชำระ';}
  function calcUtility(b,rows,key){
    if(!b||b.units===''||b.units==null||!Number.isFinite(Number(b.units))||Number(b.units)<0)throw Error('หน่วยในบิลหลักต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    if(b.usage===''||b.usage==null)throw Error('กรอกค่าการใช้ตามบิลหลัก หากไม่มีค่าใช้ให้กรอก 0');
    if(b.discount!=null&&b.discount!==''&&(!Number.isFinite(Number(b.discount))||Number(b.discount)<0))throw Error('ส่วนลดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    ['usage','service','tax'].forEach(k=>{if(!Number.isFinite(Number(b[k]))||Number(b[k])<0)throw Error('ยอดในบิลต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');});
    var ft=b.ft==null||b.ft===''?0:Number(b.ft);if(!Number.isFinite(ft))throw Error('ค่า Ft ต้องเป็นตัวเลข');var total=money(Number(b.usage)+Number(b.service)+ft+Number(b.tax)-Number(b.discount||0));if(total<0)throw Error('ต้นทุนรวมต้องไม่ติดลบ');if(b.billAmount!==''&&b.billAmount!=null&&(!Number.isFinite(Number(b.billAmount))||Math.abs(money(b.billAmount)-total)>0.001))throw Error('ยอดรวมที่กรอกไม่ตรงกับผลรวมค่าการใช้ ค่าบริการ Ft ภาษี และส่วนลด กรุณาตรวจบิล');var units=Number(b.units),rate=units?total/units:0;
    var out=rows.map(r=>{var p=r[key+'Prev'],c=r[key+'Now'];if(p===''||c===''||p==null||c==null)throw Error('กรอกเลขมิเตอร์ให้ครบทุกห้อง');p=Number(p);c=Number(c);if(!Number.isFinite(p)||!Number.isFinite(c)||p<0||c<p)throw Error('เลขมิเตอร์ปัจจุบันต้องไม่น้อยกว่าครั้งก่อน');return {roomId:r.roomId,units:Math.round((c-p)*1000000)/1000000,amount:money((c-p)*rate)};});
    var sum=out.reduce((s,r)=>s+r.units,0);if(sum>units+0.000001)throw Error('ผลรวมมิเตอร์ย่อยเกินหน่วยในบิลหลัก กรุณาตรวจรอบวันที่และเลขมิเตอร์');
    return {total,units,rate,rows:out,differenceUnits:Math.max(0,units-sum),ownerAmount:units?money((units-sum)*rate):total,rounding:money(total-out.reduce((s,r)=>s+r.amount,0)-money((units-sum)*rate))};
  }
  function validate(d){
    var seen=new Map();(d.rp3.invoices||[]).forEach(i=>{if(i.state==='void')return;var key=i.period+'/'+i.roomId,other=seen.get(key);if(other&&(!other.legacy||!i.legacy))throw Error('มีใบแจ้งหนี้ซ้ำห้องและเดือนจากอีกเครื่อง กรุณาตรวจรายการก่อนซิงค์');seen.set(key,i);if(!Number.isFinite(i.total)||i.total<0)throw Error('ยอดใบแจ้งหนี้ไม่ถูกต้อง');if(balance(d,i)<0)throw Error('ยอดรับชำระรวมเกินใบแจ้งหนี้ อาจมีการรับเงินพร้อมกันจากอีกเครื่อง กรุณาตรวจรายการ');});
    (d.rp3.receipts||[]).forEach(r=>{if(!d.rp3.invoices.some(i=>i.id===r.invoiceId))throw Error('พบรายการรับเงินที่ไม่มีใบแจ้งหนี้อ้างอิง');});return d;
  }
  function merge(base,local,remote){
    var out=clone(remote),conflicts=[];
    function field(b,l,r,path){if(same(l,b))return clone(r===undefined?null:r);if(same(r,b)||same(l,r))return clone(l===undefined?null:l);conflicts.push(path);return clone(r===undefined?null:r);}
    function rows(b,l,r,path){var bm=new Map((b||[]).map(x=>[x.id,x])),lm=new Map((l||[]).map(x=>[x.id,x])),rm=new Map((r||[]).map(x=>[x.id,x]));var result=[];new Set([...bm.keys(),...lm.keys(),...rm.keys()]).forEach(id=>{var v=field(bm.get(id),lm.get(id),rm.get(id),path+'/'+id);if(v)result.push(v);});return result;}
    ['rooms','tenants','contracts','payments'].forEach(k=>out[k]=rows(base[k],local[k],remote[k],k));
    out.rp3=out.rp3||{};['cycles','invoices','receipts','audit'].forEach(k=>out.rp3[k]=rows((base.rp3||{})[k],(local.rp3||{})[k],(remote.rp3||{})[k],'rp3/'+k));
    new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)]).forEach(k=>{if(['rooms','tenants','contracts','payments','rp3','fbcfg','gsync','notify','lineNotify','updatedAt'].includes(k))return;out[k]=field(base[k],local[k],remote[k],k);});
    ['fbcfg','gsync','notify','lineNotify'].forEach(k=>{if(local[k])out[k]=clone(local[k]);});
    if(conflicts.length)throw Error('ข้อมูลถูกแก้จากอีกเครื่อง: '+conflicts.join(', ')+' — เก็บข้อมูลในเครื่องไว้แล้ว กรุณาสำรองก่อนโหลดจากคลาวด์');
    return validate(out);
  }
  return {clone,money,migrate,tenantName,balance,status,calcUtility,merge,validate};
})();
