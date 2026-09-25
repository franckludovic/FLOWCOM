import { markIntegrationConnected } from './dataverse'
import { saveCompanySecret } from './integrations'
import { BufferCallService } from '@/generated/services/BufferCallService'

const NO_TOKEN_RESPONSE = 'No Buffer token was found for this company.'

// Runs a Buffer GraphQL query for a company. The BufferCall flow reads the
// company's Buffer token from Company Secrets, so it never reaches the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function bufferQuery(companyId: string, query: string, variables?: object): Promise<any> {
  const result = await BufferCallService.Run({
    text: companyId,
    text_1: query,
    text_2: variables ? JSON.stringify(variables) : '',
  })
  if (!result.success) {
    throw new Error(result.error instanceof Error ? result.error.message : String(result.error ?? 'Buffer request failed'))
  }
  const content = result.data?.content ?? ''
  if (content === NO_TOKEN_RESPONSE) throw new Error('Buffer is not connected for this company.')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any
  try {
    data = JSON.parse(content)
  } catch {
    throw new Error('Buffer returned an unreadable response.')
  }
  if (data?.errors?.length) throw new Error(data.errors[0].message)
  if (data?.error || data?.message) throw new Error(data.error ?? data.message)
  return data?.data ?? data
}

// Stores a company's Buffer token and confirms Buffer accepts it.
export async function saveBufferToken(companyId: string, accessToken: string): Promise<void> {
  await saveCompanySecret(companyId, 'Buffer', accessToken)
  const account = await bufferQuery(companyId, '{ account { organizations { id } } }')
  if (!account?.account?.organizations?.[0]?.id) throw new Error('No Buffer organization found for this token.')
  try {
    await markIntegrationConnected(companyId, 'buffer', 'Buffer')
  } catch (err) {
    console.warn('Saved the Buffer token but could not record its status', err)
  }
}
