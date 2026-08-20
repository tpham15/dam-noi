import React,{useEffect,useState} from 'react';
import {API,request,storage} from '../api/classroom.js';
import useVoiceRecorder from '../hooks/useVoiceRecorder.js';

const mmss=n=>`${Math.floor((n||0)/60)}:${String(Math.round((n||0)%60)).padStart(2,'0')}`;
const bandLabel={kids:'Kids',junior:'Junior',teen:'Teen'};
const missionIcon=t=>({guided:'🌱',roleplay:'🎭',story:'📖',presentation:'🎤',conversation:'💬'}[t]||'🎯');

export default function StudentApp({join=null}){
  const hasJoin=!!(join?.classCode&&join?.studentCode);
  // A printed/shared join link must always identify the student in that link.
  // Never let a remembered student session from this browser override it.
  const [token,setToken]=useState(()=>hasJoin?'':storage.getStudentToken());
  const [home,setHome]=useState(null);
  const [active,setActive]=useState(null);
  const [result,setResult]=useState(null);
  const load=async(t=token)=>{if(!t)return;try{setHome(await request('/api/classroom/student/home',{token:t}));}catch{storage.setStudentToken('');setToken('')}};
  useEffect(()=>{
    // Clear any old child session once when arriving through /join/....
    // After successful PIN login, the new student's token is stored normally.
    if(hasJoin) storage.setStudentToken('');
  },[]);
  useEffect(()=>{load()},[token]);
  if(!token)return <StudentLogin join={join} onLogin={t=>{
    // Once a join-link PIN login succeeds, leave /join/... behind.
    // Otherwise any reload/remount would treat this as a fresh join flow and
    // clear the newly-created student session again.
    if(hasJoin && window.location.pathname.startsWith('/join/')) {
      window.history.replaceState({}, '', '/student');
    }
    storage.setStudentToken(t);
    setToken(t);
  }}/>;
  if(active)return <MissionChat token={token} started={active} onDone={r=>{setActive(null);setResult(r);load()}}/>;
  if(result)return <Finish result={result} onBack={()=>setResult(null)}/>;
  if(!home)return <div className="cr"><div className="student-shell">Đang tải…</div></div>;
  return <div className="cr"><div className="student-shell">
    <div className="student-hero"><img src="/toki.png"/><div><h1 className="cr-title">Chào {home.student.displayName} 👋</h1><div className="cr-muted">🔥 {home.student.streakDays||0} ngày luyện tập · {bandLabel[home.student.ageBand]||''}</div></div></div>
    {home.progress&&<StudentJourney report={home.progress} ageBand={home.student.ageBand}/>} 
    <h2>Bài được giao</h2>
    {(home.assignments||[]).map(a=><div key={a.assignment_id} className={`mission-card ${a.attempt_status==='completed'?'done':''}`}>
      <div className="mission-title">{missionIcon(a.mission_type)} {a.title}</div>
      <div className="cr-muted">{a.description}</div>
      <div className="mission-meta"><span className="cr-pill">{a.mission_type}</span><span className="cr-pill">🎙 ~{Math.max(2,Math.round((a.target_speaking_seconds||60)/30))} phút</span>{a.attempt_status==='completed'&&<span className="cr-pill">{'⭐'.repeat(a.stars||1)}</span>}{a.attempt_status==='incomplete'&&<span className="cr-pill">Thử lại nhé</span>}</div>
      {a.attempt_status==='completed'?<button className="cr-btn secondary" disabled>Đã hoàn thành</button>:<button className="cr-btn" onClick={async()=>setActive(await request(`/api/classroom/assignments/${a.assignment_id}/start`,{token,method:'POST'}))}>{a.attempt_status==='incomplete'?'Luyện lại':'Bắt đầu nói'}</button>}
    </div>)}
    {!home.assignments?.length&&<div className="cr-card cr-center">Chưa có bài mới. Hẹn gặp lại sau nhé!</div>}
    <button className="cr-btn ghost" onClick={()=>{storage.setStudentToken('');setToken('')}}>Đăng xuất</button>
  </div></div>
}


