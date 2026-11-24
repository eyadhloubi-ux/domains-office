// مكتب سنكري القابضة الافتراضي — الواجهة
(function(){
const LAPTOP=matchMedia('(pointer:fine)').matches&&Math.max(screen.width,screen.height)>=1000;
if(!LAPTOP){document.body.innerHTML='<div style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#00175A;color:#fff;text-align:center"><div style="max-width:420px"><div style="font-size:26px;font-weight:800;letter-spacing:.5px;margin-bottom:18px">SANKARI · DOMAINS</div><h1 style="font-size:24px;margin:0 0 12px;line-height:1.3">المكتب الافتراضي مخصص للابتوب</h1><p style="margin:0;opacity:.85;font-size:16px;line-height:1.7">افتح هذا الرابط من اللابتوب (Chrome أو Edge) لتدخل المكتب وتتحرك فيه وتشارك في الاجتماعات الصوتية ومشاركة الشاشة.</p></div></div>';return}
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rid=()=>Math.random().toString(36).slice(2,9)+Date.now().toString(36);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ease=(dt,k)=>1-Math.exp(-dt*k);
const LS={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
const fmtT=t=>new Date(t||0).toLocaleString('ar-SY-u-nu-latn',{dateStyle:'medium',timeStyle:'short'});
const fmtH=t=>new Date(t||0).toLocaleTimeString('ar-SY-u-nu-latn',{hour:'2-digit',minute:'2-digit'});
const {FLOORS,SLOTS}=window.OFFICE;
const FL=()=>FLOORS.find(f=>f.id===me.floor)||FLOORS[2];

/* ================= الخريطة ================= */
const W=1760,H=900;
const ROOMS=[
 {id:'manager',x:12,y:12,w:354,h:294},{id:'reception',x:12,y:482,w:354,h:406},
 {id:'meeting',x:1026,y:12,w:362,h:402},{id:'lounge',x:1026,y:532,w:362,h:356},{id:'planning',x:1400,y:12,w:348,h:876}];
const PODS=[{id:'a',x:430,y:150},{id:'b',x:720,y:150},{id:'c',x:430,y:560},{id:'d',x:720,y:560}];
const DESKS=[{id:'m1',pod:-1,x:120,y:110,w:150,h:60,seat:{x:195,y:88},colX:300,top:true}];
PODS.forEach((p,pi)=>{for(let i=0;i<4;i++){const dx=(i%2)*96,dy=i<2?0:56,x=p.x+dx,y=p.y+dy;DESKS.push({id:p.id+(i+1),pod:pi,x,y,w:90,h:50,seat:{x:x+45,y:i<2?p.y-22:p.y+128},colX:p.x-26,top:i<2})}});
const SLOTC={general:'#0616C4',a:'#1f9d74',b:'#8042EB',c:'#e5484d',d:'#e09612'};
const BOARDS=SLOTS.map((s,i)=>({slot:s,c:SLOTC[s],y:110+i*170,front:{x:1640,y:110+i*170}}));
const WALLS=[[0,0,W,12],[0,888,W,12],[0,0,12,H],[W-12,0,12,H],
 [366,12,12,300],[12,306,248,12],[340,306,38,12],
 [12,470,250,12],[342,470,36,12],[366,470,12,290],[366,860,12,28],
 [1014,414,250,12],[1344,414,44,12],
 [1014,520,60,12],[1160,520,228,12],[1014,520,12,368],
 [1388,12,12,410],[1388,520,12,368]];
const GLASS=[[1014,12,12,408]];
const FURN=[...PODS.map(p=>[p.x,p.y,186,106]),[120,110,150,60],[1110,140,190,140],[120,580,180,46],[1336,560,44,200],[1060,800,170,46],[1090,720,110,40],[24,140,26,120],[12,630,34,96],...BOARDS.map(b=>[1708,b.y-62,32,124])];
const SOLIDS=[...WALLS,...GLASS,...FURN];
const RECEPT={x:210,y:556},ELEV={x:72,y:678};
const MEET_SEATS=[{x:1150,y:302},{x:1255,y:302},{x:1150,y:118},{x:1255,y:118},{x:1088,y:210},{x:1322,y:210}];
function places(){const f=FL(),P={manager:{x:300,y:250,n:f.manager},meeting:{x:1200,y:350,n:'غرفة الاجتماعات'},lounge:{x:1180,y:640,n:'الاستراحة'},reception:{x:210,y:680,n:'الاستقبال'},elevator:{x:ELEV.x+10,y:ELEV.y,n:'المصعد'},planning:{x:1520,y:470,n:'لوحة التخطيط المشترك'}};
 PODS.forEach((p,i)=>{P['pod_'+p.id]={x:p.x+93,y:i<2?305:720,n:f.pods[i]}});BOARDS.forEach(b=>P['board_'+b.slot]={x:b.front.x,y:b.front.y,n:'لوحة '+boardTitle(b.slot)});return P}
const boardTitle=s=>s==='general'?'اللوحة العامة':FL().pods[SLOTS.indexOf(s)-1];
const zoneAt=p=>{for(const r of ROOMS)if(p.x>r.x&&p.x<r.x+r.w&&p.y>r.y&&p.y<r.y+r.h)return r.id;return 'open'};
const boardAt=p=>{if(zoneAt(p)!=='planning')return null;let best=null,bd=100;BOARDS.forEach(b=>{const d=dist(p,b.front);if(d<bd){bd=d;best=b}});return best};
const hits=(x,y,r)=>SOLIDS.some(([a,b,w,h])=>x+r>a&&x-r<a+w&&y+r>b&&y-r<b+h);

/* --- إيجاد المسار عند النقر بالماوس (A* على شبكة) --- */
const CELL=20,GW=Math.ceil(W/CELL),GH=Math.ceil(H/CELL),GRID=new Uint8Array(GW*GH);
for(let gy=0;gy<GH;gy++)for(let gx=0;gx<GW;gx++)GRID[gy*GW+gx]=hits(gx*CELL+10,gy*CELL+10,12)?1:0;
const free=(gx,gy)=>gx>=0&&gy>=0&&gx<GW&&gy<GH&&!GRID[gy*GW+gx];
function nearFree(gx,gy){if(free(gx,gy))return[gx,gy];for(let r=1;r<8;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)if(Math.max(Math.abs(dx),Math.abs(dy))===r&&free(gx+dx,gy+dy))return[gx+dx,gy+dy];return null}
function los(a,b){const n=Math.ceil(dist(a,b)/6);for(let i=1;i<=n;i++){const x=a.x+(b.x-a.x)*i/n,y=a.y+(b.y-a.y)*i/n;if(hits(x,y,12))return false}return true}
function findPath(from,to){
 const s=nearFree(Math.floor(from.x/CELL),Math.floor(from.y/CELL)),t=nearFree(Math.floor(to.x/CELL),Math.floor(to.y/CELL));if(!s||!t)return null;
 const N=GW*GH,g=new Float32Array(N).fill(1e9),par=new Int32Array(N).fill(-1),closed=new Uint8Array(N);const si=s[1]*GW+s[0],ti=t[1]*GW+t[0];g[si]=0;
 const open=[si],h=i=>{const x=i%GW,y=(i/GW)|0;return Math.hypot(x-t[0],y-t[1])};const f=new Float32Array(N).fill(1e9);f[si]=h(si);
 let guard=0;while(open.length&&guard++<8000){let bi=0;for(let i=1;i<open.length;i++)if(f[open[i]]<f[open[bi]])bi=i;const c=open.splice(bi,1)[0];if(c===ti)break;closed[c]=1;
  const cx=c%GW,cy=(c/GW)|0;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=cx+dx,ny=cy+dy;if(!free(nx,ny))continue;if(dx&&dy&&(!free(cx+dx,cy)||!free(cx,cy+dy)))continue;
   const ni=ny*GW+nx;if(closed[ni])continue;const ng=g[c]+(dx&&dy?1.414:1);if(ng<g[ni]){g[ni]=ng;par[ni]=c;f[ni]=ng+h(ni);if(!open.includes(ni))open.push(ni)}}}
 if(par[ti]<0&&ti!==si)return null;
 const cells=[];for(let i=ti;i>=0&&i!==si;i=par[i])cells.push({x:(i%GW)*CELL+10,y:((i/GW)|0)*CELL+10});cells.reverse();
 if(!hits(to.x,to.y,12)&&cells.length)cells[cells.length-1]={x:to.x,y:to.y};
 const out=[];let cur={x:from.x,y:from.y},i=0;while(i<cells.length){let j=cells.length-1;while(j>i&&!los(cur,cells[j]))j--;out.push(cells[j]);cur=cells[j];i=j+1}
 return out}

/* ================= الحالة ================= */
const LOOKS={shirt:['#0616C4','#8042EB','#00175A','#e5484d','#1f9d74','#f0a020','#2b8fd6','#3d3d4d'],hair:['#1d140f','#4a2c1a','#8a5a2b','#c9a15a','#5b5b66','#f2f2f2','#00175A','#8042EB'],skin:['#f6d6bd','#e8b98f','#c98e62','#8d5a3b'],
 style:{m:[['short','شعر قصير'],['beard','قصير مع لحية']],f:[['hijab','حجاب'],['long','شعر طويل']]}};
const me={id:null,username:'',name:'',role:'',look:{gender:null,shirt:'#0616C4',hair:'#1d140f',skin:'#e8b98f',style:'short'},floor:LS.get('office.floor')||'f3',x:210,y:700,vx:0,vy:0,face:'down',phase:0,status:'free',desk:null,moving:false,say:null};
if(!FLOORS.some(f=>f.id===me.floor))me.floor='f3';
let profiles={},peers=new Map(),boards={},minutes=[],meetings={},archive={},ICE=[],AI=false,joined=false,moveDesk=false,authMode='login',needCode=false,voiceMode='auto';
const BOTS=[
 {id:'bot-ahmad',name:'أحمد (تجريبي)',role:'منسّق مسار التدريب',desk:'a2',look:{gender:'m',shirt:'#1f9d74',hair:'#1d140f',skin:'#e8b98f',style:'beard'}},
 {id:'bot-leen',name:'لين (تجريبية)',role:'مسؤولة مسار الفعاليات',desk:'b1',look:{gender:'f',shirt:'#8042EB',hair:'#4a2c1a',skin:'#f6d6bd',style:'hijab'}}];
BOTS.forEach(b=>{const d=DESKS.find(x=>x.id===b.desk);Object.assign(b,{x:d.seat.x,y:d.seat.y,route:[],at:'desk',next:Date.now()+30000+Math.random()*30000,status:'free',face:'down',phase:0,moving:false})});
const botsHere=()=>me.floor==='f3'?BOTS:[];
const deskOf=id=>DESKS.find(d=>d.id===id);
const deskKey=d=>me.floor+':'+d.id;
const deskLabel=key=>{if(!key)return'';const [f,id]=key.split(':');const fl=FLOORS.find(x=>x.id===f);const d=deskOf(id);if(!fl||!d)return'';return (d.pod<0?fl.manager:fl.pods[d.pod])+(f!==me.floor?' · الطابق '+fl.n:'')};
function person(id){if(id===me.id)return me;const b=BOTS.find(x=>x.id===id);if(b)return b;const p=profiles[id];return p?{id,...p}:null}
function deskOwner(d){if(me.floor==='f3'){const b=BOTS.find(x=>x.desk===d.id);if(b)return b.id}const k=deskKey(d);if(me.desk===k)return me.id;for(const id in profiles)if(id!==me.id&&profiles[id].desk===k)return id;return null}
const floorPeers=()=>[...peers.entries()].filter(([,p])=>p.floor===me.floor);
const peerOfUid=id=>[...peers.values()].find(p=>p.uid===id);
const meet=()=>meetings[me.floor]||(meetings[me.floor]={sid:null,startedAt:0,msgs:[]});

/* ================= الاتصال والحسابات ================= */
const socket=io({transports:['websocket','polling']});
function hello(){socket.emit('hello',{token:LS.get('office.token')||''},r=>{
 if(!r||!r.ok){joined=false;needCode=!!(r&&r.needCode);showAuth();return}
 $('#auth').hidden=true;joined=true;me.id=r.uid;me.username=r.username||'';ICE=r.ice||[];AI=!!r.ai;voiceMode=r.voiceMode||'auto';
 profiles=r.profiles||{};boards=r.boards||{};minutes=r.minutes||[];meetings=r.meetings||{};archive=r.archive||{};
 peers.clear();(r.peers||[]).forEach(addPeer);
 if(r.profile&&r.profile.name){Object.assign(me,{name:r.profile.name,role:r.profile.role||'',desk:r.profile.desk||null});me.look={...me.look,...r.profile.look};$('#onb').hidden=true;sendPos(true)}
 else showOnb(true);
 if(V.channel){voiceLeave(true);V.want=null}
 buildStatic();if(WB.bid)wbDraw();
})}
socket.on('connect',()=>{$('#conn').classList.remove('off');hello()});
socket.on('disconnect',()=>{$('#conn').classList.add('off');joined=false;toast('انقطع الاتصال بالخادم، تجري إعادة المحاولة…')});
function showAuth(){$('#onb').hidden=true;$('#auth').hidden=false;setAuthMode(authMode);setTimeout(()=>$('#auUser').focus(),50)}
function setAuthMode(m){authMode=m;$('#auTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));$('#auReg').hidden=m!=='reg';$('#auCodeBox').hidden=!needCode;
 $('#auBtn').textContent=m==='reg'?'إنشاء الحساب':'دخول';$('#auPass').autocomplete=m==='reg'?'new-password':'current-password';$('#auSub').textContent=m==='reg'?'أنشئ حسابك باسم مستخدم وكلمة مرور تحفظهما.':'ادخل باسم المستخدم وكلمة المرور.';$('#auErr').textContent=''}
$('#auTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>setAuthMode(b.dataset.m));
$('#auForm').onsubmit=e=>{e.preventDefault();const u=$('#auUser').value.trim(),p=$('#auPass').value;
 if(authMode==='reg'&&p!==$('#auPass2').value){$('#auErr').textContent='كلمتا المرور غير متطابقتين';return}
 $('#auBtn').disabled=true;$('#auErr').textContent='';
 const ev=authMode==='reg'?'auth:register':'auth:login';
 socket.timeout(15000).emit(ev,{username:u,password:p,code:$('#auCode').value.trim(),legacy:LS.get('office.uid')||''},(err,r)=>{$('#auBtn').disabled=false;
  if(err||!r)return $('#auErr').textContent='تعذّر الاتصال بالخادم';if(r.error)return $('#auErr').textContent=r.error;
  LS.set('office.token',r.token);$('#auPass').value='';$('#auPass2').value='';hello()})};
function addPeer(p){if(!p||p.id===socket.id)return;const old=peers.get(p.id);
 peers.set(p.id,{...p,pos:old&&old.floor===p.floor?old.pos:{x:p.x,y:p.y},phase:old?old.phase:0,vface:old?old.vface:(p.face||'down'),spd:old?old.spd:0})}
socket.on('peer:join',p=>{addPeer(p);if(p.name&&p.floor===me.floor)toast(p.name+' دخل الطابق')});
socket.on('pos',p=>{const old=peers.get(p.id);if(old&&old.floor!==p.floor&&p.name&&p.floor===me.floor)toast(p.name+' وصل إلى الطابق بالمصعد');addPeer(p)});
socket.on('peer:left',({id})=>{peers.delete(id);if(V.pcs.has(id))dropPeer(id)});
socket.on('profiles',p=>{profiles=p||{};const mine=profiles[me.id];if(mine)me.desk=mine.desk||null;if(cur&&cur.type==='person')refreshPersonHead()});
socket.on('board',b=>{if(b&&b.id){boards[b.id]=b;if(WB.bid===b.id)wbDraw()}});
socket.on('wb:move',({bid,list})=>{const b=boards[bid];if(!b)return;list.forEach(m=>{const it=b.items.find(x=>x.id===m.id);if(it){it.x=m.x;it.y=m.y}});if(WB.bid===bid)wbDraw()});
socket.on('wb:cursor',c=>{if(c.bid!==WB.bid)return;WB.cursors.set(c.id,{...c,t:Date.now()});wbCursors()});
socket.on('minutes',l=>{minutes=l||[];drawMin()});
socket.on('meeting:msg',({floor,msg})=>{const m=meetings[floor]||(meetings[floor]={sid:null,startedAt:0,msgs:[]});m.msgs.push(msg);if(m.msgs.length>300)m.msgs.shift();if(floor===me.floor)drawMeet()});
socket.on('meeting:state',({floor,sid,startedAt,msgs})=>{const old=meetings[floor];meetings[floor]={sid,startedAt,msgs:msgs||[]};if(floor===me.floor){if(sid&&(!old||old.sid!==sid)&&zoneAt(me)==='meeting')toast('🗓 بدأت جلسة اجتماع جديدة');drawMeet()}});
socket.on('meeting:archive',({floor,list})=>{archive[floor]=list||[];if(floor===me.floor)drawArch()});
socket.on('pair:msg',({key,msg})=>{if(pair&&pair.key===key){pair.msgs.push(msg);drawPairMsgs()}});
socket.on('pair:doc',({key,doc})=>{if(pair&&pair.key===key){pair.doc=doc;renderShared()}});
socket.on('bot:say',({bot,text})=>{const b=BOTS.find(x=>x.id===bot);if(b){b.say={text,until:Date.now()+6000};b.status='free'}const ty=$('#typing');if(ty)ty.hidden=true});
socket.on('dm',d=>toast('💬 '+d.name+': '+d.text));
socket.on('knock',d=>toast('🚪 '+d.name+' يطرق بابك'));
socket.on('call:invite',d=>{toast('📞 '+d.name+' يتصل بك',[['ردّ',()=>{V.pairCall=d.channel;V.pairName=d.name}],['لاحقاً',()=>{}]],15000)});

/* ================= الرسم ================= */
const cv=$('#map'),ctx=cv.getContext('2d');
let dpr=1,scale=1,cam={x:0,y:0,init:false},vw=0,vh=0,pad=0,zoomU=1.3,overview=false,focusZ=0;
function resize(){const r=cv.getBoundingClientRect();dpr=window.devicePixelRatio||1;vw=r.width;vh=r.height;cv.width=vw*dpr;cv.height=vh*dpr}
new ResizeObserver(resize).observe(cv);
const fitS=()=>Math.min((vw-pad)/W,vh/H);
const rr=(c,x,y,w,h,r)=>{c.beginPath();c.roundRect(x,y,w,h,r);c.fill()};
const dot=(c,x,y,r)=>{c.beginPath();c.arc(x,y,r,0,7);c.fill()};
const STC={free:'#22c27a',busy:'#f0a020',focus:'#e5484d'},STL={busy:'مشغول',focus:'تركيز · لا إزعاج'};
$('#mzIn').onclick=()=>{overview=false;zoomU=clamp(zoomU*1.2,.6,2.4);mapCtl()};
$('#mzOut').onclick=()=>{overview=false;zoomU=clamp(zoomU/1.2,.6,2.4);mapCtl()};
$('#mzAll').onclick=()=>{overview=!overview;mapCtl()};
function mapCtl(){$('#mzAll').classList.toggle('on',overview);$('#mzAll').textContent=overview?'🔍 اتبع شخصيتي':'🗺 الطابق كاملاً'}
cv.addEventListener('wheel',e=>{e.preventDefault();overview=false;zoomU=clamp(zoomU*Math.exp(-e.deltaY*.0015),.6,2.4);mapCtl()},{passive:false});

/* --- المشهد الثابت يُرسم مرة واحدة لكل طابق --- */
const SC=document.createElement('canvas');SC.width=W*2;SC.height=H*2;const sx=SC.getContext('2d');
function shadowed(fn,blur=10,oy=4,a=.16){sx.save();sx.shadowColor='rgba(0,23,90,'+a+')';sx.shadowBlur=blur;sx.shadowOffsetY=oy;fn();sx.restore()}
function buildStatic(){const c=sx,f=FL();c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,W,H);
 c.fillStyle='#eef0f7';c.fillRect(0,0,W,H);
 c.strokeStyle='#e3e6f1';c.lineWidth=1;c.beginPath();for(let x=0;x<W;x+=40){c.moveTo(x,0);c.lineTo(x,H)}for(let y=0;y<H;y+=40){c.moveTo(0,y);c.lineTo(W,y)}c.stroke();
 const floorFill=(r,col)=>{c.fillStyle=col;c.fillRect(r.x,r.y,r.w,r.h)};
 floorFill(ROOMS[0],'#e4e8f8');floorFill(ROOMS[1],'#e7ebf8');
 const mg=c.createLinearGradient(1026,12,1388,414);mg.addColorStop(0,'#ece6fd');mg.addColorStop(1,'#e2d9fa');c.fillStyle=mg;c.fillRect(1026,12,362,402);
 c.fillStyle='#f3eadc';c.fillRect(1026,532,362,356);c.strokeStyle='rgba(160,120,70,.12)';c.lineWidth=1;c.beginPath();for(let y=546;y<888;y+=18){c.moveTo(1026,y);c.lineTo(1388,y)}c.stroke();
 c.fillStyle='#F4ECDD';c.fillRect(1400,12,348,876);c.fillStyle='#D9CCB4';for(let x=1412;x<1748;x+=24)for(let y=24;y<888;y+=24)dot(c,x,y,1.2);
 PODS.forEach(p=>{c.fillStyle='rgba(6,22,196,.045)';rr(c,p.x-40,p.y-62,266,232,22)});
 c.textAlign='center';c.textBaseline='middle';c.fillStyle='rgba(0,23,90,.55)';c.font='800 17px Tajawal,sans-serif';
 c.fillText(f.manager,192,40);c.fillText('الاستقبال',96,500);c.fillText('غرفة الاجتماعات',1207,40);c.fillText('الاستراحة',1207,560);c.fillText('لوحة التخطيط المشترك',1574,40);
 PODS.forEach((p,i)=>c.fillText(f.pods[i],p.x+93,p.y-88));
 c.fillStyle='#c8d0ee';rr(c,150,846,120,30,6);c.fillStyle='rgba(0,23,90,.5)';c.font='700 12px Tajawal,sans-serif';c.fillText('المدخل',210,861);
 shadowed(()=>{c.fillStyle='#aeb8de';rr(c,12,626,36,104,4)},8,2);
 c.fillStyle='#d7dcf0';c.fillRect(16,634,13,88);c.fillRect(31,634,13,88);c.fillStyle='#8d97c4';c.fillRect(29,634,2,88);
 c.fillStyle='#00175A';rr(c,16,612,28,14,3);c.fillStyle='#2fd28a';c.font='800 10px Tajawal,sans-serif';c.fillText(String(f.n),30,619.5);
 c.fillStyle='rgba(0,23,90,.65)';c.font='800 12px Tajawal,sans-serif';c.fillText('المصعد',84,640);
 shadowed(()=>{c.fillStyle='#00175A';rr(c,120,580,180,46,12)});c.fillStyle='#0616C4';rr(c,124,584,172,10,5);
 c.fillStyle='#fff';c.font='800 13px Tajawal,sans-serif';c.fillText(f.id==='f3'?'DOMAINS':'SANKARI',210,610);
 shadowed(()=>{c.fillStyle='#cfd5ef';rr(c,300,760,34,96,10)});
 shadowed(()=>{c.fillStyle='#8b6b4a';rr(c,24,140,26,120,4)});c.fillStyle='#c9a77d';for(let i=0;i<4;i++)rr(c,27,146+i*29,20,22,2);
 shadowed(()=>{c.fillStyle='#5f4aa5';rr(c,1110,140,190,140,26)},16,6,.22);c.fillStyle='#8a76cc';rr(c,1116,146,178,128,22);c.fillStyle='rgba(255,255,255,.12)';rr(c,1124,152,162,30,14);
 MEET_SEATS.forEach(s=>{shadowed(()=>{c.fillStyle='#2b3350';dot(c,s.x,s.y,10)},6,2);c.fillStyle='#3d4777';dot(c,s.x,s.y,6.5)});
 shadowed(()=>{c.fillStyle='#c9b79f';rr(c,1336,560,44,200,6)});c.fillStyle='#3b3b45';rr(c,1346,580,24,24,4);c.fillStyle='#e8e2d8';rr(c,1346,620,24,30,4);
 shadowed(()=>{c.fillStyle='#6a35c9';rr(c,1060,800,170,46,14)},12,4);c.fillStyle='#9a6cf0';rr(c,1066,806,158,20,10);
 shadowed(()=>{c.fillStyle='#b8865a';rr(c,1090,720,110,40,10)});
 BOARDS.forEach(b=>{c.globalAlpha=.14;c.fillStyle=b.c;rr(c,1560,b.y-62,150,124,16);c.globalAlpha=1;
  shadowed(()=>{c.fillStyle='#10183a';rr(c,1708,b.y-62,32,124,5)},10,0,.25);c.fillStyle=b.c;rr(c,1712,b.y-56,24,112,3);
  c.fillStyle='rgba(255,255,255,.9)';for(let i=0;i<3;i++)rr(c,1716,b.y-48+i*16,16,11,2);
  c.fillStyle='rgba(0,23,90,.78)';c.font='800 13px Tajawal,sans-serif';c.fillText(boardTitle(b.slot),1630,b.y-44)});
 DESKS.forEach(d=>{shadowed(()=>{c.fillStyle='#d6cab8';rr(c,d.x,d.y,d.w,d.h,7)},10,4,.14);
  const g=c.createLinearGradient(d.x,d.y,d.x,d.y+d.h);g.addColorStop(0,'#faf6ef');g.addColorStop(1,'#efe6d8');c.fillStyle=g;rr(c,d.x+2,d.y+2,d.w-4,d.h-4,6);
  const my=d.top?d.y+6:d.y+d.h-19;c.fillStyle='#1f2747';rr(c,d.x+d.w/2-18,my,36,13,2);
  const sg=c.createLinearGradient(0,my,0,my+13);sg.addColorStop(0,'#5b6fd6');sg.addColorStop(1,'#2f3f9a');c.fillStyle=sg;rr(c,d.x+d.w/2-16,my+2,32,9,1);
  c.fillStyle='#d9d2c4';rr(c,d.x+d.w/2-13,d.top?my+17:my-9,26,6,2);
  c.fillStyle='#c4a57c';dot(c,d.x+12,d.top?d.y+14:d.y+d.h-14,4);
  shadowed(()=>{c.fillStyle='#2b3350';dot(c,d.seat.x,d.seat.y,10)},6,2);c.fillStyle='#3e4878';dot(c,d.seat.x,d.seat.y,6.5);
  c.fillStyle='#2b3350';rr(c,d.seat.x-9,d.top?d.seat.y-12:d.seat.y+8,18,5,2)});
 [[400,40],[1000,860],[400,860],[1000,300],[60,440],[330,440],[1360,470],[1050,560],[1420,860],[1420,70],[330,520]].forEach(([x,y])=>{shadowed(()=>{c.fillStyle='#b8865a';rr(c,x-9,y,18,14,3)},6,3);c.fillStyle='#2b8a56';dot(c,x,y-4,11);c.fillStyle='#3fbf78';dot(c,x-5,y-8,6);dot(c,x+5,y-6,6);c.fillStyle='#6fd99b';dot(c,x-1,y-11,3)});
 WALLS.forEach(([x,y,w,h])=>{c.fillStyle='#00175A';c.fillRect(x,y,w,h);c.fillStyle='rgba(255,255,255,.14)';if(w>h)c.fillRect(x,y,w,2);else c.fillRect(x,y,2,h)});
 c.fillStyle='rgba(6,22,196,.35)';GLASS.forEach(([x,y,w,h])=>c.fillRect(x,y,w,h));c.fillStyle='rgba(255,255,255,.5)';GLASS.forEach(([x,y,w,h])=>c.fillRect(x+4,y,2,h));
}
if(document.fonts)document.fonts.ready.then(buildStatic);

/* --- الشخصيات --- */
const shadeC={};function shade(h){if(shadeC[h])return shadeC[h];const m=/^#([0-9a-f]{6})$/i.exec(h||'');if(!m)return h;const n=parseInt(m[1],16),f=v=>Math.round(v*.8);return shadeC[h]='rgb('+f(n>>16)+','+f(n>>8&255)+','+f(n&255)+')'}
function drawAvatar(c,x,y,look,o={}){
 c.save();const f=look.gender==='f',face=o.face||'down',ph=o.phase||0,mv=o.moving;
 const bob=mv?Math.abs(Math.sin(ph))*2.2:Math.sin((o.t||0)*2.2)*.45,sw=mv?Math.sin(ph)*4:0;
 c.fillStyle='rgba(0,23,90,.2)';c.beginPath();c.ellipse(x,y+15,12-bob*.6,4.5,0,0,7);c.fill();
 if(o.status&&o.status!=='free'){c.fillStyle=o.status==='focus'?'rgba(229,72,77,.22)':'rgba(240,160,32,.22)';c.beginPath();c.ellipse(x,y+15,21,8.5,0,0,7);c.fill();c.strokeStyle=STC[o.status];c.lineWidth=2;c.beginPath();c.ellipse(x,y+15,21,8.5,0,0,7);c.stroke()}
 if(o.speaking){c.strokeStyle='rgba(47,210,138,.95)';c.lineWidth=3;c.beginPath();c.ellipse(x,y+15,25,10.5,0,0,7);c.stroke()}
 if(o.me){c.strokeStyle='#0616C4';c.lineWidth=2.5;c.beginPath();c.ellipse(x,y+15,16,6.5,0,0,7);c.stroke()}
 y-=bob;
 if(f){c.fillStyle='#1e2a4a';c.beginPath();c.roundRect(x-6,y+10+Math.max(0,sw)*.3,5,5,2);c.roundRect(x+1,y+10+Math.max(0,-sw)*.3,5,5,2);c.fill()}
 else{c.fillStyle='#1e2a4a';c.beginPath();c.roundRect(x-7,y+2,5,12+sw*.5,2);c.roundRect(x+2,y+2,5,12-sw*.5,2);c.fill()}
 const side=face==='left'?-1:face==='right'?1:0;
 if(look.style==='long'){c.fillStyle=look.hair;c.beginPath();c.roundRect(x-10,y-28,20,26,8);c.fill()}
 c.fillStyle=shade(look.shirt);c.beginPath();c.roundRect(x-14,y-9-sw*.35,5,13,2.5);c.roundRect(x+9,y-9+sw*.35,5,13,2.5);c.fill();
 c.fillStyle=look.skin;dot(c,x-11.5,y+4-sw*.35,2.4);dot(c,x+11.5,y+4+sw*.35,2.4);
 c.fillStyle=look.shirt;
 if(f){c.beginPath();c.moveTo(x-9,y-12);c.lineTo(x+9,y-12);c.quadraticCurveTo(x+12,y-11,x+12,y-6);c.lineTo(x+14,y+12);c.lineTo(x-14,y+12);c.lineTo(x-12,y-6);c.quadraticCurveTo(x-12,y-11,x-9,y-12);c.fill()}
 else{c.beginPath();c.roundRect(x-11,y-12,22,18,7);c.fill()}
 c.fillStyle='rgba(255,255,255,.16)';c.beginPath();c.roundRect(x-9,y-11,6,f?20:15,3);c.fill();
 const hx=x+side*1.5,hy=y-20;
 if(look.style==='hijab'){c.fillStyle=look.hair;dot(c,hx,hy,11);c.beginPath();c.moveTo(hx-11,hy+2);c.lineTo(hx-13,y-5);c.lineTo(hx+13,y-5);c.lineTo(hx+11,hy+2);c.fill();
  if(face!=='up'){c.fillStyle=look.skin;dot(c,hx+side*2.5,hy+1,6.5)}}
 else{c.fillStyle=look.skin;dot(c,hx,hy,9);c.fillStyle=look.hair;
  if(face==='up')dot(c,hx,hy-.5,9.4);else{c.beginPath();c.arc(hx,hy-1,9.6,Math.PI*1.02,Math.PI*1.98);c.fill();if(side){c.beginPath();c.arc(hx-side*3,hy-2,8,0,7);c.fill()}}
  if(look.style==='beard'&&face!=='up'){c.beginPath();c.arc(hx+side*2,hy+2,8.2,Math.PI*.14,Math.PI*.86);c.lineTo(hx+side*2-5,hy+3);c.quadraticCurveTo(hx+side*2,hy+6,hx+side*2+5,hy+3);c.fill()}}
 if(face!=='up'){c.fillStyle='#1b1b2a';const ex=hx+side*3.5;if(side)dot(c,ex,hy+1,1.3);else{dot(c,ex-3,hy+1,1.3);dot(c,ex+3,hy+1,1.3)}}
 if(o.voice){c.fillStyle='#00175A';dot(c,x-12,y-31,6);c.fillStyle='#fff';c.fillRect(x-13.5,y-35,3,5);c.fillRect(x-15,y-30,6,1.4)}
 c.restore();
}
function tag(x,y,text,o={}){
 ctx.font='700 12px Tajawal,sans-serif';const w=ctx.measureText(text).width+14;let top=y-48;
 ctx.fillStyle=o.me?'#0616C4':o.bot?'#8042EB':'rgba(255,255,255,.96)';rr(ctx,x-w/2,top,w,19,9.5);
 if(!o.me&&!o.bot){ctx.strokeStyle='rgba(0,23,90,.12)';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-w/2,top,w,19,9.5);ctx.stroke()}
 ctx.fillStyle=o.me||o.bot?'#fff':'#0b1230';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,x,top+10);
 if(o.status&&STL[o.status]){ctx.font='800 11px Tajawal,sans-serif';const s=(o.status==='focus'?'🔴 ':'🟡 ')+STL[o.status];const sw=ctx.measureText(s).width+14;top-=22;
  ctx.fillStyle=STC[o.status];rr(ctx,x-sw/2,top,sw,18,9);ctx.fillStyle='#fff';ctx.fillText(s,x,top+9.5)}
 if(o.say){ctx.font='500 13px Tajawal,sans-serif';const t=o.say.length>42?o.say.slice(0,40)+'…':o.say;const sw=Math.min(ctx.measureText(t).width+20,260);const by=top-36;
  ctx.fillStyle='#fff';ctx.strokeStyle='#c9cdea';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(x-sw/2,by,sw,30,12);ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(x-6,by+29);ctx.lineTo(x+6,by+29);ctx.lineTo(x,by+35);ctx.fill();ctx.fillStyle='#0b1230';ctx.fillText(t,x,by+15,sw-12)}
}
function drawDynamic(t){
 DESKS.forEach(d=>{const own=deskOwner(d);
  if(!own){if(me.name&&joined&&(!me.desk||moveDesk)){ctx.save();ctx.globalAlpha=.45+.3*Math.sin(t*3);ctx.strokeStyle='#8042EB';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(d.x-3,d.y-3,d.w+6,d.h+6);ctx.restore()}return}
  const p=person(own);const pr=own===me.id?{status:me.status}:own.startsWith('bot-')?{status:'free'}:peerOfUid(own);
  if(pr&&pr.status&&pr.status!=='free'){ctx.save();ctx.globalAlpha=.55+.25*Math.sin(t*2.4);ctx.strokeStyle=STC[pr.status];ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(d.x-4,d.y-4,d.w+8,d.h+8,9);ctx.stroke();ctx.restore()}
  ctx.font='700 10.5px Tajawal,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
  const tx=String(p&&p.name||'').split(' ')[0],py=d.top?d.y+d.h-17:d.y+5;
  ctx.fillStyle=own===me.id?'#0616C4':(p&&p.look?p.look.shirt:'#8042EB');rr(ctx,d.x+d.w/2-28,py,56,13,6);ctx.fillStyle='#fff';ctx.fillText(tx,d.x+d.w/2,py+6.5,52);
  if(!pr&&!own.startsWith('bot-')){ctx.fillStyle='rgba(255,255,255,.55)';rr(ctx,d.x+2,d.y+2,d.w-4,d.h-4,6)}});
 const sharing=V.channel===meetCh()&&(V.screen||[...V.pcs.values()].some(p=>p.video));
 ctx.fillStyle=sharing?'#2fd28a':'#111833';rr(ctx,1130,16,150,10,3);ctx.fillStyle='rgba(0,23,90,.5)';ctx.font='700 11px Tajawal,sans-serif';ctx.textAlign='center';ctx.fillText(sharing?'شاشة مشتركة الآن':'شاشة العرض',1205,60);
 BOARDS.forEach(b=>{const bd=boards[me.floor+'.'+b.slot];const ns=bd?bd.items.filter(i=>i.t==='note'):[],d=ns.filter(i=>i.done).length;
  ctx.font='700 11px Tajawal,sans-serif';ctx.fillStyle='rgba(0,23,90,.58)';ctx.fillText(ns.length?ns.length+' نوت · '+d+' منجزة':'لوحة فارغة',1630,b.y+48);
  const here=floorPeers().filter(([,p])=>{const bb=boardAt(p.pos);return bb&&bb.slot===b.slot}).length;if(here){ctx.fillStyle=b.c;rr(ctx,1600,b.y+58,60,16,8);ctx.fillStyle='#fff';ctx.fillText('🎙 '+here,1630,b.y+66)}});
}

/* ================= الحركة: الأسهم أو النقر بالماوس ================= */
const keys=new Set();let path=null,guide=null,stillT=0,clickMark=null;
const typing=e=>e.target&&e.target.closest&&e.target.closest('input,select,textarea,[contenteditable=true]');
const ARROWS=['arrowup','arrowdown','arrowleft','arrowright'];
addEventListener('keydown',e=>{if(typing(e)||!$('#auth').hidden||!$('#onb').hidden)return;if(WB.bid){wbKey(e);return}const k=e.key.toLowerCase();if(ARROWS.includes(k)){keys.add(k);path=null;e.preventDefault()}else if(k==='m'&&V.channel&&!e.ctrlKey&&!e.metaKey)toggleMute()});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());
cv.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=cv.getBoundingClientRect();const g={x:(e.clientX-r.left-pad)/scale+cam.x,y:(e.clientY-r.top)/scale+cam.y};
 const p=findPath(me,g);if(p&&p.length){path=p;clickMark={x:g.x,y:g.y,t:performance.now()}}if(document.activeElement)document.activeElement.blur()});
