"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, CreditCard, AlertTriangle, X, ChevronDown } from 'lucide-react';
import { Agency, AdAccount } from '@/types';

// ── Data contracts ──────────────────────────────────────────────────────────
interface AgencyListResponse {
  data: Agency[];
  total: number;
}

interface AdAccountListResponse {
  data: AdAccount[];
  total: number;
}

interface AdAccountCreatePayload {
  name: string;
  agency_id: string;
  is_active: boolean;
}

interface AdAccountFormState {
  name: string;
  agency_id: string;
  is_active: boolean;
}

// ── Component ───────────────────────────────────────────────────────────────
export const AdAccountManagement: React.FC = () => {
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [agencyFilter, setAgencyFilter] = useState<string>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AdAccount | null>(null);
  const [formState, setFormState] = useState<AdAccountFormState>({ name: '', agency_id: '', is_active: true });
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirm state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingAccount = accounts.find(a => a.account_id === deleteTargetId);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agenciesRes, accountsRes] = await Promise.all([
        fetch('/api/v1/agencies'),
        fetch('/api/v1/ad-accounts'),
      ]);
      if (!agenciesRes.ok) throw new Error('대행사 목록을 불러오지 못했습니다.');
      if (!accountsRes.ok) throw new Error('계정 목록을 불러오지 못했습니다.');

      const agencyJson: AgencyListResponse = await agenciesRes.json();
      const accountJson: AdAccountListResponse = await accountsRes.json();

      setAgencies(agencyJson.data ?? []);
      setAccounts(accountJson.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const agencyName = (agencyId: string) =>
    agencies.find(a => a.agency_id === agencyId)?.name ?? agencyId;

  const filteredAccounts = agencyFilter === 'all'
    ? accounts
    : accounts.filter(a => a.agency_id === agencyFilter);

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormState({ name: '', agency_id: agencies[0]?.agency_id ?? '', is_active: true });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (account: AdAccount) => {
    setEditingAccount(account);
    setFormState({ name: account.name, agency_id: account.agency_id, is_active: account.is_active });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formState.name.trim()) {
      setFormError('계정 이름을 입력해주세요.');
      return;
    }
    if (!formState.agency_id) {
      setFormError('대행사를 선택해주세요.');
      return;
    }
    setIsSaving(true);
    setFormError(null);
    try {
      const payload: AdAccountCreatePayload = {
        name: formState.name.trim(),
        agency_id: formState.agency_id,
        is_active: formState.is_active,
      };

      if (editingAccount) {
        const res = await fetch(`/api/v1/ad-accounts/${editingAccount.account_id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('저장에 실패했습니다.');
      } else {
        const res = await fetch('/api/v1/ad-accounts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('생성에 실패했습니다.');
      }

      setIsModalOpen(false);
      await fetchData();
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
      const res = await fetch(`/api/v1/ad-accounts/${deleteTargetId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제에 실패했습니다.');
      setDeleteTargetId(null);
      await fetchData();
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
          <h1 className="text-xl font-bold text-slate-800">광고 계정 관리</h1>
          <p className="text-sm text-slate-500 mt-0.5">대행사별 광고 계정을 등록하고 관리합니다.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-[#2563eb] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          계정 추가
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertTriangle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Agency filter */}
      <div className="mb-4 flex items-center gap-2">
        <label className="text-sm font-medium text-slate-600 shrink-0">대행사 필터:</label>
        <div className="relative">
          <select
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
            className="appearance-none bg-white border border-slate-200 rounded-lg pl-3 pr-8 py-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            <option value="all">전체</option>
            {agencies.map(ag => (
              <option key={ag.agency_id} value={ag.agency_id}>{ag.name}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <span className="text-sm text-slate-400 ml-auto">
          총 {filteredAccounts.length}개 계정
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <CreditCard size={32} className="text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              {agencyFilter === 'all' ? '등록된 계정이 없습니다.' : '이 대행사에 연결된 계정이 없습니다.'}
            </p>
            <p className="text-sm text-slate-400 mt-1">우측 상단의 버튼으로 계정을 추가하세요.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">계정명</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">대행사</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">등록일</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">액션</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAccounts.map((account) => (
                <tr key={account.account_id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <CreditCard size={14} className="text-blue-500" />
                      </div>
                      <span className="font-semibold text-slate-800">{account.name}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-slate-600">{agencyName(account.agency_id)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      account.is_active
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}>
                      {account.is_active ? '활성' : '비활성'}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {new Date(account.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(account)}
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
                      >
                        <Pencil size={11} />
                        편집
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(account.account_id)}
                        className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg px-2.5 py-1.5 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={11} />
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editingAccount ? '광고 계정 편집' : '광고 계정 추가'}
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
                  계정 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={formState.name}
                  onChange={(e) => setFormState(s => ({ ...s, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="광고 계정 이름 입력"
                  className="w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  대행사 <span className="text-red-500">*</span>
                </label>
                {agencies.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    대행사를 먼저 등록해주세요.
                  </p>
                ) : (
                  <div className="relative">
                    <select
                      value={formState.agency_id}
                      onChange={(e) => setFormState(s => ({ ...s, agency_id: e.target.value }))}
                      className="appearance-none w-full h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
                    >
                      <option value="">대행사 선택</option>
                      {agencies.filter(a => a.is_active).map(ag => (
                        <option key={ag.agency_id} value={ag.agency_id}>{ag.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                )}
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
                disabled={isSaving || agencies.length === 0}
                className="flex-1 h-10 rounded-lg bg-[#2563eb] text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteTargetId && deletingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">계정 삭제</h3>
                <p className="text-xs text-slate-500 mt-0.5">이 작업은 되돌릴 수 없습니다.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-100 rounded-xl p-3">
              <p className="text-sm font-bold text-red-700">"{deletingAccount.name}"</p>
              <p className="text-xs text-red-500 mt-1">계정과 연결된 캠페인 데이터가 영향을 받을 수 있습니다.</p>
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
