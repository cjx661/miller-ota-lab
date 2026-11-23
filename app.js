const $=id=>document.getElementById(id),copy=x=>structuredClone(x),eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const data=await fetch('data.json').then(r=>r.json());
let params=copy(data.default),current=data.records[0],baseline=null,selected='M1',live=false,revision=0,timer,angle=.12,tilt=.20,zoom=1,drag=null,hits=[];
const records=[...data.records], inst=Object.fromEntries(data.instances.map(x=>[x.name,x]));
const colors={M1:'#68e2c2',M2:'#68e2c2',M3:'#83b1ff',M4:'#83b1ff',M5:'#83b1ff',M6:'#ba9ef2',M7:'#ba9ef2',CCOMP:'#eebc79',RZ:'#eebc79',CL0:'#c7d7e9'};
const positions={M1:[-3,0,0],M2:[-.5,0,0],M3:[-3,1.9,0],M4:[-.5,1.9,0],M5:[-1.8,-2,0],M6:[3,0,0],M7:[3,1.9,0],CCOMP:[.7,.3,1.4],RZ:[2,.3,1.4],CL0:[4.8,-.7,0]};
const nodes={VDD:[0,3,0],VSS:[0,-3,0],N1:[-3,1,0],VOUT1:[-.5,1,0],NTAIL:[-1.8,-1,0],VINP:[-4.5,0,0],VINN:[-1.2,-.6,1],IBIAS:[-3.5,-2,0],IBIASP:[4.5,1.9,0],NCOMP:[1.35,.3,1.4],VOUT:[4.8,1,0]};
inst.CL0={name:'CL0',cell:'capacitor',terms:{PLUS:'VOUT',MINUS:'VSS'}};
const groups={M1:'输入差分级 · NMOS',M2:'输入差分级 · NMOS',M3:'电流镜 · PMOS',M4:'电流镜 · PMOS',M5:'尾电流支路 · NMOS',M6:'第二级 · NMOS',M7:'第二级电流源 · PMOS',CCOMP:'Miller 补偿电容 · Cc',RZ:'补偿调零电阻 · Rz',CL0:'输出负载 · 固定 100 fF'};
function status(s){$('status').textContent=s;}
function select(n){selected=n;panel();drawCircuit();}
for(const n of [...Object.keys(positions),...Object.keys(nodes)]){const b=document.createElement('button');b.textContent=n;b.onclick=()=>select(n);$('devicebuttons').append(b);}
function inputControl(label,value,min,max,step,change,allowed=null){
 const wrap=document.createElement('div');wrap.className='control';
 const lab=document.createElement('label');lab.textContent=label;const num=document.createElement('input');num.type='number';num.value=value;num.min=min;num.max=max;num.step=step;num.setAttribute('aria-label',label);lab.append(num);
 const range=document.createElement('input');Object.assign(range,{type:'range',min:allowed?0:min,max:allowed?allowed.length-1:max,step:allowed?1:step,value:allowed?allowed.findIndex(x=>Math.abs(x-value)<1e-8):value});range.setAttribute('aria-label',label+'滑块');
 function set(v){num.setCustomValidity('');if(!Number.isFinite(v)||v<min||v>max||(allowed?!allowed.some(a=>Math.abs(v-a)<1e-8):Math.abs((v-min)/step-Math.round((v-min)/step))>1e-5)){num.setCustomValidity(allowed?'L < 0.1 µm 仅支持 0.03、0.035、0.04、0.05、0.06、0.08、0.09；其余按 0.005 µm。':`请输入 ${min}–${max}，步长 ${step}`);num.reportValidity();return;}v=+v.toFixed(8);num.value=v;range.value=allowed?allowed.findIndex(x=>Math.abs(x-v)<1e-8):v;change(v);}
 range.oninput=()=>set(allowed?allowed[+range.value]:+range.value);range.onchange=()=>submitSoon(0);num.onchange=()=>set(num.valueAsNumber);num.oninput=()=>{num.setCustomValidity('');if(num.validity.valid)set(num.valueAsNumber);};
 const bounds=document.createElement('div');bounds.className='bounds';bounds.innerHTML=`<span>${min}</span><span>${allowed?'PDK 离散长度 / Δ 0.005':'Δ '+step}</span><span>${max}</span>`;wrap.append(lab,range,bounds);return wrap;
}
function panel(){
 $('selected').textContent=selected==='CCOMP'?'CCOMP / Cc':selected;const el=$('panel');el.replaceChildren();const p=document.createElement('p');p.textContent=groups[selected]||'直流节点';el.append(p);
 if(/^M[1-7]$/.test(selected)){
   const n=selected;for(const k of ['W','L']){const rule=data.rules[n][k];el.append(inputControl(k+' / µm',params[n][k],rule.min,rule.max,rule.step,v=>{params[n][k]=v;if($('linked').checked&&['M1','M2'].includes(n))params[n==='M1'?'M2':'M1'][k]=v;changed();},rule.values));}
   const desc=document.createElement('p');desc.textContent=`W = 总沟道宽度；单指 Wfg = W / ${data.nf[+n.slice(1)-1]}。nf=${data.nf[+n.slice(1)-1]}、multi=1 固定；运行前经已安装 PDK 的 CDF 回调再次验证。`;el.append(desc);
 }else if(selected==='CCOMP'||selected==='RZ'){
   const k=selected==='CCOMP'?'Cc':'Rz';el.append(inputControl(k+(k==='Cc'?' / fF':' / kΩ'),params[k],k==='Cc'?5:0,k==='Cc'?5000:100,k==='Cc'?5:.1,v=>{params[k]=v;changed();}));
 }
 if(inst[selected]){const p=document.createElement('p');p.textContent=Object.entries(inst[selected].terms).map(([t,n])=>`${t} → ${n}`).join(' · ');el.append(p);}
 operating();
}
function operating(){
 const o=$('op');const match=current&&eq(current.params,params);o.replaceChildren();
 const title=document.createElement('div');title.textContent=match?'当前结果 · 工作点':'上一组已完成结果 · 工作点（与编辑参数不同）';o.append(title);
 if(current?.op[selected]){const v=current.op[selected];const region={0:'截止',1:'线性区',2:'饱和区',3:'亚阈值',4:'击穿'};for(const [k,label,scale,unit] of [['ids','漏极电流 Id',1e6,'µA'],['gm','跨导 gm',1e3,'mS'],['region','工作区',1,'']]){const p=document.createElement('div');p.textContent=`${label}：${v[k]==null?'未保存':k==='region'?(region[v[k]]??'代码 '+v[k]):(v[k]*scale).toFixed(4)+' '+unit}`;o.append(p);}}
 else if(selected==='CCOMP'||selected==='RZ'){const i=replay?sampleAt()?.i?.[selected]??null:null;const d=document.createElement('div');d.textContent=(replay?'瞬态支路电流：'+(i==null?'暂无数据':currentLabel(i)+' · '+(i>=0?'PLUS → MINUS':'MINUS → PLUS')):'直流工作点：无可见支路电流，动画静止');o.append(d);if(selected==='CCOMP'&&replay){const note=document.createElement('div');note.textContent=current?.currentSource?.CCOMP||'Cc 电流：暂无数据';o.append(note);}}
 else if(selected in (current?.nodes||{})||selected==='VSS'){const p=document.createElement('div');const v=nodeVoltage(selected);p.textContent=(replay?'V(' +timeNs.toFixed(2)+' ns)':'VDC')+' = '+(v==null?'暂无数据':v.toFixed(6)+' V');o.append(p);}else {o.append(document.createTextNode('当前数据未保存该器件的工作点。'));}
 if(/^M[1-7]$/.test(selected)){const d=document.createElement('div');const i=branchCurrent(selected);d.textContent=(replay?'瞬态':'直流')+'常规电流：'+(i==null?'暂无数据':currentLabel(i)+' · '+(i>=0?'D → S':'S → D'));o.append(d);const b=document.createElement('div');b.textContent='体端 B → '+inst[selected].terms.B;o.append(b);}
 if(branchSelection){const {n,term,node}=branchSelection;const i=n==='CCOMP'||n==='RZ'?sampleAt()?.i?.[n]??null:branchCurrent(n);const d=document.createElement('div');d.style.color='#eebc79';d.textContent=`选中 ${n}.${term} — ${node}：${i==null?'暂无数据':currentLabel(i)+' · '+(n.startsWith('M')?(i>=0?'D → S':'S → D'):(i>=0?'PLUS → MINUS':'MINUS → PLUS'))}`;o.append(d);}
}
function changed(){revision++;drawCircuit();operating();status('参数已更新 · 等待提交；保留上一组完成曲线');submitSoon(500);}
function submitSoon(ms){clearTimeout(timer);const rev=revision;timer=setTimeout(()=>submit(rev),ms);}
async function submit(rev){
 const p=copy(params);if(rev!==revision)return;
 const cached=records.find(r=>eq(r.params,p));
 if(!live){if(cached){current=cached;render();status('已载入匹配参数的预计算结果');}else status('待仿真：离线数据未覆盖当前组合；下方保留上一组完成结果。');return;}
 status('正在计算 · 提交整组参数，保留上一组完成曲线');
 try{
   const resp=await fetch('/api/simulate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({params:p})});const j=await resp.json();if(!resp.ok)throw Error(j.error||`HTTP ${resp.status}`);
   for(;;){await new Promise(r=>setTimeout(r,700));if(rev!==revision)return;const res=await fetch('/api/jobs/'+j.job);if(!res.ok)throw Error('无法读取仿真任务');const task=await res.json();
    if(task.status==='failed')throw Error(task.error);if(task.status==='superseded')throw Error('该请求已被更新参数取代，请重试当前参数');if(task.status==='complete'){
      if(rev!==revision||!eq(p,params))return;if(!eq(task.result.params,p))throw Error('结果参数不匹配，已拒绝更新');current=task.result;records.push(current);render();status('完成 · Spectre 仿真结果已更新');return;}
    status(task.status==='queued'?'正在计算 · '+(task.phase||'等待当前仿真结束'):'正在计算 · '+(task.phase||'Spectre 运行中')+'，保留上一组完成曲线');
   }
 }catch(e){if(rev===revision)status('仿真未更新：'+e.message);}
}
$('linked').onchange=()=>{if($('linked').checked){params.M2=copy(params.M1);changed();panel();}};
$('restore').onclick=()=>{params=copy(data.default);changed();panel();submitSoon(0);};$('retry').onclick=()=>{revision++;submitSoon(0);};
$('lock').onclick=()=>{if(current){baseline=copy(current);$('clearbase').hidden=false;render();}};$('clearbase').onclick=()=>{baseline=null;$('clearbase').hidden=true;render();};
$('reset').onclick=()=>{angle=.12;tilt=.20;zoom=1;drawCircuit();};$('zoomin').onclick=()=>{zoom=Math.min(1.8,zoom*1.12);drawCircuit();};$('zoomout').onclick=()=>{zoom=Math.max(.55,zoom/1.12);drawCircuit();};
function canvasContext(canvas){const box=canvas.getBoundingClientRect(),dpr=devicePixelRatio||1;canvas.width=box.width*dpr;canvas.height=box.height*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);return [ctx,box.width,box.height];}
let replay=false,playing=false,slow=false,timeNs=0,flowTick=0,branchSelection=null;
function sampleAt(){const a=current?.samples||[];if(!replay||!a.length)return null;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi)>>1;if(a[m].t<timeNs)lo=m+1;else hi=m;}return a[Math.max(0,lo-1)]&&Math.abs(a[Math.max(0,lo-1)].t-timeNs)<Math.abs(a[lo].t-timeNs)?a[Math.max(0,lo-1)]:a[lo];}
function branchCurrent(n){if(replay)return sampleAt()?.i?.[n]??null;return current?.op?.[n]?.ids??null;}
function nodeVoltage(n){if(n==='VSS')return 0;if(replay)return sampleAt()?.v?.[n]??null;return current?.nodes?.[n]??null;}
function currentLabel(value){if(value==null)return '暂无数据';const a=Math.abs(value);return `${(a>=1e-6?a*1e6:a*1e9).toFixed(3)} ${a>=1e-6?'µA':'nA'}`;}
function drawCircuit(){const [ctx,w,h]=canvasContext($('circuit'));hits=[];
 const scale=Math.min(w/12.5,h/8)*zoom,sel=inst[selected]?new Set(Object.values(inst[selected].terms)):new Set([selected]);
 function project([x,y,z]){const a=x*Math.cos(angle)+z*Math.sin(angle),b=-x*Math.sin(angle)+z*Math.cos(angle),yy=y*Math.cos(tilt)-b*Math.sin(tilt),zz=y*Math.sin(tilt)+b*Math.cos(tilt);const k=12/(12+zz);return [w/2+a*scale*k,h/2-yy*scale*k];}
 function stroke(A,B,color,width=1){const a=project(A),b=project(B);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 function poly(points,color,edge='#344860'){ctx.beginPath();points.map(project).forEach((q,i)=>i?ctx.lineTo(...q):ctx.moveTo(...q));ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.lineWidth=.7;ctx.strokeStyle=edge;ctx.stroke();}
 function box(cx,cy,cz,x0,x1,y0,y1,z0,z1,top,front,side){const p=(x,y,z)=>[cx+x,cy+y,cz+z];poly([p(x0,y0,z0),p(x1,y0,z0),p(x1,y0,z1),p(x0,y0,z1)],front);poly([p(x1,y0,z0),p(x1,y1,z0),p(x1,y1,z1),p(x1,y0,z1)],side);poly([p(x0,y1,z0),p(x1,y1,z0),p(x1,y1,z1),p(x0,y1,z1)],top);}
 function terminal(n,term){const [x,y,z]=positions[n];const channel=.18+Math.min(.28,params[n].L*.26),extent=channel+.17;return term==='D'?[x+extent,y-.09,z]:term==='S'?[x-extent,y-.09,z]:term==='G'?[x,y+.22,z]:[x,y-.13,z-.29];}
 function flow(A,M,B,i){if(!$('flow').checked||i==null||Math.abs(i)<1e-10)return;const density=Math.max(1,Math.min(5,Math.round(1+Math.log10(1+Math.abs(i)*1e6)*1.65)));const path=i>=0?[A,M,B]:[B,M,A];for(let j=0;j<density;j++){const f=(flowTick*.35+j/density)%1,part=f<.5?0:1,q=(f%0.5)*2,pt=path[part].map((v,k)=>v+(path[part+1][k]-v)*q),[x,y]=project(pt);ctx.beginPath();ctx.arc(x,y,2.5,0,Math.PI*2);ctx.fillStyle='#f9d289';ctx.shadowColor='#ffc65f';ctx.shadowBlur=10;ctx.fill();ctx.shadowBlur=0;}}
 const bands=[[-3.7,0,'输入差分级'],[-3.7,1.9,'电流镜'],[-2.3,-2,'尾电流'],[2.5,1.9,'第二级'],[.6,.6,'补偿支路']];for(const [x,y,t]of bands){const [a,b]=project([x,y+.75,-.45]);ctx.fillStyle='#6e8299';ctx.font='11px Segoe UI';ctx.fillText(t,a,b);}
 for(let x=-6;x<=6;x++)stroke([x,-3.3,-2],[x,-3.3,2.5],'#203041');for(let z=-2;z<=2.5;z++)stroke([-6,-3.3,z],[6,-3.3,z],'#203041');
 for(const [n,pos] of Object.entries(positions))for(const [term,node]of Object.entries(inst[n].terms)){
   if(term==='B')continue;const end=nodes[node];if(!end)continue;
   const start=n.startsWith('M')?terminal(n,term):[...pos];const mid=[end[0],start[1],start[2]],lit=sel.has(node)||n===selected;
   stroke(start,mid,lit?'#a5eeda':'#45617a',lit?2:1.15);stroke(mid,end,lit?'#a5eeda':'#45617a',lit?2:1.15);
   let i=null;if(n.startsWith('M')&&term!=='G')i=branchCurrent(n);else if(n==='CCOMP'||n==='RZ')i=replay?sampleAt()?.i?.[n]??null:null;
   if(i!=null){if(n.startsWith('M')){if(term==='D')flow(end,mid,start,i);else flow(start,mid,end,i);}else{flow(term==='PLUS'?end:start,mid,term==='PLUS'?start:end,i);}}
   const [sx,sy]=project(start),[ex,ey]=project(end);hits.push({n,term,node,segment:[sx,sy,ex,ey]});
 }
 for(const [n,pos] of Object.entries(positions)){
   const c=colors[n],at=project(pos),[x,y]=at;
   if(n.startsWith('M')){const L=.18+Math.min(.28,params[n].L*.26),W=.23+Math.min(.22,params[n].W/(data.nf[+n.slice(1)-1]*8)),z=W;
     box(...pos,-L-.17,-L,-.14,.02,-z,z,c,'#244e51','#346e70');
     box(...pos,-L,L,-.14,-.03,-z,z,'#36536d','#1d344b','#2b4b62');
     box(...pos,L,L+.17,-.14,.02,-z,z,c,'#244e51','#346e70');
     box(...pos,-L*.94,L*.94,.035,.065,-z*.90,z*.90,'#d6a960','#a97440','#bd8e50');
     box(...pos,-L*.9,L*.9,.065,.19,-z*.7,z*.7,'#6c85ba','#354e80','#4b6aa4');
     const [sx,sy]=project(terminal(n,'S')),[dx,dy]=project(terminal(n,'D')),[gx,gy]=project(terminal(n,'G'));
     for(const [label,xx,yy] of [['S',sx,sy],['D',dx,dy],['G',gx,gy]]){ctx.beginPath();ctx.arc(xx,yy,3,0,7);ctx.fillStyle=n===selected?'#fff3bc':'#a6b7cc';ctx.fill();if(n===selected){ctx.font='bold 11px Consolas';ctx.fillStyle='#fff3bc';ctx.fillText(label,xx+4,yy-4);}}
   }else{ctx.fillStyle='#182431';ctx.strokeStyle=c;ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x-15,y-12,30,24,4);ctx.fill();ctx.stroke();ctx.strokeStyle=c;ctx.beginPath();if(n==='RZ')ctx.rect(x-6,y-7,12,14);else{ctx.moveTo(x-10,y-3);ctx.lineTo(x+10,y-3);ctx.moveTo(x-10,y+3);ctx.lineTo(x+10,y+3);}ctx.stroke();}
   ctx.font='bold 12px Consolas';ctx.fillStyle=n===selected?'white':c;ctx.fillText(n,x+13,y-13);ctx.font='10px Consolas';ctx.fillStyle='#a2b4c7';ctx.fillText(params[n]?`${params[n].W} / ${params[n].L} µm`:n==='CCOMP'?`${params.Cc} fF`:n==='RZ'?`${params.Rz} kΩ`:'100 fF',x+12,y+2);hits.push({n,x,y,r:27});
 }
 for(const [n,pos]of Object.entries(nodes)){const [x,y]=project(pos);ctx.fillStyle=selected===n?'white':'#8db8ce';ctx.beginPath();ctx.arc(x,y,3.3,0,7);ctx.fill();ctx.font='10px Consolas';ctx.fillText(n+($('voltages').checked?' '+(nodeVoltage(n)==null?'暂无数据':nodeVoltage(n).toFixed(3)+' V'):''),x+6,y-6);hits.push({n,x,y,r:12});}
 if(/^M[1-7]$/.test(selected)){
   const bx=Math.max(12,w-308),by=h-194;ctx.fillStyle='#0c1724e9';ctx.strokeStyle='#4d7186';ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(bx,by,296,180,8);ctx.fill();ctx.stroke();
   const n=selected,p=params[n],isP=inst[n].cell.startsWith('pch');ctx.font='bold 12px Consolas';ctx.fillStyle='#e7f1fa';ctx.fillText(n+'  ·  器件结构示意',bx+13,by+20);
   const left=bx+21,top=by+52,wide=256;ctx.fillStyle='#28414b';ctx.fillRect(left,top,wide,49);ctx.fillStyle=isP?'#b99adf':'#75d5c8';ctx.fillRect(left,top,56,36);ctx.fillRect(left+200,top,56,36);ctx.fillStyle='#395d77';ctx.fillRect(left+56,top+13,144,23);ctx.fillStyle='#e6b777';ctx.fillRect(left+61,top+8,134,4);ctx.fillStyle='#718fc5';ctx.fillRect(left+67,top-12,122,20);
   ctx.strokeStyle='#d4dfeb';ctx.lineWidth=2;for(const [label,tx,xx,yy]of [['S',left+28,left+28,top+37],['G',left+128,left+128,top-12],['D',left+228,left+228,top+37]]){ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx,yy+(label==='G'?-10:11));ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(label,tx-4,label==='G'?top-27:top+62);}
   ctx.strokeStyle='#f4cf82';ctx.beginPath();ctx.moveTo(left+56,top+77);ctx.lineTo(left+200,top+77);ctx.moveTo(left+56,top+73);ctx.lineTo(left+56,top+81);ctx.moveTo(left+200,top+73);ctx.lineTo(left+200,top+81);ctx.moveTo(left+246,top+13);ctx.lineTo(left+246,top+36);ctx.moveTo(left+242,top+13);ctx.lineTo(left+250,top+13);ctx.moveTo(left+242,top+36);ctx.lineTo(left+250,top+36);ctx.stroke();ctx.fillStyle='#f4cf82';ctx.fillText('W',left+232,top+28);ctx.fillText('L '+p.L+' µm  → S–D',left+73,top+92);ctx.fillText('W '+p.W+' µm  ⟂ S–D',left+73,top+106);
 }
 ctx.font='10px Segoe UI';ctx.fillStyle='#8298ad';ctx.fillText('器件结构示意 · 电气连接以原网表为准',15,h-8);
}
function segmentDistance(px,py,s){const [x1,y1,x2,y2]=s,dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-x1-dx*t,py-y1-dy*t);}