function faceOf(vx,vy,prev){if(Math.hypot(vx,vy)<15)return prev;return Math.abs(vx)>Math.abs(vy)*1.1?(vx>0?'right':'left'):(vy>0?'down':'up')}
function stepMe(dt){
 let ix=0,iy=0;
 if(keys.has('arrowup'))iy-=1;if(keys.has('arrowdown'))iy+=1;if(keys.has('arrowleft'))ix-=1;if(keys.has('arrowright'))ix+=1;
 let spd=230;
 if(!ix&&!iy&&path&&path.length){const t=path[0],dx=t.x-me.x,dy=t.y-me.y,l=Math.hypot(dx,dy);if(l<6&&path.length>1){path.shift()}else if(l<2){path=null}else{ix=dx/l;iy=dy/l;if(path.length===1)spd=Math.min(230,l*6+30)}}
 const l=Math.hypot(ix,iy);const tvx=l?ix/l*spd:0,tvy=l?iy/l*spd:0;const k=ease(dt,l?12:16);
 me.vx+=(tvx-me.vx)*k;me.vy+=(tvy-me.vy)*k;if(Math.abs(me.vx)<2)me.vx=0;if(Math.abs(me.vy)<2)me.vy=0;
 const ox=me.x,oy=me.y;
 if(me.vx){if(!hits(me.x+me.vx*dt,me.y,12))me.x+=me.vx*dt;else me.vx=0}
 if(me.vy){if(!hits(me.x,me.y+me.vy*dt,12))me.y+=me.vy*dt;else me.vy=0}
 const moved=Math.hypot(me.x-ox,me.y-oy);
 me.phase+=moved*.11;me.face=faceOf(me.vx,me.vy,me.face);
 const was=me.moving;me.moving=moved/dt>25;
 return moved>.2||was!==me.moving;
}
function botRoute(b,to){
 const d=deskOf(b.desk),c=d.colX,seat=d.seat,aisle={x:c,y:420};let pts=[];
 if(b.at==='desk')pts.push({x:c,y:seat.y},aisle);
 if(b.at==='meeting')pts.push({x:1304,y:380},{x:1304,y:470},{x:1000,y:470},aisle);
 if(b.at==='lounge')pts.push({x:1117,y:580},{x:1117,y:470},{x:1000,y:470},aisle);
 const i=BOTS.indexOf(b);
 if(to==='desk')pts.push(aisle,{x:c,y:seat.y},seat);
 if(to==='meeting')pts.push({x:1000,y:470},{x:1304,y:470},{x:1304,y:380},MEET_SEATS[i]);
 if(to==='lounge')pts.push({x:1000,y:470},{x:1117,y:470},{x:1117,y:580},{x:1110+i*70,y:660});
 if(b.at===to)return;b.route=pts;b.at=to;
}
function stepBots(dt){const now=Date.now();BOTS.forEach(b=>{
 if(b.route.length){const p=b.route[0],dx=p.x-b.x,dy=p.y-b.y,l=Math.hypot(dx,dy),sp=Math.min(170,40+l*3)*dt;b.moving=true;b.face=faceOf(dx,dy,b.face);if(l<=sp){b.x=p.x;b.y=p.y;b.route.shift()}else{b.x+=dx/l*sp;b.y+=dy/l*sp}b.phase+=sp*.11}
 else{b.moving=false;if(b.at==='desk')b.face=deskOf(b.desk).top?'down':'up'}
 if(!b.route.length&&now>b.next&&!(cur&&cur.type==='person'&&cur.id===b.id)&&b.at!=='meeting'){b.next=now+45000+Math.random()*40000;botRoute(b,b.at==='desk'?'lounge':'desk');if(b.at==='lounge')b.next=now+18000}
 if(b.say&&now>b.say.until)b.say=null;
})}

