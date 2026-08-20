const crypto = require('crypto');
const baseDb = require('../db');
const { pool } = baseDb;
const reporting = require('./reporting');

const now = () => new Date().toISOString();
const uid = (prefix = '') => prefix + crypto.randomBytes(9).toString('base64url');
const code = (prefix = '') => (prefix + crypto.randomBytes(4).toString('hex')).toUpperCase().slice(0, 10);

const SEED_MISSIONS = [
  {
    id: 'seed_my_family', title: 'My Family', description: 'Giới thiệu những người trong gia đình.', age_band: 'kids', grade_min: 1, grade_max: 4,
    mission_type: 'guided', ai_role: 'friendly speaking buddy',
    scene_prompt: 'Help the learner name family members and say one short sentence about each person. Keep it visual, warm, and very simple.',
    learning_objective: 'Use basic family vocabulary in short spoken sentences.',
    target_vocab: ['mother','father','brother','sister'], target_patterns: ['This is my...','I have...'], target_turns: 4, target_speaking_seconds: 30, difficulty: 1,
    opening_en: 'Hi! Tell me about your family. Who is in your family?', opening_vi: 'Chào bạn! Kể Toki nghe về gia đình nhé. Gia đình bạn có những ai?'
  },
  {
    id: 'seed_my_pets', title: 'My Pets', description: 'Nói về thú cưng và màu sắc.', age_band: 'kids', grade_min: 1, grade_max: 4,
    mission_type: 'guided', ai_role: 'friendly pet lover',
    scene_prompt: 'Ask about pets, animals, colors, and simple likes. One very short question at a time.',
    learning_objective: 'Name common animals and make simple adjective sentences.',
    target_vocab: ['dog','cat','bird','fish'], target_patterns: ['It is...','I like...'], target_turns: 4, target_speaking_seconds: 30, difficulty: 1,
    opening_en: 'Hi! Which animal do you like?', opening_vi: 'Bạn có thích động vật không? Bạn thích con gì?'
  },
  {
    id: 'seed_my_school', title: 'My School', description: 'Nói về trường, lớp và môn học.', age_band: 'junior', grade_min: 4, grade_max: 8,
    mission_type: 'conversation', ai_role: 'a friendly classmate',
    scene_prompt: 'Chat like a friendly classmate about school, favorite subjects, teachers, and daily school life.',
    learning_objective: 'Describe school life with complete short sentences.',
    target_vocab: ['subject','teacher','classroom','homework'], target_patterns: ['My favorite... is...','I like... because...'], target_turns: 6, target_speaking_seconds: 60, difficulty: 2,
    opening_en: 'Hey! What is your favorite subject at school?', opening_vi: 'Môn học yêu thích của bạn ở trường là gì?'
  },
  {
    id: 'seed_favorite_food', title: 'My Favorite Food', description: 'Mô tả món ăn yêu thích.', age_band: 'junior', grade_min: 4, grade_max: 8,
    mission_type: 'story', ai_role: 'a curious friend',
    scene_prompt: 'Ask about the learner’s favorite food, taste, ingredients, and when they eat it. Keep questions short.',
    learning_objective: 'Describe food and give a simple reason.',
    target_vocab: ['delicious','sweet','spicy','favorite'], target_patterns: ['My favorite food is...','I like it because...'], target_turns: 6, target_speaking_seconds: 60, difficulty: 2,
    opening_en: 'I am hungry! What is your favorite food?', opening_vi: 'Toki đói rồi! Món ăn yêu thích của bạn là gì?'
  },
  {
    id: 'seed_restaurant', title: 'At the Restaurant', description: 'Gọi món trong nhà hàng.', age_band: 'junior', grade_min: 4, grade_max: 8,
    mission_type: 'roleplay', ai_role: 'a friendly restaurant waiter',
    scene_prompt: 'Role-play as a restaurant waiter. Help the learner order food and drink, ask one natural follow-up at a time, and finish when the order is complete.',
    learning_objective: 'Order food using polite restaurant phrases.',
    target_vocab: ['noodles','chicken','juice','delicious'], target_patterns: ["I'd like...",'Can I have...?'], target_turns: 6, target_speaking_seconds: 75, difficulty: 2,
    opening_en: 'Hi! Welcome to Toki Cafe. What would you like to eat?', opening_vi: 'Chào mừng đến Toki Cafe! Bạn muốn ăn gì?'
  },
  {
    id: 'seed_shopping', title: 'Going Shopping', description: 'Hỏi giá và mua đồ.', age_band: 'junior', grade_min: 4, grade_max: 8,
    mission_type: 'roleplay', ai_role: 'a helpful shop assistant',
    scene_prompt: 'Role-play as a shop assistant. Ask what the learner wants, size/color, price, and whether they want to buy it.',
    learning_objective: 'Ask about products and prices in a shop.',
    target_vocab: ['price','size','color','cheap'], target_patterns: ['How much is...?','Can I try...?'], target_turns: 6, target_speaking_seconds: 75, difficulty: 2,
    opening_en: 'Hi! Welcome in. What are you looking for today?', opening_vi: 'Chào bạn! Hôm nay bạn đang tìm món gì?'
  },
  {
    id: 'seed_weekend', title: 'My Weekend', description: 'Kể lại hoạt động cuối tuần.', age_band: 'junior', grade_min: 5, grade_max: 9,
    mission_type: 'story', ai_role: 'a curious friend',
    scene_prompt: 'Ask the learner what they did on the weekend. Encourage a short sequence of events and simple past tense without interrupting flow.',
    learning_objective: 'Tell a short story about a recent weekend.',
    target_vocab: ['weekend','visited','played','watched'], target_patterns: ['I went...','I played...','Then I...'], target_turns: 6, target_speaking_seconds: 90, difficulty: 2,
    opening_en: 'How was your weekend? What did you do?', opening_vi: 'Cuối tuần của bạn thế nào? Bạn đã làm gì?'
  },
  {
    id: 'seed_directions', title: 'Asking for Directions', description: 'Hỏi và hiểu chỉ đường.', age_band: 'junior', grade_min: 5, grade_max: 9,
    mission_type: 'roleplay', ai_role: 'a helpful person on the street',
    scene_prompt: 'Role-play a street interaction. The learner needs directions to a place. Give simple directions and ask them to confirm.',
    learning_objective: 'Ask for and respond to simple directions.',
    target_vocab: ['left','right','straight','near'], target_patterns: ['How do I get to...?','Is it near...?'], target_turns: 6, target_speaking_seconds: 75, difficulty: 2,
    opening_en: 'Hi! You look a little lost. Where do you want to go?', opening_vi: 'Chào bạn! Bạn muốn đi đâu vậy?'
  },
  {
    id: 'seed_holiday', title: 'My Dream Holiday', description: 'Nói về chuyến du lịch mơ ước.', age_band: 'teen', grade_min: 8, grade_max: 12,
    mission_type: 'presentation', ai_role: 'an interested friend',
    scene_prompt: 'Let the learner describe a dream holiday, then ask short follow-up questions about destination, activities, food, and reasons.',
    learning_objective: 'Speak for longer about a future plan and give reasons.',
    target_vocab: ['destination','explore','experience','because'], target_patterns: ["I'd like to...",'I want to... because...'], target_turns: 8, target_speaking_seconds: 120, difficulty: 3,
    opening_en: 'If you could travel anywhere, where would you go and why?', opening_vi: 'Nếu được đi bất cứ đâu, bạn sẽ đi đâu và tại sao?'
  },
  {
    id: 'seed_best_friend', title: 'My Best Friend', description: 'Mô tả một người bạn thân.', age_band: 'teen', grade_min: 7, grade_max: 12,
    mission_type: 'conversation', ai_role: 'a curious friend',
    scene_prompt: 'Have a natural conversation about the learner’s best friend: personality, shared activities, memories, and why the friendship matters.',
    learning_objective: 'Describe a person and explain a relationship in connected speech.',
    target_vocab: ['friendly','funny','helpful','together'], target_patterns: ['We usually...','I like... because...'], target_turns: 8, target_speaking_seconds: 120, difficulty: 3,
    opening_en: 'Tell me about your best friend. What are they like?', opening_vi: 'Kể Toki nghe về bạn thân của bạn nhé. Bạn ấy là người thế nào?'
  },
  {
    id: 'seed_school_debate', title: 'School Debate', description: 'Nêu ý kiến và bảo vệ quan điểm về một chủ đề ở trường.', age_band: 'teen', grade_min: 9, grade_max: 12,
    mission_type: 'presentation', ai_role: 'a respectful debate partner',
    scene_prompt: 'Discuss whether students should have less homework. Let the learner state a position, give reasons, and respond to one gentle counterpoint. Never turn this into an aggressive debate.',
    learning_objective: 'State an opinion, support it with reasons, and respond to a different view.',
    target_vocab: ['opinion','reason','benefit','however'], target_patterns: ['I think... because...','In my opinion...','However,...'], target_turns: 8, target_speaking_seconds: 120, difficulty: 3,
    opening_en: 'Do you think students should have less homework? Why?', opening_vi: 'Bạn có nghĩ học sinh nên có ít bài tập về nhà hơn không? Vì sao?'
  }
];

