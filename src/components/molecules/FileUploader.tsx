"use client";

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CalculationService } from '@/services/calculationService';
import { useCampaignStore } from '@/store/useCampaignStore';
import { MediaProvider } from '@/types';

interface FileUploaderProps {
  onAnalysisComplete: (data: any[]) => void;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ onAnalysisComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const { selectedCampaignId, campaigns } = useCampaignStore();
  const selectedCampaign = campaigns.find(c => c.campaign_id === selectedCampaignId);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!selectedCampaignId) {
      alert("먼저 캠페인을 선택해 주세요.");
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      const text = await file.text();
      const rawData = await CalculationService.parseCsv(text);
      
      // Simulate slightly longer analysis for UI effect if file is small
      await new Promise(r => setTimeout(r, 1500));

      const processed = CalculationService.processWithDanfo(
        rawData, 
        selectedCampaignId, 
        (selectedCampaign?.media as MediaProvider) || '네이버GFA',
        selectedCampaign?.total_fee_rate || 10
      );

      onAnalysisComplete(processed);
    } catch (error) {
      console.error("Analysis failed:", error);
      alert("파일 분석 중 오류가 발생했습니다.");
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
              <p className="text-sm text-slate-500 mt-2 text-center">
                네이버 GFA 리포트 파일을 드래그하거나 클릭하여 업로드하세요.<br/>
                <span className="text-blue-500 font-semibold">{selectedCampaign?.campaign_name || '캠페인을 선택하세요'}</span> 에 데이터가 귀속됩니다.
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
