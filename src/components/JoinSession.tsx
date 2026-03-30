import { useEffect, useMemo, useState } from 'react';
import { Users, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

type StudentMeta = { full_name?: string; role?: 'teacher' | 'student' };

export function JoinSession() {
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const fullName = useMemo(() => {
    const f = firstName.trim();
    const l = lastName.trim();
    return [f, l].filter(Boolean).join(' ');
  }, [firstName, lastName]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error) return;
      const meta = (data.user?.user_metadata ?? {}) as StudentMeta;
      const existing = (meta.full_name ?? '').trim();
      if (!existing) return;
      const parts = existing.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        if (!firstName) setFirstName(parts[0]);
        return;
      }
      if (!firstName) setFirstName(parts[0]);
      if (!lastName) setLastName(parts.slice(1).join(' '));
    });
    return () => {
      mounted = false;
    };
  }, [firstName, lastName]);

  const ensureStudentSession = async (desiredFullName: string) => {
    // If the user isn't signed in, create an anonymous session (no email required).
    const { data: sessionRes } = await supabase.auth.getSession();
    if (!sessionRes.session) {
      // Requires Supabase "Anonymous sign-ins" enabled for the project.
      const { error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
    }

    // Ensure we have role + name metadata so routing works and the editor header is correct.
    const desired = desiredFullName.trim();
    if (desired) {
      await supabase.auth.updateUser({
        data: {
          role: 'student',
          full_name: desired,
        },
      });
    } else {
      await supabase.auth.updateUser({
        data: {
          role: 'student',
        },
      });
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    const uid = userRes.user?.id ?? '';
    if (!uid) throw new Error('Unable to start guest session');
    return uid;
  };

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !firstName.trim() || !lastName.trim()) return;

    setIsJoining(true);

    try {
      const userId = await ensureStudentSession(fullName);
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select(
          'id,assignment_template_html,assignment_template_text,assignment_instructions_html,assignment_instructions_text,todo_list_json'
        )
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .maybeSingle();

      if (sessionError) throw sessionError;

      if (!sessionData) {
        alert('Session not found. Please check the code and try again.');
        setIsJoining(false);
        return;
      }

      const { data: existingDoc } = await supabase
        .from('documents')
        .select('*')
        .eq('session_id', sessionData.id)
        .eq('student_id', userId)
        .maybeSingle();

      if (existingDoc) {
        navigate(
          `/student/session/${sessionData.id}/doc/${existingDoc.id}`,
          { replace: true }
        );
        return;
      }

      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .insert({
          session_id: sessionData.id,
          student_id: userId,
          student_name: fullName.trim(),
          content: '',
          content_text: '',
          assignment_template_html: sessionData.assignment_template_html ?? '',
          assignment_template_text: sessionData.assignment_template_text ?? '',
          assignment_instructions_html: sessionData.assignment_instructions_html ?? '',
          assignment_instructions_text: sessionData.assignment_instructions_text ?? '',
          todo_list_json: sessionData.todo_list_json ?? [],
        })
        .select()
        .single();

      if (documentError) throw documentError;

      if (documentData) {
        navigate(
          `/student/session/${sessionData.id}/doc/${documentData.id}`,
          { replace: true }
        );
      }
    } catch (error) {
      console.error('Error joining session:', error);
      alert('Failed to join session. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="app-card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-emerald-50">
            <Users className="h-7 w-7 text-emerald-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-slate-900">Join Class</h1>
          <p className="text-slate-600">Guest mode: no email required</p>
        </div>

        <form onSubmit={handleJoinSession}>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="firstName" className="mb-2 block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g., Alex"
                className="input-base"
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label htmlFor="lastName" className="mb-2 block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g., Johnson"
                className="input-base"
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="code" className="mb-2 block text-sm font-medium text-slate-700">
              Class code
            </label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., ABC123"
              className="input-base font-mono text-lg text-center tracking-widest uppercase"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isJoining || !code.trim() || !firstName.trim() || !lastName.trim()}
            className="btn-primary w-full py-3"
          >
            {isJoining ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              'Join class'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
