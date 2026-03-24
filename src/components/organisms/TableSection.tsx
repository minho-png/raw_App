import React from 'react';
import { Download, Loader2, Check, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TableFilterBar } from '@/components/molecules/TableFilterBar';
import { DataTable } from '@/components/molecules/DataTable';
import { PerformanceRecord } from "@/types";
import { motion } from 'framer-motion';

export interface TableSectionProps {
  filteredData: PerformanceRecord[];
  tableFilteredData: PerformanceRecord[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterMedia: string;
  setFilterMedia: (m: string) => void;
  filterDmp: string;
  setFilterDmp: (d: string) => void;
  mediaOptions: string[];
  dmpOptions: string[];
  editingCell: { id: string, value: number } | null;
  setEditingCell: (cell: { id: string, value: number } | null) => void;
  handleUpdateAmount: (id: string, value: number) => Promise<void>;
  isUpdating: boolean;
  tablePage: number;
  setTablePage: (page: number) => void;
  TABLE_PAGE_SIZE: number;
  handleCsvExport: (numericOnly: boolean) => void;
  handleSaveProcessedData: () => void;
  isSavingReport: boolean;
  setActiveTabStep: (step: string) => void;
  setIsBudgetModalOpen: (val: boolean) => void;
}

export const TableSection: React.FC<TableSectionProps> = ({
  filteredData,
  tableFilteredData,
  searchQuery,
  setSearchQuery,
  filterMedia,
  setFilterMedia,
  filterDmp,
  setFilterDmp,
  mediaOptions,
  dmpOptions,
  editingCell,
  setEditingCell,
  handleUpdateAmount,
  isUpdating,
  tablePage,
  setTablePage,
  TABLE_PAGE_SIZE,
  handleCsvExport,
  handleSaveProcessedData,
  isSavingReport,
  setActiveTabStep,
  setIsBudgetModalOpen
}) => {
  return (
    <motion.div
      key="processing"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight font-outfit uppercase">성과 검증 및 수동 보정</h2>
            <p className="text-slate-500 font-medium text-lg mt-1">집계된 성과를 검토하고 실제 집행 금액을 정밀하게 보정하십시오.</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => handleCsvExport(true)}
              disabled={filteredData.length === 0}
              className="h-12 px-6 rounded-2xl border-slate-200 font-bold"
            >
              <Download className="mr-2 h-4 w-4 text-green-600" /> CSV(숫자형)
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 h-14 px-8 rounded-2xl font-black text-lg shadow-xl shadow-green-600/20 transition-all hover:translate-y-[-4px] active:translate-y-0"
              onClick={handleSaveProcessedData}
              disabled={isSavingReport || filteredData.length === 0}
            >
              {isSavingReport ? <Loader2 className="mr-2 h-6 w-6 animate-spin" /> : <Check size={20} className="mr-2 stroke-[3px]"/>}
              최종 변경 사항 반영
            </Button>
          </div>
        </div>

        {filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-5">
              <Settings2 size={28} className="text-amber-400" />
            </div>
            <h3 className="text-xl font-black text-slate-700 tracking-tight mb-2">처리된 데이터가 없습니다</h3>
            <p className="text-slate-400 text-sm font-medium max-w-sm mb-6">
              서브캠페인의 <span className="font-black text-slate-600">mapping_value</span>와 CSV 캠페인명이 일치하지 않거나, 아직 CSV를 업로드하지 않았습니다.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setActiveTabStep('source')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
              >
                01. 데이터 로드로 돌아가기
              </button>
              <button
                onClick={() => setIsBudgetModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-white border-2 border-slate-200 text-slate-700 text-sm font-bold hover:border-blue-300 transition-colors"
              >
                매핑 설정 확인
              </button>
            </div>
          </div>
        )}

        {filteredData.length > 0 && (
          <div className="space-y-0">
            <TableFilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filterMedia={filterMedia}
              onMediaChange={setFilterMedia}
              filterDmp={filterDmp}
              onDmpChange={setFilterDmp}
              mediaOptions={mediaOptions}
              dmpOptions={dmpOptions}
              totalCount={filteredData.length}
              filteredCount={tableFilteredData.length}
              onReset={() => {
                setSearchQuery('');
                setFilterMedia('all');
                setFilterDmp('all');
              }}
            />
            <DataTable
              data={tableFilteredData}
              editingCell={editingCell}
              onEditStart={(id, value) => setEditingCell({ id, value })}
              onEditChange={(id, value) => setEditingCell({ id, value })}
              onEditConfirm={handleUpdateAmount}
              onEditCancel={() => setEditingCell(null)}
              isUpdating={isUpdating}
              page={tablePage}
              pageSize={TABLE_PAGE_SIZE}
              onPageChange={setTablePage}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};
