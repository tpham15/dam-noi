import React,{useEffect,useState} from 'react';
import {request} from '../api/classroom.js';

const duration=s=>{const n=Math.max(0,Number(s)||0);if(n<60)return `${Math.round(n)} giây`;const m=Math.floor(n/60),r=Math.round(n%60);return r?`${m} phút ${r} giây`:`${m} phút`;};
const date=v=>{try{return new Date(v).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric'})}catch{return ''}};

export default function ParentReport(){
  const token=decodeURIComponent(window.location.pathname.split('/report/')[1]||'');
  const [data,setData]=useState(null);const [err,setErr]=useState('');
  useEffect(()=>{if(!token){setErr('Link báo cáo không hợp lệ.');return;}request(`/api/classroom/reports/share/${encodeURIComponent(token)}`).then(setData).catch(e=>setErr(e.message));},[token]);
  if(err)return <div className="cr parent-report-page"><div className="parent-report-shell"><div className="cr-card cr-center"><img src="/toki.png" alt="Toki" className="report-toki"/><h1>Không mở được báo cáo</h1><p className="cr-muted">{err}</p></div></div></div>;
  if(!data)return <div className="cr"><div className="parent-report-shell">Đang tải báo cáo…</div></div>;
  const r=data.snapshot||{};const m=r.metrics||{};const all=r.allTime||{};const delta=Number(r.comparison?.speakingDeltaSeconds||0);
  const targetPhrase=m.targetCoveragePercent==null?'Chưa có mục tiêu từ vựng':m.targetCoveragePercent>=70?'Đã dùng phần lớn từ cô giao':m.targetCoveragePercent>=40?'Đang dùng tốt nhiều từ cô giao':'Đang làm quen với từ cô giao';
  return <div className="cr parent-report-page"><div className="parent-report-shell">
    <div className="parent-report-head"><div className="cr-brand"><img src="/toki.png" alt="Toki"/>Dám Nói Education</div><button className="cr-btn secondary no-print" onClick={()=>window.print()}>In / Lưu PDF</button></div>
    <div className="cr-card parent-hero"><div><span className="cr-pill">Báo cáo speaking · {r.period?.days||7} ngày</span><h1>{r.student?.displayName}</h1><p className="cr-muted">{r.center?.name||'English Center'}{r.classInfo?.name?` · ${r.classInfo.name}`:''}{r.student?.grade?` · Lớp ${r.student.grade}`:''}</p><p className="report-period">{date(r.period?.start)} – {date(r.period?.end)}</p></div><img src="/toki.png" alt="Toki" className="report-toki hero"/></div>
    <div className="cr-card report-story parent-lead"><span className="cr-pill">🌱 Tiến bộ tuần này</span><p>{r.messageVi}</p>{delta!==0&&<div className={`report-delta ${delta>0?'up':'down'}`}>{delta>0?'↗':'↘'} {delta>0?'Tăng':'Giảm'} {duration(Math.abs(delta))} thời gian nói so với kỳ trước</div>}</div>
    <div className="report-metrics"><div className="cr-card"><div className="report-num">{duration(m.speakingSeconds)}</div><div className="cr-muted">Đã nói tiếng Anh</div></div><div className="cr-card"><div className="report-num">{m.missionsCompleted||0}</div><div className="cr-muted">Bài speaking hoàn thành</div></div><div className="cr-card"><div className="report-num">{m.practiceSessions||0}</div><div className="cr-muted">Buổi đã luyện</div></div><div className="cr-card"><div className="report-target-phrase">{targetPhrase}</div></div></div>
    <div className="cr-card report-next"><h2>➡️ Bước tiếp theo</h2><p>{r.nextStepVi}</p></div>
    {r.achievements?.length>0&&<div className="cr-card"><h2>🏆 Những điều đã làm được</h2><div className="report-achievements">{r.achievements.map((x,i)=><div key={i}>✓ {x}</div>)}</div></div>}
    {r.recentMissions?.length>0&&<div className="cr-card"><h2>🎯 Các bài gần đây</h2><div className="report-mission-list">{r.recentMissions.map((x,i)=><div className="report-mission" key={`${x.title}-${i}`}><div><b>{x.title}</b><div className="cr-muted">{duration(x.speakingSeconds)} · {x.turns} lượt nói</div></div><span>{x.status==='completed'?'✅':'💪'} {x.stars?'⭐'.repeat(x.stars):''}</span></div>)}</div></div>}
    <div className="cr-card all-time-parent"><b>Từ trước đến nay</b><div className="cr-muted">{duration(all.speakingSeconds)} nói tiếng Anh · {all.missionsCompleted||0} bài hoàn thành.</div></div>
    <div className="report-foot">Báo cáo được tạo ngày {date(r.createdAt)} · Link hết hạn {date(data.expiresAt)}. Báo cáo chỉ hiển thị dữ liệu học tập đã được trung tâm chọn chia sẻ.</div>
  </div></div>;
}
