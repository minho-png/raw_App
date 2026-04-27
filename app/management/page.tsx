"use client"

import { useState, useEffect } from "react"
import { useMasterData } from "@/lib/hooks/useMasterData"
import { Agency, Advertiser, Operator } from "@/lib/campaignTypes"
import { AgencyEditTab } from "@/app/campaign/ct-plus/components/ct-plus/AgencyEditTab"
import { AdvertiserListTab } from "@/app/campaign/ct-plus/components/ct-plus/AdvertiserListTab"
import { AdvertiserModal } from "@/app/campaign/ct-plus/components/ct-plus/AdvertiserModal"
import { OperatorListTab } from "@/app/campaign/ct-plus/components/ct-plus/OperatorListTab"
import { OperatorModal } from "@/app/campaign/ct-plus/components/ct-plus/OperatorModal"
import { mergeMockAgencies } from "@/lib/seed/mockAgencies"

type TabName = "agency" | "advertiser" | "operator"

export default function ManagementPage() {
  const { agencies, advertisers, operators, campaigns, loading, saveAgencies, saveAdvertisers, saveOperators } =
    useMasterData()

  const [activeTab, setActiveTab] = useState<TabName>("agency")
  const [editAgency, setEditAgency] = useState<Agency | null>(null)
  const [editAdvertiser, setEditAdvertiser] = useState<Advertiser | null>(null)
  const [showAdvModal, setShowAdvModal] = useState(false)
  const [editOperator, setEditOperator] = useState<Operator | null>(null)
  const [showOpModal, setShowOpModal] = useState(false)

  // 대행사 저장
  const handleSaveAgency = async (agency: Agency) => {
    const updated = editAgency
      ? agencies.map(a => (a.id === agency.id ? agency : a))
      : [...agencies, agency]
    await saveAgencies(updated)
    setEditAgency(null)
  }

  // 광고주 저장
  const handleSaveAdvertiser = async (adv: Advertiser) => {
    const updated = editAdvertiser
      ? advertisers.map(a => (a.id === adv.id ? adv : a))
      : [...advertisers, adv]
    await saveAdvertisers(updated)
    setShowAdvModal(false)
    setEditAdvertiser(null)
  }

  // 광고주 삭제
  const handleDeleteAdvertiser = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return
    await saveAdvertisers(advertisers.filter(a => a.id !== id))
  }

  // 운영자 저장
  const handleSaveOperator = async (op: Operator) => {
    const updated = editOperator
      ? operators.map(o => (o.id === op.id ? op : o))
      : [...operators, op]
    await saveOperators(updated)
    setShowOpModal(false)
    setEditOperator(null)
  }

  // 운영자 삭제
  const handleDeleteOperator = async (id: string) => {
    if (!confirm("삭제하시겠습니까?")) return
    await saveOperators(operators.filter(o => o.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    )
  }

  const tabCls = (tab: TabName) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-gray-600 hover:text-gray-900"
    }`

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">통합 관리</h1>

      {/* 탭 네비게이션 */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        <button onClick={() => setActiveTab("agency")} className={tabCls("agency")}>
          대행사
        </button>
        <button onClick={() => setActiveTab("advertiser")} className={tabCls("advertiser")}>
          광고주
        </button>
        <button onClick={() => setActiveTab("operator")} className={tabCls("operator")}>
          운영자
        </button>
      </div>

      {/* 대행사 탭 */}
      {activeTab === "agency" && (
        <div>
          {editAgency ? (
            <AgencyEditTab
              agency={editAgency}
              agencies={agencies}
              onSave={handleSaveAgency}
              onCancel={() => setEditAgency(null)}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditAgency(null)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                >
                  새 대행사 추가
                </button>
                <button
                  onClick={async () => {
                    if (!confirm("목업 대행사 8건을 추가/병합합니다. 계속하시겠습니까?")) return
                    await saveAgencies(mergeMockAgencies(agencies))
                  }}
                  className="rounded-lg border border-purple-300 bg-purple-50 px-4 py-2 text-sm font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                  title="기존 대행사는 유지, 동일 ID(mock-ag-*) 만 갱신"
                >
                  목업 대행사 시드 (8건)
                </button>
              </div>
              <div className="space-y-3">
                {agencies.map(ag => (
                  <div key={ag.id} className="rounded-lg border border-gray-200 bg-white p-4 hover:border-gray-300">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{ag.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{ag.contactName} · {ag.phone}</p>
                      </div>
                      <button
                        onClick={() => setEditAgency(ag)}
                        className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                      >
                        수정
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 광고주 탭 */}
      {activeTab === "advertiser" && (
        <div className="space-y-4">
          <button
            onClick={() => {
              setEditAdvertiser(null)
              setShowAdvModal(true)
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            새 광고주 추가
          </button>
          <AdvertiserListTab
            advertisers={advertisers}
            agencies={agencies}
            campaigns={campaigns}
            onEdit={adv => {
              setEditAdvertiser(adv)
              setShowAdvModal(true)
            }}
            onDelete={handleDeleteAdvertiser}
          />
          <AdvertiserModal
            open={showAdvModal}
            onClose={() => setShowAdvModal(false)}
            editAdv={editAdvertiser}
            agencies={agencies}
            onSave={handleSaveAdvertiser}
          />
        </div>
      )}

      {/* 운영자 탭 */}
      {activeTab === "operator" && (
        <div className="space-y-4">
          <button
            onClick={() => {
              setEditOperator(null)
              setShowOpModal(true)
            }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            새 운영자 추가
          </button>
          <OperatorListTab
            operators={operators}
            campaigns={campaigns}
            onEdit={op => {
              setEditOperator(op)
              setShowOpModal(true)
            }}
            onDelete={handleDeleteOperator}
          />
          <OperatorModal
            open={showOpModal}
            onClose={() => setShowOpModal(false)}
            editOp={editOperator}
            operators={operators}
            onSave={handleSaveOperator}
          />
        </div>
      )}
    </div>
  )
}
