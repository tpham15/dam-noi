import React,{useEffect,useMemo,useRef,useState} from 'react';
import {GOOGLE_CLIENT_ID,loadGoogle,request,storage} from '../api/classroom.js';
import MissionBuilder from './MissionBuilder.jsx';
import StudentRosterTools,{LoginCards} from './StudentRosterTools.jsx';

function Brand(){return <div className="cr-brand"><img src="/toki.png" alt="Toki"/>Dám Nói Education</div>}

function TeacherLogin({onLogin}){
  const btnRef=useRef(null); const [err,setErr]=useState('');
  useEffect(()=>{(async()=>{try{if(!GOOGLE_CLIENT_ID)throw new Error('Thiếu VITE_GOOGLE_CLIENT_ID');await loadGoogle();window.google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:async r=>{try{const d=await request('/api/auth/google',{method:'POST',body:{credential:r.credential}});storage.setTeacherToken(d.authToken);onLogin(d.authToken);}catch(e){setErr(e.message);}}});window.google.accounts.id.renderButton(btnRef.current,{theme:'outline',size:'large',text:'signin_with',shape:'pill'});}catch(e){setErr(e.message);}})();},[onLogin]);
  return <div className="cr"><div className="cr-shell cr-login"><div className="cr-card cr-center"><Brand/><h1>Teacher Portal</h1><p className="cr-muted">Đăng nhập bằng Google để quản lý lớp và tạo speaking mission.</p>{err&&<div className="cr-error">{err}</div>}<div ref={btnRef} style={{display:'flex',justifyContent:'center',marginTop:18}}/><div style={{marginTop:18}}><a href="/" className="cr-muted">← Quay lại</a></div></div></div></div>
}

