/* eslint-disable @typescript-eslint/no-explicit-any */
// Supabase database types - replace with generated types from `supabase gen types typescript`
export type Database = {
  public: {
    Tables: {
      profiles: { Row: any; Insert: any; Update: any }
      companies: { Row: any; Insert: any; Update: any }
      products: { Row: any; Insert: any; Update: any }
      audience_segments: { Row: any; Insert: any; Update: any }
      key_messages: { Row: any; Insert: any; Update: any }
      calendar_items: { Row: any; Insert: any; Update: any }
      library_items: { Row: any; Insert: any; Update: any }
      roadmap_milestones: { Row: any; Insert: any; Update: any }
      weekly_reports: { Row: any; Insert: any; Update: any }
    }
  }
}
