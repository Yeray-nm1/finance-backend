import { parse } from 'csv-parse/sync'

export function parseCsv(buffer: Buffer) {
  return parse(buffer, {
    columns: true,
    skip_empty_lines: true
  })
}