import {
  Fc_audiencesegmentsService,
  Fc_calendaritemsService,
  Fc_companiesService,
  Fc_companyintegrationsService,
  Fc_companymembershipsService,
  Fc_contentscoresService,
  Fc_flowcomprofilesService,
  Fc_keymessagesService,
  Fc_libraryitemsService,
  Fc_productsService,
  Fc_roadmapmilestonesService,
  Fc_weeklyreportsService,
} from '@/generated'
import type { Fc_audiencesegments } from '@/generated/models/Fc_audiencesegmentsModel'
import type { Fc_calendaritems } from '@/generated/models/Fc_calendaritemsModel'
import type { Fc_companies } from '@/generated/models/Fc_companiesModel'
import type { Fc_flowcomprofiles } from '@/generated/models/Fc_flowcomprofilesModel'
import type { Fc_keymessages } from '@/generated/models/Fc_keymessagesModel'
import type { Fc_libraryitems } from '@/generated/models/Fc_libraryitemsModel'
import type { Fc_products } from '@/generated/models/Fc_productsModel'
import type { Fc_roadmapmilestones } from '@/generated/models/Fc_roadmapmilestonesModel'
import type { AudienceSegment, Company, CompanyRole, KeyMessage, LibraryItem as LibraryRecord, Product, Profile } from '@/types'

type OperationResult<T> = {
  success: boolean
  data: T
  error?: unknown
}

type AuthUser = {
  id: string
  email?: string
  user_metadata?: { name?: string; full_name?: string }
}

