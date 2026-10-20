function runtime() {
  let time=1700000000000, sequence=0;
  const timers=new Map(), values={}, requests=[], locations=[], sent=[], logs=[];
  const env={
    storage:{getItem:key=>values[key]||null,setItem:(key,value)=>{values[key]=value;}},
    now:()=>time,random:()=>0,
    setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,at:time+ms});return id;},
    clearTimeout:id=>timers.delete(id),
    geolocation:{getCurrentPosition:(success,failure,options)=>locations.push({success,failure,options})},
    XMLHttpRequest:function(){
      this.open=(method,url)=>{this.url=url;};
      this.send=()=>requests.push(this);
      this.abort=()=>{this.aborted=true;};
      this.getResponseHeader=()=>this.retryAfter||null;
    },
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
  function body() {
    const start=Math.floor(time/3600000)*3600, day=Math.floor(start/86400)*86400;
    return {hourly:{time:Array.from({length:48},(_,i)=>start+i*3600),temperature_2m:Array(48).fill(18),
      weather_code:Array(48).fill(1),is_day:Array(48).fill(1),precipitation_probability:Array(48).fill(30)},
      daily:{time:[day,day+86400],temperature_2m_min:[10,11],temperature_2m_max:[20,21]}};
  }
  function locate(index=locations.length-1) { locations[index].success({coords:{latitude:37.77,longitude:-122.42}}); }
  function respond(status=200,data=body(),index=requests.length-1) {
    const req=requests[index];req.status=status;req.responseText=typeof data==='string'?data:JSON.stringify(data);req.onload();
  }
  return {env,requests,locations,sent,logs,values,timers,advance,body,locate,respond};
}
module.exports={runtime};
