import React from 'react';
import StudentApp from './student/StudentApp.jsx';
import TeacherApp from './teacher/TeacherApp.jsx';
import ParentReport from './reports/ParentReport.jsx';
import './classroom.css';

function EducationPortal() {
  return (
    <div className="cr">
      <div className="cr-shell portal-choice">
        <div className="cr-center">
          <img src="/toki.png" alt="Toki" style={{ width: 90 }} />
          <h1>Dám Nói Education</h1>
          <p className="cr-muted">Học ở lớp. Nói ở Dám Nói.</p>
        </div>
        <div className="cr-grid" style={{ marginTop: 24 }}>
          <a href="/student">
            <div className="cr-card">
              <div style={{ fontSize: 36 }}>🎒</div>
              <h2>Học sinh</h2>
              <p className="cr-muted">Mở link giáo viên gửi hoặc vào lớp bằng mã + PIN.</p>
            </div>
          </a>
          <a href="/teacher">
            <div className="cr-card">
              <div style={{ fontSize: 36 }}>👩‍🏫</div>
              <h2>Giáo viên</h2>
              <p className="cr-muted">Tạo lớp, giao speaking mission và xem kết quả.</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path.startsWith('/report/')) return <ParentReport />;
  if (path.startsWith('/join/')) {
    const [, , rawClassCode = '', rawStudentCode = ''] = path.split('/');
    return <StudentApp join={{
      classCode: decodeURIComponent(rawClassCode),
      studentCode: decodeURIComponent(rawStudentCode),
    }} />;
  }
  if (path.startsWith('/student')) return <StudentApp />;
  if (path.startsWith('/teacher')) return <TeacherApp />;
  return <EducationPortal />;
}
