const assert = require('assert');
const { normalizeGeneratorInput, normalizeGeneratedDraft, normalizeMissionForSave, fallbackDraft } = require('./missionGenerator');

const kids = normalizeGeneratorInput({ grade:3, topic:'My Pets', targetVocab:['dog','cat'], targetPatterns:['I like...'], durationMinutes:3, missionType:'guided' });
assert.equal(kids.ageBand, 'kids');
assert.deepEqual(kids.targetVocab, ['dog','cat']);
const commaPattern = normalizeGeneratorInput({ grade:10, topic:'Debate', targetPatterns:'First, I think...;However,...' });
assert.deepEqual(commaPattern.targetPatterns, ['First, I think...','However,...']);

const junior = normalizeGeneratedDraft({
  title:'Toki Cafe Challenge', mission_type:'roleplay', target_vocab:['AI SHOULD NOT REPLACE'], target_patterns:['wrong'], target_turns:99, target_speaking_seconds:999,
  learning_objective:'Order a meal politely.', ai_role:'waiter', scene_prompt:'Role-play a cafe order.', opening_en:'Hi! What would you like?', opening_vi:'Bạn muốn gọi gì?'
}, { grade:6, topic:'Food', targetVocab:['noodles','juice'], targetPatterns:["I'd like..."], durationMinutes:4, missionType:'roleplay' });
assert.equal(junior.age_band, 'junior');
assert.deepEqual(junior.target_vocab, ['noodles','juice']);
assert.deepEqual(junior.target_patterns, ["I'd like..."]);
assert(junior.target_turns <= 9);
assert(junior.target_speaking_seconds <= 140);

const teenFallback = fallbackDraft({ grade:10, topic:'School uniforms', durationMinutes:6, missionType:'conversation' });
assert.equal(teenFallback.age_band, 'teen');
assert(teenFallback.target_vocab.length > 0);

assert.throws(() => normalizeMissionForSave({title:'X',learning_objective:'ok'}, {grade:6,ageBand:'kids'}), /age band/);
const saved = normalizeMissionForSave({ title:'Restaurant', learning_objective:'Order food politely', mission_type:'roleplay', target_vocab:['juice'] }, {grade:6,ageBand:'junior'});
assert.equal(saved.grade_min,6); assert.equal(saved.grade_max,6); assert.equal(saved.age_band,'junior');

console.log('Mission generator tests passed: input guardrails / target preservation / save normalization');
