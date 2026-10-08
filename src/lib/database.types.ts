export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          user_id: string;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          frequency: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          icon: string;
          color: string;
          frequency: string;
        };
        Update: {
          name?: string;
          icon?: string;
          color?: string;
          frequency?: string;
        };
        Relationships: [];
      };
      completions: {
        Row: {
          id: string;
          user_id: string;
          habit_id: string;
          date: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          habit_id: string;
          date: string;
        };
        Update: {
          habit_id?: string;
          date?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          done: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          done?: boolean;
        };
        Update: {
          label?: string;
          done?: boolean;
        };
        Relationships: [];
      };
      calendar_events: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          date: string;
          time: string | null;
          location: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          date: string;
          time?: string | null;
          location?: string | null;
        };
        Update: {
          title?: string;
          date?: string;
          time?: string | null;
          location?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
