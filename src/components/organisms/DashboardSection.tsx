import React from 'react';
import { Database, Layers, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { MediaMixSection } from '@/components/molecules/MediaMixSection';
import { PerformanceRecord } from "@/types";
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortableItem } from '@/components/molecules/SortableItem';
import { motion } from 'framer-motion';

export interface DashboardSectionProps {
  filteredData: PerformanceRecord[];
  filterStartDate: string;
  filterEndDate: string;
  setFilterStartDate: (val: string) => void;
  setFilterEndDate: (val: string) => void;
  setActiveTabStep: (step: string) => void;
  handleFetchDbData: () => void;
  isLoadingDb: boolean;
  dashboardLayout: string[];
  sensors: any;
  handleDashboardDragEnd: (event: DragEndEvent) => void;
  getBlockProps: (blockId: string) => any;
  BLOCK_COMPONENTS: Record<string, React.ComponentType<any>>;
}

export const DashboardSection: React.FC<DashboardSectionProps> = ({
  filteredData,
  filterStartDate,
  filterEndDate,
  setFilterStartDate,
  setFilterEndDate,
  setActiveTabStep,
  handleFetchDbData,
  isLoadingDb,
  dashboardLayout,
  sensors,
  handleDashboardDragEnd,
  getBlockProps,
  BLOCK_COMPONENTS
}) => {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-8"
    >
      {/* Empty state */}
      {filteredData.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-6">
            <Database size={36} className="text-slate-300" />
          </div>
          <h3 className="text-2xl font-black text-slate-700 tracking-tight mb-2">표시할 데이터가 없습니다</h3>
          <p className="text-slate-400 font-medium mb-2">
            {(filterStartDate || filterEndDate) ? '선택한 기간에 해당하는 데이터가 없습니다.' : 'CSV를 업로드하거나 DB에서 데이터를 불러오세요.'}
          </p>
          {(filterStartDate || filterEndDate) && (
            <button
              onClick={() => { setFilterStartDate(''); setFilterEndDate(''); }}
              className="mt-2 text-xs font-bold text-blue-500 hover:text-blue-700 underline"
            >
              기간 필터 초기화
            </button>
          )}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setActiveTabStep('source')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
            >
              CSV 업로드
            </button>
            <button
              onClick={handleFetchDbData}
              disabled={isLoadingDb}
              className="px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-slate-300 transition-colors"
            >
              {isLoadingDb ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null}
              DB 동기화
            </button>
          </div>
        </div>
      )}

      {/* 매체 믹스 비교 */}
      {filteredData.length > 0 && (() => {
        const hasMultiMedia = new Set(filteredData.map(r => r.media).filter(Boolean)).size > 1;
        if (!hasMultiMedia) return null;
        return (
          <Card className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
            <div className="flex items-center gap-3 mb-8">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white">
                <Layers size={20} />
              </div>
              <h3 className="text-2xl font-black text-slate-800 font-outfit uppercase tracking-tight">매체 믹스 성과 비교</h3>
            </div>
            <MediaMixSection records={filteredData} />
          </Card>
        );
      })()}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDashboardDragEnd}>
        <SortableContext items={dashboardLayout} strategy={verticalListSortingStrategy}>
          <div className="space-y-8">
            {dashboardLayout.map((blockId) => {
              const Block = BLOCK_COMPONENTS[blockId];
              if (!Block) return null;
              return (
                <SortableItem key={blockId} id={blockId}>
                  <Block {...getBlockProps(blockId)} />
                </SortableItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </motion.div>
  );
};
