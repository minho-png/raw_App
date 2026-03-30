export interface ReportBuilderConfig {
  client_name: string;
  report_title: string;
  report_period: string;
  agency_name: string;
  sections: string[];
  show_spend: boolean;
  show_budget: boolean;
  show_cpc: boolean;
  show_ctr: boolean;
  show_impressions: boolean;
  custom_notes: string;
}
