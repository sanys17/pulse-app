export interface Database {
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
        Update: never;
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
      };
    };
  };
}
