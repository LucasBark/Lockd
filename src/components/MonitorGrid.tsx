import { useState, useEffect, useCallback, useRef } from 'react';
import { Monitor, User, Activity, FileText, Download, UploadCloud, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePeerConnection, StudentHeartbeat } from '../hooks/usePeerConnection';
import { TeacherDocModal } from './TeacherDocModal';

interface StudentStatus extends StudentHeartbeat {
  documentId: string;
  pasteCount: number;
  stagnantCount: number;
  tabbedOutCount: number;
}

interface MonitorGridProps {
  sessionId: string;
  sessionCode: string;
}

type TeacherFeedbackForm = {
  satisfactionRating: number;
  navigationEaseRating: number;
  offTaskDetectionRating: number;
  distractionEliminationRating: number;
  aiUsageDetectionRating: number;
  classroomEffectivenessRating: number;
  classroomChangesText: string;
  redundantFeaturesText: string;
  wishedFeaturesText: string;
};

const initialFeedbackForm: TeacherFeedbackForm = {
  satisfactionRating: 0,
  navigationEaseRating: 0,
  offTaskDetectionRating: 0,
  distractionEliminationRating: 0,
  aiUsageDetectionRating: 0,
  classroomEffectivenessRating: 0,
  classroomChangesText: '',
  redundantFeaturesText: '',
  wishedFeaturesText: '',
};

const CLASSROOM_EFFECTIVENESS_LABELS = [
  'Very bad',
  'Bad',
  'No change',
  'Positive',
  'Very positive',
] as const;