function StudentJourney({report,ageBand}){
  const m=report.current||{};const delta=Number(report.comparison?.speakingDeltaSeconds||0);const seconds=Number(m.speakingSeconds||0);const speaking=seconds<60?`${Math.round(seconds)} giây`:`${Math.floor(seconds/60)} phút`;
  return <div className="cr-card student-journey"><div className="cr-row" style={{justifyContent:'space-between'}}><div><span className="cr-pill">🌱 7 ngày của bạn</span><h3>Hành trình speaking</h3></div>{delta>0&&<span className="journey-up">↗ +{delta<60?`${Math.round(delta)}s`:`${Math.round(delta/60)}p`}</span>}</div><div className={`journey-grid ${ageBand==='kids'?'kids':''}`}><div><b>{speaking}</b><span>đã nói</span></div><div><b>{m.missionsCompleted||0}</b><span>mission</span></div><div><b>{m.practiceSessions||0}</b><span>buổi luyện</span></div>{ageBand!=='kids'&&<div><b>{m.targets?.coveragePercent==null?'—':`${m.targets.coveragePercent}%`}</b><span>target</span></div>}</div>{report.achievements?.[0]&&<div className="journey-achievement">🏆 {report.achievements[0]}</div>}</div>
}

function StudentLogin({onLogin,join}){
  const prefilled=!!(join?.classCode&&join?.studentCode);
  const [classCode,setClassCode]=useState(join?.classCode||'');const [studentCode,setStudentCode]=useState(join?.studentCode||'');const [pin,setPin]=useState('');const [err,setErr]=useState('');
  const submit=async e=>{e.preventDefault();setErr('');try{const d=await request('/api/classroom/student/login',{method:'POST',body:{classCode,studentCode,pin,loginSource:prefilled?'join_link':'manual'}});onLogin(d.authToken);}catch(x){setErr(x.message||'Mã chưa đúng rồi — kiểm tra lại giúp Toki nhé!')}};
  return <div className="cr"><div className="student-shell" style={{paddingTop:'8vh'}}><div className="cr-card cr-center student-login-card-page"><img src="/toki.png" style={{width:100}}/><h1>Dám Nói Education</h1><p className="cr-muted">{prefilled?'Mã lớp và mã học sinh đã sẵn sàng. Chỉ cần nhập PIN nhé!':'Nhập thông tin giáo viên đã gửi cho bạn.'}</p><form className="cr-form" onSubmit={submit} style={{textAlign:'left'}}>{prefilled?<div className="prefilled-login"><div><span>Mã lớp</span><b>{classCode}</b></div><div><span>Mã học sinh</span><b>{studentCode}</b></div></div>:<><input className="cr-input login-big" placeholder="Mã lớp" value={classCode} onChange={e=>setClassCode(e.target.value.toUpperCase())}/><input className="cr-input login-big" placeholder="Mã học sinh" value={studentCode} onChange={e=>setStudentCode(e.target.value.toUpperCase())}/></>}<input className="cr-input login-big pin-input" autoFocus={prefilled} inputMode="numeric" placeholder="PIN" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,'').slice(0,6))}/>{err&&<div className="cr-error friendly">{err}</div>}<button type="submit" className="cr-btn big-start">Vào học 🎙️</button></form>{!prefilled&&<a href="/" className="cr-muted" style={{display:'inline-block',marginTop:14}}>← Quay lại</a>}</div></div></div>
}

function MissionIntro({mission,onStart}){
  const isKids=mission.ageBand==='kids';
  return <div className="cr"><div className="student-shell" style={{paddingTop:'5vh'}}><div className={`cr-card mission-intro ${isKids?'kids':''}`}>
    <div className="cr-center"><img src="/toki.png" style={{width:isKids?110:88}}/><div className="cr-pill">{bandLabel[mission.ageBand]} · Lớp {mission.grade||'—'}</div><h1>{missionIcon(mission.missionType)} {mission.title}</h1><p className="cr-muted">{mission.description}</p></div>
    <div className="intro-section"><b>{isKids?'🌟 Từ hôm nay':'🎯 Nhiệm vụ'}</b><p>{mission.learningObjective||'Hoàn thành cuộc hội thoại với Toki.'}</p></div>
    {(mission.targetVocab||[]).length>0&&<div className="intro-section"><b>🧩 {isKids?'Từ để thử nói':'Thử dùng những từ này'}</b><div className="target-chips">{mission.targetVocab.slice(0,isKids?4:6).map(v=><span key={v}>{v}</span>)}</div></div>}
    {!isKids&&(mission.targetPatterns||[]).length>0&&<div className="intro-section"><b>💬 Cách nói hôm nay</b><div className="target-chips pattern">{mission.targetPatterns.slice(0,3).map(v=><span key={v}>{v}</span>)}</div></div>}
    <button className="cr-btn big-start" onClick={onStart}>🎙 Bắt đầu</button>
  </div></div></div>
}

