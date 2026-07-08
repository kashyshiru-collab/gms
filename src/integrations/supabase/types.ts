export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
<<<<<<< HEAD
      activity_events: {
        Row: {
          amount_kes: number | null
          created_at: string
          display_name: string
          id: string
          kind: string
          meta: Json
          pair: string | null
          source: string
        }
        Insert: {
          amount_kes?: number | null
          created_at?: string
          display_name: string
          id?: string
          kind: string
          meta?: Json
          pair?: string | null
          source?: string
        }
        Update: {
          amount_kes?: number | null
          created_at?: string
          display_name?: string
          id?: string
          kind?: string
          meta?: Json
          pair?: string | null
          source?: string
        }
        Relationships: []
      }
      binary_trades: {
        Row: {
          barrier_digit: number | null
          contract_type: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          payout_kes: number
          resolved_at: string | null
          stake_kes: number
          status: string
          user_id: string
        }
        Insert: {
          barrier_digit?: number | null
          contract_type?: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price?: number | null
          expires_at: string
          id?: string
          opened_at?: string
          pair: string
          payout_kes?: number
          resolved_at?: string | null
          stake_kes: number
          status?: string
          user_id: string
        }
        Update: {
          barrier_digit?: number | null
          contract_type?: string
          direction?: string
          duration_seconds?: number
          entry_price?: number
          exit_price?: number | null
          expires_at?: string
          id?: string
          opened_at?: string
          pair?: string
          payout_kes?: number
          resolved_at?: string | null
          stake_kes?: number
          status?: string
=======
      agents: {
        Row: {
          commission_pct: number
          created_at: string
          id: string
          referral_code: string
          user_id: string
        }
        Insert: {
          commission_pct?: number
          created_at?: string
          id?: string
          referral_code: string
          user_id: string
        }
        Update: {
          commission_pct?: number
          created_at?: string
          id?: string
          referral_code?: string
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
          user_id?: string
        }
        Relationships: []
      }
<<<<<<< HEAD
      market_overrides: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          end_at: string
          id: string
          revert_seconds: number
          start_at: string
          start_price: number
          symbol: string
          target_price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_at: string
          id?: string
          revert_seconds?: number
          start_at?: string
          start_price: number
          symbol: string
          target_price: number
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          end_at?: string
          id?: string
          revert_seconds?: number
          start_at?: string
          start_price?: number
          symbol?: string
          target_price?: number
        }
        Relationships: []
      }
      positions: {
        Row: {
          closed_at: string | null
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          pair: string
          pnl_kes: number | null
          side: string
          stake_kes: number
          status: string
          user_id: string
        }
        Insert: {
          closed_at?: string | null
          entry_price: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pair: string
          pnl_kes?: number | null
          side: string
          stake_kes: number
          status?: string
          user_id: string
        }
        Update: {
          closed_at?: string | null
          entry_price?: number
          exit_price?: number | null
          id?: string
          opened_at?: string
          pair?: string
          pnl_kes?: number | null
          side?: string
          stake_kes?: number
          status?: string
          user_id?: string
=======
      polymarket_events: {
        Row: {
          category: string
          created_at: string
          ends_at: string
          id: string
          no_price: number
          outcome: string | null
          question: string
          resolved: boolean
          volume_usd: number
          yes_price: number
        }
        Insert: {
          category?: string
          created_at?: string
          ends_at: string
          id?: string
          no_price?: number
          outcome?: string | null
          question: string
          resolved?: boolean
          volume_usd?: number
          yes_price?: number
        }
        Update: {
          category?: string
          created_at?: string
          ends_at?: string
          id?: string
          no_price?: number
          outcome?: string | null
          question?: string
          resolved?: boolean
          volume_usd?: number
          yes_price?: number
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
        }
        Relationships: []
      }
      profiles: {
        Row: {
<<<<<<< HEAD
          created_at: string
          email: string | null
          force_loss: boolean
          first_name: string | null
          full_name: string | null
          id: string
          is_burned: boolean
          phone: string | null
          referral_code: string | null
          second_name: string | null
          currency: string
          updated_at: string
          warnings_count: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          force_loss?: boolean
          first_name?: string | null
          full_name?: string | null
          id: string
          is_burned?: boolean
          phone?: string | null
          referral_code?: string | null
          second_name?: string | null
          currency?: string
          updated_at?: string
          warnings_count?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          force_loss?: boolean
          first_name?: string | null
          full_name?: string | null
          id?: string
          is_burned?: boolean
          phone?: string | null
          referral_code?: string | null
          second_name?: string | null
          currency?: string
          updated_at?: string
          warnings_count?: number
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          amount_kes: number
          created_at: string
          id: string
          level: number
          profit_kes: number
          rate: number
          referred_id: string
          referrer_id: string
          source_tx_id: string | null
        }
        Insert: {
          amount_kes: number
          created_at?: string
          id?: string
          level: number
          profit_kes: number
          rate: number
          referred_id: string
          referrer_id: string
          source_tx_id?: string | null
        }
        Update: {
          amount_kes?: number
          created_at?: string
          id?: string
          level?: number
          profit_kes?: number
          rate?: number
          referred_id?: string
          referrer_id?: string
          source_tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_commissions_source_tx_id_fkey"
            columns: ["source_tx_id"]
            isOneToOne: false
            referencedRelation: "transactions"
=======
          active_account: string
          balance_ksh: number
          balance_usd: number
          created_at: string
          demo_balance_usd: number
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          active_account?: string
          balance_ksh?: number
          balance_usd?: number
          created_at?: string
          demo_balance_usd?: number
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          active_account?: string
          balance_ksh?: number
          balance_usd?: number
          created_at?: string
          demo_balance_usd?: number
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      referrals: {
        Row: {
          agent_id: string | null
          client_id: string
          created_at: string
          id: string
          referral_code: string | null
        }
        Insert: {
          agent_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          referral_code?: string | null
        }
        Update: {
          agent_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          referral_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agent_rollups"
            referencedColumns: ["agent_id"]
          },
          {
            foreignKeyName: "referrals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
            referencedColumns: ["id"]
          },
        ]
      }
<<<<<<< HEAD
      referrals: {
        Row: {
          created_at: string
          id: string
          level: number
          referred_id: string
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          referred_id: string
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          referred_id?: string
          referrer_id?: string
=======
      trades: {
        Row: {
          account_type: string
          closed_at: string | null
          created_at: string
          direction: string
          entry_price: number | null
          exit_price: number | null
          id: string
          market: string
          meta: Json | null
          module: string
          payout: number | null
          stake: number
          status: string
          user_id: string
        }
        Insert: {
          account_type?: string
          closed_at?: string | null
          created_at?: string
          direction: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          market: string
          meta?: Json | null
          module: string
          payout?: number | null
          stake: number
          status?: string
          user_id: string
        }
        Update: {
          account_type?: string
          closed_at?: string | null
          created_at?: string
          direction?: string
          entry_price?: number | null
          exit_price?: number | null
          id?: string
          market?: string
          meta?: Json | null
          module?: string
          payout?: number | null
          stake?: number
          status?: string
          user_id?: string
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
        }
        Relationships: []
      }
      transactions: {
        Row: {
<<<<<<< HEAD
          amount_kes: number
          created_at: string
          id: string
          meta: Json
          mpesa_receipt: string | null
          daraja_reference: string | null
          reference: string | null
          status: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_kes: number
          created_at?: string
          id?: string
          meta?: Json
          mpesa_receipt?: string | null
          daraja_reference?: string | null
          reference?: string | null
          status?: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_kes?: number
          created_at?: string
          id?: string
          meta?: Json
          mpesa_receipt?: string | null
          daraja_reference?: string | null
          reference?: string | null
          status?: string
          type?: string
          updated_at?: string
=======
          account_type: string
          amount: number
          created_at: string
          currency: string
          id: string
          is_virtual: boolean
          kind: string
          meta: Json | null
          method: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_type?: string
          amount: number
          created_at?: string
          currency?: string
          id?: string
          is_virtual?: boolean
          kind: string
          meta?: Json | null
          method?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_type?: string
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          is_virtual?: boolean
          kind?: string
          meta?: Json | null
          method?: string | null
          status?: string
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
<<<<<<< HEAD
      wallets: {
        Row: {
          balance_kes: number
          non_withdrawable_kes: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_kes?: number
          non_withdrawable_kes?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_kes?: number
          non_withdrawable_kes?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_note: string | null
          amount_kes: number
          created_at: string
          id: string
          daraja_response: Json | null
          phone: string
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          amount_kes: number
          created_at?: string
          id?: string
          daraja_response?: Json | null
          phone: string
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          amount_kes?: number
          created_at?: string
          id?: string
          daraja_response?: Json | null
          phone?: string
          reference?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_referrer: { Args: { p_code: string }; Returns: undefined }
      close_position_atomic: {
        Args: { p_exit: number; p_position_id: string }
        Returns: {
          closed_at: string | null
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          pair: string
          pnl_kes: number | null
          side: string
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "positions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      gen_referral_code: { Args: never; Returns: string }
=======
    }
    Views: {
      agent_rollups: {
        Row: {
          agent_id: string | null
          agent_user_id: string | null
          agent_username: string | null
          client_count: number | null
          commission_pct: number | null
          house_retained: number | null
          referral_code: string | null
          total_deposits: number | null
          total_withdrawals: number | null
        }
        Relationships: []
      }
    }
    Functions: {
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
<<<<<<< HEAD
      mask_display_name: { Args: { p_user: string }; Returns: string }
      open_binary_trade: {
        Args: {
          p_direction: string
          p_duration: number
          p_entry: number
          p_pair: string
          p_stake: number
        }
        Returns: {
          barrier_digit: number | null
          contract_type: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          payout_kes: number
          resolved_at: string | null
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "binary_trades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_digit_trade: {
        Args: {
          p_barrier: number
          p_contract: string
          p_duration: number
          p_entry: number
          p_pair: string
          p_prediction: string
          p_stake: number
        }
        Returns: {
          barrier_digit: number | null
          contract_type: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          payout_kes: number
          resolved_at: string | null
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "binary_trades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      open_position_atomic: {
        Args: {
          p_entry: number
          p_pair: string
          p_side: string
          p_stake: number
        }
        Returns: {
          closed_at: string | null
          entry_price: number
          exit_price: number | null
          id: string
          opened_at: string
          pair: string
          pnl_kes: number | null
          side: string
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "positions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      refund_withdrawal: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          admin_note: string | null
          amount_kes: number
          created_at: string
          id: string
          daraja_response: Json | null
          phone: string
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_withdrawal: {
        Args: { p_amount: number; p_phone: string }
        Returns: {
          admin_note: string | null
          amount_kes: number
          created_at: string
          id: string
          daraja_response: Json | null
          phone: string
          reference: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "withdrawal_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_binary_trade: {
        Args: { p_exit: number; p_trade_id: string }
        Returns: {
          barrier_digit: number | null
          contract_type: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          payout_kes: number
          resolved_at: string | null
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "binary_trades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_digit_trade: {
        Args: { p_exit: number; p_trade_id: string }
        Returns: {
          barrier_digit: number | null
          contract_type: string
          direction: string
          duration_seconds: number
          entry_price: number
          exit_price: number | null
          expires_at: string
          id: string
          opened_at: string
          pair: string
          payout_kes: number
          resolved_at: string | null
          stake_kes: number
          status: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "binary_trades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      seed_activity_event: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "agent" | "user"
=======
    }
    Enums: {
      app_role: "admin" | "agent" | "client"
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
<<<<<<< HEAD
      app_role: ["admin", "agent", "user"],
=======
      app_role: ["admin", "agent", "client"],
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    },
  },
} as const