// Dataverse errors often arrive as a JSON string; keep only its message, and say
// plainly when a text is too long for its column.
function readableDataverseMessage(message: string): string {
  let text = message
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } }
      if (parsed.error?.message) text = parsed.error.message
    } catch { /* not JSON after all */ }
  }
  const column = text.match(/would be truncated[^']*'[^']*'[^']*column '([^']+)'/i)?.[1]
  return column ? `The text is too long for the "${column.replace(/^fc_/i, '')}" field in Dataverse.` : text
}

function describeDataverseError(error: unknown): string {
  return readableDataverseMessage(rawDataverseError(error))
}

function rawDataverseError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const nestedError = record.error
    if (nestedError && typeof nestedError === 'object' && typeof (nestedError as Record<string, unknown>).message === 'string') {
      return String((nestedError as Record<string, unknown>).message)
    }
    if (typeof record.message === 'string') return record.message
    try {
      return JSON.stringify(error)
    } catch {
      return 'Unknown Dataverse error'
    }
  }
  return String(error)
}

export interface DataverseCalendarItem {
  id: string
  date: string
  topic: string
  goal: string
  format: 'Post' | 'Carousel' | 'Video' | 'Story'
  channel: string
  status: 'idea' | 'scheduled' | 'published'
  campaign_id?: string | null
}

export function unwrap<T>(result: OperationResult<T>, operation: string): T {
  if (!result.success) {
    throw new Error(result.error ? describeDataverseError(result.error) : `Dataverse operation failed: ${operation}`)
  }
  return result.data
}

export function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

export function lookup(tableSetName: string, id: string): string {
  return `/${tableSetName}(${id})`
}

export function createdAt(row: { createdon?: string; fc_createdon?: string }): string {
  return row.createdon ?? row.fc_createdon ?? new Date().toISOString()
}

const roleByValue: Record<number, CompanyRole> = {
  122370000: 'owner',
  122370001: 'admin',
  122370002: 'editor',
  122370003: 'viewer',
}

const roleValue: Record<CompanyRole, 122370000 | 122370001 | 122370002 | 122370003> = {
  owner: 122370000,
  admin: 122370001,
  editor: 122370002,
  viewer: 122370003,
}

const libraryFormatValue: Record<string, 122370000 | 122370001 | 122370002 | 122370003> = {
  post: 122370000,
  carousel: 122370001,
  video: 122370002,
  // Added by scripts/dataverse/add-story-format.mjs.
  story: 122370003,
}

const libraryStatusValue: Record<string, 122370000 | 122370001 | 122370002 | 122370003> = {
  Draft: 122370000,
  Validated: 122370001,
  Published: 122370002,
  Archived: 122370003,
}

const calendarFormatValue: Record<string, 122370000 | 122370001 | 122370002 | 122370003> = {
  Post: 122370000,
  Carousel: 122370001,
  Video: 122370002,
  Story: 122370003,
}

const calendarStatusValue: Record<string, 122370000 | 122370001 | 122370002> = {
  idea: 122370000,
  scheduled: 122370001,
  published: 122370002,
}

function profileFromRow(row: Fc_flowcomprofiles, fallbackUser: AuthUser): Profile {
  return {
    id: row.fc_flowcomprofileid,
    name: row.fc_name ?? fallbackUser.user_metadata?.name ?? fallbackUser.user_metadata?.full_name ?? fallbackUser.email ?? 'FlowCom user',
    email: row.fc_email ?? fallbackUser.email ?? '',
    lang: row.fc_language === 'en' ? 'en' : 'fr',
    created_at: createdAt(row),
  }
}

function companyFromRow(row: Fc_companies, userId: string, role?: CompanyRole): Company {
  return {
    id: row.fc_companyid,
    user_id: userId,
    name: row.fc_name ?? '',
    is_active: false,
    role,
    industry: row.fc_ndustry ?? '',
    website: row.fc_ebsite ?? '',
    founded_year: row.fc_oundedyear ?? '',
    team_size: row.fc_eamsize ?? '',
    location: row.fc_ocation ?? '',
    short_desc: row.fc_hortdescription ?? '',
    mission: row.fc_ission ?? '',
    vision: row.fc_ision ?? '',
    values: row.fc_alues ?? '',
    tone: row.fc_one ?? '',
    targets: row.fc_argets ?? '',
    channels: row.fc_hannels ?? '',
    frequency: row.fc_ublishingfrequency ?? '',
    currency: row.fc_currency || 'XAF',
    created_at: createdAt(row),
  }
}

function productFromRow(row: Fc_products): Product {
  return {
    id: row.fc_productid,
    company_id: row._fc_company_value ?? '',
    name: row.fc_name ?? '',
    description: row.fc_description ?? '',
    created_at: createdAt(row),
  }
}

function segmentFromRow(row: Fc_audiencesegments): AudienceSegment {
  return {
    id: row.fc_audiencesegmentid,
    company_id: row._fc_company_value ?? '',
    name: row.fc_name ?? '',
    pain_points: row.fc_painpoints ?? '',
    interests: row.fc_interests ?? '',
    created_at: createdAt(row),
  }
}

function keyMessageFromRow(row: Fc_keymessages): KeyMessage {
  return {
    id: row.fc_keymessageid,
    company_id: row._fc_company_value ?? '',
    content: row.fc_content,
    created_at: createdAt(row),
  }
}

function calendarItemFromRow(row: Fc_calendaritems): DataverseCalendarItem {
  const format = row.fc_formatname?.toLowerCase()
  return {
    id: row.fc_calendaritemid,
    date: String(row.fc_postdate ?? '').slice(0, 10),
    topic: row.fc_topic ?? '',
    goal: row.fc_goal ?? '',
    format: (format === 'carousel' ? 'Carousel' : format === 'video' ? 'Video' : format === 'story' ? 'Story' : 'Post'),
    channel: row.fc_channel ?? '',
    status: (row.fc_statusname === 'scheduled' ? 'scheduled' : row.fc_statusname === 'published' ? 'published' : 'idea'),
    campaign_id: row._fc_campaign_value ?? null,
  }
}

function libraryItemFromRow(row: Fc_libraryitems): LibraryRecord {
  return {
    id: row.fc_libraryitemid,
    company_id: row._fc_company_value ?? '',
    title: row.fc_title ?? row.fc_name ?? '',
    hook: row.fc_hook ?? '',
    episode_context: row.fc_episodecontext ?? '',
    body: row.fc_body ?? '',
    conclusion: row.fc_conclusion ?? '',
    reward: row.fc_reward ?? '',
    cta: row.fc_calltoaction ?? '',
    hashtags: row.fc_hashtags ?? '',
    visual_idea: row.fc_visualidea ?? '',
    video_script: row.fc_videoscript ?? '',
    channel: row.fc_channel ?? '',
    format: (row.fc_formatname?.toLowerCase() ?? 'post') as LibraryRecord['format'],
    tone: (row.fc_tone === 'casual' ? 'casual' : 'professional'),
    status: (row.fc_statusname ?? 'Draft') as LibraryRecord['status'],
    publish_date: row.fc_publishdate ?? null,
    created_at: createdAt(row),
    campaign_id: row._fc_campaign_value ?? null,
  }
}

export async function getOrCreateDataverseProfile(user: AuthUser): Promise<Profile> {
  const existing = unwrap(
    await Fc_flowcomprofilesService.getAll({
      filter: `fc_entrauserid eq '${escapeODataString(user.id)}'`,
      top: 1,
    }),
    'find profile',
  )[0]

  if (existing) return profileFromRow(existing, user)

  const name = user.user_metadata?.name ?? user.user_metadata?.full_name ?? user.email ?? 'FlowCom user'
  const created = unwrap(
    await Fc_flowcomprofilesService.create({
      fc_entrauserid: user.id,
      fc_email: user.email,
      fc_language: 'fr',
      fc_name: name,
      statecode: 0,
    }),
    'create profile',
  )
  return profileFromRow(created, user)
}

export async function updateDataverseProfile(id: string, updates: Partial<Profile>): Promise<void> {
  const payload: Record<string, string> = {}
  if (updates.name !== undefined) payload.fc_name = updates.name
  if (updates.email !== undefined) payload.fc_email = updates.email
  if (updates.lang !== undefined) payload.fc_language = updates.lang
  if (Object.keys(payload).length) unwrap(await Fc_flowcomprofilesService.update(id, payload), 'update flowcomprofiles')
}

export async function getCompaniesForProfile(profileId: string, userId: string): Promise<Company[]> {
  const memberships = unwrap(
    await Fc_companymembershipsService.getAll({
      filter: `_fc_profile_value eq ${profileId}`,
      orderBy: ['createdon asc'],
    }),
    'load company memberships',
  )

  const rows = await Promise.all(memberships
    .filter((membership) => Boolean(membership._fc_company_value))
    .map(async (membership) => {
      const company = unwrap(await Fc_companiesService.get(membership._fc_company_value!), 'load company')
      const numericRole = Number(membership.fc_role)
      return companyFromRow(company, userId, roleByValue[numericRole] ?? 'viewer')
    }))

  return rows
}

export async function listDataverseCompanyMembers(companyId: string): Promise<Array<{ user_id: string; role: CompanyRole; name: string; email: string }>> {
  const memberships = unwrap(await Fc_companymembershipsService.getAll({
    filter: `_fc_company_value eq ${companyId}`,
    orderBy: ['createdon asc'],
  }), 'load company members')
  return Promise.all(memberships.map(async (membership) => {
    const profile = membership._fc_profile_value
      ? unwrap(await Fc_flowcomprofilesService.get(membership._fc_profile_value), 'load member profile')
      : null
    return {
      user_id: profile?.fc_entrauserid ?? membership._fc_profile_value ?? '',
      role: roleByValue[Number(membership.fc_role)] ?? 'viewer',
      name: profile?.fc_name ?? '',
      email: profile?.fc_email ?? '',
    }
  }))
}

export async function getCompanyData(companyId: string) {
  const companyFilter = `_fc_company_value eq ${companyId}`
  const [products, segments, keyMessages] = await Promise.all([
    Fc_productsService.getAll({ filter: companyFilter, orderBy: ['createdon asc'] }),
    Fc_audiencesegmentsService.getAll({ filter: companyFilter, orderBy: ['createdon asc'] }),
    Fc_keymessagesService.getAll({ filter: companyFilter, orderBy: ['createdon asc'] }),
  ])

  return {
    products: unwrap(products, 'load products').map(productFromRow),
    segments: unwrap(segments, 'load audience segments').map(segmentFromRow),
    keyMessages: unwrap(keyMessages, 'load key messages').map(keyMessageFromRow),
  }
}

function companyChanges(updates: Partial<Company>): Record<string, string> {
  const changes: Record<string, string> = {}
  const mapping: Record<string, string> = {
    name: 'fc_name',
    industry: 'fc_ndustry',
    website: 'fc_ebsite',
    founded_year: 'fc_oundedyear',
    team_size: 'fc_eamsize',
    location: 'fc_ocation',
    short_desc: 'fc_hortdescription',
    mission: 'fc_ission',
    vision: 'fc_ision',
    values: 'fc_alues',
    tone: 'fc_one',
    targets: 'fc_argets',
    channels: 'fc_hannels',
    frequency: 'fc_ublishingfrequency',
    currency: 'fc_currency',
  }
  for (const [key, value] of Object.entries(updates)) {
    const dataverseKey = mapping[key]
    if (dataverseKey && typeof value === 'string') changes[dataverseKey] = value
  }
  return changes
}

export async function createDataverseCompany(name: string, profileId: string, userId: string): Promise<Company> {
  const row = unwrap(
    await Fc_companiesService.create({ fc_name: name, statecode: 0 }),
    'create company',
  )
  await Fc_companymembershipsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', row.fc_companyid),
    'fc_Profile@odata.bind': lookup('fc_flowcomprofiles', profileId),
    fc_membershipname: `${name} owner`,
    fc_role: roleValue.owner,
    statecode: 0,
  })
  return companyFromRow(row, userId, 'owner')
}

