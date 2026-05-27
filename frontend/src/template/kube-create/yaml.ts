import { parse, stringify } from 'yaml'
import type { ParsedYamlResult } from './types'

export function stringifyKubeObject(value: Record<string, unknown>) {
  return stringify(value, {
    indent: 2,
    lineWidth: 120,
    singleQuote: false
  }).trimEnd()
}

export function parseKubeYaml(value: string): ParsedYamlResult {
  try {
    const parsed = parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'YAML 必须是一个 Kubernetes 对象。' }
    }
    return { ok: true, value: parsed as Record<string, unknown> }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'YAML 解析失败。'
    }
  }
}

export function readPath(value: unknown, path: Array<string | number>) {
  return path.reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined
    if (typeof key === 'number') return Array.isArray(current) ? current[key] : undefined
    if (typeof current === 'object' && key in current) return (current as Record<string, unknown>)[key]
    return undefined
  }, value)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function stringRecordToPairs(record: Record<string, unknown>) {
  return Object.entries(record).map(([key, value], index) => ({
    id: `${key}-${index}`,
    key,
    value: value === undefined || value === null ? '' : String(value)
  }))
}

export function pairsToRecord(pairs: Array<{ key: string; value: string }>) {
  return Object.fromEntries(
    pairs
      .map((pair) => [pair.key.trim(), pair.value] as const)
      .filter(([key]) => key)
  )
}
