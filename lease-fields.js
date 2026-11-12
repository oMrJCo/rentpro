var LeaseFields=(()=>{
function endDate(start,years){if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||![1,2,3].includes(Number(years)))return'';let [y,m,d]=start.split('-').map(Number),date=new Date(Date.UTC(y+Number(years),m-1,d));date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10);}
function inferYears(c){if([1,2,3].includes(Number(c.termYears)))return Number(c.termYears);for(let n of [1,2,3])if(endDate(c.startDate,n)===c.endDate)return n;let n=Number((c.endDate||'').slice(0,4))-Number((c.startDate||'').slice(0,4));return [1,2,3].includes(n)?n:1;}
function nextNumber(db,signedDate){let year=Number((signedDate||'').slice(0,4));if(!Number.isInteger(year)||year<1900)throw Error('กรอกวันที่ทำสัญญาก่อน');let prefix='WH-'+(year+543)+'-',max=0;for(const c of db.contracts){if(typeof c.number==='string'&&c.number.startsWith(prefix)&&/^\d+$/.test(c.number.slice(prefix.length)))max=Math.max(max,Number(c.number.slice(prefix.length)));}return prefix+String(max+1).padStart(4,'0');}
return {endDate,inferYears,nextNumber};
})();
