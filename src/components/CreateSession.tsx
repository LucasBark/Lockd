import { useState } from 'react';
import { Plus, Loader } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface CreateSessionProps {
  userId: string;
}

export function CreateSession({ userId }: CreateSessionProps) {
  const [title, setTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsCreating(true);

    try {
      const code = generateCode();

      const { data, error } = await supabase
        .from('sessions')
        .insert({
          code,
          teacher_id: userId,
          title: title.trim(),
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        navigate(`/teacher/session/${data.id}?code=${encodeURIComponent(data.code)}`, { replace: true });
      }
    } catch (error) {
      console.error('Error creating session:', error);
      alert('Failed to create session. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="app-shell flex items-center justify-center">
      <div className="app-card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50">
            <Plus className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold text-slate-900">Create Session</h1>
          <p className="text-slate-600">Start monitoring your classroom</p>
        </div>

        <form onSubmit={handleCreateSession}>
          <div className="mb-6">
            <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-700">
              Session Title
            </label>
            <input
              type="text"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., English Class - Period 2"
              className="input-base"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isCreating || !title.trim()}
            className="btn-primary w-full py-3"
          >
            {isCreating ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Session'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
