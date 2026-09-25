#!/usr/bin/env node
// Creates the geographic targeting tables (places, zones) and seeds Cameroon's
// country, regions, main cities and the best-known Douala and Yaoundé
// neighbourhoods. See docs/ai-data-model.md, "Geography".
//
//   node scripts/dataverse/create-geo-tables.mjs --dry-run
//   node scripts/dataverse/create-geo-tables.mjs
//
// Idempotent: existing tables, columns, keys and places (matched by fc_code) are skipped.

import { api, DRY_RUN, done, runSchema, step } from './lib.mjs'

const company = ['fc_company', 'Company', 'lookup', { target: 'fc_company', required: true }]

const TABLES = [
  {
    name: 'fc_place', display: 'Place', plural: 'Places', primary: ['fc_name', 'Name', 200],
    description: 'Country, region, city or neighbourhood. Shared reference places have no company; places a company adds carry its company.',
    columns: [
      ['fc_code', 'Code', 'string', { maxLength: 100, required: true }],
      ['fc_level', 'Level', 'choice', { values: ['country', 'region', 'city', 'neighbourhood'], required: true }],
      ['fc_parent', 'Parent place', 'lookup', { target: 'fc_place' }],
      ['fc_latitude', 'Latitude', 'decimal', { precision: 6, min: -90, max: 90 }],
      ['fc_longitude', 'Longitude', 'decimal', { precision: 6, min: -180, max: 180 }],
      ['fc_company', 'Company', 'lookup', { target: 'fc_company' }],
    ],
    keys: [['fc_placecode', 'Place code', ['fc_code']]],
  },
  {
    name: 'fc_zone', display: 'Zone', plural: 'Zones', primary: ['fc_name', 'Name', 200],
    description: 'A named target area: a group of places, optionally extended by a radius around a centre place.',
    columns: [
      company,
      ['fc_description', 'Description', 'multiline', { maxLength: 2000 }],
      ['fc_center', 'Centre place', 'lookup', { target: 'fc_place' }],
      ['fc_radiuskm', 'Radius (km)', 'decimal', { precision: 1, min: 0, max: 1000 }],
    ],
  },
  {
    name: 'fc_zoneplace', display: 'Zone Place', plural: 'Zone Places', primary: ['fc_name', 'Name', 200],
    description: 'A place included in a zone.',
    columns: [
      company,
      ['fc_zone', 'Zone', 'lookup', { target: 'fc_zone', required: true }],
      ['fc_place', 'Place', 'lookup', { target: 'fc_place', required: true }],
    ],
    keys: [['fc_zoneplace', 'Zone and place', ['fc_zone', 'fc_place']]],
  },
]

const EXTEND = [
  ['fc_campaign', ['fc_zone', 'Target zone', 'lookup', { target: 'fc_zone' }]],
  ['fc_contact', ['fc_place', 'Place', 'lookup', { target: 'fc_place' }]],
]

// ─── Seed data ────────────────────────────────────────────────────────────────
// Coordinates are approximate city centres, used only as radius centres.
// [code, name, level, parentCode, lat, lng]

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')

const REGIONS = [
  ['AD', 'Adamaoua', 7.3167, 13.5833, [['Ngaoundéré', 7.3167, 13.5833], ['Meiganga', 6.5167, 14.3]]],
  ['CE', 'Centre', 3.848, 11.5021, [['Yaoundé', 3.848, 11.5021], ['Mbalmayo', 3.5167, 11.5], ['Obala', 4.1667, 11.5333]]],
  ['ES', 'Est', 4.5776, 13.6846, [['Bertoua', 4.5776, 13.6846], ['Batouri', 4.4333, 14.3667]]],
  ['EN', 'Extrême-Nord', 10.5956, 14.3247, [['Maroua', 10.5956, 14.3247], ['Kousséri', 12.0769, 15.0306]]],
  ['LT', 'Littoral', 4.0511, 9.7679, [['Douala', 4.0511, 9.7679], ['Nkongsamba', 4.9547, 9.9404], ['Edéa', 3.8, 10.1333]]],
  ['NO', 'Nord', 9.3, 13.4, [['Garoua', 9.3, 13.4]]],
  ['NW', 'Nord-Ouest', 5.9597, 10.146, [['Bamenda', 5.9597, 10.146], ['Kumbo', 6.2, 10.6667]]],
  ['OU', 'Ouest', 5.4781, 10.4176, [['Bafoussam', 5.4781, 10.4176], ['Dschang', 5.45, 10.0667], ['Bafang', 5.1667, 10.1833]]],
  ['SU', 'Sud', 2.9, 11.15, [['Ebolowa', 2.9, 11.15], ['Kribi', 2.95, 9.9167], ['Sangmélima', 2.9333, 11.9833]]],
  ['SW', 'Sud-Ouest', 4.1527, 9.241, [['Buea', 4.1527, 9.241], ['Limbé', 4.0167, 9.2], ['Kumba', 4.6333, 9.45]]],
]

