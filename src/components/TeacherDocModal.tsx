import { useEffect, useMemo, useState } from 'react';
import { X, MessageSquarePlus, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import mammoth from 'mammoth';

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
  const [contentHtml, setContentHtml] = useState('');
  const [contentText, setContentText] = useState('');
  const [pasteCount, setPasteCount] = useState(0);
  const [stagnantCount, setStagnantCount] = useState(0);
  const [assignmentInstructionsText, setAssignmentInstructionsText] = useState('');
  const [assignmentInstructionsHtml, setAssignmentInstructionsHtml] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);

  const [selectedText, setSelectedText] = useState('');
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
          'content,content_text,paste_count,stagnant_count,assignment_instructions_text,assignment_instructions_html'
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
            assignment_instructions_text?: string;
            assignment_instructions_html?: string;
          };
          if (typeof next.content === 'string') setContentHtml(next.content);
          if (typeof next.content_text === 'string') setContentText(next.content_text);
          if (typeof next.paste_count === 'number') setPasteCount(next.paste_count);
          if (typeof next.stagnant_count === 'number') setStagnantCount(next.stagnant_count);
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

  const toHtmlFromPlain = (text: string) => {
    const safe = (text ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return safe.replaceAll('\n', '<br/>');
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

  const [isImportingDocx, setIsImportingDocx] = useState(false);

  const importDocxTemplate = async (file: File) => {
    setIsImportingDocx(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value ?? '';
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const plain = tmp.innerText ?? '';

      const shouldApplyToContent = !contentText.trim();
      const updatePayload: Record<string, unknown> = {
        assignment_template_html: html,
        assignment_template_text: plain,
      };
      if (shouldApplyToContent) {
        updatePayload.content = html;
        updatePayload.content_text = plain;
        updatePayload.last_activity = new Date().toISOString();
        updatePayload.updated_at = new Date().toISOString();
      }

      const { error } = await supabase.from('documents').update(updatePayload).eq('id', documentId);
      if (error) throw error;
      if (shouldApplyToContent) {
        setContentHtml(html);
        setContentText(plain);
      }

      alert(shouldApplyToContent ? 'Template imported and inserted into the student doc.' : 'Template imported (student doc not overwritten).');
    } catch (err) {
      console.error('Docx import error:', err);
      alert('Failed to import DOCX template.');
    } finally {
      setIsImportingDocx(false);
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
              <span className="mx-2 text-gray-300">•</span>
              Stagnant: <span className="font-mono font-semibold">{stagnantCount}</span>
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
            {assignmentInstructionsHtml ? (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800">
                <div className="font-semibold text-gray-900 mb-1">Assignment instructions</div>
                <div dangerouslySetInnerHTML={{ __html: assignmentInstructionsHtml }} />
              </div>
            ) : null}
            <textarea
              value={contentText}
              readOnly
              onMouseUp={captureSelection}
              onKeyUp={captureSelection}
              className="w-full h-[420px] p-4 border border-gray-300 rounded-lg bg-gray-50 font-sans text-sm whitespace-pre-wrap"
            />
            <div className="mt-3">
              <div className="text-xs font-medium text-gray-600 mb-1">Rendered preview</div>
              <div
                className="max-h-40 overflow-auto border border-gray-200 rounded-lg bg-white p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: contentHtml || '' }}
              />
            </div>
            <div className="mt-3 text-xs text-gray-600">
              Selected: <span className="font-medium">{selectedText ? `"${selectedText.slice(0, 80)}${selectedText.length > 80 ? '…' : ''}"` : '—'}</span>
            </div>
          </div>

          <div className="p-5">
            <div className="mb-5">
              <div className="text-sm font-medium text-gray-700 mb-2">Assignment</div>

              <div className="mb-3">
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Instructions (shown above the doc)
                </label>
                <textarea
                  value={assignmentInstructionsText}
                  onChange={(e) => setAssignmentInstructionsText(e.target.value)}
                  className="w-full h-24 p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <div className="flex items-center justify-end mt-2">
                  <button
                    type="button"
                    onClick={saveInstructions}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
                  >
                    Save instructions
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Import DOCX template (applies to students if their doc is empty)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".docx"
                    className="text-sm"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importDocxTemplate(f);
                    }}
                    disabled={isImportingDocx}
                  />
                  <div className="text-xs text-gray-500">
                    {isImportingDocx ? 'Importing…' : 'Choose .docx file'}
                  </div>
                </div>
              </div>
            </div>

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

