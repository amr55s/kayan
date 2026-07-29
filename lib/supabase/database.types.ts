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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_request_rate_limits: {
        Row: {
          attempts: number
          request_key: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          request_key: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          request_key?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      account_requests: {
        Row: {
          auth_user_id: string
          created_at: string
          display_name: string
          existing_place_id: string | null
          id: string
          kind: string
          legacy_driver_id: string | null
          phone: string
          place_address: string | null
          place_category: string | null
          place_description: string | null
          place_images: string[]
          place_map_url: string | null
          place_mode: string | null
          place_payment: string | null
          place_telegram_url: string | null
          place_title: string | null
          place_whatsapp: string | null
          place_whatsapp_group_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          display_name: string
          existing_place_id?: string | null
          id?: string
          kind: string
          legacy_driver_id?: string | null
          phone: string
          place_address?: string | null
          place_category?: string | null
          place_description?: string | null
          place_images?: string[]
          place_map_url?: string | null
          place_mode?: string | null
          place_payment?: string | null
          place_telegram_url?: string | null
          place_title?: string | null
          place_whatsapp?: string | null
          place_whatsapp_group_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          display_name?: string
          existing_place_id?: string | null
          id?: string
          kind?: string
          legacy_driver_id?: string | null
          phone?: string
          place_address?: string | null
          place_category?: string | null
          place_description?: string | null
          place_images?: string[]
          place_map_url?: string | null
          place_mode?: string | null
          place_payment?: string | null
          place_telegram_url?: string | null
          place_title?: string | null
          place_whatsapp?: string | null
          place_whatsapp_group_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_requests_existing_place_id_fkey"
            columns: ["existing_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_legacy_driver_id_fkey"
            columns: ["legacy_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_daily_events: {
        Row: {
          campaign_key: string
          event_date: string
          event_name: string
          events: number
          route: string
          target_key: string
          target_type: string
          updated_at: string
        }
        Insert: {
          campaign_key?: string
          event_date?: string
          event_name: string
          events?: number
          route: string
          target_key?: string
          target_type: string
          updated_at?: string
        }
        Update: {
          campaign_key?: string
          event_date?: string
          event_name?: string
          events?: number
          route?: string
          target_key?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      analytics_daily_visitors: {
        Row: {
          event_date: string
          last_seen_at: string
          visitor_hash: string
        }
        Insert: {
          event_date?: string
          last_seen_at?: string
          visitor_hash: string
        }
        Update: {
          event_date?: string
          last_seen_at?: string
          visitor_hash?: string
        }
        Relationships: []
      }
      analytics_rate_limits: {
        Row: {
          attempts: number
          updated_at: string
          visitor_hash: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          updated_at?: string
          visitor_hash: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          updated_at?: string
          visitor_hash?: string
          window_started_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          metadata: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          metadata?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_rate_limits: {
        Row: {
          attempts: number
          request_key: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          request_key: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          request_key?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      client_error_reports: {
        Row: {
          browser_family: string
          event_type: string
          fingerprint: string
          first_seen_at: string
          id: number
          last_seen_at: string
          occurrences: number
          os_family: string
          release: string
          route: string
        }
        Insert: {
          browser_family: string
          event_type: string
          fingerprint: string
          first_seen_at?: string
          id?: never
          last_seen_at?: string
          occurrences?: number
          os_family: string
          release: string
          route: string
        }
        Update: {
          browser_family?: string
          event_type?: string
          fingerprint?: string
          first_seen_at?: string
          id?: never
          last_seen_at?: string
          occurrences?: number
          os_family?: string
          release?: string
          route?: string
        }
        Relationships: []
      }
      delivery_orders: {
        Row: {
          assigned_at: string | null
          assigned_driver_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          collection_amount: number | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee: number | null
          expires_at: string
          id: string
          issue_reason: string | null
          merchant_id: string
          notes: string | null
          picked_up_at: string | null
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_driver_id?: string | null
          branch_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          collection_amount?: number | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee?: number | null
          expires_at?: string
          id?: string
          issue_reason?: string | null
          merchant_id: string
          notes?: string | null
          picked_up_at?: string | null
          public_code?: string
          recipient_name: string
          recipient_phone: string
          status?: Database["public"]["Enums"]["delivery_order_status"]
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_driver_id?: string | null
          branch_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          collection_amount?: number | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivery_address?: string
          delivery_area?: string
          delivery_fee?: number | null
          expires_at?: string
          id?: string
          issue_reason?: string | null
          merchant_id?: string
          notes?: string | null
          picked_up_at?: string | null
          public_code?: string
          recipient_name?: string
          recipient_phone?: string
          status?: Database["public"]["Enums"]["delivery_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "merchant_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          active_until: string | null
          contact_phone: string | null
          created_at: string
          is_available: boolean
          last_seen_at: string | null
          legacy_driver_id: string | null
          profile_id: string
          updated_at: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        Insert: {
          active_until?: string | null
          contact_phone?: string | null
          created_at?: string
          is_available?: boolean
          last_seen_at?: string | null
          legacy_driver_id?: string | null
          profile_id: string
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Update: {
          active_until?: string | null
          contact_phone?: string | null
          created_at?: string
          is_available?: boolean
          last_seen_at?: string | null
          legacy_driver_id?: string | null
          profile_id?: string
          updated_at?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_profiles_legacy_driver_id_fkey"
            columns: ["legacy_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          active_until: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string | null
          phone: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        Insert: {
          active_until?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          phone: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Update: {
          active_until?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string | null
          phone?: string
          vehicle_type?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      feedback_requests: {
        Row: {
          contact_phone: string
          created_at: string | null
          feedback_type: string
          id: string
          images: string[] | null
          notes: string
          place_name_or_phone: string
          proposed_address: string | null
          proposed_category: string | null
          proposed_description: string | null
          proposed_images: string[]
          proposed_instapay_vfcash: string | null
          proposed_map_url: string | null
          proposed_phone: string | null
          proposed_telegram_url: string | null
          proposed_title: string | null
          proposed_whatsapp: string | null
          proposed_whatsapp_group_url: string | null
          rating: number | null
          source: string
          status: string | null
          submitted_by: string | null
          target_place_id: string | null
        }
        Insert: {
          contact_phone: string
          created_at?: string | null
          feedback_type: string
          id?: string
          images?: string[] | null
          notes: string
          place_name_or_phone: string
          proposed_address?: string | null
          proposed_category?: string | null
          proposed_description?: string | null
          proposed_images?: string[]
          proposed_instapay_vfcash?: string | null
          proposed_map_url?: string | null
          proposed_phone?: string | null
          proposed_telegram_url?: string | null
          proposed_title?: string | null
          proposed_whatsapp?: string | null
          proposed_whatsapp_group_url?: string | null
          rating?: number | null
          source?: string
          status?: string | null
          submitted_by?: string | null
          target_place_id?: string | null
        }
        Update: {
          contact_phone?: string
          created_at?: string | null
          feedback_type?: string
          id?: string
          images?: string[] | null
          notes?: string
          place_name_or_phone?: string
          proposed_address?: string | null
          proposed_category?: string | null
          proposed_description?: string | null
          proposed_images?: string[]
          proposed_instapay_vfcash?: string | null
          proposed_map_url?: string | null
          proposed_phone?: string | null
          proposed_telegram_url?: string | null
          proposed_title?: string | null
          proposed_whatsapp?: string | null
          proposed_whatsapp_group_url?: string | null
          rating?: number | null
          source?: string
          status?: string | null
          submitted_by?: string | null
          target_place_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_requests_target_place_id_fkey"
            columns: ["target_place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_upload_rate_limits: {
        Row: {
          attempts: number
          request_key: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          request_key: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          request_key?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      marketing_campaigns: {
        Row: {
          campaign_code: string
          channel_id: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          entity_type: string
          id: string
          last_published_at: string | null
          payload: Json
          status: string
          template_key: string
          updated_at: string
        }
        Insert: {
          campaign_code?: string
          channel_id: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          last_published_at?: string | null
          payload?: Json
          status?: string
          template_key: string
          updated_at?: string
        }
        Update: {
          campaign_code?: string
          channel_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          last_published_at?: string | null
          payload?: Json
          status?: string
          template_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "marketing_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_channels: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          notes: string
          slug: string
          updated_at: string
          whatsapp_url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string
          slug: string
          updated_at?: string
          whatsapp_url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string
          slug?: string
          updated_at?: string
          whatsapp_url?: string
        }
        Relationships: []
      }
      marketing_publications: {
        Row: {
          campaign_id: string
          id: number
          published_at: string
          published_by: string | null
        }
        Insert: {
          campaign_id: string
          id?: number
          published_at?: string
          published_by?: string | null
        }
        Update: {
          campaign_id?: string
          id?: number
          published_at?: string
          published_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_publications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_branches: {
        Row: {
          address: string
          area: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          merchant_id: string
          name: string
          phone: string
          place_id: string | null
          updated_at: string
        }
        Insert: {
          address: string
          area: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          merchant_id: string
          name: string
          phone: string
          place_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string
          area?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          merchant_id?: string
          name?: string
          phone?: string
          place_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_branches_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_branches_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          event_key: string
          id: number
          order_id: string | null
          payload: Json
          processed_at: string | null
          profile_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_key: string
          id?: never
          order_id?: string | null
          payload: Json
          processed_at?: string | null
          profile_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_key?: string
          id?: never
          order_id?: string | null
          payload?: Json
          processed_at?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: number
          metadata: Json
          order_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: never
          metadata?: Json
          order_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: never
          metadata?: Json
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "delivery_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_requests: {
        Row: {
          address: string | null
          category: string
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          instapay_vfcash: string | null
          map_url: string | null
          phone: string
          status: string | null
          telegram_url: string | null
          title: string
          whatsapp: string | null
          whatsapp_group_url: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          instapay_vfcash?: string | null
          map_url?: string | null
          phone: string
          status?: string | null
          telegram_url?: string | null
          title: string
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          instapay_vfcash?: string | null
          map_url?: string | null
          phone?: string
          status?: string | null
          telegram_url?: string | null
          title?: string
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Relationships: []
      }
      place_upvote_receipts: {
        Row: {
          created_at: string
          place_id: string
          request_key: string
        }
        Insert: {
          created_at?: string
          place_id: string
          request_key: string
        }
        Update: {
          created_at?: string
          place_id?: string
          request_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_upvote_receipts_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          address: string | null
          category: string
          created_at: string | null
          description: string | null
          id: string
          images: string[] | null
          instapay_vfcash: string | null
          is_featured: boolean | null
          map_url: string | null
          phone: string
          telegram_url: string | null
          title: string
          whatsapp: string | null
          whatsapp_group_url: string | null
        }
        Insert: {
          address?: string | null
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          instapay_vfcash?: string | null
          is_featured?: boolean | null
          map_url?: string | null
          phone: string
          telegram_url?: string | null
          title: string
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Update: {
          address?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          images?: string[] | null
          instapay_vfcash?: string | null
          is_featured?: boolean | null
          map_url?: string | null
          phone?: string
          telegram_url?: string | null
          title?: string
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          merchant_id: string | null
          must_change_password: boolean
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          is_active?: boolean
          merchant_id?: string | null
          must_change_password?: boolean
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          must_change_password?: boolean
          phone?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_submission_rate_limits: {
        Row: {
          attempts: number
          request_key: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts?: number
          request_key: string
          updated_at?: string
          window_started_at?: string
        }
        Update: {
          attempts?: number
          request_key?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          profile_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          profile_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          profile_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_feedback_to_place: {
        Args: { p_feedback_id: string; p_image_mode?: string }
        Returns: string
      }
      approve_account_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      admin_repair_driver_account: {
        Args: { p_is_active?: boolean; p_profile_id: string }
        Returns: boolean
      }
      approve_pending_place: { Args: { p_request_id: string }; Returns: string }
      claim_delivery_order: {
        Args: { p_order_id: string }
        Returns: {
          assigned_at: string | null
          assigned_driver_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          collection_amount: number | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee: number | null
          expires_at: string
          id: string
          issue_reason: string | null
          merchant_id: string
          notes: string | null
          picked_up_at: string | null
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      consume_account_request_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      consume_listing_upload_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      consume_public_submission_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      create_delivery_order: {
        Args: {
          p_branch_id: string
          p_collection_amount?: number
          p_delivery_address: string
          p_delivery_area: string
          p_delivery_fee?: number
          p_direct_driver_id?: string
          p_notes?: string
          p_recipient_name: string
          p_recipient_phone: string
        }
        Returns: {
          assigned_at: string | null
          assigned_driver_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          collection_amount: number | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee: number | null
          expires_at: string
          id: string
          issue_reason: string | null
          merchant_id: string
          notes: string | null
          picked_up_at: string | null
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_profile: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          merchant_id: string | null
          must_change_password: boolean
          phone: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_delivery_offers: { Args: never; Returns: number }
      get_admin_metrics: {
        Args: never
        Returns: {
          active_drivers: number
          pending_additions: number
          pending_feedbacks: number
          total_places: number
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_current_active_driver: { Args: never; Returns: boolean }
      is_current_merchant_for: {
        Args: { p_merchant_id: string }
        Returns: boolean
      }
      list_public_legacy_drivers: {
        Args: never
        Returns: {
          active_until: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          phone: string
          vehicle_type: string
          whatsapp: string
        }[]
      }
      list_public_registered_drivers: {
        Args: never
        Returns: {
          active_until: string
          created_at: string
          id: string
          is_available: boolean
          name: string
          phone: string
          vehicle_type: string
          whatsapp: string
        }[]
      }
      rebroadcast_delivery_order: {
        Args: { p_order_id: string }
        Returns: {
          assigned_at: string | null
          assigned_driver_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          collection_amount: number | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee: number | null
          expires_at: string
          id: string
          issue_reason: string | null
          merchant_id: string
          notes: string | null
          picked_up_at: string | null
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_client_error: {
        Args: {
          p_browser_family: string
          p_event_type: string
          p_fingerprint: string
          p_limit?: number
          p_os_family: string
          p_release: string
          p_request_key: string
          p_route: string
        }
        Returns: boolean
      }
      record_place_upvote: {
        Args: { p_place_id: string; p_request_key: string }
        Returns: boolean
      }
      record_site_analytics: {
        Args: {
          p_event_name: string
          p_limit?: number
          p_route: string
          p_target_key: string
          p_target_type: string
          p_visitor_hash: string
        }
        Returns: boolean
      }
      record_site_analytics_v2: {
        Args: {
          p_campaign_key?: string
          p_event_name: string
          p_limit?: number
          p_route: string
          p_target_key: string
          p_target_type: string
          p_visitor_hash: string
        }
        Returns: boolean
      }
      reject_account_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: string
      }
      renew_driver_availability: {
        Args: never
        Returns: {
          active_until: string | null
          created_at: string
          is_available: boolean
          last_seen_at: string | null
          legacy_driver_id: string | null
          profile_id: string
          updated_at: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_delivery_order_status: {
        Args: {
          p_next: Database["public"]["Enums"]["delivery_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: {
          assigned_at: string | null
          assigned_driver_id: string | null
          branch_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          collection_amount: number | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivery_address: string
          delivery_area: string
          delivery_fee: number | null
          expires_at: string
          id: string
          issue_reason: string | null
          merchant_id: string
          notes: string | null
          picked_up_at: string | null
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_driver_public_profile: {
        Args: {
          p_contact_phone?: string
          p_display_name: string
          p_vehicle_type?: string
          p_whatsapp?: string
        }
        Returns: {
          active_until: string | null
          contact_phone: string | null
          created_at: string
          is_available: boolean
          last_seen_at: string | null
          legacy_driver_id: string | null
          profile_id: string
          updated_at: string
          vehicle_type: string | null
          whatsapp: string | null
        }
        SetofOptions: {
          from: "*"
          to: "driver_profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "merchant" | "driver"
      delivery_order_status:
        | "open"
        | "assigned"
        | "picked_up"
        | "delivered"
        | "unassigned"
        | "cancelled"
        | "issue"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "merchant", "driver"],
      delivery_order_status: [
        "open",
        "assigned",
        "picked_up",
        "delivered",
        "unassigned",
        "cancelled",
        "issue",
      ],
    },
  },
} as const