/* ================= الحضور ================= */
let lastPos=0,posDirty=true;
function sendPos(force){if(!joined||!me.name)return;const n=Date.now();if(!force&&(!posDirty||n-lastPos<60))return;lastPos=n;posDirty=false;
 socket.emit('pos',{x:Math.round(me.x),y:Math.round(me.y),floor:me.floor,face:me.face,status:me.status,moving:me.moving,say:me.say})}
setInterval(()=>{posDirty=true},4000);

/* ================= الوجهة القريبة ================= */
let cur=null,curKey=null,dismissed=null,curTarget=null;
function findTarget(){
 const z=zoneAt(me);
 if(z==='meeting')return{type:'meeting',key:'meeting',zone:true};
 if(z==='planning'){const b=boardAt(me);return b?{type:'board',slot:b.slot,key:'b:'+b.slot,zone:true}:null}
 let best=null,bd=1e9;const cand=(d,t)=>{if(d<bd){bd=d;best=t}};
 if(dist(me,ELEV)<62)cand(0,{type:'elevator',key:'elevator',at:ELEV});
 const rd=dist(me,RECEPT);if(rd<110)cand(rd,{type:'reception',key:'reception',at:RECEPT});
 botsHere().forEach(b=>{const d=dist(me,b);if(d<70)cand(d-25,{type:'person',id:b.id,key:'p:'+b.id,at:b})});
 floorPeers().forEach(([,p])=>{if(p.uid&&p.uid!==me.id){const d=dist(me,p.pos);if(d<60)cand(d-25,{type:'person',id:p.uid,key:'p:'+p.uid,at:p.pos})}});
 DESKS.forEach(dk=>{const d=Math.min(Math.hypot(me.x-(dk.x+dk.w/2),me.y-(dk.y+dk.h/2)),dist(me,dk.seat)+10);if(d<80){const o=deskOwner(dk),at={x:dk.x+dk.w/2,y:dk.y+dk.h/2};
  if(!o){if(!me.desk||moveDesk)cand(d+5,{type:'free',desk:dk.id,key:'f:'+dk.id,at})}else if(o===me.id)cand(d+5,{type:'mine',desk:dk.id,key:'m:'+dk.id,at});else cand(d+5,{type:'person',id:o,key:'p:'+o,at})}});
 return best;
}

/* ================= الحلقة ================= */
let last=performance.now();
function frame(now){
 const dt=Math.min(.05,(now-last)/1000);last=now;const t=now/1000;
 const active=me.name&&joined&&$('#onb').hidden&&$('#auth').hidden&&!switching;
 if(active){if(stepMe(dt))posDirty=true}
 stillT=me.moving?0:stillT+dt;
 stepBots(dt);sendPos();
 if(me.say&&Date.now()-me.say.t>6000){me.say=null;posDirty=true}
 const fp=floorPeers();
 fp.forEach(([,p])=>{const k=ease(dt,10),ox=p.pos.x,oy=p.pos.y;p.pos.x+=(p.x-p.pos.x)*k;p.pos.y+=(p.y-p.pos.y)*k;const mv=Math.hypot(p.pos.x-ox,p.pos.y-oy);p.phase+=mv*.11;p.spd=p.spd*.8+(mv/dt)*.2;p.vface=p.spd>20?faceOf(p.pos.x-ox,p.pos.y-oy,p.vface):(p.face||p.vface)});
 $('#onCount').textContent=1+new Set(fp.map(([,p])=>p.uid).filter(u=>u!==me.id)).size;
 voiceTick();
 // الكاميرا: مقرّبة تتبع الشخصية، وتقترب أكثر عند التوقف عند مكتب أو زميل
 const panelOpen=!panel.classList.contains('hide')&&$('#board').hidden;
 const padT=(panelOpen&&vw>700)?394:0;pad+=(padT-pad)*ease(dt,9);if(Math.abs(padT-pad)<.5)pad=padT;
 const near=curTarget&&curTarget.at&&['person','free','mine','reception','elevator'].includes(curTarget.type);
 focusZ+=((near?.22:0)-focusZ)*ease(dt,4);
 const ts=overview?fitS():clamp(Math.max(fitS(),zoomU*(1+focusZ)),.5,3);
 scale=cam.init?scale+(ts-scale)*ease(dt,6):ts;
 const viewW=(vw-pad)/scale,viewH=vh/scale;
 const fx=near?(me.x*.6+curTarget.at.x*.4):me.x,fy=near?(me.y*.6+curTarget.at.y*.4):me.y;
 const tx=W<=viewW?(W-viewW)/2:clamp(fx-viewW/2,0,W-viewW),ty=H<=viewH?(H-viewH)/2:clamp(fy-viewH/2,0,H-viewH);
 if(!cam.init){cam.x=tx;cam.y=ty;cam.init=true}else{const k=ease(dt,6);cam.x+=(tx-cam.x)*k;cam.y+=(ty-cam.y)*k}
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e6e9f3';ctx.fillRect(0,0,cv.width,cv.height);
 ctx.setTransform(dpr*scale,0,0,dpr*scale,(pad-cam.x*scale)*dpr,-cam.y*scale*dpr);
 ctx.imageSmoothingQuality='high';ctx.drawImage(SC,0,0,W,H);
 drawDynamic(t);
 if(path&&path.length&&clickMark){const a=Math.max(0,1-(now-clickMark.t)/1500);ctx.save();ctx.globalAlpha=.25+a*.5;ctx.strokeStyle='#0616C4';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(clickMark.x,clickMark.y,10+(1-a)*6,5+(1-a)*3,0,0,7);ctx.stroke();ctx.restore()}
 if(guide){const g=guide;if(Date.now()>g.until||dist(me,g)<45)guide=null;else{ctx.save();ctx.strokeStyle='#8042EB';ctx.lineWidth=4;ctx.setLineDash([10,9]);ctx.lineDashOffset=-t*40;ctx.beginPath();ctx.moveTo(me.x,me.y+10);ctx.lineTo(g.x,g.y);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='rgba(128,66,235,.25)';dot(ctx,g.x,g.y,22+4*Math.sin(t*5));ctx.fillStyle='#8042EB';dot(ctx,g.x,g.y,8);ctx.restore()}}
 const ents=[];
 ents.push({y:RECEPT.y-16,draw:()=>drawAvatar(ctx,RECEPT.x,RECEPT.y-16,{gender:'f',shirt:'#0616C4',hair:'#00175A',skin:'#f6d6bd',style:'hijab'},{t}),tag:()=>tag(RECEPT.x,RECEPT.y-16,'نور · الاستقبال (AI)',{bot:true})});
 botsHere().forEach(b=>ents.push({y:b.y,draw:()=>drawAvatar(ctx,b.x,b.y,b.look,{t,moving:b.moving,phase:b.phase,face:b.face}),tag:()=>tag(b.x,b.y,b.name,{bot:true,say:b.say&&b.say.text})}));
 fp.forEach(([sid,p])=>{const look=p.look&&p.look.shirt?p.look:{gender:'m',shirt:'#3d3d4d',hair:'#1d140f',skin:'#e8b98f',style:'short'};
  ents.push({y:p.pos.y,draw:()=>drawAvatar(ctx,p.pos.x,p.pos.y,look,{t,moving:p.spd>20,phase:p.phase,face:p.vface,status:p.status,voice:!!p.voice,speaking:V.speaking.has(sid)}),tag:()=>tag(p.pos.x,p.pos.y,p.name||'زميل',{say:p.say&&p.say.text,status:p.status})})});
 if(me.name)ents.push({y:me.y,draw:()=>drawAvatar(ctx,me.x,me.y,me.look,{t,moving:me.moving,phase:me.phase,face:me.face,status:me.status,me:true,voice:!!V.channel,speaking:V.speaking.has('me')}),tag:()=>tag(me.x,me.y,me.name+' (أنت)',{me:true,say:me.say&&me.say.text,status:me.status})});
 ents.sort((a,b)=>a.y-b.y).forEach(e=>e.draw());ents.forEach(e=>e.tag());
 if(active){const tg=findTarget();const want=tg&&(tg.zone||stillT>=.35||tg.key===curKey)?tg:null;const k=want?want.key:null;
  if(k!==curKey){curKey=k;curTarget=want;if(k&&k===dismissed){}else{dismissed=null;want?openTarget(want):closeAll()}}}
 requestAnimationFrame(frame);
}

/* ================= الطوابق والمصعد ================= */
let switching=false;
function fillFloorSelect(){$('#floor').innerHTML=FLOORS.map(f=>`<option value="${f.id}" ${f.id===me.floor?'selected':''}>الطابق ${f.n} · ${esc(f.name)}</option>`).join('');
 const f=FL();$('#flbadge').innerHTML=`الطابق ${f.n} · ${esc(f.name)}<small>المصعد في الاستقبال</small>`}
function goFloor(fid){if(fid===me.floor||switching)return;const f=FLOORS.find(x=>x.id===fid);if(!f)return;
 switching=true;const fade=$('#fade');fade.textContent='الطابق '+f.n+' · '+f.name;fade.classList.add('on');closeAll();curKey=null;curTarget=null;
 setTimeout(()=>{me.floor=fid;LS.set('office.floor',fid);me.x=ELEV.x+20;me.y=ELEV.y+30;me.vx=me.vy=0;me.face='right';path=null;guide=null;cam.init=false;recHist=[];
  buildStatic();fillFloorSelect();posDirty=true;sendPos(true);
  setTimeout(()=>{fade.classList.remove('on');switching=false},250)},320)}
