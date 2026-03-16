import { useEffect, useRef, useState } from 'react';
import type { ContentQuality } from './useWebLLM';
import { supabase } from '../lib/supabase';

type AnalyzeContentFn = (text: string) => Promise<ContentQuality>;

interface UseAIVectorArgs {
  sessionId: string;
  enabled: boolean;
  activeStudentIds: string[];
  analyzeContent: AnalyzeContentFn;
  intervalMs?: number;
}

export function useAIVector({
  sessionId,
  enabled,
  activeStudentIds,
  analyzeContent,
  intervalMs = 60_000,
}: UseAIVectorArgs) {
  const [qualities, setQualities] = useState<Map<string, ContentQuality>>(new Map());
  const isRunningRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!sessionId) return;
    if (activeStudentIds.length === 0) return;

    let mounted = true;

    const run = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      try {
        const { data: docs, error } = await supabase
          .from('documents')
          .select('student_id, content')
          .eq('session_id', sessionId)
          .in('student_id', activeStudentIds);

        if (error) {
          console.error('AI vector fetch error:', error);
          return;
        }

        const next = new Map<string, ContentQuality>();
        for (const doc of docs ?? []) {
          const text = (doc.content ?? '').toString();
          if (text.trim().length < 20) continue;
          const quality = await analyzeContent(text);
          next.set(doc.student_id, quality);
        }

        if (mounted && next.size > 0) setQualities(next);
      } finally {
        isRunningRef.current = false;
      }
    };

    // Run immediately and then on interval.
    run();
    const t = window.setInterval(run, intervalMs);

    return () => {
      mounted = false;
      window.clearInterval(t);
    };
  }, [enabled, sessionId, activeStudentIds, analyzeContent, intervalMs]);

  return { qualities };
}

