import React, { useRef, useState } from 'react';
import { request } from '../api/classroom.js';

const MISSION_TYPES = [
  ['guided', 'Guided — dẫn từng bước'],
  ['roleplay', 'Role-play — đóng vai'],
  ['story', 'Story — kể chuyện'],
  ['presentation', 'Presentation — trình bày'],
  ['conversation', 'Conversation — hội thoại'],
];

const splitList = (value, max = 12, allowComma = true) => [
  ...new Set(
    String(value || '')
      .split(allowComma ? /[\n,;]+/ : /[\n;]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  ),
].slice(0, max);

const joinList = (value) => (Array.isArray(value) ? value.join('\n') : String(value || ''));

export default function MissionBuilder({ token, cls, onClose, onSaved }) {
  const defaultType = cls.age_band === 'kids'
    ? 'guided'
    : cls.age_band === 'junior'
      ? 'roleplay'
      : 'conversation';

  const [topic, setTopic] = useState('');
  const [vocab, setVocab] = useState('');
  const [patterns, setPatterns] = useState('');
  const [duration, setDuration] = useState(cls.age_band === 'kids' ? 3 : cls.age_band === 'junior' ? 4 : 6);
  const [missionType, setMissionType] = useState(defaultType);
  const [teacherNote, setTeacherNote] = useState('');
  const [draft, setDraft] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [meta, setMeta] = useState(null);
  const generationLock = useRef(false);
  const saveLock = useRef(false);

  const runGenerate = async (forceNew = false) => {
    // State updates are async; the ref prevents true double-submit before the
    // disabled button has rendered.
    if (generationLock.current) return;
    generationLock.current = true;
    setGenerating(true);
    setMsg('');
    try {
      const data = await request('/api/classroom/missions/generate', {
        token,
        method: 'POST',
        body: {
          classId: cls.id,
          topic,
          targetVocab: splitList(vocab, 12),
          targetPatterns: splitList(patterns, 6, false),
          durationMinutes: Number(duration),
          missionType,
          teacherNote,
          forceNew,
        },
      });
      setDraft(data.draft);
      setMeta(data.meta);
      if (data.meta?.warning) setMsg(data.meta.warning);
    } catch (error) {
      setMsg(error.message);
    } finally {
      generationLock.current = false;
      setGenerating(false);
    }
  };

  const generate = async (event) => {
    event?.preventDefault();
    await runGenerate(false);
  };

  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async (assign) => {
    if (!draft || saveLock.current) return;
    saveLock.current = true;
    setSaving(true);
    setMsg('');
    try {
      const cleanDraft = {
        ...draft,
        target_vocab: splitList(joinList(draft.target_vocab), 12),
        target_patterns: splitList(joinList(draft.target_patterns), 6, false),
        target_turns: Number(draft.target_turns),
        target_speaking_seconds: Number(draft.target_speaking_seconds),
        difficulty: Number(draft.difficulty),
      };
      const saved = await request('/api/classroom/missions', {
        token,
        method: 'POST',
        body: { classId: cls.id, draft: cleanDraft },
      });
      if (assign) {
        await request('/api/classroom/assignments', {
          token,
          method: 'POST',
          body: { classId: cls.id, missionId: saved.item.id },
        });
      }
      setMsg(assign ? 'Đã lưu và giao mission cho lớp.' : 'Đã lưu mission vào thư viện trung tâm.');
      setTimeout(() => onSaved(saved.item), 350);
    } catch (error) {
      setMsg(error.message);
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  };

  const usage = meta?.generationUsage;
  const sourceLabel = meta?.source === 'ai'
    ? 'AI tạo'
    : meta?.source === 'cache'
      ? 'Draft đã cache — không tốn thêm AI call'
      : 'Bản dự phòng';

  return (
    <div className="cr-card mission-builder">
      <div className="cr-top">
        <div>
          <span className="cr-pill">🛡 Pilot-ready</span>
          <h2 style={{ marginBottom: 5 }}>Teacher Mission Generator</h2>
          <p className="cr-muted">
            Lớp {cls.grade} · {cls.age_band}. AI chỉ tạo bản nháp; bạn duyệt trước khi lưu/giao.
          </p>
        </div>
        <button className="cr-btn secondary" onClick={onClose}>Đóng</button>
      </div>

      {!draft ? (
        <form className="cr-form" onSubmit={generate}>
          <label className="cr-label">
            Hôm nay lớp đang học chủ đề gì?
            <input
              className="cr-input quick-topic"
              required
              placeholder="VD: At the restaurant"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
          </label>

          <div className="quick-default-note">Toki sẽ tự chọn cách luyện phù hợp với <b>Lớp {cls.grade}</b> · {cls.age_band}.</div>

          <details className="advanced builder-input-advanced">
            <summary>Tuỳ chọn nâng cao</summary>
            <div className="cr-form" style={{ marginTop: 12 }}>
              <div className="builder-two">
                <label className="cr-label">Vocabulary <span>(mỗi dòng hoặc dấu phẩy)</span><textarea className="cr-input cr-textarea" placeholder={'lion\ntiger\nmonkey'} value={vocab} onChange={(event) => setVocab(event.target.value)} /></label>
                <label className="cr-label">Target patterns <span>(optional)</span><textarea className="cr-input cr-textarea" placeholder={'I can see...\nMy favorite... is...'} value={patterns} onChange={(event) => setPatterns(event.target.value)} /></label>
              </div>
              <div className="builder-two">
                <label className="cr-label">Mission type<select className="cr-select" value={missionType} onChange={(event) => setMissionType(event.target.value)}>{MISSION_TYPES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label className="cr-label">Thời lượng<select className="cr-select" value={duration} onChange={(event) => setDuration(event.target.value)}>{[2, 3, 4, 5, 6, 8, 10].map((value) => <option key={value} value={value}>{value} phút</option>)}</select></label>
              </div>
              <label className="cr-label">Ghi chú cho AI <span>(optional)</span><textarea className="cr-input cr-textarea small" placeholder="VD: Các em vừa học can/can't; ưu tiên tình huống vui." value={teacherNote} onChange={(event) => setTeacherNote(event.target.value)} /></label>
            </div>
          </details>

          {msg && <div className="cr-error">{msg}</div>}
          <button className="cr-btn big-start" disabled={generating || topic.trim().length < 2}>
            {generating ? 'Toki đang tạo mission…' : '✨ Tạo mission'}
          </button>
        </form>
      ) : (
        <div className="mission-review">
          <div className="review-banner">
            <div>
              <b>Review trước khi giao</b>
              <div className="cr-muted">{sourceLabel} · Teacher có quyền sửa toàn bộ nội dung.</div>
              {usage && (
                <div className="cr-muted" style={{ marginTop: 4 }}>
                  AI quota: {usage.hourUsed}/{usage.hourLimit} giờ · {usage.dayUsed}/{usage.dayLimit} / 24h
                </div>
              )}
            </div>
            <button
              className="cr-btn secondary"
              onClick={() => {
                setDraft(null);
                setMsg('');
              }}
            >
              ← Sửa input
            </button>
          </div>

          {msg && <div className={msg.startsWith('Đã') ? 'cr-success' : 'cr-error'}>{msg}</div>}

          <div className="builder-two">
            <label className="cr-label">
              Tên mission
              <input
                className="cr-input"
                value={draft.title || ''}
                onChange={(event) => change('title', event.target.value)}
              />
            </label>
            <label className="cr-label">
              Mission type
              <select
                className="cr-select"
                value={draft.mission_type || defaultType}
                onChange={(event) => change('mission_type', event.target.value)}
              >
                {MISSION_TYPES.map(([value, label]) => (
                  <option value={value} key={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="cr-label">
            Mô tả
            <input
              className="cr-input"
              value={draft.description || ''}
              onChange={(event) => change('description', event.target.value)}
            />
          </label>

          <label className="cr-label">
            🎯 Learning objective
            <textarea
              className="cr-input cr-textarea small"
              value={draft.learning_objective || ''}
              onChange={(event) => change('learning_objective', event.target.value)}
            />
          </label>

          <div className="builder-two">
            <label className="cr-label">
              🧩 Target vocabulary
              <textarea
                className="cr-input cr-textarea"
                value={joinList(draft.target_vocab)}
                onChange={(event) => change('target_vocab', event.target.value)}
              />
            </label>
            <label className="cr-label">
              💬 Target patterns
              <textarea
                className="cr-input cr-textarea"
                value={joinList(draft.target_patterns)}
                onChange={(event) => change('target_patterns', event.target.value)}
              />
            </label>
          </div>

          <div className="builder-two">
            <label className="cr-label">
              Toki mở đầu (English)
              <textarea
                className="cr-input cr-textarea small"
                value={draft.opening_en || ''}
                onChange={(event) => change('opening_en', event.target.value)}
              />
            </label>
            <label className="cr-label">
              Bản dịch hỗ trợ
              <textarea
                className="cr-input cr-textarea small"
                value={draft.opening_vi || ''}
                onChange={(event) => change('opening_vi', event.target.value)}
              />
            </label>
          </div>

          <details className="advanced">
            <summary>Thiết lập AI nâng cao</summary>
            <div className="cr-form" style={{ marginTop: 12 }}>
              <label className="cr-label">
                AI role
                <input
                  className="cr-input"
                  value={draft.ai_role || ''}
                  onChange={(event) => change('ai_role', event.target.value)}
                />
              </label>
              <label className="cr-label">
                Scene prompt
                <textarea
                  className="cr-input cr-textarea"
                  value={draft.scene_prompt || ''}
                  onChange={(event) => change('scene_prompt', event.target.value)}
                />
              </label>
              <div className="builder-three">
                <label className="cr-label">
                  Target turns
                  <input
                    className="cr-input"
                    type="number"
                    min="3"
                    max="14"
                    value={draft.target_turns || 6}
                    onChange={(event) => change('target_turns', event.target.value)}
                  />
                </label>
                <label className="cr-label">
                  Speaking target (giây)
                  <input
                    className="cr-input"
                    type="number"
                    min="20"
                    max="300"
                    value={draft.target_speaking_seconds || 60}
                    onChange={(event) => change('target_speaking_seconds', event.target.value)}
                  />
                </label>
                <label className="cr-label">
                  Difficulty
                  <select
                    className="cr-select"
                    value={draft.difficulty || 2}
                    onChange={(event) => change('difficulty', event.target.value)}
                  >
                    <option value="1">1 — dễ</option>
                    <option value="2">2 — vừa</option>
                    <option value="3">3 — nâng cao</option>
                  </select>
                </label>
              </div>
            </div>
          </details>

          {draft.teacher_rationale_vi && (
            <div className="teacher-insight">
              <b>Vì sao AI thiết kế như vậy?</b>
              <div className="cr-muted" style={{ marginTop: 6 }}>{draft.teacher_rationale_vi}</div>
            </div>
          )}

          <div className="cr-row builder-actions">
            <button className="cr-btn" disabled={saving} onClick={() => save(true)}>
              {saving ? 'Đang lưu…' : '🚀 Lưu & giao cho lớp'}
            </button>
            <button className="cr-btn secondary" disabled={saving} onClick={() => save(false)}>
              Lưu vào thư viện
            </button>
            <button
              className="cr-btn ghost"
              disabled={saving || generating}
              onClick={() => runGenerate(true)}
            >
              {generating ? 'Đang tạo…' : '↻ Generate lại'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