export default function TeacherApp(){
  const [token,setToken]=useState(storage.getTeacherToken()); const [me,setMe]=useState(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState(''); const [centerId,setCenterId]=useState(''); const [classes,setClasses]=useState([]); const [selectedClass,setSelectedClass]=useState(null);
  const auth=useMemo(()=>({token}),[token]);
  const loadMe=async(t=token)=>{if(!t)return;setLoading(true);setErr('');try{const d=await request('/api/classroom/me',{token:t});setMe(d);if(!centerId&&d.centers?.[0])setCenterId(d.centers[0].id);}catch(e){storage.setTeacherToken('');setToken('');setErr(e.message);}finally{setLoading(false)}};
  useEffect(()=>{loadMe();},[token]);
  useEffect(()=>{if(centerId)loadClasses();},[centerId]);
  const loadClasses=async()=>{try{const d=await request(`/api/classroom/classes?centerId=${encodeURIComponent(centerId)}`,auth);setClasses(d.items||[]);}catch(e){setErr(e.message)}};
  if(!token)return <TeacherLogin onLogin={setToken}/>;
  if(loading&&!me)return <div className="cr"><div className="cr-shell">Đang tải…</div></div>;
  if(me&&(!me.centers||!me.centers.length))return <CenterOnboarding token={token} onDone={async()=>{await loadMe(token)}}/>;
  if(selectedClass)return <ClassDetail token={token} cls={selectedClass} onBack={async()=>{setSelectedClass(null);await loadClasses()}}/>;
  const centers=me?.centers||[];const centerName=centers.find(c=>c.id===centerId)?.name||centers[0]?.name||'';
  return <div className="cr"><div className="cr-shell"><div className="cr-top"><Brand/><div className="cr-row">{centers.length>1?<select className="cr-select" value={centerId} onChange={e=>setCenterId(e.target.value)}>{centers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>:<b className="center-name">{centerName}</b>}<button className="cr-btn ghost" onClick={()=>{storage.setTeacherToken('');setToken('')}}>Đăng xuất</button></div></div>{err&&<div className="cr-error">{err}</div>}<div className="cr-top"><div><h1 className="cr-title">Lớp của bạn</h1><p className="cr-subtitle">Tạo lớp, thêm học sinh, tạo mission bằng AI và giao bài speaking.</p></div></div><CreateClass token={token} centerId={centerId} onCreated={loadClasses}/><div className="cr-grid" style={{marginTop:18}}>{classes.map(c=><ClassCard key={c.id} token={token} cls={c} onOpen={()=>setSelectedClass(c)} onChanged={loadClasses}/>)}</div>{!classes.length&&<div className="cr-card cr-center" style={{marginTop:18}}>Chưa có lớp nào. Tạo lớp đầu tiên ở trên.</div>}</div></div>
}


function ClassCard({token,cls,onOpen,onChanged}){
  const [menuOpen,setMenuOpen]=useState(false);
  const [editing,setEditing]=useState(false);
  const [name,setName]=useState(cls.name||'');
  const [grade,setGrade]=useState(cls.grade||5);
  const [academicYear,setAcademicYear]=useState(cls.academic_year||'');
  const [busy,setBusy]=useState(false);
  const [err,setErr]=useState('');
  const menuRef=useRef(null);

  useEffect(()=>{setName(cls.name||'');setGrade(cls.grade||5);setAcademicYear(cls.academic_year||'')},[cls.id,cls.name,cls.grade,cls.academic_year]);
  useEffect(()=>{
    if(!menuOpen)return;
    const close=e=>{if(!menuRef.current?.contains(e.target))setMenuOpen(false)};
    document.addEventListener('pointerdown',close);
    return()=>document.removeEventListener('pointerdown',close);
  },[menuOpen]);

  const save=async e=>{
    e.preventDefault();setBusy(true);setErr('');
    try{
      await request(`/api/classroom/classes/${cls.id}`,{token,method:'PATCH',body:{name:name.trim(),grade:Number(grade),academicYear:academicYear.trim()}});
      setEditing(false);setMenuOpen(false);await onChanged();
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  };

  const remove=async()=>{
    setMenuOpen(false);
    const ok=window.confirm(`Xóa lớp “${cls.name}” khỏi danh sách?\n\nHọc sinh, bài đã giao và dữ liệu báo cáo sẽ được giữ an toàn trong hệ thống; các link học sinh của lớp này sẽ ngừng hoạt động.`);
    if(!ok)return;
    setBusy(true);setErr('');
    try{await request(`/api/classroom/classes/${cls.id}`,{token,method:'DELETE'});await onChanged();}
    catch(e){setErr(e.message)}finally{setBusy(false)}
  };

  return <div className="class-card-wrap">
    <div className="cr-card class-card click" onClick={onOpen}>
      <span className="cr-pill">Lớp {cls.grade||'—'} · {cls.age_band}</span>
      <h2>{cls.name}</h2>
      <p className="cr-muted">Mã lớp: <b>{cls.class_code}</b></p>
      <div className="cr-kpi">{cls.student_count}</div><div className="cr-muted">học sinh</div>
      {err&&<div className="cr-error" style={{marginTop:10}}>{err}</div>}
    </div>
    <div className="class-card-menu" ref={menuRef} onClick={e=>e.stopPropagation()}>
      <button className="class-menu-trigger" aria-label={`Tùy chọn lớp ${cls.name}`} aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)} disabled={busy}>⋯</button>
      {menuOpen&&<div className="class-menu-popover">
        <button onClick={()=>{setEditing(true);setMenuOpen(false)}}>✏️ Chỉnh sửa lớp</button>
        <button className="danger" onClick={remove}>🗑 Xóa lớp</button>
      </div>}
    </div>
    {editing&&<div className="class-edit-backdrop" onClick={()=>!busy&&setEditing(false)}>
      <form className="cr-card class-edit-modal" onSubmit={save} onClick={e=>e.stopPropagation()}>
        <div className="cr-row" style={{justifyContent:'space-between'}}><div><span className="cr-pill">Tùy chỉnh lớp</span><h2>Chỉnh sửa {cls.name}</h2></div><button type="button" className="cr-btn ghost" onClick={()=>setEditing(false)} disabled={busy}>✕</button></div>
        <label className="cr-label">Tên lớp<input className="cr-input" value={name} onChange={e=>setName(e.target.value)} maxLength={80} required/></label>
        <div className="builder-two">
          <label className="cr-label">Khối lớp<select className="cr-select" value={grade} onChange={e=>setGrade(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Lớp {i+1}</option>)}</select></label>
          <label className="cr-label">Năm học <span>Tùy chọn</span><input className="cr-input" placeholder="VD: 2026–2027" value={academicYear} onChange={e=>setAcademicYear(e.target.value)} maxLength={30}/></label>
        </div>
        <div className="cr-muted">Mã lớp <b>{cls.class_code}</b> được giữ nguyên để link/thẻ học sinh không bị hỏng.</div>
        {err&&<div className="cr-error">{err}</div>}
        <div className="cr-row" style={{justifyContent:'flex-end'}}><button type="button" className="cr-btn secondary" onClick={()=>setEditing(false)} disabled={busy}>Huỷ</button><button className="cr-btn" disabled={busy||!name.trim()}>{busy?'Đang lưu…':'Lưu thay đổi'}</button></div>
      </form>
    </div>}
  </div>
}

function CenterOnboarding({token,onDone}){const [name,setName]=useState('');const [err,setErr]=useState('');const submit=async e=>{e.preventDefault();try{await request('/api/classroom/centers',{token,method:'POST',body:{name}});onDone();}catch(x){setErr(x.message)}};return <div className="cr"><div className="cr-shell cr-login"><div className="cr-card"><Brand/><h1>Tạo trung tâm</h1><p className="cr-muted">Bạn chưa thuộc trung tâm nào. Tạo workspace đầu tiên để bắt đầu pilot.</p>{err&&<div className="cr-error">{err}</div>}<form className="cr-form" onSubmit={submit}><input className="cr-input" placeholder="VD: Sunny English Center" value={name} onChange={e=>setName(e.target.value)}/><button className="cr-btn">Tạo trung tâm</button></form></div></div></div>}

function CreateClass({token,centerId,onCreated}){const [open,setOpen]=useState(false);const [name,setName]=useState('');const [grade,setGrade]=useState(5);const [err,setErr]=useState('');const submit=async e=>{e.preventDefault();try{await request('/api/classroom/classes',{token,method:'POST',body:{centerId,name,grade:Number(grade)}});setName('');setOpen(false);onCreated();}catch(x){setErr(x.message)}};return <div className="cr-card">{!open?<div className="cr-row" style={{justifyContent:'space-between'}}><div><b>Thêm lớp mới</b><div className="cr-muted">Age band được tự suy ra từ lớp.</div></div><button className="cr-btn" onClick={()=>setOpen(true)}>+ Tạo lớp</button></div>:<form className="cr-form" onSubmit={submit}><div className="cr-row"><input className="cr-input" style={{flex:1}} placeholder="Tên lớp, VD: Flyers A" value={name} onChange={e=>setName(e.target.value)}/><select className="cr-select" style={{width:130}} value={grade} onChange={e=>setGrade(e.target.value)}>{Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>Lớp {i+1}</option>)}</select></div>{err&&<div className="cr-error">{err}</div>}<div className="cr-row"><button className="cr-btn">Lưu lớp</button><button type="button" className="cr-btn secondary" onClick={()=>setOpen(false)}>Huỷ</button></div></form>}</div>}

