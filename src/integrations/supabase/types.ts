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
      admin_audit_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      admin_user_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_message_preview: string | null
          listing_id: string
          listing_photo: string | null
          listing_title: string | null
          owner_id: string | null
          owner_name: string | null
          owner_phone: string | null
          phone_revealed: boolean
          seeker_id: string
          unread_owner: number
          unread_seeker: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          listing_id: string
          listing_photo?: string | null
          listing_title?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone_revealed?: boolean
          seeker_id: string
          unread_owner?: number
          unread_seeker?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          listing_id?: string
          listing_photo?: string | null
          listing_title?: string | null
          owner_id?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          phone_revealed?: boolean
          seeker_id?: string
          unread_owner?: number
          unread_seeker?: number
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          description: string | null
          enabled: boolean
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          enabled?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          enabled?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      listing_likes: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_photos: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          owner_id: string
          position: number
          storage_path: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          owner_id: string
          position?: number
          storage_path: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          owner_id?: string
          position?: number
          storage_path?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_reviews: {
        Row: {
          body: string
          created_at: string
          id: string
          listing_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      listing_views: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          viewer_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          viewer_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          viewer_id?: string | null
        }
        Relationships: []
      }
      listings: {
        Row: {
          address_line: string
          amenities: string[]
          area_sqft: number | null
          available_from: string | null
          bathrooms: number
          bedrooms: number
          city: string
          contact_name: string | null
          contact_phone: string | null
          country: string
          cover_photo_url: string | null
          created_at: string
          deposit_amount: number | null
          description: string
          furnishing: Database["public"]["Enums"]["furnishing"]
          id: string
          is_featured: boolean
          latitude: number | null
          longitude: number | null
          mode: Database["public"]["Enums"]["listing_mode"]
          nearby: Json
          owner_id: string
          postal_code: string | null
          price_amount: number
          property_type: Database["public"]["Enums"]["property_type"]
          seeking_count: number | null
          state: string | null
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          address_line: string
          amenities?: string[]
          area_sqft?: number | null
          available_from?: string | null
          bathrooms?: number
          bedrooms?: number
          city: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          cover_photo_url?: string | null
          created_at?: string
          deposit_amount?: number | null
          description?: string
          furnishing?: Database["public"]["Enums"]["furnishing"]
          id?: string
          is_featured?: boolean
          latitude?: number | null
          longitude?: number | null
          mode: Database["public"]["Enums"]["listing_mode"]
          nearby?: Json
          owner_id: string
          postal_code?: string | null
          price_amount: number
          property_type?: Database["public"]["Enums"]["property_type"]
          seeking_count?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
        }
        Update: {
          address_line?: string
          amenities?: string[]
          area_sqft?: number | null
          available_from?: string | null
          bathrooms?: number
          bedrooms?: number
          city?: string
          contact_name?: string | null
          contact_phone?: string | null
          country?: string
          cover_photo_url?: string | null
          created_at?: string
          deposit_amount?: number | null
          description?: string
          furnishing?: Database["public"]["Enums"]["furnishing"]
          id?: string
          is_featured?: boolean
          latitude?: number | null
          longitude?: number | null
          mode?: Database["public"]["Enums"]["listing_mode"]
          nearby?: Json
          owner_id?: string
          postal_code?: string | null
          price_amount?: number
          property_type?: Database["public"]["Enums"]["property_type"]
          seeking_count?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          sender_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          sender_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_verifications: {
        Row: {
          created_at: string
          document_path: string | null
          full_name: string
          id: string
          phone: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_path?: string | null
          full_name: string
          id?: string
          phone: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_path?: string | null
          full_name?: string
          id?: string
          phone?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          is_verified_owner: boolean
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          is_verified_owner?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          is_verified_owner?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      saved_searches: {
        Row: {
          alert_frequency: string
          created_at: string
          id: string
          last_match_count: number
          last_notified_at: string | null
          last_seen_at: string
          name: string
          params: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_frequency?: string
          created_at?: string
          id?: string
          last_match_count?: number
          last_notified_at?: string | null
          last_seen_at?: string
          name: string
          params?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_frequency?: string
          created_at?: string
          id?: string
          last_match_count?: number
          last_notified_at?: string | null
          last_seen_at?: string
          name?: string
          params?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tour_bookings: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          listing_title: string | null
          note: string | null
          owner_id: string | null
          party_size: number
          proposed_at: string | null
          seeker_id: string
          seeker_name: string | null
          seeker_phone: string | null
          slot_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          listing_title?: string | null
          note?: string | null
          owner_id?: string | null
          party_size?: number
          proposed_at?: string | null
          seeker_id: string
          seeker_name?: string | null
          seeker_phone?: string | null
          slot_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          listing_title?: string | null
          note?: string | null
          owner_id?: string | null
          party_size?: number
          proposed_at?: string | null
          seeker_id?: string
          seeker_name?: string | null
          seeker_phone?: string | null
          slot_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "tour_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      tour_slots: {
        Row: {
          capacity: number
          created_at: string
          ends_at: string
          id: string
          listing_id: string
          note: string | null
          owner_id: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          ends_at: string
          id?: string
          listing_id: string
          note?: string | null
          owner_id: string
          starts_at: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          listing_id?: string
          note?: string | null
          owner_id?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tour_slots_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      search_listings: {
        Args: { _limit?: number; _q: string }
        Returns: {
          address_line: string
          bedrooms: number
          city: string
          cover_photo_url: string
          furnishing: Database["public"]["Enums"]["furnishing"]
          id: string
          mode: Database["public"]["Enums"]["listing_mode"]
          price_amount: number
          property_type: Database["public"]["Enums"]["property_type"]
          relevance: number
          title: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      furnishing: "unfurnished" | "semi" | "furnished"
      listing_mode: "rent" | "sale"
      listing_status: "draft" | "published" | "archived"
      property_type: "room" | "studio" | "apartment" | "house" | "pg" | "other"
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
      app_role: ["admin", "moderator", "user"],
      furnishing: ["unfurnished", "semi", "furnished"],
      listing_mode: ["rent", "sale"],
      listing_status: ["draft", "published", "archived"],
      property_type: ["room", "studio", "apartment", "house", "pg", "other"],
    },
  },
} as const
