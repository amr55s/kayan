export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      drivers: {
        Row: {
          id: string
          name: string | null
          phone: string
          whatsapp: string | null
          pin_code: string | null
          pin_code_hash: string | null
          vehicle_type: string | null
          is_active: boolean
          active_until: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          phone: string
          whatsapp?: string | null
          pin_code?: string | null
          pin_code_hash?: string | null
          vehicle_type?: string | null
          is_active?: boolean
          active_until?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string | null
          phone?: string
          whatsapp?: string | null
          pin_code?: string | null
          pin_code_hash?: string | null
          vehicle_type?: string | null
          is_active?: boolean
          active_until?: string | null
          created_at?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          id: string
          title: string
          category: string
          phone: string
          whatsapp: string | null
          instapay_vfcash: string | null
          description: string | null
          images: string[]
          is_featured: boolean
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          category: string
          phone: string
          whatsapp?: string | null
          instapay_vfcash?: string | null
          description?: string | null
          images?: string[]
          is_featured?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          category?: string
          phone?: string
          whatsapp?: string | null
          instapay_vfcash?: string | null
          description?: string | null
          images?: string[]
          is_featured?: boolean
          created_at?: string
        }
        Relationships: []
      }
      pending_requests: {
        Row: {
          id: string
          title: string
          category: string
          phone: string
          whatsapp: string | null
          instapay_vfcash: string | null
          description: string | null
          images: string[]
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          category: string
          phone: string
          whatsapp?: string | null
          instapay_vfcash?: string | null
          description?: string | null
          images?: string[]
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          category?: string
          phone?: string
          whatsapp?: string | null
          instapay_vfcash?: string | null
          description?: string | null
          images?: string[]
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
        }
        Relationships: []
      }
      feedback_requests: {
        Row: {
          id: string
          target_place_id: string | null
          place_name_or_phone: string
          feedback_type: string
          source: 'public' | 'merchant'
          submitted_by: string | null
          rating: number | null
          contact_phone: string
          proposed_phone: string | null
          proposed_title: string | null
          proposed_category: string | null
          proposed_whatsapp: string | null
          proposed_instapay_vfcash: string | null
          proposed_description: string | null
          notes: string
          images: string[]
          proposed_images: string[]
          status: 'pending' | 'resolved'
          created_at: string
        }
        Insert: {
          id?: string
          target_place_id?: string | null
          place_name_or_phone: string
          feedback_type: string
          source?: 'public' | 'merchant'
          submitted_by?: string | null
          rating?: number | null
          contact_phone: string
          proposed_phone?: string | null
          proposed_title?: string | null
          proposed_category?: string | null
          proposed_whatsapp?: string | null
          proposed_instapay_vfcash?: string | null
          proposed_description?: string | null
          notes: string
          images?: string[]
          proposed_images?: string[]
          status?: 'pending' | 'resolved'
          created_at?: string
        }
        Update: {
          id?: string
          target_place_id?: string | null
          place_name_or_phone?: string
          feedback_type?: string
          source?: 'public' | 'merchant'
          submitted_by?: string | null
          rating?: number | null
          contact_phone?: string
          proposed_phone?: string | null
          proposed_title?: string | null
          proposed_category?: string | null
          proposed_whatsapp?: string | null
          proposed_instapay_vfcash?: string | null
          proposed_description?: string | null
          notes?: string
          images?: string[]
          proposed_images?: string[]
          status?: 'pending' | 'resolved'
          created_at?: string
        }
        Relationships: []
      }
      driver_profiles: {
        Row: {
          profile_id: string
          whatsapp: string | null
          vehicle_type: string | null
          is_available: boolean
          active_until: string | null
          last_seen_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          profile_id: string
          whatsapp?: string | null
          vehicle_type?: string | null
          is_available?: boolean
          active_until?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          profile_id?: string
          whatsapp?: string | null
          vehicle_type?: string | null
          is_available?: boolean
          active_until?: string | null
          last_seen_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      merchant_branches: {
        Row: {
          id: string
          merchant_id: string
          place_id: string | null
          name: string
          phone: string
          address: string
          area: string
          is_default: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          merchant_id: string
          place_id?: string | null
          name: string
          phone: string
          address: string
          area: string
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          merchant_id?: string
          place_id?: string | null
          name?: string
          phone?: string
          address?: string
          area?: string
          is_default?: boolean
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      list_public_registered_drivers: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          name: string
          phone: string
          whatsapp: string | null
          vehicle_type: string | null
          is_available: boolean
          active_until: string | null
          created_at: string
        }[]
      }
      register_public_driver: {
        Args: {
          p_name: string
          p_phone: string
          p_whatsapp?: string | null
          p_vehicle_type?: string | null
        }
        Returns: {
          driver_id: string
          activation_pin: string
          available_until: string
        }[]
      }
      renew_public_driver: {
        Args: {
          p_phone: string
          p_pin: string
        }
        Returns: {
          driver_id: string
          driver_name: string
          available_until: string
        }[]
      }
      apply_feedback_to_place: {
        Args: {
          p_feedback_id: string
          p_image_mode?: 'append' | 'replace'
        }
        Returns: string
      }
      approve_pending_place: {
        Args: {
          p_request_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
