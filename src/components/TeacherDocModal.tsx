import { useEffect, useMemo, useState } from 'react';
import { X, MessageSquarePlus, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type SuggestionRow = {
  id: string;
  teacher_id: string;
  selected_text: string;
  context: string;
  suggestion: string;
  resolved: boolean;
  created_at: string;
};

export function TeacherDocModal({
  documentId,
  studentName,
  onClose,
}: {
  documentId: string;
  studentName: string;
  onClose: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [content, setContent] = useState('');
  const [pasteCount, setPasteCount] = useState(0);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);

  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const context = useMemo(() => {
    if (selectionStart == null || selectionEnd == null) return '';
    const start = Math.max(0, selectionStart - 60);
    const end = Math.min(content.length, selectionEnd + 60);
    return content.slice(start, end);
  }, [content, selectionStart, selectionEnd]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([
      supabase.from('documents').select('content,paste_count').eq('id', documentId).maybeSingle(),
      supabase
        .from('document_suggestions')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false }),
    ])
      .then(([docRes, sugRes]) => {
        if (!mounted) return;
        if (docRes.error) console.error('Error loading document:', docRes.error);
        if (sugRes.error) console.error('Error loading suggestions:', sugRes.error);

        if (docRes.data) {
          setContent(docRes.data.content ?? '');
          setPasteCount(typeof docRes.data.paste_count === 'number' ? docRes.data.paste_count : 0);
        }
        if (sugRes.data) setSuggestions(sugRes.data as SuggestionRow[]);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    const docChannel = supabase
      .channel(`doc-${documentId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'documents', filter: `id=eq.${documentId}` },
        (payload) => {
          const next = payload.new as { content?: string; paste_count?: number };
          if (typeof next.content === 'string') setContent(next.content);
          if (typeof next.paste_count === 'number') setPasteCount(next.paste_count);
        }
      )
      .subscribe();

    const sugChannel = supabase
      .channel(`sug-${documentId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_suggestions', filter: `document_id=eq.${documentId}` },
        () => {
          supabase
            .from('document_suggestions')
            .select('*')
            .eq('document_id', documentId)
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
              if (error) {
                console.error('Error refreshing suggestions:', error);
                return;
              }
              if (data) setSuggestions(data as SuggestionRow[]);
            });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      docChannel.unsubscribe();
      sugChannel.unsubscribe();
    };
  }, [documentId]);

  const captureSelection = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    if (end <= start) {
      setSelectedText('');
      setSelectionStart(null);
      setSelectionEnd(null);
      return;
    }
    setSelectedText(el.value.slice(start, end));
    setSelectionStart(start);
    setSelectionEnd(end);
  };

  const submitSuggestion = async () => {
    const trimmed = suggestionText.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const teacherId = userRes.user?.id ?? '';
      if (!teacherId) throw new Error('Not authenticated');

      const { error } = await supabase.from('document_suggestions').insert({
        document_id: documentId,
        teacher_id: teacherId,
        selected_text: selectedText ?? '',
        context,
        suggestion: trimmed,
      });

      if (error) throw error;
      setSuggestionText('');
    } catch (err) {
      console.error('Error creating suggestion:', err);
      alert('Failed to create suggestion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleResolved = async (id: string, resolved: boolean) => {
    const { error } = await supabase.from('document_suggestions').update({ resolved }).eq('id', id);
    if (error) {
      console.error('Error updating suggestion:', error);
      alert('Failed to update suggestion.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <div className="text-lg font-semibold text-gray-900">Student doc: {studentName}</div>
            <div className="text-sm text-gray-600">
              Pastes: <span className="font-mono font-semibold">{pasteCount}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-700" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          <div className="p-5 border-b lg:border-b-0 lg:border-r">
            <div className="text-sm font-medium text-gray-700 mb-2">Preview (select text to anchor a suggestion)</div>
            <textarea
              value={content}
              readOnly
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              className="w-full h-[420px] p-4 border border-gray-300 rounded-lg bg-gray-50 font-sans text-sm whitespace-pre-wrap"
            />
            <div className="mt-3 text-xs text-gray-600">
              Selected: <span className="font-medium">{selectedText ? `"${selectedText.slice(0, 80)}${selectedText.length > 80 ? '…' : ''}"` : '—'}</span>
            </div>
          </div>

          <div className="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-medium text-gray-700">Suggestions</div>
              <div className="text-xs text-gray-500">{suggestions.length} total</div>
            </div>

            <div className="flex gap-2">
              <input
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                placeholder="Write a suggestion…"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={submitSuggestion}
                disabled={isSubmitting || !suggestionText.trim()}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Add
              </button>
            </div>

            {isLoading ? (
              <div className="mt-4 text-sm text-gray-500">Loading…</div>
            ) : (
              <div className="mt-4 space-y-3 max-h-[380px] overflow-auto pr-1">
                {suggestions.length === 0 ? (
                  <div className="text-sm text-gray-500">No suggestions yet.</div>
                ) : (
                  suggestions.map((s) => (
                    <div
                      key={s.id}
                      className={`border rounded-lg p-3 ${s.resolved ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {s.selected_text ? (
                            <div className="text-xs text-gray-600 mb-1 truncate">
                              On: <span className="font-medium">"{s.selected_text}"</span>
                            </div>
                          ) : (
                            <div className="text-xs text-gray-400 mb-1">No selection</div>
                          )}
                          <div className="text-sm text-gray-900">{s.suggestion}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {new Date(s.created_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleResolved(s.id, !s.resolved)}
                          className={`shrink-0 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium ${
                            s.resolved
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          {s.resolved ? 'Resolved' : 'Mark resolved'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

