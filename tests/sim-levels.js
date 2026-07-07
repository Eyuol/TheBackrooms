// Faithful simulator of the engine in index.html, to verify level move sequences.
// Mirrors: buildGrid, charAt, isGate, walkable, canMove, settleOpenDrop, syncGates, replayMove/recordMove/beginReplay.

const MOVES = { L:{dx:-1,dy:0}, R:{dx:1,dy:0}, U:{dx:0,dy:-1}, D:{dx:0,dy:1} };

function makeEngine(level) {
  const grid = buildGrid(level);
  function charAt(pos){ if(!pos||pos.x<0||pos.y<0||pos.y>=level.rows||pos.x>=level.cols) return " "; return grid[pos.y][pos.x]||" "; }
  function isGate(c){ return c>="A"&&c<="D"; }
  function isDropGate(c){ return isGate(c) && (level.dropGates||[]).includes(c); }
  function isOpenDropGateChar(c){ return isGate(c) && (level.openDropGates||[]).includes(c); }
  function isOpenDropGate(pos,gates){ const c=charAt(pos); return (isDropGate(c)&&gates.has(c)) || (isOpenDropGateChar(c)&&!gates.has(c)); }
  function gateForButton(c){ if(level.buttonControls&&level.buttonControls[c]) return level.buttonControls[c]; return c>="a"&&c<="d" ? c.toUpperCase() : null; }
  function isStairAt(pos){ return level.segments.some(([x1,y1,x2,y2,t])=> t==="stair"&&x1===x2 && pos.x===x1 && pos.y>=Math.min(y1,y2)&&pos.y<=Math.max(y1,y2)); }
  function stairRunAt(pos,moveKey){ if(!isStairAt(pos)) return null;
    const cands = level.segments.filter(([x1,y1,x2,y2,t])=> t==="stair"&&x1===x2&&pos.x===x1&&pos.y>=Math.min(y1,y2)&&pos.y<=Math.max(y1,y2)).map(([x1,y1,x2,y2])=>({x:x1,top:Math.min(y1,y2),bottom:Math.max(y1,y2)}));
    if(moveKey==="U") return cands.filter(r=>r.top<pos.y).sort((a,b)=>(a.bottom===pos.y?-1:1)-(b.bottom===pos.y?-1:1)||b.top-a.top)[0]||null;
    if(moveKey==="D") return cands.filter(r=>r.bottom>pos.y).sort((a,b)=>(a.top===pos.y?-1:1)-(b.top===pos.y?-1:1)||a.bottom-b.bottom)[0]||null;
    return cands[0]||null;
  }
  function fallTargetAt(pos,gates){ for(let y=pos.y+1;y<level.rows;y++){ const t={x:pos.x,y}; if(walkable(t,gates)) return t; } return null; }
  function portalTarget(pos,moveKey,actor){ for(const p of (level.portals||[])){ if(p.from[0]!==pos.x||p.from[1]!==pos.y) continue; if(p.moves&&!p.moves.includes(moveKey)) continue; if(p.phase&&p.phase!==st.phase) continue; if(p.actors&&!p.actors.includes(actor)) continue; return {x:p.to[0],y:p.to[1]}; } return null; }
  function resolveStep(to,moveKey,gates,actor){ if(!walkable(to,gates)) return {ok:false,to}; const pt=portalTarget(to,moveKey,actor); if(!pt) return {ok:true,to}; if(!walkable(pt,gates)) return {ok:false,to}; return {ok:true,to:pt}; }
  function walkable(pos,gates){ const c=charAt(pos); if(c===" ") return false; if(isDropGate(c)) return !gates.has(c); if(isOpenDropGateChar(c)) return gates.has(c); if(isGate(c)&&!gates.has(c)) return false; return true; }
  function activeGatesFor(...positions){ const g=new Set(); for(const pos of positions){ if(!pos) continue; const gate=gateForButton(charAt(pos)); if(Array.isArray(gate)) gate.forEach(i=>g.add(i)); else if(gate) g.add(gate); } return g; }
  function syncGates(){ st.gates = activeGatesFor(st.player, st.shadow); }
  function canMove(from,moveKey,gates=st.gates,actor="player"){
    if(moveKey==="W") return {ok:true,to:{...from}};
    if(moveKey==="U"||moveKey==="D"){ const run=stairRunAt(from,moveKey); if(!run){ if(moveKey==="D"){ const ft=fallTargetAt(from,gates); if(ft){ const r=resolveStep(ft,moveKey,gates,actor); return r.ok?r:{ok:false,to:from}; } } return {ok:false,to:from,fell:moveKey==="D"}; } const ty=moveKey==="U"?run.top:run.bottom; if(ty===from.y) return {ok:false,to:from}; const to={x:run.x,y:ty}; const r=resolveStep(to,moveKey,gates,actor); return r.ok?r:{ok:false,to:from}; }
    const m=MOVES[moveKey]; const to={x:from.x+m.dx,y:from.y+m.dy};
    if(charAt(to)===" "||isOpenDropGate(to,gates)){ const ft=fallTargetAt(to,gates); if(ft){ const r=resolveStep(ft,moveKey,gates,actor); return r.ok?r:{ok:false,to:from}; } return {ok:false,to:from,fell:true}; }
    if(!walkable(to,gates)){ const ft=fallTargetAt(to,gates); if(ft){ const r=resolveStep(ft,moveKey,gates,actor); return r.ok?r:{ok:false,to:from}; } return {ok:false,to:from,fell:true}; }
    const r=resolveStep(to,moveKey,gates,actor); return r.ok?r:{ok:false,to:from};
  }
  function settleOpenDrop(pos,gates=st.gates){ if(!isOpenDropGate(pos,gates)) return {ok:true,to:pos}; const ft=fallTargetAt(pos,gates); return ft?{ok:true,to:ft,fell:true}:{ok:false,to:pos,fell:true}; }
  const sPos = level.marks.S; const gPos = level.marks.G;
  function posOf(c){ const p=level.marks[c]; return {x:p[0],y:p[1]}; }
  function exitOpen(){ return !level.exitGate || st.gates.has(level.exitGate); }
  function recordLimit(){ return level.recordLimit ?? level.record.length; }

  const st = { phase:"record", player:posOf("S"), shadow:null, route:[], playRoute:[], gates:new Set(), turn:0, won:false, failed:false };

  function recordMove(mk){ const r=canMove(st.player,mk); if(!r.ok){ return {fail:r.fell?"fell":"blocked"}; } st.player=r.to; st.route.push(mk); syncGates(); if(st.route.length>=recordLimit()){ beginReplay(); } return {ok:true}; }
  function beginReplay(){ st.phase="replay"; st.shadow=posOf("S"); st.playRoute=[]; st.turn=0; syncGates(); }
  function replayMove(mk){ const gatesBefore=st.gates;
    const pr=canMove(st.player,mk,gatesBefore,"player"); if(!pr.ok){ return {fail:pr.fell?"fell":"blocked", who:"player"}; }
    const pf={...st.player}; const sf={...st.shadow};
    const sm=st.route[st.turn]||"W";
    const sr=canMove(st.shadow,sm,gatesBefore,"shadow"); if(!sr.ok){ return {fail:sr.fell?"fell":"blocked", who:"shadow"}; }
    const pTo=pr.to, sTo=sr.to;
    st.player=pTo; st.shadow=sTo; st.playRoute.push(mk); st.turn+=1; syncGates();
    const sp=settleOpenDrop(st.player); const ss=settleOpenDrop(st.shadow);
    if(!sp.ok||!ss.ok){ return {fail:"settled_fell", who:!ss.ok?"shadow":"player"}; }
    st.player=sp.to; st.shadow=ss.to; if(sp.fell||ss.fell) syncGates();
    const sameCell=(a,b)=>a&&b&&a.x===b.x&&a.y===b.y;
    if(sameCell(st.player,st.shadow) || (sameCell(pf,sTo)&&sameCell(sf,pTo))){ return {fail:"collide"}; }
    if(sameCell(st.player,posOf("G")) && !exitOpen()){ return {ok:true, blockedExit:true}; }
    if(sameCell(st.player,posOf("G"))){ st.won=true; return {ok:true, win:true}; }
    return {ok:true};
  }

  function runSeq(seq){
    const log=[];
    const limit=recordLimit();
    for(let i=0;i<seq.length;i++){
      const mk=seq[i];
      if(st.phase==="record"){
        const r=recordMove(mk);
        log.push({i,phase:"record",mk,player:{...st.player},res:r});
        if(r.fail) return {ok:false, log, reason:`record ${r.fail} at move ${i}`};
      } else {
        const r=replayMove(mk);
        log.push({i,phase:"replay",mk,turn:st.turn-1,player:{...st.player},shadow:st.shadow?{...st.shadow}:null,res:r});
        if(r.fail) return {ok:false, log, reason:`replay ${r.fail} (${r.who||""}) at move ${i}`};
        if(r.win) return {ok:true, win:true, log, movesUsed:i+1};
      }
    }
    return {ok:false, log, reason:"sequence ended without reaching exit"};
  }

  return { st, runSeq, exitOpen, posOf, recordLimit };
}

