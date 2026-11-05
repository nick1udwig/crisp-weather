function runtime() {
  let time=1700000000000, sequence=0;
  const timers=new Map(), values={}, sent=[], logs=[];
  const env={
    storage:{getItem:key=>values[key]||null,setItem:(key,value)=>{values[key]=value;},removeItem:key=>{delete values[key];}},
    now:()=>time,
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id;},
    clearTimeout:id=>timers.delete(id),
    send:(payload,success,failure)=>{sent.push(payload);if(env.deliveryError) failure({error:'NOT_CONNECTED'});else success();},
    log:message=>logs.push(message)
  };
  function advance(ms) {
    const end=time+ms;
    for(let n=0;n<10000;n++) {
      const next=[...timers.entries()].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next){time=end;return;}
      timers.delete(next[0]);time=next[1].at;next[1].fn();
    }
    throw Error('Timer loop');
  }
  return {env,sent,logs,values,timers,advance};
}
module.exports={runtime};
