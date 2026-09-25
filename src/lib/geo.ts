import { Fc_placesService, Fc_zoneplacesService, Fc_zonesService } from '@/generated'
import type { Fc_places } from '@/generated/models/Fc_placesModel'
import { lookup, unwrap } from './dataverse'

export const PLACE_LEVELS = ['country', 'region', 'city', 'neighbourhood'] as const
export type PlaceLevel = typeof PLACE_LEVELS[number]

export interface Place {
  id: string
  code: string
  name: string
  level: PlaceLevel
  parent_id: string | null
  latitude: number | null
  longitude: number | null
  // Set for places a company added; null for shared reference places.
  company_id: string | null
}

export interface Zone {
  id: string
  name: string
  description: string
  center_id: string | null
  radius_km: number | null
  place_ids: string[]
}

export type ZoneInput = Omit<Zone, 'id'>

const LEVEL_BASE = 122370000

function placeFromRow(row: Fc_places): Place {
  return {
    id: row.fc_placeid,
    code: row.fc_code,
    name: row.fc_name ?? '',
    level: PLACE_LEVELS[Number(row.fc_level) - LEVEL_BASE] ?? 'city',
    parent_id: row._fc_parent_value ?? null,
    latitude: row.fc_latitude ?? null,
    longitude: row.fc_longitude ?? null,
    company_id: row._fc_company_value ?? null,
  }
}

// Shared reference places plus the places this company added.
export async function listPlaces(companyId: string): Promise<Place[]> {
  return unwrap(await Fc_placesService.getAll({
    filter: `_fc_company_value eq null or _fc_company_value eq ${companyId}`,
    orderBy: ['fc_name asc'],
  }), 'load places').map(placeFromRow)
}

// Adds a company-specific place (typically a neighbourhood) under a parent place.
export async function createPlace(companyId: string, parent: Place, name: string): Promise<Place> {
  const level = PLACE_LEVELS[Math.min(PLACE_LEVELS.indexOf(parent.level) + 1, PLACE_LEVELS.length - 1)]
  const code = `${parent.code}-${name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')}-${companyId.slice(0, 8).toUpperCase()}`
  const row = unwrap(await Fc_placesService.create({
    fc_name: name,
    fc_code: code,
    fc_level: (LEVEL_BASE + PLACE_LEVELS.indexOf(level)) as never,
    'fc_Parent@odata.bind': lookup('fc_places', parent.id),
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    statecode: 0,
  } as never), 'create place')
  return placeFromRow(row)
}

export async function listZones(companyId: string): Promise<Zone[]> {
  const [zones, links] = await Promise.all([
    Fc_zonesService.getAll({ filter: `_fc_company_value eq ${companyId}`, orderBy: ['fc_name asc'] }),
    Fc_zoneplacesService.getAll({ filter: `_fc_company_value eq ${companyId}`, select: ['_fc_zone_value', '_fc_place_value'] }),
  ])
  const placesByZone = new Map<string, string[]>()
  for (const link of unwrap(links, 'load zone places')) {
    if (!link._fc_zone_value || !link._fc_place_value) continue
    placesByZone.set(link._fc_zone_value, [...(placesByZone.get(link._fc_zone_value) ?? []), link._fc_place_value])
  }
  return unwrap(zones, 'load zones').map(row => ({
    id: row.fc_zoneid,
    name: row.fc_name ?? '',
    description: row.fc_description ?? '',
    center_id: row._fc_center_value ?? null,
    radius_km: row.fc_radiuskm ?? null,
    place_ids: placesByZone.get(row.fc_zoneid) ?? [],
  }))
}

function zonePayload(input: ZoneInput) {
  return {
    fc_name: input.name,
    fc_description: input.description,
    'fc_Center@odata.bind': input.center_id ? lookup('fc_places', input.center_id) : null,
    fc_radiuskm: input.radius_km,
  }
}

async function syncZonePlaces(companyId: string, zoneId: string, placeIds: string[]): Promise<void> {
  const current = unwrap(await Fc_zoneplacesService.getAll({
    filter: `_fc_zone_value eq ${zoneId}`, select: ['fc_zoneplaceid', '_fc_place_value'],
  }), 'load zone places')
  const wanted = new Set(placeIds)
  const existing = new Set(current.map(link => link._fc_place_value))
  await Promise.all([
    ...current.filter(link => !wanted.has(link._fc_place_value ?? '')).map(link => Fc_zoneplacesService.delete(link.fc_zoneplaceid)),
    ...placeIds.filter(id => !existing.has(id)).map(async placeId => unwrap(await Fc_zoneplacesService.create({
      'fc_Company@odata.bind': lookup('fc_companies', companyId),
      'fc_Zone@odata.bind': lookup('fc_zones', zoneId),
      'fc_Place@odata.bind': lookup('fc_places', placeId),
      fc_name: placeId,
      statecode: 0,
    } as never), 'add place to zone')),
  ])
}

export async function createZone(companyId: string, input: ZoneInput): Promise<Zone> {
  const row = unwrap(await Fc_zonesService.create({
    ...zonePayload(input),
    'fc_Company@odata.bind': lookup('fc_companies', companyId),
    statecode: 0,
  } as never), 'create zone')
  await syncZonePlaces(companyId, row.fc_zoneid, input.place_ids)
  return { ...input, id: row.fc_zoneid }
}

export async function updateZone(companyId: string, id: string, input: ZoneInput): Promise<void> {
  unwrap(await Fc_zonesService.update(id, zonePayload(input) as never), 'update zone')
  await syncZonePlaces(companyId, id, input.place_ids)
}

export async function deleteZone(id: string): Promise<void> {
  const links = unwrap(await Fc_zoneplacesService.getAll({ filter: `_fc_zone_value eq ${id}`, select: ['fc_zoneplaceid'] }), 'load zone places')
  await Promise.all(links.map(link => Fc_zoneplacesService.delete(link.fc_zoneplaceid)))
  await Fc_zonesService.delete(id)
}

// "Akwa, Bonanjo (Douala) + 30 km around Douala" - used in the UI and in AI prompts.
export function describeZone(zone: Zone, places: Place[]): string {
  const byId = new Map(places.map(p => [p.id, p]))
  const names = zone.place_ids.map(id => byId.get(id)).filter((p): p is Place => Boolean(p)).map(p => {
    const parent = p.parent_id ? byId.get(p.parent_id) : undefined
    return p.level === 'neighbourhood' && parent ? `${p.name} (${parent.name})` : p.name
  })
  const center = zone.center_id ? byId.get(zone.center_id) : undefined
  const radius = zone.radius_km && center ? ` + ${zone.radius_km} km around ${center.name}` : ''
  return `${names.join(', ') || (center?.name ?? '')}${radius}`
}
