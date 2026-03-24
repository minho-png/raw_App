"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StaleInsightBannerProps {
  onReanalyze: () => void;
  onDismiss: () => void;
}

export const StaleInsightBanner: React.FC<StaleInsightBannerProps> = ({
  onReanalyze,
  onDismiss,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mx-0 mb-4 p-4 rounded-2xl bg-amber-50 border border-amber-200 border-l-4 border-l-amber-500 shadow-sm flex items-start justify-between gap-4"
    >
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <AlertTriangle
          size={18}
          className="text-amber-600 mt-0.5 flex-shrink-0"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="font-black text-amber-900 text-sm">
            새 데이터 감지 &mdash; AI 재분석 필요
          </p>
          <p className="text-amber-700 text-xs mt-1 leading-relaxed">
            성과 데이터가 변경되었습니다. AI 분석을 다시 실행하면 최신 인사이트를 확인할 수 있습니다.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Button
          size="sm"
          onClick={onReanalyze}
          className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-4 rounded-xl shadow-sm transition-colors"
        >
          재분석
        </Button>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 hover:bg-amber-100 rounded-lg text-amber-500 transition-colors"
          aria-label="배너 닫기"
        >
          <X size={16} />
        </button>
      </div>
    </motion.div>
  );
};
