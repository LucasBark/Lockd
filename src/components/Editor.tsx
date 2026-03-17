import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Bold, Italic, Underline, Highlighter } from 'lucide-react';
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

export function Editor({ sessionId, studentId, studentName, teacherPeerId, documentId }: EditorProps) {
  const [content, setContent] = useState(''); // stored as HTML
  const [contentText, setContentText] = useState(''); // plain text mirror
  const [pasteCount, setPasteCount] = useState(0);
  const [stagnantCount, setStagnantCount] = useState(0);
  const [lastInput, setLastInput] = useState(Date.now());
  const [isTabActive, setIsTabActive] = useState(true);
  const [isWindowFocused, setIsWindowFocused] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stagnantLatchRef = useRef(false);
  const [fontValue, setFontValue] = useState(FONT_OPTIONS[0].value);
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
      .select('content,content_text,paste_count,stagnant_count')
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
          setPasteCount(typeof data.paste_count === 'number' ? data.paste_count : 0);
          setStagnantCount(typeof data.stagnant_count === 'number' ? data.stagnant_count : 0);
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

  const updatePasteCount = useCallback((next: number) => {
    setPasteCount(next);
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
  }, [documentId]);

  const updateStagnantCount = useCallback((next: number) => {
    setStagnantCount(next);
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
          updateStagnantCount(stagnantCount + 1);
        }
      } else {
        stagnantLatchRef.current = false;
      }
    }, STAGNANT_CHECK_MS);

    return () => window.clearInterval(interval);
  }, [isTabActive, isWindowFocused, lastInput, stagnantCount, updateStagnantCount]);

  const applyCommand = (command: string, value?: string) => {
    // execCommand is deprecated but still works across modern browsers for simple formatting.
    document.execCommand(command, false, value);
    // input event isn't guaranteed to fire for execCommand in all cases
    handleEditorInput();
    editorRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      applyCommand('insertText', '    ');
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    applyCommand('insertText', text);
    updatePasteCount(pasteCount + 1);
  };

  const getExportHtml = () => {
    const { html, plain } = readEditor();
    const safeHtml = (html || '').trim();
    const safePlain = (plain || '').trim();
    return {
      html: safeHtml || safePlain.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br/>'),
      plain: safePlain,
    };
  };

  const exportToPdf = () => {
    const { html } = getExportHtml();
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      alert('Pop-up blocked. Please allow pop-ups to export to PDF.');
      return;
    }

    win.document.open();
    win.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Lockd Export</title>
    <style>
      @page { margin: 1in; }
      body { font-family: ${fontCssFamily}; font-size: 12pt; line-height: 1.5; color: #111827; }
      .doc { white-space: normal; }
      mark { background: #fff59d; }
    </style>
  </head>
  <body>
    <div class="doc">${html}</div>
    <script>
      window.focus();
      setTimeout(() => window.print(), 250);
    </script>
  </body>
</html>`);
    win.document.close();
  };

  const exportToDocx = () => {
    // Word-compatible HTML download. Many systems open this in Word; if you need a true .docx zip,
    // we can add a library-based exporter next.
    const { html } = getExportHtml();
    const doc = `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="utf-8" />
    <title>Lockd Export</title>
    <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
    <style>
      body { font-family: ${fontCssFamily}; font-size: 12pt; line-height: 1.5; }
      mark { background: #fff59d; }
    </style>
  </head>
  <body>${html}</body>
</html>`;

    const blob = new Blob([doc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lockd-export.doc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
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
            <div className="px-3 py-1 rounded-full text-sm bg-amber-50 text-amber-800 border border-amber-200">
              Stagnant: {stagnantCount}
            </div>
          </div>

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
                className="p-2 rounded-md hover:bg-gray-100"
                aria-label="Bold"
              >
                <Bold className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => applyCommand('italic')}
                className="p-2 rounded-md hover:bg-gray-100"
                aria-label="Italic"
              >
                <Italic className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => applyCommand('underline')}
                className="p-2 rounded-md hover:bg-gray-100"
                aria-label="Underline"
              >
                <Underline className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => applyCommand('hiliteColor', '#fff59d')}
                className="p-2 rounded-md hover:bg-gray-100"
                aria-label="Highlight"
              >
                <Highlighter className="w-4 h-4" />
              </button>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportToPdf}
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium"
                >
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={exportToDocx}
                  className="px-3 py-1.5 rounded-md bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium"
                >
                  Export DOC
                </button>
                <div className="hidden sm:block text-xs text-gray-500 ml-2">
                  Tab indents • Ctrl/Cmd+B/I/U work too
                </div>
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
            className="w-full h-96 p-4 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent overflow-auto"
            style={{ fontFamily: fontCssFamily }}
            data-placeholder="Start writing your work here..."
          />

          <div className="mt-2 text-sm text-gray-500">
            Last activity: {new Date(lastInput).toLocaleTimeString()}
          </div>
        </div>
      </div>
    </div>
  );
}
