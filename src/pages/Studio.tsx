import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import EmojiPicker, { Theme as EmojiTheme, type EmojiClickData } from 'emoji-picker-react'
import {
  AlertCircle, CalendarClock, Check, Loader2, Pause, Play, Plus, RotateCcw, Search, Send, Smile, Volume2, VolumeX, X,
} from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useTheme } from '@/contexts/ThemeContext'
import { useAuth } from '@/contexts/AuthContext'
import { useBuffer, bufferQuery, type BufferChannel } from '@/contexts/BufferContext'
import { callModel, callModelJSON } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { listDataverseCalendarItems, listDataverseLibraryItems, updateDataverseCalendarItem, updateDataverseLibraryItem } from '@/lib/dataverse'
import { recordPostPublished, setContentCampaign } from '@/lib/campaigns'
import { addUtm, bufferChannelMatchesCampaign, buildCampaignContext, campaignWarnings, useCampaignOptions } from '@/lib/campaignContext'
import { CHANNEL_LIMITS, CHANNEL_MAP, FORMATS, FORMAT_MAP, type ContentFormat } from '@/lib/channels'
import { Button, Card, CardBody, CardHeader, Chip, SelectField, Spark, Tabs, TextField } from '@/components/ui'
import type { LibraryItem } from '@/types'
import { cn } from '@/lib/utils'

// ─── Cloudinary ───────────────────────────────────────────────────────────────
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined
const MAX_FILE = 50 * 1024 * 1024

interface SelectedMedia {
  id: string
  file: File
  previewUrl: string
  kind: 'image' | 'video'
  publicUrl?: string
  duration?: number
}