const c=$('circuit');c.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,moved:false};c.setPointerCapture(e.pointerId);};c.onpointermove=e=>{if(!drag)return;let dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dx)+Math.abs(dy)>2)drag.moved=true;angle+=dx*.007;tilt=Math.max(-1.2,Math.min(1.2,tilt+dy*.007));drag.x=e.clientX;drag.y=e.clientY;drawCircuit();};c.onpointerup=e=>{if(drag&&!drag.moved){const b=c.getBoundingClientRect(),x=e.clientX-b.left,y=e.clientY-b.top;const hit=[...hits].reverse().find(h=>h.r&&Math.hypot(x-h.x,y-h.y)<h.r);if(hit){branchSelection=null;select(hit.n);}else{const branch=hits.find(h=>h.segment&&segmentDistance(x,y,h.segment)<6);if(branch){branchSelection=branch;select(branch.n);}}}drag=null;};c.onpointercancel=()=>drag=null;c.onwheel=e=>{e.preventDefault();zoom=Math.max(.55,Math.min(1.8,zoom*Math.exp(-e.deltaY*.001)));drawCircuit();};
$('flow').onchange=drawCircuit;$('voltages').onchange=drawCircuit;
function setTime(t){replay=true;timeNs=Math.max(0,Math.min(70,t));$('time').value=timeNs;$('mode-label').textContent=`瞬态回放 · ${timeNs.toFixed(2)} ns`;$('time-readout').textContent=timeNs.toFixed(2)+' ns';drawCircuit();operating();plot('step',1,true);}
$('time').oninput=e=>{playing=false;$('play').textContent='▶ 播放';setTime(+e.target.value);};
$('play').onclick=()=>{if(timeNs>=70)timeNs=0;playing=!playing;replay=true;$('play').textContent=playing?'❚❚ 暂停':'▶ 播放';setTime(timeNs);};
$('slow').onclick=()=>{slow=!slow;$('slow').textContent=slow?'慢速 ×0.2 ✓':'慢速 ×0.2';};
$('dc').onclick=()=>{playing=false;replay=false;$('play').textContent='▶ 播放';$('mode-label').textContent='直流工作点';$('time-readout').textContent='直流工作点';drawCircuit();operating();plot('step',1,true);};
let previousFrame=0;function tick(now){if(playing){const dt=Math.min(100,now-(previousFrame||now));timeNs+=dt*(slow?.0014:.007);if(timeNs>=70){timeNs=70;playing=false;$('play').textContent='▶ 播放';}setTime(timeNs);}else if($('flow').checked&&document.visibilityState==='visible'){flowTick+=Math.min(100,now-(previousFrame||now))*.006;drawCircuit();}previousFrame=now;requestAnimationFrame(tick);}requestAnimationFrame(tick);
function plot(id,index,transient=false){const [ctx,w,h]=canvasContext($(id)),pad={l:43,r:12,t:10,b:29};const W=w-pad.l-pad.r,H=h-pad.t-pad.b;
 const series=r=>transient?r.tran.map(a=>[a[0],a[1]]):r.ac.map(a=>[Math.log10(a[0]),a[index]]);
 const sets=[current,baseline].filter(Boolean).map(series);const all=sets.flat();let ymin=transient?.82:index===1?-40:-180,ymax=transient?.98:index===1?100:0;for(const a of all){ymin=Math.min(ymin,a[1]);ymax=Math.max(ymax,a[1]);}
 const xmax=transient?70:9,xy=(x,y)=>[pad.l+x/xmax*W,pad.t+(ymax-y)/(ymax-ymin)*H];ctx.font='10px Consolas';
 for(let i=0;i<=4;i++){let y=ymin+(ymax-ymin)*i/4;let [x,yy]=xy(0,y);ctx.strokeStyle='#283546';ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(w-pad.r,yy);ctx.stroke();ctx.fillStyle='#8799ae';ctx.fillText(transient?y.toFixed(2):y.toFixed(0),4,yy+3);}
 for(let i=0;i<=3;i++){const x=xmax*i/3;ctx.fillStyle='#8799ae';ctx.fillText(transient?x.toFixed(0):['1','1k','1M','1G'][i],xy(x,ymin)[0]-5,h-9);}
 function path(points,color,dash=[]){ctx.save();ctx.beginPath();ctx.rect(pad.l,pad.t,W,H);ctx.clip();ctx.beginPath();points.forEach(([x,y],i)=>{const q=xy(x,y);i?ctx.lineTo(...q):ctx.moveTo(...q);});ctx.strokeStyle=color;ctx.lineWidth=1.6;ctx.setLineDash(dash);ctx.stroke();ctx.restore();}
 if(baseline)path(series(baseline),'#eebc79',[5,4]);if(current)path(series(current),'#68e2c2');if(transient&&current)path(current.tran.map(a=>[a[0],a[2]]),'#7c8ca4',[3,4]);
 if(!transient&&current?.metrics.ugf>0){const x=Math.log10(current.metrics.ugf*1e6);ctx.setLineDash([2,4]);ctx.strokeStyle='#d0aa6b';ctx.beginPath();ctx.moveTo(...xy(x,ymin));ctx.lineTo(...xy(x,ymax));ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#d0aa6b';ctx.fillText('UGF',Math.min(w-35,xy(x,ymax)[0]+4),20);}
 if(transient&&replay){const x=xy(timeNs,ymin)[0];ctx.beginPath();ctx.moveTo(x,pad.t);ctx.lineTo(x,pad.t+H);ctx.strokeStyle='#f5c778';ctx.lineWidth=1.5;ctx.stroke();}
 $(id).onmousemove=e=>{const rect=$(id).getBoundingClientRect(),x=(e.clientX-rect.left-pad.l)/W*xmax;const a=sets[0]?.reduce((best,a)=>Math.abs(a[0]-x)<Math.abs(best[0]-x)?a:best);if(a)$(id).title=`${transient?a[0].toFixed(3)+' ns':(10**a[0]).toPrecision(4)+' Hz'} · ${a[1].toFixed(4)} ${transient?'V':index===1?'dB':'°'}`;};
 if(transient){$(id).onpointerdown=e=>{$(id).setPointerCapture(e.pointerId);playing=false;setTime((e.offsetX-pad.l)/W*70);};$(id).onpointermove=e=>{if(e.buttons)setTime((e.offsetX-pad.l)/W*70);};}
}
function render(){
 $('metrics').replaceChildren();for(const [key,label,unit] of [['gain','低频环路增益 ≈ DC 增益','dB'],['ugf','单位增益频率 UGF','MHz'],['pm','相位裕度','°'],['power','静态功耗','mW']]){const el=document.createElement('div');el.className='metric';const v=current?.metrics[key];el.innerHTML=`<label>${label}</label><strong>${v==null?'—':v.toFixed(key==='power'?4:2)} <small>${unit}</small></strong><div class="delta">${baseline&&v!=null?'Δ '+(v-baseline.metrics[key]).toFixed(4)+' '+unit:'未锁定基线'}</div>`;$('metrics').append(el);}
 $('source').textContent=current?.source||'待仿真';$('conditions').textContent=data.conditions.ac+'；相位显示 −loopGain，PM = 180° + ∠(−loopGain)。'+data.conditions.feedback+'；'+data.conditions.step+'；CL = 100 fF。'+data.conditions.power+'。';
 $('snapshot').textContent=JSON.stringify({curves:current?.params,source:current?.source,baseline:baseline?.params||null,editing:params,pdkValidation:current?.pdkValidation,geometryPolicy:current?.geometryPolicy,sourceSha256:data.sourceHash},null,2);$('hash').textContent='SOURCE '+data.sourceHash.slice(0,12);operating();plot('gain',1);plot('phase',2);plot('step',1,true);
}
new ResizeObserver(()=>{drawCircuit();render();}).observe(document.querySelector('.workspace'));
panel();drawCircuit();render();status('已载入原始参数 · 预计算 Spectre 数据');
try{const r=await fetch('/api/health');if(r.ok){const j=await r.json();live=j.mode==='bridge';}}catch{}
$('connection').textContent=live?'● t28 实时桥接':'● 教师演示版 · 预计算 Spectre 数据';
if(!live){
 document.querySelector('.notice').textContent='公开演示版使用真实 Spectre 预计算数据。只有下方三组参数对应已完成的曲线；其他组合显示“待仿真”。实时仿真需在连接虚拟机的本机后端运行。';
 const presets=document.createElement('div');presets.className='presets';
 const label=document.createElement('span');label.textContent='教师演示 · 真实 Spectre 结果';presets.append(label);
 for(const [name,index,device] of [['原始参数',0,'M1'],['M6 W = 1.50 µm',1,'M6'],['Cc = 550 fF',2,'CCOMP']]){
   if(!records[index])continue;const button=document.createElement('button');button.textContent=name;button.onclick=()=>{params=copy(records[index].params);selected=device;branchSelection=null;revision++;clearTimeout(timer);current=records[index];render();panel();drawCircuit();status('已载入匹配参数的预计算 Spectre 结果');};presets.append(button);
 }
 const help=document.createElement('small');help.textContent='其他组合显示待仿真；公开版不连接虚拟机。';presets.append(help);
 document.querySelector('.results').before(presets);
}