function buildGrid(level){
  const next=Array.from({length:level.rows},()=>Array(level.cols).fill(" "));
  const paint=(t)=>{ for(const [x1,y1,x2,y2,type] of level.segments){ if(type!==t) continue; const ch= type==="stair"?"H":"."; if(x1===x2){ const a=Math.min(y1,y2),b=Math.max(y1,y2); for(let y=a;y<=b;y++) next[y][x1]=ch; } else { const a=Math.min(x1,x2),b=Math.max(x1,x2); for(let x=a;x<=b;x++) next[y1][x]=ch; } } };
  paint("floor"); paint("stair");
  if(level.portals) for(const p of level.portals){ next[p.from[1]][p.from[0]]="P"; next[p.to[1]][p.to[0]]="P"; }
  for(const [c,pos] of Object.entries(level.marks)) next[pos[1]][pos[0]]=c;
  return next;
}

function printGrid(level){
  const g=buildGrid(level);
  g.forEach((row,y)=>console.log(String(y).padStart(2)+" "+row.join(" ")));
}

// ======================= LEVEL 6 =======================
// Layer1 (top, y=3): 空, 普通(梯子↓), 普通, 普通, 激光(关 A), 普通
// Layer2 (y=7):       按钮平台(a), 普通(梯子↑), 普通, 入口 S, 激光(开 B), 出口 G
const level6 = {
  name:"梯井双门", sub:"6 步成影", cols:10, rows:12,
  segments:[
    [3,3,7,3,"floor"],            // layer1 普通平台覆盖含梯口x3 和激光A x6
    [2,7,7,7,"floor"],            // layer2 平台覆盖按钮x2..出口x7
    [3,3,3,7,"stair"],            // 梯子 x3 连接两层
  ],
  marks:{ S:[5,7], G:[7,7], a:[2,7], A:[6,3], B:[6,7] },
  dropGates:[],                   // A 是关闭激光 = 普通 gate(默认挡); B 是打开激光 = openDropGate
  openDropGates:["B"],
  exitGate:"A",                   // 出口需要 A 打开? 让出口在层2 x7; 出口本身是否有 exitGate 待定
  buttonControls:{ a:["A","B"] }, // 按钮 a 同时控制 A、B
  record:"LLRUL", recordLimit:6,
};

