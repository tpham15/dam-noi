import { useRef, useState } from 'react';
import { API } from '../api/classroom.js';

async function toBase64(blob) {
  return new Promise((resolve,reject) => { const fr=new FileReader(); fr.onload=()=>resolve(String(fr.result).split(',')[1]); fr.onerror=reject; fr.readAsDataURL(blob); });
}

async function blobToWavBase64(blob) {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  const targetRate = 16000;
  const length = Math.ceil(decoded.duration * targetRate);
  const off = new OfflineAudioContext(1, length, targetRate);
  const src = off.createBufferSource(); src.buffer=decoded; src.connect(off.destination); src.start(0);
  const rendered = await off.startRendering();
  const samples = rendered.getChannelData(0);
  const buffer = new ArrayBuffer(44 + samples.length*2); const view=new DataView(buffer);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  ws(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); ws(8,'WAVE'); ws(12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,targetRate,true); view.setUint32(28,targetRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); ws(36,'data'); view.setUint32(40,samples.length*2,true);
  let o=44; for(const x of samples){const s=Math.max(-1,Math.min(1,x)); view.setInt16(o,s<0?s*0x8000:s*0x7fff,true); o+=2;}
  try{ctx.close();}catch{}
  let bin=''; for(const b of new Uint8Array(buffer)) bin+=String.fromCharCode(b); return btoa(bin);
}

export default function useVoiceRecorder({ token, userId, sessionId, onTranscript }) {
  const [recording,setRecording]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const recRef=useRef(null), streamRef=useRef(null), chunksRef=useRef([]), startRef=useRef(0);
  const supported = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';
  const cleanup=()=>{try{streamRef.current?.getTracks().forEach(t=>t.stop());}catch{} streamRef.current=null;};
  const start=async()=>{
    if(!supported||recording||busy)return; setError('');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true}); streamRef.current=stream;
      const mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':(MediaRecorder.isTypeSupported('audio/mp4')?'audio/mp4':'');
      const rec=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); recRef.current=rec; chunksRef.current=[];
      rec.ondataavailable=e=>{if(e.data?.size)chunksRef.current.push(e.data);};
      rec.onstop=async()=>{
        cleanup(); setRecording(false); const seconds=Math.max(0.2,Math.min(120,(Date.now()-startRef.current)/1000));
        const blob=new Blob(chunksRef.current,{type:rec.mimeType||'audio/mp4'}); chunksRef.current=[]; if(!blob.size)return;
        setBusy(true);
        try{
          let audio,contentType;
          try{audio=await blobToWavBase64(blob); contentType='audio/wav; codecs=audio/pcm; samplerate=16000';}
          catch{audio=await toBase64(blob); contentType=rec.mimeType||'audio/mp4';}
          const r=await fetch(`${API}/api/stt`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({audio,contentType,userId,sessionId})});
          const d=await r.json().catch(()=>({})); if(!r.ok)throw new Error(d.error||'STT error');
          if(!d.text||d.lowConfidence){setError('Toki chưa nghe rõ. Nói lại một lần nhé 🙂'); return;}
          onTranscript?.(String(d.text).trim(),seconds,d.confidence);
        }catch(e){setError('Chưa nghe được câu này. Thử lại hoặc gõ nhé.');}finally{setBusy(false);}
      };
      rec.onerror=()=>{cleanup();setRecording(false);setError('Micro gặp lỗi. Thử lại nhé.');};
      startRef.current=Date.now(); rec.start(); setRecording(true);
    }catch{cleanup();setError('Không mở được micro. Bạn có thể gõ câu trả lời.');}
  };
  const stop=()=>{if(recRef.current?.state==='recording')recRef.current.stop();};
  return { supported, recording, busy, error, setError, start, stop };
}
