import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import type { Company, Product, AudienceSegment, KeyMessage } from '@/types'

interface CompanyContextValue {
  companies: Company[]
  activeCompany: Company | null
  products: Product[]
  segments: AudienceSegment[]
  keyMessages: KeyMessage[]
  loading: boolean
  setActiveCompany: (company: Company) => Promise<void>
  createCompany: (name: string) => Promise<Company | null>
  updateCompany: (id: string, updates: Partial<Company>) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  addProduct: (product: Omit<Product, 'id' | 'company_id' | 'created_at'>) => Promise<void>
  saveProducts: (companyId: string, products: Array<Omit<Product, 'id' | 'company_id' | 'created_at'>>) => Promise<void>
  removeProduct: (id: string) => Promise<void>
  addSegment: (segment: Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>) => Promise<void>
  saveSegments: (companyId: string, segments: Array<Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>>) => Promise<void>
  removeSegment: (id: string) => Promise<void>
  addKeyMessage: (content: string) => Promise<void>
  removeKeyMessage: (id: string) => Promise<void>
  refreshCompanyData: () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue | null>(null)

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [segments, setSegments] = useState<AudienceSegment[]>([])
  const [keyMessages, setKeyMessages] = useState<KeyMessage[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCompanies = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('companies')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at')
    if (data) {
      const list = data as unknown as Company[]
      setCompanies(list)
      const active = list.find(c => c.is_active) ?? list[0] ?? null
      setActiveCompanyState(active)
    }
    setLoading(false)
  }, [user])

  const fetchCompanyData = useCallback(async (companyId: string) => {
    const [p, s, k] = await Promise.all([
      supabase.from('products').select('*').eq('company_id', companyId),
      supabase.from('audience_segments').select('*').eq('company_id', companyId),
      supabase.from('key_messages').select('*').eq('company_id', companyId),
    ])
    setProducts((p.data ?? []) as unknown as Product[])
    setSegments((s.data ?? []) as unknown as AudienceSegment[])
    setKeyMessages((k.data ?? []) as unknown as KeyMessage[])
  }, [])

  useEffect(() => {
    if (user) fetchCompanies()
    else {
      setCompanies([])
      setActiveCompanyState(null)
    }
  }, [user, fetchCompanies])

  useEffect(() => {
    if (activeCompany) fetchCompanyData(activeCompany.id)
    else {
      setProducts([])
      setSegments([])
      setKeyMessages([])
    }
  }, [activeCompany, fetchCompanyData])

  const setActiveCompany = async (company: Company) => {
    if (!user) return
    // Deactivate all, activate selected
    await supabase.from('companies').update({ is_active: false }).eq('user_id', user.id)
    await supabase.from('companies').update({ is_active: true }).eq('id', company.id)
    setCompanies(prev => prev.map(c => ({ ...c, is_active: c.id === company.id })))
    setActiveCompanyState({ ...company, is_active: true })
  }

  const createCompany = async (name: string): Promise<Company | null> => {
    if (!user) return null
    const { data, error } = await supabase
      .from('companies')
      .insert({ user_id: user.id, name, is_active: false })
      .select()
      .single()
    if (error || !data) return null
    const company = data as unknown as Company
    setCompanies(prev => [...prev, company])
    return company
  }

  const updateCompany = async (id: string, updates: Partial<Company>) => {
    await supabase.from('companies').update(updates).eq('id', id)
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    if (activeCompany?.id === id) setActiveCompanyState(prev => prev ? { ...prev, ...updates } : prev)
  }

  const deleteCompany = async (id: string) => {
    await supabase.from('companies').delete().eq('id', id)
    const remaining = companies.filter(c => c.id !== id)
    setCompanies(remaining)
    if (activeCompany?.id === id) {
      const next = remaining[0] ?? null
      setActiveCompanyState(next)
      if (next) await setActiveCompany(next)
    }
  }

  const addProduct = async (product: Omit<Product, 'id' | 'company_id' | 'created_at'>) => {
    if (!activeCompany) return
    const { data } = await supabase.from('products').insert({ ...product, company_id: activeCompany.id }).select().single()
    if (data) setProducts(prev => [...prev, data as unknown as Product])
  }

  const saveProducts = async (companyId: string, nextProducts: Array<Omit<Product, 'id' | 'company_id' | 'created_at'>>) => {
    await supabase.from('products').delete().eq('company_id', companyId)
    if (nextProducts.length) {
      const { data } = await supabase
        .from('products')
        .insert(nextProducts.map(product => ({ ...product, company_id: companyId })))
        .select()
      setProducts((data ?? []) as unknown as Product[])
    } else {
      setProducts([])
    }
  }

  const removeProduct = async (id: string) => {
    await supabase.from('products').delete().eq('id', id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  const addSegment = async (segment: Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>) => {
    if (!activeCompany) return
    const { data } = await supabase.from('audience_segments').insert({ ...segment, company_id: activeCompany.id }).select().single()
    if (data) setSegments(prev => [...prev, data as unknown as AudienceSegment])
  }

  const saveSegments = async (companyId: string, nextSegments: Array<Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>>) => {
    await supabase.from('audience_segments').delete().eq('company_id', companyId)
    if (nextSegments.length) {
      const { data } = await supabase
        .from('audience_segments')
        .insert(nextSegments.map(segment => ({ ...segment, company_id: companyId })))
        .select()
      setSegments((data ?? []) as unknown as AudienceSegment[])
    } else {
      setSegments([])
    }
  }

  const removeSegment = async (id: string) => {
    await supabase.from('audience_segments').delete().eq('id', id)
    setSegments(prev => prev.filter(s => s.id !== id))
  }

  const addKeyMessage = async (content: string) => {
    if (!activeCompany) return
    const { data } = await supabase.from('key_messages').insert({ content, company_id: activeCompany.id }).select().single()
    if (data) setKeyMessages(prev => [...prev, data as unknown as KeyMessage])
  }

  const removeKeyMessage = async (id: string) => {
    await supabase.from('key_messages').delete().eq('id', id)
    setKeyMessages(prev => prev.filter(m => m.id !== id))
  }

  const refreshCompanyData = async () => {
    if (activeCompany) await fetchCompanyData(activeCompany.id)
  }

  return (
    <CompanyContext.Provider value={{
      companies, activeCompany, products, segments, keyMessages, loading,
      setActiveCompany, createCompany, updateCompany, deleteCompany,
      addProduct, saveProducts, removeProduct, addSegment, saveSegments, removeSegment,
      addKeyMessage, removeKeyMessage, refreshCompanyData,
    }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  const ctx = useContext(CompanyContext)
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider')
  return ctx
}
