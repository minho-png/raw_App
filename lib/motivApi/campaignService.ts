import type { MotivCampaignListResponse, MotivCampaignQuery } from './types';

const BASE_URL = 'https://desk-ct.motiv-i.com/api';

function getApiToken(): string {
  const token = process.env.MOTIV_API_TOKEN;
  if (!token) {
    throw new Error('MOTIV_API_TOKEN 환경변수가 설정되지 않았습니다. .env.local에 추가하세요.');
  }
  return token;
}

function buildQueryString(query: MotivCampaignQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export async function fetchCampaigns(
  query: MotivCampaignQuery = {},
): Promise<MotivCampaignListResponse> {
  const token = getApiToken();
  const url = `${BASE_URL}/v1/campaigns${buildQueryString(query)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Motiv API ${res.status}: ${text.slice(0, 300)}`);
  }

  return (await res.json()) as MotivCampaignListResponse;
}