// Buffer's service names mapped to FlowCom's network ids.
const networkOf = (channel: BufferChannel) => {
  const s = channel.service.toLowerCase()
  return s === 'x' ? 'twitter' : s
}
// Networks that refuse a post without an image or a video.
const NEEDS_MEDIA = new Set(['instagram', 'tiktok', 'youtube', 'pinterest'])
const NEEDS_VIDEO = new Set(['tiktok', 'youtube'])
const PLACEHOLDER = /\[[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 _'-]*\]/g

type ToneId = 'professional' | 'casual' | 'persuasive' | 'fun' | 'inspiring'
const TONES: { id: ToneId; fr: string; en: string; prompt: string }[] = [
  { id: 'professional', fr: 'Professionnel', en: 'Professional', prompt: 'Rewrite in a professional, authoritative tone. Clear, no fluff. Keep the core message.' },
  { id: 'casual', fr: 'Décontracté', en: 'Casual', prompt: 'Rewrite in a casual, conversational tone, like talking to a friend.' },
  { id: 'persuasive', fr: 'Persuasif', en: 'Persuasive', prompt: 'Rewrite to be persuasive and action-oriented. Strong hook, compelling call to action.' },
  { id: 'fun', fr: 'Fun', en: 'Fun', prompt: 'Rewrite in a fun, playful tone. Natural emojis, punchy sentences.' },
  { id: 'inspiring', fr: 'Inspirant', en: 'Inspiring', prompt: 'Rewrite in an inspiring, motivational tone. Emotional, story-driven.' },
]

const COPY = {
  fr: {
    title: 'Studio', subtitle: 'Publiez ou programmez un post sur vos réseaux connectés',
    loadLibrary: 'Charger un contenu de la bibliothèque', noResult: 'Aucun résultat.', fromLibrary: 'Bibliothèque',
    post: 'Post', text: 'Texte', preview: 'Aperçu', format: 'Format', fromLibraryHint: 'Repris de la bibliothèque',
    textLabel: 'Texte du post', caption: 'Légende', placeholder: 'Écrivez votre post, ou chargez un contenu de la bibliothèque.',
    emoji: 'Ajouter un emoji', tone: 'Réécrire le ton', undo: 'Annuler la réécriture', rewriting: 'Réécriture…',
    hashtags: 'Hashtags', hashtagsPh: '#marque #ville', suggestTags: 'Proposer des hashtags à partir du texte', suggestingTags: 'Recherche de hashtags…', media: 'Médias', addMedia: 'Image ou vidéo', addVideo: 'Ajouter une vidéo',
    replace: 'Remplacer', remove: 'Retirer le média', play: 'Lire', pause: 'Pause', mute: 'Couper le son', unmute: 'Activer le son',
    mediaHint: (n: string) => `Format ${n} conseillé. 50 Mo maximum.`, fileTooBig: 'Fichier de plus de 50 Mo.',
    publishTo: 'Publier sur', buffer: 'Vos comptes connectés', chosen: (n: number) => `${n} choisi${n > 1 ? 's' : ''}`,
    noAccounts: 'Aucun compte de réseau social n’est connecté. Contactez votre gestionnaire FlowCom.', unavailable: 'La publication est momentanément indisponible. Si cela dure, contactez votre gestionnaire FlowCom.', loadingAccounts: 'Chargement des comptes…',
    tooLong: 'Trop long', needsMedia: 'Média requis', needsVideo: 'Vidéo requise', shortVersion: 'Version courte',
    shortFor: (n: string) => `Version courte pour ${n}`, writingShort: 'Rédaction…', removeShort: 'Revenir au texte commun', shortLabel: (n: string) => `Texte pour ${n}`,
    when: 'Quand', now: 'Maintenant', schedule: 'Programmer', date: 'Date', time: 'Heure',
    fromCalendar: 'Date prévue dans le calendrier éditorial. Heure locale.', localTime: 'Heure locale de votre appareil.',
    campaign: 'Campagne', noCampaign: 'Sans campagne', utm: 'Les liens reçoivent le code de suivi de la campagne.',
    check: 'Vérification avant envoi', checkOk: 'Prêt à partir', checkOkText: 'Rien ne bloque l’envoi.',
    points: (n: number) => (n > 1 ? `${n} points à régler avant l'envoi` : "1 point à régler avant l'envoi"),
    lengthIssue: (n: string, len: number, lim: number) => `Trop long pour ${n} : ${len} caractères pour une limite de ${lim}.`,
    mediaIssue: (n: string) => `${n} refuse un post sans image ni vidéo.`, videoIssue: (n: string) => `${n} n'accepte que les vidéos.`,
    placeholderIssue: (p: string) => `${p} ${p.includes(',') ? 'sont encore à remplacer' : 'est encore à remplacer'}.`,
    aiIssues: "Remarques de l'IA", sendAnyway: 'Envoyer quand même', reviewing: 'Vérification…',
    sendNow: (n: number) => `Publier sur ${n} compte${n > 1 ? 's' : ''}`, sendLater: (n: number, when: string) => `Programmer sur ${n} compte${n > 1 ? 's' : ''} · ${when}`,
    pickAccount: 'Choisissez au moins un compte', pickDate: 'Choisissez une date et une heure', pastDate: 'Cette date est déjà passée.',
    sending: 'Envoi…', uploading: 'Envoi des médias…',
    doneNow: (n: number) => `Publié sur ${n} compte${n > 1 ? 's' : ''}`, doneLater: (n: number, when: string) => `Programmé sur ${n} compte${n > 1 ? 's' : ''} pour le ${when}`,
    doneText: 'La publication est prise en charge. Vous retrouverez ce post dans Publications.', history: 'Voir les publications', another: 'Nouveau post',
    seeMore: 'voir plus', nowLabel: 'maintenant', emptyPreview: 'Écrivez un texte pour voir l’aperçu.',
    error: 'Erreur', noText: 'Écrivez un texte avant d’envoyer.',
  },
  en: {
    title: 'Studio', subtitle: 'Publish or schedule a post on your connected networks',
    loadLibrary: 'Load an item from the library', noResult: 'No results.', fromLibrary: 'Library',
    post: 'Post', text: 'Text', preview: 'Preview', format: 'Format', fromLibraryHint: 'Taken from the library',
    textLabel: 'Post text', caption: 'Caption', placeholder: 'Write your post, or load an item from the library.',
    emoji: 'Add an emoji', tone: 'Rewrite the tone', undo: 'Undo the rewrite', rewriting: 'Rewriting…',
    hashtags: 'Hashtags', hashtagsPh: '#brand #city', suggestTags: 'Suggest hashtags from the text', suggestingTags: 'Finding hashtags…', media: 'Media', addMedia: 'Image or video', addVideo: 'Add a video',
    replace: 'Replace', remove: 'Remove the media', play: 'Play', pause: 'Pause', mute: 'Mute', unmute: 'Unmute',
    mediaHint: (n: string) => `${n} recommended. 50 MB max.`, fileTooBig: 'File over 50 MB.',
    publishTo: 'Publish to', buffer: 'Your connected accounts', chosen: (n: number) => `${n} selected`,
    noAccounts: 'No social media account is connected. Contact your FlowCom manager.', unavailable: 'Publishing is unavailable right now. If it lasts, contact your FlowCom manager.', loadingAccounts: 'Loading accounts…',
    tooLong: 'Too long', needsMedia: 'Media required', needsVideo: 'Video required', shortVersion: 'Short version',
    shortFor: (n: string) => `Short version for ${n}`, writingShort: 'Writing…', removeShort: 'Back to the shared text', shortLabel: (n: string) => `Text for ${n}`,
    when: 'When', now: 'Now', schedule: 'Schedule', date: 'Date', time: 'Time',
    fromCalendar: 'Date planned in the editorial calendar. Local time.', localTime: "Your device's local time.",
    campaign: 'Campaign', noCampaign: 'No campaign', utm: "Links get the campaign's tracking code.",
    check: 'Pre-send check', checkOk: 'Ready to go', checkOkText: 'Nothing blocks sending.',
    points: (n: number) => (n > 1 ? `${n} things to fix before sending` : '1 thing to fix before sending'),
    lengthIssue: (n: string, len: number, lim: number) => `Too long for ${n}: ${len} characters for a limit of ${lim}.`,
    mediaIssue: (n: string) => `${n} refuses a post without an image or video.`, videoIssue: (n: string) => `${n} only accepts videos.`,
    placeholderIssue: (p: string) => `${p} still ${p.includes(',') ? 'need' : 'needs'} replacing.`,
    aiIssues: 'AI remarks', sendAnyway: 'Send anyway', reviewing: 'Checking…',
    sendNow: (n: number) => `Publish to ${n} account${n > 1 ? 's' : ''}`, sendLater: (n: number, when: string) => `Schedule on ${n} account${n > 1 ? 's' : ''} · ${when}`,
    pickAccount: 'Choose at least one account', pickDate: 'Choose a date and time', pastDate: 'This date has already passed.',
    sending: 'Sending…', uploading: 'Uploading media…',
    doneNow: (n: number) => `Published to ${n} account${n > 1 ? 's' : ''}`, doneLater: (n: number, when: string) => `Scheduled on ${n} account${n > 1 ? 's' : ''} for ${when}`,
    doneText: 'Publishing is under way. You will find this post in Publications.', history: 'See publications', another: 'New post',
    seeMore: 'see more', nowLabel: 'now', emptyPreview: 'Write some text to see the preview.',
    error: 'Error', noText: 'Write some text before sending.',
  },
}
type Copy = typeof COPY.fr

// Splits trailing hashtags off a library item's text.
function splitBodyAndTags(item: LibraryItem): { body: string; tags: string } {
  const body = (item.body ?? '').trimEnd()
  const tags = (item.hashtags ?? '').trim()
  if (tags) return { body: body.endsWith(tags) ? body.slice(0, -tags.length).trimEnd() : body, tags }
  const match = body.match(/^([\s\S]*?)\n{1,2}((?:#[\p{L}\p{N}_]+\s*)+)$/u)
  return match ? { body: match[1].trimEnd(), tags: match[2].trim() } : { body, tags: '' }
}

const libraryFormat = (format: string): ContentFormat =>
  format === 'carousel' ? 'Carousel' : format === 'video' ? 'Video' : format === 'story' ? 'Story' : 'Post'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StudioPage() {
  const { lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const locale = L === 'fr' ? 'fr-FR' : 'en-GB'
  const { theme } = useTheme()
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const { channels, loading: loadingChannels, error: bufferError } = useBuffer()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { campaigns, zoneLabel } = useCampaignOptions(activeCompany?.id)

  const [content, setContent] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [format, setFormat] = useState<ContentFormat>('Post')
  const [media, setMedia] = useState<SelectedMedia[]>([])
  const [selected, setSelected] = useState<string[]>([])
  // Text written for one account only (a short version for X, for example).
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [shortening, setShortening] = useState<string | null>(null)
  const [campaignId, setCampaignId] = useState(searchParams.get('campaign') ?? '')
  const [mode, setMode] = useState<'now' | 'later'>('now')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [fromCalendarDate, setFromCalendarDate] = useState(false)
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([])
  const [source, setSource] = useState<LibraryItem | null>(null)
  const [tab, setTab] = useState<'text' | 'preview'>('text')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [toneOpen, setToneOpen] = useState(false)
  const [toning, setToning] = useState<ToneId | null>(null)
  const [beforeTone, setBeforeTone] = useState<string | null>(null)
  const [aiIssues, setAiIssues] = useState<string[] | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'sending'>('idle')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ count: number; when: string | null } | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const mediaInput = useRef<HTMLInputElement>(null)

  const campaign = campaigns.find(cp => cp.id === campaignId)
  const selectedChannels = channels.filter(ch => selected.includes(ch.id))

  // The publishing service's own errors are for FlowCom's team, not the client.
  useEffect(() => { if (bufferError) { console.warn('Publishing service:', bufferError); setError(c.unavailable) } }, [bufferError]) // eslint-disable-line react-hooks/exhaustive-deps

  // Select the first account once Buffer answers.
  useEffect(() => {
    if (channels.length && !selected.length) setSelected([channels[0].id])
  }, [channels]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true
    if (!activeCompany) { setLibraryItems([]); return }
    listDataverseLibraryItems(activeCompany.id).then(items => { if (alive) setLibraryItems(items) }).catch(() => {})
    return () => { alive = false }
  }, [activeCompany?.id])

  const loadItem = useCallback((item: LibraryItem) => {
    const { body, tags } = splitBodyAndTags(item)
    setContent(body)
    setHashtags(tags)
    setFormat(libraryFormat(item.format))
    setSource(item)
    setOverrides({})
    setBeforeTone(null)
    setAiIssues(null)
    setDone(null)
    if (item.campaign_id && !campaignId) setCampaignId(item.campaign_id)
    const target = channels.filter(ch => networkOf(ch) === item.channel).map(ch => ch.id)
    if (target.length) setSelected(target)
  }, [channels, campaignId])

  // ?item= preloads a library item (once the library and accounts are known),
  // ?text= a draft from the assistant, ?calendar= the idea's planned date.
  const preloaded = useRef(false)
  useEffect(() => {
    if (preloaded.current) return
    const id = searchParams.get('item')
    const draft = searchParams.get('text')
    if (draft) { setContent(draft); preloaded.current = true; return }
    if (!id) { preloaded.current = true; return }
    const item = libraryItems.find(i => i.id === id)
    if (item && (channels.length || !loadingChannels)) { loadItem(item); preloaded.current = true }
  }, [libraryItems, channels, loadingChannels, searchParams, loadItem])

  useEffect(() => {
    const calendarId = searchParams.get('calendar')
    if (!calendarId || !activeCompany) return
    listDataverseCalendarItems(activeCompany.id).then(items => {
      const idea = items.find(i => i.id === calendarId)
      if (idea?.date && idea.date >= new Date().toISOString().slice(0, 10)) {
        setDate(idea.date.slice(0, 10))
        setMode('later')
        setFromCalendarDate(true)
      }
    }).catch(() => {})
  }, [searchParams, activeCompany?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Text per account: its own version, or the shared text plus hashtags.
  const sharedText = useMemo(() => {
    const body = content.trim()
    const tags = hashtags.trim()
    return tags ? `${body}\n\n${tags}` : body
  }, [content, hashtags])
  const textFor = (channel: BufferChannel) => overrides[channel.id] ?? sharedText

  // ── Media
  const addFiles = (files: FileList | null) => {
    if (!files) return
    const valid = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (valid.some(f => f.size > MAX_FILE)) { setError(c.fileTooBig); return }
    const added = valid.map(file => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file),
      kind: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
    }))
    if (!added.length) return
    const hasVideo = added.some(m => m.kind === 'video')
    setMedia(prev => {
      // A video replaces what was there: one video per post.
      if (hasVideo) { prev.forEach(m => URL.revokeObjectURL(m.previewUrl)); return [added.find(m => m.kind === 'video')!] }
      const next = [...prev.filter(m => m.kind === 'image'), ...added]
      if (next.length > 1 && format === 'Post') setFormat('Carousel')
      return next
    })
    if (hasVideo && format !== 'Video' && format !== 'Story') setFormat('Video')
    added.filter(m => m.kind === 'video').forEach(m => {
      const probe = document.createElement('video')
      probe.preload = 'metadata'
      probe.onloadedmetadata = () => setMedia(prev => prev.map(x => (x.id === m.id ? { ...x, duration: probe.duration } : x)))
      probe.src = m.previewUrl
    })
  }

  const removeMedia = (id: string) => setMedia(prev => {
    const target = prev.find(m => m.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    return prev.filter(m => m.id !== id)
  })

  const uploadMedia = async (item: SelectedMedia): Promise<string> => {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) throw new Error('Cloudinary not configured.')
    const body = new FormData()
    body.append('file', item.file)
    body.append('upload_preset', CLOUDINARY_UPLOAD_PRESET)
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${item.kind}/upload`, { method: 'POST', body })
    const result = await res.json() as { secure_url?: string; error?: { message?: string } }
    if (!res.ok || !result.secure_url) throw new Error(result.error?.message ?? 'Upload failed')
    return result.secure_url
  }

  // ── AI helpers
  const context = () => buildAiContext({ company: activeCompany, products, segments, keyMessages })

  const applyTone = async (tone: typeof TONES[number]) => {
    if (!content.trim() || !activeCompany) return
    setToning(tone.id)
    setError('')
    try {
      const result = await callModel(activeCompany.id, [
        { role: 'system', content: `You are a social media copywriter. ${tone.prompt}\n\nBrand context:\n${context()}\n\nReturn ONLY the rewritten post, without hashtags, explanation or quotes. Keep placeholders in brackets such as [DATE] unchanged. Respond in ${L === 'fr' ? 'French' : 'English'}.` },
        { role: 'user', content: content.trim() },
      ], { temperature: 0.75, max_tokens: 1024 })
      const cleaned = result.trim().replace(/^["']|["']$/g, '')
      if (cleaned) { setBeforeTone(content); setContent(cleaned); setAiIssues(null) }
      setToneOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setToning(null)
    }
  }

  // Hashtags drawn from the text; how many depends on the networks chosen.
  const [taggingBusy, setTaggingBusy] = useState(false)
  const suggestHashtags = async () => {
    if (!content.trim() || !activeCompany) return
    setTaggingBusy(true)
    setError('')
    const networks = [...new Set(selectedChannels.map(networkOf))]
    const count = networks.some(n => n === 'instagram') ? '5 to 8' : networks.some(n => n === 'twitter') ? '1 or 2' : '3 to 5'
    try {
      const result = await callModel(activeCompany.id, [
        { role: 'system', content: `You choose hashtags for a social media post${networks.length ? ` on ${networks.join(', ')}` : ''}. Return ONLY ${count} hashtags separated by spaces, each starting with #, no other text. Mix specific and broader tags that people actually follow, include a local tag when the brand is local, and never repeat a hashtag already in the post. Write them in ${L === 'fr' ? 'French' : 'English'} unless a tag is usually in English.\n\nBrand context:\n${context()}` },
        { role: 'user', content: content.trim().slice(0, 2000) },
      ], { temperature: 0.4, max_tokens: 120 })
      const tags = [...new Set(result.match(/#[\p{L}\p{N}_]+/gu) ?? [])]
      if (tags.length) setHashtags(tags.join(' '))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setTaggingBusy(false)
    }
  }

  const writeShortVersion = async (channel: BufferChannel) => {
    const limit = CHANNEL_LIMITS[networkOf(channel)]
    if (!activeCompany || !limit) return
    setShortening(channel.id)
    setError('')
    try {
      const result = await callModel(activeCompany.id, [
        { role: 'system', content: `You adapt social media posts. Rewrite the post for ${CHANNEL_MAP[networkOf(channel)]?.label ?? channel.service} in at most ${limit - 10} characters INCLUDING hashtags. Keep the key message and the call to action, keep 1 or 2 of the most relevant hashtags, keep placeholders in brackets unchanged. Return ONLY the post. Respond in ${L === 'fr' ? 'French' : 'English'}.` },
        { role: 'user', content: sharedText },
      ], { temperature: 0.5, max_tokens: 400 })
      const text = result.trim().replace(/^["']|["']$/g, '')
      if (text) setOverrides(prev => ({ ...prev, [channel.id]: text }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setShortening(null)
    }
  }

  // ── Checks that block sending, computed as you type.
  const placeholders = [...new Set(selectedChannels.flatMap(ch => textFor(ch).match(PLACEHOLDER) ?? []))]
  const hasVideo = media.some(m => m.kind === 'video')
  const accountIssue = (channel: BufferChannel): { badge: string; text: string; tooLong?: boolean } | null => {
    const network = networkOf(channel)
    const label = CHANNEL_MAP[network]?.label ?? channel.service
    const limit = CHANNEL_LIMITS[network]
    const length = textFor(channel).length
    if (limit && length > limit) return { badge: c.tooLong, text: c.lengthIssue(label, length, limit), tooLong: true }
    if (NEEDS_VIDEO.has(network) && !hasVideo) return { badge: c.needsVideo, text: c.videoIssue(label) }
    if (NEEDS_MEDIA.has(network) && !media.length) return { badge: c.needsMedia, text: c.mediaIssue(label) }
    return null
  }
  const issues = [
    ...selectedChannels.map(ch => ({ channel: ch, issue: accountIssue(ch) })).filter((x): x is { channel: BufferChannel; issue: NonNullable<ReturnType<typeof accountIssue>> } => Boolean(x.issue)),
  ]
  const blocking = issues.length + (placeholders.length ? 1 : 0)

  const scheduledDate = mode === 'later' && date ? new Date(`${date}T${time || '09:00'}`) : null
  const whenLabel = scheduledDate
    ? scheduledDate.toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : ''
  const dateProblem = mode === 'later' && (!date ? c.pickDate : scheduledDate && scheduledDate.getTime() < Date.now() ? c.pastDate : '')

  const canSend = Boolean(activeCompany) && selectedChannels.length > 0 && Boolean(content.trim()) && !blocking && !dateProblem && phase === 'idle'

  // ── Publish
  const publish = async () => {
    if (!activeCompany || !selectedChannels.length) return
    setError('')
    setPhase('uploading')
    try {
      let uploaded = media
      if (media.some(m => !m.publicUrl)) {
        uploaded = []
        for (const item of media) uploaded.push({ ...item, publicUrl: item.publicUrl ?? await uploadMedia(item) })
        setMedia(uploaded)
      }
      setPhase('sending')
      const assets = uploaded.filter(m => m.publicUrl).map(m => (m.kind === 'video' ? `{ video: { url: "${m.publicUrl}" } }` : `{ image: { url: "${m.publicUrl}" } }`))
      const scheduling = scheduledDate
        ? `schedulingType: customScheduled, mode: customScheduled, dueAt: "${scheduledDate.toISOString()}"`
        : 'schedulingType: automatic, mode: shareNow'
      const results = await Promise.all(selectedChannels.map(channel => {
        const service = channel.service.toLowerCase()
        const meta = service === 'facebook' ? 'metadata: { facebook: { type: post } }' : service === 'instagram' ? 'metadata: { instagram: { type: feed } }' : ''
        // Tag links with the campaign's tracking code, per network.
        const text = campaign ? addUtm(textFor(channel), campaign.tracking_code, service || 'social') : textFor(channel)
        return bufferQuery(activeCompany.id, `
          mutation CreatePost($text: String!, $channelId: ChannelId!) {
            createPost(input: { text: $text, channelId: $channelId, ${scheduling} ${meta}
              ${assets.length ? `assets: [${assets.join(',')}]` : ''} }) {
              ... on PostActionSuccess { post { id dueAt } }
              ... on MutationError { message }
            }
          }`, { text, channelId: channel.id })
      }))
      const failed = results.find(r => r?.createPost?.message)
      if (failed) throw new Error(failed.createPost.message)

      // Record each post on the timeline and its campaign; never undo a successful send over this.
      const postIds: string[] = results.map(r => r?.createPost?.post?.id).filter(Boolean)
      await Promise.all([
        ...postIds.map(postId => recordPostPublished(activeCompany.id, campaignId || null, postId, sharedText)),
        ...(campaignId && source ? [setContentCampaign('library', source.id, campaignId)] : []),
      ]).catch(recordError => console.warn('Published, but could not record the post on the timeline', recordError))
      if (source) {
        await updateDataverseLibraryItem(source.id, { status: 'Published' }).catch(() => {})
        setLibraryItems(items => items.map(i => (i.id === source.id ? { ...i, status: 'Published' } : i)))
      }
      // A post written from a calendar idea moves that idea forward.
      const calendarId = searchParams.get('calendar')
      if (calendarId) {
        await updateDataverseCalendarItem(calendarId, { status: scheduledDate ? 'scheduled' : 'published' })
          .catch(calendarError => console.warn('Published, but could not update the calendar idea', calendarError))
      }
      window.dispatchEvent(new Event('flowcom:data-updated'))
      setDone({ count: selectedChannels.length, when: scheduledDate ? whenLabel : null })
    } catch (err) {
      setError(`${c.error}${L === 'fr' ? ' :' : ':'} ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setPhase('idle')
    }
  }

  // The AI reviews brand fit before sending; its remarks never block, they ask.
  const review = async () => {
    if (!canSend) return
    if (!apiKeyConfigured || !activeCompany || aiIssues !== null) { void publish(); return }
    setReviewing(true)
    try {
      const result = await callModelJSON<{ issues_fr: string[]; issues_en: string[] }>(activeCompany.id, [
        { role: 'system', content: `You are a social media publishing assistant doing a quick pre-flight check. Return ONLY JSON {"issues_fr":["string"],"issues_en":["string"]} with 0 to 2 issues each (max 18 words each). Flag ONLY real problems: no call to action when the goal is conversion, tone clearly off-brand${campaign ? ", clear mismatch with the campaign's key message, audience, objective or zone" : ''}. Length and missing media are already checked: do not mention them. A fine post returns empty arrays. Brand context:\n${context()}${campaign ? `\n\nCampaign:\n${buildCampaignContext(campaign, { segments, keyMessages, zoneLabel: zoneLabel(campaign) })}` : ''}` },
        { role: 'user', content: `Post (${format}) for ${selectedChannels.map(ch => ch.service).join(', ')}:\n${sharedText.slice(0, 1500)}` },
      ], { temperature: 0.1, max_tokens: 250, requiredKeys: ['issues_fr', 'issues_en'] })
      const list = (L === 'fr' ? result.issues_fr : result.issues_en)
      const clean = Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string').slice(0, 2) : []
      if (clean.length) setAiIssues(clean)
      else void publish()
    } catch {
      void publish()
    } finally {
      setReviewing(false)
    }
  }

  const reset = () => {
    media.forEach(m => URL.revokeObjectURL(m.previewUrl))
    setContent(''); setHashtags(''); setMedia([]); setOverrides({}); setSource(null); setBeforeTone(null)
    setAiIssues(null); setDone(null); setMode('now'); setDate(''); setFromCalendarDate(false); setFormat('Post')
    window.history.replaceState({}, '', '/studio')
  }

  const toggleAccount = (id: string) => setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  const chooseCampaign = (id: string) => {
    setCampaignId(id)
    const next = campaigns.find(cp => cp.id === id)
    if (!next) return
    const matching = channels.filter(ch => bufferChannelMatchesCampaign(ch.service, next)).map(ch => ch.id)
    if (matching.length) setSelected(matching)
  }

  const insertEmoji = (emoji: string) => {
    const el = textRef.current
    if (!el) { setContent(v => v + emoji); return }
    const start = el.selectionStart ?? content.length
    const end = el.selectionEnd ?? content.length
    setContent(content.slice(0, start) + emoji + content.slice(end))
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + emoji.length })
  }

  const vertical = format === 'Video' || format === 'Story'
  const mediaShape = vertical ? (L === 'fr' ? 'vertical 9:16' : 'Vertical 9:16') : format === 'Carousel' ? (L === 'fr' ? 'carré ou 4:5, plusieurs images' : 'Square or 4:5, several images') : (L === 'fr' ? 'carré ou 4:5' : 'Square or 4:5')
  const counters = selectedChannels.map(ch => {
    const network = networkOf(ch)
    const limit = CHANNEL_LIMITS[network]
    return { id: ch.id, label: CHANNEL_MAP[network]?.label ?? ch.service, length: textFor(ch).length, limit, own: ch.id in overrides }
  }).filter((x, i, all) => x.limit && all.findIndex(y => y.label === x.label && y.own === x.own) === i)

  if (done) {
    return (
      <div className="min-h-full bg-surface-page">
        <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success"><Check className="h-6 w-6" /></span>
          <h1 className="m-0 text-[22px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>
            {done.when ? c.doneLater(done.count, done.when) : c.doneNow(done.count)}
          </h1>
          <p className="m-0 text-sm text-ink-muted">{c.doneText}</p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/publishing-history')}>{c.history}</Button>
            <Button variant="primary" icon={<Plus />} onClick={reset}>{c.another}</Button>
          </div>
        </div>
      </div>
    )
  }

  const busy = phase !== 'idle' || reviewing
  const sendLabel = phase === 'uploading' ? c.uploading : phase === 'sending' ? c.sending : reviewing ? c.reviewing
    : !selectedChannels.length ? c.pickAccount
      : mode === 'later' && scheduledDate ? c.sendLater(selectedChannels.length, whenLabel) : c.sendNow(selectedChannels.length)

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{c.subtitle}</p>
          </div>
          <LibrarySearch items={libraryItems} c={c} onSelect={loadItem} />
        </div>

        {error && (
          <p className="m-0 flex items-start gap-2 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="flex-1">{error}</span>
            <button onClick={() => setError('')} aria-label="OK" className="shrink-0"><X className="h-4 w-4" /></button>
          </p>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── Post */}
          <Card className="flex min-w-0 flex-col">
            <CardHeader
              title={<span className="flex flex-wrap items-center gap-2.5">{c.post}
                {source && <span className="text-[12px] font-normal text-ink-muted">{c.fromLibrary} · {source.title}</span>}</span>}
              actions={<Tabs value={tab} onChange={setTab} className="border-0" tabs={[{ id: 'text', label: c.text }, { id: 'preview', label: c.preview }]} />} />
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="fc-label">{c.format}</span>
                <div role="radiogroup" aria-label={c.format} className="flex flex-wrap gap-1.5">
                  {FORMATS.map(f => (
                    <Chip key={f.value} pressed={format === f.value} icon={<f.icon className="h-3.5 w-3.5" />} onClick={() => setFormat(f.value)}>{f.label[L]}</Chip>
                  ))}
                </div>
                {source && libraryFormat(source.format) === format && <span className="fc-hint">{c.fromLibraryHint}</span>}
              </div>

              {tab === 'preview' ? (
                <Preview channels={selectedChannels} textFor={textFor} media={media} format={format} c={c} />
              ) : (
                <div className={cn('grid gap-4', vertical && 'sm:grid-cols-[210px_minmax(0,1fr)]')}>
                  {vertical && (
                    <VerticalMedia media={media} c={c} onPick={() => mediaInput.current?.click()} onRemove={removeMedia} hint={c.mediaHint(mediaShape)} />
                  )}
                  <div className="flex min-w-0 flex-col gap-3">
                    <label className="fc-field">
                      <span className={cn('fc-label', !vertical && 'sr-only')}>{vertical ? c.caption : c.textLabel}</span>
                      <textarea ref={textRef} className="fc-input min-h-[260px] resize-y px-3.5 py-3 text-sm leading-[21px]" rows={vertical ? 8 : 12}
                        value={content} placeholder={c.placeholder} onChange={e => { setContent(e.target.value); setAiIssues(null) }} />
                    </label>
                    <div className="relative flex flex-wrap items-center gap-1">
                      <div className="relative">
                        <Button variant="ghost" size="sm" iconOnly icon={<Smile />} aria-label={c.emoji} aria-expanded={emojiOpen} onClick={() => setEmojiOpen(o => !o)} />
                        {emojiOpen && (
                          <Popover onClose={() => setEmojiOpen(false)} className="bottom-full left-0 mb-2">
                            <EmojiPicker onEmojiClick={(d: EmojiClickData) => insertEmoji(d.emoji)} theme={theme === 'dark' ? EmojiTheme.DARK : EmojiTheme.LIGHT} width={300} height={360} lazyLoadEmojis />
                          </Popover>
                        )}
                      </div>
                      <div className="relative">
                        <Button variant="ghost" size="sm" icon={<Spark />} aria-expanded={toneOpen} disabled={!content.trim() || !apiKeyConfigured}
                          onClick={() => setToneOpen(o => !o)}>{toning ? c.rewriting : c.tone}</Button>
                        {toneOpen && (
                          <Popover onClose={() => setToneOpen(false)} className="bottom-full left-0 mb-2 w-52 p-1.5">
                            {TONES.map(tone => (
                              <button key={tone.id} disabled={Boolean(toning)} onClick={() => void applyTone(tone)}
                                className="flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] text-ink hover:bg-surface-sunken disabled:opacity-60">
                                {tone[L]}{toning === tone.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              </button>
                            ))}
                          </Popover>
                        )}
                      </div>
                      {beforeTone !== null && (
                        <Button variant="ghost" size="sm" icon={<RotateCcw />} onClick={() => { setContent(beforeTone); setBeforeTone(null) }}>{c.undo}</Button>
                      )}
                      <span className="flex-1" />
                      <span className="flex flex-wrap gap-x-3 text-[12px] tabular-nums text-ink-muted">
                        {counters.map(k => (
                          <span key={k.id} className={cn(k.limit && k.length > k.limit && 'font-semibold text-warning')}>
                            {k.label} {k.length.toLocaleString(locale)}/{k.limit!.toLocaleString(locale)}{k.own ? ` · ${c.shortVersion.toLowerCase()}` : ''}
                          </span>
                        ))}
                      </span>
                    </div>
                    <label className="fc-field">
                      <span className="fc-label">{c.hashtags}</span>
                      <span className="relative block">
                        <input className="fc-input" style={{ paddingRight: 44 }} value={hashtags} placeholder={c.hashtagsPh} onChange={e => setHashtags(e.target.value)} />
                        <button type="button" onClick={() => void suggestHashtags()} disabled={!content.trim() || !apiKeyConfigured || taggingBusy}
                          aria-label={taggingBusy ? c.suggestingTags : c.suggestTags} title={taggingBusy ? c.suggestingTags : c.suggestTags}
                          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-[var(--radius-sm)] text-[var(--accent-ink)] hover:bg-accent-soft disabled:opacity-40">
                          {taggingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Spark className="h-4 w-4" />}
                        </button>
                      </span>
                    </label>
                    {!vertical && (
                      <div className="fc-field">
                        <span className="fc-label">{c.media}</span>
                        <div className="flex flex-wrap items-end gap-2">
                          {media.map(m => (
                            <span key={m.id} className="relative h-24 w-24 overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-sunken">
                              {m.kind === 'video' ? <video src={m.previewUrl} className="h-full w-full object-cover" muted /> : <img src={m.previewUrl} alt="" className="h-full w-full object-cover" />}
                              <button onClick={() => removeMedia(m.id)} aria-label={c.remove}
                                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"><X className="h-3.5 w-3.5" /></button>
                            </span>
                          ))}
                          <button onClick={() => mediaInput.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                            className="flex h-24 w-24 flex-col items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-line-strong bg-surface-card text-[12px] font-semibold text-ink-muted hover:border-brand hover:text-ink">
                            <Plus className="h-5 w-5" />{c.addMedia}
                          </button>
                        </div>
                        <p className="fc-hint m-0">{c.mediaHint(mediaShape)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <input ref={mediaInput} type="file" accept={vertical ? 'video/*,image/*' : 'image/*,video/*'} multiple={!vertical} className="hidden"
                onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            </CardBody>
          </Card>

          {/* ── Sending: one panel, sections split by lines */}
          <section className="fc-card flex min-w-0 flex-col lg:sticky lg:top-4" aria-label={c.publishTo}>
            <div className="flex flex-col gap-2 p-[var(--card-pad)]">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="fc-card__title">{c.publishTo}</h3>
                {selectedChannels.length > 0 && <span className="text-[12px] text-ink-muted">{c.chosen(selectedChannels.length)}</span>}
              </div>
              {loadingChannels && <p className="m-0 flex items-center gap-2 text-[13px] text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" />{c.loadingAccounts}</p>}
              {!loadingChannels && !channels.length && (
                <p className="m-0 text-[13px] text-ink-muted">{c.noAccounts}</p>
              )}
              <div className="-mx-2 flex flex-col">
                {channels.map(ch => {
                  const on = selected.includes(ch.id)
                  const issue = on ? accountIssue(ch) : null
                  const def = CHANNEL_MAP[networkOf(ch)]
                  return (
                    <div key={ch.id} className="flex flex-col">
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-2 py-1.5 hover:bg-surface-sunken">
                        <input type="checkbox" checked={on} onChange={() => toggleAccount(ch.id)} className="h-4 w-4 shrink-0 accent-[var(--brand)]" />
                        <span className="relative h-7 w-7 shrink-0">
                          {ch.avatar
                            ? <img src={ch.avatar} alt="" className="h-7 w-7 rounded-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
                            : <span className="grid h-7 w-7 place-items-center rounded-full bg-surface-sunken text-[11px] font-bold text-ink-muted">{ch.name.replace('@', '').charAt(0).toUpperCase()}</span>}
                          {def && <span className="absolute -bottom-0.5 -right-0.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-surface-card"><def.icon className="h-2.5 w-2.5" style={{ color: def.color }} /></span>}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          <span className="font-semibold">{ch.name}</span> <span className="text-ink-muted">· {def?.label ?? ch.service}</span>
                        </span>
                        {issue && <span className="shrink-0 text-[12px] font-semibold text-warning">{issue.badge}</span>}
                        {on && !issue && ch.id in overrides && <span className="shrink-0 text-[12px] text-ink-muted">{c.shortVersion}</span>}
                      </label>
                      {on && ch.id in overrides && (
                        <div className="mb-1.5 ml-8 mr-2 flex flex-col gap-1">
                          <textarea aria-label={c.shortLabel(ch.name)} className="fc-input" rows={3} value={overrides[ch.id]}
                            style={{ fontSize: 13, lineHeight: '19px', padding: '8px 10px' }}
                            onChange={e => setOverrides(prev => ({ ...prev, [ch.id]: e.target.value }))} />
                          <button className="self-start text-[12px] font-semibold text-ink-muted hover:text-ink"
                            onClick={() => setOverrides(prev => { const next = { ...prev }; delete next[ch.id]; return next })}>{c.removeShort}</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2.5 border-t border-line p-[var(--card-pad)]">
              <h3 className="fc-card__title">{c.when}</h3>
              <div role="radiogroup" aria-label={c.when} className="grid grid-cols-2 gap-1.5">
                <Chip pressed={mode === 'now'} className="justify-center" onClick={() => setMode('now')}>{c.now}</Chip>
                <Chip pressed={mode === 'later'} className="justify-center" onClick={() => setMode('later')}>{c.schedule}</Chip>
              </div>
              {mode === 'later' && (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                    <TextField label={c.date} type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => { setDate(e.target.value); setFromCalendarDate(false) }} />
                    <TextField label={c.time} type="time" value={time} onChange={e => setTime(e.target.value)} />
                  </div>
                  <p className={cn('fc-hint m-0', dateProblem && dateProblem !== c.pickDate && 'text-danger')}>{dateProblem && dateProblem !== c.pickDate ? dateProblem : fromCalendarDate ? c.fromCalendar : c.localTime}</p>
                </>
              )}
              {campaigns.length > 0 && (
                <SelectField label={c.campaign} value={campaignId} onChange={e => chooseCampaign(e.target.value)} hint={campaign?.tracking_code ? c.utm : undefined}>
                  <option value="">{c.noCampaign}</option>
                  {campaigns.map(cp => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
                </SelectField>
              )}
              {campaign && campaignWarnings(campaign, L).map(w => (
                <p key={w} className="m-0 flex items-center gap-1.5 text-[12px] text-warning"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{w}</p>
              ))}
            </div>

            {selectedChannels.length > 0 && content.trim() && (blocking > 0 || (aiIssues?.length ?? 0) > 0) && (
              <div className="flex flex-col gap-2 border-t border-line bg-warning-soft/50 p-[var(--card-pad)] text-[13px] leading-[19px] text-ink">
                <p className="m-0 flex items-center gap-1.5 font-semibold">
                  {blocking ? <AlertCircle className="h-4 w-4 shrink-0 text-warning" /> : <Spark className="h-4 w-4 shrink-0" />}
                  {blocking ? c.points(blocking) : c.aiIssues}
                </p>
                <ul className="m-0 flex flex-col gap-1 pl-5 text-ink-muted">
                  {blocking > 0 && issues.map(({ channel, issue }) => <li key={channel.id}>{issue.text}</li>)}
                  {blocking > 0 && placeholders.length > 0 && <li>{c.placeholderIssue(placeholders.join(', '))}</li>}
                  {!blocking && aiIssues?.map(i => <li key={i}>{i}</li>)}
                </ul>
                {blocking > 0 && issues.filter(x => x.issue.tooLong).map(({ channel }) => (
                  <Button key={channel.id} variant="secondary" size="sm" className="self-start" disabled={!apiKeyConfigured || Boolean(shortening)}
                    loading={shortening === channel.id} onClick={() => void writeShortVersion(channel)}>
                    {shortening === channel.id ? c.writingShort : c.shortFor(CHANNEL_MAP[networkOf(channel)]?.label ?? channel.service)}
                  </Button>
                ))}
                {!blocking && <Button variant="secondary" size="sm" className="self-start" disabled={busy} onClick={() => void publish()}>{c.sendAnyway}</Button>}
              </div>
            )}

            <div className="border-t border-line p-[var(--card-pad)]">
              <Button variant="primary" className="w-full" icon={mode === 'later' ? <CalendarClock /> : <Send />} loading={busy} disabled={!canSend || busy}
                onClick={() => void review()}>{sendLabel}</Button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Popover({ onClose, className, children }: { onClose: () => void; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [onClose])
  return <div ref={ref} className={cn('absolute z-40 rounded-[var(--radius-lg)] border border-line bg-surface-overlay shadow-[var(--shadow-lg)]', className)}>{children}</div>
}

function LibrarySearch({ items, c, onSelect }: { items: LibraryItem[]; c: Copy; onSelect: (item: LibraryItem) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const q = query.trim().toLowerCase()
  const results = q ? items.filter(i => i.status !== 'Archived' && [i.title, i.body].some(v => v?.toLowerCase().includes(q))).slice(0, 8) : []
  return (
    <div className="relative w-full sm:w-80">
      <label className="relative block">
        <span className="sr-only">{c.loadLibrary}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <input className="fc-input" style={{ paddingLeft: 36 }} value={query} placeholder={c.loadLibrary} onFocus={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true) }} />
      </label>
      {open && q && (
        <Popover onClose={() => setOpen(false)} className="left-0 right-0 top-full mt-1 max-h-80 overflow-y-auto p-1">
          {!results.length && <p className="m-0 px-3 py-2.5 text-[13px] text-ink-muted">{c.noResult}</p>}
          {results.map(item => {
            const def = CHANNEL_MAP[item.channel]
            return (
              <button key={item.id} onClick={() => { onSelect(item); setQuery(''); setOpen(false) }}
                className="flex w-full items-start gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left hover:bg-surface-sunken">
                {def && <def.icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: def.color }} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-ink">{item.title || '—'}</span>
                  <span className="block truncate text-[12px] text-ink-muted">{item.body}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">{FORMAT_MAP[libraryFormat(item.format)].label[c === COPY.fr ? 'fr' : 'en']}</span>
              </button>
            )
          })}
        </Popover>
      )}
    </div>
  )
}

function VerticalMedia({ media, c, onPick, onRemove, hint }: {
  media: SelectedMedia[]; c: Copy; onPick: () => void; onRemove: (id: string) => void; hint: string
}) {
  const item = media[0]
  const video = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const [current, setCurrent] = useState(0)
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

  const toggle = () => {
    const v = video.current
    if (!v) return
    if (v.paused) { void v.play(); setPlaying(true) } else { v.pause(); setPlaying(false) }
  }

  return (
    <div className="flex flex-col gap-2">
      {item ? (
        <div className="relative aspect-[9/16] w-full max-w-[210px] overflow-hidden rounded-[var(--radius-lg)] bg-black">
          {item.kind === 'video' ? (
            <>
              <video ref={video} src={item.previewUrl} className="h-full w-full object-contain" playsInline onClick={toggle}
                onEnded={() => setPlaying(false)}
                onTimeUpdate={() => { const v = video.current; if (v?.duration) { setProgress((v.currentTime / v.duration) * 100); setCurrent(v.currentTime) } }} />
              {!playing && (
                <button onClick={toggle} aria-label={c.play} className="absolute inset-0 grid place-items-center">
                  <span className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-white"><Play className="ml-0.5 h-5 w-5" fill="currentColor" /></span>
                </button>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-[11px] font-semibold text-white">
                <button onClick={toggle} aria-label={playing ? c.pause : c.play} className="grid h-6 w-6 place-items-center">{playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                <span className="relative h-1 flex-1 cursor-pointer rounded-full bg-white/35"
                  onClick={e => { const v = video.current; if (!v?.duration) return; const r = e.currentTarget.getBoundingClientRect(); v.currentTime = ((e.clientX - r.left) / r.width) * v.duration }}>
                  <span className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${progress}%` }} />
                </span>
                <span>{fmt(current)}{item.duration ? ` / ${fmt(item.duration)}` : ''}</span>
                <button onClick={() => { const v = video.current; if (v) { v.muted = !v.muted; setMuted(v.muted) } }} aria-label={muted ? c.unmute : c.mute} className="grid h-6 w-6 place-items-center">
                  {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            </>
          ) : (
            <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <button onClick={onPick} className="flex aspect-[9/16] w-full max-w-[210px] flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-line-strong bg-surface-card text-[13px] font-semibold text-ink-muted hover:border-brand hover:text-ink">
          <Plus className="h-6 w-6" />{c.addVideo}
        </button>
      )}
      {item && (
        <div className="flex max-w-[210px] gap-1.5">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onPick}>{c.replace}</Button>
          <Button variant="ghost" size="sm" iconOnly icon={<X />} aria-label={c.remove} onClick={() => onRemove(item.id)} />
        </div>
      )}
      <p className="fc-hint m-0 max-w-[210px]">{hint}</p>
    </div>
  )
}

function Preview({ channels, textFor, media, format, c }: {
  channels: BufferChannel[]; textFor: (ch: BufferChannel) => string; media: SelectedMedia[]; format: ContentFormat; c: Copy
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const active = channels.find(ch => ch.id === activeId) ?? channels[0]
  if (!active) return <p className="m-0 text-sm text-ink-muted">{c.pickAccount}</p>
  const text = textFor(active)
  if (!text.trim()) return <p className="m-0 text-sm text-ink-muted">{c.emptyPreview}</p>
  const network = networkOf(active)
  const square = network === 'linkedin'
  const first = media[0]
  const vertical = format === 'Video' || format === 'Story'
  return (
    <div className="flex flex-col gap-3">
      {channels.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {channels.map(ch => {
            const def = CHANNEL_MAP[networkOf(ch)]
            return <Chip key={ch.id} pressed={ch.id === active.id} icon={def ? <def.icon className="h-3.5 w-3.5" style={{ color: def.color }} /> : undefined} onClick={() => setActiveId(ch.id)}>{ch.name}</Chip>
          })}
        </div>
      )}
      <div className={cn('overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-card', vertical ? 'max-w-[300px]' : 'max-w-[480px]')}>
        <div className="flex items-center gap-2 px-3 py-2.5">
          {active.avatar
            ? <img src={active.avatar} alt="" className={cn('h-9 w-9 object-cover', square ? 'rounded-[var(--radius-sm)]' : 'rounded-full')} />
            : <span className={cn('grid h-9 w-9 place-items-center bg-brand text-[13px] font-bold text-on-brand', square ? 'rounded-[var(--radius-sm)]' : 'rounded-full')}>{active.name.replace('@', '').charAt(0).toUpperCase()}</span>}
          <span className="min-w-0"><span className="block truncate text-[13px] font-semibold text-ink">{active.name}</span><span className="block text-[11px] text-ink-muted">{c.nowLabel}</span></span>
        </div>
        {!vertical && (
          <p className="m-0 whitespace-pre-line px-3 pb-2.5 text-[13px] leading-[18px] text-ink">
            {text.length > 260 ? <>{text.slice(0, 260).trimEnd()}… <span className="font-semibold text-ink-muted">{c.seeMore}</span></> : text}
          </p>
        )}
        {first && (
          <div className={cn('relative bg-black', vertical ? 'aspect-[9/16]' : 'aspect-square')}>
            {first.kind === 'video' ? <video src={first.previewUrl} className="h-full w-full object-cover" muted /> : <img src={first.previewUrl} alt="" className="h-full w-full object-cover" />}
            {media.length > 1 && <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">1/{media.length}</span>}
          </div>
        )}
        {vertical && <p className="m-0 whitespace-pre-line px-3 py-2.5 text-[13px] leading-[18px] text-ink">{text.length > 150 ? `${text.slice(0, 150).trimEnd()}…` : text}</p>}
      </div>
    </div>
  )
}
