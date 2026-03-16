import { useState, useEffect, useCallback, useRef } from 'react';
import { CreateMLCEngine, MLCEngineInterface } from '@mlc-ai/web-llm';

export type ContentQuality = 'Productive' | 'Gibberish' | 'Analyzing' | 'Unknown';

export function useWebLLM() {
  const [engine, setEngine] = useState<MLCEngineInterface | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const engineRef = useRef<MLCEngineInterface | null>(null);

  useEffect(() => {
    let mounted = true;

    const initEngine = async () => {
      try {
        const mlcEngine = await CreateMLCEngine('Llama-3-8B-Instruct-q4f16_1', {
          initProgressCallback: (progress) => {
            if (mounted) {
              setLoadingProgress(Math.round(progress.progress * 100));
            }
          },
        });

        if (mounted) {
          engineRef.current = mlcEngine;
          setEngine(mlcEngine);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to initialize WebLLM:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    initEngine();

    return () => {
      mounted = false;
    };
  }, []);

  const analyzeContent = useCallback(async (text: string): Promise<ContentQuality> => {
    if (!engineRef.current || !text.trim()) {
      return 'Unknown';
    }

    try {
      const prompt = `Analyze this text. If it is meaningful work, respond 'Productive'. If it is keyboard smashing, repetitive nonsense, or gibberish, respond 'Gibberish'. Text: [STUDENT_TEXT]\n\n${text.substring(0, 500)}`;

      const response = await engineRef.current.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 10,
      });

      const result = response.choices[0]?.message?.content?.toLowerCase() || '';

      if (result.includes('productive')) {
        return 'Productive';
      } else if (result.includes('gibberish')) {
        return 'Gibberish';
      }

      return 'Unknown';
    } catch (error) {
      console.error('Error analyzing content:', error);
      return 'Unknown';
    }
  }, []);

  return {
    isLoading,
    loadingProgress,
    analyzeContent,
    isReady: !!engine,
  };
}
