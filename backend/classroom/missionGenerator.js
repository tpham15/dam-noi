const ALLOWED_TYPES = ['guided','roleplay','story','presentation','conversation'];

const AGE_GENERATOR_RULES = {
  kids: `KIDS (Grade 1-4): use concrete, familiar topics; tiny speaking steps; playful but not babyish. The learner may answer with one word or a short phrase. Avoid abstract discussion. Opening English should usually be <= 10 words. Prefer guided, roleplay, or story missions.`,
  junior: `JUNIOR (Grade 5-8): create a clear role-play/challenge with a real-world outcome. Keep language practical and energetic. Encourage complete short sentences. Opening English should usually be <= 16 words.`,
  teen: `TEEN (Grade 9-12): create authentic conversation, presentation, story, or light debate tasks. Invite reasons/examples and connected speech without making the task feel like an exam. Opening English should usually be <= 22 words.`
};

function ageBandFromGrade(grade) {
  const g = Number(grade || 0);
  if (g <= 4) return 'kids';
  if (g <= 8) return 'junior';
  return 'teen';
}

function cleanText(v, max = 500) {
  return String(v || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function cleanList(v, maxItems = 12, maxLen = 80, allowComma = true) {
  const raw = Array.isArray(v) ? v : String(v || '').split(allowComma ? /[\n,;]+/ : /[\n;]+/);
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    const s = cleanText(item, maxLen);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k); out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function clamp(n, min, max, fallback) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x))) : fallback;
}

function defaultMissionType(ageBand) {
  return ageBand === 'kids' ? 'guided' : ageBand === 'junior' ? 'roleplay' : 'conversation';
}

function normalizeGeneratorInput(input = {}) {
  const grade = clamp(input.grade, 1, 12, 5);
  const ageBand = ageBandFromGrade(grade);
  const topic = cleanText(input.topic, 160);
  if (topic.length < 2) throw new Error('topic required');
  const missionType = ALLOWED_TYPES.includes(input.missionType) ? input.missionType : defaultMissionType(ageBand);
  return {
    grade,
    ageBand,
    topic,
    targetVocab: cleanList(input.targetVocab, 12, 60),
    targetPatterns: cleanList(input.targetPatterns, 6, 100, false),
    durationMinutes: clamp(input.durationMinutes, 2, 10, ageBand === 'kids' ? 3 : ageBand === 'junior' ? 4 : 6),
    missionType,
    teacherNote: cleanText(input.teacherNote, 400),
  };
}

function recommendedTargets(input) {
  const m = input.durationMinutes;
  if (input.ageBand === 'kids') return {
    turns: clamp(Math.ceil(m * 1.5), 4, 7, 4),
    seconds: clamp(m * 18, 25, 90, 35),
    difficulty: 1,
  };
  if (input.ageBand === 'junior') return {
    turns: clamp(Math.ceil(m * 1.5), 5, 9, 6),
    seconds: clamp(m * 20, 45, 150, 75),
    difficulty: 2,
  };
  return {
    turns: clamp(Math.ceil(m * 1.35), 6, 12, 8),
    seconds: clamp(m * 23, 75, 240, 120),
    difficulty: 3,
  };
}

