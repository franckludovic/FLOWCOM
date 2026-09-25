import {
  createContext, useContext, useState, useEffect, useCallback, type ReactNode
} from 'react'
import {
  createDataverseCompany,
  createDataverseKeyMessage,
  createDataverseProduct,
  createDataverseSegment,
  deleteDataverseCompany,
  deleteDataverseKeyMessage,
  deleteDataverseProduct,
  deleteDataverseSegment,
  getCompaniesForProfile,
  getCompanyData,
  getOrCreateDataverseProfile,
  replaceDataverseProducts,
  replaceDataverseSegments,
  updateDataverseCompany,
} from '@/lib/dataverse'
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
  const { user, profile, refreshApiKeyStatus } = useAuth()
  const [companies, setCompanies] = useState<Company[]>([])
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [segments, setSegments] = useState<AudienceSegment[]>([])
  const [keyMessages, setKeyMessages] = useState<KeyMessage[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCompanies = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const dataverseProfile = profile ?? await getOrCreateDataverseProfile(user)
      const list = await getCompaniesForProfile(dataverseProfile.id, user.id)
      const activeId = localStorage.getItem(`flowcom:active-company:${user.id}`)
      const active = list.find(c => c.id === activeId) ?? list[0] ?? null
      setCompanies(list.map(c => ({ ...c, is_active: c.id === active?.id })))
      setActiveCompanyState(active ? { ...active, is_active: true } : null)
      if (active) localStorage.setItem(`flowcom:active-company:${user.id}`, active.id)
    } finally {
      setLoading(false)
    }
  }, [profile, user])

  const fetchCompanyData = useCallback(async (companyId: string) => {
    const data = await getCompanyData(companyId)
    setProducts(data.products)
    setSegments(data.segments)
    setKeyMessages(data.keyMessages)
  }, [])

  useEffect(() => {
    if (user) fetchCompanies()
    else {
      setCompanies([])
      setActiveCompanyState(null)
    }
  }, [user, fetchCompanies])

  useEffect(() => {
    void refreshApiKeyStatus(activeCompany?.id ?? null)
  }, [activeCompany?.id, refreshApiKeyStatus])

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
    if (!companies.some(existing => existing.id === company.id)) return
    // Active company is a per-user preference. It must not be stored on the
    // shared company row because two members may choose different workspaces.
    localStorage.setItem(`flowcom:active-company:${user.id}`, company.id)
    setCompanies(prev => prev.map(c => ({ ...c, is_active: c.id === company.id })))
    setActiveCompanyState({ ...company, is_active: true })
  }

  const createCompany = async (name: string): Promise<Company | null> => {
    if (!user) return null
    const dataverseProfile = profile ?? await getOrCreateDataverseProfile(user)
    const company = await createDataverseCompany(name, dataverseProfile.id, user.id)
    setCompanies(prev => [...prev, company])
    return company
  }

  const updateCompany = async (id: string, updates: Partial<Company>) => {
    await updateDataverseCompany(id, updates)
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
    if (activeCompany?.id === id) setActiveCompanyState(prev => prev ? { ...prev, ...updates } : prev)
  }

  const deleteCompany = async (id: string) => {
    await deleteDataverseCompany(id)
    const remaining = companies.filter(c => c.id !== id)
    setCompanies(remaining)
    if (activeCompany?.id === id) {
      const next = remaining[0] ?? null
      if (next) await setActiveCompany(next)
      else {
        localStorage.removeItem(`flowcom:active-company:${user?.id}`)
        setActiveCompanyState(null)
      }
    }
  }

  const addProduct = async (product: Omit<Product, 'id' | 'company_id' | 'created_at'>) => {
    if (!activeCompany) return
    const data = await createDataverseProduct(activeCompany.id, product)
    setProducts(prev => [...prev, data])
  }

  const saveProducts = async (companyId: string, nextProducts: Array<Omit<Product, 'id' | 'company_id' | 'created_at'>>) => {
    setProducts(await replaceDataverseProducts(companyId, nextProducts))
  }

  const removeProduct = async (id: string) => {
    await deleteDataverseProduct(id)
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  const addSegment = async (segment: Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>) => {
    if (!activeCompany) return
    const data = await createDataverseSegment(activeCompany.id, segment)
    setSegments(prev => [...prev, data])
  }

  const saveSegments = async (companyId: string, nextSegments: Array<Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>>) => {
    setSegments(await replaceDataverseSegments(companyId, nextSegments))
  }

  const removeSegment = async (id: string) => {
    await deleteDataverseSegment(id)
    setSegments(prev => prev.filter(s => s.id !== id))
  }

  const addKeyMessage = async (content: string) => {
    if (!activeCompany) return
    const data = await createDataverseKeyMessage(activeCompany.id, content)
    setKeyMessages(prev => [...prev, data])
  }

  const removeKeyMessage = async (id: string) => {
    await deleteDataverseKeyMessage(id)
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
