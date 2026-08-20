export const API = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export const storage = {
  getTeacherToken: () => localStorage.getItem('damnoi_teacher_token') || '',
  setTeacherToken: (v) => v ? localStorage.setItem('damnoi_teacher_token', v) : localStorage.removeItem('damnoi_teacher_token'),
  getStudentToken: () => localStorage.getItem('damnoi_student_token') || '',
  setStudentToken: (v) => v ? localStorage.setItem('damnoi_student_token', v) : localStorage.removeItem('damnoi_student_token'),
};

export async function request(path, { token='', method='GET', body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type':'application/json', ...(token ? { Authorization:`Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

let googlePromise;
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve,reject) => {
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client'; s.async=true; s.defer=true;
    s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
  });
  return googlePromise;
}