const reportDuration=s=>{const n=Math.max(0,Number(s)||0);if(n<60)return `${Math.round(n)} giây`;const m=Math.floor(n/60),r=Math.round(n%60);return r?`${m}p ${r}s`:`${m} phút`;};
const reportDate=v=>{try{return new Date(v).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}catch{return ''}};

function ClassDetail({token,cls,onBack}){
  const [data,setData]=useState(null); const [missions,setMissions]=useState([]); const [results,setResults]=useState(null); const [err,setErr]=useState(''); const [builderOpen,setBuilderOpen]=useState(false); const [classReport,setClassReport]=useState(null); const [studentReport,setStudentReport]=useState(null); const [reportBusy,setReportBusy]=useState(false); const [loginCards,setLoginCards]=useState([]); const [cardMsg,setCardMsg]=useState('');
  const load=async()=>{try{const d=await request(`/api/classroom/classes/${cls.id}`,{token});setData(d);const m=await request(`/api/classroom/missions?centerId=${encodeURIComponent(cls.center_id)}&ageBand=${encodeURIComponent(cls.age_band)}&grade=${cls.grade||''}`,{token});setMissions(m.items||[]);try{const wr=await request(`/api/classroom/classes/${cls.id}/report?days=7`,{token});setClassReport(wr.report);}catch{setClassReport(null)}}catch(e){setErr(e.message)}};
  const openStudentReport=async student=>{setReportBusy(true);setErr('');try{const r=await request(`/api/classroom/students/${student.id}/progress?classId=${encodeURIComponent(cls.id)}&days=7`,{token});setStudentReport(r);}catch(e){setErr(e.message)}finally{setReportBusy(false)}};
  const resetStudentCard=async student=>{if(!window.confirm(`Tạo PIN mới cho ${student.display_name}? PIN cũ sẽ ngừng hoạt động.`))return;setErr('');try{const d=await request(`/api/classroom/classes/${cls.id}/students/${student.id}/reset-pin`,{token,method:'POST'});setLoginCards([{...d.item,pin:d.pin,class_code:d.classCode,joinPath:d.joinPath}]);setCardMsg('Đã tạo PIN mới. Hãy in hoặc sao chép thẻ ngay.');}catch(e){setErr(e.message)}};
  useEffect(()=>{load()},[]);
  if(!data)return <div className="cr"><div className="cr-shell">Đang tải…</div></div>;
  return <div className="cr"><div className="cr-shell"><div className="cr-top"><div><button className="cr-btn ghost" onClick={onBack}>← Lớp của tôi</button><h1 className="cr-title">{data.item.name}</h1><p className="cr-subtitle">Mã lớp <b>{data.item.class_code}</b> · Lớp {data.item.grade} · {data.item.age_band}</p></div><Brand/></div>{err&&<div className="cr-error">{err}</div>}
    <TeacherOnboardingChecklist students={data.students} missions={missions} assignments={data.assignments}/>
    {builderOpen&&<MissionBuilder token={token} cls={data.item} onClose={()=>setBuilderOpen(false)} onSaved={async()=>{setBuilderOpen(false);await load()}}/>}
    {classReport&&<ClassWeeklyPanel report={classReport}/>} 
    <div className="cr-grid"><div className="cr-card"><div className="cr-row" style={{justifyContent:'space-between'}}><div><h2>Học sinh</h2><div className="cr-muted">Dán cả danh sách để tạo lớp nhanh.</div></div><span className="cr-muted">{reportBusy?'Đang mở báo cáo…':''}</span></div><StudentRosterTools token={token} cls={data.item} onAdded={load}/>{cardMsg&&<div className="cr-success">{cardMsg}</div>}<LoginCards credentials={loginCards} cls={data.item} title="Thẻ đăng nhập mới" onMessage={setCardMsg}/><div className="cr-list" style={{marginTop:14}}>{data.students.map(s=><div className="cr-item student-row" key={s.id}><div><b>{s.display_name}</b><div className="cr-muted">Code: {s.student_code} · Hoàn thành {s.missions_completed} mission · {Math.round((s.speaking_seconds||0)/60)} phút nói</div></div><div className="cr-row student-actions"><button className="cr-btn ghost" onClick={()=>resetStudentCard(s)}>🔑 Tạo lại thẻ</button><button className="cr-btn secondary" onClick={()=>openStudentReport(s)}>📊 Báo cáo</button></div></div>)}</div></div>
    <div className="cr-card"><div className="cr-row" style={{justifyContent:'space-between',alignItems:'flex-start'}}><div><h2 style={{marginTop:0}}>Speaking missions</h2><div className="cr-muted">Dùng mission mẫu hoặc tạo mission đúng bài đang dạy.</div></div><button className="cr-btn" onClick={()=>setBuilderOpen(true)}>✨ Tạo bằng AI</button></div><AssignMission token={token} classId={cls.id} missions={missions} onAssigned={load}/><div className="cr-list" style={{marginTop:14}}>{data.assignments.map(a=><div className="cr-item click" key={a.id} onClick={async()=>{const r=await request(`/api/classroom/assignments/${a.id}/results`,{token});setResults(r)}}><b>{a.title}</b><div className="cr-muted">{a.completed_count}/{a.student_count} hoàn thành</div></div>)}</div></div></div>
    {studentReport&&<StudentProgressPanel token={token} data={studentReport} onClose={()=>setStudentReport(null)}/>} 
    {results&&<ResultsPanel data={results} onClose={()=>setResults(null)}/>}</div></div>
}