export async function updateDataverseCompany(id: string, updates: Partial<Company>): Promise<Company> {
  const row = unwrap(await Fc_companiesService.update(id, companyChanges(updates)), 'update company')
  return companyFromRow(row, updates.user_id ?? '', updates.role)
}

export async function deleteDataverseCompany(id: string): Promise<void> {
  await Fc_companiesService.delete(id)
}

export async function createDataverseProduct(companyId: string, product: Omit<Product, 'id' | 'company_id' | 'created_at'>): Promise<Product> {
  const row = unwrap(await Fc_productsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: product.name,
    fc_description: product.description,
    statecode: 0,
  }), 'create product')
  return productFromRow({ ...row, _fc_company_value: companyId })
}

export async function deleteDataverseProduct(id: string): Promise<void> {
  await Fc_productsService.delete(id)
}

export async function replaceDataverseProducts(companyId: string, products: Array<Omit<Product, 'id' | 'company_id' | 'created_at'>>): Promise<Product[]> {
  const current = unwrap(await Fc_productsService.getAll({ filter: `_fc_company_value eq ${companyId}` }), 'load existing products')
  await Promise.all(current.map((row) => Fc_productsService.delete(row.fc_productid)))
  return Promise.all(products.map((product) => createDataverseProduct(companyId, product)))
}

