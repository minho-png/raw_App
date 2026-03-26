"use client";

import React, { useState, useCallback } from 'react';

// ── Data Contract ────────────────────────────────────────────────────────────

export interface ReportBuilderConfig {
  // 클라이언트 정보
  client_name: string;
  report_title: string;
  report_period: string;
  agency_name: string;

  // 섹션 구성
  sections: string[];

  // 공개 수준 설정
  show_spend: boolean;
  show_budget: boolean;
  show_cpc: boolean;
  show_ctr: boolean;
  show_impressions: boolean;

  // 기타
  custom_notes: string;
}

// ── Section / Template Definitions ──────────────────────────────────────────

interface SectionDef {
  id: string;
  label: string;
  desc: string;
  default: boolean;
}

const ALL_SECTIONS: SectionDef[] = [
  { id: 'kpi',       label: '핵심 KPI 요약',  desc: '총 노출·클릭·CTR·CPC 카드',          default: true  },
  { id: 'trend',     label: '일별 트렌드',     desc: '기간별 집행 추이 차트',                default: true  },
  { id: 'dmp',       label: 'DMP 분석',       desc: 'DMP 타겟 점유율 파이 차트',           default: true  },
  { id: 'audience',  label: '오디언스 분석',   desc: '연령/성별 분포 막대 차트',             default: true  },
  { id: 'creative',  label: '소재 성과',       desc: '소재별 클릭·노출·CTR 상위 10개',      default: false },
  { id: 'placement', label: '게재지면 분석',   desc: '지면별 성과 매트릭스',                 default: false },
  { id: 'budget',    label: '예산 현황',       desc: '매체별 예산 소진률 (금액 미포함)',      default: false },
  { id: 'insights',  label: '캠페인 인사이트', desc: '담당자 메모 및 의견',                  default: false },
];