function ClassWeeklyPanel({report}){
  const m=report.metrics||{};const delta=Number(report.comparison?.speakingDeltaSeconds||0);
  const copyReminder=async()=>{const names=report.needsReminder||[];if(!names.length)return;const text=`Các bạn ${names.join(', ')} nhớ hoàn thành speaking mission của lớp nhé 🎙️`;try{await navigator.clipboard.writeText(text)}catch{} };
  return <div className="cr-card weekly-report"><div className="cr-row" style={{justifyContent:'space-between',alignItems:'flex-start'}}><div><span className="cr-pill">📈 7 ngày gần đây</span><h2>Bức tranh speaking của lớp</h2><div className="cr-muted">{reportDate(report.period?.start)} – {reportDate(report.period?.end)}</div></div>{delta!==0&&<span className={`delta-pill ${delta>0?'up':'down'}`}>{delta>0?'↗':'↘'} {reportDuration(Math.abs(delta))} so với kỳ trước</span>}</div>
    <div className="report-kpi-grid"><div><b>{m.activeStudents||0}/{m.students||0}</b><span>đã luyện</span></div><div><b>{reportDuration(m.speakingSeconds)}</b><span>speaking</span></div><div><b>{m.missionsCompleted||0}</b><span>mission hoàn thành</span></div><div><b>{m.assignmentCompletionPercent==null?'—':`${m.assignmentCompletionPercent}%`}</b><span>assignment hoàn thành</span></div></div>
    <div className="report-insight-grid">{report.targets?.focus?.length>0&&<div className="teacher-insight"><b>🎯 Target cần luyện thêm</b><div className="target-chips" style={{marginTop:8}}>{report.targets.focus.slice(0,4).map(x=><span key={x.label}>{x.label} · {x.ratePercent}%</span>)}</div></div>}{report.needsReminder?.length>0&&<div className="teacher-insight"><b>🔔 Chưa có speaking trong 7 ngày</b><div className="cr-muted" style={{margin:'8px 0'}}>{report.needsReminder.join(', ')}</div><button className="cr-btn secondary" onClick={copyReminder}>Sao chép tin nhắn nhắc</button></div>}</div>
  </div>
}

