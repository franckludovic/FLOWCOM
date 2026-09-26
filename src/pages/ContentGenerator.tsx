import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, CalendarDays, Check, Copy, Library, Loader2, MoreHorizontal, Play, Plus, Send } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import { useCompany } from '@/contexts/CompanyContext'
import { useAuth } from '@/contexts/AuthContext'
import { callModelJSON, buildModelError } from '@/lib/model'
import { buildAiContext } from '@/lib/aiContext'
import { createDataverseLibraryItem } from '@/lib/dataverse'
import { setContentCampaign } from '@/lib/campaigns'
import { buildCampaignContext, campaignWarnings, CONTENT_CHANNEL, useCampaignOptions } from '@/lib/campaignContext'
import { CHANNELS, CHANNEL_MAP, FORMATS, FORMAT_MAP, suggestedFormat, type ContentFormat } from '@/lib/channels'
import {
  Badge, Button, Card, CardBody, CardHeader, Chip, InsightCard, SelectField, Spark, Tabs, TextAreaField, TextField, type Tone,
} from '@/components/ui'
import { cn } from '@/lib/utils'

// ─── What each network expects ────────────────────────────────────────────────

interface NetworkRules {
  limit: number | null
  rules: { fr: string[]; en: string[] }
  // Instructions given to the model for this network.
  prompt: string
  formats: ContentFormat[]
}

const NETWORK_RULES: Record<string, NetworkRules> = {
  linkedin: {
    limit: 3000, formats: ['Post', 'Carousel', 'Video'],
    rules: { fr: ['Accroche en 2 lignes', '3 à 5 hashtags', 'Lien en commentaire'], en: ['Hook in 2 lines', '3 to 5 hashtags', 'Link in the comments'] },
    prompt: 'The hook must fit in the first 2 lines (before "see more"). Short paragraphs, professional voice. 3 to 5 hashtags. Never put a link in the post: say it is in the first comment.',
  },
  facebook: {
    limit: 5000, formats: ['Post', 'Carousel', 'Video', 'Story'],
    rules: { fr: ['Texte court et direct', '1 à 3 hashtags', 'Question pour les commentaires'], en: ['Short, direct text', '1 to 3 hashtags', 'A question for comments'] },
    prompt: 'Keep it short and conversational. 1 to 3 hashtags. End with a question that invites comments.',
  },
  instagram: {
    limit: 2200, formats: ['Carousel', 'Story', 'Video', 'Post'],
    rules: { fr: ['Accroche dès la 1re ligne', '5 à 10 hashtags', "Appel à l'action en bio"], en: ['Hook in the first line', '5 to 10 hashtags', 'Call to action in bio'] },
    prompt: 'The first line is the hook. Links are not clickable: send people to the link in bio. 5 to 10 relevant hashtags.',
  },
  tiktok: {
    limit: 2200, formats: ['Video'],
    rules: { fr: ['Accroche en 2 secondes', 'Légende courte', '3 à 5 hashtags'], en: ['Hook within 2 seconds', 'Short caption', '3 to 5 hashtags'] },
    prompt: 'Vertical video. The hook must land in the first 2 seconds. The caption is one or two short lines. 3 to 5 hashtags.',
  },
  whatsapp: {
    limit: 700, formats: ['Story', 'Post', 'Video'],
    rules: { fr: ['Ton personnel', 'Message court', "Un seul appel à l'action"], en: ['Personal voice', 'Short message', 'One call to action'] },
    prompt: 'Personal, warm voice as if writing to a contact. Short. No hashtags. One clear call to action.',
  },
  twitter: {
    limit: 280, formats: ['Post', 'Video'],
    rules: { fr: ['280 caractères maximum', '1 à 2 hashtags', 'Une seule idée'], en: ['280 characters max', '1 to 2 hashtags', 'One idea'] },
    prompt: 'At most 280 characters including hashtags. One idea only. 1 or 2 hashtags.',
  },
  youtube: {
    limit: 5000, formats: ['Video'],
    rules: { fr: ['Titre accrocheur', 'Description avec mots-clés', "Appel à s'abonner"], en: ['Catchy title', 'Keyword-rich description', 'Ask to subscribe'] },
    prompt: 'Start with a catchy title line, then a description rich in search keywords, then a call to subscribe.',
  },
}
const DEFAULT_RULES: NetworkRules = {
  limit: null, formats: ['Post', 'Carousel', 'Video', 'Story'],
  rules: { fr: ['Structure claire', "Appel à l'action"], en: ['Clear structure', 'Call to action'] },
  prompt: 'Clear structure with a strong opening and a call to action.',
}
const rulesFor = (network: string) => NETWORK_RULES[network] ?? DEFAULT_RULES