function MissionChat({token,started,onDone}){
  const m=started.mission;
  const [intro,setIntro]=useState(true);
  const [messages,setMessages]=useState([{who:'t',text:m.openingEn,vi:m.openingVi}]);
  const [input,setInput]=useState('');const [loading,setLoading]=useState(false);const [err,setErr]=useState('');const [chips,setChips]=useState([]);const [encouragement,setEncouragement]=useState('');
  const [progress,setProgress]=useState({turnCount:0,speakingSeconds:0,progressPercent:0,objectiveReached:false,shouldFinish:false,targetVocabUsed:[],targetPatternsUsed:[]});

  const speak=async text=>{if(!text)return;try{const r=await fetch(`${API}/api/tts`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});if(r.ok){const url=URL.createObjectURL(await r.blob());const a=new Audio(url);a.onended=()=>URL.revokeObjectURL(url);await a.play();return;}}catch{}try{if(window.speechSynthesis){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-US';u.rate=m.ageBand==='kids'?.84:m.ageBand==='junior'?.9:.94;window.speechSynthesis.speak(u);}}catch{}};

  const send=async(text,seconds=0)=>{const t=String(text||'').trim();if(!t||loading)return;setLoading(true);setErr('');setChips([]);setEncouragement('');setMessages(x=>[...x,{who:'u',text:t}]);try{
      const d=await request('/api/turn',{token,method:'POST',body:{userId:started.userId,sessionId:started.sessionId,text:t,secondsSpoken:seconds}});
      const reply=d.next_en||'Great! Let’s keep going.';setMessages(x=>[...x,{who:'t',text:reply,vi:d.vi_translation||''}]);setChips(Array.isArray(d.scaffold_chips)?d.scaffold_chips.slice(0,4):[]);setEncouragement(d.encouragement||'');
      if(d.missionProgress)setProgress({...d.missionProgress,targetVocabUsed:d.missionProgress.targetVocabUsed||[],targetPatternsUsed:d.missionProgress.targetPatternsUsed||[]});
      speak(reply);
    }catch(e){setErr(e.message)}finally{setLoading(false)}};

  const voice=useVoiceRecorder({token,userId:started.userId,sessionId:started.sessionId,onTranscript:(text,sec)=>send(text,sec)});
  const finish=async()=>{if(!progress.shouldFinish&&progress.turnCount<2&&!window.confirm('Mới nói chút xíu thôi, chắc kết thúc sớm chưa? 😊'))return;try{const d=await request(`/api/classroom/attempts/${started.attemptId}/finish`,{token,method:'POST'});onDone(d.item);}catch(e){setErr(e.message)}};
  const startMission=()=>{setIntro(false);setTimeout(()=>speak(m.openingEn),100)};
  if(intro)return <MissionIntro mission={m} onStart={startMission}/>;

  const usedVocab=progress.targetVocabUsed||[];const usedPatterns=progress.targetPatternsUsed||[];
  return <div className="cr"><div className="student-shell"><div className={`chat-wrap age-${m.ageBand}`}>
    <div className="chat-head"><div><b>{missionIcon(m.missionType)} {m.title}</b><div style={{fontSize:12,color:'#b8b0c7'}}>{progress.turnCount}/{m.targetTurns||6} lượt · {mmss(progress.speakingSeconds)} nói</div></div><button className={`cr-btn ${progress.shouldFinish?'':'ghost early-finish'}`} onClick={finish}>{progress.shouldFinish?'Hoàn thành 🎉':'Kết thúc sớm'}</button></div>
    <div className="mission-progress"><div style={{width:`${progress.progressPercent||0}%`}}/></div>
    <div className="chat-feed">
      <div className={`target-box ${m.ageBand==='kids'?'kids-hints':''}`}><b>{m.ageBand==='kids'?'💡 Toki gợi ý':'Thử dùng:'}</b><div className="target-mini">{(m.targetVocab||[]).slice(0,m.ageBand==='kids'?3:5).map(v=><span key={v} className={usedVocab.some(x=>String(x).toLowerCase()===String(v).toLowerCase())?'used':''}>{m.ageBand!=='kids'&&usedVocab.some(x=>String(x).toLowerCase()===String(v).toLowerCase())?'✓ ':''}{v}</span>)}</div>{m.ageBand!=='kids'&&(m.targetPatterns||[]).length>0&&<><b>Mẫu câu:</b><div className="target-mini">{m.targetPatterns.slice(0,3).map(v=><span key={v} className={usedPatterns.some(x=>String(x).toLowerCase()===String(v).toLowerCase())?'used':''}>{usedPatterns.some(x=>String(x).toLowerCase()===String(v).toLowerCase())?'✓ ':''}{v}</span>)}</div></>}</div>
      {messages.map((x,i)=><div key={i} className={`bubble ${x.who==='t'?'toki':'student'}`}>{x.text}{x.vi&&x.who==='t'?<div className="bubble-vi">{x.vi}</div>:null}</div>)}
      {encouragement&&<div className="mission-enc">✨ {encouragement}</div>}
      {progress.shouldFinish&&<div className="mission-achieved">🏆 Mission đạt mục tiêu rồi! Bạn có thể bấm <b>Hoàn thành</b>.</div>}
      {chips.length>0&&<div className="cr-row">{chips.map((c,i)=><button key={i} className="cr-btn secondary" onClick={()=>send(c,0)}>{c}</button>)}</div>}
      {loading&&<div className="bubble toki">Toki đang nghĩ…</div>}
    </div>
    <div className="chat-bottom"><div className="cr-center"><button className={`mic-button ${voice.recording?'on':''} ${(voice.busy||loading)?'processing':''}`} onClick={()=>voice.recording?voice.stop():voice.start()} disabled={voice.busy||loading}>{(voice.busy||loading)?<span className="mic-spinner"/>:voice.recording?'■':'🎙️'}</button><div className="mic-state-label">{(voice.busy||loading)?'Toki đang nghe…':voice.recording?'🔴 Đang ghi… bấm lại để gửi':'Bấm mic để nói'}</div></div>{(voice.error||err)&&<div className="cr-error friendly" style={{marginTop:8}}>{voice.error||err}</div>}<div className="type-row"><input className="cr-input" placeholder="Hoặc gõ câu trả lời…" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){send(input,0);setInput('')}}}/><button className="cr-btn" onClick={()=>{send(input,0);setInput('')}}>Gửi</button></div></div>
  </div></div></div>
}