function FeedbackScale4({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (n: number) => void;
  name: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={name}>
      {[1, 2, 3, 4].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={`flex h-11 min-w-[2.75rem] items-center justify-center rounded-full border-2 px-3 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-[#673ab7]/45 focus:ring-offset-2 ${
            value === n
              ? 'border-[#673ab7] bg-[#673ab7] text-white shadow-sm'
              : 'border-stone-300 bg-white text-stone-800 hover:border-stone-400'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function FeedbackScale5({
  value,
  onChange,
  name,
}: {
  value: number;
  onChange: (n: number) => void;
  name: string;
}) {
  return (
    <div className="mt-3" role="radiogroup" aria-label={name}>
      <div className="flex flex-wrap items-start gap-3 sm:gap-4">
        {CLASSROOM_EFFECTIVENESS_LABELS.map((label, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onChange(n)}
              className="flex flex-col items-center gap-1.5 focus:outline-none"
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 text-sm font-medium transition focus:ring-2 focus:ring-[#673ab7]/45 focus:ring-offset-2 ${
                  value === n
                    ? 'border-[#673ab7] bg-[#673ab7] text-white shadow-sm'
                    : 'border-stone-300 bg-white text-stone-800 hover:border-stone-400'
                }`}
              >
                {n}
              </span>
              <span className="max-w-[4.75rem] text-center text-[11px] leading-tight text-stone-500">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MonitorGrid({ sessionId, sessionCode }: MonitorGridProps) {
  const [students, setStudents] = useState<Map<string, StudentStatus>>(new Map());
  const [openDoc, setOpenDoc] = useState<{ documentId: string; studentName: string } | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [sessionIsActive, setSessionIsActive] = useState<boolean>(true);
  const [sessionHasTemplate, setSessionHasTemplate] = useState<boolean>(false);
  const [isSettingTemplate, setIsSettingTemplate] = useState(false);
  const [sessionEndedAt, setSessionEndedAt] = useState<string | null>(null);
  const [cleanupCountdownMs, setCleanupCountdownMs] = useState<number | null>(null);
  const [sessionInstructionsText, setSessionInstructionsText] = useState<string>('');
  const [sessionTodoText, setSessionTodoText] = useState<string>('');
  const [isSettingInstructions, setIsSettingInstructions] = useState(false);
  const [isSettingTodo, setIsSettingTodo] = useState(false);
  const [isDragOverTemplate, setIsDragOverTemplate] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState<TeacherFeedbackForm>(initialFeedbackForm);
  const templateInputRef = useRef<HTMLInputElement | null>(null);

  const cleanupDoneRef = useRef(false);

  const toHtmlFromPlain = useCallback((text: string) => {
    const safe = (text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return safe.replace(/\n/g, '<br/>');
  }, []);

  const todoTextToJson = useCallback((text: string) => {
    const lines = (text ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    return lines.map((t, idx) => ({
      id: String(idx),
      text: t,
      completed: false,
    }));
  }, []);

  const todoJsonToText = useCallback((json: unknown) => {
    const arr = Array.isArray(json) ? json : [];
    return arr
      .map((item) => (item as any)?.text)
      .filter((t) => typeof t === 'string' && t.trim().length > 0)
      .map((t) => (t as string).trim())
      .join('\n');
  }, []);
  const handleHeartbeat = useCallback((data: StudentHeartbeat) => {
    setStudents((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(data.studentId);
      newMap.set(data.studentId, {
        ...data,
        documentId: existing?.documentId || '',
        pasteCount: existing?.pasteCount ?? 0,
        stagnantCount: existing?.stagnantCount ?? 0,
        tabbedOutCount: existing?.tabbedOutCount ?? 0,
      });
      return newMap;
    });
  }, []);

  const { peerId } = usePeerConnection({
    role: 'teacher',
    onReceiveHeartbeat: handleHeartbeat,
  });

  useEffect(() => {
    if (peerId) {
      supabase
        .from('sessions')
        .update({ teacher_peer_id: peerId })
        .eq('id', sessionId)
        .then(({ error }) => {
          if (error) console.error('Error updating teacher peer ID:', error);
        });
    }
  }, [peerId, sessionId]);

  useEffect(() => {
    let mounted = true;
    supabase
      .from('sessions')
      .select('title,is_active,ended_at,assignment_template_text,assignment_instructions_text,todo_list_json')
      .eq('id', sessionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error('Error fetching session title:', error);
          return;
        }
        if (data?.title) setSessionTitle(data.title);
        if (typeof data?.is_active === 'boolean') setSessionIsActive(data.is_active);
        if (typeof data?.ended_at === 'string') setSessionEndedAt(data.ended_at);
        if (typeof data?.assignment_template_text === 'string') {
          setSessionHasTemplate(data.assignment_template_text.trim().length > 0);
        }
        if (typeof data?.assignment_instructions_text === 'string') {
          setSessionInstructionsText(data.assignment_instructions_text);
        }
        if (typeof data?.todo_list_json !== 'undefined') {
          setSessionTodoText(todoJsonToText(data.todo_list_json));
        }
      });
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const handleSetTemplate = async (file: File) => {
    setIsSettingTemplate(true);
    try {
      const arrayBuffer = await file.arrayBuffer();

      const mammothModule: any = await import('mammoth');
      const converter = mammothModule?.convertToHtml ?? mammothModule?.default?.convertToHtml;
      if (!converter) throw new Error('mammoth.convertToHtml not available');

      const result = await converter({ arrayBuffer });
      const html = result.value ?? '';

      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      const plain = tmp.innerText ?? '';

      const { error } = await supabase
        .from('sessions')
        .update({
          assignment_template_html: html,
          assignment_template_text: plain,
        })
        .eq('id', sessionId);

      if (error) throw error;

      setSessionHasTemplate(plain.trim().length > 0);

      const tableFound = html.toLowerCase().includes('<table');
      if (!tableFound) {
        alert(
          'Template imported, but no tables were detected in the converted content. Some DOCX table layouts may not convert reliably.'
        );
      }

      // Apply to any existing student docs that are still empty.
      const nowIso = new Date().toISOString();
      await supabase
        .from('documents')
        .update({
          assignment_template_html: html,
          assignment_template_text: plain,
          content: html,
          content_text: plain,
          last_activity: nowIso,
          updated_at: nowIso,
        })
        .eq('session_id', sessionId)
        .eq('content_text', '');
    } catch (err) {
      console.error('Error setting DOCX template:', err);
      alert('Failed to import DOCX template.');
    } finally {
      setIsSettingTemplate(false);
    }
  };

  const handleSetInstructions = async () => {
    setIsSettingInstructions(true);
    try {
      const plain = sessionInstructionsText ?? '';
      const html = toHtmlFromPlain(plain);

      const { error } = await supabase
        .from('sessions')
        .update({
          assignment_instructions_html: html,
          assignment_instructions_text: plain,
        })
        .eq('id', sessionId);

      if (error) throw error;

      const nowIso = new Date().toISOString();
      await supabase
        .from('documents')
        .update({
          assignment_instructions_html: html,
          assignment_instructions_text: plain,
          updated_at: nowIso,
        })
        .eq('session_id', sessionId)
        .eq('content_text', '');
    } catch (err) {
      console.error('Error setting instructions:', err);
      alert('Failed to save instructions.');
    } finally {
      setIsSettingInstructions(false);
    }
  };

  const handleSetTodo = async () => {
    setIsSettingTodo(true);
    try {
      const todoJson = todoTextToJson(sessionTodoText ?? '');

      const { error } = await supabase
        .from('sessions')
        .update({
          todo_list_json: todoJson,
        })
        .eq('id', sessionId);

      if (error) throw error;

      const { error: docsErr } = await supabase
        .from('documents')
        .update({
          todo_list_json: todoJson,
        })
        .eq('session_id', sessionId)
        .eq('content_text', '');

      if (docsErr) throw docsErr;
    } catch (err) {
      console.error('Error setting todos:', err);
      alert('Failed to save class to-do list.');
    } finally {
      setIsSettingTodo(false);
    }
  };

  // Persist session so teacher can rejoin after closing tab or navigating back
  useEffect(() => {
    if (sessionId && sessionCode) {
      try {
        localStorage.setItem(
          'lockd_teacher_session',
          JSON.stringify({ sessionId, sessionCode })
        );
      } catch {
        // ignore quota or privacy errors
      }
    }
  }, [sessionId, sessionCode]);

  useEffect(() => {
    const fetchDocuments = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('session_id', sessionId);

      if (error) {
        console.error('Error fetching documents:', error);
        return;
      }

      if (data) {
        setStudents((prev) => {
          const newMap = new Map(prev);
          data.forEach((doc) => {
            const existing = newMap.get(doc.student_id);
            newMap.set(doc.student_id, {
              studentId: doc.student_id,
              studentName: doc.student_name,
              documentId: doc.id,
              isTabActive: existing?.isTabActive ?? true,
              isWindowFocused: existing?.isWindowFocused ?? true,
              lastInput: existing?.lastInput ?? Date.now(),
              snippet: (doc.content_text ?? doc.content ?? '').substring(0, 200),
              pasteCount: typeof doc.paste_count === 'number' ? doc.paste_count : (existing?.pasteCount ?? 0),
              stagnantCount: typeof doc.stagnant_count === 'number' ? doc.stagnant_count : (existing?.stagnantCount ?? 0),
              tabbedOutCount: typeof doc.tabbed_out_count === 'number' ? doc.tabbed_out_count : (existing?.tabbedOutCount ?? 0),
            });
          });
          return newMap;
        });
      }
    };

    fetchDocuments();

    const channel = supabase
      .channel('documents-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const doc = payload.new;
            setStudents((prev) => {
              const newMap = new Map(prev);
              const existing = newMap.get(doc.student_id);
              newMap.set(doc.student_id, {
                studentId: doc.student_id,
                studentName: doc.student_name,
                documentId: doc.id,
                isTabActive: existing?.isTabActive ?? true,
                isWindowFocused: existing?.isWindowFocused ?? true,
                lastInput: existing?.lastInput ?? Date.now(),
                snippet: (doc.content_text ?? doc.content ?? '').substring(0, 200),
                pasteCount: typeof doc.paste_count === 'number' ? doc.paste_count : (existing?.pasteCount ?? 0),
                stagnantCount: typeof doc.stagnant_count === 'number' ? doc.stagnant_count : (existing?.stagnantCount ?? 0),
                tabbedOutCount: typeof doc.tabbed_out_count === 'number' ? doc.tabbed_out_count : (existing?.tabbedOutCount ?? 0),
              });
              return newMap;
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [sessionId]);

  const getStatusColor = (student: StudentStatus) => {
    if (!student.isTabActive) return 'bg-red-500';
    if (!student.isWindowFocused) return 'bg-orange-500';
    const timeSinceInput = Date.now() - student.lastInput;
    if (timeSinceInput > 60000) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusLabel = (student: StudentStatus) => {
    if (!student.isTabActive) return 'Tabbed Out';
    if (!student.isWindowFocused) return 'Unfocused';
    const timeSinceInput = Date.now() - student.lastInput;
    if (timeSinceInput > 60000) return 'Stagnant';
    return 'Active';
  };

  const exportCsv = async () => {
    if (sessionIsActive) return;

    const { data, error } = await supabase
      .from('documents')
      .select('content_text,paste_count,stagnant_count,tabbed_out_count')
      .eq('session_id', sessionId);

    if (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export CSV.');
      return;
    }

    const rows = (data ?? []).map((doc, idx) => {
      const pastes = typeof doc.paste_count === 'number' ? doc.paste_count : 0;
      const stagnant = typeof doc.stagnant_count === 'number' ? doc.stagnant_count : 0;
      const tabbedOut = typeof doc.tabbed_out_count === 'number' ? doc.tabbed_out_count : 0;
      const studentWork = typeof doc.content_text === 'string' ? doc.content_text : '';
      return {
        Student: `Student ${idx + 1}`,
        Pastes: pastes,
        'Times stagnant': stagnant,
        'Tabbed out': tabbedOut,
        'Student work': studentWork,
      };
    });

    const headers = ['Student', 'Pastes', 'Times stagnant', 'Tabbed out', 'Student work'];
    const escapeCsvValue = (v: unknown) => {
      const s = String(v ?? '');
      if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const csvLines = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => escapeCsvValue((r as Record<string, unknown>)[h]))
          .join(',')
      ),
    ];

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lockd-class-export.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShowFeedbackForm(true);
  };

  const submitFeedback = async () => {
    if (
      !feedbackForm.satisfactionRating ||
      !feedbackForm.navigationEaseRating ||
      !feedbackForm.offTaskDetectionRating ||
      !feedbackForm.distractionEliminationRating ||
      !feedbackForm.aiUsageDetectionRating ||
      !feedbackForm.classroomEffectivenessRating ||
      !feedbackForm.classroomChangesText.trim() ||
      !feedbackForm.redundantFeaturesText.trim() ||
      !feedbackForm.wishedFeaturesText.trim()
    ) {
      alert('Please answer all feedback questions before submitting.');
      return;
    }

    setIsSubmittingFeedback(true);
    try {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const teacherId = userRes.user?.id ?? '';
      if (!teacherId) throw new Error('You must be signed in as a teacher.');

      const { error } = await supabase.from('teacher_feedback').upsert(
        {
          session_id: sessionId,
          teacher_id: teacherId,
          satisfaction_rating: feedbackForm.satisfactionRating,
          navigation_ease_rating: feedbackForm.navigationEaseRating,
          off_task_detection_rating: feedbackForm.offTaskDetectionRating,
          distraction_elimination_rating: feedbackForm.distractionEliminationRating,
          ai_usage_detection_rating: feedbackForm.aiUsageDetectionRating,
          classroom_effectiveness_rating: feedbackForm.classroomEffectivenessRating,
          classroom_changes_text: feedbackForm.classroomChangesText.trim(),
          redundant_features_text: feedbackForm.redundantFeaturesText.trim(),
          wished_features_text: feedbackForm.wishedFeaturesText.trim(),
        },
        { onConflict: 'session_id,teacher_id' }
      );
      if (error) throw error;
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error('Error saving teacher feedback:', err);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const cleanupSessionData = useCallback(async () => {
    if (cleanupDoneRef.current) return;
    cleanupDoneRef.current = true;
    try {
      // Delete dependent rows via FK cascades.
      const { error: docsError } = await supabase
        .from('documents')
        .delete()
        .eq('session_id', sessionId);
      if (docsError) throw docsError;

      const { error: sessionsError } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);
      if (sessionsError) throw sessionsError;
    } catch (err) {
      console.error('Error cleaning up session data:', err);
      // Don't keep the user in a broken state; allow them to keep working if cleanup fails.
      alert('Automatic cleanup failed. You may need to delete the session manually.');
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionIsActive) return;
    if (!sessionEndedAt) return;

    const endedMs = new Date(sessionEndedAt).getTime();
    const deleteAt = endedMs + 10 * 60 * 1000;
    const msUntilDelete = deleteAt - Date.now();

    if (msUntilDelete <= 0) {
      cleanupSessionData();
      return;
    }

    const t = window.setTimeout(() => {
      cleanupSessionData();
    }, msUntilDelete);

    return () => {
      window.clearTimeout(t);
    };
  }, [sessionIsActive, sessionEndedAt, cleanupSessionData]);

  useEffect(() => {
    if (sessionIsActive || !sessionEndedAt) {
      setCleanupCountdownMs(null);
      return;
    }

    const update = () => {
      const endedMs = new Date(sessionEndedAt).getTime();
      const deleteAt = endedMs + 10 * 60 * 1000;
      const ms = Math.max(0, deleteAt - Date.now());
      setCleanupCountdownMs(ms);
    };

    update();
    const i = window.setInterval(update, 1000);
    return () => window.clearInterval(i);
  }, [sessionIsActive, sessionEndedAt]);

  const endClass = async () => {
    const confirmed = window.confirm('This will end the class. Session data will be deleted from the database 10 minutes after end.');
    if (!confirmed) return;

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('sessions')
      .update({ is_active: false, ended_at: nowIso })
      .eq('id', sessionId);
    if (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class.');
      return;
    }
    setSessionIsActive(false);
    setSessionEndedAt(nowIso);
  };

  return (
    <div className="app-shell">
      <div className="app-container">
        <div className="app-card mb-6 p-5 md:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-stone-100 p-2.5">
                <Monitor className="h-7 w-7 text-stone-700" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-stone-900 md:text-3xl">{sessionTitle || 'Class'}</h1>
                <p className="text-sm text-stone-600 md:text-base">
                  Session Code: <span className="font-mono font-bold text-stone-900">{sessionCode}</span>
                </p>
              </div>
            </div>

            <div className="w-full max-w-[460px]">
              <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                {sessionIsActive ? (
                  <button
                    type="button"
                    onClick={endClass}
                    className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700"
                  >
                    End class
                  </button>
                ) : null}
                <button type="button" onClick={exportCsv} disabled={sessionIsActive} className="btn-primary" title={sessionIsActive ? 'End class to export CSV' : 'Download class CSV'}>
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
              </div>

              <div className="text-xs text-slate-500">
                {sessionIsActive ? 'End the class to unlock CSV export' : 'CSV export unlocked'}
              </div>
              {!sessionIsActive && sessionEndedAt && cleanupCountdownMs !== null ? (
                <div className="mt-2 text-xs text-slate-500">
                  Session data will be deleted in{' '}
                  <span className="font-mono font-semibold">
                    {Math.floor(cleanupCountdownMs / 60000)}m:{String(Math.floor((cleanupCountdownMs % 60000) / 1000)).padStart(2, '0')}s
                  </span>
                </div>
              ) : null}

              <div className="mt-4 text-left">
                <div className="mb-2 text-xs font-medium text-slate-600">
                  Assignment template (DOCX) — applies to students when they join
                </div>
                <input
                  ref={templateInputRef}
                  type="file"
                  accept=".docx"
                  disabled={isSettingTemplate}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleSetTemplate(f);
                  }}
                  className="hidden"
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (!isSettingTemplate) templateInputRef.current?.click();
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isSettingTemplate) {
                      e.preventDefault();
                      templateInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isSettingTemplate) setIsDragOverTemplate(true);
                  }}
                  onDragLeave={() => setIsDragOverTemplate(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOverTemplate(false);
                    if (isSettingTemplate) return;
                    const file = e.dataTransfer.files?.[0];
                    if (!file) return;
                    if (!file.name.toLowerCase().endsWith('.docx')) {
                      alert('Please upload a .docx file.');
                      return;
                    }
                    handleSetTemplate(file);
                  }}
                  className={`rounded-2xl border-2 border-dashed p-4 text-center transition ${
                    isDragOverTemplate
                      ? 'border-stone-500 bg-stone-100'
                      : 'border-stone-300 bg-stone-50 hover:border-stone-400'
                  } ${isSettingTemplate ? 'cursor-wait opacity-70' : 'cursor-pointer'}`}
                >
                  <UploadCloud className="mx-auto mb-2 h-5 w-5 text-stone-500" />
                  <div className="text-sm font-medium text-stone-700">
                    {isSettingTemplate ? 'Importing template...' : 'Drag and drop DOCX here'}
                  </div>
                  <div className="mt-1 text-xs text-stone-500">or click to browse files</div>
                </div>
                <div className="mt-2 text-xs text-stone-500">{sessionHasTemplate ? 'Template set' : 'No template yet'}</div>
              </div>

              <div className="mt-4 text-left">
                <div className="mb-2 text-xs font-medium text-slate-600">Assignment instructions (plain text)</div>
                <textarea
                  value={sessionInstructionsText}
                  onChange={(e) => setSessionInstructionsText(e.target.value)}
                  className="textarea-base h-24"
                  placeholder="Enter instructions. Use new lines for paragraphs."
                  disabled={isSettingInstructions}
                />
                <div className="mt-2 flex items-center justify-end">
                  <button type="button" onClick={handleSetInstructions} disabled={isSettingInstructions} className="btn-primary">
                    {isSettingInstructions ? 'Saving...' : 'Set instructions'}
                  </button>
                </div>
              </div>

              <div className="mt-4 text-left">
                <div className="mb-2 text-xs font-medium text-slate-600">Class to-do list (one task per line)</div>
                <textarea
                  value={sessionTodoText}
                  onChange={(e) => setSessionTodoText(e.target.value)}
                  className="textarea-base h-24"
                  placeholder="e.g., Write your thesis (one task per line)"
                  disabled={isSettingTodo}
                />
                <div className="mt-2 flex items-center justify-end">
                  <button type="button" onClick={handleSetTodo} disabled={isSettingTodo} className="btn-primary">
                    {isSettingTodo ? 'Saving...' : 'Set to-do'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(students.values()).map((student) => {
            const isPulsing = student.isTabActive && student.isWindowFocused && (Date.now() - student.lastInput < 60000);

            return (
              <div
                key={student.studentId}
                className="app-card overflow-hidden border hover:shadow-md transition-shadow"
              >
                <div className="border-b border-slate-200 bg-slate-50/80 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-slate-800">{student.studentName}</h3>
                    </div>
                    <div className="relative">
                      <div
                        className={`w-4 h-4 rounded-full ${getStatusColor(student)} ${
                          isPulsing ? 'animate-pulse' : ''
                        }`}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-1 text-xs ${
                      student.isTabActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {getStatusLabel(student)}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-sm font-medium text-slate-700">Live Preview</span>
                  </div>
                  <div className="min-h-24 max-h-32 overflow-auto rounded-xl bg-slate-50 p-3">
                    <p className="whitespace-pre-wrap text-sm text-slate-600">
                      {student.snippet || 'No content yet...'}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-slate-600">
                        Pastes: <span className="font-mono font-semibold">{student.pasteCount}</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        Stagnant: <span className="font-mono font-semibold">{student.stagnantCount}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenDoc({ documentId: student.documentId, studentName: student.studentName })}
                      disabled={!student.documentId}
                      className="btn-primary px-3 py-1"
                    >
                      Open doc
                    </button>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                    <Activity className="w-3 h-3" />
                    <span>
                      Last input: {Math.floor((Date.now() - student.lastInput) / 1000)}s ago
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {openDoc && (
          <TeacherDocModal
            documentId={openDoc.documentId}
            studentName={openDoc.studentName}
            onClose={() => setOpenDoc(null)}
          />
        )}

        {students.size === 0 && (
          <div className="app-card py-12 text-center">
            <User className="mx-auto mb-4 h-16 w-16 text-slate-400" />
            <p className="text-lg text-slate-700">No students have joined yet</p>
            <p className="text-sm text-slate-500">Share the session code with your students</p>
          </div>
        )}

        {showFeedbackForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#f0ebf8] p-4 sm:p-6">
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-stone-200/80 bg-white shadow-lg">
              <div className="relative bg-[#673ab7] px-6 py-5 text-white">
                <button
                  type="button"
                  className="absolute right-3 top-3 rounded-lg p-2 text-white/90 hover:bg-white/10"
                  onClick={() => setShowFeedbackForm(false)}
                  aria-label="Close feedback form"
                >
                  <X className="h-4 w-4" />
                </button>
                <h2 className="pr-10 text-2xl font-normal tracking-tight">Lockd feedback</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/90">
                  Thanks for exporting your class data. Your answers help improve Lockd.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-1">
                {feedbackSubmitted ? (
                  <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700">
                    Response recorded. Thank you for helping shape the roadmap.
                  </div>
                ) : (
                  <div className="divide-y divide-stone-100">
                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        How satisfied are you with Lockd overall?
                      </p>
                      <p className="mt-1 text-xs text-stone-500">Scale: 1 = least satisfied, 4 = most satisfied</p>
                      <FeedbackScale4
                        name="Overall satisfaction"
                        value={feedbackForm.satisfactionRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, satisfactionRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">How easy was it to navigate the tool?</p>
                      <p className="mt-1 text-xs text-stone-500">Scale: 1 = hardest, 4 = easiest</p>
                      <FeedbackScale4
                        name="Navigation ease"
                        value={feedbackForm.navigationEaseRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, navigationEaseRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        How effective was Lockd at helping you spot off-task students?
                      </p>
                      <p className="mt-1 text-xs text-stone-500">Scale: 1 = not effective, 4 = very effective</p>
                      <FeedbackScale4
                        name="Off-task detection"
                        value={feedbackForm.offTaskDetectionRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, offTaskDetectionRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        How effective was Lockd at reducing classroom distractions?
                      </p>
                      <p className="mt-1 text-xs text-stone-500">Scale: 1 = not effective, 4 = very effective</p>
                      <FeedbackScale4
                        name="Distraction reduction"
                        value={feedbackForm.distractionEliminationRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, distractionEliminationRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        How effective was Lockd at surfacing possible AI use?
                      </p>
                      <p className="mt-1 text-xs text-stone-500">Scale: 1 = not effective, 4 = very effective</p>
                      <FeedbackScale4
                        name="AI usage detection"
                        value={feedbackForm.aiUsageDetectionRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, aiUsageDetectionRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        Overall, how effective has Lockd been in your classroom?
                      </p>
                      <p className="mt-1 text-xs text-stone-500">Tap a number to respond</p>
                      <FeedbackScale5
                        name="Classroom effectiveness"
                        value={feedbackForm.classroomEffectivenessRating}
                        onChange={(n) => setFeedbackForm((prev) => ({ ...prev, classroomEffectivenessRating: n }))}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        What changes have you noticed in your classroom since using Lockd?
                      </p>
                      <textarea
                        value={feedbackForm.classroomChangesText}
                        onChange={(e) => setFeedbackForm((prev) => ({ ...prev, classroomChangesText: e.target.value }))}
                        placeholder="Your answer"
                        className="textarea-base mt-3 min-h-[100px] w-full rounded-md border border-b-2 border-stone-200 border-b-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-b-[#673ab7] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#673ab7]/30"
                        rows={4}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        Are there features that feel redundant, or that you would remove or change?
                      </p>
                      <textarea
                        value={feedbackForm.redundantFeaturesText}
                        onChange={(e) => setFeedbackForm((prev) => ({ ...prev, redundantFeaturesText: e.target.value }))}
                        placeholder="Your answer"
                        className="textarea-base mt-3 min-h-[100px] w-full rounded-md border border-b-2 border-stone-200 border-b-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-b-[#673ab7] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#673ab7]/30"
                        rows={4}
                      />
                    </div>

                    <div className="py-5">
                      <p className="text-sm leading-snug text-stone-900">
                        What features do you wish Lockd had that are not there yet?
                      </p>
                      <textarea
                        value={feedbackForm.wishedFeaturesText}
                        onChange={(e) => setFeedbackForm((prev) => ({ ...prev, wishedFeaturesText: e.target.value }))}
                        placeholder="Your answer"
                        className="textarea-base mt-3 min-h-[100px] w-full rounded-md border border-b-2 border-stone-200 border-b-stone-300 bg-stone-50/50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-b-[#673ab7] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#673ab7]/30"
                        rows={4}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-stone-100 bg-stone-50/80 px-6 py-4">
                <button
                  type="button"
                  className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50"
                  onClick={() => {
                    setShowFeedbackForm(false);
                    if (!feedbackSubmitted) setFeedbackForm(initialFeedbackForm);
                  }}
                >
                  {feedbackSubmitted ? 'Close' : 'Maybe later'}
                </button>
                {!feedbackSubmitted ? (
                  <button
                    type="button"
                    className="rounded bg-[#673ab7] px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#5e35b1] disabled:opacity-60"
                    onClick={submitFeedback}
                    disabled={isSubmittingFeedback}
                  >
                    {isSubmittingFeedback ? 'Submitting...' : 'Submit'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
