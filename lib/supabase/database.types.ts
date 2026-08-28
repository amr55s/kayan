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
    PostgrestVersion: "14.15"
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
      admin_membership_mutations: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          request_hash: string
          response: Json
          target_user_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          request_hash: string
          response: Json
          target_user_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          request_hash?: string
          response?: Json
          target_user_id?: string
        }
        Relationships: []
      }
      admin_memberships: {
        Row: {
          created_at: string
          granted_by: string | null
          granted_by_name_snapshot: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["marketplace_admin_role"]
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          granted_by_name_snapshot?: string | null
          is_active?: boolean
          role: Database["public"]["Enums"]["marketplace_admin_role"]
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          granted_by_name_snapshot?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["marketplace_admin_role"]
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
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
      app_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          event_key: string
          id: string
          read_at: string | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          event_key: string
          id?: string
          read_at?: string | null
          recipient_id: string
          title: string
          type: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          event_key?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
          type?: string
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
      branch_delivery_zones: {
        Row: {
          branch_id: string
          created_at: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max: number
          estimated_minutes_min: number
          fee: number
          free_delivery_threshold: number | null
          is_active: boolean
          minimum_order: number
          updated_at: string
          version: number
          zone_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max: number
          estimated_minutes_min: number
          fee: number
          free_delivery_threshold?: number | null
          is_active?: boolean
          minimum_order?: number
          updated_at?: string
          version?: number
          zone_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max?: number
          estimated_minutes_min?: number
          fee?: number
          free_delivery_threshold?: number | null
          is_active?: boolean
          minimum_order?: number
          updated_at?: string
          version?: number
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_delivery_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_delivery_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_coupon_selections: {
        Row: {
          applied_at: string
          applied_store_id: string
          cart_id: string
          code_snapshot: string
          coupon_id: string
          updated_at: string
        }
        Insert: {
          applied_at?: string
          applied_store_id: string
          cart_id: string
          code_snapshot: string
          coupon_id: string
          updated_at?: string
        }
        Update: {
          applied_at?: string
          applied_store_id?: string
          cart_id?: string
          code_snapshot?: string
          coupon_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_coupon_selections_applied_store_id_fkey"
            columns: ["applied_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_coupon_selections_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: true
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_coupon_selections_coupon_fk"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "marketplace_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          quantity: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          converted_at: string | null
          created_at: string
          currency: string
          customer_id: string | null
          expires_at: string
          guest_token_hash: string | null
          id: string
          merged_into_cart_id: string | null
          status: Database["public"]["Enums"]["marketplace_cart_status"]
          updated_at: string
        }
        Insert: {
          converted_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          expires_at?: string
          guest_token_hash?: string | null
          id?: string
          merged_into_cart_id?: string | null
          status?: Database["public"]["Enums"]["marketplace_cart_status"]
          updated_at?: string
        }
        Update: {
          converted_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string | null
          expires_at?: string
          guest_token_hash?: string | null
          id?: string
          merged_into_cart_id?: string | null
          status?: Database["public"]["Enums"]["marketplace_cart_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carts_merged_into_cart_id_fkey"
            columns: ["merged_into_cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_ledger_entries: {
        Row: {
          actor_name_snapshot: string | null
          actor_user_id: string | null
          amount_piastres: number
          collection_id: string
          created_at: string
          entry_type: string
          event_key: string
          id: string
          metadata: Json
          occurred_at: string
          order_id: string
          reconciliation_batch_id: string | null
        }
        Insert: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          amount_piastres: number
          collection_id: string
          created_at?: string
          entry_type: string
          event_key: string
          id?: string
          metadata?: Json
          occurred_at?: string
          order_id: string
          reconciliation_batch_id?: string | null
        }
        Update: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          amount_piastres?: number
          collection_id?: string
          created_at?: string
          entry_type?: string
          event_key?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          order_id?: string
          reconciliation_batch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_ledger_entries_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "cod_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_ledger_entries_reconciliation_batch_id_fkey"
            columns: ["reconciliation_batch_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliation_batches: {
        Row: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          driver_name_snapshot?: string | null
          expected_total?: number
          id?: string
          idempotency_key: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          submitted_at?: string | null
          submitted_total?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          driver_name_snapshot?: string | null
          expected_total?: number
          id?: string
          idempotency_key?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          submitted_at?: string | null
          submitted_total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_batches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_batches_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliation_items: {
        Row: {
          batch_id: string
          collection_id: string
          created_at: string
          expected_amount: number
          submitted_amount: number | null
        }
        Insert: {
          batch_id: string
          collection_id: string
          created_at?: string
          expected_amount: number
          submitted_amount?: number | null
        }
        Update: {
          batch_id?: string
          collection_id?: string
          created_at?: string
          expected_amount?: number
          submitted_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliation_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliation_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliation_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: true
            referencedRelation: "cod_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_files: {
        Row: {
          bucket: string
          byte_size: number
          content_type: string
          created_at: string
          deleted_at: string | null
          id: string
          object_key: string
          owner_id: string | null
          owner_name_snapshot: string | null
          sha256: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          bucket: string
          byte_size: number
          content_type: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          object_key: string
          owner_id?: string | null
          owner_name_snapshot?: string | null
          sha256: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          bucket?: string
          byte_size?: number
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          object_key?: string
          owner_id?: string | null
          owner_name_snapshot?: string | null
          sha256?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_files_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_jobs: {
        Row: {
          applied_rows: number
          completed_at: string | null
          created_at: string
          error_summary: Json
          file_id: string
          id: string
          idempotency_key: string
          invalid_rows: number
          request_hash: string
          requested_by: string | null
          requester_name_snapshot: string | null
          result: Json
          retention_purged_at: string | null
          source_filename: string
          started_at: string | null
          status: Database["public"]["Enums"]["marketplace_import_status"]
          store_id: string
          total_rows: number
          updated_at: string
          valid_rows: number
        }
        Insert: {
          applied_rows?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: Json
          file_id: string
          id?: string
          idempotency_key: string
          invalid_rows?: number
          request_hash: string
          requested_by?: string | null
          requester_name_snapshot?: string | null
          result?: Json
          retention_purged_at?: string | null
          source_filename: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_import_status"]
          store_id: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Update: {
          applied_rows?: number
          completed_at?: string | null
          created_at?: string
          error_summary?: Json
          file_id?: string
          id?: string
          idempotency_key?: string
          invalid_rows?: number
          request_hash?: string
          requested_by?: string | null
          requester_name_snapshot?: string | null
          result?: Json
          retention_purged_at?: string | null
          source_filename?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_import_status"]
          store_id?: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_jobs_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_jobs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_import_rows: {
        Row: {
          created_at: string
          entity_type: string
          id: number
          job_id: string
          normalized_data: Json | null
          product_id: string | null
          raw_data: Json
          row_number: number
          sheet_name: string
          status: string
          validation_errors: Json
          variant_id: string | null
          worker_attempts: number
          worker_available_at: string
          worker_id: string | null
          worker_last_error: string | null
          worker_lease_expires_at: string | null
          worker_status: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          id?: never
          job_id: string
          normalized_data?: Json | null
          product_id?: string | null
          raw_data: Json
          row_number: number
          sheet_name: string
          status?: string
          validation_errors?: Json
          variant_id?: string | null
          worker_attempts?: number
          worker_available_at?: string
          worker_id?: string | null
          worker_last_error?: string | null
          worker_lease_expires_at?: string | null
          worker_status?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          id?: never
          job_id?: string
          normalized_data?: Json | null
          product_id?: string | null
          raw_data?: Json
          row_number?: number
          sheet_name?: string
          status?: string
          validation_errors?: Json
          variant_id?: string | null
          worker_attempts?: number
          worker_available_at?: string
          worker_id?: string | null
          worker_last_error?: string | null
          worker_lease_expires_at?: string | null
          worker_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_import_rows_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "catalog_import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_import_rows_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      checkout_requests: {
        Row: {
          cart_id: string
          completed_at: string | null
          created_at: string
          customer_id: string
          failure_code: string | null
          id: string
          idempotency_key: string
          order_group_id: string | null
          request_hash: string
          response: Json | null
          status: string
        }
        Insert: {
          cart_id: string
          completed_at?: string | null
          created_at?: string
          customer_id: string
          failure_code?: string | null
          id?: string
          idempotency_key: string
          order_group_id?: string | null
          request_hash: string
          response?: Json | null
          status?: string
        }
        Update: {
          cart_id?: string
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          failure_code?: string | null
          id?: string
          idempotency_key?: string
          order_group_id?: string | null
          request_hash?: string
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkout_requests_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkout_requests_order_group_fk"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
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
          error_kind: string
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
          error_kind?: string
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
          error_kind?: string
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
      cod_collections: {
        Row: {
          collected_amount: number | null
          collected_at: string | null
          collected_by: string | null
          collected_by_name_snapshot: string | null
          created_at: string
          discrepancy_reason: string | null
          expected_amount: number
          id: string
          order_id: string
          remitted_at: string | null
          status: Database["public"]["Enums"]["marketplace_payment_status"]
          updated_at: string
        }
        Insert: {
          collected_amount?: number | null
          collected_at?: string | null
          collected_by?: string | null
          collected_by_name_snapshot?: string | null
          created_at?: string
          discrepancy_reason?: string | null
          expected_amount: number
          id?: string
          order_id: string
          remitted_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_payment_status"]
          updated_at?: string
        }
        Update: {
          collected_amount?: number | null
          collected_at?: string | null
          collected_by?: string | null
          collected_by_name_snapshot?: string | null
          created_at?: string
          discrepancy_reason?: string | null
          expected_amount?: number
          id?: string
          order_id?: string
          remitted_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cod_collections_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cod_collections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_ledger: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string
          entry_type: string
          gross_merchandise_value: number
          id: string
          order_id: string
          recognized_at: string
          return_request_id: string | null
          reversal_reason: string | null
          reversed_at: string | null
          source_entry_id: string | null
          statement_id: string | null
          store_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate?: number
          created_at?: string
          entry_type?: string
          gross_merchandise_value: number
          id?: string
          order_id: string
          recognized_at: string
          return_request_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          source_entry_id?: string | null
          statement_id?: string | null
          store_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          entry_type?: string
          gross_merchandise_value?: number
          id?: string
          order_id?: string
          recognized_at?: string
          return_request_id?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          source_entry_id?: string | null
          statement_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "marketplace_return_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_source_entry_id_fkey"
            columns: ["source_entry_id"]
            isOneToOne: false
            referencedRelation: "commission_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "commission_statements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_statement_mutations: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          request_hash: string
          response: Json
          statement_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          request_hash: string
          response: Json
          statement_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          request_hash?: string
          response?: Json
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_statement_mutations_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "commission_statements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_statements: {
        Row: {
          commission_due: number
          commission_rate: number
          created_at: string
          gross_merchandise_value: number
          id: string
          issued_at: string | null
          manual_adjustment: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["marketplace_statement_status"]
          store_id: string
          total_due: number | null
          updated_at: string
        }
        Insert: {
          commission_due?: number
          commission_rate?: number
          created_at?: string
          gross_merchandise_value?: number
          id?: string
          issued_at?: string | null
          manual_adjustment?: number
          notes?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["marketplace_statement_status"]
          store_id: string
          total_due?: number | null
          updated_at?: string
        }
        Update: {
          commission_due?: number
          commission_rate?: number
          created_at?: string
          gross_merchandise_value?: number
          id?: string
          issued_at?: string | null
          manual_adjustment?: number
          notes?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["marketplace_statement_status"]
          store_id?: string
          total_due?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_statements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          code_snapshot: string
          coupon_id: string
          customer_id: string
          discount_amount: number
          funding_owner_snapshot: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id: string
          order_id: string
          redeemed_at: string
          voided_at: string | null
        }
        Insert: {
          code_snapshot: string
          coupon_id: string
          customer_id: string
          discount_amount: number
          funding_owner_snapshot: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          order_id: string
          redeemed_at?: string
          voided_at?: string | null
        }
        Update: {
          code_snapshot?: string
          coupon_id?: string
          customer_id?: string
          discount_amount?: number
          funding_owner_snapshot?: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          order_id?: string
          redeemed_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "marketplace_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_addresses: {
        Row: {
          address_line: string
          apartment: string | null
          building: string | null
          created_at: string
          customer_id: string
          floor: string | null
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          recipient_name: string
          recipient_phone: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          address_line: string
          apartment?: string | null
          building?: string | null
          created_at?: string
          customer_id: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          recipient_name: string
          recipient_phone: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          address_line?: string
          apartment?: string | null
          building?: string | null
          created_at?: string
          customer_id?: string
          floor?: string | null
          id?: string
          is_default?: boolean
          label?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          recipient_name?: string
          recipient_phone?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_addresses_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
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
      delivery_zones: {
        Row: {
          city: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          city: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          city?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          active_until: string | null
          avatar_path: string | null
          avatar_url: string | null
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
          avatar_path?: string | null
          avatar_url?: string | null
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
          avatar_path?: string | null
          avatar_url?: string | null
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
      inventory_movement_references: {
        Row: {
          created_at: string
          movement_id: number
          order_id: string
          order_item_id: string
          reference_type: string
          reservation_id: string
        }
        Insert: {
          created_at?: string
          movement_id: number
          order_id: string
          order_item_id: string
          reference_type: string
          reservation_id: string
        }
        Update: {
          created_at?: string
          movement_id?: number
          order_id?: string
          order_item_id?: string
          reference_type?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movement_references_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: true
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_references_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_references_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movement_references_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          actor_name_snapshot: string | null
          actor_user_id: string | null
          created_at: string
          id: number
          idempotency_key: string
          on_hand_after: number
          on_hand_before: number
          on_hand_delta: number
          product_id: string
          reason: string
          reserved_after: number
          reserved_before: number
          reserved_delta: number
          stock_version: number
          store_id: string
          transaction_id: number
          variant_id: string
        }
        Insert: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          idempotency_key: string
          on_hand_after: number
          on_hand_before: number
          on_hand_delta: number
          product_id: string
          reason: string
          reserved_after: number
          reserved_before: number
          reserved_delta: number
          stock_version: number
          store_id: string
          transaction_id: number
          variant_id: string
        }
        Update: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          idempotency_key?: string
          on_hand_after?: number
          on_hand_before?: number
          on_hand_delta?: number
          product_id?: string
          reason?: string
          reserved_after?: number
          reserved_before?: number
          reserved_delta?: number
          stock_version?: number
          store_id?: string
          transaction_id?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          committed_at: string | null
          created_at: string
          expires_at: string
          id: string
          order_id: string
          order_item_id: string
          quantity: number
          released_at: string | null
          status: Database["public"]["Enums"]["marketplace_reservation_status"]
          variant_id: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          order_id: string
          order_item_id: string
          quantity: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_reservation_status"]
          variant_id: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          quantity?: number
          released_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_reservation_status"]
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_stock: {
        Row: {
          low_stock_threshold: number
          on_hand: number
          reserved: number
          track_inventory: boolean
          updated_at: string
          variant_id: string
          version: number
        }
        Insert: {
          low_stock_threshold?: number
          on_hand?: number
          reserved?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id: string
          version?: number
        }
        Update: {
          low_stock_threshold?: number
          on_hand?: number
          reserved?: number
          track_inventory?: boolean
          updated_at?: string
          variant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_stock_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: true
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_media_backfill_items: {
        Row: {
          attempts: number
          available_at: string
          completed_at: string | null
          created_at: string
          entity_id: string
          failure_code: string | null
          id: number
          image_ordinal: number | null
          lease_expires_at: string | null
          lease_token: string | null
          output_bucket: string | null
          output_height: number | null
          output_object_key: string | null
          output_public_url: string | null
          output_sha256: string | null
          output_size_bytes: number | null
          output_width: number | null
          run_id: string
          source_bucket: string
          source_object_key: string
          source_sha256: string | null
          source_url: string
          status: string
          target_kind: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          entity_id: string
          failure_code?: string | null
          id?: never
          image_ordinal?: number | null
          lease_expires_at?: string | null
          lease_token?: string | null
          output_bucket?: string | null
          output_height?: number | null
          output_object_key?: string | null
          output_public_url?: string | null
          output_sha256?: string | null
          output_size_bytes?: number | null
          output_width?: number | null
          run_id: string
          source_bucket: string
          source_object_key: string
          source_sha256?: string | null
          source_url: string
          status?: string
          target_kind: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          completed_at?: string | null
          created_at?: string
          entity_id?: string
          failure_code?: string | null
          id?: never
          image_ordinal?: number | null
          lease_expires_at?: string | null
          lease_token?: string | null
          output_bucket?: string | null
          output_height?: number | null
          output_object_key?: string | null
          output_public_url?: string | null
          output_sha256?: string | null
          output_size_bytes?: number | null
          output_width?: number | null
          run_id?: string
          source_bucket?: string
          source_object_key?: string
          source_sha256?: string | null
          source_url?: string
          status?: string
          target_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_media_backfill_items_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "legacy_media_backfill_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_media_backfill_runs: {
        Row: {
          completed_count: number
          created_at: string
          dead_letter_count: number
          discovered_count: number
          driver_checkpoint: string | null
          drivers_discovery_complete: boolean
          finished_at: string | null
          id: string
          place_checkpoint: string | null
          places_discovery_complete: boolean
          source_origin: string
          stale_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_count?: number
          created_at?: string
          dead_letter_count?: number
          discovered_count?: number
          driver_checkpoint?: string | null
          drivers_discovery_complete?: boolean
          finished_at?: string | null
          id: string
          place_checkpoint?: string | null
          places_discovery_complete?: boolean
          source_origin: string
          stale_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_count?: number
          created_at?: string
          dead_letter_count?: number
          discovered_count?: number
          driver_checkpoint?: string | null
          drivers_discovery_complete?: boolean
          finished_at?: string | null
          id?: string
          place_checkpoint?: string | null
          places_discovery_complete?: boolean
          source_origin?: string
          stale_count?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      legacy_media_source_deletion_outbox: {
        Row: {
          created_at: string
          delete_after: string
          deleted_at: string | null
          id: number
          item_id: number
          released_at: string | null
          source_bucket: string
          source_object_key: string
          source_sha256: string
          status: string
          updated_at: string
          verified_at: string
          verified_output_bucket: string
          verified_output_object_key: string
          verified_output_sha256: string
        }
        Insert: {
          created_at?: string
          delete_after: string
          deleted_at?: string | null
          id?: never
          item_id: number
          released_at?: string | null
          source_bucket: string
          source_object_key: string
          source_sha256: string
          status?: string
          updated_at?: string
          verified_at: string
          verified_output_bucket: string
          verified_output_object_key: string
          verified_output_sha256: string
        }
        Update: {
          created_at?: string
          delete_after?: string
          deleted_at?: string | null
          id?: never
          item_id?: number
          released_at?: string | null
          source_bucket?: string
          source_object_key?: string
          source_sha256?: string
          status?: string
          updated_at?: string
          verified_at?: string
          verified_output_bucket?: string
          verified_output_object_key?: string
          verified_output_sha256?: string
        }
        Relationships: [
          {
            foreignKeyName: "legacy_media_source_deletion_outbox_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "legacy_media_backfill_items"
            referencedColumns: ["id"]
          },
        ]
      }
      legacy_media_uploads: {
        Row: {
          asset_id: string | null
          bucket: string | null
          byte_size: number | null
          claimed_at: string | null
          content_type: string | null
          created_at: string
          deleted_at: string | null
          entity_id: string | null
          expected_content_type: string
          expected_sha256: string
          expected_size_bytes: number
          expires_at: string
          failure_code: string | null
          folder: string
          height: number | null
          id: string
          merchant_id: string | null
          object_key: string | null
          owner_id: string
          public_url: string | null
          purpose: string
          sha256: string | null
          staging_key: string
          status: string
          updated_at: string
          width: number | null
        }
        Insert: {
          asset_id?: string | null
          bucket?: string | null
          byte_size?: number | null
          claimed_at?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          expected_content_type: string
          expected_sha256: string
          expected_size_bytes: number
          expires_at?: string
          failure_code?: string | null
          folder: string
          height?: number | null
          id: string
          merchant_id?: string | null
          object_key?: string | null
          owner_id: string
          public_url?: string | null
          purpose: string
          sha256?: string | null
          staging_key: string
          status?: string
          updated_at?: string
          width?: number | null
        }
        Update: {
          asset_id?: string | null
          bucket?: string | null
          byte_size?: number | null
          claimed_at?: string | null
          content_type?: string | null
          created_at?: string
          deleted_at?: string | null
          entity_id?: string | null
          expected_content_type?: string
          expected_sha256?: string
          expected_size_bytes?: number
          expires_at?: string
          failure_code?: string | null
          folder?: string
          height?: number | null
          id?: string
          merchant_id?: string | null
          object_key?: string | null
          owner_id?: string
          public_url?: string | null
          purpose?: string
          sha256?: string | null
          staging_key?: string
          status?: string
          updated_at?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "legacy_media_uploads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
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
      marketplace_actor_rate_limits: {
        Row: {
          action: string
          actor_id: string
          attempts: number
          updated_at: string
          window_started_at: string
        }
        Insert: {
          action: string
          actor_id: string
          attempts: number
          updated_at?: string
          window_started_at: string
        }
        Update: {
          action?: string
          actor_id?: string
          attempts?: number
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      marketplace_admin_capability_context: {
        Row: {
          activated_role: Database["public"]["Enums"]["marketplace_admin_role"]
          created_at: string
          transaction_id: number
          user_id: string
        }
        Insert: {
          activated_role: Database["public"]["Enums"]["marketplace_admin_role"]
          created_at?: string
          transaction_id: number
          user_id: string
        }
        Update: {
          activated_role?: Database["public"]["Enums"]["marketplace_admin_role"]
          created_at?: string
          transaction_id?: number
          user_id?: string
        }
        Relationships: []
      }
      marketplace_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          id: number
          metadata: Json
          request_id: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: never
          metadata?: Json
          request_id?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: never
          metadata?: Json
          request_id?: string | null
        }
        Relationships: []
      }
      marketplace_catalog_mutations: {
        Row: {
          actor_name_snapshot: string | null
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          product_id: string | null
          request_hash: string
          response: Json
          store_id: string
        }
        Insert: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          product_id?: string | null
          request_hash: string
          response: Json
          store_id: string
        }
        Update: {
          actor_name_snapshot?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          product_id?: string | null
          request_hash?: string
          response?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_catalog_mutations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_catalog_mutations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_coupon_categories: {
        Row: {
          category_id: string
          coupon_id: string
        }
        Insert: {
          category_id: string
          coupon_id: string
        }
        Update: {
          category_id?: string
          coupon_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_coupon_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_coupon_categories_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "marketplace_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_coupon_products: {
        Row: {
          coupon_id: string
          product_id: string
        }
        Insert: {
          coupon_id: string
          product_id: string
        }
        Update: {
          coupon_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_coupon_products_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "marketplace_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_coupon_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_coupon_return_adjustments: {
        Row: {
          amount_piastres: number
          created_at: string
          funding_owner: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id: string
          redemption_id: string
          return_request_id: string
        }
        Insert: {
          amount_piastres: number
          created_at?: string
          funding_owner: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          redemption_id: string
          return_request_id: string
        }
        Update: {
          amount_piastres?: number
          created_at?: string
          funding_owner?: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          redemption_id?: string
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_coupon_return_adjustments_redemption_id_fkey"
            columns: ["redemption_id"]
            isOneToOne: false
            referencedRelation: "coupon_redemptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_coupon_return_adjustments_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: true
            referencedRelation: "marketplace_return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          discount_amount_piastres: number | null
          discount_percent: number | null
          discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          expires_at: string | null
          funding_owner: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id: string
          is_active: boolean
          max_discount: number | null
          minimum_order: number
          per_customer_limit: number
          redeemed_count: number
          starts_at: string | null
          store_id: string | null
          title: string
          total_limit: number | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          discount_amount_piastres?: number | null
          discount_percent?: number | null
          discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          expires_at?: string | null
          funding_owner?: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          is_active?: boolean
          max_discount?: number | null
          minimum_order?: number
          per_customer_limit?: number
          redeemed_count?: number
          starts_at?: string | null
          store_id?: string | null
          title: string
          total_limit?: number | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          discount_amount_piastres?: number | null
          discount_percent?: number | null
          discount_type?: Database["public"]["Enums"]["marketplace_coupon_type"]
          expires_at?: string | null
          funding_owner?: Database["public"]["Enums"]["marketplace_coupon_funding"]
          id?: string
          is_active?: boolean
          max_discount?: number | null
          minimum_order?: number
          per_customer_limit?: number
          redeemed_count?: number
          starts_at?: string | null
          store_id?: string | null
          title?: string
          total_limit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_customers: {
        Row: {
          anonymized_at: string | null
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          email_verified_at: string | null
          id: string
          is_active: boolean
          locale: string
          phone: string | null
          phone_verified_at: string | null
          primary_provider: string
          updated_at: string
        }
        Insert: {
          anonymized_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name: string
          email?: string | null
          email_verified_at?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_provider?: string
          updated_at?: string
        }
        Update: {
          anonymized_at?: string | null
          auth_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          email_verified_at?: string | null
          id?: string
          is_active?: boolean
          locale?: string
          phone?: string | null
          phone_verified_at?: string | null
          primary_provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      marketplace_delivery_assignments: {
        Row: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_asset_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_name_snapshot?: string | null
          id?: string
          notes?: string | null
          order_id: string
          picked_up_at?: string | null
          proof_asset_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          created_at?: string
          delivered_at?: string | null
          driver_id?: string | null
          driver_name_snapshot?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          picked_up_at?: string | null
          proof_asset_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_delivery_assignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_delivery_assignments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_delivery_assignments_proof_asset_id_fkey"
            columns: ["proof_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_delivery_offers: {
        Row: {
          created_at: string
          created_by: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          expires_at: string
          id: string
          order_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          driver_name_snapshot?: string | null
          expires_at: string
          id?: string
          order_id: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          driver_name_snapshot?: string | null
          expires_at?: string
          id?: string
          order_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_delivery_offers_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_delivery_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_media_deletion_intents: {
        Row: {
          actor_user_id: string
          after_snapshot_sha256: string
          asset_id: string
          before_snapshot: Json
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          expires_at: string
          id: string
          outbox_id: number | null
          store_id: string
          undone_at: string | null
        }
        Insert: {
          actor_user_id: string
          after_snapshot_sha256: string
          asset_id: string
          before_snapshot: Json
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          expires_at: string
          id?: string
          outbox_id?: number | null
          store_id: string
          undone_at?: string | null
        }
        Update: {
          actor_user_id?: string
          after_snapshot_sha256?: string
          asset_id?: string
          before_snapshot?: Json
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["marketplace_media_entity"]
          expires_at?: string
          id?: string
          outbox_id?: number | null
          store_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_media_deletion_intents_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_media_deletion_intents_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "marketplace_outbox"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_media_deletion_intents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_operational_mutations: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          request_hash?: string
          response?: Json
        }
        Relationships: []
      }
      marketplace_order_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
          id: number
          metadata: Json
          order_id: string
          to_status:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
          id?: never
          metadata?: Json
          order_id: string
          to_status?:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
          id?: never
          metadata?: Json
          order_id?: string
          to_status?:
            | Database["public"]["Enums"]["marketplace_order_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          address_snapshot: Json
          branch_id: string
          branch_snapshot: Json
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmed_at: string | null
          created_at: string
          currency: string
          customer_id: string
          customer_notes: string | null
          delivered_at: string | null
          delivery_fee: number
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          delivery_zone_id: string
          discount_total: number | null
          grand_total: number
          id: string
          merchant_discount_total: number
          order_group_id: string
          payment_method: string
          payment_status: Database["public"]["Enums"]["marketplace_payment_status"]
          pii_redacted_at: string | null
          platform_discount_total: number
          public_code: string
          ready_at: string | null
          status: Database["public"]["Enums"]["marketplace_order_status"]
          store_id: string
          store_name_snapshot: string
          subtotal: number
          updated_at: string
        }
        Insert: {
          address_snapshot: Json
          branch_id: string
          branch_snapshot: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id: string
          customer_notes?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          delivery_zone_id: string
          discount_total?: number | null
          grand_total: number
          id?: string
          merchant_discount_total?: number
          order_group_id: string
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["marketplace_payment_status"]
          pii_redacted_at?: string | null
          platform_discount_total?: number
          public_code?: string
          ready_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_order_status"]
          store_id: string
          store_name_snapshot: string
          subtotal: number
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          branch_id?: string
          branch_snapshot?: Json
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          currency?: string
          customer_id?: string
          customer_notes?: string | null
          delivered_at?: string | null
          delivery_fee?: number
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          delivery_zone_id?: string
          discount_total?: number | null
          grand_total?: number
          id?: string
          merchant_discount_total?: number
          order_group_id?: string
          payment_method?: string
          payment_status?: Database["public"]["Enums"]["marketplace_payment_status"]
          pii_redacted_at?: string | null
          platform_discount_total?: number
          public_code?: string
          ready_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_order_status"]
          store_id?: string
          store_name_snapshot?: string
          subtotal?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_branch_store_fk"
            columns: ["branch_id", "store_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "marketplace_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_order_group_id_fkey"
            columns: ["order_group_id"]
            isOneToOne: false
            referencedRelation: "order_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_outbox: {
        Row: {
          aggregate_id: string
          aggregate_type: string
          attempts: number
          available_at: string
          created_at: string
          dead_lettered_at: string | null
          event_key: string
          id: number
          last_error: string | null
          locked_at: string | null
          payload: Json
          processed_at: string | null
          topic: string
          worker_id: string | null
        }
        Insert: {
          aggregate_id: string
          aggregate_type: string
          attempts?: number
          available_at?: string
          created_at?: string
          dead_lettered_at?: string | null
          event_key: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          payload: Json
          processed_at?: string | null
          topic: string
          worker_id?: string | null
        }
        Update: {
          aggregate_id?: string
          aggregate_type?: string
          attempts?: number
          available_at?: string
          created_at?: string
          dead_lettered_at?: string | null
          event_key?: string
          id?: never
          last_error?: string | null
          locked_at?: string | null
          payload?: Json
          processed_at?: string | null
          topic?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      marketplace_push_jobs: {
        Row: {
          attempts: number
          available_at: string
          created_at: string
          dead_lettered_at: string | null
          failure_code: string | null
          id: number
          locked_at: string | null
          notification_id: string
          processed_at: string | null
          recipient_id: string
          subscription_id: string
          worker_id: string | null
        }
        Insert: {
          attempts?: number
          available_at?: string
          created_at?: string
          dead_lettered_at?: string | null
          failure_code?: string | null
          id?: never
          locked_at?: string | null
          notification_id: string
          processed_at?: string | null
          recipient_id: string
          subscription_id: string
          worker_id?: string | null
        }
        Update: {
          attempts?: number
          available_at?: string
          created_at?: string
          dead_lettered_at?: string | null
          failure_code?: string | null
          id?: never
          locked_at?: string | null
          notification_id?: string
          processed_at?: string | null
          recipient_id?: string
          subscription_id?: string
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_push_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_push_jobs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_return_category_policies: {
        Row: {
          allow_change_of_mind: boolean
          allow_defect_return: boolean
          category_id: string
          change_of_mind_days: number
          default_restock_defects: boolean
          defect_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_change_of_mind?: boolean
          allow_defect_return?: boolean
          category_id: string
          change_of_mind_days?: number
          default_restock_defects?: boolean
          defect_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_change_of_mind?: boolean
          allow_defect_return?: boolean
          category_id?: string
          change_of_mind_days?: number
          default_restock_defects?: boolean
          defect_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_return_category_policies_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: true
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_return_mutations: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
          return_request_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          operation: string
          request_hash: string
          response: Json
          return_request_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          operation?: string
          request_hash?: string
          response?: Json
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_return_mutations_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "marketplace_return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_return_request_items: {
        Row: {
          created_at: string
          eligibility_deadline: string
          gross_amount_piastres: number
          merchant_discount_adjustment_piastres: number
          order_item_id: string
          platform_discount_adjustment_piastres: number
          policy_days: number
          quantity: number
          refund_amount_piastres: number
          restock_quantity: number
          return_request_id: string
        }
        Insert: {
          created_at?: string
          eligibility_deadline: string
          gross_amount_piastres: number
          merchant_discount_adjustment_piastres?: number
          order_item_id: string
          platform_discount_adjustment_piastres?: number
          policy_days: number
          quantity: number
          refund_amount_piastres?: number
          restock_quantity?: number
          return_request_id: string
        }
        Update: {
          created_at?: string
          eligibility_deadline?: string
          gross_amount_piastres?: number
          merchant_discount_adjustment_piastres?: number
          order_item_id?: string
          platform_discount_adjustment_piastres?: number
          policy_days?: number
          quantity?: number
          refund_amount_piastres?: number
          restock_quantity?: number
          return_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_return_request_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_return_request_items_return_request_id_fkey"
            columns: ["return_request_id"]
            isOneToOne: false
            referencedRelation: "marketplace_return_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_return_requests: {
        Row: {
          created_at: string
          customer_id: string
          delivery_refund_piastres: number
          id: string
          merchant_discount_adjustment_piastres: number
          order_id: string
          platform_discount_adjustment_piastres: number
          public_code: string
          reason_code: string
          reason_details: string | null
          received_at: string | null
          received_by: string | null
          refund_amount_piastres: number
          request_hash: string
          request_idempotency_key: string
          requested_by: string | null
          returned_gross_piastres: number
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delivery_refund_piastres?: number
          id?: string
          merchant_discount_adjustment_piastres?: number
          order_id: string
          platform_discount_adjustment_piastres?: number
          public_code?: string
          reason_code: string
          reason_details?: string | null
          received_at?: string | null
          received_by?: string | null
          refund_amount_piastres?: number
          request_hash: string
          request_idempotency_key: string
          requested_by?: string | null
          returned_gross_piastres?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delivery_refund_piastres?: number
          id?: string
          merchant_discount_adjustment_piastres?: number
          order_id?: string
          platform_discount_adjustment_piastres?: number
          public_code?: string
          reason_code?: string
          reason_details?: string | null
          received_at?: string | null
          received_by?: string | null
          refund_amount_piastres?: number
          request_hash?: string
          request_idempotency_key?: string
          requested_by?: string | null
          returned_gross_piastres?: number
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_return_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_return_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_return_requests_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_runtime_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      media_assets: {
        Row: {
          bucket: string
          byte_size: number
          content_type: string
          created_at: string
          deleted_at: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          height: number
          id: string
          merchant_id: string
          metadata: Json
          object_key: string
          owner_id: string | null
          owner_name_snapshot: string | null
          provider: string
          public_url: string | null
          sha256: string
          slot: string
          status: Database["public"]["Enums"]["marketplace_media_status"]
          store_id: string
          updated_at: string
          visibility: string
          width: number
        }
        Insert: {
          bucket: string
          byte_size: number
          content_type: string
          created_at?: string
          deleted_at?: string | null
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          height: number
          id: string
          merchant_id: string
          metadata?: Json
          object_key: string
          owner_id?: string | null
          owner_name_snapshot?: string | null
          provider?: string
          public_url?: string | null
          sha256: string
          slot?: string
          status?: Database["public"]["Enums"]["marketplace_media_status"]
          store_id: string
          updated_at?: string
          visibility?: string
          width: number
        }
        Update: {
          bucket?: string
          byte_size?: number
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["marketplace_media_entity"]
          height?: number
          id?: string
          merchant_id?: string
          metadata?: Json
          object_key?: string
          owner_id?: string | null
          owner_name_snapshot?: string | null
          provider?: string
          public_url?: string | null
          sha256?: string
          slot?: string
          status?: Database["public"]["Enums"]["marketplace_media_status"]
          store_id?: string
          updated_at?: string
          visibility?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "media_assets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_assets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
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
      merchant_memberships: {
        Row: {
          created_at: string
          invited_by: string | null
          is_active: boolean
          merchant_id: string
          role: Database["public"]["Enums"]["marketplace_membership_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          merchant_id: string
          role?: Database["public"]["Enums"]["marketplace_membership_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          merchant_id?: string
          role?: Database["public"]["Enums"]["marketplace_membership_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_memberships_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
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
      order_groups: {
        Row: {
          address_id: string | null
          address_snapshot: Json
          cart_id: string
          child_order_count: number
          created_at: string
          currency: string
          customer_id: string
          delivery_notes: string | null
          delivery_total: number
          discount_total: number | null
          grand_total: number
          id: string
          merchant_discount_total: number
          pii_redacted_at: string | null
          placed_at: string
          platform_discount_total: number
          public_code: string
          subtotal: number
        }
        Insert: {
          address_id?: string | null
          address_snapshot: Json
          cart_id: string
          child_order_count: number
          created_at?: string
          currency?: string
          customer_id: string
          delivery_notes?: string | null
          delivery_total?: number
          discount_total?: number | null
          grand_total?: number
          id?: string
          merchant_discount_total?: number
          pii_redacted_at?: string | null
          placed_at?: string
          platform_discount_total?: number
          public_code?: string
          subtotal?: number
        }
        Update: {
          address_id?: string | null
          address_snapshot?: Json
          cart_id?: string
          child_order_count?: number
          created_at?: string
          currency?: string
          customer_id?: string
          delivery_notes?: string | null
          delivery_total?: number
          discount_total?: number | null
          grand_total?: number
          id?: string
          merchant_discount_total?: number
          pii_redacted_at?: string | null
          placed_at?: string
          platform_discount_total?: number
          public_code?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_groups_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "customer_addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_groups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          attributes_snapshot: Json
          created_at: string
          id: string
          image_url_snapshot: string | null
          line_total: number | null
          order_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          unit_price: number
          variant_id: string
          variant_name_snapshot: string
        }
        Insert: {
          attributes_snapshot?: Json
          created_at?: string
          id?: string
          image_url_snapshot?: string | null
          line_total?: number | null
          order_id: string
          product_id: string
          product_name_snapshot: string
          quantity: number
          sku_snapshot: string
          unit_price: number
          variant_id: string
          variant_name_snapshot: string
        }
        Update: {
          attributes_snapshot?: Json
          created_at?: string
          id?: string
          image_url_snapshot?: string | null
          line_total?: number | null
          order_id?: string
          product_id?: string
          product_name_snapshot?: string
          quantity?: number
          sku_snapshot?: string
          unit_price?: number
          variant_id?: string
          variant_name_snapshot?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
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
          recommend_count: number
          telegram_url: string | null
          title: string
          view_count: number
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
          recommend_count?: number
          telegram_url?: string | null
          title: string
          view_count?: number
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
          recommend_count?: number
          telegram_url?: string | null
          title?: string
          view_count?: number
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Relationships: []
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          name_en: string | null
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          name_en?: string | null
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          name_en?: string | null
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_aliases: {
        Row: {
          category_id: string
          created_at: string
          id: string
          is_active: boolean
          match_scope: string
          normalized_phrase: string | null
          phrase: string
          updated_at: string
          weight: number
        }
        Insert: {
          category_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_scope?: string
          normalized_phrase?: string | null
          phrase: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          match_scope?: string
          normalized_phrase?: string | null
          phrase?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_category_aliases_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_classification_events: {
        Row: {
          actor_id: string
          algorithm_version: string
          confidence: number | null
          created_at: string
          id: string
          idempotency_key: string
          outcome: string
          predicted_category_id: string | null
          product_id: string
          selected_category_id: string | null
          signals: Json
          store_id: string
        }
        Insert: {
          actor_id: string
          algorithm_version: string
          confidence?: number | null
          created_at?: string
          id?: string
          idempotency_key: string
          outcome: string
          predicted_category_id?: string | null
          product_id: string
          selected_category_id?: string | null
          signals?: Json
          store_id: string
        }
        Update: {
          actor_id?: string
          algorithm_version?: string
          confidence?: number | null
          created_at?: string
          id?: string
          idempotency_key?: string
          outcome?: string
          predicted_category_id?: string | null
          product_id?: string
          selected_category_id?: string | null
          signals?: Json
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_classification_even_predicted_category_id_fkey"
            columns: ["predicted_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_classification_event_selected_category_id_fkey"
            columns: ["selected_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_classification_events_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_classification_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_category_proposals: {
        Row: {
          created_at: string
          example_product_name: string
          id: string
          normalized_name: string
          product_id: string
          proposed_by: string
          proposed_name: string
          resolved_category_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          example_product_name: string
          id?: string
          normalized_name: string
          product_id: string
          proposed_by: string
          proposed_name: string
          resolved_category_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          example_product_name?: string
          id?: string
          normalized_name?: string
          product_id?: string
          proposed_by?: string
          proposed_name?: string
          resolved_category_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_category_proposals_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_proposals_resolved_category_id_fkey"
            columns: ["resolved_category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_category_proposals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          is_primary: boolean
          media_asset_id: string
          position: number
          product_id: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          is_primary?: boolean
          media_asset_id: string
          position: number
          product_id: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          is_primary?: boolean
          media_asset_id?: string
          position?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_rating_aggregates: {
        Row: {
          product_id: string
          rating_1_count: number
          rating_2_count: number
          rating_3_count: number
          rating_4_count: number
          rating_5_count: number
          rating_average: number | null
          rating_sum: number
          review_count: number
          updated_at: string
        }
        Insert: {
          product_id: string
          rating_1_count?: number
          rating_2_count?: number
          rating_3_count?: number
          rating_4_count?: number
          rating_5_count?: number
          rating_average?: number | null
          rating_sum?: number
          review_count?: number
          updated_at?: string
        }
        Update: {
          product_id?: string
          rating_1_count?: number
          rating_2_count?: number
          rating_3_count?: number
          rating_4_count?: number
          rating_5_count?: number
          rating_average?: number | null
          rating_sum?: number
          review_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_rating_aggregates_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          body: string | null
          created_at: string
          customer_id: string
          id: string
          moderation_notes: string | null
          order_item_id: string
          product_id: string
          rating: number
          status: Database["public"]["Enums"]["marketplace_review_status"]
          title: string | null
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          body?: string | null
          created_at?: string
          customer_id: string
          id?: string
          moderation_notes?: string | null
          order_item_id: string
          product_id: string
          rating: number
          status?: Database["public"]["Enums"]["marketplace_review_status"]
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          body?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          moderation_notes?: string | null
          order_item_id?: string
          product_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["marketplace_review_status"]
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_revision_apply_context: {
        Row: {
          product_id: string
          revision_id: string
          transaction_id: number
        }
        Insert: {
          product_id: string
          revision_id: string
          transaction_id: number
        }
        Update: {
          product_id?: string
          revision_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_revision_apply_context_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_revision_apply_context_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "product_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_revisions: {
        Row: {
          approved_at: string | null
          base_snapshot: Json
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          idempotency_key: string
          image_snapshot: Json
          product_id: string
          proposed_snapshot: Json
          rejected_at: string | null
          request_hash: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          store_id: string
        }
        Insert: {
          approved_at?: string | null
          base_snapshot: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          idempotency_key: string
          image_snapshot: Json
          product_id: string
          proposed_snapshot: Json
          rejected_at?: string | null
          request_hash: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          store_id: string
        }
        Update: {
          approved_at?: string | null
          base_snapshot?: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          idempotency_key?: string
          image_snapshot?: Json
          product_id?: string
          proposed_snapshot?: Json
          rejected_at?: string | null
          request_hash?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_revisions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_revisions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          compare_at_price: number | null
          created_at: string
          currency: string
          id: string
          is_active: boolean
          is_default: boolean
          price: number
          product_id: string
          sku: string
          store_id: string
          title: string
          updated_at: string
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price: number
          product_id: string
          sku: string
          store_id: string
          title?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          compare_at_price?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          price?: number
          product_id?: string
          sku?: string
          store_id?: string
          title?: string
          updated_at?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          description?: string | null
          first_published_at?: string | null
          first_submitted_at?: string | null
          id?: string
          is_featured?: boolean
          moderation_notes?: string | null
          name: string
          product_key?: string
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          description?: string | null
          first_published_at?: string | null
          first_submitted_at?: string | null
          id?: string
          is_featured?: boolean
          moderation_notes?: string | null
          name?: string
          product_key?: string
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["marketplace_product_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
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
          app_origin: string
          auth: string
          created_at: string
          disabled_at: string | null
          endpoint: string
          endpoint_origin: string
          failure_count: number
          id: string
          is_active: boolean
          last_success_at: string | null
          p256dh: string
          profile_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          app_origin: string
          auth: string
          created_at?: string
          disabled_at?: string | null
          endpoint: string
          endpoint_origin: string
          failure_count?: number
          id?: string
          is_active?: boolean
          last_success_at?: string | null
          p256dh: string
          profile_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          app_origin?: string
          auth?: string
          created_at?: string
          disabled_at?: string | null
          endpoint?: string
          endpoint_origin?: string
          failure_count?: number
          id?: string
          is_active?: boolean
          last_success_at?: string | null
          p256dh?: string
          profile_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
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
      store_branches: {
        Row: {
          address_text: string
          area: string | null
          city: string | null
          code: string
          created_at: string
          created_by: string | null
          delivery_modes: Database["public"]["Enums"]["marketplace_delivery_mode"][]
          id: string
          is_default: boolean
          name: string
          sort_order: number
          status: Database["public"]["Enums"]["marketplace_branch_status"]
          store_id: string
          updated_at: string
          version: number
        }
        Insert: {
          address_text: string
          area?: string | null
          city?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          delivery_modes: Database["public"]["Enums"]["marketplace_delivery_mode"][]
          id?: string
          is_default?: boolean
          name: string
          sort_order?: number
          status?: Database["public"]["Enums"]["marketplace_branch_status"]
          store_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          address_text?: string
          area?: string | null
          city?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          delivery_modes?: Database["public"]["Enums"]["marketplace_delivery_mode"][]
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          status?: Database["public"]["Enums"]["marketplace_branch_status"]
          store_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_branches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_coupons: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          description: string
          discount_type: string
          discount_value: number
          display_order: number
          expires_at: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          minimum_order_amount: number | null
          place_id: string
          starts_at: string | null
          title: string
          updated_at: string
          usage_limit_text: string
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          created_by?: string | null
          description: string
          discount_type?: string
          discount_value: number
          display_order?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          minimum_order_amount?: number | null
          place_id: string
          starts_at?: string | null
          title: string
          updated_at?: string
          usage_limit_text?: string
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string
          discount_type?: string
          discount_value?: number
          display_order?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          minimum_order_amount?: number | null
          place_id?: string
          starts_at?: string | null
          title?: string
          updated_at?: string
          usage_limit_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_coupons_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
      store_delivery_zones: {
        Row: {
          created_at: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max: number | null
          estimated_minutes_min: number | null
          fee: number
          free_delivery_threshold: number | null
          is_active: boolean
          minimum_order: number
          selected_branch_id: string | null
          store_id: string
          updated_at: string
          zone_id: string
        }
        Insert: {
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max?: number | null
          estimated_minutes_min?: number | null
          fee: number
          free_delivery_threshold?: number | null
          is_active?: boolean
          minimum_order?: number
          selected_branch_id?: string | null
          store_id: string
          updated_at?: string
          zone_id: string
        }
        Update: {
          created_at?: string
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          estimated_minutes_max?: number | null
          estimated_minutes_min?: number | null
          fee?: number
          free_delivery_threshold?: number | null
          is_active?: boolean
          minimum_order?: number
          selected_branch_id?: string | null
          store_id?: string
          updated_at?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_delivery_zones_selected_branch_store_fk"
            columns: ["selected_branch_id", "store_id"]
            isOneToOne: false
            referencedRelation: "store_branches"
            referencedColumns: ["id", "store_id"]
          },
          {
            foreignKeyName: "store_delivery_zones_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_delivery_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      store_images: {
        Row: {
          alt_text: string | null
          created_at: string
          kind: string
          media_asset_id: string
          position: number
          store_id: string
          updated_at: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          kind?: string
          media_asset_id: string
          position: number
          store_id: string
          updated_at?: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          kind?: string
          media_asset_id?: string
          position?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_images_media_asset_id_fkey"
            columns: ["media_asset_id"]
            isOneToOne: true
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_images_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_memberships: {
        Row: {
          created_at: string
          invited_by: string | null
          is_active: boolean
          role: Database["public"]["Enums"]["marketplace_membership_role"]
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          role: Database["public"]["Enums"]["marketplace_membership_role"]
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          is_active?: boolean
          role?: Database["public"]["Enums"]["marketplace_membership_role"]
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_memberships_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_revision_apply_context: {
        Row: {
          revision_id: string
          store_id: string
          transaction_id: number
        }
        Insert: {
          revision_id: string
          store_id: string
          transaction_id: number
        }
        Update: {
          revision_id?: string
          store_id?: string
          transaction_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_revision_apply_context_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "store_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_revision_apply_context_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_revisions: {
        Row: {
          approved_at: string | null
          base_snapshot: Json
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          idempotency_key: string
          image_snapshot: Json
          merchant_id: string
          proposed_snapshot: Json
          rejected_at: string | null
          request_hash: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          store_id: string
        }
        Insert: {
          approved_at?: string | null
          base_snapshot: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          idempotency_key: string
          image_snapshot: Json
          merchant_id: string
          proposed_snapshot: Json
          rejected_at?: string | null
          request_hash: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          store_id: string
        }
        Update: {
          approved_at?: string | null
          base_snapshot?: Json
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          id?: string
          idempotency_key?: string
          image_snapshot?: Json
          merchant_id?: string
          proposed_snapshot?: Json
          rejected_at?: string | null
          request_hash?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name_snapshot?: string | null
          status?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_revisions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_revisions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        Insert: {
          address_text?: string | null
          area?: string | null
          city?: string | null
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description?: string | null
          first_published_at?: string | null
          first_submitted_at?: string | null
          id?: string
          merchant_id: string
          moderation_notes?: string | null
          name: string
          short_description?: string | null
          slug: string
          status?: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at?: string
        }
        Update: {
          address_text?: string | null
          area?: string | null
          city?: string | null
          commission_rate?: number
          created_at?: string
          created_by?: string | null
          created_by_name_snapshot?: string | null
          currency?: string
          delivery_mode?: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description?: string | null
          first_published_at?: string | null
          first_submitted_at?: string | null
          id?: string
          merchant_id?: string
          moderation_notes?: string | null
          name?: string
          short_description?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          revision: number
          sender_kind: string
          sender_user_id: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          revision?: number
          sender_kind: string
          sender_user_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          revision?: number
          sender_kind?: string
          sender_user_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_thread_reads: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "support_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      support_threads: {
        Row: {
          assigned_admin_id: string | null
          created_at: string
          created_by_user_id: string | null
          customer_id: string | null
          id: string
          last_message_at: string
          order_id: string | null
          public_code: string
          resolved_at: string | null
          retention_redacted_at: string | null
          status: Database["public"]["Enums"]["marketplace_support_status"]
          store_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_admin_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string
          order_id?: string | null
          public_code?: string
          resolved_at?: string | null
          retention_redacted_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_support_status"]
          store_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_admin_id?: string | null
          created_at?: string
          created_by_user_id?: string | null
          customer_id?: string | null
          id?: string
          last_message_at?: string
          order_id?: string | null
          public_code?: string
          resolved_at?: string | null
          retention_redacted_at?: string | null
          status?: Database["public"]["Enums"]["marketplace_support_status"]
          store_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_threads_assigned_admin_id_fkey"
            columns: ["assigned_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "marketplace_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_threads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_sessions: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          expected_content_type: string
          expected_sha256: string
          expected_size_bytes: number
          expires_at: string
          failure_code: string | null
          finalize_idempotency_key: string | null
          finalized_asset_id: string | null
          id: string
          merchant_id: string
          metadata: Json
          owner_id: string | null
          owner_name_snapshot: string | null
          slot: string
          staging_key: string
          status: Database["public"]["Enums"]["marketplace_upload_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          expected_content_type: string
          expected_sha256: string
          expected_size_bytes: number
          expires_at?: string
          failure_code?: string | null
          finalize_idempotency_key?: string | null
          finalized_asset_id?: string | null
          id?: string
          merchant_id: string
          metadata?: Json
          owner_id?: string | null
          owner_name_snapshot?: string | null
          slot?: string
          staging_key: string
          status?: Database["public"]["Enums"]["marketplace_upload_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["marketplace_media_entity"]
          expected_content_type?: string
          expected_sha256?: string
          expected_size_bytes?: number
          expires_at?: string
          failure_code?: string | null
          finalize_idempotency_key?: string | null
          finalized_asset_id?: string | null
          id?: string
          merchant_id?: string
          metadata?: Json
          owner_id?: string | null
          owner_name_snapshot?: string | null
          slot?: string
          staging_key?: string
          status?: Database["public"]["Enums"]["marketplace_upload_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_sessions_asset_fk"
            columns: ["finalized_asset_id"]
            isOneToOne: false
            referencedRelation: "media_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upload_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      block_my_marketplace_chat_counterparty: {
        Args: {
          p_blocked: boolean
          p_counterparty_id: string
          p_thread_id: string
        }
        Returns: Json
      }
      delete_my_marketplace_chat_message: {
        Args: { p_message_id: string }
        Returns: Json
      }
      get_my_marketplace_conversation_page: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_limit?: number
          p_thread_id: string
        }
        Returns: Json
      }
      list_my_marketplace_conversations: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_kind?: string | null
          p_limit?: number
        }
        Returns: Json
      }
      open_my_marketplace_conversation: {
        Args: {
          p_kind: string
          p_order_id: string | null
          p_store_id: string | null
        }
        Returns: Json
      }
      react_to_my_marketplace_chat_message: {
        Args: { p_active: boolean; p_emoji: string; p_message_id: string }
        Returns: Json
      }
      search_my_marketplace_chat_messages: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_limit?: number
          p_query: string
          p_thread_id: string
        }
        Returns: Json
      }
      send_my_marketplace_chat_message: {
        Args: {
          p_body: string | null
          p_card_data: Json | null
          p_client_message_id: string
          p_kind: string
          p_reply_to_id: string | null
          p_thread_id: string
        }
        Returns: Json
      }
      set_my_marketplace_chat_preferences: {
        Args: { p_muted_until: string | null; p_thread_id: string }
        Returns: Json
      }
      set_my_marketplace_chat_read_cursor: {
        Args: { p_message_id: string; p_thread_id: string }
        Returns: Json
      }
      activate_marketplace_admin_capability: {
        Args: {
          p_roles: Database["public"]["Enums"]["marketplace_admin_role"][]
        }
        Returns: undefined
      }
      add_marketplace_cart_item: {
        Args: {
          p_cart_id: string
          p_customer_id?: string
          p_guest_token?: string
          p_quantity: number
          p_variant_id: string
        }
        Returns: Json
      }
      add_my_marketplace_cart_item: {
        Args: { p_cart_id: string; p_quantity: number; p_variant_id: string }
        Returns: Json
      }
      admin_repair_driver_account: {
        Args: { p_is_active?: boolean; p_profile_id: string }
        Returns: boolean
      }
      admin_update_managed_driver: {
        Args: {
          p_contact_phone?: string
          p_driver_id: string
          p_is_active?: boolean
          p_name?: string
          p_source: string
          p_vehicle_type?: string
          p_whatsapp?: string
        }
        Returns: undefined
      }
      apply_feedback_to_place: {
        Args: { p_feedback_id: string; p_image_mode?: string }
        Returns: string
      }
      apply_marketplace_cart_coupon: {
        Args: {
          p_cart_id: string
          p_code: string
          p_customer_id?: string
          p_guest_token?: string
        }
        Returns: Json
      }
      apply_my_catalog_import: {
        Args: { p_expected_updated_at: string; p_job_id: string }
        Returns: Json
      }
      apply_my_marketplace_cart_coupon: {
        Args: { p_cart_id: string; p_code: string }
        Returns: Json
      }
      apply_product_rating_delta: {
        Args: {
          p_count_delta: number
          p_product_id: string
          p_rating_1_delta: number
          p_rating_2_delta: number
          p_rating_3_delta: number
          p_rating_4_delta: number
          p_rating_5_delta: number
          p_sum_delta: number
        }
        Returns: undefined
      }
      approve_account_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      approve_pending_place: { Args: { p_request_id: string }; Returns: string }
      archive_my_marketplace_product: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_product_id: string
        }
        Returns: Json
      }
      assign_marketplace_delivery_driver: {
        Args: { p_actor_id: string; p_driver_id: string; p_order_id: string }
        Returns: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_asset_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_delivery_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_marketplace_delivery_driver_as_caller: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_asset_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_delivery_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_marketplace_delivery_driver_as_caller_base_174408: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_asset_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_delivery_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      assign_marketplace_delivery_driver_as_caller_base_180000: {
        Args: { p_driver_id: string; p_order_id: string }
        Returns: {
          assigned_at: string | null
          created_at: string
          delivered_at: string | null
          driver_id: string | null
          driver_name_snapshot: string | null
          id: string
          notes: string | null
          order_id: string
          picked_up_at: string | null
          proof_asset_id: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_delivery_assignments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      attach_marketplace_delivery_proof: {
        Args: { p_actor_id: string; p_asset_id: string; p_order_id: string }
        Returns: Json
      }
      attach_my_marketplace_delivery_proof: {
        Args: { p_asset_id: string; p_order_id: string }
        Returns: Json
      }
      attach_my_marketplace_delivery_proof_base_174408: {
        Args: { p_asset_id: string; p_order_id: string }
        Returns: Json
      }
      authorize_my_private_marketplace_media: {
        Args: { p_asset_id: string }
        Returns: Json
      }
      authorize_my_private_marketplace_media_base_174408: {
        Args: { p_asset_id: string }
        Returns: Json
      }
      begin_legacy_media_backfill: {
        Args: { p_run_id: string; p_source_origin: string }
        Returns: {
          completed_count: number
          created_at: string
          dead_letter_count: number
          discovered_count: number
          driver_checkpoint: string | null
          drivers_discovery_complete: boolean
          finished_at: string | null
          id: string
          place_checkpoint: string | null
          places_discovery_complete: boolean
          source_origin: string
          stale_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "legacy_media_backfill_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      begin_my_catalog_import: {
        Args: {
          p_file_id: string
          p_idempotency_key: string
          p_plan: Json
          p_source_filename: string
          p_store_id: string
        }
        Returns: Json
      }
      can_access_marketplace_support_thread: {
        Args: { p_thread_id: string }
        Returns: boolean
      }
      can_catalog_store: { Args: { p_store_id: string }; Returns: boolean }
      can_fulfill_store: { Args: { p_store_id: string }; Returns: boolean }
      can_manage_merchant: { Args: { p_merchant_id: string }; Returns: boolean }
      can_manage_store: { Args: { p_store_id: string }; Returns: boolean }
      can_read_marketplace_order: {
        Args: { p_customer_id: string; p_order_id: string; p_store_id: string }
        Returns: boolean
      }
      catalog_image_worker_configured: { Args: never; Returns: boolean }
      catalog_live_image_snapshot: {
        Args: { p_product_id: string }
        Returns: Json
      }
      catalog_sensitive_snapshot: {
        Args: { p_product: Database["public"]["Tables"]["products"]["Row"] }
        Returns: Json
      }
      checkout_marketplace_cart: {
        Args: {
          p_address_id: string
          p_cart_id: string
          p_customer_id: string
          p_delivery_modes?: Json
          p_delivery_notes?: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      checkout_marketplace_cart_base_180715: {
        Args: {
          p_address_id: string
          p_cart_id: string
          p_customer_id: string
          p_delivery_modes?: Json
          p_delivery_notes?: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      checkout_my_marketplace_cart: {
        Args: {
          p_address_id: string
          p_cart_id: string
          p_delivery_modes?: Json
          p_delivery_notes?: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      checkpoint_legacy_media_backfill_discovery: {
        Args: {
          p_checkpoint: string
          p_complete?: boolean
          p_run_id: string
          p_stream: string
        }
        Returns: undefined
      }
      claim_catalog_import_image_jobs: {
        Args: { p_lease_seconds?: number; p_limit: number; p_worker_id: string }
        Returns: Json
      }
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
      claim_guest_cart: {
        Args: { p_cart_id: string; p_guest_token: string }
        Returns: string
      }
      claim_legacy_media_backfill_items: {
        Args: { p_lease_seconds?: number; p_limit?: number; p_run_id: string }
        Returns: {
          attempt: number
          entity_id: string
          image_ordinal: number
          item_id: number
          lease_token: string
          source_bucket: string
          source_object_key: string
          source_url: string
          target_kind: string
        }[]
      }
      claim_marketplace_outbox: {
        Args: { p_limit: number; p_topics: string[]; p_worker_id: string }
        Returns: {
          attempts: number
          id: number
          payload: Json
          topic: string
        }[]
      }
      claim_marketplace_push_jobs: {
        Args: { p_limit: number; p_worker_id: string }
        Returns: {
          attempts: number
          auth: string
          endpoint: string
          href: string
          id: number
          notification_type: string
          p256dh: string
        }[]
      }
      claim_my_guest_marketplace_cart: {
        Args: { p_cart_id: string; p_guest_token: string }
        Returns: string
      }
      claim_my_legacy_place_media: {
        Args: {
          p_place_id: string
          p_retained_urls?: string[]
          p_upload_ids: string[]
        }
        Returns: {
          public_url: string
          upload_id: string
        }[]
      }
      close_my_marketplace_support_thread: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      close_my_marketplace_support_thread_base_180000: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      complete_catalog_import_image_job: {
        Args: {
          p_bucket: string
          p_byte_size: number
          p_height: number
          p_object_key: string
          p_public_url: string
          p_row_id: number
          p_sha256: string
          p_width: number
          p_worker_id: string
        }
        Returns: Json
      }
      complete_catalog_import_image_job_base_76000: {
        Args: {
          p_bucket: string
          p_byte_size: number
          p_height: number
          p_object_key: string
          p_public_url: string
          p_row_id: number
          p_sha256: string
          p_width: number
          p_worker_id: string
        }
        Returns: Json
      }
      complete_legacy_media_backfill_item: {
        Args: {
          p_item_id: number
          p_lease_token: string
          p_output_bucket: string
          p_output_height: number
          p_output_object_key: string
          p_output_public_url: string
          p_output_sha256: string
          p_output_size_bytes: number
          p_output_width: number
          p_source_sha256: string
        }
        Returns: string
      }
      complete_marketplace_outbox: {
        Args: { p_id: number; p_worker_id: string }
        Returns: boolean
      }
      complete_marketplace_push_job: {
        Args: { p_id: number; p_worker_id: string }
        Returns: boolean
      }
      configure_marketplace_worker_vault: {
        Args: { p_base_url: string; p_cron_secret: string }
        Returns: boolean
      }
      consume_account_request_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      consume_listing_upload_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      consume_my_marketplace_rate_limit: {
        Args: { p_action: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      consume_public_submission_rate_limit: {
        Args: { p_limit?: number; p_request_key: string }
        Returns: boolean
      }
      count_marketplace_sitemap_products: { Args: never; Returns: number }
      count_my_unread_marketplace_notifications: {
        Args: never
        Returns: number
      }
      create_cash_reconciliation_batch: {
        Args: {
          p_actor_id: string
          p_collection_ids: string[]
          p_driver_id: string
          p_idempotency_key: string
          p_submitted_amounts_piastres: number[]
        }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
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
      create_my_cash_reconciliation_batch: {
        Args: {
          p_collection_ids: string[]
          p_idempotency_key: string
          p_submitted_amounts_piastres: number[]
        }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_my_catalog_import_file: {
        Args: {
          p_bucket: string
          p_byte_size: number
          p_file_id: string
          p_object_key: string
          p_sha256: string
          p_store_id: string
        }
        Returns: Json
      }
      create_my_delivery_proof_upload_session: {
        Args: {
          p_expected_content_type: string
          p_expected_sha256: string
          p_expected_size_bytes: number
          p_order_id: string
          p_session_id: string
          p_staging_key: string
        }
        Returns: Json
      }
      create_my_marketplace_product: {
        Args: {
          p_idempotency_key: string
          p_product: Json
          p_store_id: string
          p_variants: Json
        }
        Returns: Json
      }
      create_my_marketplace_return_request: {
        Args: {
          p_idempotency_key: string
          p_items: Json
          p_order_id: string
          p_reason_code: string
          p_reason_details: string
        }
        Returns: Json
      }
      create_my_marketplace_store: {
        Args: {
          p_address_text: string
          p_area: string
          p_city: string
          p_description: string
          p_idempotency_key: string
          p_merchant_id: string
          p_name: string
          p_short_description: string
          p_slug: string
        }
        Returns: Json
      }
      create_my_marketplace_support_thread: {
        Args: {
          p_message: string
          p_order_id: string | null
          p_store_id: string | null
          p_subject: string
        }
        Returns: Json
      }
      create_my_marketplace_support_thread_base_180000: {
        Args: {
          p_message: string
          p_order_id: string | null
          p_store_id: string | null
          p_subject: string
        }
        Returns: Json
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
      current_profile_is_marketplace_admin: { Args: never; Returns: boolean }
      deactivate_marketplace_coupon_for_scope: {
        Args: {
          p_admin_scope: boolean
          p_coupon_id: string
          p_expected_updated_at: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      deactivate_my_marketplace_coupon: {
        Args: {
          p_coupon_id: string
          p_expected_updated_at: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      deactivate_platform_marketplace_coupon_as_admin: {
        Args: {
          p_coupon_id: string
          p_expected_updated_at: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      deactivate_platform_marketplace_coupon_as_admin_base_180000: {
        Args: {
          p_coupon_id: string
          p_expected_updated_at: string
          p_idempotency_key: string
        }
        Returns: Json
      }
      delete_marketplace_media: {
        Args: {
          p_actor_id: string
          p_asset_id: string
          p_expected_asset_updated_at: string
        }
        Returns: Json
      }
      delete_my_marketplace_address: {
        Args: { p_address_id: string }
        Returns: boolean
      }
      delete_my_marketplace_media: {
        Args: { p_asset_id: string; p_expected_asset_updated_at: string }
        Returns: Json
      }
      delete_my_marketplace_media_base_174408: {
        Args: { p_asset_id: string; p_expected_asset_updated_at: string }
        Returns: Json
      }
      delete_my_marketplace_media_base_175652: {
        Args: { p_asset_id: string; p_expected_asset_updated_at: string }
        Returns: Json
      }
      delete_my_marketplace_media_base_83000: {
        Args: { p_asset_id: string; p_expected_asset_updated_at: string }
        Returns: Json
      }
      delete_my_store_branch: {
        Args: {
          p_branch_id: string
          p_expected_version: number
          p_idempotency_key: string
          p_store_id: string
        }
        Returns: Json
      }
      discard_my_catalog_import_file: {
        Args: { p_file_id: string; p_reason?: string }
        Returns: Json
      }
      emit_marketplace_notification: {
        Args: {
          p_body: string
          p_event_key: string
          p_href: string
          p_recipient_id: string
          p_title: string
          p_type: string
        }
        Returns: string
      }
      enqueue_legacy_media_backfill_items: {
        Args: { p_items: Json; p_run_id: string }
        Returns: number
      }
      ensure_marketplace_customer: {
        Args: never
        Returns: {
          anonymized_at: string | null
          auth_user_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          email_verified_at: string | null
          id: string
          is_active: boolean
          locale: string
          phone: string | null
          phone_verified_at: string | null
          primary_provider: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "marketplace_customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expire_delivery_offers: { Args: never; Returns: number }
      expire_legacy_media_uploads: {
        Args: { p_limit?: number }
        Returns: number
      }
      export_my_marketplace_catalog: {
        Args: { p_limit?: number; p_offset?: number; p_store_id: string }
        Returns: Json
      }
      fail_catalog_import_image_job: {
        Args: {
          p_error: string
          p_retryable?: boolean
          p_row_id: number
          p_worker_id: string
        }
        Returns: Json
      }
      fail_legacy_media_backfill_item: {
        Args: {
          p_failure_code: string
          p_item_id: number
          p_lease_token: string
          p_retryable?: boolean
        }
        Returns: string
      }
      fail_marketplace_outbox: {
        Args: {
          p_error: string
          p_id: number
          p_retry_at: string
          p_worker_id: string
        }
        Returns: Json
      }
      fail_marketplace_push_job: {
        Args: { p_failure_code: string; p_id: number; p_worker_id: string }
        Returns: boolean
      }
      fail_my_catalog_import: {
        Args: { p_error_code: string; p_issues?: Json; p_job_id: string }
        Returns: Json
      }
      finalize_media_upload: {
        Args: {
          p_asset_id: string
          p_bucket: string
          p_byte_size: number
          p_content_type: string
          p_height: number
          p_idempotency_key: string
          p_object_key: string
          p_public_url: string
          p_session_id: string
          p_sha256: string
          p_width: number
        }
        Returns: {
          asset_id: string
          idempotent: boolean
          position: number
          public_url: string
        }[]
      }
      finalize_my_catalog_import: {
        Args: { p_image_results: Json; p_job_id: string; p_result?: Json }
        Returns: Json
      }
      finish_legacy_media_backfill: {
        Args: { p_run_id: string }
        Returns: {
          completed_count: number
          created_at: string
          dead_letter_count: number
          discovered_count: number
          driver_checkpoint: string | null
          drivers_discovery_complete: boolean
          finished_at: string | null
          id: string
          place_checkpoint: string | null
          places_discovery_complete: boolean
          source_origin: string
          stale_count: number
          started_at: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "legacy_media_backfill_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_commission_statement: {
        Args: {
          p_actor_id?: string
          p_period_start: string
          p_store_id: string
        }
        Returns: {
          commission_due: number
          commission_rate: number
          created_at: string
          gross_merchandise_value: number
          id: string
          issued_at: string | null
          manual_adjustment: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["marketplace_statement_status"]
          store_id: string
          total_due: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "commission_statements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      generate_my_commission_statement: {
        Args: { p_period_start: string; p_store_id: string }
        Returns: {
          commission_due: number
          commission_rate: number
          created_at: string
          gross_merchandise_value: number
          id: string
          issued_at: string | null
          manual_adjustment: number
          notes: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["marketplace_statement_status"]
          store_id: string
          total_due: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "commission_statements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_admin_metrics: {
        Args: never
        Returns: {
          active_drivers: number
          pending_additions: number
          pending_feedbacks: number
          total_places: number
        }[]
      }
      get_delivery_order_private: {
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
      get_marketplace_cart: {
        Args: {
          p_cart_id: string
          p_customer_id?: string
          p_guest_token?: string
        }
        Returns: Json
      }
      get_marketplace_product: { Args: { p_product_id: string }; Returns: Json }
      get_my_cash_reconciliation: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      get_my_cash_reconciliation_base_180000: {
        Args: { p_batch_id: string }
        Returns: Json
      }
      get_my_catalog_import: { Args: { p_job_id: string }; Returns: Json }
      get_my_commission_statement: {
        Args: { p_statement_id: string }
        Returns: Json
      }
      get_my_commission_statement_base_180000: {
        Args: { p_statement_id: string }
        Returns: Json
      }
      get_my_marketplace_admin_roles: { Args: never; Returns: Json }
      get_my_marketplace_cart: { Args: { p_cart_id: string }; Returns: Json }
      get_my_marketplace_order: { Args: { p_order_id: string }; Returns: Json }
      get_my_marketplace_order_base_175213: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_my_marketplace_order_base_180000: {
        Args: { p_order_id: string }
        Returns: Json
      }
      get_my_marketplace_order_group: {
        Args: { p_order_group_id: string }
        Returns: Json
      }
      get_my_marketplace_product: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_my_marketplace_product_base_76000: {
        Args: { p_product_id: string }
        Returns: Json
      }
      get_my_marketplace_store_media: {
        Args: { p_store_id: string }
        Returns: Json
      }
      get_my_marketplace_support_thread: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      get_my_marketplace_support_thread_base_180000: {
        Args: { p_thread_id: string }
        Returns: Json
      }
      get_my_marketplace_support_thread_page: {
        Args: {
          p_before_created_at?: string | null
          p_before_id?: string | null
          p_limit?: number
          p_thread_id: string
        }
        Returns: Json
      }
      get_or_create_customer_cart: {
        Args: { p_customer_id: string }
        Returns: string
      }
      get_or_create_guest_cart: {
        Args: { p_guest_token: string }
        Returns: string
      }
      get_or_create_my_marketplace_cart: { Args: never; Returns: string }
      get_private_marketplace_media_locator: {
        Args: { p_actor_id: string; p_asset_id: string }
        Returns: Json
      }
      has_marketplace_admin_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["marketplace_admin_role"][]
        }
        Returns: boolean
      }
      has_marketplace_store_role_without_admin: {
        Args: { p_actor_id: string; p_roles: string[]; p_store_id: string }
        Returns: boolean
      }
      invoke_catalog_image_worker: { Args: never; Returns: number }
      invoke_marketplace_push_worker: { Args: never; Returns: number }
      is_admin: { Args: never; Returns: boolean }
      is_current_active_driver: { Args: never; Returns: boolean }
      is_current_merchant_for: {
        Args: { p_merchant_id: string }
        Returns: boolean
      }
      is_marketplace_admin: { Args: never; Returns: boolean }
      list_all_commission_statements_as_admin: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_all_commission_statements_as_admin_base_180000: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_available_delivery_drivers: {
        Args: never
        Returns: {
          active_until: string
          avatar_url: string
          display_name: string
          id: string
          vehicle_type: string
        }[]
      }
      list_driver_delivery_offers: {
        Args: { p_limit?: number }
        Returns: {
          assigned_at: string
          assigned_driver_id: string
          branch_id: string
          collection_amount: number
          created_at: string
          delivered_at: string
          delivery_address: string
          delivery_area: string
          delivery_fee: number
          expires_at: string
          id: string
          merchant_id: string
          notes: string
          picked_up_at: string
          public_code: string
          recipient_name: string
          recipient_phone: string
          status: Database["public"]["Enums"]["delivery_order_status"]
          updated_at: string
        }[]
      }
      list_marketplace_admin_memberships: { Args: never; Returns: Json }
      list_marketplace_catalog: {
        Args: {
          p_category_slug?: string
          p_page?: number
          p_page_size?: number
          p_query?: string
          p_sort?: string
        }
        Returns: Json
      }
      list_marketplace_catalog_v2: {
        Args: {
          p_category_slug?: string
          p_cursor?: Json
          p_in_stock?: boolean
          p_limit?: number
          p_max_price?: number
          p_min_price?: number
          p_min_rating?: number
          p_query?: string
          p_sort?: string
          p_store_slug?: string
        }
        Returns: Json
      }
      list_marketplace_delivery_zones_for_admin: { Args: never; Returns: Json }
      list_marketplace_delivery_zones_for_admin_base_180000: {
        Args: never
        Returns: Json
      }
      list_marketplace_sitemap_products: {
        Args: { p_page?: number; p_page_size?: number }
        Returns: {
          id: string
          slug: string
          updated_at: string
        }[]
      }
      list_merchant_delivery_orders: {
        Args: { p_limit?: number }
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
        }[]
        SetofOptions: {
          from: "*"
          to: "delivery_orders"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      list_my_cash_reconciliations: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_my_cash_reconciliations_base_180000: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_my_cod_collections: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_my_cod_collections_base_180000: {
        Args: { p_before?: string; p_limit?: number; p_status?: string }
        Returns: Json
      }
      list_my_commission_statements: {
        Args: { p_limit?: number; p_offset?: number; p_store_id: string }
        Returns: Json
      }
      list_my_manageable_merchants: { Args: never; Returns: Json }
      list_my_marketplace_coupons: {
        Args: { p_store_id: string }
        Returns: Json
      }
      list_my_marketplace_delivery_offers: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      list_my_marketplace_media_deletion_intents: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
        }
        Returns: Json
      }
      list_my_marketplace_notifications: {
        Args: {
          p_before_created_at?: string
          p_before_id?: string
          p_limit?: number
        }
        Returns: Json
      }
      list_my_marketplace_orders: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      list_my_marketplace_orders_base_180000: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      list_my_marketplace_products: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
          p_stock?: string
          p_store_id: string
        }
        Returns: Json
      }
      list_my_marketplace_return_requests: {
        Args: { p_before?: string; p_limit?: number; p_order_id: string }
        Returns: Json
      }
      list_my_marketplace_return_requests_base_180000: {
        Args: { p_before?: string; p_limit?: number; p_order_id: string }
        Returns: Json
      }
      list_my_marketplace_stores: { Args: never; Returns: Json }
      list_my_marketplace_support_threads: {
        Args: { p_before?: string | null; p_limit?: number; p_status?: string | null }
        Returns: Json
      }
      list_my_marketplace_support_threads_base_180000: {
        Args: { p_before?: string | null; p_limit?: number; p_status?: string | null }
        Returns: Json
      }
      list_my_store_branches: { Args: { p_store_id: string }; Returns: Json }
      list_my_store_delivery_configuration: {
        Args: { p_store_id: string }
        Returns: Json
      }
      list_pending_marketplace_moderation: {
        Args: { p_before?: string; p_entity?: string; p_limit?: number }
        Returns: Json
      }
      list_pending_marketplace_moderation_base_180000: {
        Args: { p_before?: string; p_entity?: string; p_limit?: number }
        Returns: Json
      }
      list_pending_product_category_proposals: {
        Args: { p_limit?: number }
        Returns: Json
      }
      list_platform_marketplace_coupons_as_admin: { Args: never; Returns: Json }
      list_platform_marketplace_coupons_as_admin_base_180000: {
        Args: never
        Returns: Json
      }
      list_public_driver_summaries: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          name: string
          vehicle_type: string
        }[]
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
          avatar_url: string
          created_at: string
          id: string
          is_available: boolean
          name: string
          phone: string
          vehicle_type: string
          whatsapp: string
        }[]
      }
      mark_all_my_marketplace_notifications_read: {
        Args: never
        Returns: number
      }
      mark_my_marketplace_notification_read: {
        Args: { p_notification_id: string }
        Returns: boolean
      }
      marketplace_cart_is_owned: {
        Args: {
          p_cart_id: string
          p_customer_id: string
          p_guest_token: string
        }
        Returns: boolean
      }
      marketplace_operational_replay: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_operation: string
          p_request_hash: string
        }
        Returns: {
          replayed: boolean
          response: Json
        }[]
      }
      marketplace_push_endpoint_allowed: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      marketplace_record_operational_mutation: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_operation: string
          p_request_hash: string
          p_response: Json
        }
        Returns: undefined
      }
      marketplace_release_ready: { Args: never; Returns: boolean }
      moderate_product: {
        Args: {
          p_admin_id: string
          p_approve: boolean
          p_notes: string
          p_product_id: string
        }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_product_as_admin: {
        Args: { p_approve: boolean; p_notes?: string; p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_product_as_admin_base_174408: {
        Args: { p_approve: boolean; p_notes?: string; p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_product_as_admin_base_180000: {
        Args: { p_approve: boolean; p_notes?: string; p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_product_revision: {
        Args: {
          p_actor_id: string
          p_approve: boolean
          p_notes: string
          p_revision_id: string
        }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_store: {
        Args: {
          p_admin_id: string
          p_approve: boolean
          p_notes: string
          p_store_id: string
        }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_store_as_admin: {
        Args: { p_approve: boolean; p_notes?: string; p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_store_as_admin_base_174408: {
        Args: { p_approve: boolean; p_notes?: string; p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_store_as_admin_base_180000: {
        Args: { p_approve: boolean; p_notes?: string; p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      moderate_store_revision: {
        Args: {
          p_actor_id: string
          p_approve: boolean
          p_notes: string
          p_revision_id: string
        }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mutate_marketplace_cart_item: {
        Args: {
          p_cart_id: string
          p_customer_id: string
          p_guest_token: string
          p_operation: string
          p_quantity: number
          p_variant_id: string
        }
        Returns: Json
      }
      normalize_marketplace_arabic_search: {
        Args: { p_value: string }
        Returns: string
      }
      normalize_marketplace_category_text: {
        Args: { p_value: string }
        Returns: string
      }
      notify_marketplace_admins: {
        Args: {
          p_body: string
          p_event_key: string
          p_exclude?: string
          p_href: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      notify_marketplace_store_members: {
        Args: {
          p_body: string
          p_event_key: string
          p_exclude?: string
          p_href: string
          p_store_id: string
          p_title: string
          p_type: string
        }
        Returns: number
      }
      offer_marketplace_delivery_to_driver_as_caller: {
        Args: {
          p_driver_id: string
          p_expires_minutes?: number
          p_order_id: string
        }
        Returns: Json
      }
      offer_marketplace_delivery_to_driver_as_caller_base_180000: {
        Args: {
          p_driver_id: string
          p_expires_minutes?: number
          p_order_id: string
        }
        Returns: Json
      }
      preview_marketplace_checkout: {
        Args: { p_cart_id: string; p_customer_id: string }
        Returns: Json
      }
      preview_my_marketplace_checkout: {
        Args: { p_cart_id: string }
        Returns: Json
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
      receive_my_marketplace_return_request: {
        Args: {
          p_idempotency_key: string
          p_notes: string
          p_restock_items: Json
          p_return_request_id: string
        }
        Returns: Json
      }
      receive_my_marketplace_return_request_base_180000: {
        Args: {
          p_idempotency_key: string
          p_notes: string
          p_restock_items: Json
          p_return_request_id: string
        }
        Returns: Json
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
      record_client_error_v2: {
        Args: {
          p_browser_family: string
          p_error_kind: string
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
      record_my_product_category_classification: {
        Args: {
          p_algorithm_version: string
          p_confidence: number
          p_idempotency_key: string
          p_predicted_category_id: string
          p_product_id: string
          p_proposed_name?: string
          p_selected_category_id: string
          p_signals: Json
        }
        Returns: Json
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
      register_my_push_subscription: {
        Args: {
          p_app_origin: string
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: string
      }
      reject_account_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: string
      }
      release_legacy_media_source_deletions: {
        Args: { p_before?: string; p_limit?: number }
        Returns: number
      }
      remove_marketplace_cart_coupon: {
        Args: {
          p_cart_id: string
          p_customer_id?: string
          p_guest_token?: string
        }
        Returns: boolean
      }
      remove_marketplace_cart_item: {
        Args: {
          p_cart_id: string
          p_customer_id?: string
          p_guest_token?: string
          p_variant_id: string
        }
        Returns: Json
      }
      remove_my_marketplace_cart_coupon: {
        Args: { p_cart_id: string }
        Returns: boolean
      }
      remove_my_marketplace_cart_item: {
        Args: { p_cart_id: string; p_variant_id: string }
        Returns: Json
      }
      renew_driver_availability: {
        Args: never
        Returns: {
          active_until: string | null
          avatar_path: string | null
          avatar_url: string | null
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
      reorder_marketplace_media: {
        Args: {
          p_actor_id: string
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          p_expected_entity_updated_at: string
          p_ordered_asset_ids: string[]
          p_store_id: string
        }
        Returns: Json
      }
      reorder_my_marketplace_media: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          p_expected_entity_updated_at: string
          p_ordered_asset_ids: string[]
          p_store_id: string
        }
        Returns: Json
      }
      reorder_my_marketplace_media_base_174408: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          p_expected_entity_updated_at: string
          p_ordered_asset_ids: string[]
          p_store_id: string
        }
        Returns: Json
      }
      reorder_my_marketplace_media_base_83000: {
        Args: {
          p_entity_id: string
          p_entity_type: Database["public"]["Enums"]["marketplace_media_entity"]
          p_expected_entity_updated_at: string
          p_ordered_asset_ids: string[]
          p_store_id: string
        }
        Returns: Json
      }
      replace_my_driver_avatar_media: {
        Args: { p_upload_id: string }
        Returns: {
          avatar_path: string
          avatar_url: string
        }[]
      }
      reply_my_marketplace_support_thread: {
        Args: { p_body: string; p_thread_id: string }
        Returns: Json
      }
      reply_my_marketplace_support_thread_base_180000: {
        Args: { p_body: string; p_thread_id: string }
        Returns: Json
      }
      require_marketplace_admin_fallback: {
        Args: { p_non_admin_authorized: boolean }
        Returns: undefined
      }
      respond_to_my_marketplace_delivery_offer: {
        Args: { p_accept: boolean; p_offer_id: string }
        Returns: Json
      }
      review_cash_reconciliation_batch: {
        Args: {
          p_accept: boolean
          p_actor_id: string
          p_batch_id: string
          p_notes?: string
        }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_cash_reconciliation_batch_as_admin: {
        Args: { p_accept: boolean; p_batch_id: string; p_notes?: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_cash_reconciliation_batch_as_admin_base_174408: {
        Args: { p_accept: boolean; p_batch_id: string; p_notes?: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_cash_reconciliation_batch_as_admin_base_180000: {
        Args: { p_accept: boolean; p_batch_id: string; p_notes?: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      review_my_marketplace_return_request: {
        Args: {
          p_approve: boolean
          p_idempotency_key: string
          p_notes: string
          p_return_request_id: string
        }
        Returns: Json
      }
      review_my_marketplace_return_request_base_180000: {
        Args: {
          p_approve: boolean
          p_idempotency_key: string
          p_notes: string
          p_return_request_id: string
        }
        Returns: Json
      }
      review_product_category_proposal_as_admin: {
        Args: {
          p_decision: string
          p_new_name_en?: string
          p_new_slug?: string
          p_note?: string
          p_proposal_id: string
          p_resolved_category_id?: string
        }
        Returns: Json
      }
      run_marketplace_maintenance: {
        Args: { p_batch_size?: number }
        Returns: Json
      }
      run_marketplace_notification_maintenance: { Args: never; Returns: Json }
      save_marketplace_admin_membership: {
        Args: {
          p_expected_version: number
          p_idempotency_key: string
          p_is_active: boolean
          p_roles: Database["public"]["Enums"]["marketplace_admin_role"][]
          p_user_id: string
        }
        Returns: Json
      }
      save_marketplace_coupon_for_scope: {
        Args: {
          p_admin_scope: boolean
          p_code: string
          p_coupon_id: string
          p_discount_amount_piastres: number
          p_discount_percent: number
          p_discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          p_expected_updated_at: string
          p_expires_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_max_discount_piastres: number
          p_minimum_order_piastres: number
          p_per_customer_limit: number
          p_starts_at: string
          p_store_id: string
          p_title: string
          p_total_limit: number
        }
        Returns: Json
      }
      save_marketplace_delivery_zone_as_admin: {
        Args: {
          p_city: string
          p_code: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_name_ar: string
          p_name_en: string
          p_sort_order: number
          p_zone_id: string
        }
        Returns: Json
      }
      save_marketplace_delivery_zone_as_admin_base_180000: {
        Args: {
          p_city: string
          p_code: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_name_ar: string
          p_name_en: string
          p_sort_order: number
          p_zone_id: string
        }
        Returns: Json
      }
      save_my_branch_delivery_configuration: {
        Args: {
          p_branch_id: string
          p_delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          p_estimated_minutes_max: number
          p_estimated_minutes_min: number
          p_expected_branch_version: number
          p_expected_config_version: number
          p_fee_piastres: number
          p_free_delivery_threshold_piastres: number
          p_idempotency_key: string
          p_is_active: boolean
          p_minimum_order_piastres: number
          p_store_id: string
          p_zone_id: string
        }
        Returns: Json
      }
      save_my_marketplace_address: {
        Args: {
          p_address_id?: string
          p_address_line: string
          p_apartment?: string
          p_building?: string
          p_floor?: string
          p_is_default?: boolean
          p_label: string
          p_landmark?: string
          p_latitude?: number
          p_longitude?: number
          p_recipient_name: string
          p_recipient_phone: string
          p_zone_id: string
        }
        Returns: {
          address_line: string
          apartment: string | null
          building: string | null
          created_at: string
          customer_id: string
          floor: string | null
          id: string
          is_default: boolean
          label: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          recipient_name: string
          recipient_phone: string
          updated_at: string
          zone_id: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_addresses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_my_marketplace_coupon: {
        Args: {
          p_code: string
          p_coupon_id: string
          p_discount_amount_piastres: number
          p_discount_percent: number
          p_discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          p_expected_updated_at: string
          p_expires_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_max_discount_piastres: number
          p_minimum_order_piastres: number
          p_per_customer_limit: number
          p_starts_at: string
          p_store_id: string
          p_title: string
          p_total_limit: number
        }
        Returns: Json
      }
      save_my_store_branch: {
        Args: {
          p_address_text: string
          p_area: string
          p_branch_id: string
          p_city: string
          p_code: string
          p_delivery_modes: Database["public"]["Enums"]["marketplace_delivery_mode"][]
          p_expected_version: number
          p_idempotency_key: string
          p_is_default: boolean
          p_name: string
          p_sort_order: number
          p_status: Database["public"]["Enums"]["marketplace_branch_status"]
          p_store_id: string
        }
        Returns: Json
      }
      save_my_store_delivery_configuration: {
        Args: {
          p_delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          p_estimated_minutes_max: number
          p_estimated_minutes_min: number
          p_expected_config_updated_at: string
          p_expected_store_updated_at: string
          p_fee_piastres: number
          p_free_delivery_threshold_piastres: number
          p_idempotency_key: string
          p_is_active: boolean
          p_minimum_order_piastres: number
          p_store_id: string
          p_zone_id: string
        }
        Returns: Json
      }
      save_my_store_delivery_configuration_base_180715: {
        Args: {
          p_delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          p_estimated_minutes_max: number
          p_estimated_minutes_min: number
          p_expected_config_updated_at: string
          p_expected_store_updated_at: string
          p_fee_piastres: number
          p_free_delivery_threshold_piastres: number
          p_idempotency_key: string
          p_is_active: boolean
          p_minimum_order_piastres: number
          p_store_id: string
          p_zone_id: string
        }
        Returns: Json
      }
      save_platform_marketplace_coupon_as_admin: {
        Args: {
          p_code: string
          p_coupon_id: string
          p_discount_amount_piastres: number
          p_discount_percent: number
          p_discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          p_expected_updated_at: string
          p_expires_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_max_discount_piastres: number
          p_minimum_order_piastres: number
          p_per_customer_limit: number
          p_starts_at: string
          p_title: string
          p_total_limit: number
        }
        Returns: Json
      }
      save_platform_marketplace_coupon_as_admin_base_180000: {
        Args: {
          p_code: string
          p_coupon_id: string
          p_discount_amount_piastres: number
          p_discount_percent: number
          p_discount_type: Database["public"]["Enums"]["marketplace_coupon_type"]
          p_expected_updated_at: string
          p_expires_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_max_discount_piastres: number
          p_minimum_order_piastres: number
          p_per_customer_limit: number
          p_starts_at: string
          p_title: string
          p_total_limit: number
        }
        Returns: Json
      }
      seal_legacy_media_backfill_discovery: {
        Args: { p_run_id: string }
        Returns: undefined
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
      set_delivery_order_status_base_174408: {
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
      set_marketplace_delivery_zone_active_as_admin: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_zone_id: string
        }
        Returns: Json
      }
      set_marketplace_delivery_zone_active_as_admin_base_180000: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_is_active: boolean
          p_zone_id: string
        }
        Returns: Json
      }
      set_marketplace_order_status: {
        Args: {
          p_actor_id: string
          p_collected_amount?: unknown
          p_next: Database["public"]["Enums"]["marketplace_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_my_marketplace_order_status: {
        Args: {
          p_collected_amount?: unknown
          p_next: Database["public"]["Enums"]["marketplace_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_my_marketplace_order_status_base_174408: {
        Args: {
          p_collected_amount?: unknown
          p_next: Database["public"]["Enums"]["marketplace_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_my_marketplace_order_status_base_175213: {
        Args: {
          p_collected_amount?: unknown
          p_next: Database["public"]["Enums"]["marketplace_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      set_my_marketplace_order_status_base_180000: {
        Args: {
          p_collected_amount?: unknown
          p_next: Database["public"]["Enums"]["marketplace_order_status"]
          p_order_id: string
          p_reason?: string
        }
        Returns: Json
      }
      stage_product_revision: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_image_snapshot: Json
          p_product_id: string
          p_proposed_snapshot: Json
        }
        Returns: {
          approved_at: string | null
          base_snapshot: Json
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          idempotency_key: string
          image_snapshot: Json
          product_id: string
          proposed_snapshot: Json
          rejected_at: string | null
          request_hash: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          store_id: string
        }
        SetofOptions: {
          from: "*"
          to: "product_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stage_store_revision: {
        Args: {
          p_actor_id: string
          p_idempotency_key: string
          p_image_snapshot: Json
          p_proposed_snapshot: Json
          p_store_id: string
        }
        Returns: {
          approved_at: string | null
          base_snapshot: Json
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          id: string
          idempotency_key: string
          image_snapshot: Json
          merchant_id: string
          proposed_snapshot: Json
          rejected_at: string | null
          request_hash: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          store_id: string
        }
        SetofOptions: {
          from: "*"
          to: "store_revisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      store_live_image_snapshot: { Args: { p_store_id: string }; Returns: Json }
      store_sensitive_snapshot: {
        Args: { p_store: Database["public"]["Tables"]["stores"]["Row"] }
        Returns: Json
      }
      submit_cash_reconciliation_batch: {
        Args: { p_actor_id: string; p_batch_id: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_cash_reconciliation_batch: {
        Args: { p_batch_id: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_cash_reconciliation_batch_base_174408: {
        Args: { p_batch_id: string }
        Returns: {
          created_at: string
          driver_id: string | null
          driver_name_snapshot: string | null
          expected_total: number
          id: string
          idempotency_key: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name_snapshot: string | null
          status: string
          submitted_at: string | null
          submitted_total: number | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "cash_reconciliation_batches"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_marketplace_store_operational: {
        Args: { p_idempotency_key: string; p_store_id: string }
        Returns: Json
      }
      submit_my_product_for_review: {
        Args: { p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_product_for_review_base_174408: {
        Args: { p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_store_for_review: {
        Args: { p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_my_store_for_review_base_174408: {
        Args: { p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_product_for_review: {
        Args: { p_actor_id: string; p_product_id: string }
        Returns: {
          brand: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          is_featured: boolean
          moderation_notes: string | null
          name: string
          product_key: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_product_status"]
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_product_review: {
        Args: {
          p_body?: string
          p_order_item_id: string
          p_rating: number
          p_title?: string
        }
        Returns: {
          body: string | null
          created_at: string
          customer_id: string
          id: string
          moderation_notes: string | null
          order_item_id: string
          product_id: string
          rating: number
          status: Database["public"]["Enums"]["marketplace_review_status"]
          title: string | null
          updated_at: string
          verified_purchase: boolean
        }
        SetofOptions: {
          from: "*"
          to: "product_reviews"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_store_for_review: {
        Args: { p_actor_id: string; p_store_id: string }
        Returns: {
          address_text: string | null
          area: string | null
          city: string | null
          commission_rate: number
          created_at: string
          created_by: string | null
          created_by_name_snapshot: string | null
          currency: string
          delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          description: string | null
          first_published_at: string | null
          first_submitted_at: string | null
          id: string
          merchant_id: string
          moderation_notes: string | null
          name: string
          short_description: string | null
          slug: string
          status: Database["public"]["Enums"]["marketplace_store_status"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stores"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_all_store_delivery_zones_from_branches: {
        Args: { p_store_id: string }
        Returns: undefined
      }
      sync_store_delivery_zone_from_branches: {
        Args: {
          p_delivery_mode: Database["public"]["Enums"]["marketplace_delivery_mode"]
          p_store_id: string
          p_zone_id: string
        }
        Returns: undefined
      }
      transition_commission_statement_as_admin: {
        Args: {
          p_idempotency_key: string
          p_manual_adjustment_piastres?: number
          p_next: Database["public"]["Enums"]["marketplace_statement_status"]
          p_notes?: string
          p_statement_id: string
        }
        Returns: Json
      }
      transition_commission_statement_as_admin_base_180000: {
        Args: {
          p_idempotency_key: string
          p_manual_adjustment_piastres?: number
          p_next: Database["public"]["Enums"]["marketplace_statement_status"]
          p_notes?: string
          p_statement_id: string
        }
        Returns: Json
      }
      undo_my_marketplace_media_deletion: {
        Args: { p_undo_id: string }
        Returns: Json
      }
      unregister_my_push_subscription: {
        Args: { p_endpoint: string }
        Returns: boolean
      }
      update_driver_public_profile:
        | {
            Args: {
              p_contact_phone: string
              p_display_name: string
              p_vehicle_type: string
              p_whatsapp: string
            }
            Returns: {
              active_until: string | null
              avatar_path: string | null
              avatar_url: string | null
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
        | {
            Args: {
              p_display_name: string
              p_vehicle_type?: string
              p_whatsapp?: string
            }
            Returns: {
              active_until: string | null
              avatar_path: string | null
              avatar_url: string | null
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
      update_marketplace_cart_item: {
        Args: {
          p_cart_id: string
          p_customer_id?: string
          p_guest_token?: string
          p_quantity: number
          p_variant_id: string
        }
        Returns: Json
      }
      update_my_marketplace_cart_item: {
        Args: { p_cart_id: string; p_quantity: number; p_variant_id: string }
        Returns: Json
      }
      update_my_marketplace_product: {
        Args: {
          p_expected_updated_at: string
          p_idempotency_key: string
          p_product: Json
          p_product_id: string
          p_variants: Json
        }
        Returns: Json
      }
      update_my_marketplace_store: {
        Args: {
          p_address_text: string
          p_area: string
          p_city: string
          p_description: string
          p_expected_updated_at: string
          p_idempotency_key: string
          p_name: string
          p_short_description: string
          p_store_id: string
        }
        Returns: Json
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
      marketplace_admin_role:
        | "super_admin"
        | "operations"
        | "support"
        | "finance"
        | "catalog_reviewer"
      marketplace_branch_status: "active" | "inactive"
      marketplace_cart_status: "active" | "converted" | "abandoned" | "merged"
      marketplace_coupon_funding: "merchant" | "platform"
      marketplace_coupon_type: "percentage" | "fixed"
      marketplace_delivery_mode: "platform" | "self" | "flexible"
      marketplace_import_status:
        | "uploaded"
        | "validating"
        | "ready"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
      marketplace_media_entity:
        | "product"
        | "store"
        | "review"
        | "support"
        | "import"
        | "delivery_proof"
      marketplace_media_status: "active" | "deleted" | "quarantined"
      marketplace_membership_role:
        | "owner"
        | "manager"
        | "catalog"
        | "fulfillment"
        | "viewer"
      marketplace_order_status:
        | "pending_confirmation"
        | "confirmed"
        | "preparing"
        | "ready_for_pickup"
        | "out_for_delivery"
        | "delivery_failed"
        | "delivered"
        | "cancelled"
        | "rejected"
        | "issue"
        | "return_requested"
        | "return_approved"
        | "returned"
      marketplace_payment_status:
        | "pending"
        | "collected"
        | "remitted"
        | "failed"
        | "refunded"
      marketplace_product_status:
        | "draft"
        | "pending_review"
        | "active"
        | "rejected"
        | "archived"
      marketplace_reservation_status:
        | "reserved"
        | "committed"
        | "released"
        | "expired"
      marketplace_review_status: "pending" | "published" | "rejected"
      marketplace_statement_status:
        | "draft"
        | "issued"
        | "paid"
        | "disputed"
        | "void"
      marketplace_store_status:
        | "draft"
        | "pending_review"
        | "published"
        | "suspended"
        | "archived"
      marketplace_support_status:
        | "open"
        | "waiting_customer"
        | "waiting_support"
        | "resolved"
        | "closed"
      marketplace_upload_status:
        | "staging"
        | "processing"
        | "ready"
        | "failed"
        | "expired"
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
      marketplace_admin_role: [
        "super_admin",
        "operations",
        "support",
        "finance",
        "catalog_reviewer",
      ],
      marketplace_branch_status: ["active", "inactive"],
      marketplace_cart_status: ["active", "converted", "abandoned", "merged"],
      marketplace_coupon_funding: ["merchant", "platform"],
      marketplace_coupon_type: ["percentage", "fixed"],
      marketplace_delivery_mode: ["platform", "self", "flexible"],
      marketplace_import_status: [
        "uploaded",
        "validating",
        "ready",
        "processing",
        "completed",
        "failed",
        "cancelled",
      ],
      marketplace_media_entity: [
        "product",
        "store",
        "review",
        "support",
        "import",
        "delivery_proof",
      ],
      marketplace_media_status: ["active", "deleted", "quarantined"],
      marketplace_membership_role: [
        "owner",
        "manager",
        "catalog",
        "fulfillment",
        "viewer",
      ],
      marketplace_order_status: [
        "pending_confirmation",
        "confirmed",
        "preparing",
        "ready_for_pickup",
        "out_for_delivery",
        "delivery_failed",
        "delivered",
        "cancelled",
        "rejected",
        "issue",
        "return_requested",
        "return_approved",
        "returned",
      ],
      marketplace_payment_status: [
        "pending",
        "collected",
        "remitted",
        "failed",
        "refunded",
      ],
      marketplace_product_status: [
        "draft",
        "pending_review",
        "active",
        "rejected",
        "archived",
      ],
      marketplace_reservation_status: [
        "reserved",
        "committed",
        "released",
        "expired",
      ],
      marketplace_review_status: ["pending", "published", "rejected"],
      marketplace_statement_status: [
        "draft",
        "issued",
        "paid",
        "disputed",
        "void",
      ],
      marketplace_store_status: [
        "draft",
        "pending_review",
        "published",
        "suspended",
        "archived",
      ],
      marketplace_support_status: [
        "open",
        "waiting_customer",
        "waiting_support",
        "resolved",
        "closed",
      ],
      marketplace_upload_status: [
        "staging",
        "processing",
        "ready",
        "failed",
        "expired",
      ],
    },
  },
} as const
