"use client";

import React from 'react';
import { ReportCenter } from '../components/organisms/ReportCenter';
import { BudgetStatus, PerformanceRecord } from '../types';

export default function DashboardPage() {
  // Dummy data for initial display
  const dummyStatus: BudgetStatus = {
    spent: 4500000,
    remaining: 5500000,
    burn_rate: 45,
    pacing_index: 98,
    pacing_status: '정상'
  };

  const dummyPerformance: PerformanceRecord[] = [
    {
      campaign_id: 'C001',
      media: '네이버GFA',
      date: new Date(),
      ad_group_name: '[SKP] 관심사_리타겟팅',
      impressions: 125000,
      clicks: 1250,
      cost: 1100000,
      net_amount: 1000000,
      execution_amount: 1111111,
      dmp_type: 'SKP',
      has_dmp: true
    },
    {
      campaign_id: 'C001',
      media: '네이버GFA',
      date: new Date(),
      ad_group_name: '[WIFI] 센텀시티_타겟',
      impressions: 85000,
      clicks: 980,
      cost: 550000,
      net_amount: 500000,
      execution_amount: 555555,
      dmp_type: 'WIFI',
      has_dmp: true
    }
  ];

  return <ReportCenter budgetStatus={dummyStatus} recentPerformance={dummyPerformance} />;
}