$('#floor').onchange=e=>goFloor(e.target.value);

/* ================= اللوحات الجانبية ================= */
const panel=$('#panel');
function closePanel(){if(pair){socket.emit('pair:close');pair=null}cur=null;panel.classList.add('hide')}
function closeAll(){closePanel();closeBoard()}
function toast(text,actions,ms=5200){const d=document.createElement('div');d.className='toast';d.textContent=text;
 if(actions){const w=document.createElement('div');actions.forEach(([l,f],i)=>{const b=document.createElement('button');b.className='btn '+(i?'ghost':'ok');b.textContent=l;b.onclick=()=>{f();d.remove()};w.appendChild(b)});d.appendChild(w)}
 $('#toasts').prepend(d);setTimeout(()=>d.remove(),ms)}
const stLabel={free:'متاح',busy:'مشغول',focus:'في وضع التركيز'};
function head(color,name,sub){return`<div class="ph"><span class="pdot" style="background:${esc(color)}"></span><div><b>${esc(name)}</b><small id="phSub">${esc(sub)}</small></div><button class="x" data-x aria-label="إغلاق">×</button></div>`}
function bindCommon(root=panel){root.querySelector('[data-x]').onclick=()=>{dismissed=curKey;closeAll()};
 root.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{root.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b));root.querySelectorAll('.pane').forEach(p=>p.hidden=p.dataset.pane!==b.dataset.tab)})}
function renderMsgs(el,list,nameOf){if(!el)return;const atBottom=el.scrollHeight-el.scrollTop-el.clientHeight<40;
 el.innerHTML=list.length?list.map(m=>`<div class="m ${m.by===me.id?'me':''}"><small>${esc(m.by===me.id?'أنت':nameOf(m))}</small>${esc(m.text)}</div>`).join(''):'<div class="m sys">لا رسائل بعد. ابدأ الحديث.</div>';
 if(atBottom||list.length<3)el.scrollTop=el.scrollHeight}
function openTarget(tg){
 if(tg.type==='board'){closePanel();return openBoard(me.floor+'.'+tg.slot)}
 closeBoard();if(pair){socket.emit('pair:close');pair=null}
 cur=tg;panel.classList.remove('hide');
 if(tg.type==='person')return personPanel(tg.id);
 if(tg.type==='elevator')return elevatorPanel();
 if(tg.type==='free'){const d=deskOf(tg.desk);const zone=d.pod<0?FL().manager:FL().pods[d.pod];panel.innerHTML=head('#c9cdea','مكتب فارغ',zone+' · الطابق '+FL().n)+`<div class="big"><p>${me.desk?'هذا المكتب متاح. انقل مكتبك إليه؟':'هذا المكتب متاح. احجزه ليصبح مكتبك، فيجدك الزملاء عنده ويرون مساحتكم المشتركة.'}</p><button class="btn" id="claim">${me.desk?'انقل مكتبي إلى هنا':'هذا مكتبي'}</button></div>`;bindCommon();
  $('#claim').onclick=()=>{me.desk=deskKey(d);moveDesk=false;saveProfile();toast('صار مكتبك في '+zone);curKey=null};return}
 if(tg.type==='mine'){panel.innerHTML=head(me.look.shirt,'مكتبك',deskLabel(me.desk))+`<div class="big"><p>عندما يصل زميل إلى مكتبك ويتوقف عنده تنفتح بينكما محادثة ومساحة مشتركة، ويمكنه أن يتصل بك صوتياً.</p><p>حالتك الآن: <b>${stLabel[me.status]}</b>. غيّرها من الشريط العلوي؛ في وضع «تركيز» يطرق الزائر الباب قبل أن يتحدث إليك.</p><div class="row" style="padding:0"><button class="btn ghost" id="mv">انقل مكتبي</button><button class="btn ghost" id="leave">اترك المكتب</button></div></div>`;bindCommon();
  $('#mv').onclick=()=>{moveDesk=true;toast('المكاتب الفارغة محاطة الآن بإطار بنفسجي. امشِ إلى أحدها وتوقف عنده.');closeAll();dismissed=curKey};
  $('#leave').onclick=()=>{me.desk=null;saveProfile();curKey=null};return}
 if(tg.type==='reception')return receptionPanel();
 if(tg.type==='meeting')return meetingPanel();
}
function elevatorPanel(){panel.innerHTML=head('#00175A','المصعد','اختر الطابق')+`<div class="floors">${FLOORS.slice().reverse().map(f=>{const n=[...peers.values()].filter(p=>p.floor===f.id).length+(f.id===me.floor?1:0);return`<button data-f="${f.id}" class="${f.id===me.floor?'cur':''}"><b>${f.n}</b><span>${esc(f.name)}</span><em>${f.id===me.floor?'أنت هنا':n?n+' متصل':''}</em></button>`}).join('')}</div>`;
 bindCommon();panel.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>goFloor(b.dataset.f))}

