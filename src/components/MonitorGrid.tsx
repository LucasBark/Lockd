import { useState, useEffect, useCallback } from 'react';
import { Monitor, User, Activity, FileText, Download } from 'lucide-react';
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

export function MonitorGrid({ sessionId, sessionCode }: MonitorGridProps) {
  const [students, setStudents] = useState<Map<string, StudentStatus>>(new Map());
  const [openDoc, setOpenDoc] = useState<{ documentId: string; studentName: string } | null>(null);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [sessionIsActive, setSessionIsActive] = useState<boolean>(true);
  const [sessionHasTemplate, setSessionHasTemplate] = useState<boolean>(false);
  const [isSettingTemplate, setIsSettingTemplate] = useState(false);
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
      .select('title,is_active,assignment_template_text')
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
        if (typeof data?.assignment_template_text === 'string') {
          setSessionHasTemplate(data.assignment_template_text.trim().length > 0);
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
      .select('paste_count,stagnant_count,tabbed_out_count')
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
      return {
        Student: `Student ${idx + 1}`,
        Pastes: pastes,
        'Times stagnant': stagnant,
        'Tabbed out': tabbedOut,
      };
    });

    const headers = ['Student', 'Pastes', 'Times stagnant', 'Tabbed out'];
    const escapeCsvValue = (v: unknown) => {
      const s = String(v ?? '');
      if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
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
  };

  const endClass = async () => {
    const { error } = await supabase.from('sessions').update({ is_active: false }).eq('id', sessionId);
    if (error) {
      console.error('Error ending class:', error);
      alert('Failed to end class.');
      return;
    }
    setSessionIsActive(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">{sessionTitle || 'Class'}</h1>
                <p className="text-gray-600">Session Code: <span className="font-mono font-bold text-blue-600">{sessionCode}</span></p>
              </div>
            </div>
            <div className="text-right">
                {sessionIsActive ? (
                  <button
                    type="button"
                    onClick={endClass}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
                  >
                    End class
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={sessionIsActive}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
                  title={sessionIsActive ? 'End class to export CSV' : 'Download class CSV'}
                >
                  <Download className="w-4 h-4" />
                  Export CSV
                </button>
                <div className="text-xs text-gray-500 mt-1">
                  {sessionIsActive ? 'End the class to unlock CSV export' : 'CSV export unlocked'}
                </div>

                <div className="mt-4 text-left max-w-[420px]">
                  <div className="text-xs font-medium text-gray-600 mb-2">
                    Assignment template (DOCX) — applies to students when they join
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept=".docx"
                      disabled={isSettingTemplate}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleSetTemplate(f);
                      }}
                      className="text-sm"
                    />
                    <div className="text-xs text-gray-500">
                      {isSettingTemplate ? 'Importing…' : sessionHasTemplate ? 'Template set' : 'No template yet'}
                    </div>
                  </div>
                </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from(students.values()).map((student) => {
            const isPulsing = student.isTabActive && student.isWindowFocused && (Date.now() - student.lastInput < 60000);

            return (
              <div
                key={student.studentId}
                className="bg-white rounded-lg shadow-md overflow-hidden border-2 border-gray-200 hover:shadow-lg transition-shadow"
              >
                <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-gray-800">{student.studentName}</h3>
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
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      student.isTabActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                    }`}>
                      {getStatusLabel(student)}
                    </span>
                  </div>
                </div>

                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Live Preview</span>
                  </div>
                  <div className="bg-gray-50 rounded p-3 min-h-24 max-h-32 overflow-auto">
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">
                      {student.snippet || 'No content yet...'}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-gray-600">
                        Pastes: <span className="font-mono font-semibold">{student.pasteCount}</span>
                      </div>
                      <div className="text-xs text-gray-600">
                        Stagnant: <span className="font-mono font-semibold">{student.stagnantCount}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenDoc({ documentId: student.documentId, studentName: student.studentName })}
                      disabled={!student.documentId}
                      className="text-xs px-3 py-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Open doc
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-3 text-xs text-gray-500">
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
          <div className="text-center py-12">
            <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 text-lg">No students have joined yet</p>
            <p className="text-gray-500 text-sm">Share the session code with your students</p>
          </div>
        )}
      </div>
    </div>
  );
}