// ======================= LEVEL 7 =======================
// 4 层, 4x8
// L1(y=3): 空,空,普通,入口 S,空,空,普通,空       -> x0空 x1空 x2普通 x3=S x4空 x5空 x6普通 x7空
// L2(y=6): 普通,普通,激光(关 A),普通,普通,普通(梯子↓连L4),空,空  -> x0普通 x1普通 x2=A x3普通 x4普通 x5普通(梯子) x6空 x7空
// L3(y=9): 空,普通,普通,空,空,空,空,空           -> x0空 x1普通 x2普通 x3空...
// L4(y=12): 出口 G,空,普通,普通,普通,普通(梯子↑连L2),按钮平台 a,普通 -> x0=G x1空 x2普通 x3普通 x4普通 x5普通(梯子) x6=a x7普通
const level7 = {
  name:"四层回廊", sub:"7 步成影", cols:8, rows:16,
  segments:[
    [2,3,3,3,"floor"],
    [6,3,6,3,"floor"],
    [0,6,5,6,"floor"],
    [1,9,2,9,"floor"],
    [2,12,7,12,"floor"],
    [5,6,5,12,"stair"],
  ],
  marks:{ S:[3,3], G:[0,12], a:[6,12], A:[2,6] },
  dropGates:[], openDropGates:[],
  exitGate:"A",
  buttonControls:{ a:["A"] },
  record:"LLRRRRR", recordLimit:7,
};

