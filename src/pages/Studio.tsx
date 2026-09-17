import { useState, useEffect } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import { Send, Check, Loader2, AlertCircle, CheckSquare, Image as ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

const BUFFER_ENDPOINT = '/buffer-api/graphql'

async function bufferQuery(token: string, query: string, variables?: object) {
  const res = await fetch(BUFFER_ENDPOINT, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

export default function StudioPage() {
  const { lang } = useI18n()
  const bufferToken = import.meta.env.VITE_BUFFER_API_KEY

  const [profiles, setProfiles] = useState<any[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [error, setError] = useState('')

  const [content, setContent] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [selectedProfiles, setSelectedProfiles] = useState<string[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  const [isPublishing, setIsPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)

  // Step 1: fetch org ID then channels
  useEffect(() => {
    if (!bufferToken) {
      setError(lang === 'fr' ? 'Clé API Buffer manquante dans .env.local' : 'Missing VITE_BUFFER_API_KEY in .env.local')
      return
    }
    const init = async () => {
      setLoadingProfiles(true)
      setError('')
      try {
        // Get org ID
        const accountData = await bufferQuery(bufferToken, `{ account { organizations { id } } }`)
        const org = accountData?.account?.organizations?.[0]
        if (!org) throw new Error('No organization found')

        // Get channels
        const channelData = await bufferQuery(bufferToken,
          `query Channels($input: ChannelsInput!) { channels(input: $input) { id name service avatar } }`,
          { input: { organizationId: org.id } }
        )
        const channels = channelData?.channels ?? []
        setProfiles(channels)
        if (channels.length > 0) setSelectedProfiles([channels[0].id])
      } catch (e: any) {
        console.error(e)
        setError(lang === 'fr' ? `Erreur Buffer: ${e.message}` : `Buffer error: ${e.message}`)
      }
      setLoadingProfiles(false)
    }
    init()
  }, [bufferToken, lang])

  const [libraryItems, setLibraryItems] = useState<any[]>([])
  useEffect(() => {
    try {
      const raw = localStorage.getItem('flowcom:library')
      if (raw) setLibraryItems(JSON.parse(raw))
    } catch {}
  }, [])

  // Publish to each selected channel individually
  const handlePublish = async () => {
    if (!content.trim() || selectedProfiles.length === 0) return
    setIsPublishing(true)
    setError('')
    try {
      // Build one mutation per channel, injecting service-specific metadata
      const results = await Promise.all(
        selectedProfiles.map(channelId => {
          const channel = profiles.find((p: any) => p.id === channelId)
          const service = channel?.service?.toLowerCase() ?? ''

          // Build metadata block for service-specific requirements
          let metadataFragment = ''
          if (service === 'facebook') {
            metadataFragment = `metadata: { facebook: { type: post } }`
          } else if (service === 'instagram') {
            metadataFragment = `metadata: { instagram: { type: feed } }`
          }

          const hasImage = !!imageUrl.trim()

          const mutation = `
            mutation CreatePost($text: String!, $channelId: ChannelId!) {
              createPost(input: {
                text: $text,
                channelId: $channelId,
                schedulingType: automatic,
                mode: shareNow
                ${metadataFragment}
                ${hasImage ? `assets: [{ image: { url: "${imageUrl.trim()}" } }]` : ''}
              }) {
                ... on PostActionSuccess { post { id } }
                ... on MutationError { message }
              }
            }
          `
          return bufferQuery(bufferToken, mutation, { text: content, channelId })
        })
      )

      // Check for any MutationError
      const firstError = results.find(r => r?.createPost?.message)
      if (firstError) throw new Error(firstError.createPost.message)

      // Update library status if loaded from library
      if (selectedItemId) {
        const raw = localStorage.getItem('flowcom:library')
        if (raw) {
          const items = JSON.parse(raw)
          const updated = items.map((i: any) => i.id === selectedItemId ? { ...i, status: 'Published' } : i)
          localStorage.setItem('flowcom:library', JSON.stringify(updated))
          window.dispatchEvent(new Event('flowcom:data-updated'))
          setLibraryItems(updated)
        }
      }

      setPublishSuccess(true)
      setTimeout(() => {
        setPublishSuccess(false)
        setContent('')
        setImageUrl('')
        setSelectedItemId(null)
      }, 3000)
    } catch (e: any) {
      console.error(e)
      setError(lang === 'fr' ? `Erreur: ${e.message}` : `Error: ${e.message}`)
    } finally {
      setIsPublishing(false)
    }
  }

  const toggleProfile = (id: string) => {
    setSelectedProfiles(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const selectFromLibrary = (item: any) => {
    setContent(item.body)
    setSelectedItemId(item.id)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Send className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">Buffer Studio</h1>
          <p className="text-xs text-[var(--color-text-muted)]">
            {lang === 'fr' ? 'Publiez simultanément sur plusieurs réseaux via Buffer.' : 'Publish simultaneously to multiple networks via Buffer.'}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-sm text-red-600 dark:text-red-400 shrink-0">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* 2-column layout filling remaining space */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Left: Editor + Library */}
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          
          {/* Post Content Editor */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 flex flex-col flex-1 shadow-sm min-h-0">
            <h2 className="text-sm font-bold text-[var(--color-text)] mb-3 shrink-0">{lang === 'fr' ? 'Contenu du Post' : 'Post Content'}</h2>
            <textarea
              value={content}
              onChange={e => {
                setContent(e.target.value)
                setSelectedItemId(null)
              }}
              placeholder={lang === 'fr' ? 'Écrivez votre post ici...' : 'Write your post here...'}
              className="flex-1 w-full p-4 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)] resize-none"
            />
            <div className="mt-3 shrink-0 flex items-center gap-3">
              <ImageIcon className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
              <input 
                type="text"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder={lang === 'fr' ? "URL de l'image (optionnel)" : 'Image URL (optional)'}
                className="flex-1 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-lg px-3 py-2 text-xs text-[var(--color-text)] outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          {/* Library picker */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-4 shadow-sm shrink-0">
            <h2 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              {lang === 'fr' ? '📚 Charger depuis la bibliothèque (Validés)' : '📚 Load from Library (Validated only)'}
            </h2>
            <div className="flex overflow-x-auto gap-3 pb-1">
              {libraryItems.filter(i => i.status === 'Validated').map(item => (
                <button
                  key={item.id}
                  onClick={() => selectFromLibrary(item)}
                  className={cn(
                    "snap-start shrink-0 w-52 p-3 text-left border rounded-xl transition-all",
                    selectedItemId === item.id
                      ? "bg-blue-50 dark:bg-blue-900/30 border-blue-400 ring-1 ring-blue-500"
                      : "bg-[var(--color-surface-alt)] hover:bg-blue-50/50 dark:hover:bg-blue-900/10 border-[var(--color-border)] hover:border-blue-300"
                  )}
                >
                  <p className="text-xs font-bold text-[var(--color-text)] line-clamp-1 mb-1">{item.title || 'Untitled'}</p>
                  <p className="text-[10px] text-[var(--color-text-muted)] line-clamp-2">{item.body}</p>
                </button>
              ))}
              {libraryItems.filter(i => i.status === 'Validated').length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)] italic py-2">
                  {lang === 'fr' ? 'Aucun post validé. Changez le statut dans la bibliothèque.' : 'No validated posts. Change status in Library first.'}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Profiles + Publish button */}
        <div className="flex flex-col gap-4 w-72 shrink-0">
          
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-sm flex-1 flex flex-col min-h-0">
            <h2 className="text-sm font-bold text-[var(--color-text)] mb-1 shrink-0">{lang === 'fr' ? 'Réseaux Sociaux' : 'Social Networks'}</h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-4 shrink-0">{lang === 'fr' ? 'Sélectionnez vos profils Buffer' : 'Select your Buffer profiles'}</p>
            
            <div className="flex-1 overflow-y-auto min-h-0">
              {loadingProfiles ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--color-text-muted)]" />
                </div>
              ) : profiles.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {profiles.map(profile => (
                    <button
                      key={profile.id}
                      onClick={() => toggleProfile(profile.id)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-xl border transition-all text-left",
                        selectedProfiles.includes(profile.id)
                          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 ring-1 ring-blue-500"
                          : "bg-[var(--color-surface-alt)] border-[var(--color-border)] hover:border-blue-300"
                      )}
                    >
                      {profile.avatar_https ? (
                        <img src={profile.avatar_https} alt="" className="w-8 h-8 rounded-full shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text)] truncate">{profile.formatted_username}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)] capitalize">{profile.service}</p>
                      </div>
                      {selectedProfiles.includes(profile.id) && (
                        <CheckSquare className="w-4 h-4 text-blue-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 gap-2">
                  <p className="text-xs text-[var(--color-text-muted)] italic">
                    {lang === 'fr' ? 'Aucun profil trouvé.' : 'No profiles found.'}
                  </p>
                  <p className="text-[10px] text-[var(--color-text-muted)]">
                    {lang === 'fr' ? 'Vérifiez que votre clé API Buffer est valide dans .env.local et relancez le serveur avec npm run dev.' : 'Check your Buffer API key in .env.local and restart the server with npm run dev.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handlePublish}
            disabled={isPublishing || !content.trim() || selectedProfiles.length === 0}
            className="shrink-0 w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors shadow-lg shadow-blue-600/20"
          >
            {isPublishing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {lang === 'fr' ? 'Publication...' : 'Publishing...'}</>
            ) : publishSuccess ? (
              <><Check className="w-4 h-4" /> {lang === 'fr' ? 'Publié avec succès!' : 'Successfully published!'}</>
            ) : (
              <><Send className="w-4 h-4" /> {lang === 'fr' ? 'Publier maintenant' : 'Publish Now'}</>
            )}
          </button>
        </div>

      </div>
    </div>
  )
}