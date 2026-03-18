import { create } from 'zustand';
import { CampaignConfig } from '../types';

interface CampaignState {
  campaigns: CampaignConfig[];
  selectedCampaignId: string | null;
  isLoading: boolean;
  activeTab: string;
  addCampaign: (campaign: CampaignConfig) => void;
  deleteCampaign: (id: string) => void;
  selectCampaign: (id: string) => void;
  updateCampaign: (campaign: CampaignConfig) => void;
  setCampaigns: (campaigns: CampaignConfig[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setActiveTab: (tab: string) => void;
  refreshCampaigns: (fetchFn: () => Promise<{ success: boolean, campaigns?: CampaignConfig[] }>) => Promise<void>;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  selectedCampaignId: null,
  isLoading: false,
  activeTab: 'upload',
  addCampaign: (campaign) => set((state) => ({ 
    campaigns: [...state.campaigns, campaign] 
  })),
  deleteCampaign: (id) => set((state) => ({ 
    campaigns: state.campaigns.filter(c => c.campaign_id !== id),
    selectedCampaignId: state.selectedCampaignId === id ? null : state.selectedCampaignId
  })),
  selectCampaign: (id) => set({ selectedCampaignId: id }),
  updateCampaign: (campaign) => set((state) => ({
    campaigns: state.campaigns.map((c) => 
      c.campaign_id === campaign.campaign_id ? campaign : c
    )
  })),
  setCampaigns: (campaigns) => {
    const currentId = get().selectedCampaignId;
    
    // Selection Logic:
    // 1. If currently selected campaign exists in new data, keep it
    // 2. If not, and there's data, select the first one
    // 3. Otherwise null
    const exists = campaigns.some(c => c.campaign_id === currentId);
    const nextId = exists 
      ? currentId 
      : (campaigns.length > 0 ? campaigns[0].campaign_id : null);

    set({ campaigns, selectedCampaignId: nextId });
  },
  setIsLoading: (isLoading) => set({ isLoading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  refreshCampaigns: async (fetchFn) => {
    set({ isLoading: true });
    try {
      const result = await fetchFn();
      if (result.success && result.campaigns) {
        get().setCampaigns(result.campaigns);
      }
    } finally {
      set({ isLoading: false });
    }
  }
}));
