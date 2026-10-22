const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function makeDocument(){
  const classes=new Set(), properties=new Map();
  return {defaultView:{closed:false},querySelectorAll:()=>[],body:{
    classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name),contains:name=>classes.has(name),remove:(...names)=>names.forEach(n=>classes.delete(n))},
    style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k),getPropertyValue:k=>properties.get(k)}
  }};
}
function setup(){
  const main=makeDocument(),popout=makeDocument();
  const sandbox={module:{exports:{}},document:main,activeDocument:popout,window:{requestAnimationFrame:()=>1,cancelAnimationFrame(){}},
    require:id=>id==='obsidian'?{Plugin:class {},PluginSettingTab:class {}}:id==='@codemirror/view'?{ViewPlugin:{fromClass:()=>({})}}:{}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../main.js'),'utf8'),sandbox);
  const plugin=new sandbox.module.exports.default();
  plugin.app={workspace:{iterateAllLeaves:cb=>cb({view:{containerEl:{ownerDocument:popout}}})}};
  plugin.saveData=async()=>{};
  return {plugin,main,popout,sandbox};
}
test('settings apply immediately to main and popout documents and survive focus changes',async()=>{
  const {plugin,main,popout,sandbox}=setup();
  let finish;plugin.saveData=()=>new Promise(resolve=>{finish=resolve;});
  const saving=plugin.updateSettings({showGuides:false,showFoldArrows:false,colorGuidesByHeading:false,guideLineWidth:1.7});
  for(const doc of [main,popout]){
    assert.equal(doc.body.classList.contains('sts-indentation-enabled'),true);
    assert.equal(doc.body.classList.contains('sts-indentation-guides-enabled'),false);
    assert.equal(doc.body.classList.contains('sts-indentation-fold-arrows-enabled'),false);
    assert.equal(doc.body.classList.contains('sts-indentation-colored-guides'),false);
    assert.equal(doc.body.style.getPropertyValue('--sts-outline-line-width'),'1.7px');
  }
  finish();await saving;plugin.saveData=async()=>{};
  sandbox.activeDocument=main;
  await plugin.updateSettings({showGuides:true,showFoldArrows:true});
  assert.equal(popout.body.classList.contains('sts-indentation-guides-enabled'),true);
  await plugin.updateSettings({enableIndentation:false});
  for(const doc of [main,popout])assert.equal(doc.body.classList.contains('sts-indentation-guides-enabled'),false);
  plugin.onunload();
  for(const doc of [main,popout])assert.equal(doc.body.style.getPropertyValue('--sts-outline-line-width'),undefined);
});
test('reading guides bridge direct and wrapped horizontal rules in one segment',()=>{
  const {plugin}=setup();
  const block=(kind,top,bottom)=>({matches:s=>kind==='hr'||kind==='el-hr',querySelector:()=>kind==='wrapped'?{}:null,getBoundingClientRect:()=>({top,bottom}),style:{values:{},setProperty(k,v){this.values[k]=v;},removeProperty(k){delete this.values[k];}}});
  for(const kind of ['hr','el-hr','wrapped']){
    const previous=block('p',0,20), separator=block(kind,30,32), next=block('h2',60,90);
    assert.equal(plugin.previousReadingGuideBlock([previous,separator,next],2),previous);
    plugin.bridgeReadingBlockGap([previous,separator,next],2);
    assert.equal(next.style.values['--sts-outline-extend-before'],'40px');
  }
});