/* --- مكتب زميل --- */
let pair=null;
function personSub(id){const p=person(id)||{};const bot=id.startsWith('bot-');const pr=peerOfUid(id);const online=bot||!!pr;const st=bot?p.status:pr&&pr.status;const where=pr&&pr.floor!==me.floor?' · في الطابق '+(FLOORS.find(f=>f.id===pr.floor)||{}).n:'';return{text:(p.role||'عضو الفريق')+' · '+(online?(stLabel[st]||'متاح')+where:'غير متصل الآن'),online,st,bot}}
function refreshPersonHead(){if(!cur||cur.type!=='person')return;const s=$('#phSub');if(s)s.textContent=personSub(cur.id).text}
function personPanel(id){
 const p=person(id)||{name:'زميل',look:{shirt:'#888'}};const info=personSub(id);
 pair={id,key:null,doc:{agreements:[],tasks:[],files:[]},msgs:[]};
 const stNote=info.st==='focus'?`<div class="note st" style="background:#e5484d">🔴 ${esc(p.name)} في وضع التركيز · لا إزعاج<div style="margin-top:6px;font-weight:500">يمكنك ترك رسالة أو أن تطرق الباب.</div><div style="margin-top:6px"><button class="btn" id="knock" style="height:34px;background:#fff;color:#b42318">🚪 اطرق الباب</button></div></div>`:info.st==='busy'?`<div class="note st" style="background:#f0a020">🟡 ${esc(p.name)} مشغول الآن، قد يتأخر في الرد.</div>`:'';
 panel.innerHTML=head(p.look&&p.look.shirt,p.name,info.text)+
 `<div class="tabs"><button data-tab="chat" class="on">المحادثة</button><button data-tab="shared">مساحتنا المشتركة</button></div>
 <div class="pane" data-pane="chat">${stNote}${!info.online?`<div class="note">غير متصل الآن. اترك رسالة وسيجدها عند عودته إلى المكتب.</div>`:''}
 ${info.online&&!info.bot&&info.st!=='focus'?`<div class="row"><button class="btn ok" id="callBtn">📞 مكالمة صوتية</button></div>`:''}
 <div class="msgs" id="msgs"></div><div class="typing" id="typing" hidden>يكتب…</div>
 <form class="send" id="chatF"><input id="chatIn" placeholder="اكتب رسالة…" autocomplete="off"><button class="btn">إرسال</button></form></div>
 <div class="pane" data-pane="shared" hidden><div class="scrollp">
  <div class="sec"><h4>اتفقنا على</h4><ul id="agr"></ul><form data-k="agr:add"><input placeholder="أضف نقطة اتفاق"><button class="btn">+</button></form></div>
  <div class="sec"><h4>مهام مشتركة</h4><ul id="tsk"></ul><form data-k="task:add"><input placeholder="مهمة جديدة"><select class="in" style="flex:0 0 auto"><option value="me">عليّ</option><option value="you">على ${esc(String(p.name).split(' ')[0])}</option></select><button class="btn">+</button></form></div>
  <div class="sec"><h4>ملفات نعمل عليها</h4><ul id="fil"></ul><form data-k="file:add"><input placeholder="اسم الملف"><input placeholder="https://" dir="ltr"><button class="btn">+</button></form></div>
 </div></div>`;
 bindCommon();
 const kn=$('#knock');if(kn)kn.onclick=()=>{socket.emit('knock',{to:id});toast('طرقت الباب على '+p.name);kn.disabled=true};
 const cb=$('#callBtn');if(cb)cb.onclick=()=>{if(!pair.key)return;socket.emit('call:invite',{to:id});V.pairCall='pair:'+pair.key;V.pairName=p.name;toast('يجري الاتصال بـ'+p.name+'…')};
 socket.emit('pair:open',{other:id},r=>{if(!r||!pair||pair.id!==id)return;pair.key=r.key;pair.doc=r.doc;pair.msgs=r.msgs||[];drawPairMsgs();renderShared()});
 $('#chatF').onsubmit=e=>{e.preventDefault();const inp=$('#chatIn'),text=inp.value.trim().slice(0,1000);if(!text)return;inp.value='';
  socket.emit('pair:msg',{other:id,text});if(info.bot){const ty=$('#typing');if(ty)ty.hidden=false;const b=BOTS.find(x=>x.id===id);if(b)b.status='busy';socket.emit('ai:bot',{bot:id})}};
 panel.querySelectorAll('form[data-k]').forEach(f=>f.onsubmit=e=>{e.preventDefault();const ins=f.querySelectorAll('input');const v=ins[0].value.trim();if(!v)return;
  const op={type:f.dataset.k};if(op.type==='file:add'){op.title=v;op.url=ins[1].value.trim()}else op.text=v;
  if(op.type==='task:add')op.owner=f.querySelector('select').value;ins.forEach(i=>i.value='');socket.emit('pair:op',{other:id,op})});
 setTimeout(()=>{const i=$('#chatIn');if(i)i.focus({preventScroll:true})},50);
}
function drawPairMsgs(){if(!pair)return;renderMsgs($('#msgs'),pair.msgs.slice(-80),m=>{const q=person(m.by);return q?q.name:'زميل'})}
function renderShared(){if(!pair||!$('#agr'))return;const d=pair.doc,p=person(pair.id)||{name:'زميل'};
 const who=o=>o===me.id?'عليّ':'على '+String(p.name).split(' ')[0];
 $('#agr').innerHTML=d.agreements.length?d.agreements.map(a=>`<li><span>${esc(a.text)}</span><button data-del="${esc(a.id)}" aria-label="حذف">×</button></li>`).join(''):'<div class="empty">لم تسجّلا أي اتفاق بعد.</div>';
 $('#tsk').innerHTML=d.tasks.length?d.tasks.map(a=>`<li class="${a.done?'done':''}"><input type="checkbox" data-tog="${esc(a.id)}" ${a.done?'checked':''} style="height:18px;flex:none"><span>${esc(a.text)}</span><em>${esc(who(a.owner))}</em><button data-del="${esc(a.id)}" aria-label="حذف">×</button></li>`).join(''):'<div class="empty">لا مهام مشتركة.</div>';
 $('#fil').innerHTML=d.files.length?d.files.map(a=>`<li><span>${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.title)}</a>`:esc(a.title)}</span><button data-del="${esc(a.id)}" aria-label="حذف">×</button></li>`).join(''):'<div class="empty">لا ملفات بعد. أضف اسم الملف ورابطه.</div>';
 panel.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>socket.emit('pair:op',{other:pair.id,op:{type:'del',id:b.dataset.del}}));
 panel.querySelectorAll('[data-tog]').forEach(b=>b.onchange=()=>socket.emit('pair:op',{other:pair.id,op:{type:'task:toggle',id:b.dataset.tog,done:b.checked}}));
}

/* --- الاستقبال: نور --- */
let recHist=[];
function receptionPanel(){
 panel.innerHTML=head('#0616C4','نور · موظفة الاستقبال','مرشدة المبنى (ذكاء اصطناعي)')+`<div class="pane"><div class="msgs" id="rmsgs"></div><div class="typing" id="rty" hidden>تكتب…</div>
 <div class="chips">${['خذني إلى غرفة الاجتماعات','أين لوحة '+FL().pods[2]+'؟','أين المصعد؟','كيف يعمل الصوت؟'].map(q=>`<button>${esc(q)}</button>`).join('')}</div>
 <form class="send" id="rF"><input id="rIn" placeholder="اسأل نور…" autocomplete="off"><button class="btn">إرسال</button></form></div>`;
 bindCommon();
 if(!recHist.length)recHist.push({me:false,text:`أهلاً ${me.name}! أنا نور. أنت في الطابق ${FL().n}: ${FL().name}. ${me.desk?'':'لم تحجز مكتباً بعد: المكاتب الفارغة محاطة بإطار بنفسجي، امشِ إلى أحدها وتوقف عنده. '}المصعد إلى يميني للتنقل بين الطوابق، واسألني عن أي مكان أو زميل وسأرسم لك الطريق.`});
 const draw=()=>renderMsgs($('#rmsgs'),recHist.map(m=>({by:m.me?me.id:'nour',text:m.text})),()=>'نور');draw();
 const ask=q=>{recHist.push({me:true,text:q});draw();$('#rty').hidden=false;
  const ctxt='الأشخاص:\n'+[...botsHere().map(b=>`${b.name} — ${b.role} — مكتبه في ${FL().pods[deskOf(b.desk).pod]}`),...Object.entries(profiles).filter(([i])=>i!==me.id).map(([i,p])=>`${p.name} — ${p.role||'عضو'} — ${p.desk?'مكتبه في '+deskLabel(p.desk):'بلا مكتب'}${peerOfUid(i)?' (متصل الآن'+(peerOfUid(i).floor!==me.floor?' في الطابق '+(FLOORS.find(f=>f.id===peerOfUid(i).floor)||{}).n:'')+')':' (غير متصل)'}`)].join('\n')+`\nالزائر الحالي: ${me.name}${me.desk?' ومكتبه في '+deskLabel(me.desk):' ولم يحجز مكتباً بعد'}.`;
  const done=(text,g)=>{if(g){const r=resolvePlace(g);if(r)guide={...r,until:Date.now()+25000}}recHist.push({me:false,text:text||offlineNour(q)});const ty=$('#rty');if(ty)ty.hidden=true;if($('#rmsgs'))draw()};
  if(!AI)return setTimeout(()=>done(null),300);
  socket.timeout(30000).emit('ai:nour',{history:recHist.slice(-12),context:ctxt,floor:me.floor},(err,r)=>done(!err&&r&&r.text,!err&&r&&r.guide))};
 panel.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>ask(b.textContent));
 $('#rF').onsubmit=e=>{e.preventDefault();const v=$('#rIn').value.trim();if(!v)return;$('#rIn').value='';ask(v)};
}
function resolvePlace(t){t=String(t).trim();const P=places();if(P[t])return{...P[t]};if(t==='my_desk'&&me.desk&&me.desk.startsWith(me.floor+':')){const d=deskOf(me.desk.split(':')[1]);return{x:d.seat.x,y:d.seat.y,n:'مكتبك'}}
 const all=[...botsHere().map(b=>[b.id,b]),...Object.entries(profiles)];for(const [id,p] of all){const nm=String(p.name||'');if(nm&&(t.includes(nm.split(' ')[0])||nm.includes(t))){const bb=BOTS.find(b=>b.id===id);if(bb)return{x:bb.x,y:bb.y+30,n:nm};const pr=peerOfUid(id);if(pr&&pr.floor===me.floor)return{x:pr.pos.x,y:pr.pos.y,n:nm};if(p.desk&&p.desk.startsWith(me.floor+':')){const d=deskOf(p.desk.split(':')[1]);return{x:d.seat.x,y:d.seat.y,n:nm}}}}
 for(const k in P)if(t.includes(P[k].n)||P[k].n.includes(t))return{...P[k]};return null}
function offlineNour(q){const P=places(),go=k=>{guide={...P[k],until:Date.now()+25000}};
 if(q.includes('مصعد')||q.includes('طابق')){go('elevator');return 'المصعد بجانبي، اتبع الخط البنفسجي وتوقف عنده لتختار الطابق.'}
 if(q.includes('اجتماع')){go('meeting');return 'اتبع الخط البنفسجي إلى غرفة الاجتماعات. عند دخولها يعمل الصوت تلقائياً بين الحاضرين، وتبدأ جلسة جديدة تُؤرشف عند خروج الجميع.'}
 for(const b of BOARDS){const tt=boardTitle(b.slot);if(q.includes('لوحة')&&q.includes(tt.replace('مسار ','')))return go('board_'+b.slot),'اتبع الخط البنفسجي إلى لوحة '+tt+' في غرفة لوحة التخطيط المشترك.'}
 if(q.includes('لوحة')||q.includes('تخطيط')){go('planning');return 'اتبع الخط البنفسجي إلى غرفة لوحة التخطيط المشترك.'}
 if(q.includes('صوت'))return 'الصوت يعمل تلقائياً عند دخول غرفة الاجتماعات أو الوقوف أمام إحدى لوحات التخطيط، ويسمعك فقط من معك في المكان نفسه. ولمكالمة ثنائية توقف عند مكتب زميلك واضغط «مكالمة صوتية».';
 return 'امشِ بالأسهم أو انقر بالماوس على المكان الذي تريده. توقف عند مكتب أي زميل لتفتح محادثة ومساحة مشتركة، وادخل غرفة الاجتماعات أو قف أمام لوحة تخطيط للحديث مع الفريق صوتياً.'}

/* --- غرفة الاجتماعات: جلسة جديدة عند الدخول، وأرشفة تلقائية عند خروج الجميع --- */
const meetCh=()=>'meeting:'+me.floor;
function meetingPanel(){
 const n=(archive[me.floor]||[]).length;
 panel.innerHTML=head('#8042EB','غرفة الاجتماعات','الطابق '+FL().n+' · الصوت يعمل تلقائياً هنا')+`<div class="tabs"><button data-tab="talk" class="on">الجلسة الحالية</button><button data-tab="arch">الأرشيف${n?' ('+n+')':''}</button></div>
 <div class="pane" data-pane="talk"><div class="sess" id="sessInfo"></div><div class="note">كل من في الغرفة يسمع الآخرين ويرى هذا النقاش. عند خروج الجميع تُحفظ الجلسة في الأرشيف وتبدأ جلسة جديدة مع الدخول التالي.</div>
 <div class="row">${botsHere().length?`<button class="btn ghost" id="inv">${BOTS.some(b=>b.at==='meeting')?'أعِد الزملاء التجريبيين':'ادعُ الزملاء التجريبيين'}</button>`:''}<button class="btn ghost" id="newM">أرشف وابدأ جلسة جديدة</button></div>
 <div class="msgs" id="mmsgs"></div><div class="typing" id="mty" hidden>…</div>
 <div class="row" style="padding-top:0"><button class="btn vi" id="mkMin">أنشئ المحضر ووزّع المهام</button></div>
 <form class="send" id="mF"><input id="mIn" placeholder="اكتب للحاضرين…" autocomplete="off"><button class="btn">إرسال</button></form></div>
 <div class="pane" data-pane="arch" hidden><div class="scrollp"><div class="arch" id="archList"></div></div></div>`;
 bindCommon();drawMeet();drawArch();
 const inv=$('#inv');if(inv)inv.onclick=e=>{const back=BOTS.some(b=>b.at==='meeting');BOTS.forEach(b=>botRoute(b,back?'desk':'meeting'));e.target.textContent=back?'ادعُ الزملاء التجريبيين':'أعِد الزملاء التجريبيين';if(!back)toast('أحمد ولين في طريقهما إلى غرفة الاجتماعات')};
 $('#newM').onclick=()=>{socket.emit('meeting:new',{floor:me.floor});toast('حُفظت الجلسة السابقة في الأرشيف وبدأت جلسة جديدة')};
 $('#mF').onsubmit=e=>{e.preventDefault();const v=$('#mIn').value.trim().slice(0,1000);if(!v)return;$('#mIn').value='';me.say={text:v,t:Date.now()};posDirty=true;socket.emit('meeting:msg',{text:v,floor:me.floor});
  const here=botsHere().filter(b=>b.at==='meeting'&&!b.route.length).map(b=>b.id);if(here.length)setTimeout(()=>socket.emit('ai:meetbots',{bots:here,floor:me.floor}),400)};
 $('#mkMin').onclick=()=>{const b=$('#mkMin');b.disabled=true;b.textContent='يُكتب المحضر…';
  socket.timeout(60000).emit('minutes:make',{floor:me.floor},(err,r)=>{b.disabled=false;b.textContent='أنشئ المحضر ووزّع المهام';
   if(err||!r)return toast('تعذّر إنشاء المحضر، حاول مرة أخرى');if(r.error)return toast(r.error);
   toast('كُتب المحضر'+(r.distributed?' ووُزّعت '+r.distributed+' مهام على مكاتب أصحابها':''));drawMeet()})};
}
function minutesHtml(m){return`<div class="card"><b>📝 ${esc(m.title||'محضر اجتماع')}</b><small>${esc(fmtT(m.t))}</small><p style="margin:6px 0">${esc(m.summary||'')}</p>${(m.decisions||[]).length?`<b style="font-size:13.5px">القرارات</b><ul>${m.decisions.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:''}${(m.actions||[]).length?`<b style="font-size:13.5px">المهام</b><ul>${m.actions.map(a=>`<li>${esc(a.who)}: ${esc(a.what)}${a.due?' · '+esc(a.due):''}</li>`).join('')}</ul>`:''}</div>`}
function drawMeet(){const m=meet(),el=$('#sessInfo');if(el)el.textContent=m.sid?'جلسة بدأت الساعة '+fmtH(m.startedAt)+' · '+m.msgs.length+' رسالة':'لا جلسة جارية بعد، تبدأ مع أول دخول.';
 renderMsgs($('#mmsgs'),m.msgs,x=>String(x.name||'زميل'));
 const mm=$('#mmsgs');if(mm&&m.sid){const mins=minutes.filter(x=>x.sid===m.sid);if(mins.length){mm.insertAdjacentHTML('beforeend',mins.map(minutesHtml).join(''));mm.scrollTop=mm.scrollHeight}}}
function drawMin(){drawMeet()}
function drawArch(){const el=$('#archList');if(!el)return;const l=archive[me.floor]||[];
 el.innerHTML=l.length?l.map(a=>`<div class="ai" data-sid="${esc(a.sid)}"><b>🗓 ${esc(fmtT(a.startedAt))} – ${esc(fmtH(a.endedAt))}</b><small>${esc((a.attendees||[]).join('، '))} · ${a.count} رسالة${minutes.some(m=>m.sid===a.sid)?' · فيها محضر':''}</small><div class="msgs2" hidden></div></div>`).join(''):'<div class="empty">لا جلسات مؤرشفة بعد. تُحفظ كل جلسة هنا تلقائياً عند خروج الجميع من الغرفة.</div>';
 el.querySelectorAll('.ai').forEach(d=>d.onclick=e=>{if(e.target.closest('.msgs2'))return;const box=d.querySelector('.msgs2');if(!box.hidden){box.hidden=true;return}
  box.hidden=false;box.innerHTML='<div class="empty">جارٍ التحميل…</div>';
  socket.emit('meeting:session',{floor:me.floor,sid:d.dataset.sid},s=>{if(!s){box.innerHTML='<div class="empty">تعذّر تحميل الجلسة.</div>';return}
   box.innerHTML=s.msgs.map(m=>`<div class="m ${m.by===me.id?'me':''}"><small>${esc(m.by===me.id?'أنت':m.name)} · ${esc(fmtH(m.t))}</small>${esc(m.text)}</div>`).join('')+(s.minutes||[]).map(minutesHtml).join('')})})}

/* ================= لوحة التخطيط (على نمط منصة المسؤولية المجتمعية) ================= */
const WBC={y:'#FFF0A6',o:'#FFDDB8',p:'#FFD3DE',v:'#E4D8FF',b:'#CDE5FF',g:'#D2F0D4'};
const WBCN={y:'أصفر',o:'برتقالي',p:'وردي',v:'بنفسجي',b:'أزرق',g:'أخضر'};
const WINK=['#3A342B','#C62828','#1E5BB8','#1B7A43','#C4510F','#6B3FB0'];
const BOX=['note','text','frame','rect','ell','dia'],LINE=['arrow','line'];
const WB={bid:null,v:{x:0,y:0,z:1},tool:'sel',sel:null,drag:null,edit:null,pend:false,hist:{},redo:{},clip:null,nc:'y',ink:WINK[0],side:true,stab:'act',full:false,cursors:new Map(),lc:0,lm:0,space:false};
const boardEl=$('#board');
const wbB=()=>boards[WB.bid];
const wbItems=()=>{const b=wbB();return b?b.items:[]};
const wbFind=id=>wbItems().find(x=>x.id===id);
const nameShort=id=>{const p=person(id);return p?String(p.name).split(' ')[0]:''};
const SVG=d=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+d+'</svg>';
const ICON={sel:'<path d="M5 3l14 8-6 2-2 6z"/>',note:'<path d="M4 4h16v11l-5 5H4z"/><path d="M15 20v-5h5"/>',text:'<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',frame:'<rect x="3" y="5" width="18" height="15" rx="1.5" stroke-dasharray="3 2.5"/><path d="M3 9h7"/>',
 rect:'<rect x="3" y="6" width="18" height="12" rx="2"/>',ell:'<ellipse cx="12" cy="12" rx="9" ry="7"/>',dia:'<path d="M12 3l9 9-9 9-9-9z"/>',arrow:'<path d="M4 20L20 4M11 4h9v9"/>',line:'<path d="M4 20L20 4"/>',pen:'<path d="M4 20c4-1 6-9 9-12s6-3 7-2-1 4-4 6-9 4-12 8"/>',
 undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',redo:'<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',full:'<path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/>',side:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
 trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',dup:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V5a1 1 0 011-1h11"/>'};
const TOOLS=[['sel','تحديد وتحريك','V'],'|',['note','ستيكي نوت: ارسمه بالسحب أو انقر','N'],['text','نص أو عنوان','T'],['frame','إطار لتجميع الأفكار','F'],'|',['rect','مستطيل','R'],['ell','دائرة','O'],['dia','معيّن','D'],'|',['arrow','سهم: اسحب من نقطة إلى نقطة أو من عنصر إلى عنصر','A'],['line','خط مستقيم','L'],['pen','قلم رسم حر','P']];
function openBoard(bid){const b=boards[bid];if(!b)return;cur={type:'board',bid};WB.bid=bid;WB.sel=null;WB.tool='sel';WB.cursors.clear();WB.drag=null;WB.edit=null;boardEl.hidden=false;
 const slot=bid.split('.')[1],col=SLOTC[slot]||'#0616C4';
 boardEl.classList.toggle('full',WB.full);
 boardEl.innerHTML=`<div class="bhd" style="background:linear-gradient(90deg,var(--ocean),${esc(col)})"><div><h2>${esc(b.title)}</h2><small>لوحة التخطيط المشترك · الطابق ${FL().n} · ${esc(FL().name)}</small></div>
  <div class="who" id="wbWho"></div><button class="x" data-x aria-label="إغلاق اللوحة">×</button></div>
 <div class="wb-head"><div class="wb-tools" role="toolbar" aria-label="أدوات اللوحة">${TOOLS.map(t=>t==='|'?'<span class="wsep"></span>':`<button type="button" class="wtb" data-wbt="${t[0]}" title="${t[1]} (${t[2]})" aria-label="${t[1]}">${SVG(ICON[t[0]])}</button>`).join('')}
  <span class="wsep"></span><button type="button" class="wtb" id="wbUndo" title="تراجع (Ctrl+Z)" aria-label="تراجع">${SVG(ICON.undo)}</button><button type="button" class="wtb" id="wbRedo" title="إعادة (Ctrl+Y)" aria-label="إعادة">${SVG(ICON.redo)}</button></div>
  <div class="wb-sel" id="wbsel"></div><span class="sp"></span>
  <div class="wb-zoom"><button type="button" class="wtb" id="wbZo" aria-label="تصغير">−</button><span id="wbzv">100%</span><button type="button" class="wtb" id="wbZi" aria-label="تكبير">+</button><button type="button" class="wtb" id="wbZf" title="عرض كل اللوحة" aria-label="عرض كل اللوحة">${SVG(ICON.fit)}</button><button type="button" class="wtb" id="wbFull" title="ملء الشاشة" aria-label="ملء الشاشة">${SVG(ICON.full)}</button><button type="button" class="wtb" id="wbSide" title="قائمة النوتات" aria-label="قائمة النوتات">${SVG(ICON.side)}</button></div></div>
 <div class="wb-body"><div class="wb-vp" id="wbvp" tabindex="0" aria-label="لوحة التخطيط"><div class="wb-empty" id="wbempty"><b>لوحة التخطيط</b><span>اختر الستيكي نوت من الشريط وارسمه بالسحب، أو انقر نقرتين على اللوحة. علّم النوت بإشارة ✓ عند إنجازه فيُشطب.</span></div><div class="wb-world" id="wbw"></div></div>
  <aside class="wside" id="wside"></aside></div>
 <div class="wb-keys">اختصارات: Ctrl+C نسخ · Ctrl+V لصق · Ctrl+D تكرار · Ctrl+Z تراجع · Delete حذف · الأسهم للتحريك · Enter للكتابة · Esc لإلغاء التحديد · المسافة مع السحب للتنقل</div>`;
 boardEl.querySelector('[data-x]').onclick=()=>{dismissed=curKey;closeBoard()};
 boardEl.querySelectorAll('[data-wbt]').forEach(b=>b.onclick=()=>wbTool(b.dataset.wbt));
 $('#wbUndo').onclick=()=>wbUndo(false);$('#wbRedo').onclick=()=>wbUndo(true);
 $('#wbZi').onclick=()=>wbZoomAt(1.2);$('#wbZo').onclick=()=>wbZoomAt(1/1.2);$('#wbZf').onclick=()=>{wbFit();};
 $('#wbFull').onclick=()=>{WB.full=!WB.full;boardEl.classList.toggle('full',WB.full);setTimeout(wbApply,30)};
 $('#wbSide').onclick=()=>{WB.side=!WB.side;$('#wside').hidden=!WB.side;$('#wbSide').classList.toggle('on',WB.side);setTimeout(wbApply,30)};
 $('#wside').hidden=!WB.side;$('#wbSide').classList.toggle('on',WB.side);
 wbBind();wbTool('sel');wbDraw();requestAnimationFrame(()=>{wbFit();$('#wbvp').focus({preventScroll:true})});
}
function closeBoard(){if(!WB.bid)return;wbCommitEdit();WB.bid=null;WB.drag=null;boardEl.hidden=true;boardEl.classList.remove('full');boardEl.innerHTML='';if(cur&&cur.type==='board')cur=null}
function wbTool(t){WB.tool=t;boardEl.querySelectorAll('[data-wbt]').forEach(b=>{b.classList.toggle('on',b.dataset.wbt===t);b.setAttribute('aria-pressed',b.dataset.wbt===t)});const vp=$('#wbvp');if(vp)vp.className='wb-vp tool-'+t;if(t!=='sel'){WB.sel=null;wbDraw()}wbSelBar()}
function wbApply(){const w=$('#wbw');if(!w)return;w.style.transform=`translate(${WB.v.x}px,${WB.v.y}px) scale(${WB.v.z})`;$('#wbzv').textContent=Math.round(WB.v.z*100)+'%';wbCursors()}
function wbToWorld(e){const r=$('#wbvp').getBoundingClientRect();return{x:(e.clientX-r.left-WB.v.x)/WB.v.z,y:(e.clientY-r.top-WB.v.y)/WB.v.z}}
function wbZoomAt(f,cx,cy){const vp=$('#wbvp');if(!vp)return;cx=cx??vp.clientWidth/2;cy=cy??vp.clientHeight/2;const nz=clamp(WB.v.z*f,.2,3);WB.v.x=cx-(cx-WB.v.x)*nz/WB.v.z;WB.v.y=cy-(cy-WB.v.y)*nz/WB.v.z;WB.v.z=nz;wbApply()}
function wbBox(i){const el=$(`#wbw [data-wid="${CSS.escape(i.id)}"]`);return{x:i.x,y:i.y,w:el?el.offsetWidth:i.w,h:el?el.offsetHeight:i.h}}
function wbBounds(){let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;const add=(x,y)=>{x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y)};
 wbItems().forEach(i=>{if(BOX.includes(i.t)){const r=wbBox(i);add(r.x,r.y);add(r.x+r.w,r.y+r.h)}else if(i.t==='pen')(i.pts||[]).forEach(q=>add(q[0],q[1]));else if(!i.a||!i.b){add(i.x1,i.y1);add(i.x2,i.y2)}});return x1>x2?null:{x1,y1,x2,y2}}
function wbFit(){const vp=$('#wbvp');if(!vp)return;const b=wbBounds(),W2=vp.clientWidth,H2=vp.clientHeight;
 if(!b){WB.v={x:W2/2,y:H2/2,z:1};return wbApply()}
 const z=clamp(Math.min((W2-120)/(b.x2-b.x1||1),(H2-120)/(b.y2-b.y1||1)),.25,1.2);WB.v={z,x:W2/2-(b.x1+b.x2)/2*z,y:H2/2-(b.y1+b.y2)/2*z};wbApply()}
function wbEdge(r,tx,ty){const cx=r.x+r.w/2,cy=r.y+r.h/2,dx=tx-cx,dy=ty-cy;if(!dx&&!dy)return{x:cx,y:cy};const s=Math.max(Math.abs(dx)/(r.w/2+6),Math.abs(dy)/(r.h/2+6));return{x:cx+dx/s,y:cy+dy/s}}
function wbEnds(i){const A=i.a&&wbFind(i.a),B=i.b&&wbFind(i.b);const RA=A&&BOX.includes(A.t)?wbBox(A):null,RB=B&&BOX.includes(B.t)?wbBox(B):null;
 const pa=RA?{x:RA.x+RA.w/2,y:RA.y+RA.h/2}:{x:i.x1,y:i.y1},pb=RB?{x:RB.x+RB.w/2,y:RB.y+RB.h/2}:{x:i.x2,y:i.y2};
 if([pa.x,pa.y,pb.x,pb.y].some(v=>v==null||isNaN(v)))return null;return{a:RA?wbEdge(RA,pb.x,pb.y):pa,b:RB?wbEdge(RB,pa.x,pa.y):pb}}