const NEIGHBOURHOODS = {
  'LT/Douala': ['Akwa', 'Bonanjo', 'Bonapriso', 'Bonamoussadi', 'Deïdo', 'Bali', 'Makepe', 'Logbessou', 'Logpom', 'Ndokoti', 'Bépanda', 'Kotto', 'New Bell', 'Bonabéri', 'Yassa', 'Cité des Palmiers'],
  'CE/Yaoundé': ['Bastos', 'Mvog-Mbi', 'Essos', 'Mokolo', 'Nlongkak', 'Omnisport', 'Biyem-Assi', 'Mendong', 'Ngousso', 'Odza', 'Emana', 'Mvan', 'Tsinga', 'Etoudi', 'Ekounou', 'Nkolbisson', 'Mimboman'],
}

function seedPlaces() {
  const places = [['CM', 'Cameroun', 'country', null, 7.3697, 12.3547]]
  for (const [code, name, lat, lng, cities] of REGIONS) {
    const regionCode = `CM-${code}`
    places.push([regionCode, name, 'region', 'CM', lat, lng])
    for (const [city, clat, clng] of cities) {
      const cityCode = `${regionCode}-${slug(city)}`
      places.push([cityCode, city, 'city', regionCode, clat, clng])
      for (const quarter of NEIGHBOURHOODS[`${code}/${city}`] ?? []) {
        places.push([`${cityCode}-${slug(quarter)}`, quarter, 'neighbourhood', cityCode, null, null])
      }
    }
  }
  return places
}

const LEVEL_VALUE = { country: 122370000, region: 122370001, city: 122370002, neighbourhood: 122370003 }

async function seed() {
  const places = seedPlaces()
  if (DRY_RUN) {
    const table = await api('GET', `EntityDefinitions(LogicalName='fc_place')?$select=EntitySetName`)
    if (!table) { console.log(`[plan] seed ${places.length} places (1 country, ${REGIONS.length} regions, cities and neighbourhoods)`); return }
  }
  const set = (await api('GET', `EntityDefinitions(LogicalName='fc_place')?$select=EntitySetName`)).EntitySetName
  const ids = new Map()
  let skipped = 0
  for (const [code, name, level, parentCode, lat, lng] of places) {
    const existing = (await api('GET', `${set}?$select=fc_placeid&$filter=fc_code eq '${code}'`))?.value?.[0]
    if (existing) { ids.set(code, existing.fc_placeid); skipped++; continue }
    await step(`seed place ${code} (${name})`, async () => {
      const body = {
        fc_name: name, fc_code: code, fc_level: LEVEL_VALUE[level],
        ...(lat !== null ? { fc_latitude: lat, fc_longitude: lng } : {}),
        ...(parentCode && ids.get(parentCode) ? { 'fc_Parent@odata.bind': `/${set}(${ids.get(parentCode)})` } : {}),
      }
      const created = await api('POST', set, body, { Prefer: 'return=representation' })
      ids.set(code, created.fc_placeid)
    })
  }
  if (skipped) console.log(`[skip] ${skipped} places already exist`)
}

// ─── Run ──────────────────────────────────────────────────────────────────────

await runSchema({ tables: TABLES, extend: EXTEND, requires: ['fc_company', 'fc_campaign', 'fc_contact'] })
await seed()
console.log(`\n${DRY_RUN ? 'Plan complete.' : `Finished: ${done.length} change(s).`}`)
