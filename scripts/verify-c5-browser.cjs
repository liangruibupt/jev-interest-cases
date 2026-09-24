const fs=require("node:fs"),path=require("node:path"),os=require("node:os"),assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const baseUrl=process.env.JEV_UI_URL||"http://127.0.0.1:5174";
function playwright(){
  for(const dir of fs.readdirSync(path.join(os.homedir(),".npm/_npx"))){
    try{return require(path.join(os.homedir(),".npm/_npx",dir,"node_modules/playwright-core"))}catch{}
  }
  throw new Error("Playwright not available");
}
let browser;
async function main(){
  browser=await playwright().chromium.launch({executablePath:process.env.CHROME_PATH||"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true});
  await context.addInitScript(()=>{
    window.__audioContexts=0;
    const Native=window.AudioContext;
    window.__audioInstances=[];
    window.AudioContext=class extends Native {constructor(...args){super(...args);window.__audioContexts++;window.__audioInstances.push(this)}};
  });
  const page=await context.newPage(), errors=[], requests=[];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("request",r=>{if(r.url().includes("/api/c5/interpret"))requests.push(r.url())});
  await page.goto(`${baseUrl}/c5`);
  await page.getByRole("heading",{name:"语义音乐盒",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.__audioContexts),0);
  assert.equal(requests.length,0);
  assert(await page.getByText("手动预置音色",{exact:true}).isVisible());
  const canvas=page.getByRole("img",{name:/四小节乐谱/});
  const pixels=await canvas.evaluate(c=>{
    const data=c.getContext("2d").getImageData(0,0,c.width,c.height).data, colors=new Set();
    for(let i=0;i<data.length;i+=16)colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
    return colors.size;
  });
  assert(pixels>30,"Piano roll is blank");
  async function interpret(){
    const pending=page.waitForResponse(r=>r.url().includes("/api/c5/interpret")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"解读声音",exact:true}).click();
    const response=await pending;assert.equal(response.status(),200);
    await page.getByText("Jev 音色",{exact:true}).waitFor();
    return response.json();
  }
  const rain=await interpret();
  assert.equal(rain.mix.percussion,false);
  assert.equal(rain.mix.timbre,"warm");
  assert.equal(await page.evaluate(()=>window.__audioContexts),0);
  const images=path.join(root,"docs/screenshots"), examples=path.join(root,"docs/examples");
  fs.mkdirSync(images,{recursive:true});fs.mkdirSync(examples,{recursive:true});
  await page.screenshot({path:path.join(images,"c5-sound-studio.png"),fullPage:true});
  await page.getByRole("button",{name:"播放",exact:true}).click();
  await page.getByRole("button",{name:"停止",exact:true}).waitFor();
  await page.waitForFunction(()=>window.__audioContexts===1&&document.querySelector(".sound-playhead").style.opacity==="1");
  const initial=await page.locator(".sound-playhead").evaluate(e=>parseFloat(e.style.left));
  await page.waitForFunction(x=>parseFloat(document.querySelector(".sound-playhead").style.left)>x+1,initial,{timeout:5000}).catch(async e=>{
    console.log(JSON.stringify(await page.evaluate(()=>({contexts:window.__audioInstances.map(c=>({state:c.state,time:c.currentTime})),left:document.querySelector(".sound-playhead").style.left,elapsed:document.querySelector(".sound-time").textContent}))));
    throw e;
  });
  const moved=await page.locator(".sound-playhead").evaluate(e=>parseFloat(e.style.left));
  assert(moved>initial,"Playhead is not moving");
  await page.getByRole("button",{name:"停止",exact:true}).click();
  const beforeLocal=requests.length;
  const pendingDownload=page.waitForEvent("download");
  await page.getByRole("button",{name:"WAV",exact:true}).click();
  const download=await pendingDownload;
  const wavFile=path.join(examples,"c5-rain.wav");
  await download.saveAs(wavFile);
  const wav=fs.readFileSync(wavFile);
  assert.equal(wav.toString("ascii",0,4),"RIFF");
  assert.equal(wav.toString("ascii",8,12),"WAVE");
  const channels=wav.readUInt16LE(22),rate=wav.readUInt32LE(24),dataBytes=wav.readUInt32LE(40);
  assert.equal(channels,2);assert.equal(rate,44100);assert.equal(dataBytes,wav.length-44);
  let peak=0,sum=0;
  for(let i=44;i<wav.length;i+=2){const v=wav.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(v));sum+=v*v}
  const rms=Math.sqrt(sum/(dataBytes/2));
  assert(peak>0.01&&peak<=0.83,"Empty or clipping WAV");
  assert(rms>0.001,"WAV is effectively silent");
  await page.getByRole("slider",{name:"明亮度",exact:true}).focus();
  await page.getByRole("slider",{name:"明亮度",exact:true}).press("End");
  await page.getByText("Jev 音色 · 已手动调整",{exact:true}).waitFor();
  const oldRoll=await canvas.evaluate(c=>c.toDataURL());
  await page.getByRole("button",{name:"本地变奏",exact:true}).click();
  await page.waitForTimeout(80);
  const newRoll=await canvas.evaluate(c=>c.toDataURL());
  assert.notEqual(oldRoll,newRoll);
  assert.equal(requests.length,beforeLocal,"Local controls unexpectedly called Jev");
  await page.getByRole("button",{name:"夜跑脉冲",exact:true}).click();
  const run=await interpret();
  assert.equal(run.mix.bpm,124);assert.equal(run.mix.percussion,true);
  await page.screenshot({path:path.join(images,"c5-sound-run.png"),fullPage:true});
  await page.getByRole("button",{name:"恢复音色",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
  assert.equal(mobileOverflow,false);
  assert(await page.getByRole("combobox",{name:"场景",exact:true}).isVisible());
  await page.screenshot({path:path.join(images,"c5-sound-mobile.png"),fullPage:true});
  await page.route("**/api/c5/interpret",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{status:503,code:"test",message:"测试：服务暂不可用"}})}));
  await page.getByRole("button",{name:"玻璃温室",exact:true}).click();
  await page.getByRole("button",{name:"解读声音",exact:true}).click();
  await page.getByRole("alert").waitFor();
  assert(await page.getByRole("alert").innerText().then(t=>t.includes("服务暂不可用")));
  assert(await page.getByRole("button",{name:"解读声音",exact:true}).isEnabled());
  await page.unroute("**/api/c5/interpret");
  assert.deepEqual(errors,[]);
  const report={
    url:`${baseUrl}/c5`,cases:["initial/manual/no-autoplay","real cached Jev presets","piano roll nonblank","play/stop and moving cursor","real WAV export","local controls without inference","explicit 124 BPM","mobile layout","service-error recovery (mocked 503)"],
    realUiInterpretations:2,canvasColors:pixels,mobileOverflow,pageErrors:errors,
    audio:{path:"docs/examples/c5-rain.wav",sampleRate:rate,channels,durationSeconds:dataBytes/(rate*channels*2),peak,rms,bytes:wav.length}
  };
  fs.mkdirSync(path.join(root,"docs/results"),{recursive:true});
  fs.writeFileSync(path.join(root,"docs/results/c5-browser-qa.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  await browser.close();
}
main().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