const penD=pts=>pts&&pts.length?'M'+pts.map(q=>q[0]+' '+q[1]).join(' L'):'';
const HND=['nw','n','ne','e','se','s','sw','w'];
function wbBusy(){return !!(WB.drag||WB.edit)}
function wbDraw(){const w=$('#wbw');if(!w||!wbB())return;if(wbBusy()){WB.pend=true;return}WB.pend=false;
 const its=wbItems(),sel=WB.sel;const hs=i=>sel===i.id?(i.t==='text'?['e','w']:HND).map(h=>`<span class="wb-h h-${h}" data-h="${h}"></span>`).join(''):'';
 const box=i=>{const st=`left:${i.x}px;top:${i.y}px;width:${i.w}px;`;const s=sel===i.id?' sel':'';
  if(i.t==='frame')return`<div class="wbi wf${s}" data-wid="${esc(i.id)}" style="${st}height:${i.h}px"><div class="wb-t wf-t" dir="auto">${esc(i.txt||'إطار')}</div>${hs(i)}</div>`;
  if(i.t==='note')return`<div class="wbi wn${i.done?' xck':''}${s}" data-wid="${esc(i.id)}" style="${st}min-height:${i.h}px;background:${WBC[i.c]||WBC.y}"><div class="wb-t" dir="auto">${esc(i.txt||'')}</div><div class="wn-f"><button type="button" class="wn-c${i.done?' on':''}" data-chk="${esc(i.id)}" title="${i.done?'إلغاء الإنجاز':'تعليم كمنجز'}" aria-label="منجز">✓</button><small>${esc(nameShort(i.by))}</small></div>${hs(i)}</div>`;
  if(i.t==='text')return`<div class="wbi wt${s}" data-wid="${esc(i.id)}" style="${st}font-size:${i.fs||22}px;color:${esc(i.ink||WINK[0])}"><div class="wb-t" dir="auto">${esc(i.txt||'')}</div>${hs(i)}</div>`;
  const svg=i.t==='dia'?`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M50 2L98 50L50 98L2 50Z" fill="${esc(i.ink)}22" stroke="${esc(i.ink)}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`:i.t==='ell'?`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><ellipse cx="50" cy="50" rx="48" ry="48" fill="${esc(i.ink)}22" stroke="${esc(i.ink)}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`:`<svg viewBox="0 0 100 100" preserveAspectRatio="none"><rect x="1" y="1" width="98" height="98" rx="8" fill="${esc(i.ink)}22" stroke="${esc(i.ink)}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  return`<div class="wbi wsh${s}" data-wid="${esc(i.id)}" style="${st}height:${i.h}px;color:${esc(i.ink)}">${svg}<div class="wb-t" dir="auto">${esc(i.txt||'')}</div>${hs(i)}</div>`};
 w.innerHTML=its.filter(i=>i.t==='frame').map(box).join('')+its.filter(i=>['rect','ell','dia'].includes(i.t)).map(box).join('')+its.filter(i=>i.t==='note'||i.t==='text').map(box).join('')+
  '<svg class="wb-svg" id="wbsvg"><defs>'+WINK.concat(['#5B5346','#1E5BB8']).map((c,k)=>`<marker id="wah${k}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')+'</defs></svg><div class="wb-ov" id="wbov"></div>';
 wbLines();wbApply();wbSelBar();wsideDraw();wbWho();$('#wbempty').hidden=its.length>0;
}
function wbLines(tmp){const svg=$('#wbsvg'),ov=$('#wbov');if(!svg)return;const sel=WB.sel;let g='',o='';const MK=WINK.concat(['#5B5346','#1E5BB8']);
 wbItems().forEach(i=>{if(i.t==='pen'){const d=penD(i.pts);g+=`<path class="wpen${sel===i.id?' sel':''}" d="${d}" stroke="${esc(i.ink)}" stroke-width="${i.sw||3}"/><path class="whit" data-wid="${esc(i.id)}" d="${d}"/>`}
  else if(LINE.includes(i.t)){const e=wbEnds(i);if(!e)return;const d=`M${e.a.x} ${e.a.y} L${e.b.x} ${e.b.y}`,c=i.ink||'#5B5346',mk=sel===i.id?MK.length-1:Math.max(0,MK.indexOf(c));
   g+=`<path class="warr${sel===i.id?' sel':''}" d="${d}" stroke="${esc(c)}"${i.t==='arrow'?` marker-end="url(#wah${mk})"`:''}/><path class="whit" data-wid="${esc(i.id)}" d="${d}"/>`;
   if(sel===i.id)o+=`<span class="wb-end" data-end="1" data-wid="${esc(i.id)}" style="left:${e.a.x}px;top:${e.a.y}px"></span><span class="wb-end" data-end="2" data-wid="${esc(i.id)}" style="left:${e.b.x}px;top:${e.b.y}px"></span>`}});
 if(tmp)g+=tmp;
 const keep=svg.querySelector('defs').outerHTML;svg.innerHTML=keep+g;if(ov)ov.innerHTML=o}
function wbWho(){const el=$('#wbWho');if(!el||!WB.bid)return;const slot=WB.bid.split('.')[1];const here=[me.name,...floorPeers().filter(([,p])=>{const bb=boardAt(p.pos);return bb&&bb.slot===slot}).map(([,p])=>p.name)];el.textContent='🎙 أمام اللوحة: '+here.join('، ')}
setInterval(()=>{if(WB.bid)wbWho()},1500);
/* شريط العنصر المحدد */
function wbSelBar(){const bar=$('#wbsel');if(!bar)return;const i=WB.sel&&wbFind(WB.sel);if(!i){bar.innerHTML='';return}
 let h='';
 if(i.t==='note')h+=Object.keys(WBC).map(k=>`<button type="button" class="wsw${i.c===k?' on':''}" style="background:${WBC[k]}" data-col="${k}" title="${WBCN[k]}" aria-label="${WBCN[k]}"></button>`).join('')+`<span class="wsep"></span><button type="button" class="wtb" data-act="done" title="${i.done?'إلغاء الإنجاز':'تعليم كمنجز (شطب)'}">${i.done?'↩':'✓'}</button>`;
 else h+=WINK.map(c=>`<button type="button" class="wsw${(i.ink||WINK[0])===c?' on':''}" style="background:${c}" data-ink="${c}" aria-label="لون"></button>`).join('');
 if(i.t==='text')h+=`<span class="wsep"></span><button type="button" class="wtb" data-act="fs-" title="تصغير الخط">A−</button><button type="button" class="wtb" data-act="fs+" title="تكبير الخط">A+</button>`;
 h+=`<span class="wsep"></span><button type="button" class="wtb" data-act="dup" title="تكرار (Ctrl+D)">${SVG(ICON.dup)}</button><button type="button" class="wtb del" data-act="del" title="حذف (Delete)">${SVG(ICON.trash)}</button>`;
 bar.innerHTML=h;
 bar.querySelectorAll('[data-col]').forEach(b=>b.onclick=()=>{WB.nc=b.dataset.col;wbUpd(i.id,{c:b.dataset.col})});
 bar.querySelectorAll('[data-ink]').forEach(b=>b.onclick=()=>{WB.ink=b.dataset.ink;wbUpd(i.id,{ink:b.dataset.ink})});
 bar.querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>{const a=b.dataset.act;if(a==='done')wbUpd(i.id,{done:!i.done});else if(a==='del')wbDelete([i.id]);else if(a==='dup')wbDup();else if(a==='fs-')wbUpd(i.id,{fs:Math.max(12,(i.fs||22)-4)});else if(a==='fs+')wbUpd(i.id,{fs:Math.min(96,(i.fs||22)+4)})})}
/* القائمة الجانبية: النوتات قيد العمل والمنجزة */
function wsideDraw(){const el=$('#wside');if(!el)return;const ns=wbItems().filter(i=>i.t==='note'),act=ns.filter(i=>!i.done),fin=ns.filter(i=>i.done),l=WB.stab==='fin'?fin:act;
 el.innerHTML=`<div class="ws-h">نوتات اللوحة</div><div class="ws-tabs"><button data-st="act" class="${WB.stab!=='fin'?'on':''}">قيد العمل <span class="n">${act.length}</span></button><button data-st="fin" class="${WB.stab==='fin'?'on':''}">منجزة <span class="n">${fin.length}</span></button></div>
 <div class="ws-list">${l.length?l.map(i=>`<div class="ws-i${i.done?' xck':''}" style="--nc:${WBC[i.c]||WBC.y}"><button type="button" class="wn-c${i.done?' on':''}" data-chk="${esc(i.id)}" aria-label="منجز">✓</button><div class="ws-b"><button type="button" class="ws-t" data-go="${esc(i.id)}">${esc(i.txt||'(نوت فارغ)')}</button><small>${esc(nameShort(i.by))}${i.at?' · '+esc(fmtT(i.at)):''}</small></div></div>`).join(''):`<div class="ws-empty">${WB.stab==='fin'?'لا نوتات منجزة بعد. علّم النوت بإشارة ✓ عند إنجازه.':'لا نوتات قيد العمل. أضف ستيكي نوت على اللوحة.'}</div>`}</div>`;
 el.querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{WB.stab=b.dataset.st;wsideDraw()});
 el.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>wbFocus(b.dataset.go));
 el.querySelectorAll('[data-chk]').forEach(b=>b.onclick=()=>{const i=wbFind(b.dataset.chk);if(i)wbUpd(i.id,{done:!i.done})})}
function wbFocus(id){const i=wbFind(id),vp=$('#wbvp');if(!i||!vp)return;const r=wbBox(i);WB.v.z=Math.max(WB.v.z,.9);WB.v.x=vp.clientWidth/2-(r.x+r.w/2)*WB.v.z;WB.v.y=vp.clientHeight/2-(r.y+r.h/2)*WB.v.z;WB.sel=id;wbDraw()}
function wbCursors(){const w=$('#wbw');if(!w)return;const now=Date.now();WB.cursors.forEach((c,id)=>{let el=w.querySelector(`.wcur[data-c="${CSS.escape(id)}"]`);if(now-c.t>5000){WB.cursors.delete(id);if(el)el.remove();return}
 if(!el){el=document.createElement('div');el.className='wcur';el.dataset.c=id;el.innerHTML='<i></i><span></span>';w.appendChild(el)}el.querySelector('span').textContent=c.name;el.style.left=c.x+'px';el.style.top=c.y+'px';el.style.transform=`scale(${1/WB.v.z})`})}
setInterval(()=>{if(WB.bid)wbCursors()},1000);
/* العمليات مع التراجع والإعادة */
function applyLocal(op){const b=wbB();if(!b)return;
 if(op.type==='add')(op.items||[op.item]).forEach(it=>{if(!b.items.some(x=>x.id===it.id))b.items.push(JSON.parse(JSON.stringify(it)))});
 else if(op.type==='upd'){const i=b.items.find(x=>x.id===op.id);if(i)Object.assign(i,op.patch)}
 else if(op.type==='many')op.list.forEach(m=>{const i=b.items.find(x=>x.id===m.id);if(i)Object.assign(i,m.patch)});
 else if(op.type==='del'){const ids=new Set(op.ids);b.items.forEach(l=>{if(!LINE.includes(l.t))return;['a','b'].forEach(k=>{if(l[k]&&ids.has(l[k])){const r=b.items.find(x=>x.id===l[k]);if(r){l[k==='a'?'x1':'x2']=Math.round(r.x+r.w/2);l[k==='a'?'y1':'y2']=Math.round(r.y+r.h/2)}l[k]=null}})});b.items=b.items.filter(x=>!ids.has(x.id))}}
function wbSend(op){applyLocal(op);socket.emit('wb:op',{bid:WB.bid,op});wbDraw()}
function wbDo(op,inv){const h=WB.hist[WB.bid]||(WB.hist[WB.bid]=[]);h.push({op,inv});if(h.length>100)h.shift();WB.redo[WB.bid]=[];wbSend(op)}
function wbUndo(redo){const from=(redo?WB.redo:WB.hist)[WB.bid]||[],to=(redo?WB.hist:WB.redo)[WB.bid]||((redo?WB.hist:WB.redo)[WB.bid]=[]);const e=from.pop();if(!e)return;to.push(e);wbSend(redo?e.op:e.inv);if(!redo&&e.after&&e.after.length)wbSend({type:'many',list:e.after})}
const pick=(i,keys)=>{const o={};keys.forEach(k=>o[k]=i[k]===undefined?null:JSON.parse(JSON.stringify(i[k])));return o};
function wbUpd(id,patch){const i=wbFind(id);if(!i)return;wbDo({type:'upd',id,patch},{type:'upd',id,patch:pick(i,Object.keys(patch))})}
function wbMany(list){const inv=list.map(m=>{const i=wbFind(m.id);return{id:m.id,patch:pick(i,Object.keys(m.patch))}});wbDo({type:'many',list},{type:'many',list:inv})}
function wbAddItems(items,selId){wbDo({type:'add',items},{type:'del',ids:items.map(i=>i.id)});if(selId){WB.sel=selId;wbDraw()}}
function wbDelete(ids){const its=ids.map(wbFind).filter(Boolean);if(!its.length)return;const lines=wbItems().filter(l=>LINE.includes(l.t)&&(ids.includes(l.a)||ids.includes(l.b))&&!ids.includes(l.id));
 const restore=JSON.parse(JSON.stringify(its)),linesBefore=lines.map(l=>({id:l.id,patch:pick(l,['a','b','x1','y1','x2','y2'])}));
 const h=WB.hist[WB.bid]||(WB.hist[WB.bid]=[]);h.push({op:{type:'del',ids},inv:{type:'add',items:restore},after:linesBefore});WB.redo[WB.bid]=[];WB.sel=null;wbSend({type:'del',ids})}
function newItem(t,o){return{id:rid(),t,by:me.id,at:Date.now(),...o}}
function wbDup(){const i=WB.sel&&wbFind(WB.sel);if(!i)return;wbPaste([JSON.parse(JSON.stringify(i))])}
function wbPaste(list){if(!list||!list.length)return;const map={};const out=list.map(x=>{const n={...JSON.parse(JSON.stringify(x)),id:rid(),by:me.id,at:Date.now()};map[x.id]=n.id;
 if(BOX.includes(n.t)){n.x+=24;n.y+=24}else if(n.t==='pen')n.pts=n.pts.map(q=>[q[0]+24,q[1]+24]);else{n.x1+=24;n.y1+=24;n.x2+=24;n.y2+=24}return n});
 out.forEach(n=>{if(LINE.includes(n.t)){n.a=map[n.a]||null;n.b=map[n.b]||null}});wbAddItems(out,out[0].id)}
/* التحرير النصي */
function wbEdit(id){const i=wbFind(id);if(!i||!BOX.includes(i.t))return;wbCommitEdit();WB.sel=id;wbDraw();const el=$(`#wbw [data-wid="${CSS.escape(id)}"] .wb-t`);if(!el)return;
 WB.edit={id,before:i.txt||''};el.contentEditable='true';el.focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);
 el.onblur=()=>wbCommitEdit();el.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'||(e.key==='Enter'&&(e.ctrlKey||e.metaKey))){e.preventDefault();el.blur()}}}
function wbCommitEdit(){if(!WB.edit)return;const {id,before}=WB.edit;const el=$(`#wbw [data-wid="${CSS.escape(id)}"] .wb-t`);WB.edit=null;
 const txt=el?el.innerText.replace(/\n+$/,'').slice(0,3000):before;if(el)el.contentEditable='false';
 if(txt!==before){const i=wbFind(id);if(i){wbDo({type:'upd',id,patch:{txt}},{type:'upd',id,patch:{txt:before}})}}else if(WB.pend)wbDraw()}
