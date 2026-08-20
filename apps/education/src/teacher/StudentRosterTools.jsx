import React, { useMemo, useState } from 'react';
import { request } from '../api/classroom.js';

const randomPin = () => String(Math.floor(1000 + Math.random() * 9000));

function copyText(text, setMsg) {
  navigator.clipboard?.writeText(text)
    .then(() => setMsg('Đã sao chép.'))
    .catch(() => setMsg('Không sao chép tự động được — hãy chọn và copy thủ công.'));
}

export function LoginCards({ credentials = [], cls, title = 'Thẻ đăng nhập vừa tạo', onMessage = () => {} }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const fullJoinUrl = (item) => {
    const path = String(item?.joinPath || '');
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  };
  if (!credentials.length) return null;
  const credentialsText = credentials.map(x => [
    x.display_name,
    `Mã lớp: ${x.class_code || cls.class_code}`,
    `Mã HS: ${x.student_code}`,
    `PIN: ${x.pin}`,
    `Link: ${fullJoinUrl(x)}`,
  ].join(' | ')).join('\n');
  const printCards = () => {
    document.body.classList.add('print-login-cards');
    const cleanup = () => document.body.classList.remove('print-login-cards');
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 60000);
  };
  return <div className="login-card-section">
    <div className="cr-top no-print">
      <div><h3>{title}</h3><div className="cr-muted">PIN plaintext chỉ hiển thị ở lần tạo/reset này. In/PDF hoặc sao chép trước khi đóng.</div></div>
      <div className="cr-row"><button className="cr-btn secondary" onClick={() => copyText(credentialsText, onMessage)}>Sao chép</button><button className="cr-btn" onClick={printCards}>🖨 In / Lưu PDF</button></div>
    </div>
    <div className="login-card-sheet">{credentials.map(x => {
      const joinUrl = fullJoinUrl(x);
      return <div className="student-login-card" key={x.id}>
        <div className="login-card-brand">Dám Nói Education 🎙️</div>
        <h3>{x.display_name}</h3>
        <div><span>Mã lớp</span><b>{x.class_code || cls.class_code}</b></div>
        <div><span>Mã học sinh</span><b>{x.student_code}</b></div>
        <div><span>PIN</span><b className="pin-value">{x.pin}</b></div>
        <p>Mở link dưới đây → chỉ cần nhập PIN:</p>
        {joinUrl ? <>
          <a href={joinUrl} target="_blank" rel="noreferrer" style={{display:'block',fontSize:11,overflowWrap:'anywhere',marginBottom:8}}>{joinUrl}</a>
          <div className="cr-row no-print">
            <button type="button" className="cr-btn secondary" onClick={() => copyText(joinUrl, onMessage)}>Sao chép link</button>
            <a className="cr-btn" href={joinUrl} target="_blank" rel="noreferrer" style={{textDecoration:'none'}}>Mở link ↗</a>
          </div>
        </> : <div className="cr-error friendly">Không tạo được join link cho học sinh này.</div>}
      </div>;
    })}</div>
  </div>;
}

export default function StudentRosterTools({ token, cls, onAdded }) {
  const [mode, setMode] = useState('bulk');
  const [names, setNames] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState(randomPin);
  const [credentials, setCredentials] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const parsedNames = useMemo(() => names.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, 60), [names]);

  const bulkCreate = async (event) => {
    event.preventDefault();
    if (!parsedNames.length || busy) return;
    setBusy(true); setMsg('');
    try {
      const d = await request(`/api/classroom/classes/${cls.id}/students/bulk`, {
        token,
        method: 'POST',
        body: { names: parsedNames },
      });
      setCredentials(d.items || []);
      setNames('');
      setMsg(`Đã tạo ${d.items?.length || 0} học sinh. Hãy in hoặc lưu thẻ đăng nhập ngay.`);
      await onAdded?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  const singleCreate = async (event) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setMsg('');
    try {
      const d = await request(`/api/classroom/classes/${cls.id}/students`, {
        token,
        method: 'POST',
        body: { displayName: name, studentCode: code, pin },
      });
      setCredentials([{ ...d.item, pin, class_code: d.classCode, joinPath: d.joinPath }]);
      setMsg(`Đã tạo ${d.item.display_name}. Hãy lưu thẻ đăng nhập trước khi rời màn hình.`);
      setName(''); setCode(''); setPin(randomPin());
      await onAdded?.();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="roster-tools">
      <div className="roster-mode no-print">
        <button className={`cr-btn ${mode === 'bulk' ? '' : 'secondary'}`} onClick={() => setMode('bulk')}>⚡ Thêm cả lớp</button>
        <button className={`cr-btn ${mode === 'single' ? '' : 'secondary'}`} onClick={() => setMode('single')}>+ Thêm 1 em</button>
      </div>

      {mode === 'bulk' ? (
        <form className="cr-form no-print" onSubmit={bulkCreate}>
          <label className="cr-label">
            Dán danh sách tên — mỗi dòng 1 học sinh
            <textarea
              className="cr-input cr-textarea roster-paste"
              placeholder={'Nguyễn Minh Anh\nTrần Hoàng Nam\nLê Gia Hân'}
              value={names}
              onChange={e => setNames(e.target.value)}
            />
          </label>
          <div className="cr-row" style={{ justifyContent: 'space-between' }}>
            <span className="cr-muted">{parsedNames.length} học sinh · tối đa 60/lần</span>
            <button className="cr-btn" disabled={busy || !parsedNames.length}>{busy ? 'Đang tạo…' : `Tạo ${parsedNames.length || ''} học sinh`}</button>
          </div>
        </form>
      ) : (
        <form className="cr-form no-print" onSubmit={singleCreate}>
          <input className="cr-input" placeholder="Tên học sinh" value={name} onChange={e => setName(e.target.value)} />
          <div className="cr-row">
            <input className="cr-input" style={{ flex: 1 }} placeholder="Mã HS (để trống = tự tạo)" value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
            <input className="cr-input" style={{ width: 110 }} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />
          </div>
          <button className="cr-btn" disabled={busy}>{busy ? 'Đang tạo…' : '+ Thêm học sinh'}</button>
        </form>
      )}

      {msg && <div className={msg.startsWith('Đã') ? 'cr-success' : 'cr-error'}>{msg}</div>}

      <LoginCards credentials={credentials} cls={cls} onMessage={setMsg} />
    </div>
  );
}
