import { useState, useEffect, useCallback, useRef } from 'react';
import { FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePeerConnection, StudentHeartbeat } from '../hooks/usePeerConnection';

interface EditorProps {
  sessionId: string;
  studentId: string;
  studentName: string;
  teacherPeerId: string;
  documentId: string;
}

export function Editor({ sessionId, studentId, studentName, teacherPeerId, documentId }: EditorProps) {
  const [content, setContent] = useState('');
  const [pasteCount, setPasteCount] = useState(0);
  const [lastInput, setLastInput] = useState(Date.now());
  const [isTabActive, setIsTabActive] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const { peerId, isConnected, sendHeartbeat } = usePeerConnection({
    role: 'student',
    teacherPeerId,
  });

  useEffect(() => {
    if (peerId) {
      supabase
        .from('documents')
        .update({ student_peer_id: peerId })
        .eq('id', documentId)
        .then(({ error }) => {
          if (error) console.error('Error updating peer ID:', error);
        });
    }
  }, [peerId, documentId]);

  // Load initial content + paste count (so refresh doesn't wipe the editor).
  useEffect(() => {
    let mounted = true;
    supabase
      .from('documents')
      .select('content,paste_count')
      .eq('id', documentId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error('Error loading document:', error);
          return;
        }
        if (data) {
          setContent(data.content ?? '');
          setPasteCount(typeof data.paste_count === 'number' ? data.paste_count : 0);
        }
      });

    return () => {
      mounted = false;
    };
  }, [documentId, sessionId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };

    const handleWindowFocus = () => setIsWindowFocused(true);
    const handleWindowBlur = () => setIsWindowFocused(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const heartbeat: StudentHeartbeat = {
        studentId,
        studentName,
        isTabActive,
        isWindowFocused,
        lastInput,
        snippet: content.substring(0, 200),
      };
      sendHeartbeat(heartbeat);
    }, 2000);

    return () => clearInterval(interval);
  }, [studentId, studentName, isTabActive, isWindowFocused, lastInput, content, sendHeartbeat]);

  const saveContent = useCallback(async (text: string) => {
    const { error } = await supabase
      .from('documents')
      .update({
        content: text,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (error) {
      console.error('Error saving content:', error);
    }
  }, [documentId]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setLastInput(Date.now());

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveContent(newContent);
    }, 1000);
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Keep default paste behavior; just count it.
    const next = pasteCount + 1;
    setPasteCount(next);
    setLastInput(Date.now());

    supabase
      .from('documents')
      .update({
        paste_count: next,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .then(({ error }) => {
        if (error) console.error('Error updating paste count:', error);
      });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-800">Lockd Editor</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-600">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>

          <div className="mb-4 flex gap-2">
            <div className={`px-3 py-1 rounded-full text-sm ${
              isTabActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {isTabActive ? 'Tab Active' : 'Tab Inactive'}
            </div>
            <div className={`px-3 py-1 rounded-full text-sm ${
              isWindowFocused ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>
              {isWindowFocused ? 'Window Focused' : 'Window Blurred'}
            </div>
            <div className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-700">
              Pastes: {pasteCount}
            </div>
          </div>

          <textarea
            value={content}
            onChange={handleContentChange}
            onPaste={handlePaste}
            placeholder="Start writing your work here..."
            className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />

          <div className="mt-2 text-sm text-gray-500">
            Last activity: {new Date(lastInput).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