function Finish({result,onBack}){
  const summary=result.summary||{};const completed=result.status==='completed';const isKids=result.age_band==='kids';
  return <div className="cr"><div className="student-shell" style={{paddingTop:'6vh'}}><div className="cr-card cr-center finish-card"><img src="/toki.png" style={{width:96}}/><h1>{completed?'Mission Complete! 🎉':'Buổi luyện đã được lưu 💪'}</h1><div className="stars">{completed?'⭐'.repeat(result.stars||2):'⭐'}</div>
    <div className="cr-grid" style={{marginTop:18}}><div className="cr-item"><div className="cr-kpi">{mmss(result.actual_speaking_seconds)}</div><div className="cr-muted">Thời gian nói</div></div><div className="cr-item"><div className="cr-kpi">{result.turn_count||0}</div><div className="cr-muted">Lượt nói</div></div></div>
    {summary.learnerAchievementVi&&<div className="achievement-card"><b>🏆 Bạn vừa làm được</b><div>{summary.learnerAchievementVi}</div></div>}
    {!isKids&&(summary.targetVocabTotal>0||summary.targetPatternsTotal>0)&&<div className="target-result"><span>🧩 Từ mục tiêu: <b>{summary.targetVocabUsed||0}/{summary.targetVocabTotal||0}</b></span><span>💬 Mẫu câu: <b>{summary.targetPatternsUsed||0}/{summary.targetPatternsTotal||0}</b></span></div>}
    {!completed&&<p className="cr-muted">Bạn đã luyện thật rồi. Mission này chưa đủ mục tiêu nên có thể quay lại luyện thêm một lần nữa.</p>}
    {summary.nextFocus&&<p className="cr-muted"><b>Lần sau thử:</b> {summary.nextFocus}</p>}
    <button className="cr-btn" onClick={onBack}>Về bài tập</button>
  </div></div></div>
}
