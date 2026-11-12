/* Account-scoped cloud; publishable key only. Financial revisions are atomic. */
var RPOnline=(()=>{
const url='https://dxlngxkuggbgdzmithzx.supabase.co',key='sb_publishable_sqAwuko-g-Kgzp51YyMT3g_gIAwtEan';let client;
async function init(){if(client)return client;const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm');client=createClient(url,key,{auth:{storage:rpStore,storageKey:'rentpro_auth_v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return client;}
async function session(){const c=await init(),r=await c.auth.getSession();if(r.error)throw r.error;return r.data.session;}
async function login(email,password){const r=await (await init()).auth.signInWithPassword({email,password});if(r.error)throw r.error;return r.data.session;}
async function register(email,password){const r=await (await init()).auth.signUp({email,password,options:{emailRedirectTo:'https://omrjco.github.io/rentpro/'}});if(r.error)throw r.error;return r.data;}
async function resendConfirmation(email){const r=await (await init()).auth.resend({type:'signup',email,options:{emailRedirectTo:'https://omrjco.github.io/rentpro/'}});if(r.error)throw r.error;return r.data;}
async function logout(){const r=await (await init()).auth.signOut({scope:'local'});if(r.error)throw r.error;}
async function read(){const r=await (await init()).rpc('rentpro_read');if(r.error)throw r.error;let records=r.data.records||[];return {ownerId:r.data.owner_id,revision:r.data.revision,data:records.some(r=>r.value.kind==='settings'&&!r.value.deleted)?RPCloud.decode(records.map(r=>({data:()=>r.value}))):null,records:new Map(records.map(r=>[r.id,r.value]))};}
async function changed(revision){const r=await (await init()).from('rentpro_state').select('revision').maybeSingle();if(r.error)throw r.error;return Number(r.data?.revision||0)!==Number(revision||0);}
function changes(readState,data){if(data._demo)throw Error('ข้อมูลตัวอย่างไม่ส่งเข้าบัญชีจริง');let old=readState.records||new Map(),next=RPCloud.records(data),out=[];next.forEach((value,id)=>{if(JSON.stringify(old.get(id))!==JSON.stringify(value))out.push({id,value});});old.forEach((v,id)=>{if(!next.has(id)&&!id.startsWith('v3_asset_')&&!v.deleted)out.push({id,value:{deleted:true}});});return out;}
async function commit(readState,data){const writes=changes(readState,data);if(!writes.length)return readState.revision;const r=await (await init()).rpc('rentpro_commit',{expected_owner:readState.ownerId,expected_revision:readState.revision,changes:writes});if(r.error){if(r.error.message.includes('CLOUD_REVISION_CHANGED'))r.error.retryable=true;throw r.error;}return r.data;}
return {init,session,login,register,resendConfirmation,logout,read,changed,changes,commit};
})();
