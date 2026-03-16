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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-100 flex items-center justify-center p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-800 mb-4">Lockd</h1>
          <p className="text-xl text-gray-600">Real-time classroom monitoring with AI</p>
        </div>

        {lastSession && (
          <div className="mb-6 flex justify-center">
            <button
              type="button"
              onClick={handleRejoin}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Rejoin last session
            </button>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <button
            onClick={() => navigate('/teacher/create')}
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all transform hover:-translate-y-1 border-2 border-transparent hover:border-blue-500"
          >
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap className="w-10 h-10 text-blue-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Teacher</h2>
            <p className="text-gray-600">Create a session and monitor your students in real-time</p>
            <div className="mt-4 text-sm text-gray-500">
              Features: AI analysis, focus tracking, live previews
            </div>
          </button>

          <button
            onClick={() => navigate('/student/join')}
            className="bg-white rounded-lg shadow-lg p-8 hover:shadow-xl transition-all transform hover:-translate-y-1 border-2 border-transparent hover:border-green-500"
          >
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users className="w-10 h-10 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Student</h2>
            <p className="text-gray-600">Join a session with your class code and start working</p>
            <div className="mt-4 text-sm text-gray-500">
              Features: Auto-save, collaborative writing, instant feedback
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
