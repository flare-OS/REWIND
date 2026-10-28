import { Indexable, LuauState } from './vendor/luau-web/index.js';

let state=null;
onmessage=async event=>{
  const {type,code='',objectName='Object',id}=event.data||{};
  if(type==='stop'){state?.destroy();state=null;close();return}
  if(type==='activate'){
    if(!state)return;
    try{await state.env.get('activate')();postMessage({type:'done',id})}
    catch(error){postMessage({type:'error',id,message:String(error?.message||error)})}
    return;
  }
  if(type!=='run')return;
  try{
    state?.destroy();
    const output=(level,args)=>postMessage({type:'output',id,level,text:args.map(value=>{try{return typeof value==='string'?value:JSON.stringify(value)}catch{return String(value)}}).join('\t')});
    state=await LuauState.createAsync({
      print:Indexable((...args)=>output('log',args)),
      warn:Indexable((...args)=>output('warn',args)),
      script:{Name:String(objectName),Parent:{Name:String(objectName),ClassName:'Instance'}},
      activate:Indexable(()=>{})
    });
    const result=state.loadstring(String(code),'REWIND Script',true)();
    if(result&&typeof result.then==='function')await result;
    postMessage({type:'done',id});
  }catch(error){postMessage({type:'error',id,message:String(error?.message||error)})}
};
