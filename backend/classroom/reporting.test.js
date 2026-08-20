const assert = require('assert');
const { buildStudentReport, makeParentSnapshot, buildClassReport } = require('./reporting');
const now = new Date('2026-08-16T09:00:00.000Z');
const attempt=(x)=>({assignment_id:x.assignment_id||x.id,student_user_id:x.student_user_id||'s1',title:x.title||'Food',status:x.status||'completed',actual_speaking_seconds:x.sec||0,turn_count:x.turns||0,words_spoken:x.words||0,stars:x.stars||0,target_vocab:x.target_vocab||['chicken','juice'],target_patterns:x.target_patterns||["I'd like..."],target_vocab_used:x.used_vocab||[],target_patterns_used:x.used_patterns||[],summary:x.summary||{},started_at:x.at,completed_at:x.at});
const attempts=[
  attempt({id:'a1',at:'2026-08-15T09:00:00.000Z',sec:120,turns:6,words:55,stars:3,used_vocab:['chicken'],used_patterns:["I'd like..."],summary:{learnerAchievementVi:'Đã gọi món bằng tiếng Anh.'}}),
  attempt({id:'a2',at:'2026-08-12T09:00:00.000Z',sec:90,turns:5,words:40,stars:2,used_vocab:['juice'],used_patterns:[]}),
  attempt({id:'a0',at:'2026-08-05T09:00:00.000Z',sec:60,turns:4,words:25,stars:2,used_vocab:[],used_patterns:[]}),
];
const report=buildStudentReport({student:{id:'s1',display_name:'Minh',grade:6,age_band:'junior'},classInfo:{id:'c1',name:'6A',grade:6,age_band:'junior'},center:{id:'z1',name:'Sunny'},attempts,days:7,endAt:now});
assert.equal(report.current.speakingSeconds,210);
assert.equal(report.current.missionsCompleted,2);
assert.equal(report.previous.speakingSeconds,60);
assert.equal(report.comparison.speakingDeltaSeconds,150);
assert.equal(report.current.targets.used,3);
assert.equal(report.current.targets.total,6);
const snap=makeParentSnapshot(report,now);
assert.equal(snap.student.displayName,'Minh');
assert(!('teacherNotes' in snap));
assert(!JSON.stringify(snap).includes('teacherNoteVi'));
assert(!JSON.stringify(snap).includes('transcript'));
assert(snap.messageVi.includes('Minh'));
const cls=buildClassReport({classInfo:{id:'c1',name:'6A',grade:6,age_band:'junior'},students:[{id:'s1',display_name:'Minh'},{id:'s2',display_name:'Lan'}],attempts,assignments:[{student_count:2,completed_count:1}],days:7,endAt:now});
assert.equal(cls.metrics.students,2);
assert.equal(cls.metrics.activeStudents,1);
assert.equal(cls.metrics.missionsCompleted,2);
assert.equal(cls.metrics.assignmentCompletionPercent,50);
assert.deepEqual(cls.needsReminder,['Lan']);
console.log('Reporting tests passed: period aggregation / parent privacy / class insight');