function TeacherOnboardingChecklist({students=[],missions=[],assignments=[]}){
  const hasStudents=students.length>0;
  const hasCustomMission=missions.some(m=>!!m.center_id);
  const hasAssignment=assignments.length>0;
  if(hasStudents&&hasCustomMission&&hasAssignment)return null;
  const steps=[['Tạo lớp',true],['Thêm học sinh',hasStudents],['Tạo mission đầu',hasCustomMission],['Giao bài',hasAssignment]];
  return <div className="cr-card onboarding-checklist"><div><span className="cr-pill">🚀 Bắt đầu pilot</span><h2>Chỉ còn vài bước</h2><p className="cr-muted">Mục tiêu: giao được bài speaking đầu tiên trong dưới 10 phút.</p></div><div className="checklist-steps">{steps.map(([label,done])=><div key={label} className={done?'done':''}><span>{done?'✓':'○'}</span>{label}</div>)}</div></div>
}

function StudentProgressPanel({token,data,onClose}){
  const r=data.report||{};const m=r.current||{};const [shares,setShares]=useState(data.shares||[]);const [share,setShare]=useState(null);const [msg,setMsg]=useState('');const [busy,setBusy]=useState(false);
  const createShare=async()=>{setBusy(true);setMsg('');try{const d=await request(`/api/classroom/students/${r.student.id}/reports/share`,{token,method:'POST',body:{classId:r.classInfo.id,days:r.period.days,expiresDays:30}});const url=`${window.location.origin}${d.sharePath}`;setShare({id:d.id,url,expiresAt:d.expiresAt});setShares(x=>[{id:d.id,createdAt:new Date().toISOString(),expiresAt:d.expiresAt,revokedAt:null,period:d.snapshot?.period},...x]);try{await navigator.clipboard?.writeText(url);setMsg('Đã tạo và sao chép link phụ huynh.');}catch{setMsg('Đã tạo link phụ huynh.');}}catch(e){setMsg(e.message)}finally{setBusy(false)}};
  const revoke=async id=>{try{await request(`/api/classroom/reports/${id}/revoke`,{token,method:'POST',body:{centerId:r.center.id}});setShares(x=>x.map(s=>s.id===id?{...s,revokedAt:new Date().toISOString()}:s));if(share?.id===id)setShare(null);setMsg('Đã thu hồi link.');}catch(e){setMsg(e.message)}};
  const copy=async()=>{if(!share?.url)return;try{await navigator.clipboard.writeText(share.url);setMsg('Đã sao chép link.');}catch{setMsg(share.url)}};
  const delta=Number(r.comparison?.speakingDeltaSeconds||0);
  return <div className="cr-card student-report-panel"><div className="cr-top"><div><span className="cr-pill">📊 Báo cáo 7 ngày</span><h2>{r.student?.displayName}</h2><p className="cr-muted">{r.classInfo?.name} · Lớp {r.student?.grade} · {reportDate(r.period?.start)} – {reportDate(r.period?.end)}</p></div><button className="cr-btn secondary" onClick={onClose}>Đóng</button></div>
    <div className="report-kpi-grid"><div><b>{reportDuration(m.speakingSeconds)}</b><span>speaking</span></div><div><b>{m.missionsCompleted||0}</b><span>mission hoàn thành</span></div><div><b>{m.practiceSessions||0}</b><span>buổi luyện</span></div><div><b>{m.targets?.coveragePercent==null?'—':`${m.targets.coveragePercent}%`}</b><span>target coverage</span></div></div>
    {delta!==0&&<div className={`report-delta ${delta>0?'up':'down'}`}>{delta>0?'↗ Tăng':'↘ Giảm'} {reportDuration(Math.abs(delta))} speaking so với 7 ngày trước.</div>}
    <div className="report-insight-grid">{r.achievements?.length>0&&<div className="teacher-insight"><b>🏆 Achievement</b>{r.achievements.map((x,i)=><div className="cr-muted" key={i} style={{marginTop:7}}>✓ {x}</div>)}</div>}{r.current?.targets?.focus?.length>0&&<div className="teacher-insight"><b>🎯 Nên luyện thêm</b><div className="target-chips" style={{marginTop:8}}>{r.current.targets.focus.slice(0,4).map(x=><span key={x.label}>{x.label}</span>)}</div></div>}</div>
    {r.recentMissions?.length>0&&<div><h3>Mission trong kỳ</h3><div className="cr-list">{r.recentMissions.slice(0,5).map((x,i)=><div className="cr-item" key={`${x.assignmentId}-${i}`}><div className="cr-row" style={{justifyContent:'space-between'}}><div><b>{x.title}</b><div className="cr-muted">{reportDuration(x.speakingSeconds)} · {x.turns} lượt{x.targetTotal?` · Target ${x.targetUsed}/${x.targetTotal}`:''}</div></div><div>{x.status==='completed'?'✅':'💪'} {x.stars?'⭐'.repeat(x.stars):''}</div></div>{x.teacherNoteVi&&<div className="teacher-note-inline">{x.teacherNoteVi}</div>}</div>)}</div></div>}
    <div className="parent-share-box"><div><b>👨‍👩‍👧 Báo cáo cho phụ huynh</b><div className="cr-muted">Tạo snapshot riêng tư, hết hạn sau 30 ngày. Không chia sẻ transcript, lỗi chi tiết, mã học sinh hay dữ liệu đăng nhập.</div></div><button className="cr-btn" disabled={busy} onClick={createShare}>{busy?'Đang tạo…':'Tạo link phụ huynh'}</button></div>
    {share&&<div className="share-link"><input className="cr-input" readOnly value={share.url}/><button className="cr-btn secondary" onClick={copy}>Sao chép</button><a className="cr-btn secondary" href={share.url} target="_blank" rel="noreferrer">Mở</a></div>}
    {msg&&<div className={msg.startsWith('Đã')?'cr-success':'cr-error'} style={{marginTop:10}}>{msg}</div>}
    {shares.length>0&&<details className="advanced report-share-history"><summary>Link đã tạo ({shares.length})</summary><div className="cr-list" style={{marginTop:10}}>{shares.slice(0,8).map(x=>{const expired=Date.parse(x.expiresAt)<Date.now();const inactive=!!x.revokedAt||expired;return <div className="cr-item" key={x.id}><div className="cr-row" style={{justifyContent:'space-between'}}><div><b>{inactive?'Không còn hiệu lực':'Đang hoạt động'}</b><div className="cr-muted">Tạo {reportDate(x.createdAt)} · hết hạn {reportDate(x.expiresAt)}</div></div>{!inactive&&<button className="cr-btn ghost" onClick={()=>revoke(x.id)}>Thu hồi</button>}</div></div>})}</div></details>}
  </div>
}

