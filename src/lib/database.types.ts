export interface Database {
  public: {
    Tables: {
      sessions: {
        Row: {
          id: string;
          code: string;
          teacher_id: string;
          teacher_peer_id: string | null;
          title: string;
          created_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          teacher_id: string;
          teacher_peer_id?: string | null;
          title: string;
          created_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          code?: string;
          teacher_id?: string;
          teacher_peer_id?: string | null;
          title?: string;
          created_at?: string;
          is_active?: boolean;
        };
      };
      documents: {
        Row: {
          id: string;
          session_id: string;
          student_id: string;
          student_name: string;
          student_peer_id: string | null;
          content: string;
          last_activity: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          student_id: string;
          student_name: string;
          student_peer_id?: string | null;
          content?: string;
          last_activity?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          student_id?: string;
          student_name?: string;
          student_peer_id?: string | null;
          content?: string;
          last_activity?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
