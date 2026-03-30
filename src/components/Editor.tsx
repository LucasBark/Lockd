import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Bold, Italic, Underline, Highlighter, Copy, MessageSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePeerConnection, StudentHeartbeat } from '../hooks/usePeerConnection';

interface EditorProps {
  sessionId: string;
  studentId: string;
  studentName: string;
  teacherPeerId: string;
  documentId: string;
}

const INACTIVITY_MS = 60_000;
const STAGNANT_CHECK_MS = 3_000;

const FONT_OPTIONS: Array<{ label: string; value: string; cssFamily: string }> = [
  { label: 'Times New Roman', value: 'Times New Roman', cssFamily: '"Times New Roman", Times, serif' },
  { label: 'Arial', value: 'Arial', cssFamily: 'Arial, Helvetica, sans-serif' },
  { label: 'EB Garamond', value: 'EB Garamond', cssFamily: '"EB Garamond", Garamond, serif' },
  { label: 'Comic Sans', value: 'Comic Sans MS', cssFamily: '"Comic Sans MS", "Comic Sans", cursive' },
];

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

export function Editor({ sessionId, studentId, studentName, teacherPeerId, documentId }: EditorProps) {
  const [content, setContent] = useState(''); // stored as HTML
  const [contentText, setContentText] = useState(''); // plain text mirror
  const [assignmentInstructionsHtml, setAssignmentInstructionsHtml] = useState('');
  const [assignmentTemplateHtml, setAssignmentTemplateHtml] = useState('');
  const [assignmentTemplateText, setAssignmentTemplateText] = useState('');
  const [todoList, setTodoList] = useState<TodoItem[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [stagnantCount, setStagnantCount] = useState(0);
  const [tabbedOutCount, setTabbedOutCount] = useState(0);
  const [lastInput, setLastInput] = useState(Date.now());
  const [isTabActive, setIsTabActive] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const saveTimeoutRef = useRef<number | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stagnantLatchRef = useRef(false);
  const tabbedOutLatchRef = useRef(false);
  const templateAppliedRef = useRef(false);
  const contentTextRef = useRef(contentText);
  const [fontValue, setFontValue] = useState(FONT_OPTIONS[0].value);
  const [copyStatus, setCopyStatus] = useState<string>('');
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [formatActive, setFormatActive] = useState({
    bold: false,
    italic: false,
    underline: false,
    highlight: false,
  });
  const fontCssFamily = useMemo(
    () => (FONT_OPTIONS.find((f) => f.value === fontValue) ?? FONT_OPTIONS[0]).cssFamily,
    [fontValue]
  );

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
      .select(
        'content,content_text,paste_count,stagnant_count,tabbed_out_count,assignment_instructions_html,assignment_instructions_text,assignment_template_html,assignment_template_text,todo_list_json'
      )
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
          setContentText(data.content_text ?? '');
          setAssignmentInstructionsHtml(data.assignment_instructions_html ?? '');
          setAssignmentTemplateHtml(data.assignment_template_html ?? '');
          setAssignmentTemplateText(data.assignment_template_text ?? '');
          setTodoList((data.todo_list_json as TodoItem[]) ?? []);
          setPasteCount(typeof data.paste_count === 'number' ? data.paste_count : 0);
          setStagnantCount(typeof data.stagnant_count === 'number' ? data.stagnant_count : 0);
          setTabbedOutCount(typeof data.tabbed_out_count === 'number' ? data.tabbed_out_count : 0);
        }
      });

    return () => {
      mounted = false;
    };
  }, [documentId, sessionId]);

  useEffect(() => {
    const shouldApply = !templateAppliedRef.current && !contentText.trim() && !!assignmentTemplateHtml.trim();
    if (!shouldApply) return;

    templateAppliedRef.current = true;

    setContent(assignmentTemplateHtml);
    setContentText(assignmentTemplateText);

    // Persist so teachers/other tabs see the populated content.
    supabase
      .from('documents')
      .update({
        content: assignmentTemplateHtml,
        content_text: assignmentTemplateText,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .then(({ error }) => {
        if (error) console.error('Error applying template:', error);
      });
  }, [assignmentTemplateHtml, assignmentTemplateText, contentText, documentId]);

  useEffect(() => {
    contentTextRef.current = contentText;
  }, [contentText]);

  useEffect(() => {
    const channel = supabase
      .channel(`student-doc-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'documents',
          filter: `id=eq.${documentId}`,
        },
        (payload) => {
          const next = payload.new as any;

          if (typeof next.assignment_instructions_html === 'string') setAssignmentInstructionsHtml(next.assignment_instructions_html);
          if (typeof next.assignment_template_html === 'string') setAssignmentTemplateHtml(next.assignment_template_html);
          if (typeof next.assignment_template_text === 'string') setAssignmentTemplateText(next.assignment_template_text);

          if (Array.isArray(next.todo_list_json)) setTodoList(next.todo_list_json as TodoItem[]);

          const incomingContentText = typeof next.content_text === 'string' ? next.content_text : '';
          if (contentTextRef.current.trim().length === 0 && incomingContentText.trim().length > 0) {
            // Only update content for the initial template insertion / teacher overrides.
            setContent(typeof next.content === 'string' ? next.content : '');
            setContentText(incomingContentText);
            templateAppliedRef.current = true;
          }

          if (typeof next.paste_count === 'number') setPasteCount(next.paste_count);
          if (typeof next.stagnant_count === 'number') setStagnantCount(next.stagnant_count);
          if (typeof next.tabbed_out_count === 'number') setTabbedOutCount(next.tabbed_out_count);
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [documentId]);

  useEffect(() => {
    let mounted = true;

    const fetchSuggestions = async () => {
      const { data, error } = await supabase
        .from('document_suggestions')
        .select('*')
        .eq('document_id', documentId)
        .order('created_at', { ascending: false });

      if (!mounted) return;
      if (error) {
        console.error('Error loading suggestions:', error);
        return;
      }

      setSuggestions((data ?? []) as SuggestionRow[]);
    };

    fetchSuggestions();

    const channel = supabase
      .channel(`student-suggestions-${documentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'document_suggestions',
          filter: `document_id=eq.${documentId}`,
        },
        () => {
          fetchSuggestions();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      channel.unsubscribe();
    };
  }, [documentId]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      const hidden = document.hidden;
      setIsTabActive(!hidden);
      if (hidden) {
        if (!tabbedOutLatchRef.current) {
          tabbedOutLatchRef.current = true;
          setTabbedOutCount((prev) => {
            const next = prev + 1;
            supabase
              .from('documents')
              .update({
                tabbed_out_count: next,
                updated_at: new Date().toISOString(),
              })
              .eq('id', documentId)
              .then(({ error }) => {
                if (error) console.error('Error updating tabbed out count:', error);
              });
            return next;
          });
        }
      } else {
        tabbedOutLatchRef.current = false;
      }
    };

    const handleWindowFocus = () => setIsWindowFocused(true);
    const handleWindowBlur = () => setIsWindowFocused(false);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    // Sync initial state.
    handleVisibilityChange();

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [documentId]);

  useEffect(() => {
    const interval = setInterval(() => {
      const heartbeat: StudentHeartbeat = {
        studentId,
        studentName,
        isTabActive,
        isWindowFocused,
        lastInput,
        snippet: (contentText || '').substring(0, 200),
      };
      sendHeartbeat(heartbeat);
    }, 2000);

    return () => clearInterval(interval);
  }, [studentId, studentName, isTabActive, isWindowFocused, lastInput, contentText, sendHeartbeat]);

  const saveContent = useCallback(async (html: string, plain: string) => {
    const { error } = await supabase
      .from('documents')
      .update({
        content: html,
        content_text: plain,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId);

    if (error) {
      console.error('Error saving content:', error);
    }
  }, [documentId]);

  // Keep the editable div in sync when content loads/changes externally.
  useEffect(() => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML !== content) {
      editorRef.current.innerHTML = content || '';
    }
  }, [content]);

  const scheduleSave = useCallback((nextHtml: string, nextPlain: string) => {
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveContent(nextHtml, nextPlain);
    }, 700);
  }, [saveContent]);

  const readEditor = useCallback(() => {
    const el = editorRef.current;
    if (!el) return { html: '', plain: '' };
    const html = el.innerHTML;
    const plain = el.innerText ?? '';
    return { html, plain };
  }, []);

  const handleEditorInput = () => {
    const { html, plain } = readEditor();
    setContent(html);
    setContentText(plain);
    const now = Date.now();
    setLastInput(now);
    stagnantLatchRef.current = false;
    scheduleSave(html, plain);
  };

  const incrementPasteCount = useCallback(() => {
    setPasteCount((prev) => {
      const next = prev + 1;
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
      return next;
    });
  }, [documentId]);

  const incrementStagnantCount = useCallback(() => {
    setStagnantCount((prev) => {
      const next = prev + 1;
      supabase
        .from('documents')
        .update({
          stagnant_count: next,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .then(({ error }) => {
          if (error) console.error('Error updating stagnant count:', error);
        });
      return next;
    });
  }, [documentId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isTabActive || !isWindowFocused) {
        stagnantLatchRef.current = false;
        return;
      }
      const inactiveFor = Date.now() - lastInput;
      if (inactiveFor > INACTIVITY_MS) {
        if (!stagnantLatchRef.current) {
          stagnantLatchRef.current = true;
          incrementStagnantCount();
        }
      } else {
        stagnantLatchRef.current = false;
      }
    }, STAGNANT_CHECK_MS);

    return () => window.clearInterval(interval);
  }, [isTabActive, isWindowFocused, lastInput, incrementStagnantCount]);

  const updateFormatActive = useCallback(() => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || !sel.anchorNode) {
      setFormatActive({ bold: false, italic: false, underline: false, highlight: false });
      return;
    }

    const isInsideEditor = el.contains(sel.anchorNode);
    if (!isInsideEditor) {
      setFormatActive({ bold: false, italic: false, underline: false, highlight: false });
      return;
    }

    const boldActive = !!document.queryCommandState('bold');
    const italicActive = !!document.queryCommandState('italic');
    const underlineActive = !!document.queryCommandState('underline');
    const highlightActive = !!document.queryCommandState('hiliteColor') || !!document.queryCommandState('backColor');

    setFormatActive({
      bold: boldActive,
      italic: italicActive,
      underline: underlineActive,
      highlight: highlightActive,
    });
  }, []);

  useEffect(() => {
    const handler = () => updateFormatActive();
    document.addEventListener('selectionchange', handler);
    handler();
    return () => document.removeEventListener('selectionchange', handler);
  }, [updateFormatActive]);

  const applyCommand = (command: string, value?: string) => {
    // execCommand is deprecated but still works across modern browsers for simple formatting.
    document.execCommand(command, false, value);
    // input event isn't guaranteed to fire for execCommand in all cases
    handleEditorInput();
    editorRef.current?.focus();
    updateFormatActive();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      applyCommand('insertText', '\t');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    applyCommand('insertText', text);
    incrementPasteCount();
  };

  const copyText = async () => {
    const text = (contentText || '').trim();
    if (!text) {
      setCopyStatus('Nothing to copy');
      window.setTimeout(() => setCopyStatus(''), 1500);
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('Copied');
    } catch {
      // Fallback for browsers/environments without clipboard permissions.
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        setCopyStatus('Copied');
      } catch {
        alert('Copy failed. Please try again.');
      } finally {
        ta.remove();
      }
    } finally {
      window.setTimeout(() => setCopyStatus(''), 1500);
    }
  };

  const toggleTodoCompleted = async (id: string) => {
    const next = todoList.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t));
    setTodoList(next);

    const { error } = await supabase.from('documents').update({ todo_list_json: next }).eq('id', documentId);
    if (error) {
      console.error('Error updating todo completion:', error);
      alert('Failed to update to-do completion.');
    }
  };

  return (
    <div className="app-shell">
      <div className="mx-auto max-w-6xl">
        <div className="app-card mb-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <FileText className="w-6 h-6 text-blue-600" />
              <h1 className="text-2xl font-semibold text-slate-900">Lockd Editor</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-sm text-slate-600">
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
            <div className="chip text-sm">
              Pastes: {pasteCount}
            </div>
            <div className="px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-800 border border-amber-200">
              Stagnant: {stagnantCount}
            </div>
            <div className="px-3 py-1 rounded-full text-sm bg-sky-50 text-sky-800 border border-sky-200">
              Tabbed out: {tabbedOutCount}
            </div>
          </div>

          {(assignmentInstructionsHtml || todoList.length > 0) ? (
            <div className="mb-4 flex flex-col lg:flex-row gap-4 max-w-[816px] mx-auto">
              {assignmentInstructionsHtml ? (
                <div className="flex-1 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800">
                  <div className="font-semibold text-gray-900 mb-1">Assignment instructions</div>
                  <div dangerouslySetInnerHTML={{ __html: assignmentInstructionsHtml }} />
                </div>
              ) : null}

              {todoList.length > 0 ? (
                <div className="w-full lg:w-80 p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="font-semibold text-gray-900 mb-2">To-do</div>
                  <div className="space-y-2">
                    {todoList.map((t) => (
                      <label key={t.id} className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={t.completed}
                          onChange={() => toggleTodoCompleted(t.id)}
                          className="mt-0.5"
                        />
                        <span className={t.completed ? 'line-through text-gray-500' : ''}>{t.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

        <div className="flex gap-4 flex-col lg:flex-row">
          <div className="flex-1 min-w-0">
            <div className="max-w-[816px] mx-auto">
            <div className="sticky top-0 z-10 bg-white">
              <div className="flex flex-wrap items-center gap-2 border border-gray-200 rounded-lg p-2 mb-3">
                <select
                  value={fontValue}
                  onChange={(e) => {
                    const next = e.target.value;
                    setFontValue(next);
                    applyCommand('fontName', next);
                  }}
                  className="px-2 py-1 border border-gray-200 rounded-md text-sm bg-white"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>

                <div className="h-6 w-px bg-gray-200 mx-1" />

                <button
                  type="button"
                  onClick={() => applyCommand('bold')}
                  className={`p-2 rounded-md hover:bg-gray-100 ${
                    formatActive.bold ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''
                  }`}
                  aria-label="Bold"
                >
                  <Bold className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('italic')}
                  className={`p-2 rounded-md hover:bg-gray-100 ${
                    formatActive.italic ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''
                  }`}
                  aria-label="Italic"
                >
                  <Italic className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('underline')}
                  className={`p-2 rounded-md hover:bg-gray-100 ${
                    formatActive.underline ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''
                  }`}
                  aria-label="Underline"
                >
                  <Underline className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => applyCommand('hiliteColor', '#fff59d')}
                  className={`p-2 rounded-md hover:bg-gray-100 ${
                    formatActive.highlight ? 'bg-blue-100 text-blue-700 hover:bg-blue-200' : ''
                  }`}
                  aria-label="Highlight"
                >
                  <Highlighter className="w-4 h-4" />
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyText}
                    disabled={!contentText.trim()}
                    className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copy text
                  </button>
                  {copyStatus ? (
                    <span className="text-xs text-blue-700 font-medium">{copyStatus}</span>
                  ) : null}
                </div>
              </div>
            </div>

              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck
                onInput={handleEditorInput}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className="lockd-editor-area w-full min-h-[600px] p-12 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-auto bg-white"
                style={{ fontFamily: fontCssFamily }}
                data-placeholder="Start writing your work here..."
              />

            <div className="mt-2 text-sm text-slate-500">
              Last activity: {new Date(lastInput).toLocaleTimeString()}
            </div>
            </div>
          </div>

          <aside className="w-full lg:w-80 shrink-0">
            <div className="sticky top-24">
              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-4 h-4 text-blue-600" />
                    <div className="text-sm font-semibold text-gray-800 truncate">Teacher Suggestions</div>
                  </div>
                  <div className="text-xs text-gray-500">{suggestions.length}</div>
                </div>

                <div className="max-h-[620px] overflow-auto pr-1 space-y-3">
                  {suggestions.length === 0 ? (
                    <div className="text-sm text-gray-500">No teacher suggestions yet.</div>
                  ) : (
                    suggestions.map((s) => (
                      <div
                        key={s.id}
                        className={`border rounded-lg p-3 ${
                          s.resolved ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200'
                        }`}
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
                            <div className={`text-sm ${s.resolved ? 'text-green-900' : 'text-gray-900'}`}>{s.suggestion}</div>
                            <div className="text-xs text-gray-500 mt-1">{new Date(s.created_at).toLocaleString()}</div>
                          </div>
                          <div
                            className={`shrink-0 text-xs font-medium px-2 py-1 rounded-md ${
                              s.resolved ? 'bg-green-600 text-white' : 'bg-blue-50 text-blue-700'
                            }`}
                          >
                            {s.resolved ? 'Resolved' : 'Open'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>
        </div>
      </div>
    </div>
  );
}