async function initClassroom() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'consumer';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS grade INTEGER;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS age_band TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS student_code TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mission_id TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS assignment_id TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS attempt_id TEXT;
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS age_band TEXT;

    CREATE TABLE IF NOT EXISTS centers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS center_members (
      center_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin','teacher')),
      created_at TEXT NOT NULL,
      PRIMARY KEY(center_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      center_id TEXT NOT NULL,
      teacher_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      grade INTEGER,
      age_band TEXT NOT NULL CHECK (age_band IN ('kids','junior','teen')),
      class_code TEXT NOT NULL UNIQUE,
      academic_year TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS class_students (
      class_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      PRIMARY KEY(class_id, student_user_id)
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      center_id TEXT,
      created_by TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      age_band TEXT NOT NULL CHECK (age_band IN ('kids','junior','teen')),
      grade_min INTEGER,
      grade_max INTEGER,
      mission_type TEXT NOT NULL,
      ai_role TEXT NOT NULL DEFAULT '',
      scene_prompt TEXT NOT NULL DEFAULT '',
      learning_objective TEXT NOT NULL DEFAULT '',
      target_vocab JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_turns INTEGER NOT NULL DEFAULT 6,
      target_speaking_seconds INTEGER NOT NULL DEFAULT 60,
      difficulty INTEGER NOT NULL DEFAULT 1,
      opening_en TEXT NOT NULL DEFAULT '',
      opening_vi TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      assigned_at TEXT NOT NULL,
      due_at TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS mission_attempts (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'started',
      actual_speaking_seconds INTEGER NOT NULL DEFAULT 0,
      turn_count INTEGER NOT NULL DEFAULT 0,
      words_spoken INTEGER NOT NULL DEFAULT 0,
      target_vocab_used JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_patterns_used JSONB NOT NULL DEFAULT '[]'::jsonb,
      stt_retry_count INTEGER NOT NULL DEFAULT 0,
      stt_low_confidence_count INTEGER NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      objective_reached BOOLEAN NOT NULL DEFAULT FALSE,
      mission_progress JSONB NOT NULL DEFAULT '{}'::jsonb,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb
    );

    ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS objective_reached BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE mission_attempts ADD COLUMN IF NOT EXISTS mission_progress JSONB NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS report_shares (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      center_id TEXT NOT NULL,
      class_id TEXT NOT NULL,
      student_user_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_report_shares_student ON report_shares(student_user_id);
    CREATE INDEX IF NOT EXISTS idx_report_shares_center ON report_shares(center_id);
    CREATE INDEX IF NOT EXISTS idx_report_shares_token ON report_shares(token_hash);

    CREATE INDEX IF NOT EXISTS idx_members_user ON center_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_classes_center ON classes(center_id);
    CREATE INDEX IF NOT EXISTS idx_class_students_user ON class_students(student_user_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments(class_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_assignment ON mission_attempts(assignment_id);
    CREATE INDEX IF NOT EXISTS idx_attempts_student ON mission_attempts(student_user_id);
  `);

  for (const m of SEED_MISSIONS) {
    await pool.query(
      `INSERT INTO missions
       (id,center_id,created_by,title,description,age_band,grade_min,grade_max,mission_type,ai_role,scene_prompt,learning_objective,target_vocab,target_patterns,target_turns,target_speaking_seconds,difficulty,opening_en,opening_vi,status,created_at,updated_at)
       VALUES ($1,NULL,NULL,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17,'active',$18,$18)
       ON CONFLICT (id) DO UPDATE SET
         title=EXCLUDED.title,description=EXCLUDED.description,age_band=EXCLUDED.age_band,
         grade_min=EXCLUDED.grade_min,grade_max=EXCLUDED.grade_max,mission_type=EXCLUDED.mission_type,
         ai_role=EXCLUDED.ai_role,scene_prompt=EXCLUDED.scene_prompt,learning_objective=EXCLUDED.learning_objective,
         target_vocab=EXCLUDED.target_vocab,target_patterns=EXCLUDED.target_patterns,target_turns=EXCLUDED.target_turns,
         target_speaking_seconds=EXCLUDED.target_speaking_seconds,difficulty=EXCLUDED.difficulty,
         opening_en=EXCLUDED.opening_en,opening_vi=EXCLUDED.opening_vi,updated_at=EXCLUDED.updated_at`,
      [m.id,m.title,m.description,m.age_band,m.grade_min,m.grade_max,m.mission_type,m.ai_role,m.scene_prompt,m.learning_objective,JSON.stringify(m.target_vocab),JSON.stringify(m.target_patterns),m.target_turns,m.target_speaking_seconds,m.difficulty,m.opening_en,m.opening_vi,now()]
    );
  }
  await archiveDuplicateEmptyAssignments();
}

async function archiveDuplicateEmptyAssignments() {
  // Preserve the assignment with the most learner activity. Archive only redundant
  // copies that have no attempts, so cleanup never removes learner history.
  const r = await pool.query(`WITH ranked AS (
      SELECT a.id,a.class_id,a.mission_id,
        COUNT(ma.id)::int AS attempt_count,
        ROW_NUMBER() OVER (
          PARTITION BY a.class_id,a.mission_id
          ORDER BY COUNT(ma.id) DESC,a.assigned_at ASC,a.id ASC
        ) AS rn
      FROM assignments a
      LEFT JOIN mission_attempts ma ON ma.assignment_id=a.id
      WHERE a.status='active'
      GROUP BY a.id,a.class_id,a.mission_id,a.assigned_at
    ), redundant AS (
      SELECT id FROM ranked WHERE rn>1 AND attempt_count=0
    )
    UPDATE assignments a SET status='archived'
    FROM redundant r WHERE a.id=r.id
    RETURNING a.id`);
  if (r.rowCount) console.warn(`Archived ${r.rowCount} duplicate empty assignment(s).`);
  return r.rowCount;
}

async function setUserRole(userId, role) {
  await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, userId]);
}

async function createCenter(userId, name, preferredCode = '') {
  const centerId = uid('ctr_');
  let centerCode = String(preferredCode || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12) || code('DN');
  for (let i=0;i<5;i++) {
    try {
      await pool.query('INSERT INTO centers (id,name,code,status,created_at) VALUES ($1,$2,$3,\'active\',$4)', [centerId,String(name || 'My English Center').trim().slice(0,120),centerCode,now()]);
      break;
    } catch (e) {
      if (e.code !== '23505' || i === 4) throw e;
      centerCode = code('DN');
    }
  }
  await pool.query('INSERT INTO center_members (center_id,user_id,role,created_at) VALUES ($1,$2,\'admin\',$3) ON CONFLICT (center_id,user_id) DO UPDATE SET role=\'admin\'', [centerId,userId,now()]);
  await setUserRole(userId, 'teacher');
  return getCenter(centerId);
}

async function getCenter(centerId) {
  const r = await pool.query('SELECT * FROM centers WHERE id=$1', [centerId]);
  return r.rows[0] || null;
}

async function getMemberships(userId) {
  const r = await pool.query(`SELECT c.id,c.name,c.code,c.status,cm.role FROM center_members cm JOIN centers c ON c.id=cm.center_id WHERE cm.user_id=$1 AND c.status='active' ORDER BY c.created_at`, [userId]);
  return r.rows;
}

async function getMembership(userId, centerId) {
  const r = await pool.query('SELECT * FROM center_members WHERE user_id=$1 AND center_id=$2', [userId,centerId]);
  return r.rows[0] || null;
}

function gradeToBand(grade) {
  const g = Number(grade || 0);
  if (g && g <= 4) return 'kids';
  if (g && g <= 8) return 'junior';
  return 'teen';
}

async function createClass({centerId,teacherUserId,name,grade,ageBand,academicYear,classCode}) {
  const id = uid('cls_');
  let cc = String(classCode || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12) || code('C');
  const g = grade ? Math.max(1, Math.min(12, Number(grade))) : null;
  const band = ['kids','junior','teen'].includes(ageBand) ? ageBand : gradeToBand(g);
  for (let i=0;i<5;i++) {
    try {
      await pool.query(`INSERT INTO classes (id,center_id,teacher_user_id,name,grade,age_band,class_code,academic_year,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9)`, [id,centerId,teacherUserId,String(name || 'New Class').trim().slice(0,80),g,band,cc,String(academicYear || '').slice(0,30),now()]);
      break;
    } catch(e) {
      if (e.code !== '23505' || i===4) throw e;
      cc = code('C');
    }
  }
  return getClass(id);
}

async function getClass(id) {
  const r = await pool.query('SELECT * FROM classes WHERE id=$1', [id]);
  return r.rows[0] || null;
}

async function listClasses(centerId, userId, isAdmin=false) {
  const params = [centerId];
  let where = "c.center_id=$1 AND c.status='active'";
  if (!isAdmin) { params.push(userId); where += ' AND c.teacher_user_id=$2'; }
  const r = await pool.query(`SELECT c.*, COUNT(cs.student_user_id)::int AS student_count FROM classes c LEFT JOIN class_students cs ON cs.class_id=c.id AND cs.status='active' WHERE ${where} GROUP BY c.id ORDER BY c.created_at DESC`, params);
  return r.rows;
}

async function updateClass(id, { name, grade, academicYear } = {}) {
  const current = await getClass(id);
  if (!current || current.status !== 'active') return null;
  const nextName = String(name == null ? current.name : name).trim().slice(0,80);
  if (!nextName) throw new Error('class name required');
  const rawGrade = grade == null ? current.grade : Number(grade);
  const nextGrade = rawGrade == null || rawGrade === '' ? null : Math.max(1, Math.min(12, Number(rawGrade)));
  if (rawGrade != null && rawGrade !== '' && !Number.isFinite(Number(rawGrade))) throw new Error('grade must be between 1 and 12');
  const nextBand = gradeToBand(nextGrade);
  const nextAcademicYear = String(academicYear == null ? current.academic_year : academicYear).trim().slice(0,30);
  const r = await pool.query(`UPDATE classes
    SET name=$1,grade=$2,age_band=$3,academic_year=$4
    WHERE id=$5 AND status='active'
    RETURNING *`, [nextName,nextGrade,nextBand,nextAcademicYear,id]);
  return r.rows[0] || null;
}

async function archiveClass(id) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(`SELECT * FROM classes WHERE id=$1 AND status='active' FOR UPDATE`, [id]);
    if (!current.rowCount) { await client.query('ROLLBACK'); return null; }
    const ts = now();
    await client.query(`UPDATE classes SET status='archived' WHERE id=$1`, [id]);
    await client.query(`UPDATE class_students SET status='archived' WHERE class_id=$1 AND status='active'`, [id]);
    await client.query(`UPDATE assignments SET status='archived' WHERE class_id=$1 AND status='active'`, [id]);
    await client.query(`UPDATE report_shares SET revoked_at=$1 WHERE class_id=$2 AND revoked_at IS NULL`, [ts,id]);
    await client.query('COMMIT');
    return { ...current.rows[0], status:'archived' };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function createStudent({classId,displayName,studentCode,pinHash}) {
  const cls = await getClass(classId);
  if (!cls) throw new Error('class not found');
  const id = uid('stu_');
  const sc = String(studentCode || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,20) || code('S');
  const duplicate = await pool.query(`SELECT 1 FROM class_students cs JOIN users u ON u.id=cs.student_user_id WHERE cs.class_id=$1 AND upper(u.student_code)=upper($2) LIMIT 1`, [classId, sc]);
  if (duplicate.rowCount) throw new Error('Mã học sinh đã tồn tại trong lớp');
  await pool.query(`INSERT INTO users (id,created_at,confidence_level,role,display_name,name,grade,age_band,student_code,pin_hash) VALUES ($1,$2,'low','student',$3,$3,$4,$5,$6,$7)`, [id,now(),String(displayName || 'Student').trim().slice(0,80),cls.grade,cls.age_band,sc,pinHash]);
  await pool.query(`INSERT INTO class_students (class_id,student_user_id,joined_at,status) VALUES ($1,$2,$3,'active')`, [classId,id,now()]);
  return getStudentInClass(classId,id);
}


function studentCodeBase(name) {
  return String(name || 'STUDENT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Đđ]/g, 'D')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 14) || 'STUDENT';
}

async function createStudentsBulk({ classId, students }) {
  const cls = await getClass(classId);
  if (!cls) throw new Error('class not found');
  const rows = Array.isArray(students) ? students.slice(0, 60) : [];
  if (!rows.length) throw new Error('student list required');
  const client = await pool.connect();
  const created = [];
  try {
    await client.query('BEGIN');
    for (let i = 0; i < rows.length; i++) {
      const input = rows[i] || {};
      const displayName = String(input.displayName || '').trim().slice(0, 80);
      if (!displayName) throw new Error(`Tên học sinh dòng ${i + 1} đang trống`);
      const base = studentCodeBase(input.studentCode || displayName);
      let sc = String(input.studentCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
      if (!sc) sc = `${base.slice(0, 16)}${String(i + 1).padStart(2, '0')}`.slice(0, 20);
      for (let n = 0; n < 50; n++) {
        const dup = await client.query(`SELECT 1 FROM class_students cs JOIN users u ON u.id=cs.student_user_id WHERE cs.class_id=$1 AND upper(u.student_code)=upper($2) LIMIT 1`, [classId, sc]);
        if (!dup.rowCount) break;
        sc = `${base.slice(0, 15)}${String(i + n + 2).padStart(2, '0')}`.slice(0, 20);
        if (n === 49) throw new Error(`Không tạo được mã duy nhất cho ${displayName}`);
      }
      const id = uid('stu_');
      await client.query(`INSERT INTO users (id,created_at,confidence_level,role,display_name,name,grade,age_band,student_code,pin_hash) VALUES ($1,$2,'low','student',$3,$3,$4,$5,$6,$7)`, [id,now(),displayName,cls.grade,cls.age_band,sc,input.pinHash]);
      await client.query(`INSERT INTO class_students (class_id,student_user_id,joined_at,status) VALUES ($1,$2,$3,'active')`, [classId,id,now()]);
      created.push({ id, display_name:displayName, student_code:sc, grade:cls.grade, age_band:cls.age_band, status:'active' });
    }
    await client.query('COMMIT');
    return created;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function getStudentInClass(classId, studentUserId) {
  const r = await pool.query(`SELECT u.id,u.display_name,u.student_code,u.grade,u.age_band,cs.status FROM class_students cs JOIN users u ON u.id=cs.student_user_id WHERE cs.class_id=$1 AND u.id=$2`, [classId,studentUserId]);
  return r.rows[0] || null;
}

async function updateStudentPin(classId, studentUserId, pinHash) {
  const student = await getStudentInClass(classId, studentUserId);
  if (!student) throw new Error('student not found in class');
  await pool.query('UPDATE users SET pin_hash=$1 WHERE id=$2', [pinHash, studentUserId]);
  return getStudentInClass(classId, studentUserId);
}

async function listClassStudents(classId) {
  const r = await pool.query(`SELECT u.id,u.display_name,u.student_code,u.grade,u.age_band,cs.status,
    COALESCE(SUM(ma.actual_speaking_seconds) FILTER (WHERE ma.status='completed' AND a2.class_id=cs.class_id),0)::int AS speaking_seconds,
    (COUNT(ma.id) FILTER (WHERE ma.status='completed' AND a2.class_id=cs.class_id))::int AS missions_completed
    FROM class_students cs JOIN users u ON u.id=cs.student_user_id
    LEFT JOIN mission_attempts ma ON ma.student_user_id=u.id
    LEFT JOIN assignments a2 ON a2.id=ma.assignment_id
    WHERE cs.class_id=$1 AND cs.status='active'
    GROUP BY u.id,cs.status ORDER BY u.display_name`, [classId]);
  return r.rows;
}

async function findStudentLogin(classCode, studentCode) {
  const r = await pool.query(`SELECT u.*, c.id AS class_id,c.center_id,c.name AS class_name,c.class_code,c.age_band AS class_age_band,c.grade AS class_grade
    FROM classes c JOIN class_students cs ON cs.class_id=c.id JOIN users u ON u.id=cs.student_user_id
    WHERE upper(c.class_code)=upper($1) AND upper(u.student_code)=upper($2) AND c.status='active' AND cs.status='active' LIMIT 1`, [classCode,studentCode]);
  return r.rows[0] || null;
}

async function listMissions({centerId=null, ageBand=null, grade=null}={}) {
  const params = [centerId];
  let where = "status='active' AND (center_id IS NULL OR center_id=$1)";
  if (ageBand) { params.push(ageBand); where += ` AND age_band=$${params.length}`; }
  if (grade) { params.push(Number(grade)); const p=params.length; where += ` AND (grade_min IS NULL OR grade_min <= $${p}) AND (grade_max IS NULL OR grade_max >= $${p})`; }
  const r = await pool.query(`SELECT * FROM missions WHERE ${where} ORDER BY (center_id IS NULL), updated_at DESC, difficulty, title`, params);
  return r.rows;
}

async function getMission(id, centerId=null) {
  const r = await pool.query(`SELECT * FROM missions WHERE id=$1 AND status='active' AND (center_id IS NULL OR center_id=$2)`, [id,centerId]);
  return r.rows[0] || null;
}

async function getOwnedMission(id, centerId) {
  const r = await pool.query(`SELECT * FROM missions WHERE id=$1 AND center_id=$2 AND status='active'`, [id,centerId]);
  return r.rows[0] || null;
}

async function createMission({centerId, createdBy, mission}) {
  const id = uid('msn_');
  const ts = now();
  await pool.query(`INSERT INTO missions
    (id,center_id,created_by,title,description,age_band,grade_min,grade_max,mission_type,ai_role,scene_prompt,learning_objective,target_vocab,target_patterns,target_turns,target_speaking_seconds,difficulty,opening_en,opening_vi,status,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,$16,$17,$18,$19,'active',$20,$20)`,
    [id,centerId,createdBy,mission.title,mission.description,mission.age_band,mission.grade_min,mission.grade_max,mission.mission_type,mission.ai_role,mission.scene_prompt,mission.learning_objective,JSON.stringify(mission.target_vocab||[]),JSON.stringify(mission.target_patterns||[]),mission.target_turns,mission.target_speaking_seconds,mission.difficulty,mission.opening_en,mission.opening_vi,ts]);
  return getOwnedMission(id, centerId);
}

async function updateMission({id, centerId, mission}) {
  const existing = await getOwnedMission(id, centerId);
  if (!existing) throw new Error('mission not found');
  const assigned = await pool.query(`SELECT 1 FROM assignments WHERE mission_id=$1 LIMIT 1`, [id]);
  if (assigned.rowCount) throw new Error('mission already assigned; create a new mission instead of editing it');
  await pool.query(`UPDATE missions SET title=$1,description=$2,age_band=$3,grade_min=$4,grade_max=$5,mission_type=$6,ai_role=$7,scene_prompt=$8,learning_objective=$9,target_vocab=$10::jsonb,target_patterns=$11::jsonb,target_turns=$12,target_speaking_seconds=$13,difficulty=$14,opening_en=$15,opening_vi=$16,updated_at=$17 WHERE id=$18 AND center_id=$19`,
    [mission.title,mission.description,mission.age_band,mission.grade_min,mission.grade_max,mission.mission_type,mission.ai_role,mission.scene_prompt,mission.learning_objective,JSON.stringify(mission.target_vocab||[]),JSON.stringify(mission.target_patterns||[]),mission.target_turns,mission.target_speaking_seconds,mission.difficulty,mission.opening_en,mission.opening_vi,now(),id,centerId]);
  return getOwnedMission(id, centerId);
}

async function createAssignment({missionId,classId,assignedBy,dueAt}) {
  const client = await pool.connect();
  let id = null;
  let created = false;
  try {
    await client.query('BEGIN');
    // Serialize assignment creation for this exact class + mission. This makes
    // browser double-clicks and request retries idempotent even across server workers.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))', [classId, missionId]);
    const existing = await client.query(`SELECT id FROM assignments
      WHERE class_id=$1 AND mission_id=$2 AND status='active'
      ORDER BY assigned_at ASC,id ASC LIMIT 1`, [classId,missionId]);
    if (existing.rowCount) {
      id = existing.rows[0].id;
    } else {
      id = uid('asg_');
      await client.query(`INSERT INTO assignments (id,mission_id,class_id,assigned_by,assigned_at,due_at,status) VALUES ($1,$2,$3,$4,$5,$6,'active')`, [id,missionId,classId,assignedBy,now(),dueAt || null]);
      created = true;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(()=>{});
    throw e;
  } finally {
    client.release();
  }
  return { item: await getAssignment(id), created };
}

async function getAssignment(id) {
  const r = await pool.query(`SELECT a.*,m.title,m.description,m.age_band,m.mission_type,m.ai_role,m.scene_prompt,m.learning_objective,m.target_vocab,m.target_patterns,m.target_turns,m.target_speaking_seconds,m.opening_en,m.opening_vi,c.center_id,c.name AS class_name,c.class_code,c.grade
    FROM assignments a JOIN missions m ON m.id=a.mission_id JOIN classes c ON c.id=a.class_id WHERE a.id=$1`, [id]);
  return r.rows[0] || null;
}

async function listClassAssignments(classId) {
  const r = await pool.query(`SELECT a.*,m.title,m.description,m.age_band,m.mission_type,m.target_turns,m.target_speaking_seconds,
    COUNT(DISTINCT cs.student_user_id)::int AS student_count,
    (COUNT(DISTINCT ma.student_user_id) FILTER (WHERE ma.status='completed'))::int AS completed_count
    FROM assignments a JOIN missions m ON m.id=a.mission_id
    LEFT JOIN class_students cs ON cs.class_id=a.class_id AND cs.status='active'
    LEFT JOIN mission_attempts ma ON ma.assignment_id=a.id
    WHERE a.class_id=$1 AND a.status='active'
    GROUP BY a.id,m.id ORDER BY a.assigned_at DESC`, [classId]);
  return r.rows;
}

async function listStudentAssignments(studentUserId) {
  const r = await pool.query(`SELECT a.id AS assignment_id,a.due_at,a.assigned_at,m.id AS mission_id,m.title,m.description,m.age_band,m.mission_type,m.target_vocab,m.target_patterns,m.target_turns,m.target_speaking_seconds,m.opening_en,m.opening_vi,c.name AS class_name,
    ma.id AS attempt_id,ma.status AS attempt_status,ma.actual_speaking_seconds,ma.turn_count,ma.stars
    FROM class_students cs JOIN classes c ON c.id=cs.class_id JOIN assignments a ON a.class_id=c.id AND a.status='active' JOIN missions m ON m.id=a.mission_id
    LEFT JOIN LATERAL (SELECT * FROM mission_attempts x WHERE x.assignment_id=a.id AND x.student_user_id=$1 ORDER BY x.started_at DESC LIMIT 1) ma ON true
    WHERE cs.student_user_id=$1 AND cs.status='active' ORDER BY (ma.status='completed') NULLS FIRST,a.due_at NULLS LAST,a.assigned_at DESC`, [studentUserId]);
  return r.rows;
}

async function studentHasAssignment(studentUserId, assignmentId) {
  const r = await pool.query(`SELECT 1 FROM assignments a JOIN class_students cs ON cs.class_id=a.class_id WHERE a.id=$1 AND cs.student_user_id=$2 AND cs.status='active' AND a.status='active'`, [assignmentId,studentUserId]);
  return !!r.rowCount;
}

async function startAttempt(studentUserId, assignmentId) {
  if (!(await studentHasAssignment(studentUserId, assignmentId))) throw new Error('assignment not available');
  const assignment = await getAssignment(assignmentId);
  const session = await baseDb.startSession(studentUserId);
  const attemptId = uid('att_');
  await pool.query(`UPDATE sessions SET mission_id=$1,assignment_id=$2,attempt_id=$3,age_band=$4 WHERE id=$5`, [assignment.mission_id,assignmentId,attemptId,assignment.age_band,session.sessionId]);
  await pool.query(`INSERT INTO mission_attempts (id,assignment_id,mission_id,student_user_id,session_id,started_at,status) VALUES ($1,$2,$3,$4,$5,$6,'started')`, [attemptId,assignmentId,assignment.mission_id,studentUserId,session.sessionId,now()]);
  const anchor = `[MISSION_START] title=${assignment.title}; age_band=${assignment.age_band}; grade=${assignment.grade || ''}; type=${assignment.mission_type}; role=${assignment.ai_role}; objective=${assignment.learning_objective}; target_vocab=${(assignment.target_vocab||[]).join(', ')}; target_patterns=${(assignment.target_patterns||[]).join(' | ')}; scene=${assignment.scene_prompt}`;
  await baseDb.logTurn(session.sessionId,'user',anchor);
  await baseDb.logTurn(session.sessionId,'assistant',assignment.opening_en || 'Ready? Let’s start!');
  return { ...assignment, attemptId, sessionId: session.sessionId, userId: studentUserId, streakDays: session.streakDays };
}

async function getAttempt(attemptId) {
  const r = await pool.query(`SELECT ma.*,m.title,m.description,m.age_band,m.mission_type,m.ai_role,m.scene_prompt,m.learning_objective,
    m.target_vocab,m.target_patterns,m.target_turns,m.target_speaking_seconds,m.opening_en,m.opening_vi,
    a.class_id,c.center_id,c.grade,c.name AS class_name
    FROM mission_attempts ma JOIN missions m ON m.id=ma.mission_id
    JOIN assignments a ON a.id=ma.assignment_id JOIN classes c ON c.id=a.class_id WHERE ma.id=$1`, [attemptId]);
  return r.rows[0] || null;
}

const uniq = (items=[]) => [...new Set((items || []).map(x => String(x || '').trim()).filter(Boolean))];
const sameCI = (a,b) => String(a).toLowerCase() === String(b).toLowerCase();
function mergeAllowed(existing, incoming, allowed) {
  const all = uniq([...(existing || []), ...(incoming || [])]);
  return (allowed || []).filter(a => all.some(x => sameCI(a,x)));
}

async function getMissionRuntimeBySession(sessionId) {
  const r = await pool.query(`SELECT ma.*,m.title,m.description,m.age_band,m.mission_type,m.ai_role,m.scene_prompt,m.learning_objective,
    m.target_vocab,m.target_patterns,m.target_turns,m.target_speaking_seconds,m.opening_en,m.opening_vi,
    c.center_id,c.grade,c.name AS class_name,s.seconds_spoken,s.words_spoken,s.stt_retry_count,s.stt_low_confidence_count,
    (SELECT COUNT(*)::int FROM turns t WHERE t.session_id=s.id AND t.role='user' AND t.content NOT LIKE '[MISSION_START]%' AND t.content NOT LIKE '[USER_SILENT%') AS live_turn_count
    FROM sessions s JOIN mission_attempts ma ON ma.id=s.attempt_id
    JOIN missions m ON m.id=ma.mission_id JOIN assignments a ON a.id=ma.assignment_id JOIN classes c ON c.id=a.class_id
    WHERE s.id=$1`, [sessionId]);
  return r.rows[0] || null;
}

async function recordMissionTurnSignals(attemptId, { targetVocabDetected=[], targetPatternsDetected=[], objectiveReached=false, aiShouldFinish=false, reason='' }={}) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new Error('attempt not found');
  const runtime = await getMissionRuntimeBySession(attempt.session_id);
  if (!runtime) throw new Error('mission runtime not found');
  // Combine AI semantic detection with a deterministic transcript pass. The AI
  // catches natural pattern variants; the deterministic pass prevents obvious
  // target words from disappearing from live progress if the model omits them.
  const turnsR = await pool.query("SELECT content FROM turns WHERE session_id=$1 AND role='user' AND content NOT LIKE '[MISSION_START]%' AND content NOT LIKE '[USER_SILENT%' ORDER BY id", [attempt.session_id]);
  const deterministic = deterministicTargets(attempt, turnsR.rows.map(x=>String(x.content||'')));
  const vocabUsed = mergeAllowed(attempt.target_vocab_used, [...targetVocabDetected,...deterministic.vocab], attempt.target_vocab);
  const patternsUsed = mergeAllowed(attempt.target_patterns_used, [...targetPatternsDetected,...deterministic.patterns], attempt.target_patterns);
  const reached = !!attempt.objective_reached || !!objectiveReached;
  const turns = Number(runtime.live_turn_count || 0);
  const speaking = Number(runtime.seconds_spoken || 0);
  const turnRatio = Math.min(1, turns / Math.max(1, Number(attempt.target_turns || 1)));
  const speechRatio = Math.min(1, speaking / Math.max(1, Number(attempt.target_speaking_seconds || 1)));
  const engagementRatio = Math.max(turnRatio, speechRatio);
  const targetTotal = (attempt.target_vocab || []).length + (attempt.target_patterns || []).length;
  const targetUsed = vocabUsed.length + patternsUsed.length;
  const languageRatio = targetTotal ? Math.min(1, targetUsed / Math.max(1, Math.min(targetTotal, 3))) : (reached ? 1 : 0);
  const progressPercent = Math.max(1, Math.min(100, Math.round((engagementRatio * 0.72 + (reached ? 0.28 : languageRatio * 0.28)) * 100)));
  // AI may recognize the real-world objective, but cannot end a mission before meaningful participation.
  const enoughParticipation = engagementRatio >= 0.60;
  const shouldFinish = reached && enoughParticipation && !!aiShouldFinish;
  const progress = { turnCount:turns, speakingSeconds:speaking, progressPercent, objectiveReached:reached, shouldFinish, reason:String(reason || '').slice(0,240) };
  await pool.query(`UPDATE mission_attempts SET target_vocab_used=$1::jsonb,target_patterns_used=$2::jsonb,objective_reached=$3,mission_progress=$4::jsonb WHERE id=$5`,
    [JSON.stringify(vocabUsed),JSON.stringify(patternsUsed),reached,JSON.stringify(progress),attemptId]);
  return { ...progress, targetVocabUsed:vocabUsed, targetPatternsUsed:patternsUsed };
}

function normalizePattern(s) {
  return String(s || '').toLowerCase().replace(/[.…]+/g,' ').replace(/[^a-z0-9' ]/g,' ').replace(/\s+/g,' ').trim();
}
function deterministicTargets(attempt, contents) {
  const hay = ` ${contents.join(' ').toLowerCase().replace(/[^a-z0-9' ]/g,' ')} `;
  const vocab = (attempt.target_vocab || []).filter(v => {
    const n=String(v).toLowerCase().replace(/[^a-z0-9']/g,'').trim();
    return n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}s?\\b`,'i').test(hay);
  });
  const patterns = (attempt.target_patterns || []).filter(p => {
    const n=normalizePattern(p); if (!n) return false;
    const anchor=n.split(' ').filter(Boolean).slice(0,2).join(' ');
    return anchor.length >= 2 && hay.includes(anchor);
  });
  return { vocab, patterns };
}

async function getAttemptSummaryContext(attemptId) {
  const attempt = await getAttempt(attemptId);
  if (!attempt) throw new Error('attempt not found');
  const sessionR = await pool.query('SELECT seconds_spoken,words_spoken FROM sessions WHERE id=$1',[attempt.session_id]);
  const turnsR = await pool.query("SELECT content FROM turns WHERE session_id=$1 AND role='user' AND content NOT LIKE '[MISSION_START]%' AND content NOT LIKE '[USER_SILENT%' ORDER BY id",[attempt.session_id]);
  const contents=turnsR.rows.map(x=>String(x.content||''));
  return {
    attempt,
    transcript: contents.map((x,i)=>`${i+1}. ${x}`).join('\n'),
    metrics:{ turnCount:contents.length,speakingSeconds:Number(sessionR.rows[0]?.seconds_spoken||0),wordsSpoken:Number(sessionR.rows[0]?.words_spoken||0) }
  };
}

async function saveAttemptSummary(attemptId, aiSummary={}) {
  const attempt=await getAttempt(attemptId); if(!attempt) throw new Error('attempt not found');
  const merged={ ...(attempt.summary || {}), ...aiSummary };
  await pool.query('UPDATE mission_attempts SET summary=$1::jsonb WHERE id=$2',[JSON.stringify(merged),attemptId]);
  return getAttempt(attemptId);
}

async function finishAttempt(attemptId, studentUserId) {
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.student_user_id !== studentUserId) throw new Error('attempt not found');
  const sessionR = await pool.query('SELECT seconds_spoken,words_spoken,stt_retry_count,stt_low_confidence_count FROM sessions WHERE id=$1', [attempt.session_id]);
  const session = sessionR.rows[0] || {seconds_spoken:0,words_spoken:0,stt_retry_count:0,stt_low_confidence_count:0};
  const turnsR = await pool.query("SELECT content FROM turns WHERE session_id=$1 AND role='user' AND content NOT LIKE '[MISSION_START]%' AND content NOT LIKE '[USER_SILENT%' ORDER BY id", [attempt.session_id]);
  const contents = turnsR.rows.map(x=>String(x.content||''));
  const deterministic = deterministicTargets(attempt, contents);
  const usedVocab = mergeAllowed(attempt.target_vocab_used, deterministic.vocab, attempt.target_vocab);
  const usedPatterns = mergeAllowed(attempt.target_patterns_used, deterministic.patterns, attempt.target_patterns);
  const turnCount = contents.length;
  const speech = Number(session.seconds_spoken || 0);
  const turnRatio = Math.min(1, turnCount / Math.max(1, Number(attempt.target_turns || 1)));
  const speechRatio = Math.min(1, speech / Math.max(1, Number(attempt.target_speaking_seconds || 1)));
  const engagementReached = turnRatio >= 1 || speechRatio >= 1;
  const hasTargets = (attempt.target_vocab || []).length + (attempt.target_patterns || []).length > 0;
  const targetEvidence = usedPatterns.length > 0 || usedVocab.length >= Math.min(2, Math.max(1,(attempt.target_vocab || []).length));
  const objectiveReached = !!attempt.objective_reached || (!hasTargets ? turnCount >= 2 : targetEvidence);
  const status = turnCount === 0 ? 'abandoned' : (engagementReached && objectiveReached ? 'completed' : 'incomplete');
  const fullEngagement = turnRatio >= 1 && speechRatio >= 0.75;
  const stars = status === 'completed' ? (fullEngagement ? 3 : 2) : (turnCount > 0 ? 1 : 0);
  const summary = {
    targetVocabUsed: usedVocab.length,targetVocabTotal:(attempt.target_vocab||[]).length,
    targetPatternsUsed:usedPatterns.length,targetPatternsTotal:(attempt.target_patterns||[]).length,
    objectiveReached, targetVocab:usedVocab,targetPatterns:usedPatterns
  };
  const progress = {turnCount,speakingSeconds:speech,progressPercent:status==='completed'?100:Math.min(99,Math.round(Math.max(turnRatio,speechRatio)*100)),objectiveReached,shouldFinish:status==='completed',reason:status==='completed'?'Mission requirements reached.':'More practice is needed to reach the mission goal.'};
  await pool.query(`UPDATE mission_attempts SET completed_at=$1,status=$2,actual_speaking_seconds=$3,turn_count=$4,words_spoken=$5,target_vocab_used=$6::jsonb,target_patterns_used=$7::jsonb,stt_retry_count=$8,stt_low_confidence_count=$9,stars=$10,objective_reached=$11,mission_progress=$12::jsonb,summary=$13::jsonb WHERE id=$14`,
    [now(),status,speech,turnCount,Number(session.words_spoken||0),JSON.stringify(usedVocab),JSON.stringify(usedPatterns),Number(session.stt_retry_count||0),Number(session.stt_low_confidence_count||0),stars,objectiveReached,JSON.stringify(progress),JSON.stringify(summary),attemptId]);
  return getAttempt(attemptId);
}


async function reportAttemptsForStudent(studentUserId, classId) {
  const r = await pool.query(`SELECT ma.*,a.id AS assignment_id,m.title,m.learning_objective,m.target_vocab,m.target_patterns
    FROM mission_attempts ma
    JOIN assignments a ON a.id=ma.assignment_id
    JOIN missions m ON m.id=ma.mission_id
    WHERE ma.student_user_id=$1 AND a.class_id=$2
    ORDER BY ma.started_at DESC`, [studentUserId,classId]);
  return r.rows;
}

async function reportAttemptsForClass(classId) {
  const r = await pool.query(`SELECT ma.*,a.id AS assignment_id,m.title,m.learning_objective,m.target_vocab,m.target_patterns
    FROM mission_attempts ma
    JOIN assignments a ON a.id=ma.assignment_id
    JOIN missions m ON m.id=ma.mission_id
    WHERE a.class_id=$1
    ORDER BY ma.started_at DESC`, [classId]);
  return r.rows;
}

async function getStudentProgressReport(studentUserId, classId, days=7) {
  const student = await getStudentInClass(classId, studentUserId);
  if (!student) throw new Error('student not found in class');
  const cls = await getClass(classId); if (!cls) throw new Error('class not found');
  const center = await getCenter(cls.center_id);
  const attempts = await reportAttemptsForStudent(studentUserId,classId);
  return reporting.buildStudentReport({ student, classInfo:cls, center, attempts, days });
}

async function getClassWeeklyReport(classId, days=7) {
  const cls = await getClass(classId); if (!cls) throw new Error('class not found');
  const students = await listClassStudents(classId);
  const attempts = await reportAttemptsForClass(classId);
  const assignments = await listClassAssignments(classId);
  return reporting.buildClassReport({ classInfo:cls, students, attempts, assignments, days });
}

function shareTokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function createParentReportShare({ studentUserId, classId, createdBy, days=7, expiresDays=30 }) {
  const report = await getStudentProgressReport(studentUserId,classId,days);
  const rawToken = crypto.randomBytes(24).toString('base64url');
  const tokenHash = shareTokenHash(rawToken);
  const id = uid('rpt_');
  const createdAt = new Date();
  const safeExpiryDays = Math.max(1,Math.min(90,Math.round(Number(expiresDays)||30)));
  const expiresAt = new Date(createdAt.getTime() + safeExpiryDays * 24 * 60 * 60 * 1000);
  const snapshot = reporting.makeParentSnapshot(report,createdAt);
  await pool.query(`INSERT INTO report_shares
    (id,token_hash,center_id,class_id,student_user_id,created_by,period_start,period_end,snapshot,created_at,expires_at,revoked_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,NULL)`,
    [id,tokenHash,report.center.id,classId,studentUserId,createdBy,report.period.start,report.period.end,JSON.stringify(snapshot),createdAt.toISOString(),expiresAt.toISOString()]);
  return { id, token:rawToken, expiresAt:expiresAt.toISOString(), snapshot };
}

async function getParentReportShare(rawToken) {
  const hash = shareTokenHash(rawToken);
  const r = await pool.query(`SELECT id,snapshot,created_at,expires_at FROM report_shares
    WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>$2 LIMIT 1`, [hash,now()]);
  if (!r.rowCount) return null;
  return { id:r.rows[0].id, snapshot:r.rows[0].snapshot, createdAt:r.rows[0].created_at, expiresAt:r.rows[0].expires_at };
}

async function listParentReportShares(studentUserId, classId) {
  const r = await pool.query(`SELECT id,created_at,expires_at,revoked_at,snapshot
    FROM report_shares WHERE student_user_id=$1 AND class_id=$2 ORDER BY created_at DESC LIMIT 20`, [studentUserId,classId]);
  return r.rows.map(x=>({id:x.id,createdAt:x.created_at,expiresAt:x.expires_at,revokedAt:x.revoked_at,period:x.snapshot?.period || null}));
}

async function getParentReportShareMeta(reportId) {
  const r = await pool.query(`SELECT id,center_id,class_id,student_user_id,created_by,revoked_at,expires_at FROM report_shares WHERE id=$1 LIMIT 1`, [reportId]);
  return r.rows[0] || null;
}

async function revokeParentReportShare(reportId, centerId) {
  const r = await pool.query(`UPDATE report_shares SET revoked_at=$1 WHERE id=$2 AND center_id=$3 AND revoked_at IS NULL RETURNING id,revoked_at`, [now(),reportId,centerId]);
  return r.rows[0] || null;
}

async function assignmentResults(assignmentId) {
  const r = await pool.query(`SELECT u.id AS student_id,u.display_name,u.student_code,
    ma.id AS attempt_id,ma.status,ma.actual_speaking_seconds,ma.turn_count,ma.words_spoken,ma.target_vocab_used,ma.target_patterns_used,ma.stars,ma.objective_reached,ma.summary,ma.completed_at
    FROM assignments a JOIN class_students cs ON cs.class_id=a.class_id AND cs.status='active' JOIN users u ON u.id=cs.student_user_id
    LEFT JOIN LATERAL (SELECT * FROM mission_attempts x WHERE x.assignment_id=a.id AND x.student_user_id=u.id ORDER BY x.started_at DESC LIMIT 1) ma ON true
    WHERE a.id=$1 ORDER BY u.display_name`, [assignmentId]);
  return r.rows;
}

module.exports = {
  initClassroom, setUserRole, createCenter, getCenter, getMemberships, getMembership,
  createClass, getClass, listClasses, updateClass, archiveClass, createStudent, createStudentsBulk, getStudentInClass, updateStudentPin, listClassStudents, findStudentLogin,
  listMissions, getMission, getOwnedMission, createMission, updateMission, createAssignment, getAssignment, listClassAssignments, listStudentAssignments,
  studentHasAssignment, startAttempt, getAttempt, getMissionRuntimeBySession, recordMissionTurnSignals, getAttemptSummaryContext, saveAttemptSummary, finishAttempt, assignmentResults,
  getStudentProgressReport, getClassWeeklyReport, createParentReportShare, getParentReportShare, getParentReportShareMeta, listParentReportShares, revokeParentReportShare, gradeToBand
};
