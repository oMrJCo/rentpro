const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const box={crypto:require('node:crypto').webcrypto};vm.runInNewContext(['upgrade-core.js','v4-model.js','lease-fields.js','lease-template.js','lease-document.js','v4-demo.js'].map(p=>fs.readFileSync(p,'utf8')).join('\n'),box);
const {LeaseFields:F,WarehouseLease:L,WarehouseLeaseTemplate:T,RP}=box,d=box.rentDemo('2026-11-12');
assert.equal(F.endDate('2026-11-15',1),'2027-11-14');assert.equal(F.endDate('2026-11-15',2),'2028-11-14');assert.equal(F.endDate('2026-11-15',3),'2029-11-14');assert.equal(F.endDate('2024-02-29',1),'2025-02-28');
assert.equal(F.nextNumber({contracts:[{number:'WH-2569-0009',archived:true},{number:'WH-2568-0099'}]},'2026-11-12'),'WH-2569-0010');assert.equal(F.nextNumber({contracts:[]},'2027-01-01'),'WH-2570-0001');
assert.equal(L.baht(12000),'หนึ่งหมื่นสองพันบาทถ้วน');assert.equal(L.baht(25181.49),'สองหมื่นห้าพันหนึ่งร้อยแปดสิบเอ็ดบาทสี่สิบเก้าสตางค์');
assert.equal(T.paragraphs.length,119);assert.equal(T.paragraphs.filter(p=>/^ข้อ \d/.test(p.text)).length,17);
const changed=new Set([2,3,5,7,10,14,19,24,25,30,31,91,92,103,105,107,109,114,115]);
for(const c of d.contracts){const s=L.build(d,c,{demo:true});assert.deepEqual(Array.from(s.missing),[]);assert.equal(s.paragraphs.length,119);for(let p of T.paragraphs)if(!changed.has(p.index))assert.equal(s.paragraphs[p.index].text,p.text);for(let p of s.paragraphs)if(![102,104,106,108].includes(p.index))assert(!/\.{3,}/.test(p.text),'unfilled source paragraph '+p.index);assert.equal(s.appendices.length,1);assert(s.paragraphs[19].text.includes('3 ปี'));assert(s.paragraphs[24].text.includes(L.baht(c.rent)));}
const c=d.contracts[0],s=L.build(d,c);assert.equal((L.blocks(s,x=>x).join('').match(/class="lease-signature-person"/g)||[]).length,4);d.owner.name='Changed after issuance';assert(!s.paragraphs[5].text.includes('Changed after issuance'));assert(L.build(d,c).paragraphs[5].text.includes('Changed after issuance'));d.owner.idcard='';c.witness2='';const missing=L.build(d,c).missing;assert(missing.includes('เลขประจำตัว / เลขทะเบียนผู้ให้เช่า'));assert(missing.includes('ชื่อพยานคนที่ 2'));
const esc=x=>String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');d.owner.name='<img src=x onerror=alert(1)>';assert(!L.blocks(L.build(d,c),esc).join('').includes('<img'));
// Payment instructions appear for both billing modes; issued snapshots retain their account.
const paymentDb=box.rentDemo('2026-11-12'),paymentContract=paymentDb.contracts[0];
paymentDb.owner.bank='ธนาคารทดสอบ ชื่อบัญชี บริษัททดสอบ เลขบัญชี 123-456-7890';
for(const schedule of [undefined,'anniversary','calendar']){paymentContract.billingSchedule=schedule;const doc=L.build(paymentDb,paymentContract);assert(doc.paragraphs[25].text.includes(paymentDb.owner.bank));assert(!doc.paragraphs[25].text.includes('แจ้งเป็นหนังสือ'));assert(!doc.missing.some(x=>x.includes('ช่องทางชำระเงิน')));}
const accountHtml=L.blocks(L.build(paymentDb,paymentContract),x=>x).join('');assert(accountHtml.includes('class="lease-payment-account"'));assert(accountHtml.includes('</div><p class="lease-paragraph" data-source-paragraph="25">รอบสุดท้าย'));
// Existing issued text gets the same layout, without rewriting its stored contents.
const oldLayout=L.build(paymentDb,paymentContract);oldLayout.paragraphs[25].text=oldLayout.paragraphs[25].text.replaceAll('\n',' ');const oldText=oldLayout.paragraphs[25].text;assert(L.blocks(oldLayout,x=>x).join('').includes('class="lease-payment-account"'));assert.equal(oldLayout.paragraphs[25].text,oldText);
const issued=L.build(paymentDb,paymentContract);paymentDb.owner.bank='บัญชีใหม่';assert(issued.paragraphs[25].text.includes('123-456-7890'));assert(L.build(paymentDb,paymentContract).paragraphs[25].text.includes('บัญชีใหม่'));
paymentDb.owner.bank='   ';assert(L.build(paymentDb,paymentContract).missing.some(x=>x.includes('ช่องทางชำระเงิน')));
paymentDb.owner.bank='<img src=x onerror=alert(1)>';assert(!L.blocks(L.build(paymentDb,paymentContract),esc).join('').includes('<img'));
paymentDb.owner.bank='เลขบัญชี ...123 $&';assert(L.build(paymentDb,paymentContract).paragraphs[25].text.includes('...123 $&'));
const duplicate=RP.clone(d);duplicate.contracts[1].number=duplicate.contracts[0].number;assert.throws(()=>RP.validate(duplicate),/เลขที่สัญญา/);
console.log('PASS: complete source mapping for four leases, 17 unchanged clauses, missing-field gate, Thai amounts, safe rendering, immutable snapshots, annual numbering including archives, 1–3 year inclusive end dates and leap years');
