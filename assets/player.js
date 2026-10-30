import './config.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const apiBase=(window.REWIND_CONFIG?.apiBase||(location.hostname==='localhost'||location.hostname==='127.0.0.1'?'':'https://api.rwd.2bd.net')).replace(/\/$/,'');
const $=selector=>document.querySelector(selector);
const canvas=$('#player-canvas'),stage=$('.player-stage'),message=$('#player-message');
const params=new URLSearchParams(location.search),placeId=params.get('id');
const held=new Set(),loader=new GLTFLoader(),obstacles=[];
let renderer,scene,camera,player,place,frame=0,jumpVelocity=0,lastFrameTime=performance.now();
const moveKeys={forward:['w','z'],back:['s'],left:['q','a'],right:['d']};
const controls=new Set(['forward','back','left','right','jump']);

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
function onKeyDown(event){
  const key=event.key.toLowerCase();
  const control=Object.entries(moveKeys).find(([,keys])=>keys.includes(key))?.[0]||(key===' '||key==='spacebar'?'jump':null);
  if(!control||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;
  event.preventDefault();
  if(control==='jump'&&!held.has('jump')&&player.position.y<=0.001)jumpVelocity=8;
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
  root.position.set(0,0,6);root.rotation.y=Math.PI;
  scene.add(root);
  return root;
}
function addFloor(){
  scene.add(new THREE.HemisphereLight(0xb8c4ff,0x34313a,2.1));
  const light=new THREE.DirectionalLight(0xffe7ce,2.4);light.position.set(-8,16,9);scene.add(light);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x171921,roughness:.94}));floor.rotation.x=-Math.PI/2;floor.position.y=-.08;floor.receiveShadow=true;scene.add(floor);
  const grid=new THREE.GridHelper(80,80,0x514b6c,0x292b37);grid.position.y=-.03;scene.add(grid);
}
function addPart(item){
  let geometry,color=Number(item.color)||0x8980d8;
  if(item.kind==='sphere')geometry=new THREE.SphereGeometry(1.5,32,20);
  else if(item.kind==='pyramid')geometry=new THREE.ConeGeometry(2,3.5,4);
  else geometry=new THREE.BoxGeometry(3,2.5,3);
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.6,metalness:.03}));
  mesh.name=item.name||item.kind||'Object';
  if(Array.isArray(item.position))mesh.position.fromArray(item.position);
  if(Array.isArray(item.rotation))mesh.rotation.fromArray(item.rotation);
  if(Array.isArray(item.scale))mesh.scale.fromArray(item.scale);
  mesh.castShadow=true;mesh.receiveShadow=true;
  scene.add(mesh);
  trackObstacle(mesh);
}
function trackObstacle(object){
  object.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(object);
  if(bounds.max.y>.15&&bounds.min.y<5)obstacles.push(bounds);
}
function addRig(item){
  const root=new THREE.Group(),skin=new THREE.MeshStandardMaterial({color:0x8e7ae3}),dark=new THREE.MeshStandardMaterial({color:0x39364e});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(1.25,1.5,.65),skin);torso.position.y=2.1;root.add(torso);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.51,20,16),new THREE.MeshStandardMaterial({color:0xf0c6aa}));head.position.y=3.25;root.add(head);
  for(const [name,x,y,material] of [['LeftArm',-.88,2.35,skin],['RightArm',.88,2.35,skin],['LeftLeg',-.35,1,dark],['RightLeg',.35,1,dark]]){
    const part=new THREE.Mesh(new THREE.BoxGeometry(name.includes('Arm')?.46:.53,name.includes('Arm')?1.15:1.2,.55),material);part.position.set(x,y-.47,0);root.add(part);
  }
  root.name=item.name||'AvatarRig';
  if(Array.isArray(item.position))root.position.fromArray(item.position);
  if(Array.isArray(item.rotation))root.rotation.fromArray(item.rotation);
  if(Array.isArray(item.scale))root.scale.fromArray(item.scale);
  scene.add(root);trackObstacle(root);
}
function safeModelUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}
}
async function addCatalogItem(item){
  if(!item.catalogAsset)return addPart(item);
  const assetId=item.catalogAsset.id;
  if(!assetId)throw new Error(`“${item.name||'An asset'}” has no published catalog asset reference.`);
  const assetResponse=await fetch(`${apiBase}/api/assets?id=${encodeURIComponent(assetId)}`,{credentials:'include'});
  const assetData=await assetResponse.json().catch(()=>({}));
  if(!assetResponse.ok)throw new Error(assetData.error||`Could not load asset (${assetResponse.status}).`);
  const asset=assetData.asset;
  if(!asset)return addPart(item);
  if(asset.asset_type==='model'){
    const url=safeModelUrl(asset.public_url);
    if(!url)throw new Error(`The model “${asset.name||item.name}” has no secure preview URL.`);
    const loaded=await loader.loadAsync(url),model=loaded.scene;
    model.name=item.name||asset.name||'Model';
    model.traverse(child=>{if(child.isMesh){child.castShadow=true;child.receiveShadow=true}});
    if(Array.isArray(item.position))model.position.fromArray(item.position);
    if(Array.isArray(item.rotation))model.rotation.fromArray(item.rotation);
    if(Array.isArray(item.scale))model.scale.fromArray(item.scale);
    scene.add(model);trackObstacle(model);return;
  }
  if(asset.asset_type==='decal'){
    const url=safeModelUrl(asset.public_url);
    if(!url)throw new Error(`The decal “${asset.name||item.name}” has no secure preview URL.`);
    const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
    const decal=new THREE.Mesh(new THREE.PlaneGeometry(3,3),material);decal.name=item.name||asset.name||'Decal';
    if(Array.isArray(item.position))decal.position.fromArray(item.position);
    if(Array.isArray(item.rotation))decal.rotation.fromArray(item.rotation);
    if(Array.isArray(item.scale))decal.scale.fromArray(item.scale);
    scene.add(decal);
    new THREE.TextureLoader().load(url,texture=>{material.map=texture;material.needsUpdate=true},undefined,()=>showError(`Could not load decal: ${asset.name||item.name}`));
    return;
  }
  addPart({...item,kind:'sphere',color:0xe4bd65});
}
function renderScreenUi(items){
  const root=$('#play-ui');root.replaceChildren();
  if(!Array.isArray(items))return;
  for(const item of items){
    const element=document.createElement(item.type==='TextButton'?'button':'div');
    element.className='play-ui-item';element.textContent=item.text||item.name||item.type||'';
    element.style.left=`${Math.max(0,Number(item.x)||0)}px`;element.style.top=`${Math.max(0,Number(item.y)||0)}px`;
    element.style.width=`${Math.max(25,Number(item.width)||160)}px`;element.style.height=`${Math.max(20,Number(item.height)||42)}px`;
    if(/^#[0-9a-f]{6}$/i.test(item.color||''))element.style.backgroundColor=`${item.color}dd`;
    element.disabled=item.type==='TextButton';
    root.append(element);
  }
}
function resize(){
  if(!renderer||!camera)return;
  const width=stage.clientWidth,height=stage.clientHeight;
  renderer.setSize(width,height,false);camera.aspect=width/Math.max(height,1);camera.updateProjectionMatrix();
}
function animate(now=performance.now()){
  frame=requestAnimationFrame(animate);
  const delta=Math.min((now-lastFrameTime)/1000,.05);lastFrameTime=now;
  const direction=new THREE.Vector3(Number(held.has('right'))-Number(held.has('left')),0,Number(held.has('back'))-Number(held.has('forward')));
  if(direction.lengthSq()){
    direction.normalize();
    const next=player.position.clone().addScaledVector(direction,7*delta);
    next.x=THREE.MathUtils.clamp(next.x,-95,95);next.z=THREE.MathUtils.clamp(next.z,-95,95);
    const playerBounds=new THREE.Box3(new THREE.Vector3(next.x-.42,next.y,next.z-.42),new THREE.Vector3(next.x+.42,next.y+2.7,next.z+.42));
    if(!obstacles.some(bounds=>bounds.intersectsBox(playerBounds)))player.position.copy(next);
    player.rotation.y=Math.atan2(direction.x,direction.z);
    player.userData.limbs.forEach((limb,index)=>{limb.rotation.x=Math.sin(performance.now()*.012+(index%2)*Math.PI)*.42});
  }else player.userData.limbs.forEach(limb=>{limb.rotation.x*=.8});
  player.position.y=Math.max(0,player.position.y+jumpVelocity*delta);
  jumpVelocity-=20*delta;
  if(player.position.y===0)jumpVelocity=0;
  const target=new THREE.Vector3(player.position.x,player.position.y+2,player.position.z);
  camera.position.lerp(new THREE.Vector3(target.x,target.y+4.5,target.z+9),Math.min(1,delta*4));
  camera.lookAt(target);
  renderer.render(scene,camera);
}
async function loadPlace(){
  if(!placeId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(placeId))throw new Error('This experience link is invalid.');
  const response=await fetch(`${apiBase}/api/places?id=${encodeURIComponent(placeId)}`,{credentials:'include'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`Could not load experience (${response.status}).`);
  place=data.place;
  $('#place-name').textContent=place.name;$('#sidebar-place-name').textContent=place.name;
  $('#place-owner').textContent=`by ${place.owner_username}`;
  $('#place-description').textContent=place.description||'Explore this community-made world.';
  $('#place-genre').textContent=place.genre||'All';
  $('#creator-link').href=`../users/${encodeURIComponent(place.owner_id)}`;
  document.title=`${place.name} · REWIND`;
  const snapshot=typeof place.scene==='string'?JSON.parse(place.scene):place.scene;
  const objects=Array.isArray(snapshot?.objects)?snapshot.objects:[];
  for(const item of objects){
    try{if(item.kind==='rig')addRig(item);else await addCatalogItem(item)}
    catch(error){showError(`Some creator content could not load: ${error.message}`)}
  }
  renderScreenUi(snapshot?.ui);
  player=addAvatar();
  $('#player-canvas').focus({preventScroll:true});
  if(!message.classList.contains('error')){message.classList.remove('visible');message.textContent=''}
  animate();
}
try{
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x11131a);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color(0x11131a);scene.fog=new THREE.Fog(0x11131a,35,100);
  camera=new THREE.PerspectiveCamera(58,1,.1,400);
  addFloor();new ResizeObserver(resize).observe(stage);resize();
  document.addEventListener('keydown',onKeyDown);document.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>held.clear());
  document.querySelectorAll('[data-control]').forEach(button=>{
    const control=button.dataset.control;
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(control==='jump'&&player?.position.y<=.001)jumpVelocity=8;setControl(control,true)});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(name,()=>setControl(control,false));
  });
  window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
  await loadPlace();
}catch(error){showError(error.message)}