function AssignMission({token,classId,missions,onAssigned}){
  const [missionId,setMissionId]=useState('');
  const [msg,setMsg]=useState('');
  const [submitting,setSubmitting]=useState(false);
  const submitLock=useRef(false);
  useEffect(()=>{if(!missionId&&missions[0])setMissionId(missions[0].id)},[missions]);
  const submit=async e=>{
    e.preventDefault();
    if(submitLock.current||!missionId)return;
    submitLock.current=true;
    setSubmitting(true);
    setMsg('');
    try{
      const r=await request('/api/classroom/assignments',{token,method:'POST',body:{classId,missionId}});
      setMsg(r?.duplicate?'Mission này đã được giao cho lớp rồi.':'Đã giao bài cho lớp.');
      await onAssigned();
    }catch(x){setMsg(x.message)}
    finally{submitLock.current=false;setSubmitting(false)}
  };
  const success=msg.startsWith('Đã')||msg.includes('đã được giao');
  return <form className="cr-form" onSubmit={submit}><select className="cr-select" value={missionId} onChange={e=>setMissionId(e.target.value)} disabled={submitting}>{missions.map(m=><option key={m.id} value={m.id}>{m.center_id?'⭐ Tự tạo':'Mẫu'} · {m.title} · {m.mission_type}</option>)}</select><button type="submit" className="cr-btn secondary" disabled={!missionId||submitting}>{submitting?'Đang giao…':'Giao mission đã lưu'}</button>{msg&&<div className={success?'cr-success':'cr-error'}>{msg}</div>}</form>
}

