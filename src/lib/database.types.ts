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
      usernames: {
        Row: {
          id: string;
          user_id: string;
          username: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          username: string;
        };
        Update: {
          username?: string;
        };
        Relationships: [];
      };
      friendships: {
        Row: {
          id: string;
          requester_id: string;
          addressee_id: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          addressee_id: string;
          status?: string;
        };
        Update: {
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      habit_sharing: {
        Row: {
          habit_id: string;
          user_id: string;
          shared: boolean;
        };
        Insert: {
          habit_id: string;
          user_id: string;
          shared?: boolean;
        };
        Update: {
          shared?: boolean;
        };
        Relationships: [];
      };
      shared_plans: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string | null;
          date: string | null;
          time: string | null;
          location: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          title: string;
          description?: string | null;
          date?: string | null;
          time?: string | null;
          location?: string | null;
          status?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          date?: string | null;
          time?: string | null;
          location?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      plan_members: {
        Row: {
          id: string;
          plan_id: string;
          user_id: string;
          rsvp: string;
          joined_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          user_id: string;
          rsvp?: string;
        };
        Update: {
          rsvp?: string;
        };
        Relationships: [];
      };
      plan_checklist: {
        Row: {
          id: string;
          plan_id: string;
          label: string;
          done: boolean;
          assigned_to: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          label: string;
          done?: boolean;
          assigned_to?: string | null;
          created_by: string;
        };
        Update: {
          label?: string;
          done?: boolean;
          assigned_to?: string | null;
        };
        Relationships: [];
      };
      activity_feed: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Record<string, unknown>;
        };
        Update: {
          type?: string;
          payload?: Record<string, unknown>;
        };
        Relationships: [];
      };
      feed_reactions: {
        Row: {
          entry_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          entry_id: string;
          user_id: string;
        };
        Update: {
          entry_id?: string;
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
