import { create } from 'zustand';
import { CampaignConfig } from '../types';

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
  refreshCampaigns: (fetchFn: () => Promise<{ success: boolean, campaigns?: CampaignConfig[] }>) => Promise<void>;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaigns: [],
  selectedCampaignId: null,
  isLoading: false,
  isSyncing: false,
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
    const state = get();
    const currentId = state.selectedCampaignId;
    
    // Determine new selection: 
    // 1. Keep current if it still exists
    // 2. If it doesn't exist but we're "syncing" (e.g. just added), DON'T reset yet
    // 3. Otherwise, pick the first one if possible
    let nextId = currentId;
    const exists = campaigns.some(c => c.campaign_id === currentId);
    
    if (!exists && !state.isSyncing) {
        nextId = campaigns.length > 0 ? campaigns[0].campaign_id : null;
    }

    set({ 
      campaigns, 
      selectedCampaignId: nextId
    });
  },
  setIsLoading: (isLoading) => set({ isLoading }),
  setIsSyncing: (isSyncing) => set({ isSyncing }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  refreshCampaigns: async (fetchFn) => {
    const state = get();
    if (state.isSyncing) return; // Skip background refresh if we are mid-operation
    
    set({ isLoading: true });
    try {
      const result = await fetchFn();
      if (result.success && result.campaigns) {
        // Double check syncing flag after async call
        if (!get().isSyncing) {
            get().setCampaigns(result.campaigns);
        }
      }
    } finally {
      set({ isLoading: false });
    }
  }
}));
