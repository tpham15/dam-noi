const assert = require('assert');
const { buildClassroomPrompt, CLASSROOM_TOOL } = require('./classroomPrompt');

function prompt(overrides={}) {
  return buildClassroomPrompt({
    ageBand:'junior',grade:6,title:'At the Restaurant',missionType:'roleplay',aiRole:'waiter',
    scenePrompt:'Take an order.',learningObjective:'Order food politely.',targetVocab:['chicken','juice'],
    targetPatterns:["I'd like..."],targetTurns:6,targetSpeakingSeconds:75,...overrides
  });
}

const kids = prompt({ageBand:'kids',grade:3,title:'My Pets',missionType:'guided',targetVocab:['dog','cat'],targetPatterns:['It is...']});
assert(kids.includes('AGE MODE: KIDS'));
assert(kids.includes('Never roast, tease, shame'));
assert(kids.includes('3-8 English words'));
assert(kids.includes('MISSION STYLE: GUIDED'));

const junior = prompt();
assert(junior.includes('AGE MODE: JUNIOR'));
assert(junior.includes('MISSION STYLE: ROLE-PLAY'));
assert(junior.includes("I'd like..."));

const teen = prompt({ageBand:'teen',grade:10,title:'School Debate',missionType:'presentation',learningObjective:'State an opinion and support it.'});
assert(teen.includes('AGE MODE: TEEN'));
assert(teen.includes('MISSION STYLE: PRESENTATION'));
assert(teen.includes('State an opinion and support it.'));

const required = new Set(CLASSROOM_TOOL.input_schema.required);
for (const key of ['spoken_reply','target_vocab_detected','target_patterns_detected','mission_progress']) assert(required.has(key));
console.log('Classroom prompt tests passed: Kids / Junior / Teen');