const FORMAT_PROMPT: Record<ContentFormat, string> = {
  Post: '"content" is the complete ready-to-publish text (hook, body with line breaks, call to action), WITHOUT hashtags. "visualIdea" describes the ideal image.',
  Carousel: '"slides" holds 4 to 8 slides {"title","text"}: slide 1 is a cover that makes people swipe, one idea per slide, the last slide is the call to action. "content" is the caption, WITHOUT hashtags. "visualIdea" describes the visual style of the slides.',
  Video: '"content" is the script with [HOOK 0-3s], [SCENE 1], [SCENE 2]… including what is shown and what is said, ending with a spoken call to action. "visualIdea" describes the thumbnail or cover.',
  Story: '"content" holds 3 to 5 frames written "Frame 1: …", short text for vertical viewing, with poll or sticker ideas. "visualIdea" describes the background of the first frame.',
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

const COPY = {
  fr: {
    title: 'Générateur de contenu', subtitle: "Un post, écrit pour un réseau, à partir de votre mémoire d'entreprise",
    fromCalendar: 'Depuis le calendrier', newPost: 'Nouveau post',
    brief: 'Brief', briefSub: "Ce que l'IA doit écrire", network: 'Réseau', format: 'Format', formatsFor: (n: string, f: string) => `${n} : ${f}.`,
    topic: 'Sujet', topicPh: 'Par exemple : bilan du mois de septembre', goal: 'Objectif', goalPh: 'Par exemple : relancer les inscriptions',
    angle: 'Angle (optionnel)', anglePh: "Par exemple : le regard d'un ancien apprenant",
    tone: 'Ton', professional: 'Professionnel', casual: 'Décontracté, local', slang: 'Expressions locales (optionnel)', slangPh: 'Par exemple : camfranglais léger',
    notes: 'Consignes (optionnel)', notesPh: 'Par exemple : citer les portes ouvertes, pas de liste, 150 mots maximum',
    campaign: 'Campagne', noCampaign: 'Sans campagne', campaignHint: "Suit le brief, l'audience et la zone de la campagne",
    write: "Rédiger avec l'IA", rewrite: "Réécrire avec l'IA", writing: 'Rédaction…',
    text: 'Texte du post', slides: 'Diapositives', caption: 'Légende', editable: 'modifiable directement', rulesOf: (n: string) => `Règles ${n} :`,
    slideTitle: 'Titre', slideText: 'Texte', hashtags: 'Hashtags', copy: 'Copier le texte', copied: 'Copié',
    emptyTitle: "Rien de rédigé pour l'instant", emptyText: "Remplissez le brief puis lancez la rédaction. L'IA écrit pour le réseau choisi, avec le ton de votre marque.",
    visual: 'Idée de visuel', visualHint: "Brief pour votre graphiste ou votre banque d'images", copyVisual: "Copier l'idée de visuel",
    hook: "Analyse de l'accroche", scoring: "Analyse de l'accroche…", apply: 'Appliquer', applied: 'Appliquée',
    axes: { scrollStop: 'Arrêt du scroll', clarity: 'Clarté', intrigue: 'Curiosité' }, levels: { Strong: 'Fort', Good: 'Bon', Weak: 'Faible' } as Record<string, string>,
    preview: (n: string) => `Aperçu ${n}`, previewHint: 'Aperçu indicatif', seeMore: 'voir plus', now: 'maintenant',
    next: 'Étape suivante', schedule: 'Programmer dans le Studio', save: 'Enregistrer dans la bibliothèque', saved: 'Enregistré dans la bibliothèque',
    calendarNote: (d: string) => `L'idée du ${d} passera à « Programmé » dans le calendrier une fois le post programmé.`,
    noCompany: 'Aucune entreprise active.', noTopic: 'Indiquez un sujet.',
    tabs: { text: 'Texte', preview: 'Aperçu', visual: 'Visuel' },
  },
  en: {
    title: 'Content generator', subtitle: 'One post, written for one network, from your company memory',
    fromCalendar: 'From the calendar', newPost: 'New post',
    brief: 'Brief', briefSub: 'What the AI should write', network: 'Network', format: 'Format', formatsFor: (n: string, f: string) => `${n}: ${f}.`,
    topic: 'Topic', topicPh: 'For example: September recap', goal: 'Goal', goalPh: 'For example: revive enrolments',
    angle: 'Angle (optional)', anglePh: 'For example: through a former student\'s eyes',
    tone: 'Tone', professional: 'Professional', casual: 'Casual, local', slang: 'Local expressions (optional)', slangPh: 'For example: light Pidgin',
    notes: 'Instructions (optional)', notesPh: 'For example: mention the open days, no lists, 150 words max',
    campaign: 'Campaign', noCampaign: 'No campaign', campaignHint: "Follows the campaign's brief, audience and zone",
    write: 'Write with AI', rewrite: 'Rewrite with AI', writing: 'Writing…',
    text: 'Post text', slides: 'Slides', caption: 'Caption', editable: 'edit directly', rulesOf: (n: string) => `${n} rules:`,
    slideTitle: 'Title', slideText: 'Text', hashtags: 'Hashtags', copy: 'Copy the text', copied: 'Copied',
    emptyTitle: 'Nothing written yet', emptyText: 'Fill in the brief, then start writing. The AI writes for the chosen network, in your brand voice.',
    visual: 'Visual idea', visualHint: 'Brief for your designer or stock library', copyVisual: 'Copy the visual idea',
    hook: 'Hook analysis', scoring: 'Scoring the hook…', apply: 'Apply', applied: 'Applied',
    axes: { scrollStop: 'Scroll-stop', clarity: 'Clarity', intrigue: 'Curiosity' }, levels: { Strong: 'Strong', Good: 'Good', Weak: 'Weak' } as Record<string, string>,
    preview: (n: string) => `${n} preview`, previewHint: 'Approximate preview', seeMore: 'see more', now: 'now',
    next: 'Next step', schedule: 'Schedule in the Studio', save: 'Save to the library', saved: 'Saved to the library',
    calendarNote: (d: string) => `The ${d} idea will switch to "Scheduled" in the calendar once the post is scheduled.`,
    noCompany: 'No active company.', noTopic: 'Enter a topic.',
    tabs: { text: 'Text', preview: 'Preview', visual: 'Visual' },
  },
}
type Copy = typeof COPY.fr

// ─── State ────────────────────────────────────────────────────────────────────

interface Slide { title: string; text: string }
interface Output { content: string; hashtags: string[]; visualIdea: string; slides: Slide[] }
type Level = 'Weak' | 'Good' | 'Strong'
interface HookScore { scrollStop: Level; clarity: Level; intrigue: Level; suggestion_fr: string; suggestion_en: string; rewrite: string }

interface Brief {
  network: string
  format: ContentFormat
  topic: string
  goal: string
  angle: string
  tone: 'professional' | 'casual'
  slang: string
  notes: string
  campaignId: string
  // The calendar idea this post was written from, if any.
  calendarId: string
  calendarDate: string
}

const STORAGE_KEY = 'flowcom:cg_state_v2'
const EMPTY_BRIEF: Brief = { network: 'linkedin', format: 'Post', topic: '', goal: '', angle: '', tone: 'professional', slang: '', notes: '', campaignId: '', calendarId: '', calendarDate: '' }
const LEVEL_TONE: Record<Level, Tone> = { Strong: 'success', Good: 'info', Weak: 'warning' }
const FORMAT_VALUES: ContentFormat[] = ['Post', 'Carousel', 'Video', 'Story']

function loadSaved(): { brief: Brief; output: Output | null } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function useNarrow() {
  const query = '(max-width: 767px)'
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setNarrow(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return narrow
}

const tagText = (tags: string[]) => tags.map(t => (t.startsWith('#') ? t : `#${t}`)).join(' ')
const fullText = (output: Output, format: ContentFormat) => {
  const slides = format === 'Carousel' && output.slides.length
    ? output.slides.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.text}`).join('\n\n') + '\n\n'
    : ''
  return `${slides}${output.content}${output.hashtags.length ? `\n\n${tagText(output.hashtags)}` : ''}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ContentGeneratorPage() {
  const { t, lang } = useI18n()
  const L: 'fr' | 'en' = lang === 'fr' ? 'fr' : 'en'
  const c = COPY[L]
  const { activeCompany, products, segments, keyMessages } = useCompany()
  const { apiKeyConfigured } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const narrow = useNarrow()
  const { campaigns, zoneLabel } = useCampaignOptions(activeCompany?.id)

  const saved = useMemo(loadSaved, [])
  const [brief, setBrief] = useState<Brief>(() => ({ ...EMPTY_BRIEF, ...saved?.brief }))
  const [output, setOutput] = useState<Output | null>(saved?.output ?? null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<'save' | 'schedule' | null>(null)
  const [hookScore, setHookScore] = useState<HookScore | null>(null)
  const [hookScoring, setHookScoring] = useState(false)
  const [hookApplied, setHookApplied] = useState(false)
  const scoredHook = useRef('')
  const [tab, setTab] = useState<'text' | 'preview' | 'visual'>('text')
  const [briefOpen, setBriefOpen] = useState(!saved?.output)

  const set = useCallback(<K extends keyof Brief>(key: K, value: Brief[K]) => setBrief(b => ({ ...b, [key]: value })), [])
  const campaign = campaigns.find(cp => cp.id === brief.campaignId)
  const rules = rulesFor(brief.network)
  const networkLabel = CHANNEL_MAP[brief.network]?.label ?? brief.network

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ brief, output })) } catch { /* storage unavailable */ }
  }, [brief, output])

  // Arriving from the calendar: take its idea and start fresh.
  useEffect(() => {
    const topic = searchParams.get('topic')
    if (!topic && !searchParams.get('channel') && !searchParams.get('item')) return
    const channel = searchParams.get('channel') ?? ''
    const format = searchParams.get('format') as ContentFormat | null
    setBrief({
      ...EMPTY_BRIEF,
      tone: brief.tone,
      network: CHANNEL_MAP[channel] ? channel : 'linkedin',
      format: format && FORMAT_VALUES.includes(format) ? format : 'Post',
      topic: topic ?? '',
      goal: searchParams.get('goal') ?? '',
      campaignId: searchParams.get('campaign') ?? '',
      calendarId: searchParams.get('item') ?? '',
      calendarDate: searchParams.get('date') ?? '',
    })
    setOutput(null)
    setSavedId(null)
    setHookScore(null)
    setBriefOpen(true)
    window.history.replaceState({}, '', '/content')
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  const chooseNetwork = (network: string) => {
    setBrief(b => ({ ...b, network, format: suggestedFormat(network, b.format) }))
  }

  const chooseCampaign = (id: string) => {
    const next = campaigns.find(cp => cp.id === id)
    const allowed = next?.channels.map(ch => CONTENT_CHANNEL[ch]).filter((v): v is string => Boolean(v)) ?? []
    setBrief(b => ({ ...b, campaignId: id, network: allowed.length && !allowed.includes(b.network) ? allowed[0] : b.network }))
  }

  const newPost = () => {
    setBrief(b => ({ ...EMPTY_BRIEF, network: b.network, tone: b.tone }))
    setOutput(null)
    setSavedId(null)
    setHookScore(null)
    setBriefOpen(true)
  }

  const generate = async () => {
    if (!activeCompany) { setError(c.noCompany); return }
    if (!brief.topic.trim()) { setError(c.noTopic); return }
    setLoading(true)
    setError('')
    setSavedId(null)
    setHookScore(null)
    setHookApplied(false)
    const tone = brief.tone === 'professional'
      ? 'Professional: serious and authoritative, at most 2 emojis.'
      : `Casual and local: energetic, at most 6 emojis${brief.slang.trim() ? `, using these local expressions naturally: ${brief.slang.trim()}` : ''}.`
    const system = `You are an expert ${networkLabel} copywriter. Return ONLY valid JSON:
{"content":"string","hashtags":["string"],"visualIdea":"string","slides":[{"title":"string","text":"string"}]}
"slides" is an empty array unless the format is Carousel. "hashtags" holds the hashtags without the text (an empty array when the network uses none).
${networkLabel} rules: ${rules.prompt}${rules.limit ? ` The whole post, hashtags included, must stay under ${rules.limit} characters.` : ''}
Never invent figures, names or dates: when one is needed and missing from the brand context, write a placeholder in brackets such as [NUMBER] or [DATE].
Brand context:\n${buildAiContext({ company: activeCompany, products, segments, keyMessages })}${campaign ? `\n\nThis post belongs to the campaign below. Serve its objective, speak to its audience, carry its key message, follow its brief and adapt references to its target zone:\n${buildCampaignContext(campaign, { segments, keyMessages, zoneLabel: zoneLabel(campaign) })}` : ''}`
    const user = `Write one ${networkLabel} ${brief.format}.
Topic: ${brief.topic.trim()}${brief.goal.trim() ? `\nGoal: ${brief.goal.trim()}` : ''}${brief.angle.trim() ? `\nAngle: ${brief.angle.trim()}` : ''}
Tone: ${tone}
${FORMAT_PROMPT[brief.format]}${brief.notes.trim() ? `\n\nEDITORIAL INSTRUCTIONS (follow strictly):\n${brief.notes.trim()}` : ''}
Respond only in ${L === 'fr' ? 'French' : 'English'}.`
    try {
      type Raw = { content?: string; hashtags?: unknown; visualIdea?: string; slides?: unknown }
      const raw = await callModelJSON<Raw>(activeCompany.id, [{ role: 'system', content: system }, { role: 'user', content: user }], { temperature: 0.8, max_tokens: 3000, requiredKeys: ['content', 'visualIdea'] })
      const hashtags = Array.isArray(raw.hashtags) ? raw.hashtags.map(String).map(h => h.trim()).filter(Boolean).slice(0, 12) : []
      const slides = Array.isArray(raw.slides)
        ? raw.slides.filter((s): s is Slide => Boolean(s) && typeof s === 'object').map(s => ({ title: String(s.title ?? ''), text: String(s.text ?? '') })).slice(0, 10)
        : []
      setOutput({ content: String(raw.content ?? '').trim(), hashtags, visualIdea: String(raw.visualIdea ?? '').trim(), slides })
      setTab('text')
      if (narrow) setBriefOpen(false)
    } catch (err) {
      const key = buildModelError(err)
      setError(key !== 'error.generic' ? t(key as Parameters<typeof t>[0]) : err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  // The hook: the cover slide for a carousel, otherwise the first line.
  const hook = output ? (brief.format === 'Carousel' && output.slides[0]?.title ? output.slides[0].title : output.content.split('\n').find(l => l.trim()) ?? '') : ''

  useEffect(() => {
    if (!hook || !apiKeyConfigured || !activeCompany || scoredHook.current === hook) return
    const timer = setTimeout(async () => {
      setHookScoring(true)
      try {
        const result = await callModelJSON<HookScore>(activeCompany.id, [
          { role: 'system', content: `You are a social media hook analyst. Score the hook on 3 axes and propose a better version. Return JSON exactly: {"scrollStop":"Weak|Good|Strong","clarity":"Weak|Good|Strong","intrigue":"Weak|Good|Strong","suggestion_fr":"une amélioration concrète en 20 mots maximum","suggestion_en":"one concrete improvement in 20 words max","rewrite":"the improved hook, same language as the original, same length or shorter"}. Be strict: most hooks are Weak or Good, Strong is rare. Never invent figures: use placeholders like [NUMBER].` },
          { role: 'user', content: `Hook: "${hook}"\nNetwork: ${networkLabel}\nFormat: ${brief.format}\nTone: ${brief.tone}` },
        ], { temperature: 0.2, max_tokens: 300, requiredKeys: ['scrollStop', 'clarity', 'intrigue', 'rewrite'] })
        const valid = ['Weak', 'Good', 'Strong']
        if ([result.scrollStop, result.clarity, result.intrigue].every(v => valid.includes(v))) {
          setHookScore(result)
          setHookApplied(false)
          scoredHook.current = hook
        }
      } catch {
        // The analysis is optional; the post stays usable without it.
      } finally {
        setHookScoring(false)
      }
    }, 800)
    return () => clearTimeout(timer)
  }, [hook, apiKeyConfigured]) // eslint-disable-line react-hooks/exhaustive-deps

  const applyHook = () => {
    if (!output || !hookScore?.rewrite) return
    const rewrite = hookScore.rewrite.trim()
    scoredHook.current = rewrite
    if (brief.format === 'Carousel' && output.slides[0]) {
      setOutput({ ...output, slides: output.slides.map((s, i) => (i === 0 ? { ...s, title: rewrite } : s)) })
    } else {
      const lines = output.content.split('\n')
      const index = lines.findIndex(l => l.trim())
      lines[index < 0 ? 0 : index] = rewrite
      setOutput({ ...output, content: lines.join('\n') })
    }
    setHookApplied(true)
  }

  const saveToLibrary = async (): Promise<string | null> => {
    if (!output || !activeCompany) return null
    if (savedId) return savedId
    const text = brief.format === 'Carousel' && output.slides.length
      ? `${output.slides.map((s, i) => `Slide ${i + 1}: ${s.title}\n${s.text}`).join('\n\n')}\n\n${output.content}`
      : output.content
    const item = await createDataverseLibraryItem(activeCompany.id, {
      title: brief.topic.trim(),
      hook,
      episode_context: '',
      body: text,
      conclusion: '',
      reward: '',
      cta: '',
      hashtags: tagText(output.hashtags),
      visual_idea: output.visualIdea,
      video_script: brief.format === 'Video' ? output.content : '',
      channel: brief.network,
      format: brief.format === 'Carousel' ? 'carousel' : brief.format === 'Video' ? 'video' : 'post',
      tone: brief.tone,
      status: 'Draft',
      publish_date: null,
    })
    if (campaign) await setContentCampaign('library', item.id, campaign.id)
    window.dispatchEvent(new Event('flowcom:data-updated'))
    setSavedId(item.id)
    return item.id
  }

  const run = async (kind: 'save' | 'schedule') => {
    setSaving(kind)
    setError('')
    try {
      const id = await saveToLibrary()
      if (id && kind === 'schedule') {
        const params = new URLSearchParams({ item: id })
        if (campaign) params.set('campaign', campaign.id)
        if (brief.calendarId) params.set('calendar', brief.calendarId)
        navigate(`/studio?${params.toString()}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  const calendarDateLabel = brief.calendarDate
    ? new Date(`${brief.calendarDate}T00:00:00`).toLocaleDateString(L === 'fr' ? 'fr-FR' : 'en-GB', { day: 'numeric', month: 'short' })
    : ''
  const charCount = output ? fullText(output, brief.format).length : 0
  const overLimit = rules.limit !== null && charCount > rules.limit

  const briefCard = (
    <BriefCard brief={brief} c={c} lang={L} set={set} chooseNetwork={chooseNetwork} chooseCampaign={chooseCampaign}
      campaigns={campaigns} campaign={campaign} loading={loading} hasOutput={Boolean(output)} canWrite={apiKeyConfigured && Boolean(activeCompany)}
      onGenerate={() => void generate()} />
  )

  const resultCard = (
    <ResultCard output={output} setOutput={setOutput} brief={brief} c={c} lang={L} loading={loading}
      charCount={charCount} limit={rules.limit} overLimit={overLimit} rules={rules.rules[L]} networkLabel={networkLabel} />
  )

  const visualCard = output && (
    <Card className="flex flex-1 flex-col">
      <CardHeader title={c.visual} actions={<CopyButton text={output.visualIdea} label={c.copyVisual} copiedLabel={c.copied} />} />
      <CardBody className="flex flex-1 flex-col">
        <TextAreaField label={c.visual} className="flex-1 [&_.fc-label]:sr-only [&_textarea]:min-h-24 [&_textarea]:flex-1 [&_textarea]:resize-none [&_textarea]:py-2" rows={3} value={output.visualIdea}
          onChange={e => setOutput({ ...output, visualIdea: e.target.value })} hint={c.visualHint} />
      </CardBody>
    </Card>
  )

  const hookCard = output && (hookScoring || hookScore) && (
    <InsightCard kind={c.hook} title={hookScoring ? c.scoring : (L === 'fr' ? hookScore!.suggestion_fr : hookScore!.suggestion_en) || c.hook}
      action={hookScore?.rewrite && !hookScoring
        ? <Button variant="secondary" size="sm" icon={hookApplied ? <Check /> : undefined} disabled={hookApplied} onClick={applyHook}>{hookApplied ? c.applied : c.apply}</Button>
        : undefined}>
      {hookScoring
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : (
          <span className="flex flex-col gap-2">
            <span className="flex flex-wrap gap-1.5">
              {(['scrollStop', 'clarity', 'intrigue'] as const).map(axis => (
                <Badge key={axis} tone={LEVEL_TONE[hookScore![axis]]}>{c.axes[axis]} · {c.levels[hookScore![axis]]}</Badge>
              ))}
            </span>
            {hookScore!.rewrite && !hookApplied && <span className="italic">« {hookScore!.rewrite} »</span>}
          </span>
        )}
    </InsightCard>
  )

  const previewCard = output && (
    <PreviewCard output={output} brief={brief} c={c} companyName={activeCompany?.name ?? ''} logo={activeCompany?.logo_url} networkLabel={networkLabel} />
  )

  const nextCard = output && (
    <Card className="flex-1">
      <CardHeader title={c.next} />
      <CardBody className="flex flex-col gap-2">
        <Button variant="primary" icon={<Send />} loading={saving === 'schedule'} disabled={Boolean(saving)} onClick={() => void run('schedule')} className="w-full">{c.schedule}</Button>
        <Button variant="secondary" icon={savedId ? <Check /> : <Library />} loading={saving === 'save'} disabled={Boolean(saving) || Boolean(savedId)}
          onClick={() => void run('save')} className="w-full">{savedId ? c.saved : c.save}</Button>
        {brief.calendarId && calendarDateLabel && <p className="fc-hint m-0 mt-1">{c.calendarNote(calendarDateLabel)}</p>}
        {error && !saving && <p className="m-0 mt-1 flex items-start gap-1.5 text-[13px] text-danger"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
      </CardBody>
    </Card>
  )

  return (
    <div className="min-h-full bg-surface-page">
      <div className="mx-auto flex max-w-[var(--content-max)] flex-col gap-4 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="m-0 text-[22px] font-bold leading-7 text-ink sm:text-[24px] sm:leading-[30px]" style={{ fontFamily: 'var(--font-display)' }}>{c.title}</h1>
            <p className="m-0 mt-0.5 text-sm text-ink-muted">{c.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {brief.calendarId && (
              <Link to="/calendar" className="fc-evidence h-8 px-3 text-[13px]">
                <CalendarDays />{c.fromCalendar}{calendarDateLabel ? ` · ${calendarDateLabel}` : ''}
              </Link>
            )}
            <Button variant="secondary" icon={<Plus />} onClick={newPost}>{c.newPost}</Button>
          </div>
        </div>

        {error && (
          <p className="m-0 flex items-center gap-2 rounded-[var(--radius-md)] bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </p>
        )}

        {narrow ? (
          <div className="flex flex-col gap-3">
            {output && !briefOpen ? (
              <Card className="flex items-center gap-3 px-3.5 py-3">
                <NetworkBadge network={brief.network} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{brief.topic}</span>
                  <span className="block truncate text-[12px] text-ink-muted">
                    {[networkLabel, FORMAT_MAP[brief.format]?.label[L], calendarDateLabel, campaign?.name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setBriefOpen(true)}>{c.brief}</Button>
              </Card>
            ) : briefCard}
            {(output || loading) && (
              <>
                {output && <Tabs value={tab} onChange={setTab} tabs={[{ id: 'text', label: c.tabs.text }, { id: 'preview', label: c.tabs.preview }, { id: 'visual', label: c.tabs.visual }]} />}
                {tab === 'text' && <>{resultCard}{hookCard}</>}
                {tab === 'preview' && previewCard}
                {tab === 'visual' && visualCard}
                {nextCard}
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_300px]">
            <div className="min-w-0">{briefCard}</div>
            <div className="flex min-w-0 flex-col gap-4">
              {resultCard}
              {output && <div className="flex flex-1 flex-col gap-4 2xl:grid 2xl:grid-cols-2">{hookCard}{visualCard}</div>}
            </div>
            {output && (
              <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 lg:grid lg:grid-cols-2 xl:col-span-1 xl:flex">
                {previewCard}
                {nextCard}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Brief ────────────────────────────────────────────────────────────────────

function BriefCard({ brief, c, lang, set, chooseNetwork, chooseCampaign, campaigns, campaign, loading, hasOutput, canWrite, onGenerate }: {
  brief: Brief; c: Copy; lang: 'fr' | 'en'
  set: <K extends keyof Brief>(key: K, value: Brief[K]) => void
  chooseNetwork: (network: string) => void; chooseCampaign: (id: string) => void
  campaigns: ReturnType<typeof useCampaignOptions>['campaigns']; campaign: ReturnType<typeof useCampaignOptions>['campaigns'][number] | undefined
  loading: boolean; hasOutput: boolean; canWrite: boolean; onGenerate: () => void
}) {
  const rules = rulesFor(brief.network)
  const label = CHANNEL_MAP[brief.network]?.label ?? brief.network
  const fitting = rules.formats.map(f => FORMAT_MAP[f].label[lang].toLowerCase())
  const fittingText = fitting.length > 1 ? `${fitting.slice(0, -1).join(', ')} ${lang === 'fr' ? 'ou' : 'or'} ${fitting[fitting.length - 1]}` : fitting[0]
  return (
    <Card className="flex flex-col">
      <CardHeader title={c.brief} subtitle={c.briefSub} actions={campaign ? <Badge tone="brand">{campaign.name}</Badge> : undefined} />
      <CardBody className="flex flex-col gap-3.5">
        <div className="fc-field">
          <span className="fc-label">{c.network}</span>
          <div role="radiogroup" aria-label={c.network} className="flex flex-wrap gap-1.5">
            {CHANNELS.slice(0, 7).map(ch => (
              <Chip key={ch.value} pressed={brief.network === ch.value} icon={<ch.icon className="h-3.5 w-3.5" style={{ color: ch.color }} />}
                onClick={() => chooseNetwork(ch.value)}>{ch.label}</Chip>
            ))}
          </div>
        </div>
        <div className="fc-field">
          <span className="fc-label">{c.format}</span>
          <div role="radiogroup" aria-label={c.format} className="grid grid-cols-4 gap-1.5">
            {FORMATS.map(f => (
              <Chip key={f.value} pressed={brief.format === f.value} icon={<f.icon className="h-3.5 w-3.5" />} onClick={() => set('format', f.value)}
                className="justify-center px-1.5">{f.label[lang]}</Chip>
            ))}
          </div>
          <span className="fc-hint">{c.formatsFor(label, fittingText)}</span>
        </div>
        <TextField label={c.topic} value={brief.topic} placeholder={c.topicPh} onChange={e => set('topic', e.target.value)} />
        <TextField label={c.goal} value={brief.goal} placeholder={c.goalPh} onChange={e => set('goal', e.target.value)} />
        <TextField label={c.angle} value={brief.angle} placeholder={c.anglePh} onChange={e => set('angle', e.target.value)} />
        <div className="fc-field">
          <span className="fc-label">{c.tone}</span>
          <div role="radiogroup" aria-label={c.tone} className="grid grid-cols-2 gap-1.5">
            <Chip pressed={brief.tone === 'professional'} onClick={() => set('tone', 'professional')} className="justify-center">{c.professional}</Chip>
            <Chip pressed={brief.tone === 'casual'} onClick={() => set('tone', 'casual')} className="justify-center">{c.casual}</Chip>
          </div>
        </div>
        {brief.tone === 'casual' && <TextField label={c.slang} value={brief.slang} placeholder={c.slangPh} onChange={e => set('slang', e.target.value)} />}
        <TextAreaField label={c.notes} rows={2} value={brief.notes} placeholder={c.notesPh} onChange={e => set('notes', e.target.value)} className="[&_textarea]:resize-none" />
        {campaigns.length > 0 && (
          <SelectField label={c.campaign} value={brief.campaignId} onChange={e => chooseCampaign(e.target.value)}>
            <option value="">{c.noCampaign}</option>
            {campaigns.map(cp => <option key={cp.id} value={cp.id}>{cp.name}</option>)}
          </SelectField>
        )}
        {campaign && campaignWarnings(campaign, lang).map(w => (
          <p key={w} className="m-0 flex items-center gap-1.5 text-[12px] text-warning"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{w}</p>
        ))}
      </CardBody>
      <div className="flex flex-col gap-1.5 border-t border-line px-[var(--card-pad)] py-3">
        <Button variant="ai" loading={loading} disabled={!canWrite || !brief.topic.trim()} onClick={onGenerate} className="w-full">
          {loading ? c.writing : hasOutput ? c.rewrite : c.write}
        </Button>
        {campaign && <span className="fc-hint text-center">{c.campaignHint}</span>}
      </div>
    </Card>
  )
}

// ─── Result ───────────────────────────────────────────────────────────────────

function ResultCard({ output, setOutput, brief, c, lang, loading, charCount, limit, overLimit, rules, networkLabel }: {
  output: Output | null; setOutput: (o: Output) => void; brief: Brief; c: Copy; lang: 'fr' | 'en'; loading: boolean
  charCount: number; limit: number | null; overLimit: boolean; rules: string[]; networkLabel: string
}) {
  const carousel = brief.format === 'Carousel'
  if (loading) {
    return (
      <Card className="flex flex-col gap-3 p-5" aria-busy="true">
        {[88, 72, 80, 56, 64].map((w, i) => <span key={i} className="h-3 animate-pulse rounded-full bg-surface-sunken" style={{ width: `${w}%` }} />)}
      </Card>
    )
  }
  if (!output) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-16 text-center">
        <span className="fc-proposal__icon mb-1"><Spark /></span>
        <p className="m-0 text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-display)' }}>{c.emptyTitle}</p>
        <p className="m-0 max-w-sm text-sm text-ink-muted">{c.emptyText}</p>
      </Card>
    )
  }
  const subtitle = [networkLabel, FORMAT_MAP[brief.format]?.label[lang], carousel ? `${output.slides.length} ${c.slides.toLowerCase()}` : c.editable].join(' · ')
  return (
    <Card className="flex flex-col">
      <CardHeader title={carousel ? c.slides : c.text} subtitle={subtitle}
        actions={<>
          <Badge tone={overLimit ? 'danger' : 'neutral'}>{charCount.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}{limit ? ` / ${limit.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')}` : ''}</Badge>
          <CopyButton text={fullText(output, brief.format)} label={c.copy} copiedLabel={c.copied} />
        </>} />
      <CardBody className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="font-semibold text-ink">{c.rulesOf(networkLabel)}</span>
          {rules.map(r => (
            <span key={r} className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5"><Check className="h-3 w-3 text-success" />{r}</span>
          ))}
        </div>
        {carousel && output.slides.map((slide, i) => (
          <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface-card p-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-surface-sunken text-[12px] font-bold text-ink-muted" style={{ fontFamily: 'var(--font-display)' }}>{i + 1}</span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <input aria-label={`${c.slideTitle} ${i + 1}`} className="fc-input h-8 font-semibold" value={slide.title}
                onChange={e => setOutput({ ...output, slides: output.slides.map((s, j) => (j === i ? { ...s, title: e.target.value } : s)) })} />
              <textarea aria-label={`${c.slideText} ${i + 1}`} className="fc-input resize-none py-1.5 text-[13px]" rows={2} value={slide.text}
                onChange={e => setOutput({ ...output, slides: output.slides.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)) })} />
            </span>
          </div>
        ))}
        <TextAreaField label={carousel ? c.caption : c.text} className={cn(!carousel && '[&_.fc-label]:sr-only')}
          rows={carousel ? 3 : 14} value={output.content} onChange={e => setOutput({ ...output, content: e.target.value })}
          style={{ resize: 'vertical', lineHeight: '21px', fontSize: 14, padding: '12px 14px' }} />
        {(output.hashtags.length > 0 || rulesFor(brief.network).prompt.includes('hashtag')) && (
          <TextField label={c.hashtags} value={tagText(output.hashtags)}
            onChange={e => setOutput({ ...output, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
        )}
      </CardBody>
    </Card>
  )
}

function CopyButton({ text, label, copiedLabel }: { text: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* clipboard blocked */ }
  }
  return <Button variant="ghost" size="sm" iconOnly icon={copied ? <Check className="text-success" /> : <Copy />} onClick={() => void copy()} aria-label={copied ? copiedLabel : label} />
}

function NetworkBadge({ network }: { network: string }) {
  const def = CHANNEL_MAP[network]
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunken">
      {def && <def.icon className="h-4 w-4" style={{ color: def.color }} />}
    </span>
  )
}

// ─── Preview ──────────────────────────────────────────────────────────────────

const REACTIONS: Record<string, { fr: string[]; en: string[] }> = {
  linkedin: { fr: ["J'aime", 'Commenter', 'Republier'], en: ['Like', 'Comment', 'Repost'] },
  twitter: { fr: ['Répondre', 'Republier', "J'aime"], en: ['Reply', 'Repost', 'Like'] },
  whatsapp: { fr: ['Répondre'], en: ['Reply'] },
}
const DEFAULT_REACTIONS = { fr: ["J'aime", 'Commenter', 'Partager'], en: ['Like', 'Comment', 'Share'] }

function PreviewCard({ output, brief, c, companyName, logo, networkLabel }: {
  output: Output; brief: Brief; c: Copy; companyName: string; logo?: string; networkLabel: string
}) {
  const lang: 'fr' | 'en' = c === COPY.fr ? 'fr' : 'en'
  const square = brief.network === 'linkedin'
  const handle = ['instagram', 'tiktok'].includes(brief.network) ? companyName.toLowerCase().replace(/[^a-z0-9]+/g, '') : companyName
  const text = `${output.content}${output.hashtags.length ? `\n\n${tagText(output.hashtags)}` : ''}`
  const short = text.length > 220 ? text.slice(0, 220).trimEnd() : text
  const reactions = (REACTIONS[brief.network] ?? DEFAULT_REACTIONS)[lang]
  const cover = brief.format === 'Carousel' ? output.slides[0]?.title : brief.format === 'Video' || brief.format === 'Story' ? output.content.split('\n').find(l => l.trim())?.replace(/^\[[^\]]*\]\s*|^(Frame|Slide)\s*\d+\s*:\s*/i, '') : ''
  const vertical = brief.format === 'Video' || brief.format === 'Story'

  return (
    <Card className="overflow-hidden">
      <CardHeader title={c.preview(networkLabel)} actions={<span className="fc-hint">{c.previewHint}</span>} />
      <div className="px-4 pb-4">
        <div className="overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface-card">
          <div className="flex items-center gap-2 px-3 py-2.5">
            {logo
              ? <img src={logo} alt="" className={cn('h-8 w-8 shrink-0 object-cover', square ? 'rounded-[var(--radius-sm)]' : 'rounded-full')} />
              : <span className={cn('grid h-8 w-8 shrink-0 place-items-center bg-brand text-[13px] font-bold text-on-brand', square ? 'rounded-[var(--radius-sm)]' : 'rounded-full')} style={{ fontFamily: 'var(--font-display)' }}>{companyName.charAt(0).toUpperCase() || 'F'}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-ink">{handle || '—'}</span>
              <span className="block text-[11px] text-ink-muted">{c.now}</span>
            </span>
            <MoreHorizontal className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          </div>
          {brief.format === 'Post' && (
            <p className="m-0 whitespace-pre-line px-3 pb-2.5 text-[13px] leading-[18px] text-ink">
              {short}{text.length > 220 && <>… <span className="font-semibold text-ink-muted">{c.seeMore}</span></>}
            </p>
          )}
          {brief.format === 'Post' ? (
            <div className="grid min-h-[150px] place-items-center bg-brand-soft px-5 py-6 text-center text-[12px] leading-[17px] text-brand-ink">
              {output.visualIdea.slice(0, 160)}{output.visualIdea.length > 160 ? '…' : ''}
            </div>
          ) : (
            <div className={cn('relative mx-auto flex w-full flex-col justify-end bg-brand p-5 text-on-brand', vertical ? 'aspect-[9/16] max-h-[360px] max-w-[203px] rounded-[var(--radius-sm)]' : 'aspect-square')}>
              {brief.format === 'Carousel' && (
                <span className="absolute right-3 top-3 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-semibold text-white">1/{Math.max(1, output.slides.length)}</span>
              )}
              {brief.format === 'Video' && (
                <span className="absolute inset-0 grid place-items-center" aria-hidden="true"><span className="grid h-11 w-11 place-items-center rounded-full bg-black/35 text-white"><Play className="h-5 w-5" /></span></span>
              )}
              <span className="relative line-clamp-4 text-[20px] font-bold leading-6" style={{ fontFamily: 'var(--font-display)' }}>{cover}</span>
            </div>
          )}
          {brief.format !== 'Post' && (
            <p className="m-0 px-3 pt-2.5 text-[13px] leading-[18px] text-ink">
              <strong>{handle}</strong> {output.content.slice(0, 110)}{output.content.length > 110 && <span className="text-ink-muted">… {c.seeMore}</span>}
            </p>
          )}
          <div className="mt-2.5 flex gap-4 border-t border-line px-3 py-2.5 text-[12px] text-ink-muted">
            {reactions.map(r => <span key={r}>{r}</span>)}
          </div>
        </div>
      </div>
    </Card>
  )
}
