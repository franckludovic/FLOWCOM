import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import EmojiPicker, { Theme as EmojiTheme, type EmojiClickData } from 'emoji-picker-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useTheme } from '@/contexts/ThemeContext'
import { supabase } from '@/lib/supabase'
import { Send, Check, Loader2, AlertCircle, CheckSquare, Upload, X, Smile } from 'lucide-react'
import { cn } from '@/lib/utils'

const BUFFER_ENDPOINT = '/buffer-api/graphql'
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined

interface SelectedMedia {
  id: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
  publicUrl?: string
}

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
  const { theme } = useTheme()
  const { activeCompany } = useCompany()
  const [searchParams] = useSearchParams()
  const bufferToken = import.meta.env.VITE_BUFFER_API_KEY

  const [profiles, setProfiles] = useState<any[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [error, setError] = useState('')

  const [content, setContent] = useState('')
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [media, setMedia] = useState<SelectedMedia[]>([])
  const [uploadingImage, setUploadingImage] = useState(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const contentInputRef = useRef<HTMLTextAreaElement>(null)
  const emojiPickerRef = useRef<HTMLDivElement>(null)
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
    let cancelled = false
    const loadLibrary = async () => {
      if (!activeCompany) { setLibraryItems([]); return }
      const { data } = await supabase.from('library_items').select('*').eq('company_id', activeCompany.id).order('created_at', { ascending: false })
      if (!cancelled) setLibraryItems(data ?? [])
    }
    loadLibrary()
    return () => { cancelled = true }
  }, [activeCompany?.id])

  useEffect(() => {
    const itemId = searchParams.get('item')
    if (!itemId) return
    const item = libraryItems.find(candidate => candidate.id === itemId)
    if (!item) return
    setContent(item.body ?? '')
    setMedia([])
    setSelectedItemId(item.id)
  }, [searchParams, libraryItems])

  useEffect(() => {
    if (!emojiPickerOpen) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!emojiPickerRef.current?.contains(event.target as Node)) setEmojiPickerOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [emojiPickerOpen])

  const chooseMedia = (files: FileList | File[] | undefined) => {
    if (!files) return
    const nextFiles = Array.from(files)
    const validFiles = nextFiles.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'))
    if (validFiles.length !== nextFiles.length) {
      setError(lang === 'fr' ? 'Seules les images et vidéos sont acceptées.' : 'Only image and video files are accepted.')
    }
    const oversized = validFiles.find(file => file.size > 50 * 1024 * 1024)
    if (oversized) {
      setError(lang === 'fr' ? 'Chaque fichier doit faire moins de 50 Mo.' : 'Each file must be smaller than 50 MB.')
      return
    }
    const additions = validFiles.map(file => ({
      id: `${file.name}-${file.lastModified}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    setMedia(previous => [...previous, ...additions])
    if (validFiles.length > 0) setError('')
  }

  const removeMedia = (id: string) => {
    setMedia(previous => {
      const item = previous.find(mediaItem => mediaItem.id === id)
      if (item) URL.revokeObjectURL(item.previewUrl)
      return previous.filter(mediaItem => mediaItem.id !== id)
    })
  }

  const uploadMedia = async (item: SelectedMedia): Promise<string> => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      throw new Error(lang === 'fr'
        ? 'Cloudinary n’est pas configuré. Ajoutez le cloud name et le preset d’upload.'
        : 'Cloudinary is not configured. Add the cloud name and upload preset.')
    }
    const body = new FormData()
    body.append('file', item.file)
    body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
    const resourceType = item.kind === 'video' ? 'video' : 'image'
    const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`, {
      method: 'POST',
      body,
    })
    const result = await response.json() as { secure_url?: string; error?: { message?: string } }
    if (!response.ok || !result.secure_url) throw new Error(result.error?.message ?? 'Image upload failed')
    return result.secure_url
  }

  // Publish to each selected channel individually
  const handlePublish = async () => {
    if (!content.trim() || selectedProfiles.length === 0) return
    setIsPublishing(true)
    setError('')
    try {
      let uploadedMedia = media
      if (media.some(item => !item.publicUrl)) {
        setUploadingImage(true)
        uploadedMedia = []
        for (const item of media) {
          const publicUrl = item.publicUrl ?? await uploadMedia(item)
          uploadedMedia.push({ ...item, publicUrl })
        }
        setMedia(uploadedMedia)
        setUploadingImage(false)
      }
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

          const assets = uploadedMedia.filter(item => item.publicUrl).map(item =>
            item.kind === 'video'
              ? `{ video: { url: "${item.publicUrl}" } }`
              : `{ image: { url: "${item.publicUrl}" } }`
          )

          const mutation = `
            mutation CreatePost($text: String!, $channelId: ChannelId!) {
              createPost(input: {
                text: $text,
                channelId: $channelId,
                schedulingType: automatic,
                mode: shareNow
                ${metadataFragment}
                ${assets.length ? `assets: [${assets.join(', ')}]` : ''}
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
        await supabase.from('library_items').update({ status: 'Published' }).eq('id', selectedItemId)
        setLibraryItems(items => items.map(item => item.id === selectedItemId ? { ...item, status: 'Published' } : item))
        window.dispatchEvent(new Event('flowcom:data-updated'))
      }

      setPublishSuccess(true)
      setTimeout(() => {
        setPublishSuccess(false)
        setContent('')
        media.forEach(item => URL.revokeObjectURL(item.previewUrl))
        setMedia([])
        setSelectedItemId(null)
      }, 3000)
    } catch (e: any) {
      console.error(e)
      setError(lang === 'fr' ? `Erreur: ${e.message}` : `Error: ${e.message}`)
    } finally {
      setUploadingImage(false)
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
    setMedia([])
    setSelectedItemId(item.id)
  }

  const insertEmoji = (emoji: string) => {
    const input = contentInputRef.current
    const start = input?.selectionStart ?? content.length
    const end = input?.selectionEnd ?? content.length
    const nextContent = `${content.slice(0, start)}${emoji}${content.slice(end)}`
    setContent(nextContent)
    window.requestAnimationFrame(() => {
      input?.focus()
      const cursor = start + emoji.length
      input?.setSelectionRange(cursor, cursor)
    })
  }

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    insertEmoji(emojiData.emoji)
  }

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      
      {/* Header */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
          <Send className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text)] font-sans leading-tight">Studio</h1>
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
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 pb-2 flex flex-col flex-1 shadow-sm min-h-0">
            <h2 className="text-sm font-bold text-[var(--color-text)] mb-3 shrink-0">{lang === 'fr' ? 'Contenu du Post' : 'Post Content'}</h2>
            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_136px] gap-3">
              <textarea
                ref={contentInputRef}
                value={content}
                onChange={e => {
                  setContent(e.target.value)
                  setSelectedItemId(null)
                }}
                placeholder={lang === 'fr' ? 'Écrivez votre post ici...' : 'Write your post here...'}
                className="min-h-48 lg:min-h-0 w-full p-4 bg-[var(--color-surface-alt)] border border-[var(--color-border)] rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm text-[var(--color-text)] resize-none"
              />
              <div className="relative min-h-36 lg:h-full flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-2">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => mediaInputRef.current?.click()}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') mediaInputRef.current?.click()
                  }}
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault()
                    chooseMedia(event.dataTransfer.files)
                  }}
                  className="aspect-[5/3] flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[var(--color-border)] hover:border-blue-400 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-blue-500" />
                  <span className="text-[10px] text-center font-semibold text-[var(--color-text-muted)]">{uploadingImage ? (lang === 'fr' ? 'Téléversement...' : 'Uploading...') : (lang === 'fr' ? 'Ajouter image ou vidéo' : 'Add image or video')}</span>
                  <span className="text-[9px] text-[var(--color-text-muted)]">{lang === 'fr' ? 'Déposer ou cliquer' : 'Drop or click'}</span>
                  <input
                    ref={mediaInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                    multiple
                    className="hidden"
                    onChange={event => chooseMedia(event.target.files ?? undefined)}
                  />
                </div>
                {media.length > 0 && (
                  <div className="mt-2 flex-1 min-h-0 max-h-44 overflow-y-auto grid grid-cols-1 gap-2 content-start pr-1">
                    {media.map(item => (
                      <div key={item.id} className="relative aspect-[5/3] rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] group">
                        {item.kind === 'video' ? (
                          <video src={item.previewUrl} className="w-full h-full object-contain" muted />
                        ) : (
                          <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-contain" />
                        )}
                        <span className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-black/65 text-[8px] uppercase text-white">{item.kind}</span>
                        <button
                          type="button"
                          onClick={() => removeMedia(item.id)}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/65 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title={lang === 'fr' ? 'Retirer' : 'Remove'}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[9px] leading-tight text-[var(--color-text-muted)]">{lang === 'fr' ? 'Images et vidéos · 50 Mo max' : 'Images and videos · 50 MB max'}</p>
              </div>
            </div>
            <div className="relative mt-3 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setEmojiPickerOpen(previous => !previous)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--color-text-muted)] hover:text-blue-600 hover:bg-[var(--color-surface-alt)] transition-colors"
                title={lang === 'fr' ? 'Ajouter un emoji' : 'Add emoji'}
              >
                <Smile className="w-4 h-4" />
                {lang === 'fr' ? 'Emoji' : 'Emoji'}
              </button>
              {emojiPickerOpen && (
                <div ref={emojiPickerRef} className="absolute left-0 bottom-full mb-2 z-30">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                    width={280}
                    height={300}
                    previewConfig={{ showPreview: false }}
                    searchPlaceHolder={lang === 'fr' ? 'Rechercher un emoji' : 'Search emoji'}
                    lazyLoadEmojis
                  />
                </div>
              )}
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {lang === 'fr' ? 'Ajoutez des emojis directement dans le texte.' : 'Add emojis directly to your text.'}
              </span>
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
            <p className="text-xs text-[var(--color-text-muted)] mb-4 shrink-0">{lang === 'fr' ? 'Sélectionnez vos profils Buffer' : 'Select your profiles'}</p>
            
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