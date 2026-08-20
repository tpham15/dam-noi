const DAY_MS = 24 * 60 * 60 * 1000;

function iso(d) { return new Date(d).toISOString(); }
function eventMs(a) {
  const raw = a.completed_at || a.started_at || 0;
  const n = Date.parse(raw);
  return Number.isFinite(n) ? n : 0;
}
function arr(v) { return Array.isArray(v) ? v : []; }
function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function uniq(items) { return [...new Set(items.filter(Boolean).map(x => String(x).trim()).filter(Boolean))]; }

function periodWindow(days = 7, endAt = new Date()) {
  const safeDays = Math.max(1, Math.min(90, Math.round(n(days) || 7)));
  const end = new Date(endAt);
  const start = new Date(end.getTime() - safeDays * DAY_MS);
  const previousStart = new Date(start.getTime() - safeDays * DAY_MS);
  return { days: safeDays, start: iso(start), end: iso(end), previousStart: iso(previousStart) };
}

function filterPeriod(attempts, start, end) {
  const s = Date.parse(start), e = Date.parse(end);
  return attempts.filter(a => { const t = eventMs(a); return t >= s && t < e; });
}

function targetStats(attempts) {
  const map = new Map();
  let used = 0, total = 0;
  for (const a of attempts) {
    if (n(a.turn_count) <= 0) continue;
    const vocab = arr(a.target_vocab); const patterns = arr(a.target_patterns);
    const usedV = new Set(arr(a.target_vocab_used).map(x => String(x).toLowerCase()));
    const usedP = new Set(arr(a.target_patterns_used).map(x => String(x).toLowerCase()));
    for (const item of [...vocab, ...patterns]) {
      const key = String(item || '').trim(); if (!key) continue;
      const low = key.toLowerCase();
      const hit = usedV.has(low) || usedP.has(low);
      const row = map.get(low) || { label:key, opportunities:0, used:0 };
      row.opportunities += 1; if (hit) row.used += 1; map.set(low,row);
      total += 1; if (hit) used += 1;
    }
  }
  const items = [...map.values()].map(x => ({...x, ratePercent:x.opportunities ? Math.round(x.used / x.opportunities * 100) : 0}));
  items.sort((a,b) => b.used - a.used || b.ratePercent - a.ratePercent || a.label.localeCompare(b.label));
  const focus = items.filter(x => x.opportunities >= 1 && x.ratePercent < 60).sort((a,b) => a.ratePercent - b.ratePercent || b.opportunities - a.opportunities).slice(0,5);
  return { used, total, coveragePercent: total ? Math.round(used / total * 100) : null, top:items.slice(0,5), focus };
}

function aggregateAttempts(attempts) {
  const practice = attempts.filter(a => n(a.turn_count) > 0);
  const completed = new Set(practice.filter(a => a.status === 'completed').map(a => a.assignment_id || a.id));
  const stars = practice.reduce((s,a) => s + n(a.stars), 0);
  const speakingSeconds = practice.reduce((s,a) => s + n(a.actual_speaking_seconds), 0);
  const turns = practice.reduce((s,a) => s + n(a.turn_count), 0);
  const words = practice.reduce((s,a) => s + n(a.words_spoken), 0);
  return {
    practiceSessions: practice.length,
    missionsCompleted: completed.size,
    speakingSeconds,
    turns,
    words,
    stars,
    targets: targetStats(practice),
  };
}

function compactMission(a) {
  const s = a.summary || {};
  const total = arr(a.target_vocab).length + arr(a.target_patterns).length;
  const used = arr(a.target_vocab_used).length + arr(a.target_patterns_used).length;
  return {
    assignmentId: a.assignment_id,
    title: a.title || 'Speaking mission',
    status: a.status || 'started',
    speakingSeconds: n(a.actual_speaking_seconds),
    turns: n(a.turn_count),
    stars: n(a.stars),
    targetUsed: used,
    targetTotal: total,
    achievementVi: String(s.learnerAchievementVi || '').slice(0,360),
    teacherNoteVi: String(s.teacherNoteVi || s.teacher_note_vi || '').slice(0,420),
    nextFocus: String(s.nextFocus || '').slice(0,300),
    completedAt: a.completed_at || null,
    startedAt: a.started_at || null,
  };
}

function buildStudentReport({ student, classInfo, center, attempts, days = 7, endAt = new Date() }) {
  const window = periodWindow(days, endAt);
  const currentAttempts = filterPeriod(attempts, window.start, window.end);
  const previousAttempts = filterPeriod(attempts, window.previousStart, window.start);
  const current = aggregateAttempts(currentAttempts);
  const previous = aggregateAttempts(previousAttempts);
  const allTime = aggregateAttempts(attempts);
  const recentMissions = currentAttempts.filter(a => n(a.turn_count) > 0).sort((a,b)=>eventMs(b)-eventMs(a)).slice(0,8).map(compactMission);
  const achievements = uniq(recentMissions.map(x => x.achievementVi)).slice(0,3);
  const teacherNotes = uniq(recentMissions.map(x => x.teacherNoteVi)).slice(0,3);
  return {
    student: { id:student.id, displayName:student.display_name || student.displayName || student.name || 'Student', grade:student.grade, ageBand:student.age_band || student.ageBand },
    classInfo: classInfo ? { id:classInfo.id, name:classInfo.name, grade:classInfo.grade, ageBand:classInfo.age_band || classInfo.ageBand } : null,
    center: center ? { id:center.id, name:center.name } : null,
    period: window,
    current,
    previous,
    comparison: { speakingDeltaSeconds: current.speakingSeconds - previous.speakingSeconds, practiceDelta: current.practiceSessions - previous.practiceSessions },
    allTime,
    recentMissions,
    achievements,
    teacherNotes,
  };
}

