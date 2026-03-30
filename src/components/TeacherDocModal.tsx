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

type TodoItem = { id: string; text: string; completed: boolean };

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
  const [contentHtml, setContentHtml] = useState('');
  const [contentText, setContentText] = useState('');
  const [pasteCount, setPasteCount] = useState(0);
  const [stagnantCount, setStagnantCount] = useState(0);
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [assignmentInstructionsText, setAssignmentInstructionsText] = useState('');
  const [assignmentInstructionsHtml, setAssignmentInstructionsHtml] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);

  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [todoEditorText, setTodoEditorText] = useState('');

  const context = useMemo(() => {
    if (selectionStart == null || selectionEnd == null) return '';
    const start = Math.max(0, selectionStart - 60);
    const end = Math.min(contentText.length, selectionEnd + 60);
    return contentText.slice(start, end);
  }, [contentText, selectionStart, selectionEnd]);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([
      supabase
        .from('documents')
        .select(
          'content,content_text,paste_count,stagnant_count,assignment_instructions_text,assignment_instructions_html,todo_list_json'
        )
        .eq('id', documentId)
        .maybeSingle(),
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
          setContentHtml(docRes.data.content ?? '');
          setContentText(docRes.data.content_text ?? '');
          setPasteCount(typeof docRes.data.paste_count === 'number' ? docRes.data.paste_count : 0);
          setStagnantCount(typeof docRes.data.stagnant_count === 'number' ? docRes.data.stagnant_count : 0);
          setAssignmentInstructionsText(docRes.data.assignment_instructions_text ?? '');
          setAssignmentInstructionsHtml(docRes.data.assignment_instructions_html ?? '');
          setTodoList((docRes.data.todo_list_json as TodoItem[]) ?? []);
          setTodoEditorText(
            ((docRes.data.todo_list_json as TodoItem[]) ?? [])
              .map((t) => t.text)
              .filter((t) => typeof t === 'string' && t.trim().length > 0)
              .join('\n')
          );
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
          const next = payload.new as {
            content?: string;
            content_text?: string;
            paste_count?: number;
            stagnant_count?: number;
            todo_list_json?: TodoItem[];
            assignment_instructions_text?: string;
            assignment_instructions_html?: string;
          };
          if (typeof next.content === 'string') setContentHtml(next.content);
          if (typeof next.content_text === 'string') setContentText(next.content_text);
          if (typeof next.paste_count === 'number') setPasteCount(next.paste_count);
          if (typeof next.stagnant_count === 'number') setStagnantCount(next.stagnant_count);
          if (Array.isArray(next.todo_list_json)) setTodoList(next.todo_list_json as TodoItem[]);
          if (typeof next.assignment_instructions_text === 'string') setAssignmentInstructionsText(next.assignment_instructions_text);
          if (typeof next.assignment_instructions_html === 'string') setAssignmentInstructionsHtml(next.assignment_instructions_html);
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

  const setTodoForStudent = async () => {
    const lines = (todoEditorText ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const next = lines.map((t, idx) => ({
      id: String(idx),
      text: t,
      completed: false,
    }));

    const { error } = await supabase.from('documents').update({ todo_list_json: next }).eq('id', documentId);
    if (error) {
      console.error('Error setting todo list:', error);
      alert('Failed to set to-do list.');
      return;
    }
    setTodoList(next);
  };

  const toHtmlFromPlain = (text: string) => {
    const safe = (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return safe.replace(/\n/g, '<br/>');
  };

  const saveInstructions = async () => {
    const plain = assignmentInstructionsText ?? '';
    const html = toHtmlFromPlain(plain);
    const { error } = await supabase
      .from('documents')
      .update({
        assignment_instructions_text: plain,
        assignment_instructions_html: html,
      })
      .eq('id', documentId);
    if (error) {
      console.error('Error saving instructions:', error);
      alert('Failed to save instructions.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-stone-900">Student doc: {studentName}</div>
            <div className="text-sm text-stone-600">
              Pastes: <span className="font-mono font-semibold">{pasteCount}</span>
              <span className="mx-2 text-stone-300">•</span>
              Stagnant: <span className="font-mono font-semibold">{stagnantCount}</span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 transition hover:bg-stone-100" aria-label="Close">
            <X className="h-5 w-5 text-stone-700" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="border-b border-stone-200 p-6 lg:border-b-0 lg:border-r">
            <div className="mb-2 text-sm font-medium text-stone-700">Preview (select text to anchor a suggestion)</div>
            {assignmentInstructionsHtml ? (
              <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50/80 p-3 text-sm text-slate-800">
                <div className="mb-1 font-semibold text-slate-900">Assignment instructions</div>
                <div dangerouslySetInnerHTML={{ __html: assignmentInstructionsHtml }} />
              </div>
            ) : null}
            <textarea
              value={contentText}
              readOnly
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              className="h-[420px] w-full whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm"
            />
            <div className="mt-3">
              <div className="mb-1 text-xs font-medium text-slate-600">Rendered preview</div>
              <div
                className="max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: contentHtml || '' }}
              />
            </div>
            <div className="mt-3 text-xs text-slate-600">
              Selected: <span className="font-medium">{selectedText ? `"${selectedText.slice(0, 80)}${selectedText.length > 80 ? '…' : ''}"` : '—'}</span>
            </div>
          </div>

          <div className="p-6">
            <div className="mb-5">
              <div className="mb-2 text-sm font-medium text-slate-700">Assignment</div>

              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Instructions (shown above the doc)
                </label>
                <textarea
                  value={assignmentInstructionsText}
                  onChange={(e) => setAssignmentInstructionsText(e.target.value)}
                  className="textarea-base h-24"
                />
                <div className="flex items-center justify-end mt-2">
                  <button
                    type="button"
                    onClick={saveInstructions}
                    className="btn-primary"
                  >
                    Save instructions
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Template import is handled in the dashboard before students join.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="text-sm font-medium text-slate-700">Suggestions</div>
              <div className="text-xs text-slate-500">{suggestions.length} total</div>
            </div>

            <div className="flex gap-2">
              <input
                value={suggestionText}
                onChange={(e) => setSuggestionText(e.target.value)}
                placeholder="Write a suggestion…"
                className="input-base flex-1"
              />
              <button
                type="button"
                onClick={submitSuggestion}
                disabled={isSubmitting || !suggestionText.trim()}
                className="btn-primary"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Add
              </button>
            </div>

            {isLoading ? (
              <div className="mt-4 text-sm text-slate-500">Loading…</div>
            ) : (
              <div className="mt-4 space-y-3 max-h-[380px] overflow-auto pr-1">
                {suggestions.length === 0 ? (
                  <div className="text-sm text-slate-500">No suggestions yet.</div>
                ) : (
                  suggestions.map((s) => (
                    <div
                      key={s.id}
                      className={`rounded-xl border p-3 ${s.resolved ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {s.selected_text ? (
                            <div className="mb-1 truncate text-xs text-slate-600">
                              On: <span className="font-medium">"{s.selected_text}"</span>
                            </div>
                          ) : (
                            <div className="mb-1 text-xs text-slate-400">No selection</div>
                          )}
                          <div className="text-sm text-slate-900">{s.suggestion}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {new Date(s.created_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleResolved(s.id, !s.resolved)}
                          className={`shrink-0 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                            s.resolved
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
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
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="text-sm font-medium text-slate-700">Student to-do progress</div>
                <div className="text-xs text-slate-500">
                  {todoList.filter((t) => t.completed).length}/{todoList.length} done
                </div>
              </div>

              {todoList.length === 0 ? (
                <div className="mb-4 text-sm text-slate-500">No to-do items yet.</div>
              ) : (
                <div className="space-y-2 mb-4">
                  {todoList.map((t) => (
                    <label key={t.id} className="flex items-start gap-2 text-sm text-slate-800">
                      <input type="checkbox" checked={t.completed} readOnly className="mt-0.5" />
                      <span className={t.completed ? 'text-slate-500 line-through' : ''}>{t.text}</span>
                    </label>
                  ))}
                </div>
              )}

              <div className="mb-1 text-xs font-medium text-slate-600">Override to-do for this student</div>
              <textarea
                value={todoEditorText}
                onChange={(e) => setTodoEditorText(e.target.value)}
                className="textarea-base h-24"
                placeholder="One task per line"
              />
              <div className="flex justify-end mt-2">
                <button
                  type="button"
                  onClick={setTodoForStudent}
                  className="btn-primary"
                >
                  Set to-do for this student
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

