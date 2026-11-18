// Database types for the Supabase client, in the format `supabase gen types typescript` produces.
// Written by hand to match supabase/schema.sql. Regenerate from the live project with
//   SUPABASE_PROJECT_REF=<ref> npm run gen:types
// and commit the result whenever the schema changes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          user_id: string;
          vat_number: string | null;
          vat_quarter_stagger: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string;
          vat_number?: string | null;
          vat_quarter_stagger?: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
          vat_number?: string | null;
          vat_quarter_stagger?: number;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          client_id: string;
          color: string;
          created_at: string;
          id: string;
          name: string;
          user_id: string;
        };
        Insert: {
          client_id: string;
          color: string;
          created_at?: string;
          id?: string;
          name: string;
          user_id?: string;
        };
        Update: {
          client_id?: string;
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'categories_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      filed_quarters: {
        Row: {
          box4: number;
          box7: number;
          client_id: string;
          filed_at: string;
          id: string;
          period_end: string;
          period_start: string;
          user_id: string;
        };
        Insert: {
          box4: number;
          box7: number;
          client_id: string;
          filed_at?: string;
          id?: string;
          period_end: string;
          period_start: string;
          user_id?: string;
        };
        Update: {
          box4?: number;
          box7?: number;
          client_id?: string;
          filed_at?: string;
          id?: string;
          period_end?: string;
          period_start?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'filed_quarters_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          anchor_day: number;
          category_id: string | null;
          client_id: string;
          created_at: string;
          frequency: string;
          id: string;
          name: string;
          next_date: string;
          total: number;
          user_id: string;
          vat: number;
          vat_rate: string;
        };
        Insert: {
          anchor_day: number;
          category_id?: string | null;
          client_id: string;
          created_at?: string;
          frequency: string;
          id?: string;
          name: string;
          next_date: string;
          total: number;
          user_id?: string;
          vat?: number;
          vat_rate?: string;
        };
        Update: {
          anchor_day?: number;
          category_id?: string | null;
          client_id?: string;
          created_at?: string;
          frequency?: string;
          id?: string;
          name?: string;
          next_date?: string;
          total?: number;
          user_id?: string;
          vat?: number;
          vat_rate?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recurring_expenses_category_id_client_id_fkey';
            columns: ['category_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id', 'client_id'];
          },
          {
            foreignKeyName: 'recurring_expenses_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
      receipts: {
        Row: {
          category_id: string;
          client_id: string;
          created_at: string;
          date: string;
          id: string;
          image_path: string | null;
          name: string;
          total: number;
          updated_at: string;
          user_id: string;
          vat: number;
          vat_rate: string;
        };
        Insert: {
          category_id: string;
          client_id: string;
          created_at?: string;
          date: string;
          id?: string;
          image_path?: string | null;
          name: string;
          total: number;
          updated_at?: string;
          user_id?: string;
          vat?: number;
          vat_rate?: string;
        };
        Update: {
          category_id?: string;
          client_id?: string;
          created_at?: string;
          date?: string;
          id?: string;
          image_path?: string | null;
          name?: string;
          total?: number;
          updated_at?: string;
          user_id?: string;
          vat?: number;
          vat_rate?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipts_category_id_client_id_fkey';
            columns: ['category_id', 'client_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id', 'client_id'];
          },
          {
            foreignKeyName: 'receipts_client_id_fkey';
            columns: ['client_id'];
            isOneToOne: false;
            referencedRelation: 'clients';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database['public']['Tables'];
/** A table's row type, e.g. `Tables<'receipts'>`. */
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row'];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert'];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update'];