export async function createDataverseSegment(companyId: string, segment: Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>): Promise<AudienceSegment> {
  const row = unwrap(await Fc_audiencesegmentsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: segment.name,
    fc_painpoints: segment.pain_points,
    fc_interests: segment.interests,
    statecode: 0,
  }), 'create audience segment')
  return segmentFromRow({ ...row, _fc_company_value: companyId })
}

export async function deleteDataverseSegment(id: string): Promise<void> {
  await Fc_audiencesegmentsService.delete(id)
}

export async function replaceDataverseSegments(companyId: string, segments: Array<Omit<AudienceSegment, 'id' | 'company_id' | 'created_at'>>): Promise<AudienceSegment[]> {
  const current = unwrap(await Fc_audiencesegmentsService.getAll({ filter: `_fc_company_value eq ${companyId}` }), 'load existing audience segments')
  await Promise.all(current.map((row) => Fc_audiencesegmentsService.delete(row.fc_audiencesegmentid)))
  return Promise.all(segments.map((segment) => createDataverseSegment(companyId, segment)))
}

export async function createDataverseKeyMessage(companyId: string, content: string): Promise<KeyMessage> {
  const row = unwrap(await Fc_keymessagesService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: content.slice(0, 100),
    fc_content: content,
    statecode: 0,
  }), 'create key message')
  return keyMessageFromRow({ ...row, _fc_company_value: companyId })
}

export async function deleteDataverseKeyMessage(id: string): Promise<void> {
  await Fc_keymessagesService.delete(id)
}

export async function listDataverseCalendarItems(companyId: string): Promise<DataverseCalendarItem[]> {
  return unwrap(await Fc_calendaritemsService.getAll({
    filter: `_fc_company_value eq ${companyId}`,
    orderBy: ['fc_postdate asc'],
  }), 'load calendar items').map(calendarItemFromRow)
}

