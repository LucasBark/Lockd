import { useMemo, useState, useEffect, useCallback } from 'react';
import { Monitor, User, Activity, FileText, Brain } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { usePeerConnection, StudentHeartbeat } from '../hooks/usePeerConnection';
import { useWebLLM, ContentQuality } from '../hooks/useWebLLM';
import { useAIVector } from '../hooks/useAIVector';

interface StudentStatus extends StudentHeartbeat {
  documentId: string;
  content: string;
  quality: ContentQuality;
  lastSeen: number;
}

interface MonitorGridProps {
  sessionId: string;
  sessionCode: string;
}

export function MonitorGrid({ sessionId, sessionCode }: MonitorGridProps) {
  const [students, setStudents] = useState<Map<string, StudentStatus>>(new Map());
  const handleHeartbeat = useCallback((data: StudentHeartbeat) => {
    setStudents((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(data.studentId);
      newMap.set(data.studentId, {
        ...data,
        documentId: existing?.documentId || '',
        content: existing?.content || data.snippet,
        quality: existing?.quality || 'Unknown',
        lastSeen: Date.now(),
      });
      return newMap;
    });
  }, []);

  const { peerId } = usePeerConnection({
    role: 'teacher',
    onReceiveHeartbeat: handleHeartbeat,
  });

  const { isLoading: aiLoading, loadingProgress, analyzeContent, isReady } = useWebLLM();
  // Include all students with documents so AI runs without depending on P2P heartbeats
  const activeStudentIds = useMemo(
    () => Array.from(students.keys()),
    [students]
  );

  const { qualities } = useAIVector({
    sessionId,
    enabled: isReady,
    activeStudentIds,
    analyzeContent,
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
    if (!qualities || qualities.size === 0) return;
    setStudents((prev) => {
      const next = new Map(prev);
      for (const [studentId, quality] of qualities.entries()) {
        const current = next.get(studentId);
        if (current) next.set(studentId, { ...current, quality });
      }
      return next;
    });
  }, [qualities]);

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
              content: doc.content,
              isTabActive: existing?.isTabActive ?? true,
              isWindowFocused: existing?.isWindowFocused ?? true,
              lastInput: existing?.lastInput ?? Date.now(),
              snippet: doc.content.substring(0, 200),
              quality: existing?.quality || 'Unknown',
              lastSeen: existing?.lastSeen || Date.now(),
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
                content: doc.content,
                isTabActive: existing?.isTabActive ?? true,
                isWindowFocused: existing?.isWindowFocused ?? true,
                lastInput: existing?.lastInput ?? Date.now(),
                snippet: doc.content.substring(0, 200),
                quality: existing?.quality || 'Unknown',
                lastSeen: existing?.lastSeen || Date.now(),
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

  const getQualityColor = (quality: ContentQuality) => {
    switch (quality) {
      case 'Productive':
        return 'bg-green-100 text-green-700 border-green-300';
      case 'Gibberish':
        return 'bg-red-100 text-red-700 border-red-300';
      case 'Analyzing':
        return 'bg-blue-100 text-blue-700 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-3xl font-bold text-gray-800">Lockd Dashboard</h1>
                <p className="text-gray-600">Session Code: <span className="font-mono font-bold text-blue-600">{sessionCode}</span></p>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-1">
                <Brain className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-gray-700">AI Analysis</span>
              </div>
              {aiLoading ? (
                <div className="text-sm text-gray-600">
                  Loading AI Model: {loadingProgress}%
                </div>
              ) : (
                <div className="text-sm text-green-600">Ready</div>
              )}
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
                    <span className={`text-xs px-2 py-1 rounded-full border ${getQualityColor(student.quality)}`}>
                      {student.quality}
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
