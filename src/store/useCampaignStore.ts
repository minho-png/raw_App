import { create } from 'zustand';
import { CampaignConfig } from '../types';

interface CampaignState {
  campaigns: CampaignConfig[];
  selectedCampaignId: string | null;
  addCampaign: (campaign: CampaignConfig) => void;
  deleteCampaign: (id: string) => void;
  selectCampaign: (id: string) => void;
  setCampaigns: (campaigns: CampaignConfig[]) => void;
}

export const useCampaignStore = create<CampaignState>((set) => ({
  campaigns: [],
  selectedCampaignId: null,
  addCampaign: (campaign) => set((state) => ({ 
    campaigns: [...state.campaigns, campaign] 
  })),
  deleteCampaign: (id) => set((state) => ({ 
    campaigns: state.campaigns.filter(c => c.campaign_id !== id),
    selectedCampaignId: state.selectedCampaignId === id ? null : state.selectedCampaignId
  })),
  selectCampaign: (id) => set({ selectedCampaignId: id }),
  setCampaigns: (campaigns) => set({ 
    campaigns, 
    selectedCampaignId: campaigns.length > 0 ? campaigns[0].campaign_id : null 
  }),
}));
