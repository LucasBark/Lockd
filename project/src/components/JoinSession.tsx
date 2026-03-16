import { useState } from 'react';
import { Users, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface JoinSessionProps {
  userId: string;
}

export function JoinSession({ userId }: JoinSessionProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const handleJoinSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;

    setIsJoining(true);

    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('sessions')
        .select('*')
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
          `/student/session/${sessionData.id}/doc/${existingDoc.id}?name=${encodeURIComponent(existingDoc.student_name)}`,
          { replace: true }
        );
        return;
      }

      const { data: documentData, error: documentError } = await supabase
        .from('documents')
        .insert({
          session_id: sessionData.id,
          student_id: userId,
          student_name: name.trim(),
          content: '',
        })
        .select()
        .single();

      if (documentError) throw documentError;

      if (documentData) {
        navigate(
          `/student/session/${sessionData.id}/doc/${documentData.id}?name=${encodeURIComponent(name.trim())}`,
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Join Session</h1>
          <p className="text-gray-600">Enter your session code to begin</p>
        </div>

        <form onSubmit={handleJoinSession}>
          <div className="mb-4">
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>

          <div className="mb-6">
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Session Code
            </label>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g., ABC123"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-lg text-center"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isJoining || !code.trim() || !name.trim()}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isJoining ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              'Join Session'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