export async function createDataverseCalendarItem(companyId: string, item: Omit<DataverseCalendarItem, 'id'>): Promise<DataverseCalendarItem> {
  const row = unwrap(await Fc_calendaritemsService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: item.topic,
    fc_month: item.date.slice(0, 7),
    fc_postdate: item.date,
    fc_topic: item.topic,
    fc_goal: item.goal,
    fc_channel: item.channel,
    fc_format: calendarFormatValue[item.format] ?? calendarFormatValue.Post,
    fc_status: calendarStatusValue[item.status] ?? calendarStatusValue.idea,
    statecode: 0,
  }), 'create calendar item')
  return calendarItemFromRow({ ...row, _fc_company_value: companyId })
}

export async function replaceDataverseCalendarMonth(companyId: string, month: string, items: Array<Omit<DataverseCalendarItem, 'id'>>): Promise<DataverseCalendarItem[]> {
  const current = unwrap(await Fc_calendaritemsService.getAll({
    filter: `_fc_company_value eq ${companyId} and fc_month eq '${escapeODataString(month)}'`,
  }), 'load existing calendar items')
  await Promise.all(current.map((row) => Fc_calendaritemsService.delete(row.fc_calendaritemid)))
  return Promise.all(items.map((item) => createDataverseCalendarItem(companyId, item)))
}

export async function deleteDataverseCalendarItem(id: string): Promise<void> {
  await Fc_calendaritemsService.delete(id)
}

export async function updateDataverseCalendarItem(id: string, changes: Partial<Pick<DataverseCalendarItem, 'date' | 'topic' | 'goal' | 'format' | 'channel' | 'status'>>): Promise<void> {
  const payload: Record<string, string | number> = {}
  if (changes.date !== undefined) {
    payload.fc_postdate = changes.date
    payload.fc_month = changes.date.slice(0, 7)
  }
  if (changes.topic !== undefined) payload.fc_topic = changes.topic
  if (changes.goal !== undefined) payload.fc_goal = changes.goal
  if (changes.channel !== undefined) payload.fc_channel = changes.channel
  if (changes.format !== undefined) payload.fc_format = calendarFormatValue[changes.format] ?? calendarFormatValue.Post
  if (changes.status !== undefined) payload.fc_status = calendarStatusValue[changes.status] ?? calendarStatusValue.idea
  unwrap(await Fc_calendaritemsService.update(id, payload), 'update calendaritems')
}

export async function listDataverseLibraryItems(companyId: string): Promise<LibraryRecord[]> {
  return unwrap(await Fc_libraryitemsService.getAll({
    filter: `_fc_company_value eq ${companyId}`,
    orderBy: ['createdon desc'],
  }), 'load library items').map(libraryItemFromRow)
}

function libraryPayload(companyId: string, item: Omit<LibraryRecord, 'id' | 'company_id' | 'created_at'>) {
  return {
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: item.title,
    fc_title: item.title,
    fc_hook: item.hook,
    fc_episodecontext: item.episode_context,
    fc_body: item.body,
    fc_conclusion: item.conclusion,
    fc_reward: item.reward,
    fc_calltoaction: item.cta,
    fc_hashtags: item.hashtags,
    fc_visualidea: item.visual_idea,
    fc_videoscript: item.video_script,
    fc_channel: item.channel,
    // The generated model predates the story option; the value is valid once the script has run.
    fc_format: (libraryFormatValue[item.format] ?? libraryFormatValue.post) as Fc_libraryitems['fc_format'],
    fc_tone: item.tone,
    fc_status: libraryStatusValue[item.status] ?? libraryStatusValue.Draft,
    fc_publishdate: item.publish_date ?? undefined,
    statecode: 0 as const,
  }
}

export async function createDataverseLibraryItem(companyId: string, item: Omit<LibraryRecord, 'id' | 'company_id' | 'created_at'>): Promise<LibraryRecord> {
  const row = unwrap(await Fc_libraryitemsService.create(libraryPayload(companyId, item)), 'create library item')
  return libraryItemFromRow({ ...row, _fc_company_value: companyId })
}