function ResultsPanel({data,onClose}){
  const items=data.items||[]; const completed=items.filter(x=>x.status==='completed').length; const totalSpeaking=items.reduce((n,x)=>n+Number(x.actual_speaking_seconds||0),0); const practiced=items.filter(x=>Number(x.turn_count||0)>0).length; const targetVocabTotal=(data.assignment.target_vocab||[]).length; const targetPatternsTotal=(data.assignment.target_patterns||[]).length;
  return <div className="cr-card" style={{marginTop:18}}><div className="cr-top"><div><h2>{data.assignment.title}</h2><p className="cr-muted">Kết quả assignment · {data.assignment.learning_objective}</p></div><button className="cr-btn secondary" onClick={onClose}>Đóng</button></div><div className="teacher-insight"><b>Class Insight</b><div className="cr-row" style={{marginTop:10}}><span className="cr-pill">✅ {completed}/{items.length} hoàn thành</span><span className="cr-pill">🎙 {Math.round(totalSpeaking/60)} phút nói</span><span className="cr-pill">💬 {practiced}/{items.length} đã luyện</span></div></div><table className="cr-table"><thead><tr><th>Học sinh</th><th>Trạng thái</th><th>Speaking</th><th>Target</th><th>Stars</th><th>AI note</th></tr></thead><tbody>{items.map(x=>{const sum=x.summary||{};return <tr key={x.student_id}><td><b>{x.display_name}</b><div className="coverage">{x.turn_count||0} lượt</div>{(sum.learnerAchievementVi||sum.learner_achievement_vi)&&<div className="student-achievement-inline">🏆 {sum.learnerAchievementVi||sum.learner_achievement_vi}</div>}</td><td>{x.status||'Chưa làm'}</td><td>{x.actual_speaking_seconds?`${Math.floor(x.actual_speaking_seconds/60)}:${String(x.actual_speaking_seconds%60).padStart(2,'0')}`:'—'}</td><td><div className="coverage">🧩 {(x.target_vocab_used||[]).length}/{targetVocabTotal}</div><div className="coverage">💬 {(x.target_patterns_used||[]).length}/{targetPatternsTotal}</div></td><td>{x.stars?'⭐'.repeat(x.stars):'—'}</td><td className="teacher-note">{sum.teacherNoteVi||sum.teacher_note_vi||'—'}</td></tr>})}</tbody></table></div>
}
