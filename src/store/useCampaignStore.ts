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
}

export const useCampaignStore = create<CampaignState>((set) => ({
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
  setCampaigns: (campaigns) => set({ 
    campaigns, 
    selectedCampaignId: campaigns.length > 0 ? campaigns[0].campaign_id : (campaigns.length === 0 ? null : campaigns[0].campaign_id)
  }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