export async function replaceDataverseLibraryItems(companyId: string, items: Array<Omit<LibraryRecord, 'id' | 'company_id' | 'created_at'>>): Promise<LibraryRecord[]> {
  const current = unwrap(await Fc_libraryitemsService.getAll({ filter: `_fc_company_value eq ${companyId}` }), 'load existing library items')
  await Promise.all(current.map((row) => Fc_libraryitemsService.delete(row.fc_libraryitemid)))
  return Promise.all(items.map((item) => createDataverseLibraryItem(companyId, item)))
}

export async function updateDataverseLibraryItem(id: string, changes: Partial<LibraryRecord>): Promise<void> {
  const payload: Record<string, string | number | undefined> = {}
  const mapping: Record<string, string> = {
    title: 'fc_title', hook: 'fc_hook', episode_context: 'fc_episodecontext', body: 'fc_body',
    conclusion: 'fc_conclusion', reward: 'fc_reward', cta: 'fc_calltoaction', hashtags: 'fc_hashtags',
    visual_idea: 'fc_visualidea', video_script: 'fc_videoscript', channel: 'fc_channel', tone: 'fc_tone',
    publish_date: 'fc_publishdate',
  }
  for (const [key, value] of Object.entries(changes)) {
    if (mapping[key]) payload[mapping[key]] = value as string | undefined
  }
  if (changes.title !== undefined) payload.fc_name = changes.title
  if (changes.format !== undefined) payload.fc_format = libraryFormatValue[changes.format] ?? libraryFormatValue.post
  if (changes.status !== undefined) payload.fc_status = libraryStatusValue[changes.status] ?? libraryStatusValue.Draft
  unwrap(await Fc_libraryitemsService.update(id, payload), 'update libraryitems')
}

export async function deleteDataverseLibraryItem(id: string): Promise<void> {
  await Fc_libraryitemsService.delete(id)
}

export type ContentScoreLevel = 'ready' | 'good' | 'needs-work'

const contentScoreValue: Record<ContentScoreLevel, 122370000 | 122370001 | 122370002> = {
  ready: 122370000,
  good: 122370001,
  'needs-work': 122370002,
}

export async function listDataverseContentScores(companyId: string): Promise<Record<string, ContentScoreLevel>> {
  const rows = unwrap(await Fc_contentscoresService.getAll({ filter: `_fc_company_value eq ${companyId}` }), 'load content scores')
  const scores: Record<string, ContentScoreLevel> = {}
  for (const row of rows) {
    const score = row.fc_scorename as ContentScoreLevel | undefined
    if (row._fc_libraryitem_value && score && score in contentScoreValue) scores[row._fc_libraryitem_value] = score
  }
  return scores
}

export async function saveDataverseContentScores(companyId: string, scores: Record<string, ContentScoreLevel>): Promise<void> {
  await Promise.all(Object.entries(scores).map(async ([libraryItemId, score]) => {
    const existing = unwrap(await Fc_contentscoresService.getAll({
      filter: `_fc_company_value eq ${companyId} and _fc_libraryitem_value eq ${libraryItemId}`,
      top: 1,
    }), 'find content score')[0]
    if (existing) {
      unwrap(await Fc_contentscoresService.update(existing.fc_contentscoreid, { fc_score: contentScoreValue[score], fc_scoredat: new Date().toISOString() }), 'update contentscores')
    } else {
      await Fc_contentscoresService.create({
        'fc_Company@odata.bind': lookup('fc_companies', companyId),
        'fc_LibraryItem@odata.bind': lookup('fc_libraryitems', libraryItemId),
        fc_name: `${libraryItemId} score`,
        fc_score: contentScoreValue[score],
        fc_scoredat: new Date().toISOString(),
        statecode: 0,
      })
    }
  }))
}

export async function listDataverseRoadmapMilestones(companyId: string): Promise<string[]> {
  const rows: Fc_roadmapmilestones[] = unwrap(await Fc_roadmapmilestonesService.getAll({
    filter: `_fc_company_value eq ${companyId} and fc_completed eq true`,
  }), 'load roadmap milestones')
  return rows.map((row) => row.fc_name).filter((id): id is string => Boolean(id))
}

