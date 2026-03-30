import { create } from 'zustand';
import { CampaignConfig, ImcCampaign, Agency, AdAccount } from '@/types';

interface CampaignState {
  campaigns: CampaignConfig[];
  selectedCampaignId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  activeTab: string;
  addCampaign: (campaign: CampaignConfig) => void;
  deleteCampaign: (id: string) => void;
  selectCampaign: (id: string) => void;
  updateCampaign: (campaign: CampaignConfig) => void;
  setCampaigns: (campaigns: CampaignConfig[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsSyncing: (isSyncing: boolean) => void;
  setActiveTab: (tab: string) => void;
  refreshCampaigns: (fetchFn: () => Promise<{ success: boolean; campaigns?: CampaignConfig[] }>) => Promise<void>;
  activeMainView: 'campaigns' | 'settlement';
  setActiveMainView: (view: 'campaigns' | 'settlement') => void;
  imcCampaigns: ImcCampaign[];
  setImcCampaigns: (campaigns: ImcCampaign[]) => void;
  selectedImcCampaignId: string | null;
  selectImcCampaign: (id: string | null) => void;
  agencies: Agency[];
  setAgencies: (agencies: Agency[]) => void;
  adAccounts: AdAccount[];
  setAdAccounts: (accounts: AdAccount[]) => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  selectedCampaignId: null,
  isLoading: false,
  isSyncing: false,
  activeTab: 'upload',
  activeMainView: 'campaigns',
  imcCampaigns: [],
  selectedImcCampaignId: null,
  agencies: [],
  adAccounts: [],
  addCampaign: (campaign) => set((state) => ({ campaigns: [...state.campaigns, campaign] })),
  deleteCampaign: (id) => set((state) => ({
    campaigns: state.campaigns.filter(c => c.campaign_id !== id),
    selectedCampaignId: state.selectedCampaignId === id ? null : state.selectedCampaignId,
  })),
  selectCampaign: (id) => set({ selectedCampaignId: id }),
  updateCampaign: (campaign) => set((state) => ({
    campaigns: state.campaigns.map(c => c.campaign_id === campaign.campaign_id ? campaign : c),
  })),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setCampaigns: (campaigns) => {
    const currentId = get().selectedCampaignId;
    const exists = campaigns.some(c => c.campaign_id === currentId);
    const nextId = exists ? currentId : (campaigns.length > 0 ? campaigns[0].campaign_id : null);
    set({ campaigns, selectedCampaignId: nextId });
  },
  setIsLoading: (isLoading) => set({ isLoading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setActiveMainView: (view) => set({ activeMainView: view }),
  setImcCampaigns: (campaigns) => set({ imcCampaigns: campaigns }),
  selectImcCampaign: (id) => set({ selectedImcCampaignId: id, selectedCampaignId: null }),
  setAgencies: (agencies) => set({ agencies }),
  setAdAccounts: (adAccounts) => set({ adAccounts }),
  refreshCampaigns: async (fetchFn) => {
    if (get().isSyncing) return;
    set({ isLoading: true });
    try {
      const result = await fetchFn();
      if (result.success && result.campaigns) get().setCampaigns(result.campaigns);
    } finally {
      set({ isLoading: false });
    }
  },
}));
