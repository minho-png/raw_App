"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileCheck, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalculationService } from '@/services/calculationService';
import { useCampaignStore } from '@/store/useCampaignStore';
import { MediaProvider } from '@/types';

import { savePerformanceData } from '@/server/actions/settlement';

interface FileUploaderProps {
  onAnalysisComplete: (data: any[]) => void;
  overrides?: {
    media: MediaProvider;
    group_by_columns: string[];
  };
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onAnalysisComplete, overrides }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const { selectedCampaignId, campaigns, selectCampaign } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedCampaignId) {
      alert("먼저 캠페인을 선택해 주세요.");
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);
    setUploadStatus(null);

    try {
      const text = await file.text();
      const rawData = await CalculationService.parseCsv(text);
      
      const processed = CalculationService.processWithDanfo(
        rawData, 
        selectedCampaignId, 
        overrides?.media || (selectedCampaign?.media as MediaProvider) || '네이버GFA',
        selectedCampaign?.total_fee_rate || 10,
        overrides?.group_by_columns || []
      );

      // Server Action CALL
      const result = await savePerformanceData(processed);

      if (result.success) {
        // Narrowing manually to appease linter if needed, though result.success should work
        const successResult = result as { success: true, deletedCount: number, insertedCount: number };
        setUploadStatus({ 
          type: 'success', 
          message: `${successResult.insertedCount}건의 데이터가 성공적으로 DB에 저장되었습니다.` 
        });
        onAnalysisComplete(processed);
      } else {
        const errorResult = result as { success: false, error: string };
        throw new Error(errorResult.error || 'DB 저장 실패');
      }
    } catch (error) {
      console.error("Analysis or Save failed:", error);
      setUploadStatus({ 
        type: 'error', 
        message: "데이터 저장 중 오류가 발생했습니다. 환경 변수를 확인하세요." 
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedCampaignId, selectedCampaign, onAnalysisComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false
  });

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Upload Status Message */}
      <AnimatePresence>
        {uploadStatus && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            className={cn(
              "mb-4 p-4 rounded-2xl border flex items-center gap-3",
              uploadStatus.type === 'success' ? "bg-green-50 border-green-100 text-green-700" : "bg-red-50 border-red-100 text-red-700"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center",
              uploadStatus.type === 'success' ? "bg-green-100" : "bg-red-100"
            )}>
              {uploadStatus.type === 'success' ? <FileCheck size={18} /> : <Zap size={18} />}
            </div>
            <p className="text-sm font-medium">{uploadStatus.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div 
        {...getRootProps()} 
        className={cn(
          "relative h-64 border-2 border-dashed rounded-3xl transition-all duration-300 flex flex-col items-center justify-center p-8 overflow-hidden backdrop-blur-md bg-white/30 border-white/40",
          isDragActive ? "border-blue-400 bg-blue-50/50 scale-[1.02]" : "hover:border-slate-300 hover:bg-white/40",
          isProcessing && "pointer-events-none"
        )}
      >
        <input {...getInputProps()} />
        
        <AnimatePresence mode="wait">
          {isProcessing ? (
            <motion.div 
              key="loading"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center"
            >
              <div className="relative">
                <Loader2 size={48} className="text-blue-500 animate-spin" />
                <motion.div 
                  className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.5 }}
                />
              </div>
              <p className="mt-4 text-slate-600 font-medium animte-pulse">Danfo.js 엔진 가동 중...</p>
              <p className="text-xs text-slate-400">데이터프레임 분석 및 집계를 실행하고 있습니다.</p>
            </motion.div>
          ) : (
            <motion.div 
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 mb-4 shadow-inner">
                <Upload size={28} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">CSV 리포트 업로드</h3>
              
              <div className="mt-4 mb-6 w-full max-w-xs">
                <select 
                  className="w-full bg-white/50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium focus:ring-blue-500"
                  value={selectedCampaignId || ''}
                  onChange={(e) => selectCampaign(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="" disabled>분석 대상 캠페인 선택</option>
                  {campaigns.map(c => (
                    <option key={c.campaign_id} value={c.campaign_id}>{c.campaign_name}</option>
                  ))}
                </select>
              </div>

              <p className="text-sm text-slate-500 text-center">
                파일을 드래그하거나 클릭하여 업로드하세요.<br/>
                <span className="text-blue-500 font-semibold">{selectedCampaign?.campaign_name || '캠페인을 먼저 선택하세요'}</span> 에 데이터가 귀속됩니다.
              </p>
              <div className="mt-6 flex gap-2">
                <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Papaparse Ready</span>
                <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Danfo.js Active</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Decorative corner glow */}
        <div className="absolute -top-10 -right-10 w-24 h-24 bg-blue-400/10 blur-3xl rounded-full" />
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-400/10 blur-3xl rounded-full" />
      </div>
    </div>
  );
};
