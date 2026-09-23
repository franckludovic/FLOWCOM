export function requiredSetting(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required Azure Function setting: ${name}`)
  return value.replace(/\/$/, '')
}