export async function replaceDataverseRoadmapMilestones(companyId: string, milestoneIds: string[]): Promise<void> {
  const current = unwrap(await Fc_roadmapmilestonesService.getAll({ filter: `_fc_company_value eq ${companyId}` }), 'load existing roadmap milestones')
  await Promise.all(current.map((row) => Fc_roadmapmilestonesService.delete(row.fc_roadmapmilestoneid)))
  await Promise.all(milestoneIds.map((milestoneId) => Fc_roadmapmilestonesService.create({
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    fc_name: milestoneId,
    fc_completed: true,
    fc_updatedat: new Date().toISOString(),
    statecode: 0,
  })))
}

export async function getDataverseWorkspaceCounts(companyId: string) {
  const [calendar, library, roadmap, reports] = await Promise.all([
    Fc_calendaritemsService.getAll({ filter: `_fc_company_value eq ${companyId}` }),
    Fc_libraryitemsService.getAll({ filter: `_fc_company_value eq ${companyId}` }),
    Fc_roadmapmilestonesService.getAll({ filter: `_fc_company_value eq ${companyId} and fc_completed eq true` }),
    Fc_weeklyreportsService.getAll({ filter: `_fc_company_value eq ${companyId}`, orderBy: ['createdon desc'], top: 20 }),
  ])
  const calendarRows = unwrap(calendar, 'count calendar items')
  const libraryRows = unwrap(library, 'count library items')
  const roadmapRows = unwrap(roadmap, 'count roadmap milestones')
  const reportRows = unwrap(reports, 'load weekly reports')
  const now = Date.now()
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  return {
    calendar: calendarRows.length,
    library: libraryRows.length,
    roadmap: roadmapRows.length,
    publishedLast30: libraryRows.filter((row) => row.fc_statusname === 'Published' && Date.parse(createdAt(row)) >= now - 30 * 24 * 60 * 60 * 1000).length,
    // Same measure over the 30 days before, for a like-for-like comparison.
    publishedPrev30: libraryRows.filter((row) => row.fc_statusname === 'Published' && Date.parse(createdAt(row)) < now - 30 * 24 * 60 * 60 * 1000 && Date.parse(createdAt(row)) >= now - 60 * 24 * 60 * 60 * 1000).length,
    staleDrafts: libraryRows.filter((row) => row.fc_statusname === 'Draft' && Date.parse(createdAt(row)) <= now - 7 * 24 * 60 * 60 * 1000).length,
    hasReportThisWeek: reportRows.some((row) => Date.parse(createdAt(row)) >= weekStart.getTime()),
  }
}

// Company Integrations holds only non-secret connection status. The secret
// itself lives in Company Secrets and is reachable only through the flows.
const INTEGRATION_PROVIDER = { buffer: 122370000, groq: 122370001 } as const
const INTEGRATION_CONNECTED = 122370000

export async function isIntegrationConnected(companyId: string, provider: keyof typeof INTEGRATION_PROVIDER): Promise<boolean> {
  const rows = unwrap(await Fc_companyintegrationsService.getAll({
    filter: `_fc_company_value eq ${companyId} and fc_provider eq ${INTEGRATION_PROVIDER[provider]} and fc_status eq ${INTEGRATION_CONNECTED}`,
    top: 1,
  }), 'load integration status')
  return rows.length > 0
}

export async function markIntegrationConnected(companyId: string, provider: keyof typeof INTEGRATION_PROVIDER, label: string): Promise<void> {
  const existing = unwrap(await Fc_companyintegrationsService.getAll({
    filter: `_fc_company_value eq ${companyId} and fc_provider eq ${INTEGRATION_PROVIDER[provider]}`,
    top: 1,
  }), 'find integration')[0]
  if (existing) {
    unwrap(await Fc_companyintegrationsService.update(existing.fc_companyintegrationid, { fc_status: INTEGRATION_CONNECTED }), 'update integration')
  } else {
    unwrap(await Fc_companyintegrationsService.create({
      'fc_Company@odata.bind': lookup('fc_companies', companyId),
      fc_companyintegration1: label,
      fc_provider: INTEGRATION_PROVIDER[provider],
      fc_status: INTEGRATION_CONNECTED,
      statecode: 0,
    }), 'create integration')
  }
}