/* المؤشر واللمس */
function hitBox(e){const el=document.elementFromPoint(e.clientX,e.clientY);const b=el&&el.closest&&el.closest('#wbw .wbi');return b?b.dataset.wid:null}
function wbBind(){const vp=$('#wbvp');
 vp.addEventListener('wheel',e=>{e.preventDefault();const r=vp.getBoundingClientRect();if(e.ctrlKey||e.metaKey)wbZoomAt(Math.exp(-e.deltaY*.01),e.clientX-r.left,e.clientY-r.top);else if(Math.abs(e.deltaY)>=50&&!e.deltaX&&e.deltaMode===0&&Number.isInteger(e.deltaY))wbZoomAt(Math.exp(-e.deltaY*.0015),e.clientX-r.left,e.clientY-r.top);else{WB.v.x-=e.deltaX;WB.v.y-=e.deltaY;wbApply()}},{passive:false});
 vp.addEventListener('dblclick',e=>{const id=hitBox(e);if(id)return wbEdit(id);const p=wbToWorld(e);const n=newItem('note',{x:Math.round(p.x-100),y:Math.round(p.y-65),w:200,h:130,c:WB.nc,txt:''});wbAddItems([n],n.id);setTimeout(()=>wbEdit(n.id),30)});
 vp.addEventListener('click',e=>{const c=e.target.closest('[data-chk]');if(c){const i=wbFind(c.dataset.chk);if(i)wbUpd(i.id,{done:!i.done})}});
 vp.addEventListener('pointerdown',e=>{if(e.target.closest('[data-chk]'))return;if(e.target.closest('[contenteditable=true]'))return;wbCommitEdit();vp.focus({preventScroll:true});
  const p=wbToWorld(e),t=WB.tool;
  if(e.button===1||WB.space){WB.drag={k:'pan',sx:e.clientX,sy:e.clientY,vx:WB.v.x,vy:WB.v.y};vp.classList.add('pan');vp.setPointerCapture(e.pointerId);return}
  if(e.button!==0)return;
  const h=e.target.closest('.wb-h');if(h){const id=h.closest('.wbi').dataset.wid,i=wbFind(id),r=wbBox(i);WB.drag={k:'rs',id,h:h.dataset.h,p0:p,r0:r,orig:pick(i,['x','y','w','h'])};vp.setPointerCapture(e.pointerId);return}
  const end=e.target.closest('.wb-end');if(end){const i=wbFind(end.dataset.wid);WB.drag={k:'end',id:i.id,end:end.dataset.end,orig:pick(i,['a','b','x1','y1','x2','y2'])};vp.setPointerCapture(e.pointerId);return}
  if(['note','frame','rect','ell','dia'].includes(t)){WB.drag={k:'draw',t,p0:p,p1:p};vp.setPointerCapture(e.pointerId);return}
  if(t==='text'){const n=newItem('text',{x:Math.round(p.x),y:Math.round(p.y-16),w:260,h:40,fs:22,ink:WB.ink,txt:''});wbAddItems([n],n.id);wbTool('sel');setTimeout(()=>wbEdit(n.id),30);return}
  if(LINE.includes(t)){const a=hitBox(e);WB.drag={k:'line',t,p0:p,p1:p,a};vp.setPointerCapture(e.pointerId);return}
  if(t==='pen'){WB.drag={k:'pen',pts:[[Math.round(p.x),Math.round(p.y)]]};vp.setPointerCapture(e.pointerId);return}
  // التحديد والتحريك
  const hb=e.target.closest('.whit'),id=hb?hb.dataset.wid:hitBox(e);
  if(id){WB.sel=id;const i=wbFind(id);let ids=[id];
   if(i&&i.t==='frame')wbItems().forEach(x=>{if(x.id===id)return;if(BOX.includes(x.t)){const r=wbBox(x);if(r.x>=i.x&&r.y>=i.y&&r.x+r.w<=i.x+i.w&&r.y+r.h<=i.y+i.h)ids.push(x.id)}else if(x.t==='pen'&&x.pts.every(q=>q[0]>=i.x&&q[0]<=i.x+i.w&&q[1]>=i.y&&q[1]<=i.y+i.h))ids.push(x.id)});
   WB.drag={k:'move',ids,p0:p,orig:ids.map(x=>JSON.parse(JSON.stringify(wbFind(x)))),moved:false};vp.setPointerCapture(e.pointerId);wbSelBar();
   const old=$('#wbw .wbi.sel');if(old)old.classList.remove('sel');const cur2=$(`#wbw [data-wid="${CSS.escape(id)}"]`);if(cur2&&cur2.classList.contains('wbi'))cur2.classList.add('sel');return}
  WB.sel=null;WB.drag={k:'pan',sx:e.clientX,sy:e.clientY,vx:WB.v.x,vy:WB.v.y,clear:true};vp.classList.add('pan');vp.setPointerCapture(e.pointerId)});
 vp.addEventListener('pointermove',e=>{const p=wbToWorld(e),now=Date.now();
  if(now-WB.lc>90){WB.lc=now;socket.emit('wb:cursor',{bid:WB.bid,x:p.x,y:p.y})}
  const d=WB.drag;if(!d)return;
  if(d.k==='pan'){WB.v.x=d.vx+e.clientX-d.sx;WB.v.y=d.vy+e.clientY-d.sy;wbApply();return}
  if(d.k==='draw'){d.p1=p;const x=Math.min(d.p0.x,p.x),y=Math.min(d.p0.y,p.y),w=Math.abs(p.x-d.p0.x),h=Math.abs(p.y-d.p0.y);let g=$('#wbghost');if(!g){g=document.createElement('div');g.id='wbghost';g.className='wb-ghost';$('#wbw').appendChild(g)}Object.assign(g.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});return}
  if(d.k==='line'){d.p1=p;wbLines(`<path class="wtmp" d="M${d.p0.x} ${d.p0.y} L${p.x} ${p.y}"/>`);return}
  if(d.k==='pen'){const l=d.pts[d.pts.length-1];if(Math.hypot(p.x-l[0],p.y-l[1])>2/WB.v.z){d.pts.push([Math.round(p.x),Math.round(p.y)]);wbLines(`<path class="wtmp pen" d="${penD(d.pts)}" style="stroke:${WB.ink}"/>`)}return}
  if(d.k==='rs'){const i=wbFind(d.id);if(!i)return;let {x,y,w,h}=d.r0;const dx=p.x-d.p0.x,dy=p.y-d.p0.y;if(d.h.includes('e'))w=Math.max(40,d.r0.w+dx);if(d.h.includes('s'))h=Math.max(30,d.r0.h+dy);if(d.h.includes('w')){w=Math.max(40,d.r0.w-dx);x=d.r0.x+d.r0.w-w}if(d.h.includes('n')){h=Math.max(30,d.r0.h-dy);y=d.r0.y+d.r0.h-h}
   Object.assign(i,{x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h)});const el=$(`#wbw [data-wid="${CSS.escape(i.id)}"]`);if(el){el.style.left=i.x+'px';el.style.top=i.y+'px';el.style.width=i.w+'px';el.style[i.t==='note'?'minHeight':'height']=i.h+'px'}wbLines();return}
  if(d.k==='end'){const i=wbFind(d.id);if(!i)return;const k=d.end==='1'?'a':'b';const over=hitBox(e);if(over&&over!==i.id)i[k]=over;else{i[k]=null;i[k==='a'?'x1':'x2']=Math.round(p.x);i[k==='a'?'y1':'y2']=Math.round(p.y)}wbLines();return}
  if(d.k==='move'){const dx=Math.round(p.x-d.p0.x),dy=Math.round(p.y-d.p0.y);if(!d.moved&&Math.hypot(dx,dy)<3/WB.v.z)return;d.moved=true;
   d.orig.forEach(o=>{const i=wbFind(o.id);if(!i)return;if(BOX.includes(i.t)){i.x=o.x+dx;i.y=o.y+dy;const el=$(`#wbw [data-wid="${CSS.escape(i.id)}"]`);if(el){el.style.left=i.x+'px';el.style.top=i.y+'px'}}
    else if(i.t==='pen')i.pts=o.pts.map(q=>[q[0]+dx,q[1]+dy]);else{if(!i.a){i.x1=o.x1+dx;i.y1=o.y1+dy}if(!i.b){i.x2=o.x2+dx;i.y2=o.y2+dy}}});wbLines();
   if(now-WB.lm>70){WB.lm=now;socket.emit('wb:move',{bid:WB.bid,list:d.orig.filter(o=>BOX.includes(o.t)).map(o=>{const i=wbFind(o.id);return{id:i.id,x:i.x,y:i.y}})})}}});
 const up=e=>{const d=WB.drag;if(!d)return;WB.drag=null;const v2=$('#wbvp');if(v2)v2.classList.remove('pan');const g=$('#wbghost');if(g)g.remove();
  if(d.k==='pan'){if(d.clear&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<3)wbSelBar();wbDraw();return}
  if(d.k==='draw'){let x=Math.min(d.p0.x,d.p1.x),y=Math.min(d.p0.y,d.p1.y),w=Math.abs(d.p1.x-d.p0.x),h=Math.abs(d.p1.y-d.p0.y);const def={note:[200,130],frame:[420,280],rect:[180,100],ell:[160,110],dia:[150,120]}[d.t];
   if(w<20||h<20){w=def[0];h=def[1];x=d.p0.x-w/2;y=d.p0.y-h/2}
   const n=newItem(d.t,{x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h),txt:d.t==='frame'?'إطار':''});if(d.t==='note')n.c=WB.nc;else n.ink=WB.ink;
   wbAddItems([n],n.id);wbTool('sel');if(d.t!=='frame'||true)setTimeout(()=>wbEdit(n.id),30);return}
  if(d.k==='line'){const b=hitBox(e);if(Math.hypot(d.p1.x-d.p0.x,d.p1.y-d.p0.y)<8&&!(d.a&&b&&b!==d.a)){wbDraw();return}
   const n=newItem(d.t,{a:d.a||null,b:b&&b!==d.a?b:null,x1:Math.round(d.p0.x),y1:Math.round(d.p0.y),x2:Math.round(d.p1.x),y2:Math.round(d.p1.y),ink:d.t==='arrow'&&WB.ink===WINK[0]?'#5B5346':WB.ink});wbAddItems([n],n.id);return}
  if(d.k==='pen'){if(d.pts.length>1){const n=newItem('pen',{pts:d.pts,ink:WB.ink,sw:3});wbAddItems([n])}else wbDraw();return}
  if(d.k==='rs'){const i=wbFind(d.id);if(i){const patch={x:i.x,y:i.y,w:i.w,h:i.h};Object.assign(i,d.orig);wbUpd(i.id,patch)}else wbDraw();return}
  if(d.k==='end'){const i=wbFind(d.id);if(i){const patch=pick(i,['a','b','x1','y1','x2','y2']);Object.assign(i,d.orig);wbUpd(i.id,patch)}else wbDraw();return}
  if(d.k==='move'){if(!d.moved){wbDraw();return}const list=d.orig.map(o=>{const i=wbFind(o.id);if(!i)return null;const keys=BOX.includes(i.t)?['x','y']:i.t==='pen'?['pts']:['x1','y1','x2','y2'];const patch=pick(i,keys);keys.forEach(k=>i[k]=o[k]);return{id:i.id,patch}}).filter(Boolean);wbMany(list);return}
  wbDraw()};
 vp.addEventListener('pointerup',up);vp.addEventListener('pointercancel',up);
}
function wbKey(e){if(typing(e))return;const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;
 if(e.key===' '){WB.space=true;e.preventDefault();return}
 if(mod&&k==='z'){e.preventDefault();wbUndo(e.shiftKey);return}
 if(mod&&k==='y'){e.preventDefault();wbUndo(true);return}
 if(mod&&k==='c'){const i=WB.sel&&wbFind(WB.sel);if(i){WB.clip=[JSON.parse(JSON.stringify(i))];toast('نُسخ العنصر')}e.preventDefault();return}
 if(mod&&k==='x'){const i=WB.sel&&wbFind(WB.sel);if(i){WB.clip=[JSON.parse(JSON.stringify(i))];wbDelete([i.id])}e.preventDefault();return}
 if(mod&&k==='v'){e.preventDefault();wbPaste(WB.clip);return}
 if(mod&&k==='d'){e.preventDefault();wbDup();return}
 if(mod)return;
 if((k==='delete'||k==='backspace')&&WB.sel){e.preventDefault();wbDelete([WB.sel]);return}
 if(k==='escape'){if(WB.tool!=='sel')wbTool('sel');else if(WB.sel){WB.sel=null;wbDraw()}else{dismissed=curKey;closeBoard()}return}
 if(k==='enter'&&WB.sel){e.preventDefault();wbEdit(WB.sel);return}
 if(ARROWS.includes(k)){e.preventDefault();const i=WB.sel&&wbFind(WB.sel);if(!i||!BOX.includes(i.t))return;const s=e.shiftKey?1:10,dx=k==='arrowleft'?-s:k==='arrowright'?s:0,dy=k==='arrowup'?-s:k==='arrowdown'?s:0;wbUpd(i.id,{x:i.x+dx,y:i.y+dy});return}
 const map={v:'sel',n:'note',t:'text',f:'frame',r:'rect',o:'ell',d:'dia',a:'arrow',l:'line',p:'pen'};if(map[k]){wbTool(map[k]);e.preventDefault()}}
addEventListener('keyup',e=>{if(e.key===' ')WB.space=false});

/* ================= الصوت ومشاركة الشاشة =================
   1) اتصال مباشر بين المتصفحين (WebRTC) لأفضل جودة.
   2) إذا لم يكتمل الاتصال المباشر خلال ثوانٍ (جدار ناري، شبكة جوال...) يُنقل الصوت تلقائياً عبر الخادم (Opus عبر WebSocket). */
const V={channel:null,want:null,local:null,muted:false,screen:null,pcs:new Map(),speaking:new Set(),levels:new Map(),actx:null,pairCall:null,pairName:'',optOut:null,changeAt:0,screens:new Set(),lastCheck:0};
const RL={enc:null,reader:null,buf:[],sr:48000,ch:1,dec:new Map()};
const chName=c=>!c?'':c.startsWith('meeting:')?'غرفة الاجتماعات':c.startsWith('board:')?(c.endsWith('.general')?'اللوحة العامة':'لوحة '+boardTitle(c.split('.')[1])):'مكالمة مع '+V.pairName;
function actx(){V.actx=V.actx||new (window.AudioContext||window.webkitAudioContext)();if(V.actx.state==='suspended')V.actx.resume().catch(()=>{});return V.actx}
function desiredChannel(){if(!joined||!me.name||!$('#onb').hidden||switching)return null;const z=zoneAt(me);let c=null;
 if(z==='meeting')c=meetCh();else if(z==='planning'){const b=boardAt(me);if(b)c='board:'+me.floor+'.'+b.slot}
 if(c){if(V.optOut===c)return V.pairCall;V.optOut=null;return c}V.optOut=null;return V.pairCall}
let vbarDirty=false,joining=false;
function voiceTick(){const want=desiredChannel();
 if(want!==V.want){V.want=want;V.changeAt=Date.now()+350}
 if(V.want!==V.channel&&Date.now()>V.changeAt){if(V.want)voiceJoin(V.want);else voiceLeave()}
 const now=Date.now();
 if(V.channel&&now-V.lastCheck>500){V.lastCheck=now;relayCheck()}
 V.levels.forEach((a,id)=>{a.an.getByteTimeDomainData(a.buf);let s=0;for(let i=0;i<a.buf.length;i+=4){const v=(a.buf[i]-128)/128;s+=v*v}a.lvl=a.lvl*.8+Math.sqrt(s/(a.buf.length/4))*.2});
 const lv=id=>{if(id!=='me'){const d=RL.dec.get(id);if(d&&now-d.last<800)return d.lvl}const a=V.levels.get(id);return a?a.lvl:0};
 ['me',...V.pcs.keys()].forEach(id=>{const on=lv(id)>.025&&!(id==='me'&&V.muted);if(on!==V.speaking.has(id)){on?V.speaking.add(id):V.speaking.delete(id);vbarDirty=true}});
 if(vbarDirty)renderVbar()}
async function voiceJoin(ch){if(joining)return;joining=true;
 if(V.channel)voiceLeave(true);
 try{if(!V.local)V.local=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1,sampleRate:48000}});
  V.local.getAudioTracks().forEach(t=>t.enabled=!V.muted);if(!V.levels.has('me'))watchLevel('me',V.local)}
 catch(e){V.local=null;toast('لم يُسمح باستخدام الميكروفون. ستسمع الآخرين فقط؛ اسمح بالميكروفون من أيقونة القفل بجانب الرابط ثم أعد الدخول.')}
 joining=false;if(V.want!==ch)return;actx();
 V.channel=ch;socket.emit('voice:join',{channel:ch});vbarDirty=true;renderVbar();
 if(ch.startsWith('pair:'))toast('🎙 بدأت '+chName(ch))}
function voiceLeave(keepMic){if(V.channel)socket.emit('voice:leave');
 if(V.screen)stopScreen(true);relayStop();
 [...V.pcs.keys()].forEach(dropPeer);V.channel=null;V.screens.clear();hideScreen();
 if(!keepMic&&V.local){V.local.getTracks().forEach(t=>t.stop());V.local=null;V.levels.delete('me');V.speaking.delete('me')}
 vbarDirty=true;renderVbar()}
function watchLevel(id,stream){try{const ac=actx();const src=ac.createMediaStreamSource(stream),an=ac.createAnalyser();an.fftSize=512;src.connect(an);V.levels.set(id,{an,buf:new Uint8Array(an.fftSize),lvl:0,src})}catch(e){}}
function tune(pc){pc.getSenders().forEach(s=>{if(!s.track)return;const p=s.getParameters();if(!p.encodings||!p.encodings.length)p.encodings=[{}];
 if(s.track.kind==='audio')p.encodings[0].maxBitrate=64000;else{p.encodings[0].maxBitrate=2500000;p.degradationPreference='maintain-resolution'}s.setParameters(p).catch(()=>{})})}