function parentMessageVi(report) {
  const name = report.student.displayName;
  const m = report.current;
  if (!m.practiceSessions) return `Tuần này chưa ghi nhận buổi luyện speaking của ${name}. Giáo viên có thể nhắc em hoàn thành mission được giao để duy trì thói quen nói tiếng Anh.`;
  const mins = Math.max(1, Math.round(m.speakingSeconds / 60));
  let text = `Trong ${report.period.days} ngày gần đây, ${name} đã luyện khoảng ${mins} phút speaking qua ${m.practiceSessions} buổi`;
  if (m.missionsCompleted) text += ` và hoàn thành ${m.missionsCompleted} mission`;
  text += '.';
  if (m.targets.coveragePercent != null) text += ` Em đã sử dụng khoảng ${m.targets.coveragePercent}% từ và mẫu câu mục tiêu xuất hiện trong các buổi luyện.`;
  return text;
}

function parentNextStepVi(report) {
  const m = report.current;
  if (!m.practiceSessions) return 'Ưu tiên hoàn thành 2–3 buổi speaking ngắn trong tuần tới.';
  if (m.targets.coveragePercent != null && m.targets.coveragePercent < 50) return 'Tuần tới nên lặp lại từ và mẫu câu mục tiêu trong thêm 1–2 tình huống nói ngắn.';
  if (m.speakingSeconds < 180) return 'Tiếp tục tăng dần thời gian nói, ưu tiên những buổi ngắn nhưng đều đặn.';
  return 'Tiếp tục duy trì nhịp luyện và tái sử dụng các từ/mẫu câu đã học trong tình huống mới.';
}

function makeParentSnapshot(report, createdAt = new Date()) {
  return {
    version: 1,
    createdAt: iso(createdAt),
    center: report.center ? { name:report.center.name } : null,
    classInfo: report.classInfo ? { name:report.classInfo.name, grade:report.classInfo.grade } : null,
    student: { displayName:report.student.displayName, grade:report.student.grade },
    period: report.period,
    metrics: {
      speakingSeconds: report.current.speakingSeconds,
      practiceSessions: report.current.practiceSessions,
      missionsCompleted: report.current.missionsCompleted,
      turns: report.current.turns,
      words: report.current.words,
      stars: report.current.stars,
      targetCoveragePercent: report.current.targets.coveragePercent,
    },
    allTime: {
      speakingSeconds: report.allTime.speakingSeconds,
      practiceSessions: report.allTime.practiceSessions,
      missionsCompleted: report.allTime.missionsCompleted,
    },
    comparison: { speakingDeltaSeconds:report.comparison.speakingDeltaSeconds },
    messageVi: parentMessageVi(report),
    nextStepVi: parentNextStepVi(report),
    achievements: report.achievements.slice(0,3),
    recentMissions: report.recentMissions.slice(0,5).map(m => ({
      title:m.title,status:m.status,speakingSeconds:m.speakingSeconds,turns:m.turns,stars:m.stars,targetUsed:m.targetUsed,targetTotal:m.targetTotal,achievementVi:m.achievementVi,completedAt:m.completedAt
    })),
  };
}

function buildClassReport({ classInfo, students, attempts, assignments = [], days = 7, endAt = new Date() }) {
  const window = periodWindow(days,endAt);
  const currentAttempts = filterPeriod(attempts,window.start,window.end);
  const previousAttempts = filterPeriod(attempts,window.previousStart,window.start);
  const current = aggregateAttempts(currentAttempts);
  const previous = aggregateAttempts(previousAttempts);
  const byStudent = new Map();
  for (const s of students) byStudent.set(s.id, []);
  for (const a of currentAttempts) { if (!byStudent.has(a.student_user_id)) byStudent.set(a.student_user_id,[]); byStudent.get(a.student_user_id).push(a); }
  const rows = students.map(s => {
    const a = byStudent.get(s.id) || []; const agg = aggregateAttempts(a);
    return { studentId:s.id, displayName:s.display_name || s.displayName, speakingSeconds:agg.speakingSeconds, practiceSessions:agg.practiceSessions, missionsCompleted:agg.missionsCompleted, targetCoveragePercent:agg.targets.coveragePercent };
  });
  const activeStudents = rows.filter(r=>r.practiceSessions>0).length;
  const needsReminder = rows.filter(r=>r.practiceSessions===0).map(r=>r.displayName).slice(0,20);
  const studentMissionCompletions = rows.reduce((sum,r)=>sum+n(r.missionsCompleted),0);
  const expected = assignments.reduce((sum,a)=>sum+n(a.student_count),0);
  const done = assignments.reduce((sum,a)=>sum+n(a.completed_count),0);
  return {
    classInfo:{id:classInfo.id,name:classInfo.name,grade:classInfo.grade,ageBand:classInfo.age_band || classInfo.ageBand},
    period:window,
    metrics:{ students:students.length, activeStudents, speakingSeconds:current.speakingSeconds, practiceSessions:current.practiceSessions, missionsCompleted:studentMissionCompletions, targetCoveragePercent:current.targets.coveragePercent, assignmentCompletionPercent:expected?Math.round(done/expected*100):null },
    comparison:{speakingDeltaSeconds:current.speakingSeconds-previous.speakingSeconds},
    targets:{top:current.targets.top,focus:current.targets.focus},
    needsReminder,
    students:rows,
  };
}

module.exports = { periodWindow, aggregateAttempts, buildStudentReport, makeParentSnapshot, buildClassReport, parentMessageVi, parentNextStepVi };
