"use client";

import React, { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Loader2,
  MessageSquare,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  Check,
} from 'lucide-react';
import { SectionCard } from '@/components/atoms/SectionCard';
import { Button } from '@/components/ui/button';
import { StaleInsightBanner } from '@/components/molecules/StaleInsightBanner';
import { AiInsight } from '@/types';
import { useToast } from '@/context/ToastContext';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsightsBlockProps {
  /** Campaign ID used for AI insight generation and retrieval */
  campaignId: string;
  /** Disables the AI analysis button when no performance data is loaded */
  hasData: boolean;
  /** Current free-text memo value for this campaign */
  memoValue: string;
  /** Callback fired when the user saves the memo */
  onMemoSave: (value: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function priorityColor(priority: string): string {
  if (priority === 'high') return 'text-red-600 bg-red-50 border-red-100';
  if (priority === 'medium') return 'text-amber-600 bg-amber-50 border-amber-100';
  return 'text-slate-500 bg-slate-50 border-slate-200';
}

function priorityLabel(priority: string): string {
  if (priority === 'high') return '긴급';
  if (priority === 'medium') return '권장';
  return '참고';
}

// ─── Component ────────────────────────────────────────────────────────────────

export const InsightsBlock: React.FC<InsightsBlockProps> = ({
  campaignId,
  hasData,
  memoValue,
  onMemoSave,
}) => {
  const toast = useToast();

  // Self-contained AI insight state — lives here, not in parent
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);

  // Local memo state — parent owns the canonical value, we edit locally
  const [localMemo, setLocalMemo] = useState(memoValue);

  // Sync local memo when parent prop changes (e.g. campaign switch)
  React.useEffect(() => {
    setLocalMemo(memoValue);
  }, [memoValue]);

  const handleGenerateAiInsight = useCallback(async () => {
    if (!campaignId || !hasData) return;
    setIsGeneratingAi(true);
    try {
      const res = await fetch('/api/v1/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error('AI 분석 실패', json.error ?? '잠시 후 다시 시도해 주세요.');
        return;
      }
      setAiInsight(json.data as AiInsight);
      setStaleBannerDismissed(false);
      toast.success(
        'AI 분석 완료',
        `${(json.data.recommendations?.length ?? 0)}개의 권장사항이 생성되었습니다.`
      );
    } catch {
      toast.error('AI 분석 오류', '네트워크 오류가 발생했습니다.');
    } finally {
      setIsGeneratingAi(false);
    }
  }, [campaignId, hasData, toast]);

  const handleSaveMemo = useCallback(() => {
    onMemoSave(localMemo);
  }, [localMemo, onMemoSave]);

  return (
    <SectionCard
      title="Intelligence Synthesis"
      titleIcon={<MessageSquare size={24} className="text-blue-600" />}
      actions={
        <div className="flex items-center gap-3">
          <Button
            onClick={handleGenerateAiInsight}
            disabled={isGeneratingAi || !hasData}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 rounded-2xl font-black shadow-lg shadow-blue-500/20 transition-all"
          >
            {isGeneratingAi ? (
              <>
                <Loader2 size={16} className="mr-2 animate-spin" />
                AI 분석 중...
              </>
            ) : (
              <>
                <Sparkles size={16} className="mr-2" />
                AI 성과 분석
              </>
            )}
          </Button>
          <Button
            onClick={handleSaveMemo}
            variant="outline"
            className="rounded-2xl font-black border-slate-200"
          >
            메모 저장
          </Button>
        </div>
      }
    >
      {/* Stale insight banner — shown when new data uploaded but AI not re-run */}
      <AnimatePresence>
        {aiInsight?.is_stale && !staleBannerDismissed && (
          <StaleInsightBanner
            onReanalyze={handleGenerateAiInsight}
            onDismiss={() => setStaleBannerDismissed(true)}
          />
        )}
      </AnimatePresence>

      {/* AI analysis result */}
      {aiInsight && (
        <div className="mb-8 space-y-6">
          {/* Summary */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={16} className="text-blue-600" />
              <span className="text-xs font-black text-blue-600 uppercase tracking-widest">
                AI 요약
              </span>
              <span className="ml-auto text-[10px] font-bold text-slate-400">
                {new Date(aiInsight.generated_at).toLocaleString('ko-KR')} · {aiInsight.model}
              </span>
            </div>
            <p className="text-slate-700 font-medium leading-relaxed">{aiInsight.summary}</p>
          </div>

          {/* Anomaly detection */}
          {aiInsight.anomalies?.length > 0 && (
            <div>
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                <AlertTriangle size={14} className="text-amber-500" />
                이상 탐지
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {aiInsight.anomalies.map((anomaly, i) => (
                  <div
                    key={i}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {anomaly.direction === 'spike' ? (
                        <ArrowUp size={14} className="text-red-500" />
                      ) : (
                        <ArrowDown size={14} className="text-blue-500" />
                      )}
                      <span className="text-xs font-black text-slate-600 uppercase">
                        {anomaly.metric}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">{anomaly.date}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-600 leading-snug">
                      {anomaly.description}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs font-black">
                      <span className="text-slate-900">
                        {anomaly.value?.toLocaleString('ko-KR')}
                      </span>
                      <span className="text-slate-300">vs</span>
                      <span className="text-slate-400">
                        {anomaly.baseline?.toLocaleString('ko-KR')} 기준
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {aiInsight.recommendations?.length > 0 && (
            <div>
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                권장사항
              </h4>
              <div className="space-y-3">
                {aiInsight.recommendations.map((rec, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-4 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm"
                  >
                    <span
                      className={cn(
                        'text-[10px] font-black px-2.5 py-1 rounded-xl border mt-0.5 shrink-0',
                        priorityColor(rec.priority)
                      )}
                    >
                      {priorityLabel(rec.priority)}
                    </span>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{rec.title}</p>
                      <p className="text-slate-500 text-sm mt-1 leading-relaxed">
                        {rec.description}
                      </p>
                      {rec.action && (
                        <p className="text-blue-600 text-xs font-bold mt-2 flex items-center gap-1">
                          <Check size={11} />
                          {rec.action}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual memo */}
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
          수동 메모
        </p>
        <textarea
          className="w-full min-h-[140px] p-6 rounded-[20px] border border-slate-200 bg-slate-50 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:outline-none transition-all text-slate-700 text-base font-medium placeholder:text-slate-300"
          placeholder="성과 결과를 종합하고 전략적 방향을 기록하세요..."
          value={localMemo}
          onChange={e => setLocalMemo(e.target.value)}
        />
      </div>
    </SectionCard>
  );
};