function makePC(id){let p=V.pcs.get(id);if(p)return p;
 const pc=new RTCPeerConnection({iceServers:ICE});
 p={pc,id,polite:socket.id>id,making:false,ignore:false,audio:null,video:null,screenSender:null,born:Date.now(),relay:voiceMode==='relay',ok:false};V.pcs.set(id,p);
 if(V.local)V.local.getAudioTracks().forEach(t=>pc.addTrack(t,V.local));else pc.addTransceiver('audio',{direction:'recvonly'});
 if(V.screen)V.screen.getVideoTracks().forEach(t=>p.screenSender=pc.addTrack(t,V.screen));
 pc.onnegotiationneeded=async()=>{try{p.making=true;await pc.setLocalDescription();socket.emit('voice:signal',{to:id,data:{desc:pc.localDescription}})}catch(e){console.warn(e)}finally{p.making=false}};
 pc.onicecandidate=({candidate})=>{if(candidate)socket.emit('voice:signal',{to:id,data:{cand:candidate}})};
 pc.ontrack=({track,streams})=>{const st=streams[0]||new MediaStream([track]);
  if(track.kind==='audio'){if(p.audio)p.audio.remove();const a=document.createElement('audio');a.autoplay=true;a.playsInline=true;a.srcObject=st;$('#audios').appendChild(a);p.audio=a;a.play().catch(()=>{$('#unlock').hidden=false});watchLevel(id,st)}
  else{p.video=st;track.onended=()=>{if(p.video===st){p.video=null;refreshScreen()}};refreshScreen()}};
 pc.onconnectionstatechange=()=>{if(pc.connectionState==='connected'){p.ok=true;tune(pc)}if(pc.connectionState==='failed'){try{pc.restartIce()}catch(e){}}vbarDirty=true};
 return p}
function dropPeer(id){const p=V.pcs.get(id);if(!p)return;try{p.pc.close()}catch(e){}if(p.audio)p.audio.remove();V.pcs.delete(id);V.levels.delete(id);V.speaking.delete(id);V.screens.delete(id);const d=RL.dec.get(id);if(d){try{d.dec.close()}catch(e){}RL.dec.delete(id)}refreshScreen();vbarDirty=true}
socket.on('voice:peers',({channel,peers:list,screens})=>{if(channel!==V.channel)return;(screens||[]).forEach(id=>V.screens.add(id));list.forEach(makePC);vbarDirty=true});
socket.on('voice:joined',()=>{vbarDirty=true});
socket.on('voice:left',({id})=>dropPeer(id));
socket.on('voice:screen',({id,on,name})=>{if(on){V.screens.add(id);toast('🖥 '+name+' يشارك شاشته')}else{V.screens.delete(id);const p=V.pcs.get(id);if(p)p.video=null}refreshScreen()});
socket.on('voice:signal',async({from,data})=>{if(!V.channel)return;const p=makePC(from),pc=p.pc;
 try{if(data.desc){const offer=data.desc.type==='offer';const collision=offer&&(p.making||pc.signalingState!=='stable');p.ignore=!p.polite&&collision;if(p.ignore)return;
   await pc.setRemoteDescription(data.desc);if(offer){await pc.setLocalDescription();socket.emit('voice:signal',{to:from,data:{desc:pc.localDescription}})}}
  else if(data.cand){try{await pc.addIceCandidate(data.cand)}catch(e){if(!p.ignore)console.warn(e)}}}catch(e){console.warn(e)}});
/* --- النقل الاحتياطي عبر الخادم --- */
const relayTargets=()=>[...V.pcs.values()].filter(p=>p.relay).map(p=>p.id);
function relayCheck(){const now=Date.now();
 V.pcs.forEach(p=>{const st=p.pc.connectionState;if(st==='connected'){p.bad=0;return}p.bad=p.bad||now;if(!p.relay&&now-p.bad>(p.ok?3000:5000)){p.relay=true;vbarDirty=true}
  if(p.audio)p.audio.muted=!!(RL.dec.get(p.id)&&now-RL.dec.get(p.id).last<1500)});
 V.pcs.forEach(p=>{if(p.audio){const d=RL.dec.get(p.id);p.audio.muted=!!(d&&now-d.last<1500)}});
 if(relayTargets().length&&!RL.enc&&V.local)relayStart();else if(!relayTargets().length&&RL.enc)relayStop()}
function relayStart(){if(RL.enc||!V.local)return;if(!('AudioEncoder' in window)||!('MediaStreamTrackProcessor' in window)){if(!RL.warned){RL.warned=true;toast('متصفحك لا يدعم النقل الاحتياطي للصوت. استخدم Chrome أو Edge بآخر إصدار.')}return}
 const track=V.local.getAudioTracks()[0];if(!track)return;
 let reader;const cl=track.clone();RL.clone=cl;try{reader=new MediaStreamTrackProcessor({track:cl}).readable.getReader()}catch(e){cl.stop();return}RL.reader=reader;let conf=false;
 const enc=new AudioEncoder({output:c=>{const b=new Uint8Array(c.byteLength);c.copyTo(b);RL.buf.push(b.buffer);if(RL.buf.length>=3){const to=relayTargets();if(to.length&&V.channel)socket.emit('voice:pkt',{to,f:RL.buf,sr:RL.sr,ch:RL.ch});RL.buf=[]}},error:e=>{console.warn('enc',e)}});RL.enc=enc;
 (async()=>{try{while(RL.reader===reader){const {value,done}=await reader.read();if(done||!value)break;
   if(!conf){RL.sr=value.sampleRate;RL.ch=Math.min(2,value.numberOfChannels);try{enc.configure({codec:'opus',sampleRate:RL.sr,numberOfChannels:RL.ch,bitrate:32000})}catch(e){console.warn(e);value.close();break}conf=true}
   if(!V.muted&&enc.state==='configured')try{enc.encode(value)}catch(e){}value.close()}}catch(e){console.warn(e)}})()}
function relayStop(){if(RL.reader){try{RL.reader.cancel()}catch(e){}RL.reader=null}if(RL.clone){RL.clone.stop();RL.clone=null}if(RL.enc){try{RL.enc.close()}catch(e){}RL.enc=null}RL.buf=[]}
socket.on('voice:pkt',({from,f,sr,ch})=>{if(!V.channel||!('AudioDecoder' in window))return;const p=V.pcs.get(from)||makePC(from);if(!p.relay){p.relay=true;vbarDirty=true}
 let d=RL.dec.get(from);
 if(!d||d.sr!==sr||d.ch!==ch){if(d)try{d.dec.close()}catch(e){}const ac=actx(),g=ac.createGain();g.connect(ac.destination);d={sr,ch,ts:0,next:0,g,lvl:0,last:0};
  d.dec=new AudioDecoder({output:a=>relayPlay(d,a),error:e=>console.warn('dec',e)});try{d.dec.configure({codec:'opus',sampleRate:sr,numberOfChannels:ch})}catch(e){return}RL.dec.set(from,d)}
 d.last=Date.now();(f||[]).forEach(b=>{try{d.dec.decode(new EncodedAudioChunk({type:'key',timestamp:d.ts,data:b}));d.ts+=20000}catch(e){}})});
function relayPlay(d,a){const ac=actx(),n=a.numberOfFrames;const tmp=new Float32Array(n);try{a.copyTo(tmp,{planeIndex:0,format:'f32-planar'})}catch(e){a.close();return}const sr=a.sampleRate;a.close();
 let s=0;for(let i=0;i<n;i+=8)s+=tmp[i]*tmp[i];d.lvl=d.lvl*.6+Math.sqrt(s/(n/8))*.4;
 const buf=ac.createBuffer(1,n,sr);buf.copyToChannel(tmp,0);const src=ac.createBufferSource();src.buffer=buf;src.connect(d.g);
 const now=ac.currentTime;if(d.next<now+.02||d.next>now+.6)d.next=now+.12;src.start(d.next);d.next+=buf.duration}
$('#unlock').onclick=()=>{V.pcs.forEach(p=>p.audio&&p.audio.play().catch(()=>{}));actx();$('#unlock').hidden=true};
function toggleMute(){V.muted=!V.muted;if(V.local)V.local.getAudioTracks().forEach(t=>t.enabled=!V.muted);vbarDirty=true;renderVbar()}
async function startScreen(){if(!navigator.mediaDevices.getDisplayMedia)return toast('متصفحك لا يدعم مشاركة الشاشة. جرّب Chrome أو Edge.');
 try{V.screen=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:30},width:{ideal:1920},height:{ideal:1080}},audio:false})}catch(e){return}
 const tr=V.screen.getVideoTracks()[0];tr.contentHint='detail';tr.onended=()=>stopScreen();
 V.pcs.forEach(p=>{p.screenSender=p.pc.addTrack(tr,V.screen)});socket.emit('voice:screen',{on:true});refreshScreen();vbarDirty=true;renderVbar();
 if([...V.pcs.values()].some(p=>p.relay&&p.pc.connectionState!=='connected'))toast('تنبيه: بعض الحاضرين على شبكة تمنع الاتصال المباشر، فقد لا تصلهم الشاشة دون خادم TURN.')}
function stopScreen(silent){if(!V.screen)return;V.screen.getTracks().forEach(t=>t.stop());V.pcs.forEach(p=>{if(p.screenSender){try{p.pc.removeTrack(p.screenSender)}catch(e){}p.screenSender=null}});V.screen=null;if(!silent)socket.emit('voice:screen',{on:false});refreshScreen();vbarDirty=true;renderVbar()}
let scrHidden=false,scrShown=null;
function refreshScreen(){const vid=$('#scrVid');let src=null,title='';
 for(const [id,p] of V.pcs)if(p.video&&V.screens.has(id)){src=p.video;const pr=peers.get(id);title='شاشة '+(pr?pr.name:'زميل');break}
 if(!src&&V.screen){src=V.screen;title='أنت تشارك شاشتك'}
 if(!src){hideScreen();return}
 if(scrShown!==src){scrShown=src;vid.srcObject=src;vid.play().catch(()=>{});scrHidden=false}
 $('#scrTitle').textContent=title;$('#screen').hidden=scrHidden}
function hideScreen(){$('#screen').hidden=true;$('#scrVid').srcObject=null;scrShown=null;$('#screen').classList.remove('full')}
$('#scrHide').onclick=()=>{scrHidden=true;$('#screen').hidden=true;vbarDirty=true};
$('#scrFull').onclick=()=>{const s=$('#screen');s.classList.toggle('full');$('#scrFull').textContent=s.classList.contains('full')?'تصغير':'تكبير'};
function renderVbar(){vbarDirty=false;const bar=$('#vbar');$('#help').hidden=!!V.channel;if(!V.channel){bar.hidden=true;return}bar.hidden=false;const now=Date.now();
 const ppl=[{n:'أنت',sp:V.speaking.has('me'),bad:V.muted||!V.local}];
 V.pcs.forEach((p,id)=>{const pr=peers.get(id);const st=p.pc.connectionState,d=RL.dec.get(id),viaR=!!(d&&now-d.last<2000);const ok=st==='connected'||viaR;ppl.push({n:(pr?pr.name:'زميل')+(ok?'':' …')+(viaR&&st!=='connected'?' ↻':''),sp:V.speaking.has(id),bad:!ok})});
 const anyScreen=[...V.pcs.entries()].some(([id,p])=>p.video&&V.screens.has(id));
 bar.innerHTML=`<span class="ch">🎙 ${esc(chName(V.channel))}</span><span class="ppl">${ppl.map(x=>`<span class="pp ${x.sp?'sp':''} ${x.bad?'bad':''}">${esc(x.n)}${x.n==='أنت'&&V.muted?' (مكتوم)':''}</span>`).join('')}</span>
 <button id="vMute" class="${V.muted?'on':''}">${V.muted?'🔇 تشغيل الميكروفون':'🎙 كتم'}</button>
 <button id="vScr" class="${V.screen?'live':''}">${V.screen?'⏹ إيقاف المشاركة':'🖥 شارك شاشتي'}</button>
 ${anyScreen&&$('#screen').hidden?'<button id="vShow">👁 أظهر الشاشة</button>':''}
 <button id="vLeave">${V.channel.startsWith('pair:')?'📴 إنهاء المكالمة':'⏏ مغادرة الصوت'}</button>`;
 $('#vMute').onclick=toggleMute;$('#vScr').onclick=()=>V.screen?stopScreen():startScreen();
 const sh=$('#vShow');if(sh)sh.onclick=()=>{scrHidden=false;refreshScreen();vbarDirty=true};
 $('#vLeave').onclick=()=>{if(V.channel.startsWith('pair:'))V.pairCall=null;else V.optOut=V.channel;V.want=null;voiceLeave()};
}
setInterval(()=>{if(V.channel)vbarDirty=true},1500);

/* ================= الملف الشخصي والحالة ================= */
function saveProfile(){posDirty=true;socket.emit('profile:save',{name:me.name,role:me.role,look:me.look,desk:me.desk})}
function setStatus(s){me.status=s;LS.set('office.status',s);document.querySelectorAll('#status button').forEach(b=>b.classList.toggle('on',b.dataset.v===s));posDirty=true;sendPos(true)}
document.querySelectorAll('#status button').forEach(b=>b.onclick=()=>{setStatus(b.dataset.v);toast(b.dataset.v==='free'?'حالتك الآن: متاح':b.dataset.v==='busy'?'حالتك الآن: مشغول':'وضع التركيز مفعّل: من يزورك سيطرق الباب أولاً')});
const pv=$('#prev'),pctx=pv.getContext('2d');
function drawPrev(){const r=pv.getBoundingClientRect(),d=window.devicePixelRatio||1;pv.width=r.width*d;pv.height=r.height*d;pctx.setTransform(d*2.4,0,0,d*2.4,0,0);pctx.clearRect(0,0,999,999);if(me.look.gender)drawAvatar(pctx,r.width/4.8,r.height/4.8+12,me.look,{})}
function swatches(){const L=me.look;const mk=(el,list,key)=>{el.innerHTML=list.map(c=>`<button type="button" style="background:${c}" class="${L[key]===c?'on':''}" data-v="${c}" aria-label="لون"></button>`).join('');el.querySelectorAll('button').forEach(b=>b.onclick=()=>{L[key]=b.dataset.v;swatches()})};
 mk($('#swShirt'),LOOKS.shirt,'shirt');mk($('#swHair'),LOOKS.hair,'hair');mk($('#swSkin'),LOOKS.skin,'skin');
 $('#swGender').querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b.dataset.v===L.gender);b.onclick=()=>{L.gender=b.dataset.v;if(!LOOKS.style[L.gender].some(s=>s[0]===L.style))L.style=LOOKS.style[L.gender][0][0];$('#obErr').textContent='';swatches()}});
 const st=$('#swStyle');st.innerHTML=L.gender?LOOKS.style[L.gender].map(([v,l])=>`<button type="button" class="${L.style===v?'on':''}" data-v="${v}">${l}</button>`).join(''):'<span class="empty">اختر الجنس أولاً</span>';
 st.querySelectorAll('button').forEach(b=>b.onclick=()=>{L.style=b.dataset.v;swatches()});drawPrev()}
function showOnb(first){$('#obName').value=me.name;$('#obRole').value=me.role;$('#onb').hidden=false;$('#acct').hidden=!!first;$('#acUser').textContent=me.username||'';swatches();closeAll();curKey=null}
function welcome(){toast('أهلاً '+me.name+'! المكاتب الفارغة محاطة بإطار بنفسجي، امشِ إلى أحدها وتوقف عنده لتحجزه.');guide={...places().reception,until:Date.now()+8000}}
$('#obForm').onsubmit=e=>{e.preventDefault();
 if(!me.look.gender){$('#obErr').textContent='اختر الجنس: ذكر أو أنثى';return}
 const first=!me.name;me.name=$('#obName').value.trim().slice(0,30);me.role=$('#obRole').value.trim().slice(0,40);if(!me.name)return;
 if(!joined){$('#obErr').textContent='جارٍ الاتصال بالخادم…';return}
 $('#onb').hidden=true;saveProfile();sendPos(true);if(first)welcome()};
$('#onb').addEventListener('click',e=>{if(e.target===$('#onb')&&me.name)$('#onb').hidden=true});
$('#meBtn').onclick=()=>{if(joined)showOnb(false)};
$('#logout').onclick=()=>{socket.emit('auth:logout',{token:LS.get('office.token')});LS.del('office.token');voiceLeave();closeAll();Object.assign(me,{id:null,name:'',role:'',desk:null});joined=false;peers.clear();socket.disconnect().connect()};
$('#pwBtn').onclick=()=>{socket.emit('auth:password',{old:$('#pwOld').value,password:$('#pwNew').value},r=>{if(!r)return;if(r.error){$('#obErr').textContent=r.error;return}$('#pwOld').value='';$('#pwNew').value='';$('#obErr').textContent='';toast('تغيّرت كلمة المرور')})};

/* ================= الإقلاع ================= */
const st0=LS.get('office.status');if(['free','busy','focus'].includes(st0)){me.status=st0;document.querySelectorAll('#status button').forEach(b=>b.classList.toggle('on',b.dataset.v===st0))}
if(location.hash==='#test')window.__office={me,tp:(x,y)=>{me.x=x;me.y=y;me.vx=me.vy=0;path=null;posDirty=true},WB,boards:()=>boards,V,RL};
fillFloorSelect();buildStatic();resize();mapCtl();requestAnimationFrame(frame);
})();
