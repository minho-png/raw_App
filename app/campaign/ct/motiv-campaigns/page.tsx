"use client";

import { useCallback, useEffect, useState } from 'react';
import type { MotivCampaignListResponse } from '@/lib/motivApi/types';
import { FilterBar, type Filters } from './components/FilterBar';
import { CampaignTable } from './components/CampaignTable';
import { Pagination } from './components/Pagination';
import { ZeroSpendAlertBanner } from '@/components/settlement/ZeroSpendAlertBanner';
import { MotivSettlementTable } from '@/components/settlement/MotivSettlementTable';
import { useMotivAssignments } from '@/lib/hooks/useMotivAssignments';
import { useMotivSettlementCampaignsByProduct } from '@/lib/hooks/useMotivSettlementCampaigns';
import { useMotivAdAccounts } from '@/lib/hooks/useMotivAdAccounts';
import { useMotivAgencies } from '@/lib/hooks/useMotivAgencies';
import { useMasterData } from '@/lib/hooks/useMasterData';

const INITIAL_FILTERS: Filters = {
  q: '',
  status: '',
  campaign_type: '',
  start_date: '',
  end_date: '',
};

export default function MotivCampaignsPage() {
  const [filters, setFilters] = useState<Filters>(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(INITIAL_FILTERS);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const [data, setData] = useState<MotivCampaignListResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── 정산 지정 (CT 전용) ───────────────────────────────────────
  const { agencies, advertisers, operators } = useMasterData();
  const motivCt = useMotivSettlementCampaignsByProduct('CT', undefined, true);
  const { data: assignments, upsert: upsertAssignment } = useMotivAssignments();
  const { byId: adAccountById } = useMotivAdAccounts();
  const { byId: motivAgencyById } = useMotivAgencies();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (appliedFilters.q) params.set('q', appliedFilters.q);
      if (appliedFilters.status) params.set('status', appliedFilters.status);
      if (appliedFilters.campaign_type) params.set('campaign_type', appliedFilters.campaign_type);
      if (appliedFilters.start_date) params.set('start_date', appliedFilters.start_date);
      if (appliedFilters.end_date) params.set('end_date', appliedFilters.end_date);
      params.set('per_page', String(perPage));
      params.set('page', String(page));
      params.set('sort', '-created_at');

      const res = await fetch(`/api/motiv/campaigns?${params.toString()}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as MotivCampaignListResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters, page, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = () => {
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleReset = () => {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setPage(1);
  };

  const meta = data?.meta;

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-6 py-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">CT 캠페인 현황</h1>
        <p className="mt-1 text-sm text-gray-500">
          크로스타겟 운영데스크 API에서 CT 캠페인 목록을 조회합니다.
        </p>
      </header>

      <ZeroSpendAlertBanner />

      <FilterBar
        value={filters}
        onChange={setFilters}
        onSearch={handleSearch}
        onReset={handleReset}
        isLoading={isLoading}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <strong className="font-semibold">오류:</strong> {error}
        </div>
      )}

      {data && (
        <SummaryStrip total={data.meta.total} exchangeRate={data.exchange_rate} />
      )}

      <CampaignTable campaigns={data?.data ?? []} isLoading={isLoading} />

      {meta && meta.last_page > 0 && (
        <Pagination
          currentPage={meta.current_page}
          lastPage={meta.last_page}
          total={meta.total}
          perPage={perPage}
          onChangePage={setPage}
          onChangePerPage={(v) => {
            setPerPage(v);
            setPage(1);
          }}
        />
      )}

      {/* ─── CT 정산 지정 (대행사·광고주·운영자) ─────────────────────── */}
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-gray-900">CT 정산 지정</h2>
        <p className="text-xs text-gray-500">
          여기서 지정한 대행사·광고주·운영자 정보가 계산서 발급 / 매출·매입 정산에 자동 반영됩니다.
          기본값(보라색 API: 라벨)은 Motiv 광고계정 등록 정보 기준 — 비어 있으면 직접 선택하세요.
        </p>
        <MotivSettlementTable
          title="CT 캠페인 (DISPLAY · VIDEO · PARTNERS)"
          loading={motivCt.loading}
          error={motivCt.error}
          campaigns={motivCt.data}
          exchangeRate={motivCt.exchangeRate}
          agencies={agencies}
          advertisers={advertisers}
          operators={operators}
          assignments={assignments}
          onUpsertAssignment={upsertAssignment}
          adAccountById={adAccountById}
          motivAgencyById={motivAgencyById}
        />
      </section>
    </div>
  );
}

function SummaryStrip({ total, exchangeRate }: { total: number; exchangeRate: number }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs shadow-sm">
      <span className="text-gray-500">
        전체 캠페인 <strong className="text-gray-900">{total.toLocaleString('ko-KR')}</strong>개
      </span>
      <span className="text-gray-400">|</span>
      <span className="text-gray-500">
        적용 환율 <strong className="text-gray-900">₩{exchangeRate.toLocaleString('ko-KR')}</strong>
      </span>
    </div>
  );
}
