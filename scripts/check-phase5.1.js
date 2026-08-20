const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const fail = (msg) => { console.error(`FAIL: ${msg}`); process.exitCode = 1; };
const ok = (msg) => console.log(`OK: ${msg}`);

if (exists('frontend')) fail('legacy mixed frontend/ still exists'); else ok('legacy mixed frontend removed');
for (const p of ['apps/speaking/src/App.jsx','apps/education/src/App.jsx','backend/server.js']) {
  if (!exists(p)) fail(`missing ${p}`); else ok(`found ${p}`);
}

const speakingApp = read('apps/speaking/src/App.jsx');
const speakingConsumer = read('apps/speaking/src/consumer/ConsumerApp.jsx');
if (/TeacherApp|StudentApp|ParentReport|Dám Nói Education/.test(speakingApp + speakingConsumer)) {
  fail('Speaking frontend contains Education UI references');
} else ok('Speaking boundary contains consumer UI only');
if (/MoHo AI/.test(speakingConsumer)) fail('Speaking still exposes MoHo AI brand'); else ok('Speaking brand is Dám Nói');

const eduApp = read('apps/education/src/App.jsx');
const eduStudent = read('apps/education/src/student/StudentApp.jsx');
const eduTeacher = read('apps/education/src/teacher/TeacherApp.jsx');
const eduParent = read('apps/education/src/reports/ParentReport.jsx');
const eduAll = [eduApp,eduStudent,eduTeacher,eduParent].join('\n');
if (!/Dám Nói Education/.test(eduAll)) fail('Education brand missing'); else ok('Education brand present');
if (/Dám Nói Classroom/.test(eduAll)) fail('legacy Classroom brand remains user-facing'); else ok('legacy Classroom brand removed from Education UI');
if (/ConsumerApp/.test(eduAll)) fail('Education frontend imports consumer app'); else ok('Education boundary contains no consumer app');
if (!/\/teacher/.test(eduApp) || !/\/student/.test(eduApp) || !/\/report\//.test(eduApp)) fail('Education routes incomplete'); else ok('Education routes present');

const speakVite = read('apps/speaking/vite.config.js');
const eduVite = read('apps/education/vite.config.js');
if (!/port:\s*5173/.test(speakVite)) fail('Speaking dev port is not 5173'); else ok('Speaking dev port 5173');
if (!/port:\s*5174/.test(eduVite)) fail('Education dev port is not 5174'); else ok('Education dev port 5174');

for (const p of ['apps/speaking/netlify.toml','apps/education/netlify.toml']) {
  const t = read(p);
  if (!/from\s*=\s*"\/\*"/.test(t) || !/to\s*=\s*"\/index.html"/.test(t)) fail(`${p} missing SPA fallback`);
  else ok(`${p} SPA fallback`);
}

const backendPkg = JSON.parse(read('backend/package.json'));
if (backendPkg.scripts['start:local'] !== 'node --env-file=.env server.js') fail('backend start:local is not env-file aware');
else ok('backend local .env startup fixed');

const backend = read('backend/server.js');
if (!/CORS_ORIGINS/.test(backend)) fail('backend missing optional split-origin CORS configuration');
else ok('backend supports two production frontend origins');

if (!process.exitCode) console.log('\nPhase 5.1 split checks passed.');
