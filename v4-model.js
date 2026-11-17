var RentModel=(()=>{
const clone=RP.clone,round=RP.money;
function calculate(db,c){let result={};for(const k of ['water','electric']){let b=c[k];if(!b.from||!b.to||b.from>b.to)throw Error('กรอกช่วงวันที่บิลหลักให้ครบและถูกต้อง');result[k]=RP.calcUtility(b,c.rows,k);result[k].vacantAmount=round(result[k].rows.filter(r=>!contracts(db,r.roomId,c.period).length).reduce((s,r)=>s+r.amount,0));result[k].ownerTotal=round(result[k].ownerAmount+result[k].rounding+result[k].vacantAmount);}return result;}
function contracts(db,roomId,period){return db.contracts.filter(c=>!c.archived&&c.roomId===roomId&&c.startDate<=period+'-31'&&c.endDate>=period+'-01');}
function build(db,c,id,now){let cal=calculate(db,c),invoices=[];for(const row of c.rows){let active=contracts(db,row.roomId,c.period);if(active.length>1)throw Error('มีการเปลี่ยนผู้เช่าในรอบนี้ กรุณาแยกหน่วยช่วงเข้า–ออกก่อนออกบิล');if(!active.length)continue;let contract=active[0];if(!Number.isFinite(Number(contract.rent))||Number(contract.rent)<0)throw Error('ค่าเช่าตามสัญญาต้องไม่ติดลบ');if(['water','electric'].some(k=>contract.startDate>c[k].from||contract.endDate<c[k].to))throw Error('ช่วงสัญญาไม่ครอบคลุมรอบมิเตอร์ กรุณาตรวจข้อมูลเข้า–ออก');if(db.rp3.invoices.some(i=>i.state!=='void'&&i.period===c.period&&i.roomId===row.roomId))throw Error('ห้องนี้มีใบแจ้งหนี้ในเดือนที่เลือกแล้ว');let room=db.rooms.find(r=>r.id===row.roomId),w=cal.water.rows.find(r=>r.roomId===row.roomId),e=cal.electric.rows.find(r=>r.roomId===row.roomId);let snap={version:2,method:'actual-main-bill'};for(const k of ['water','electric'])snap[k]={meterNo:contract[k+'MeterNo']||'',bill:clone({...c[k],attachment:null}),previous:Number(row[k+'Prev']),current:Number(row[k+'Now']),units:cal[k].rows.find(r=>r.roomId===row.roomId).units,rate:cal[k].rate};let lastDay=new Date(Number(c.period.slice(0,4)),Number(c.period.slice(5)),0).getDate();invoices.push({id:id(),number:'INV-'+c.period.replace('-','')+'-'+String(db.rp3.invoices.length+invoices.length+1).padStart(3,'0'),period:c.period,cycleId:c.id,contractId:contract.id,roomId:room.id,roomName:room.name,tenantId:contract.tenantId,tenantName:RP.tenantName(db,contract.tenantId),owner:clone(db.owner),tenant:clone(db.tenants.find(t=>t.id===contract.tenantId)||{}),accounting:{vatRate:vatRate(db.owner.vatRate),rentVatMode:db.owner.rentReceiptVat==='included'?'included':'none'},rent:Number(contract.rent)||0,water:w.amount,electric:e.amount,other:0,total:round((Number(contract.rent)||0)+w.amount+e.amount),due:c.due||c.period+'-'+String(Math.min(Number(contract.dueDay)||1,lastDay)).padStart(2,'0'),state:'issued',note:c.note||'',createdAt:now,snapshot:snap});}if(!invoices.length)throw Error('ยังไม่มีสัญญาที่ใช้งานในรอบนี้');return {calculation:cal,invoices};}
function vatRate(value){let rate=value==null||value===''?7:Number(value);if(!Number.isFinite(rate)||rate<0||rate>100)throw Error('อัตรา VAT ต้องอยู่ระหว่าง 0–100');return rate;}
function taxPart(total,mode,rate){total=round(total);let vat=mode==='included'?round(total*rate/(100+rate)):0;return {total,net:round(total-vat),vat,mode,rate};}
function utilityBreakdown(invoice,kind,part){
if(!['water','electric'].includes(kind))return null;let snap=invoice.snapshot?.[kind],bill=snap?.bill;
if(!bill||!Number.isFinite(Number(bill.units))||Number(bill.units)<=0||!Number.isFinite(Number(bill.usage))||bill.usage==null)return null;
let full=Number(invoice[kind]),paid=part.total;if(!Number.isFinite(full)||full<=0||paid<0||paid>full)return null;
let ratio=Number(snap.units)/Number(bill.units),share=paid/full,items=[];
for(let [key,label] of [['usage',kind==='electric'?'ค่าพลังงานไฟฟ้า':'ค่าน้ำประปา'],['service','ค่าบริการ'],...(kind==='electric'?[['ft','ค่าไฟฟ้าผันแปร (Ft)']]:[]),['discount','ส่วนลดตามบิลหลัก']]){
let value=Number(bill[key]||0);if(key==='discount'&&!value)continue;let signed=key==='discount'?-value:value;
items.push({key,label,rate:signed/Number(bill.units),amount:round(signed*ratio*share)});
}
let adjustment=round(part.net-items.reduce((sum,row)=>sum+row.amount,0));if(adjustment)items.push({key:'rounding',label:'ส่วนต่างการปัดเศษและแยก VAT',rate:null,amount:adjustment});
return {items,masterUnits:Number(bill.units),units:Number(snap.units),previous:snap.previous,current:snap.current,meterNo:snap.meterNo||'',reference:bill.reference||'',from:snap.from||bill.from,to:snap.to||bill.to,partial:paid<full,fullTotal:full,net:part.net,vat:part.vat,total:paid};
}
function receive(db,invoiceId,value,id,today){
let i=db.rp3.invoices.find(i=>i.id===invoiceId);if(!i||i.state!=='issued')throw Error('ใบแจ้งหนี้นี้ไม่เปิดรับชำระ');
let amount=round(value.amount),remaining=RP.remainingCharges(db,i),allocations={};
if(value.allocations){for(let k of RP.chargeKeys)allocations[k]=round(value.allocations[k]||0);amount=round(RP.chargeKeys.reduce((sum,k)=>sum+allocations[k],0));}
else{let left=amount;for(let k of RP.chargeKeys){allocations[k]=round(Math.min(Math.max(0,remaining[k]),left));left=round(left-allocations[k]);}}
if(!Number.isFinite(amount)||amount<=0||amount>RP.balance(db,i))throw Error('ยอดรับเงินต้องมากกว่า 0 และไม่เกินยอดคงเหลือ');
if(RP.chargeKeys.some(k=>!Number.isFinite(allocations[k])||allocations[k]<0||allocations[k]>remaining[k]))throw Error('ยอดรับเงินแต่ละประเภทต้องไม่ติดลบและไม่เกินยอดค้างของรายการนั้น');
if(!value.date||!/^\d{4}-\d{2}-\d{2}$/.test(value.date)||value.date>today)throw Error('วันที่รับเงินต้องไม่เกินวันนี้');
let mode=value.rentVatMode||i.accounting?.rentVatMode||'none';if(!['included','none'].includes(mode))throw Error('เลือก VAT ของค่าเช่า');let rate=vatRate(i.accounting?.vatRate??db.owner.vatRate),parts={};
for(let k of RP.chargeKeys)parts[k]=taxPart(allocations[k],k==='rent'?mode:k==='other'?'none':'included',rate);
let receipt={id,invoiceId,amount,date:value.date,method:value.method||'',note:value.note||'',...(value.proof?{proof:clone(value.proof)}:{}),allocations,document:{version:1,owner:clone(db.owner),tenant:clone(i.tenant||db.tenants.find(t=>t.id===i.tenantId)||{}),rentVatMode:mode,vatRate:rate,parts},number:'RC-'+value.date.replaceAll('-','')+'-'+id.replace(/[^a-z0-9]/gi,'').slice(-16).toUpperCase(),createdAt:new Date().toISOString()};db.rp3.receipts.push(receipt);return receipt;
}

function syncPayments(db,today){db.payments=db.rp3.invoices.filter(i=>i.state!=='void').map(i=>({id:i.id,contractId:i.contractId,tenantId:i.tenantId,roomId:i.roomId,month:Number(i.period.slice(5)),year:Number(i.period.slice(0,4))+543,rent:i.rent,water:i.water,electric:i.electric,other:i.other,total:i.total,status:RP.balance(db,i)<=0?'paid':i.due&&i.due<today?'overdue':'pending',date:i.due,note:i.note||''}));}
function todayISO(date=new Date()){let parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Bangkok',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');}
return {calculate,contracts,build,receive,syncPayments,todayISO,vatRate,taxPart,utilityBreakdown};
})();
