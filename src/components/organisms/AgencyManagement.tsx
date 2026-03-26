"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Building2, AlertTriangle, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Agency } from '@/types';

// ── Data contracts ──────────────────────────────────────────────────────────
interface AgencyListResponse {
  data: Agency[];
  total: number;
}

interface AgencyCreatePayload {
  name: string;
  is_active: boolean;
}

interface AgencyFormState {
  name: string;
  is_active: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────
export const AgencyManagement: React.FC = () => {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAgency, setEditingAgency] = useState<Agency | null>(null);
  const [formState, setFormState] = useState<AgencyFormState>({ name: '', is_active: true });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingAgency = agencies.find(a => a.agency_id === deleteTargetId);

  // Expanded card state
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchAgencies = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/agencies');
      if (!res.ok) throw new Error(`서버 오류: ${res.status}`);
      const json: AgencyListResponse = await res.json();
      setAgencies(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAgencies(); }, [fetchAgencies]);

  const openCreateModal = () => {
    setEditingAgency(null);
    setFormState({ name: '', is_active: true });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (agency: Agency) => {
    setEditingAgency(agency);
    setFormState({ name: agency.name, is_active: agency.is_active });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      setFormError('대행사 이름을 입력해주세요.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const payload: AgencyCreatePayload = {
        name: formState.name.trim(),
        is_active: formState.is_active,
      };

      if (editingAgency) {
        // PUT update
        const res = await fetch(`/api/v1/agencies/${editingAgency.agency_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장에 실패했습니다.');
      } else {
        // POST create
        const res = await fetch('/api/v1/agencies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('생성에 실패했습니다.');
      }

      setIsModalOpen(false);
      await fetchAgencies();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/agencies/${deleteTargetId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제에 실패했습니다.');
      setDeleteTargetId(null);
      await fetchAgencies();
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.');
      setDeleteTargetId(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">대행사 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">광고 대행사를 등록하고 관리합니다.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-[#2563eb] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          대행사 추가
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-pulse">
              <div className="h-4 w-2/3 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-1/3 bg-slate-100 rounded" />
            </div>
          ))}
        </div>
      ) : agencies.length === 0 ? (
        <div className="flex flex-col items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm py-16">
          <Building2 size={32} className="text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">등록된 대행사가 없습니다.</p>
          <p className="text-sm text-slate-400 mt-1">우측 상단의 버튼으로 대행사를 추가하세요.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agencies.map((agency) => {
            const isExpanded = expandedId === agency.agency_id;
            return (
              <div key={agency.agency_id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Building2 size={16} className="text-blue-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{agency.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {new Date(agency.created_at).toLocaleDateString('ko-KR')} 등록
                        </p>
                      </div>
                    </div>
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      agency.is_active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {agency.is_active ? '활성' : '비활성'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-4">
                    <button
                      onClick={() => openEditModal(agency)}
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                    >
                      <Pencil size={12} />
                      편집
                    </button>
                    <button
                      onClick={() => setDeleteTargetId(agency.agency_id)}
                      className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={12} />
                      삭제
                    </button>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : agency.agency_id)}
                      className="ml-auto text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
                    <p className="text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">Agency ID:</span> {agency.agency_id}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-semibold text-slate-600">수정일:</span>{' '}
                      {new Date(agency.updated_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingAgency ? '대행사 편집' : '대행사 추가'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  <AlertTriangle size={13} className="shrink-0" />
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  대행사 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={formState.name}
                  onChange={(e) => setFormState(s => ({ ...s, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="대행사 이름 입력"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">활성 상태</label>
                <button
                  onClick={() => setFormState(s => ({ ...s, is_active: !s.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    formState.is_active ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      formState.is_active ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex gap-2 px-6 py-4 border-t border-slate-100">
              <button
                onClick={() => setIsModalOpen(false)}
                className="flex-1 h-10 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex-1 h-10 rounded-lg bg-[#2563eb] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTargetId && deletingAgency && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">대행사 삭제</h3>
                <p className="text-xs text-slate-500 mt-0.5">이 작업은 되돌릴 수 없습니다.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-sm font-bold text-red-700">"{deletingAgency.name}"</p>
              <p className="text-xs text-red-500 mt-1">대행사와 연결된 계정 데이터가 영향을 받을 수 있습니다.</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTargetId(null)}
                className="flex-1 h-11 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 h-11 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-bold transition-colors"
              >
                {isDeleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
