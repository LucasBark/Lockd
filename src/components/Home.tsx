import { useState, useEffect } from 'react';
import { GraduationCap, Users, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const TEACHER_SESSION_KEY = 'lockd_teacher_session';

export function Home() {
  const navigate = useNavigate();
  const [lastSession, setLastSession] = useState<{ sessionId: string; sessionCode: string } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TEACHER_SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { sessionId?: string; sessionCode?: string };
        if (parsed?.sessionId && parsed?.sessionCode) {
          setLastSession({ sessionId: parsed.sessionId, sessionCode: parsed.sessionCode });
        }
      }
    } catch {
      setLastSession(null);
    }
  }, []);

  const handleRejoin = () => {
    if (!lastSession) return;
    navigate(
      `/teacher/session/${lastSession.sessionId}?code=${encodeURIComponent(lastSession.sessionCode)}`
    );
  };

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="w-full max-w-5xl">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-5xl font-semibold text-stone-900">Lockd</h1>
          <p className="text-lg text-stone-600">Real-time classroom monitoring with AI</p>
        </div>

        {lastSession && (
          <div className="mb-6 flex justify-center">
            <button type="button" onClick={handleRejoin} className="btn-primary">
              <RotateCcw className="w-4 h-4" />
              Rejoin last session
            </button>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <button
            onClick={() => navigate('/teacher/create')}
            className="app-card rounded-2xl border p-8 text-left transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
              <GraduationCap className="h-6 w-6 text-stone-700" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-stone-900">Teacher</h2>
            <p className="text-stone-600">Create a session and monitor your students in real-time</p>
            <div className="mt-4 text-sm text-stone-500">
              Features: AI analysis, focus tracking, live previews
            </div>
          </button>

          <button
            onClick={() => navigate('/student/join')}
            className="app-card rounded-2xl border p-8 text-left transition hover:-translate-y-0.5 hover:border-stone-400 hover:shadow-md"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stone-100">
              <Users className="h-6 w-6 text-stone-700" />
            </div>
            <h2 className="mb-2 text-2xl font-semibold text-stone-900">Student</h2>
            <p className="text-stone-600">Join a session with your class code and start working</p>
            <div className="mt-4 text-sm text-stone-500">
              Features: Auto-save, collaborative writing, instant feedback
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
