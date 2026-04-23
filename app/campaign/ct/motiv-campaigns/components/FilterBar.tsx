"use client";

import type { MotivCampaignType, MotivStatus } from '@/lib/motivApi/types';

export interface Filters {
  q: string;
  status: '' | MotivStatus;
  campaign_type: '' | MotivCampaignType;
  start_date: string;
  end_date: string;
}

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
  onSearch: () => void;
  onReset: () => void;
  isLoading: boolean;
}

const TYPE_OPTIONS: { value: '' | MotivCampaignType; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'DISPLAY', label: 'DISPLAY' },
  { value: 'VIDEO', label: 'VIDEO' },
  { value: 'TV', label: 'TV' },
  { value: 'PARTNERS', label: 'PARTNERS' },
];

const STATUS_OPTIONS: { value: '' | MotivStatus; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'Y', label: '활성(Y)' },
  { value: 'N', label: '비활성(N)' },
];

export function FilterBar({ value, onChange, onSearch, onReset, isLoading }: Props) {
  const update = <K extends keyof Filters>(key: K, v: Filters[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-semibold text-gray-600">검색어 (캠페인명)</label>
          <input
            type="text"
            value={value.q}
            onChange={(e) => update('q', e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            placeholder="캠페인명 검색"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">상태</label>
          <select
            value={value.status}
            onChange={(e) => update('status', e.target.value as Filters['status'])}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">캠페인 타입</label>
          <select
            value={value.campaign_type}
            onChange={(e) => update('campaign_type', e.target.value as Filters['campaign_type'])}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">통계 시작일</label>
          <input
            type="date"
            value={value.start_date}
            onChange={(e) => update('start_date', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600">통계 종료일</label>
          <input
            type="date"
            value={value.end_date}
            onChange={(e) => update('end_date', e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          onClick={onReset}
          disabled={isLoading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          초기화
        </button>
        <button
          onClick={onSearch}
          disabled={isLoading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? '조회 중…' : '조회'}
        </button>
      </div>
    </div>
  );
}