function buildMissionGeneratorPrompt(inputRaw) {
  const input = normalizeGeneratorInput(inputRaw);
  const suppliedVocab = input.targetVocab.length > 0;
  const suppliedPatterns = input.targetPatterns.length > 0;
  return `You design ONE speaking-practice mission for Dám Nói Education, used by an English center in Vietnam.

The teacher remains in control of curriculum. Your job is to turn the teacher's lesson target into a short speaking mission, not to teach a new lesson.

CLASS:
- Grade: ${input.grade}
- Age band: ${input.ageBand}
- Topic: ${input.topic}
- Requested mission type: ${input.missionType}
- Approximate session duration: ${input.durationMinutes} minutes
- Teacher note: ${input.teacherNote || '(none)'}

TARGET LANGUAGE FROM TEACHER:
- Vocabulary: ${input.targetVocab.length ? input.targetVocab.join(' | ') : '(teacher left blank — you may suggest up to 6 age-appropriate words)'}
- Patterns: ${input.targetPatterns.length ? input.targetPatterns.join(' | ') : '(teacher left blank — you may suggest up to 3 useful speaking patterns)'}

AGE DESIGN RULES:
${AGE_GENERATOR_RULES[input.ageBand]}

HARD RULES:
- The mission must have one concrete speaking objective and a natural end state.
- Keep it suitable for the exact grade above.
- Do not create dating, sexual, violent, gambling, drug, political persuasion, or other adult/inappropriate scenarios.
- Do not ask children for exact school, address, phone, social media, or other unnecessary personal details.
- Do not design pronunciation/phoneme scoring or grammar tests. This is speaking practice.
- The AI role must be a safe conversational role appropriate to the scenario.
- scene_prompt is an instruction for Toki: describe the role, progression, and end condition. Do not include hidden scoring tricks.
- opening_en must immediately start the speaking situation; opening_vi is its natural Vietnamese meaning/help.
- learning_objective must be observable through speaking, not vague (avoid "improve English").
- target_turns and target_speaking_seconds are participation targets, not grades/scores.
- Never put markdown, JSON, labels, or commentary inside individual string fields.
${suppliedVocab ? '- target_vocab MUST contain exactly the teacher-supplied vocabulary above, preserving wording. Do not add, remove, or replace items.' : '- Because vocabulary is blank, propose 3-6 concrete age-appropriate target words.'}
${suppliedPatterns ? '- target_patterns MUST contain exactly the teacher-supplied patterns above, preserving wording. Do not add, remove, or replace items.' : '- Because patterns are blank, propose 1-3 natural speaking patterns.'}

Create a mission draft the teacher can edit before saving/assigning.`;
}

const MISSION_GENERATOR_TOOL = {
  name: 'classroom_mission_draft',
  description: 'Create one editable Dám Nói Education speaking mission draft from teacher inputs.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['title','description','mission_type','ai_role','scene_prompt','learning_objective','target_vocab','target_patterns','target_turns','target_speaking_seconds','difficulty','opening_en','opening_vi','teacher_rationale_vi'],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      mission_type: { type: 'string', enum: ALLOWED_TYPES },
      ai_role: { type: 'string' },
      scene_prompt: { type: 'string' },
      learning_objective: { type: 'string' },
      target_vocab: { type: 'array', items: { type: 'string' } },
      target_patterns: { type: 'array', items: { type: 'string' } },
      target_turns: { type: 'integer' },
      target_speaking_seconds: { type: 'integer' },
      difficulty: { type: 'integer' },
      opening_en: { type: 'string' },
      opening_vi: { type: 'string' },
      teacher_rationale_vi: { type: 'string' },
    }
  }
};

function fallbackDraft(inputRaw) {
  const input = normalizeGeneratorInput(inputRaw);
  const t = recommendedTargets(input);
  const defaultVocab = input.ageBand === 'kids' ? ['happy','friend','play'] : input.ageBand === 'junior' ? ['usually','favorite','because'] : ['opinion','reason','example'];
  const defaultPatterns = input.ageBand === 'kids' ? ['I like...'] : input.ageBand === 'junior' ? ['I like... because...'] : ['I think... because...'];
  const role = input.missionType === 'roleplay' ? 'a friendly person in the speaking situation' : 'a supportive speaking partner';
  return {
    title: input.topic.slice(0, 80),
    description: `Luyện nói về ${input.topic}.`,
    age_band: input.ageBand,
    grade_min: input.grade,
    grade_max: input.grade,
    mission_type: input.missionType,
    ai_role: role,
    scene_prompt: `Keep the learner speaking about ${input.topic}. Ask one age-appropriate question at a time and end naturally after the learner completes the speaking objective.`,
    learning_objective: `Talk about ${input.topic} using short, understandable spoken English.`,
    target_vocab: input.targetVocab.length ? input.targetVocab : defaultVocab,
    target_patterns: input.targetPatterns.length ? input.targetPatterns : defaultPatterns,
    target_turns: t.turns,
    target_speaking_seconds: t.seconds,
    difficulty: t.difficulty,
    opening_en: input.ageBand === 'kids' ? `Hi! Let's talk about ${input.topic}.` : `Let's talk about ${input.topic}. What do you think?`,
    opening_vi: `Mình cùng nói về ${input.topic} nhé!`,
    teacher_rationale_vi: 'Bản dự phòng được tạo theo độ tuổi và thời lượng. Giáo viên nên chỉnh lại tình huống trước khi giao.',
  };
}

