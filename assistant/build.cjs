const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
(async()=>{
  let terser;
  const bundle=process.argv[2]||process.env.EQ_ASSISTANT_TERSER_BUNDLE;
  if(bundle){const context={};vm.createContext(context);vm.runInContext(fs.readFileSync(bundle,'utf8'),context,{timeout:5000});terser=context.Terser;}
  else terser=require('terser');
  const js=fs.readFileSync(path.join(__dirname,'assistant.js'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'assistant.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s*([{};])\s*/g,'$1').trim();
  const result=await terser.minify(js,{compress:true,mangle:true,format:{comments:false,inline_script:true}});
  const bundleJS='window.EyequipmentAssistantConfig = Object.assign({}, window.EyequipmentAssistantConfig, {styles:'+JSON.stringify(css)+'});\n'+result.code+'\n';
  fs.writeFileSync(path.join(__dirname,'../eyequipment-assistant.js'),bundleJS);
  const footer='<script>window.EyequipmentAssistantConfig = Object.assign({}, window.EyequipmentAssistantConfig, {styles:'+JSON.stringify(css)+'});</script>\n<script>\n'+result.code+'\n</script>\n';
  if(footer.length>49000)throw Error('Footer exceeds the build size budget');
  fs.writeFileSync(path.join(__dirname,'webflow-footer.html'),footer);
  console.log('Built self-contained footer:',footer.length,'characters');
})().catch(error=>{console.error(error);process.exitCode=1;});
