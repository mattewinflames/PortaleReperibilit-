// Replica della geometria di ShiftArc per verificarla
const toHours = (t: string) => { const [h,m]=t.split(':').map(Number); return ((h||0)+(m||0)/60)%24; };
const pointAt = (hour:number, cx:number, cy:number, r:number) => {
  const a = ((hour%24)/24)*2*Math.PI;
  return { x: cx + r*Math.sin(a), y: cy - r*Math.cos(a) };
};
const c=50, r=43.5;
let pass=0, fail=0;
const near=(n:string,g:{x:number,y:number},wx:number,wy:number)=>{
  const ok=Math.abs(g.x-wx)<0.5&&Math.abs(g.y-wy)<0.5; ok?pass++:fail++;
  console.log(`${ok?'OK  ':'FAIL'} ${n.padEnd(42)} (${g.x.toFixed(1)}, ${g.y.toFixed(1)})`);
};
console.log('Posizioni sul quadrante 24h (mezzanotte in alto):\n');
near('00:00 in alto',        pointAt(0,c,c,r), 50, 6.5);
near('06:00 a destra',       pointAt(6,c,c,r), 93.5, 50);
near('12:00 in basso',       pointAt(12,c,c,r), 50, 93.5);
near('18:00 a sinistra',     pointAt(18,c,c,r), 6.5, 50);

console.log('\nArco del turno 18:00 -> 08:00:');
const start=toHours('18:00'), end=toHours('08:00');
let span=end-start; if(span<=0) span+=24;
console.log(`  durata: ${span}h  (attesa 14)  ${span===14?'OK':'FAIL'}`); span===14?pass++:fail++;
console.log(`  large-arc-flag: ${span>12?1:0}  (deve essere 1 per 14h)`);
const p1=pointAt(start,c,c,r), p2=pointAt(start+span,c,c,r);
console.log(`  M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 1 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`);

console.log('\nAltri turni (il componente e parametrico):');
for (const [f,t,exp] of [['00:00','08:00',8],['18:00','23:59',5.98],['00:00','23:59',23.98]] as [string,string,number][]) {
  let sp=toHours(t)-toHours(f); if(sp<=0) sp+=24;
  const ok=Math.abs(sp-exp)<0.02; ok?pass++:fail++;
  console.log(`${ok?'OK  ':'FAIL'} ${f}->${t} = ${sp.toFixed(2)}h`);
}
console.log(`\n${pass} passati, ${fail} falliti`);