function normalizeGeneratedDraft(raw = {}, inputRaw = {}) {
  const input = normalizeGeneratorInput(inputRaw);
  const fallback = fallbackDraft(input);
  const recommended = recommendedTargets(input);
  const missionType = ALLOWED_TYPES.includes(raw.mission_type) ? raw.mission_type : input.missionType;
  const vocab = input.targetVocab.length ? input.targetVocab : cleanList(raw.target_vocab, 8, 60);
  const patterns = input.targetPatterns.length ? input.targetPatterns : cleanList(raw.target_patterns, 4, 100, false);
  return {
    title: cleanText(raw.title, 90) || fallback.title,
    description: cleanText(raw.description, 240) || fallback.description,
    age_band: input.ageBand,
    grade_min: input.grade,
    grade_max: input.grade,
    mission_type: missionType,
    ai_role: cleanText(raw.ai_role, 160) || fallback.ai_role,
    scene_prompt: cleanText(raw.scene_prompt, 1000) || fallback.scene_prompt,
    learning_objective: cleanText(raw.learning_objective, 360) || fallback.learning_objective,
    target_vocab: vocab.length ? vocab : fallback.target_vocab,
    target_patterns: patterns.length ? patterns : fallback.target_patterns,
    target_turns: clamp(raw.target_turns, Math.max(3, recommended.turns - 2), recommended.turns + 3, recommended.turns),
    target_speaking_seconds: clamp(raw.target_speaking_seconds, Math.max(20, recommended.seconds - 30), recommended.seconds + 60, recommended.seconds),
    difficulty: clamp(raw.difficulty, 1, 3, recommended.difficulty),
    opening_en: cleanText(raw.opening_en, 260) || fallback.opening_en,
    opening_vi: cleanText(raw.opening_vi, 320) || fallback.opening_vi,
    teacher_rationale_vi: cleanText(raw.teacher_rationale_vi, 500) || '',
  };
}

function normalizeMissionForSave(raw = {}, { grade, ageBand } = {}) {
  const g = clamp(grade ?? raw.grade_min, 1, 12, 5);
  const band = ageBand || ageBandFromGrade(g);
  if (band !== ageBandFromGrade(g)) throw new Error('age band does not match grade');
  const type = ALLOWED_TYPES.includes(raw.mission_type) ? raw.mission_type : defaultMissionType(band);
  const title = cleanText(raw.title, 90);
  const objective = cleanText(raw.learning_objective, 360);
  if (title.length < 2) throw new Error('mission title required');
  if (objective.length < 5) throw new Error('learning objective required');
  const defaults = recommendedTargets({ grade:g, ageBand:band, durationMinutes:4 });
  return {
    title,
    description: cleanText(raw.description, 240),
    age_band: band,
    grade_min: g,
    grade_max: g,
    mission_type: type,
    ai_role: cleanText(raw.ai_role, 160) || 'a supportive speaking partner',
    scene_prompt: cleanText(raw.scene_prompt, 1000) || `Keep the learner inside the ${title} speaking mission and move toward the objective.`,
    learning_objective: objective,
    target_vocab: cleanList(raw.target_vocab, 12, 60),
    target_patterns: cleanList(raw.target_patterns, 6, 100, false),
    target_turns: clamp(raw.target_turns, 3, 14, defaults.turns),
    target_speaking_seconds: clamp(raw.target_speaking_seconds, 20, 300, defaults.seconds),
    difficulty: clamp(raw.difficulty, 1, 3, defaults.difficulty),
    opening_en: cleanText(raw.opening_en, 260) || 'Ready? Let’s start!',
    opening_vi: cleanText(raw.opening_vi, 320),
  };
}

module.exports = {
  ALLOWED_TYPES,
  ageBandFromGrade,
  normalizeGeneratorInput,
  buildMissionGeneratorPrompt,
  MISSION_GENERATOR_TOOL,
  fallbackDraft,
  normalizeGeneratedDraft,
  normalizeMissionForSave,
};