interface TemplateDef {
  id: string;
  label: string;
  icon: string;
  desc: string;
  sections: string[];
  show_spend: boolean;
  show_budget: boolean;
  show_cpc: boolean;
  show_ctr: boolean;
  show_impressions: boolean;
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 'executive',
    label: '경영진 요약',
    icon: '📊',
    desc: '핵심 지표만 간결하게',
    sections: ['kpi', 'trend'],
    show_spend: false, show_budget: false, show_cpc: true, show_ctr: true, show_impressions: true,
  },
  {
    id: 'standard',
    label: '표준 보고서',
    icon: '📋',
    desc: '전반적 성과 분석',
    sections: ['kpi', 'trend', 'dmp', 'audience'],
    show_spend: false, show_budget: false, show_cpc: true, show_ctr: true, show_impressions: true,
  },
  {
    id: 'dmp_focus',
    label: 'DMP 분석',
    icon: '🎯',
    desc: 'DMP 타겟 운용 집중',
    sections: ['kpi', 'dmp', 'audience'],
    show_spend: false, show_budget: false, show_cpc: true, show_ctr: true, show_impressions: true,
  },
  {
    id: 'creative_focus',
    label: '소재 성과',
    icon: '🎨',
    desc: '소재·지면 성과 분석',
    sections: ['kpi', 'creative', 'placement'],
    show_spend: false, show_budget: false, show_cpc: true, show_ctr: true, show_impressions: true,
  },
  {
    id: 'full',
    label: '전체 보고서',
    icon: '📄',
    desc: '모든 섹션 포함',
    sections: ['kpi', 'trend', 'dmp', 'audience', 'creative', 'placement', 'budget', 'insights'],
    show_spend: true, show_budget: true, show_cpc: true, show_ctr: true, show_impressions: true,
  },
];

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  campaignName: string;
  onGenerate: (config: ReportBuilderConfig) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildDefaultConfig(campaignName: string): ReportBuilderConfig {
  const standard = TEMPLATES.find(t => t.id === 'standard')!;
  return {
    client_name: '',
    report_title: `${campaignName} 광고 성과 보고서`,
    report_period: '',
    agency_name: 'GFA RAW',
    sections: standard.sections,
    show_spend: standard.show_spend,
    show_budget: standard.show_budget,
    show_cpc: standard.show_cpc,
    show_ctr: standard.show_ctr,
    show_impressions: standard.show_impressions,
    custom_notes: '',
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export const ReportBuilderModal: React.FC<Props> = ({
  isOpen,
  onClose,
  campaignName,
  onGenerate,
}) => {
  const [config, setConfig] = useState<ReportBuilderConfig>(() =>
    buildDefaultConfig(campaignName)
  );
  const [selectedTemplate, setSelectedTemplate] = useState<string>('standard');

  const applyTemplate = useCallback((tpl: TemplateDef) => {
    setSelectedTemplate(tpl.id);
    setConfig(prev => ({
      ...prev,
      sections: tpl.sections,
      show_spend: tpl.show_spend,
      show_budget: tpl.show_budget,
      show_cpc: tpl.show_cpc,
      show_ctr: tpl.show_ctr,
      show_impressions: tpl.show_impressions,
    }));
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setConfig(prev => ({
      ...prev,
      sections: prev.sections.includes(sectionId)
        ? prev.sections.filter(s => s !== sectionId)
        : [...prev.sections, sectionId],
    }));
    setSelectedTemplate('custom');
  }, []);

  const handleGenerate = () => {
    onGenerate(config);
  };

  // Reset when re-opened with potentially different campaignName
  React.useEffect(() => {
    if (isOpen) {
      setConfig(buildDefaultConfig(campaignName));
      setSelectedTemplate('standard');
    }
  }, [isOpen, campaignName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl border border-slate-100">

        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-8 py-5 bg-white border-b border-slate-100 rounded-t-3xl">
          <div>
            <h2 className="text-xl font-black text-slate-900">보고서 빌더</h2>
            <p className="text-sm text-slate-500 mt-0.5 font-medium">{campaignName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="닫기"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="px-8 py-6 space-y-8">

          {/* ── 1. Template Selection ─────────────────────────────────────── */}
          <section>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
              템플릿 선택
            </h3>
            <div className="grid grid-cols-5 gap-3">
              {TEMPLATES.map(tpl => {
                const active = selectedTemplate === tpl.id;
                return (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className={[
                      'flex flex-col items-center gap-2 p-3 rounded-2xl border-2 text-center transition-all duration-200 hover:scale-[1.03]',
                      active
                        ? 'border-blue-500 bg-blue-50 shadow-sm shadow-blue-200'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    ].join(' ')}
                  >
                    <span className="text-2xl">{tpl.icon}</span>
                    <span className={[
                      'text-xs font-black leading-tight',
                      active ? 'text-blue-700' : 'text-slate-700',
                    ].join(' ')}>
                      {tpl.label}
                    </span>
                    <span className="text-[10px] text-slate-400 leading-tight">{tpl.desc}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* ── 2. Main Configuration ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-8">

            {/* Left — Section Selector */}
            <section>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                포함 섹션
              </h3>
              <div className="space-y-2">
                {ALL_SECTIONS.map(sec => {
                  const checked = config.sections.includes(sec.id);
                  return (
                    <label
                      key={sec.id}
                      className={[
                        'flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-colors',
                        checked
                          ? 'border-blue-200 bg-blue-50'
                          : 'border-transparent hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSection(sec.id)}
                        className="mt-0.5 w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={[
                          'text-sm font-bold leading-tight',
                          checked ? 'text-blue-800' : 'text-slate-700',
                        ].join(' ')}>
                          {sec.label}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{sec.desc}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Right — Client Info + Visibility */}
            <section className="space-y-6">

              {/* Client Info */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                  클라이언트 정보
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">광고주명</label>
                    <input
                      type="text"
                      value={config.client_name}
                      onChange={e => setConfig(prev => ({ ...prev, client_name: e.target.value }))}
                      placeholder="예: 삼성전자"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">보고서 제목</label>
                    <input
                      type="text"
                      value={config.report_title}
                      onChange={e => setConfig(prev => ({ ...prev, report_title: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">보고서 기간</label>
                    <input
                      type="text"
                      value={config.report_period}
                      onChange={e => setConfig(prev => ({ ...prev, report_period: e.target.value }))}
                      placeholder="예: 2026년 2월 1일 ~ 2026년 2월 28일"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300 font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">에이전시명</label>
                    <input
                      type="text"
                      value={config.agency_name}
                      onChange={e => setConfig(prev => ({ ...prev, agency_name: e.target.value }))}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Visibility Settings */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                  공개 수준 설정
                </h3>
                <p className="text-[11px] text-slate-400 mb-3 leading-relaxed">
                  체크 해제 시 해당 지표가 보고서에서 숨겨집니다.
                  대행사 수익 보호를 위해 집행금액·예산은 기본적으로 비공개입니다.
                </p>
                <div className="space-y-2">
                  {[
                    { key: 'show_impressions', label: '노출수 표시', safe: true },
                    { key: 'show_ctr',         label: 'CTR 표시',  safe: true },
                    { key: 'show_cpc',         label: 'CPC 표시',  safe: true },
                    { key: 'show_spend',       label: '집행금액 표시', safe: false },
                    { key: 'show_budget',      label: '예산 금액 표시', safe: false },
                  ].map(({ key, label, safe }) => {
                    const checked = config[key as keyof ReportBuilderConfig] as boolean;
                    return (
                      <label
                        key={key}
                        className="flex items-center gap-3 p-2.5 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setConfig(prev => ({
                              ...prev,
                              [key]: !prev[key as keyof ReportBuilderConfig],
                            }))
                          }
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer flex-shrink-0"
                        />
                        <span className="text-sm font-bold text-slate-700">{label}</span>
                        {!safe && (
                          <span className="ml-auto text-[10px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded-full">
                            수익 관련
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Custom Notes */}
              <div>
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                  추가 메모 (선택)
                </h3>
                <textarea
                  value={config.custom_notes}
                  onChange={e => setConfig(prev => ({ ...prev, custom_notes: e.target.value }))}
                  placeholder="담당자 코멘트, 특이사항 등을 입력하세요..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-300 font-medium resize-none"
                />
              </div>

            </section>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-between px-8 py-5 bg-white border-t border-slate-100 rounded-b-3xl gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="font-bold">{config.sections.length}개</span>
            <span className="font-medium">섹션 선택됨</span>
            {!config.show_spend && !config.show_budget && (
              <span className="ml-2 text-[11px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                수익 보호 모드
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-2xl text-sm font-bold text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleGenerate}
              disabled={config.sections.length === 0}
              className="px-8 py-2.5 rounded-2xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.03] active:scale-95"
            >
              보고서 생성
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
