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
          assignment_template_html: string;
          assignment_template_text: string;
          assignment_instructions_html: string;
          assignment_instructions_text: string;
          todo_list_json: Array<{ id: string; text: string; completed: boolean }>;
          ended_at: string | null;
          created_at: string;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          code: string;
          teacher_id: string;
          teacher_peer_id?: string | null;
          title: string;
          assignment_template_html?: string;
          assignment_template_text?: string;
          assignment_instructions_html?: string;
          assignment_instructions_text?: string;
          todo_list_json?: Array<{ id: string; text: string; completed: boolean }>;
          ended_at?: string | null;
          created_at?: string;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          code?: string;
          teacher_id?: string;
          teacher_peer_id?: string | null;
          title?: string;
          assignment_template_html?: string;
          assignment_template_text?: string;
          assignment_instructions_html?: string;
          assignment_instructions_text?: string;
          todo_list_json?: Array<{ id: string; text: string; completed: boolean }>;
          ended_at?: string | null;
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
          content_text: string;
          paste_count: number;
          stagnant_count: number;
          tabbed_out_count: number;
          assignment_instructions_html: string;
          assignment_instructions_text: string;
          assignment_template_html: string;
          assignment_template_text: string;
          todo_list_json: Array<{ id: string; text: string; completed: boolean }>;
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
          content_text?: string;
          paste_count?: number;
          stagnant_count?: number;
          tabbed_out_count?: number;
          assignment_instructions_html?: string;
          assignment_instructions_text?: string;
          assignment_template_html?: string;
          assignment_template_text?: string;
          todo_list_json?: Array<{ id: string; text: string; completed: boolean }>;
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
          content_text?: string;
          paste_count?: number;
          stagnant_count?: number;
          tabbed_out_count?: number;
          assignment_instructions_html?: string;
          assignment_instructions_text?: string;
          assignment_template_html?: string;
          assignment_template_text?: string;
          todo_list_json?: Array<{ id: string; text: string; completed: boolean }>;
          last_activity?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      document_suggestions: {
        Row: {
          id: string;
          document_id: string;
          teacher_id: string;
          selected_text: string;
          context: string;
          suggestion: string;
          resolved: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          document_id: string;
          teacher_id: string;
          selected_text?: string;
          context?: string;
          suggestion: string;
          resolved?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          document_id?: string;
          teacher_id?: string;
          selected_text?: string;
          context?: string;
          suggestion?: string;
          resolved?: boolean;
          created_at?: string;
        };
      };
    };
  };
}
