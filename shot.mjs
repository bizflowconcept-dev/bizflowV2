import { spawn } from 'node:child_process'
import fs from 'node:fs'
const [route, out, email='ceo.demo@etranzact.com', role='md', W='360'] = process.argv.slice(2)
const ch = spawn('chromium', ['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=9334','about:blank'],{stdio:'ignore'})
await new Promise(r=>setTimeout(r,2500))
const tabs = await (await fetch('http://localhost:9334/json')).json()
const ws = new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r)
let id=0; const pend=new Map(); ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id)}}
const send=(method,params={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method,params}))})
await send('Emulation.setDeviceMetricsOverride',{width:+W,height:800,deviceScaleFactor:1,mobile:true})
await send('Page.navigate',{url:'http://localhost:3000/product'}); await new Promise(r=>setTimeout(r,1500))
await send('Runtime.evaluate',{expression:`localStorage.setItem('bf-business-session',JSON.stringify({slug:'etranzact',email:'${email}'}));localStorage.setItem('bf-role','${role}')`})
await send('Page.navigate',{url:'http://localhost:3000'+route}); await new Promise(r=>setTimeout(r,3000))
const h=(await send('Runtime.evaluate',{expression:'document.documentElement.scrollHeight',returnByValue:true})).result.value
await send('Emulation.setDeviceMetricsOverride',{width:+W,height:Math.min(h,3000),deviceScaleFactor:1,mobile:true})
const s=await send('Page.captureScreenshot',{format:'png'})
fs.writeFileSync(out,Buffer.from(s.data,'base64')); ch.kill(); process.exit(0)