// ======================= LEVEL 8 =======================
// 3 层, 3x7
// L1(y=4): 普通,普通(梯子↓L2),入口 S,普通(梯子↓L2),普通,激光(开 A),出口 G
// L2(y=8): 普通(梯子↓L3),普通,普通(梯子↓L3),普通,普通(梯子↓L3),空,空
// L3(y=12): 普通,按钮 a,普通,普通,普通,空,空
const level8 = {
  name:"三梯深渊", sub:"8 步成影", cols:7, rows:16,
  segments:[
    [0,4,6,4,"floor"],
    [0,8,4,8,"floor"],
    [0,12,4,12,"floor"],
    [1,4,1,8,"stair"],
    [3,4,3,8,"stair"],
    [4,8,4,12,"stair"],
  ],
  marks:{ S:[2,4], G:[6,4], a:[1,12], A:[5,4] },
  dropGates:[], openDropGates:["A"],
  exitGate:"A",
  buttonControls:{ a:["A"] },
  record:"LDUDLD RR", recordLimit:8, // placeholder seq parsed below
};

const SEQ = {
  6: "LLRUL"+"RURRRRLR",         // 左左右左上左 | 右上右右右右左右
  7: "LLRRRRR"+"LUR LULLLLL".replace(/\s/g,""), // 左左右右右右右左 | 上右左上左左左左左  -> need exact
  8: "LDUDLDR"+"RURUR LRRR".replace(/\s/g,""),
};

function run(level, seq){
  const e=makeEngine(level);
  const r=e.runSeq(seq.split(""));
  return r;
}

const runs = [
  ["L6", level6, "LLRLULRURRRRLR"],
  ["L7", level7, "LLRRRRRLURLULLLLL"],
  ["L8", level8, "LDUDLDRRURURLRRR"],
];

for(const [tag,level,seq] of runs){
  console.log("=== "+tag+" ===");
  printGrid(level);
  const e=makeEngine(level);
  const r=e.runSeq(seq.split(""));
  console.log("seq("+seq.length+"):", seq, "record="+e.recordLimit());
  if(r.win){ console.log(">> WIN in "+r.movesUsed+" moves"); }
  else { console.log(">> "+(r.ok?"NO WIN":"FAIL")+": "+r.reason);
    const log=r.log||[];
    console.log("trace:");
    log.forEach(l=>console.log("  mv"+l.i+" "+l.phase+" "+l.mk+(l.turn!==undefined?(" t"+l.turn):"")+" -> P("+l.player.x+","+l.player.y+")"+(l.shadow?(" S("+l.shadow.x+","+l.shadow.y+")"):"")+"  "+JSON.stringify(l.res)));
  }
  console.log("");
}