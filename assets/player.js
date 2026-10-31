import './config.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from 'three/addons/objects/Sky.js';

const apiBase=(window.REWIND_CONFIG?.apiBase||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'':'https://api.rwd.2bd.net')).replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const canvas=$('#player-canvas'),stage=$('.player-stage'),message=$('#player-message');
const params=new URLSearchParams(location.search),placeId=params.get('id');
const held=new Set(),loader=new GLTFLoader(),colliders=[],colliderBounds=[],sceneObjectMap=new Map(),uiNodes=new Map(),scriptTimers=new Map(),scriptEventTimers=new Map(),activeScriptIds=new Set();
let scriptEventCounter=0;
const moveKeys={forward:['w','z'],back:['s'],left:['q','a'],right:['d']};
const controls=new Set(['forward','back','left','right','jump']);
const PLAYER_RADIUS=.4,PLAYER_HEIGHT=2.7;
let renderer,scene,camera,composer,bloomPass,sky,player,place,frame=0,jumpVelocity=0,lastFrameTime=performance.now(),grounded=false,gravity=18,spawnPoint=new THREE.Vector3(0,2,6),scriptWorker=null,playerStats=[];

function showError(text){
  message.textContent=text;
  message.classList.add('visible','error');
}
function setControl(control,down){
  if(controls.has(control)){
    if(down)held.add(control);
    else held.delete(control);
  }
}
function jump(){
  if(grounded){jumpVelocity=7.4;grounded=false}
}
function onKeyDown(event){
  const key=event.key.toLowerCase();
  const control=Object.entries(moveKeys).find(([,keys])=>keys.includes(key))?.[0]||(key===' '||key==='spacebar'?'jump':null);
  if(!control||/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement?.tagName||''))return;
  event.preventDefault();
  if(control==='jump'&&!held.has('jump'))jump();
  setControl(control,true);
}
function onKeyUp(event){
  const key=event.key.toLowerCase();
  const control=Object.entries(moveKeys).find(([,keys])=>keys.includes(key))?.[0]||(key===' '||key==='spacebar'?'jump':null);
  if(control)setControl(control,false);
}
function addAvatar(){
  const root=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0xdca77f}),shirt=new THREE.MeshStandardMaterial({color:0x8271db}),pants=new THREE.MeshStandardMaterial({color:0x34364a});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(1.15,1.35,.62),shirt);torso.position.y=1.65;root.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.43,20,16),skin);head.position.y=2.62;root.add(head);
  const eyeMaterial=new THREE.MeshStandardMaterial({color:0x292738});
  for(const x of [-.14,.14]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),eyeMaterial);eye.position.set(x,2.65,.39);root.add(eye)}
  const limbs=[];
  for(const [x,y,material,width,height] of [[-.76,1.7,shirt,.4,1.05],[.76,1.7,shirt,.4,1.05],[-.3,.55,pants,.47,1],[.3,.55,pants,.47,1]]){
    const limb=new THREE.Mesh(new THREE.BoxGeometry(width,height,.5),material);limb.position.set(x,y,0);root.add(limb);limbs.push(limb);
  }
  root.userData.limbs=limbs;
  root.position.copy(spawnPoint);
  root.rotation.y=Math.PI;
  scene.add(root);
  return root;
}
function addLighting(){
  scene.add(new THREE.HemisphereLight(0xc9d2f3,0x35313e,1.6));
  const light=new THREE.DirectionalLight(0xffe7ce,2.3);
  light.position.set(-8,16,9);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.near=.5;light.shadow.camera.far=220;
  scene.add(light);
}
function colorValue(value,fallback='#8980d8'){
  if(typeof value==='number'&&Number.isFinite(value))return value;
  if(typeof value==='string'&&/^#[0-9a-f]{3}$/i.test(value))return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  if(typeof value==='string'&&/^#[0-9a-f]{6,8}$/i.test(value))return value.slice(0,7);
  return fallback;
}
function createWedgeGeometry(){
  const shape=new THREE.Shape();
  shape.moveTo(-.5,-.5);shape.lineTo(.5,-.5);shape.lineTo(-.5,.5);shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});
  geometry.translate(0,0,-.5);geometry.computeVertexNormals();
  return geometry;
}
function geometryFor(kind,legacy=false){
  if(legacy){
    if(kind==='sphere')return new THREE.SphereGeometry(1.5,32,20);
    if(kind==='pyramid')return new THREE.ConeGeometry(2,3.5,4);
    return new THREE.BoxGeometry(3,2.5,3);
  }
  switch(kind){
    case 'sphere':return new THREE.SphereGeometry(.5,32,20);
    case 'cylinder':return new THREE.CylinderGeometry(.5,.5,1,28);
    case 'wedge':return createWedgeGeometry();
    case 'torus':return new THREE.TorusGeometry(.36,.14,16,36);
    case 'plane':return new THREE.BoxGeometry(1,.08,1);
    case 'spawn':return new THREE.CylinderGeometry(.5,.5,.16,32);
    case 'pyramid':return new THREE.ConeGeometry(.5,1,4);
    default:return new THREE.BoxGeometry(1,1,1);
  }
}
function materialFor(item){
  const color=new THREE.Color(colorValue(item.color));
  const settings={
    SmoothPlastic:{roughness:.62,metalness:.03},
    Metal:{roughness:.28,metalness:.92},
    Wood:{roughness:.86,metalness:0},
    Concrete:{roughness:.95,metalness:0},
    Glass:{roughness:.08,metalness:.1,transparent:true,opacity:.35},
    Neon:{roughness:.5,metalness:0,emissive:true}
  }[item.material]||{roughness:.62,metalness:.03};
  const transparency=THREE.MathUtils.clamp(Number(item.transparency)||0,0,1);
  const material=new THREE.MeshStandardMaterial({
    color,roughness:settings.roughness,metalness:settings.metalness,
    transparent:Boolean(settings.transparent)||transparency>0,
    opacity:settings.transparent?Math.min(settings.opacity,1-transparency):1-transparency,
    side:THREE.DoubleSide
  });
  if(settings.emissive){material.emissive.copy(color);material.emissiveIntensity=1.35}
  return material;
}
function applyTransform(object,item,legacy=false){
  if(Array.isArray(item.position))object.position.fromArray(item.position);
  if(Array.isArray(item.rotation))object.rotation.fromArray(item.rotation);
  const size=legacy?(Array.isArray(item.scale)?item.scale:[1,1,1]):(Array.isArray(item.size)?item.size:[1,1,1]);
  object.scale.fromArray(size.map(value=>Number.isFinite(Number(value))?Number(value):1));
}
function registerCollider(mesh,item){
  if(!mesh.isMesh||item.anchored===false||item.visible===false||['light','bean','spawn','camera'].includes(item.kind))return;
  mesh.updateMatrixWorld(true);
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  colliders.push(mesh);
  colliderBounds.push(new THREE.Box3().setFromObject(mesh));
}
function disposeObject(object){
  object.traverse?.(child=>{
    if(child.geometry)child.geometry.dispose();
    if(Array.isArray(child.material))child.material.forEach(material=>material.dispose());
    else child.material?.dispose();
  });
}
function addLight(item,legacy){
  const mesh=new THREE.Mesh(geometryFor(item.kind,legacy),materialFor(item));
  mesh.name=item.name||'Light';mesh.visible=item.visible!==false;
  applyTransform(mesh,item,legacy);
  const point=new THREE.PointLight(colorValue(item.color,'#ffe3a1'),14,16,1.8);
  point.position.set(0,.35,0);mesh.add(point);
  if(mesh.material instanceof THREE.MeshStandardMaterial){mesh.material.emissive=new THREE.Color(colorValue(item.color,'#ffe3a1'));mesh.material.emissiveIntensity=2}
  scene.add(mesh);
  if(item.id)sceneObjectMap.set(String(item.id),mesh);
  return mesh;
}
function addBean(item,legacy){
  const root=new THREE.Group(),color=colorValue(item.color,'#efb75d');
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.46,8,18),new THREE.MeshStandardMaterial({color,roughness:.72}));
  body.position.y=.05;body.castShadow=true;root.add(body);
  const face=new THREE.Mesh(new THREE.SphereGeometry(.22,20,14),new THREE.MeshStandardMaterial({color:'#f4d7b3',roughness:.8}));
  face.position.set(0,.72,0);root.add(face);
  const eyes=new THREE.MeshBasicMaterial({color:'#292127'});
  for(const x of [-.08,.08]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.024,8,8),eyes);eye.position.set(x,.76,.2);root.add(eye)}
  root.name=item.name||'Bean';root.visible=item.visible!==false;applyTransform(root,item,legacy);scene.add(root);
  if(item.id)sceneObjectMap.set(String(item.id),root);
  return root;
}
function addPart(item,legacy=false){
  if(item.visible===false)return null;
  if(item.kind==='bean')return addBean(item,legacy);
  if(item.kind==='light')return addLight(item,legacy);
  const mesh=new THREE.Mesh(item.kind==='camera'?new THREE.BoxGeometry(.8,.52,.52):geometryFor(item.kind,legacy),materialFor(item));
  mesh.userData.rewindKind=item.kind;
  mesh.name=item.name||item.kind||'Object';mesh.visible=true;
  mesh.castShadow=item.castShadow!==false&&item.kind!=='spawn';mesh.receiveShadow=item.kind!=='light';
  applyTransform(mesh,item,legacy);
  if(item.kind==='pyramid'&&!legacy)mesh.rotation.y+=Math.PI/4;
  if(item.kind==='spawn')mesh.position.y=Math.max(.08,mesh.position.y);
  if(item.kind==='camera'){
    const lens=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,.16,16),new THREE.MeshStandardMaterial({color:'#252735',metalness:.65,roughness:.3}));
    lens.rotation.x=Math.PI/2;lens.position.set(0,0,-.3);mesh.add(lens);
  }
  scene.add(mesh);
  registerCollider(mesh,item);
  if(item.id)sceneObjectMap.set(String(item.id),mesh);
  return mesh;
}
function safeAssetUrl(value){
  try{const url=new URL(value,location.href);return url.protocol==='https:'?url.href:null}catch{return null}
}
async function getAsset(assetId){
  if(!assetId)return null;
  const response=await fetch(`${apiBase}/api/assets?id=${encodeURIComponent(assetId)}`,{credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Could not load approved asset (${response.status}).`);
  return data.asset||null;
}
async function loadModel(item,legacy=false){
  let url=item.assetUrl;
  const assetId=item.assetId||item.imageAssetId||item.catalogAsset?.id;
  if(assetId){
    const asset=await getAsset(assetId);
    url=asset?.public_url||url;
  }
  url=safeAssetUrl(url);
  if(!url)throw new Error(`The model “${item.name||'Model'}” has no secure preview URL.`);
  const gltf=await loader.loadAsync(url),model=gltf.scene;
  model.name=item.name||'Model';
  model.traverse(child=>{if(child.isMesh){child.castShadow=item.castShadow!==false;child.receiveShadow=true}});
  applyTransform(model,item,legacy);model.visible=item.visible!==false;scene.add(model);
  if(item.id)sceneObjectMap.set(String(item.id),model);
  if(item.anchored!==false&&item.visible!==false){
    model.updateMatrixWorld(true);
    model.traverse(child=>registerCollider(child,item));
  }
}
async function addCatalogItem(item,legacy=false){
  if(item.kind==='model'){await loadModel(item,legacy);return}
  if(item.catalogAsset?.id){
    const asset=await getAsset(item.catalogAsset.id);
    if(asset?.asset_type==='model'){await loadModel({...item,assetId:asset.id},legacy);return}
    if(asset?.asset_type==='decal'){
      const url=safeAssetUrl(asset.public_url);
      if(!url)throw new Error(`The decal “${asset.name||item.name}” has no secure preview URL.`);
      const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true});
      const decal=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
      decal.name=item.name||asset.name||'Decal';applyTransform(decal,item,legacy);scene.add(decal);
      new THREE.TextureLoader().load(url,texture=>{texture.colorSpace=THREE.SRGBColorSpace;material.map=texture;material.needsUpdate=true},undefined,()=>showError(`Could not load decal: ${asset.name||item.name}`));
      return;
    }
  }
  addPart(item,legacy);
}
function applyEnvironment(environment={}){
  const preset=environment.preset||'studio';
  const colors={studio:0x9fb7d6,sunset:0x7d5365,night:0x11131a,nebula:0x302b50,void:0x080910};
  const bg=new THREE.Color(colors[preset]??colors.studio);
  scene.background=null;
  const fogFar=Math.max(20,Number(environment.fogFar)||140);
  scene.fog=environment.fog===false?null:new THREE.Fog(bg,Math.max(8,fogFar*.22),fogFar);
  const ambient=scene.children.find(child=>child.isHemisphereLight);
  const sun=scene.children.find(child=>child.isDirectionalLight);
  if(ambient)ambient.intensity=Number(environment.ambientIntensity)||1.6;
  if(sun){
    sun.intensity=Number(environment.sunIntensity)||2.3;
    const elevation=THREE.MathUtils.degToRad(Number(environment.elevation)||28);
    const azimuth=THREE.MathUtils.degToRad(Number(environment.azimuth)||180);
    sun.position.set(Math.sin(azimuth)*Math.cos(elevation),Math.sin(elevation),Math.cos(azimuth)*Math.cos(elevation)).multiplyScalar(45);
  }
  if(sky){
    const uniforms=sky.material.uniforms;
    uniforms.turbidity.value=Number(environment.turbidity)||7;
    uniforms.rayleigh.value=Number(environment.rayleigh)||2;
    uniforms.mieCoefficient.value=.004;
    uniforms.mieDirectionalG.value=.82;
    const phi=THREE.MathUtils.degToRad(90-(Number(environment.elevation)||28));
    const theta=THREE.MathUtils.degToRad(Number(environment.azimuth)||180);
    uniforms.sunPosition.value.setFromSphericalCoords(1,phi,theta);
  }
  if(renderer){
    renderer.toneMappingExposure=THREE.MathUtils.clamp(Number(environment.exposure)||1.05,.2,3);
    if(bloomPass){bloomPass.enabled=Boolean(environment.bloom);bloomPass.strength=THREE.MathUtils.clamp(Number(environment.bloomStrength)||.35,0,2)}
  }
  if(environment.customSkybox&&Array.isArray(environment.customSkybox)&&environment.customSkybox.length===6){
    const urls=environment.customSkybox.map(safeAssetUrl);
    if(urls.every(Boolean)){
      new THREE.CubeTextureLoader().load(urls,texture=>{texture.colorSpace=THREE.SRGBColorSpace;scene.background=texture;if(sky)sky.visible=false},undefined,()=>showError('The creator skybox could not be loaded.'));
    }else showError('This creator skybox uses local files and is only available in the desktop Studio.');
  }else if(sky)sky.visible=true;
  if(environment.stars){
    const positions=new Float32Array(900);
    for(let i=0;i<positions.length;i++)positions[i]=(Math.random()-.5)*800;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const stars=new THREE.Points(geometry,new THREE.PointsMaterial({color:0xffffff,size:1.5,sizeAttenuation:false}));
    scene.add(stars);
  }
}
function renderScreenUi(items){
  const root=$('#play-ui');root.replaceChildren();uiNodes.clear();
  if(!Array.isArray(items))return;
  for(const item of items){
    if(item.visible===false)continue;
    createUiNode(item);
  }
}
function createUiNode(item){
  if(item.visible===false)return null;
  const root=$('#play-ui'),id=String(item.id||`runtime-ui-${uiNodes.size+1}`),button=item.kind==='TextButton';
  const element=document.createElement(button?'button':'div');
  element.className='play-ui-item';element.dataset.uiId=id;element.textContent=item.text||item.name||item.kind||'';
  styleUiNode(element,item);
  if(button)element.addEventListener('click',()=>{
    message.textContent=`${item.name||'Button'} activated.`;message.classList.add('visible');message.classList.remove('error');
    dispatchScriptEvent(id,'Activated');
  });
  if(item.kind==='ImageLabel'){
    const image=document.createElement('img');image.alt=item.name||'Creator image';image.style.cssText='width:100%;height:100%;object-fit:contain;position:absolute;inset:0';
    element.textContent='';
    const imageId=item.imageAssetId;
    if(imageId)getAsset(imageId).then(asset=>{const url=safeAssetUrl(asset?.public_url);if(url)image.src=url;else showError(`Could not load UI image: ${item.name||'Image'}`)}).catch(error=>showError(error.message));
    else if(item.imageUrl)image.src=safeAssetUrl(item.imageUrl)||'';
    element.append(image);
  }
  root.append(element);uiNodes.set(id,element);return element;
}
function styleUiNode(element,item){
  const position=Array.isArray(item.position)?item.position:[0,0],size=Array.isArray(item.size)?item.size:[200,60];
  element.style.left=`${THREE.MathUtils.clamp(Number(position[0])||0,0,1280)/12.8}%`;
  element.style.top=`${THREE.MathUtils.clamp(Number(position[1])||0,0,720)/7.2}%`;
  element.style.width=`${THREE.MathUtils.clamp(Number(size[0])||200,25,1280)/12.8}%`;
  element.style.height=`${THREE.MathUtils.clamp(Number(size[1])||60,20,720)/7.2}%`;
  const uiColor=new THREE.Color(colorValue(item.color,'#6155b7')).getHexString();
  element.style.backgroundColor=item.kind==='TextLabel'?'transparent':`#${uiColor}dd`;
  element.style.display=item.visible===false?'none':'grid';
  if(item.text!==undefined&&item.kind!=='ImageLabel')element.textContent=String(item.text);
}
function dispatchScriptEvent(targetId,eventName){
  if(!scriptWorker||!activeScriptIds.size)return;
  const ids=[...activeScriptIds],eventId=`event-${++scriptEventCounter}`;
  const timer=setTimeout(()=>{
    showScriptStatus('A creator event exceeded the preview time limit; scripts were stopped.',true);
    scriptWorker?.terminate();scriptWorker=null;activeScriptIds.clear();
    for(const scriptTimer of scriptTimers.values())clearTimeout(scriptTimer);
    for(const eventTimer of scriptEventTimers.values())clearTimeout(eventTimer.timer);
    scriptTimers.clear();scriptEventTimers.clear();
  },8000);
  scriptEventTimers.set(eventId,{timer,pending:new Set(ids)});
  for(const id of ids)scriptWorker.postMessage({type:'activate',id,targetId:String(targetId),eventName,eventId});
}
function updatePlayerList(playerName='Player',stats=playerStats){
  playerStats=Array.isArray(stats)?stats:[];
  const content=$('#player-list-content');
  if(!content)return;
  content.replaceChildren();
  const playerRow=document.createElement('div');playerRow.className='player-list-player';
  const avatar=document.createElement('span');avatar.className='player-list-avatar';avatar.textContent=String(playerName||'P').slice(0,1).toUpperCase();
  const name=document.createElement('strong');name.textContent=String(playerName||'Player');
  playerRow.append(avatar,name);content.append(playerRow);
  if(playerStats.length){
    const statList=document.createElement('div');statList.className='player-list-stats';
    for(const stat of playerStats){
      const row=document.createElement('div');row.className='player-list-stat';
      const label=document.createElement('span');label.textContent=String(stat.name||'Stat');
      const value=document.createElement('b');value.textContent=String(stat.value??'');
      row.append(label,value);statList.append(row);
    }
    content.append(statList);
  }else{
    const empty=document.createElement('div');empty.className='player-list-empty';empty.textContent='No local leaderstats have been created.';content.append(empty);
  }
  $('#player-count').textContent='1';
}
function showScriptStatus(text,isError=false){
  const status=$('#script-status');
  if(!status)return;
  status.textContent=String(text);status.hidden=false;status.classList.toggle('error',Boolean(isError));
  clearTimeout(showScriptStatus.timer);
  showScriptStatus.timer=setTimeout(()=>{status.hidden=true},isError?8000:5000);
}
function scriptObjectKind(kind){
  return ({Part:'block',MeshPart:'model',SpawnLocation:'spawn',Camera:'camera',TextButton:'TextButton',TextLabel:'TextLabel',ImageLabel:'ImageLabel',Frame:'Frame',ScrollingFrame:'ScrollingFrame'})[kind]||String(kind||'block').toLowerCase();
}
function applyScriptInstance(item){
  if(!item||!item.id)return;
  const id=String(item.id);
  if(item.ui){
    let node=uiNodes.get(id);
    if(item.destroyed){
      node?.remove();uiNodes.delete(id);return;
    }
    const data={...item,kind:item.kind||'Frame'};
    if(!node)node=createUiNode(data);
    else{
      node.className='play-ui-item';
      if((item.kind==='TextButton')!== (node.tagName==='BUTTON')){
        const replacement=createUiNode(data);node.remove();return replacement;
      }
      styleUiNode(node,data);
    }
    return;
  }
  let object=sceneObjectMap.get(id);
  if(item.destroyed){
    if(object){
      for(let index=colliders.length-1;index>=0;index--)if(colliders[index]===object){colliders.splice(index,1);colliderBounds.splice(index,1)}
      scene.remove(object);disposeObject(object);sceneObjectMap.delete(id);
    }
    return;
  }
  const kind=scriptObjectKind(item.kind);
  const record={...item,id,kind};
  if(!object){
    addPart(record,false);
    object=sceneObjectMap.get(id);
    return;
  }
  if(Array.isArray(item.position))object.position.fromArray(item.position);
  if(Array.isArray(item.rotation))object.rotation.fromArray(item.rotation);
  if(Array.isArray(item.size))object.scale.fromArray(item.size.map(value=>Number(value)||1));
  object.name=String(item.name||object.name);
  object.visible=item.visible!==false;
  object.traverse?.(child=>{
    if(child.isMesh&&child.material?.color){
      child.material.color.set(colorValue(item.color));
      child.material.transparent=Number(item.transparency)>0;
      child.material.opacity=1-(Number(item.transparency)||0);
      child.material.needsUpdate=true;
    }
  });
  if(object.isMesh){
    for(let index=colliders.length-1;index>=0;index--)if(colliders[index]===object){colliders.splice(index,1);colliderBounds.splice(index,1)}
    registerCollider(object,{...record,anchored:item.anchored!==false,visible:item.visible!==false});
  }
}
function runPlaceScripts(snapshot){
  const scripts=Array.isArray(snapshot.scripts)?snapshot.scripts.filter(item=>item&&item.type!=='ModuleScript'):[] ;
  updatePlayerList();
  if(!scripts.length)return;
  activeScriptIds.clear();
  scriptWorker=new Worker(new URL('./luau-worker.js',import.meta.url),{type:'module'});
  const objects=Array.isArray(snapshot.objects)?snapshot.objects:[];
  const ui=Array.isArray(snapshot.ui)?snapshot.ui:[];
  const sceneContext=objects.map(item=>({...item}));
  const uiContext=ui.map(item=>({...item}));
  const sendScripts=()=>{
    showScriptStatus('Creator scripts are running locally in this browser.');
    for(const script of scripts){
      const id=String(script.id||`script-${activeScriptIds.size+1}`);
      activeScriptIds.add(id);
      scriptTimers.set(id,setTimeout(()=>{
        showScriptStatus(`${script.name||'A script'} exceeded the preview time limit; scripts were stopped.`,true);
        scriptWorker?.terminate();scriptWorker=null;activeScriptIds.clear();
        for(const timer of scriptTimers.values())clearTimeout(timer);
        for(const event of scriptEventTimers.values())clearTimeout(event.timer);
        scriptTimers.clear();scriptEventTimers.clear();
      },8000));
      const parent=objects.find(item=>item.id===script.parentId)||ui.find(item=>item.id===script.parentId);
      scriptWorker.postMessage({
        type:'run',id,source:String(script.source||''),
        context:{
          scriptName:String(script.name||'Script'),scriptType:String(script.type||'LocalScript'),
          parentId:script.parentId||null,parentKind:script.parentKind||null,parentName:parent?.name||parent?.kind||script.parentKind||'Parent',
          objects:sceneContext,ui:uiContext,gravity,playerName:'Player'
        }
      });
    }
  };
  scriptWorker.onmessage=event=>{
    const data=event.data||{};
    if(data.type==='ready'){sendScripts();return}
    if(data.type==='instance'){applyScriptInstance(data.item);return}
    if(data.type==='stats'){updatePlayerList(data.player,data.stats);return}
    if(data.type==='output'){
      if(data.level==='error')showScriptStatus(data.text||'A creator script reported an error.',true);
      else if(data.level==='warn')showScriptStatus(data.text||'A creator script warning was reported.');
      return;
    }
    if(data.type==='error')showScriptStatus(data.message||'A creator script failed to run.',true);
    if(data.type==='done'&&data.id){
      if(data.eventId){
        const event=scriptEventTimers.get(String(data.eventId));
        event?.pending.delete(String(data.id));
        if(event&&!event.pending.size){clearTimeout(event.timer);scriptEventTimers.delete(String(data.eventId))}
        return;
      }
      clearTimeout(scriptTimers.get(String(data.id)));scriptTimers.delete(String(data.id));
    }
  };
  scriptWorker.onerror=event=>{
    showScriptStatus(event.message||'The creator script worker stopped unexpectedly.',true);
    scriptWorker?.terminate();scriptWorker=null;activeScriptIds.clear();
    for(const timer of scriptTimers.values())clearTimeout(timer);
    for(const event of scriptEventTimers.values())clearTimeout(event.timer);
    scriptTimers.clear();scriptEventTimers.clear();
  };
}
function resize(){
  if(!renderer||!camera)return;
  const width=stage.clientWidth,height=stage.clientHeight;
  if(!width||!height)return;
  renderer.setSize(width,height,false);composer?.setSize(width,height);bloomPass?.setSize(width,height);
  camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();
}
function boundsForPlayer(x,y,z){
  return new THREE.Box3(new THREE.Vector3(x-PLAYER_RADIUS,y,z-PLAYER_RADIUS),new THREE.Vector3(x+PLAYER_RADIUS,y+PLAYER_HEIGHT,z+PLAYER_RADIUS));
}
function collidesAt(x,y,z){
  const playerBounds=boundsForPlayer(x,y,z);
  return colliderBounds.some(bounds=>bounds.max.y>y+.05&&bounds.min.y<y+PLAYER_HEIGHT&&bounds.intersectsBox(playerBounds));
}
function tryStep(x,z){
  if(!grounded)return false;
  const top=colliderBounds
    .filter(bounds=>bounds.max.y>player.position.y+.02&&bounds.max.y<=player.position.y+.45&&bounds.min.y<player.position.y+.2&&bounds.max.x>x-PLAYER_RADIUS&&bounds.min.x<x+PLAYER_RADIUS&&bounds.max.z>z-PLAYER_RADIUS&&bounds.min.z<z+PLAYER_RADIUS)
    .reduce((highest,bounds)=>Math.max(highest,bounds.max.y),-Infinity);
  if(!Number.isFinite(top)||collidesAt(x,top,z))return false;
  player.position.y=top;jumpVelocity=0;return true;
}
function moveHorizontal(dx,dz){
  let nextX=player.position.x+dx;
  if(!collidesAt(nextX,player.position.y,player.position.z)||tryStep(nextX,player.position.z))player.position.x=nextX;
  let nextZ=player.position.z+dz;
  if(!collidesAt(player.position.x,player.position.y,nextZ)||tryStep(player.position.x,nextZ))player.position.z=nextZ;
  player.position.x=THREE.MathUtils.clamp(player.position.x,-500,500);
  player.position.z=THREE.MathUtils.clamp(player.position.z,-500,500);
}
function updateGround(deltaY){
  if(jumpVelocity>0)return false;
  const origin=new THREE.Vector3(player.position.x,player.position.y+.25,player.position.z);
  const distance=Math.max(.3,-deltaY+.25);
  const raycaster=new THREE.Raycaster(origin,new THREE.Vector3(0,-1,0),0,distance);
  const hits=raycaster.intersectObjects(colliders,false);
  const hit=hits.find(result=>result.face&&result.object.visible);
  if(hit&&hit.distance<=-deltaY+.25){
    player.position.y=origin.y-hit.distance;
    jumpVelocity=0;return true;
  }
  return false;
}
function updateCeiling(deltaY){
  if(deltaY<=0)return;
  const origin=new THREE.Vector3(player.position.x,player.position.y+PLAYER_HEIGHT-.1,player.position.z);
  const raycaster=new THREE.Raycaster(origin,new THREE.Vector3(0,1,0),0,deltaY+.12);
  const hit=raycaster.intersectObjects(colliders,false).find(result=>result.face&&result.object.visible);
  if(hit&&hit.distance<=deltaY+.1){player.position.y=origin.y+hit.distance-PLAYER_HEIGHT;jumpVelocity=0}
}
function animate(now=performance.now()){
  frame=requestAnimationFrame(animate);
  const delta=Math.min((now-lastFrameTime)/1000,.05);lastFrameTime=now;
  if(!player)return;
  const direction=new THREE.Vector3(Number(held.has('right'))-Number(held.has('left')),0,Number(held.has('back'))-Number(held.has('forward')));
  const moving=direction.lengthSq()>0;
  if(moving){
    direction.normalize();moveHorizontal(direction.x*7*delta,direction.z*7*delta);
    player.rotation.y=Math.atan2(direction.x,direction.z);
    player.userData.limbs.forEach((limb,index)=>{limb.rotation.x=Math.sin(now*.012+(index%2)*Math.PI)*.42});
  }else player.userData.limbs.forEach(limb=>{limb.rotation.x*=.8});
  const deltaY=jumpVelocity*delta-.5*gravity*delta*delta;
  jumpVelocity-=gravity*delta;
  const wasGrounded=grounded;
  player.position.y+=deltaY;
  updateCeiling(deltaY);
  grounded=updateGround(deltaY);
  if(!grounded&&wasGrounded&&jumpVelocity<0)grounded=updateGround(0);
  if(player.position.y< -100){player.position.copy(spawnPoint);jumpVelocity=0;grounded=false}
  const cameraPart=[...sceneObjectMap.values()].find(object=>object.userData?.rewindKind==='camera'&&object.visible);
  if(cameraPart){
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(cameraPart.quaternion);
    camera.position.lerp(cameraPart.position,Math.min(1,delta*5));
    camera.lookAt(cameraPart.position.clone().addScaledVector(direction,12));
  }else{
    const target=new THREE.Vector3(player.position.x,player.position.y+2,player.position.z);
    camera.position.lerp(new THREE.Vector3(target.x,target.y+4.5,target.z+9),Math.min(1,delta*4));
    camera.lookAt(target);
  }
  if(bloomPass?.enabled)composer.render();
  else renderer.render(scene,camera);
}
function readSpawn(snapshot,legacy){
  const spawn=(snapshot.objects||[]).find(item=>item.kind==='spawn'&&item.visible!==false);
  if(spawn){
    const position=Array.isArray(spawn.position)?spawn.position:[0,0,0];
    const size=Array.isArray(spawn.size)?spawn.size:[1,1,1];
    return new THREE.Vector3(position[0]||0,(position[1]||0)+Math.max(.16,.08*(Number(size[1])||1)),position[2]||0);
  }
  const settings=snapshot.settings||{};
  const configured=settings.spawn;
  if(Array.isArray(configured)&&configured.length>=3)return new THREE.Vector3(...configured.slice(0,3).map(value=>Number(value)||0));
  if(configured&&Array.isArray(configured.position))return new THREE.Vector3(...configured.position.slice(0,3).map(value=>Number(value)||0));
  return legacy?new THREE.Vector3(0,0,6):new THREE.Vector3(0,2,6);
}
function addLegacyFloor(){
  const floor=new THREE.Mesh(
    new THREE.BoxGeometry(200,.2,200),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,colorWrite:false,depthWrite:false})
  );
  floor.position.y=-.1;scene.add(floor);
  registerCollider(floor,{kind:'block',anchored:true,visible:true});
}
async function loadPlace(){
  if(!placeId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(placeId))throw new Error('This experience link is invalid.');
  const response=await fetch(`${apiBase}/api/places?id=${encodeURIComponent(placeId)}`,{credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Could not load experience (${response.status}).`);
  place=data.place;
  if(params.get('client')!=='1')fetch(`${apiBase}/api/places`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'visit',placeId}),credentials:'include'}).catch(()=>{});
  $('#place-name').textContent=place.name;$('#sidebar-place-name').textContent=place.name;
  $('#place-owner').textContent=`by ${place.owner_username}`;
  $('#place-description').textContent=place.description||'Explore this community-made world.';
  $('#place-genre').textContent=place.genre||'All';
  $('#creator-link').href=`../users/${encodeURIComponent(place.owner_id)}`;
  document.title=`${place.name} · REWIND`;
  const snapshot=typeof place.scene==='string'?JSON.parse(place.scene):place.scene||{};
  const legacy=Number(snapshot.version||1)<2;
  gravity=THREE.MathUtils.clamp(Number.isFinite(Number(snapshot.settings?.gravity))?Number(snapshot.settings.gravity):18,0,80);
  spawnPoint=readSpawn(snapshot,legacy);
  if(legacy)addLegacyFloor();
  for(const item of Array.isArray(snapshot.objects)?snapshot.objects:[]){
    try{if(item.kind==='rig')addRig(item,legacy);else await addCatalogItem(item,legacy)}
    catch(error){showError(`Some creator content could not load: ${error.message}`)}
  }
  renderScreenUi(snapshot.ui);
  player=addAvatar();
  grounded=updateGround(0);
  updatePlayerList();
  runPlaceScripts(snapshot);
  $('#player-canvas').focus({preventScroll:true});
  if(!message.classList.contains('error')){message.classList.remove('visible');message.textContent=''}
  animate();
}
function addRig(item,legacy=false){
  const root=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0x8e7ae3}),dark=new THREE.MeshStandardMaterial({color:0x39364e});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(1.25,1.5,.65),skin);torso.position.y=2.1;root.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.51,20,16),new THREE.MeshStandardMaterial({color:0xf0c6aa}));head.position.y=3.25;root.add(head);
  for(const [name,x,y,material] of [['LeftArm',-.88,2.35,skin],['RightArm',.88,2.35,skin],['LeftLeg',-.35,1,dark],['RightLeg',.35,1,dark]]){
    const part=new THREE.Mesh(new THREE.BoxGeometry(name.includes('Arm')?.46:.53,name.includes('Arm')?1.15:1.2,.55),material);part.position.set(x,y-.47,0);root.add(part);
  }
  root.name=item.name||'AvatarRig';root.visible=item.visible!==false;applyTransform(root,item,legacy);scene.add(root);
  if(item.id)sceneObjectMap.set(String(item.id),root);
}
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x9fb7d6);
  camera=new THREE.PerspectiveCamera(58,1,.1,1200);
  sky=new Sky();sky.scale.setScalar(450000);scene.add(sky);
  composer=new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  bloomPass=new UnrealBloomPass(new THREE.Vector2(1,1),.35,.65,.86);
  composer.addPass(bloomPass);composer.addPass(new OutputPass());
  addLighting();new ResizeObserver(resize).observe(stage);resize();
  document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>held.clear());
  $('#player-list-toggle').addEventListener('click',()=>{
    const button=$('#player-list-toggle'),panel=$('#player-list'),open=panel.hidden;
    panel.hidden=!open;button.setAttribute('aria-expanded',String(open));
  });
  document.querySelectorAll('[data-control]').forEach(button=>{
    const control=button.dataset.control;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(control==='jump')jump();setControl(control,true)});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>setControl(control,false));
  });
  window.addEventListener('pagehide',()=>{
    cancelAnimationFrame(frame);
    for(const timer of scriptTimers.values())clearTimeout(timer);
    for(const event of scriptEventTimers.values())clearTimeout(event.timer);
    scriptEventTimers.clear();
    scriptWorker?.postMessage({type:'stop'});scriptWorker?.terminate();scriptWorker=null;
  });
  await loadPlace();
  applyEnvironment(typeof place.scene==='string'?JSON.parse(place.scene).environment:place.scene?.environment);
}catch(error){showError(error.message)}
