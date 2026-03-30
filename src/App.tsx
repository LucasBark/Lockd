import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Home } from './components/Home';
import { Landing } from './components/Landing';
import { CreateSession } from './components/CreateSession';
import { JoinSession } from './components/JoinSession';
import { MonitorGrid } from './components/MonitorGrid';
import { Editor } from './components/Editor';
import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';

type AuthState = { userId: string; isLoading: boolean; isAuthed: boolean };

const AuthContext = createContext<AuthState | null>(null);

function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthContext provider');
  return ctx;
}

function useAuthedUserId(): AuthState {
  const [userId, setUserId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setUserId(session?.user.id ?? '');
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setUserId(session?.user.id ?? '');
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { userId, isLoading, isAuthed: !!userId };
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthed, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!isAuthed) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth?next=${next}`} replace />;
  }

  return <>{children}</>;
}

async function getUserRole(): Promise<'teacher' | 'student' | 'unknown'> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return 'unknown';
  const meta = (data.user?.user_metadata ?? {}) as { role?: 'teacher' | 'student' };
  if (meta.role === 'teacher' || meta.role === 'student') return meta.role;
  return 'unknown';
}

function AuthedIndexRoute() {
  const { isAuthed, isLoading } = useAuth();
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    if (isLoading) return;
    if (!isAuthed) {
      setTarget('/');
      return;
    }
    getUserRole().then((role) => {
      if (!mounted) return;
      if (role === 'teacher') setTarget('/teacher/create');
      else if (role === 'student') setTarget('/student/join');
      else setTarget('/auth');
    });
    return () => {
      mounted = false;
    };
  }, [isAuthed, isLoading]);

  if (isLoading || target === null) return null;
  return <Navigate to={target} replace />;
}

function TeacherSessionRoute() {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  const sessionCode = searchParams.get('code') ?? '';

  if (!sessionId) return <Navigate to="/" replace />;
  return <MonitorGrid sessionId={sessionId} sessionCode={sessionCode} />;
}

function StudentEditorRoute() {
  const { sessionId, documentId } = useParams();
  const { userId } = useAuth();

  const [studentName, setStudentName] = useState<string>('');
  const [teacherPeerId, setTeacherPeerId] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) return;
      const meta = (data.user?.user_metadata ?? {}) as { full_name?: string };
      if (meta.full_name) setStudentName(meta.full_name);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Poll for teacher_peer_id until set (teacher may open dashboard after student)
  useEffect(() => {
    if (!sessionId) return;
    let mounted = true;

    const fetchTeacherPeerId = () => {
      supabase
        .from('sessions')
        .select('teacher_peer_id')
        .eq('id', sessionId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!mounted) return;
          if (error) {
            console.error('Error fetching teacher peer ID:', error);
            return;
          }
          const id = (data?.teacher_peer_id ?? '').toString().trim();
          if (id) setTeacherPeerId(id);
        });
    };

    fetchTeacherPeerId();
    const interval = setInterval(fetchTeacherPeerId, 2500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  if (!sessionId || !documentId) return <Navigate to="/" replace />;
  return (
    <Editor
      sessionId={sessionId}
      studentId={userId}
      studentName={studentName}
      teacherPeerId={teacherPeerId}
      documentId={documentId}
    />
  );
}

function App() {
  const auth = useAuthedUserId();

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/"
          element={
            auth.isAuthed ? (
              <AuthedIndexRoute />
            ) : (
              <Landing />
            )
          }
        />
        <Route
          path="/home"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/create"
          element={
            <RequireAuth>
              <CreateSession userId={auth.userId} />
            </RequireAuth>
          }
        />
        <Route
          path="/teacher/session/:sessionId"
          element={
            <RequireAuth>
              <TeacherSessionRoute />
            </RequireAuth>
          }
        />
        <Route
          path="/student/join"
          element={
            <JoinSession />
          }
        />
        <Route
          path="/student/session/:sessionId/doc/:documentId"
          element={
            <RequireAuth>
              <StudentEditorRoute />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}

export default App;
