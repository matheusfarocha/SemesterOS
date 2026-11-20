// Extract one or more syllabus PDFs from the terminal and save the JSON next to them.
// Usage: npm run extract -- samples/private/Calc_Syllabus.pdf samples/private/Cisc3130_Syllabus.pdf
import { readFileSync, writeFileSync } from 'node:fs'
import { extractSyllabusFacts } from './extractor.mjs'

const files = process.argv.slice(2)
if (!files.length) {
  console.error('Usage: npm run extract -- <file.pdf> [more.pdf]')
  process.exit(1)
}

for (const file of files) {
  process.stdout.write(`Extracting ${file} … `)
  const facts = await extractSyllabusFacts(readFileSync(file).toString('base64'), { today: '2026-11-20', term: 'Fall 2026' })
  const out = file.replace(/\.pdf$/i, '.extracted.json')
  writeFileSync(out, JSON.stringify(facts, null, 2))
  console.log(`done → ${out}`)
  console.log(`  ${facts.course.code} · ${facts.categories.length} categories · ${facts.items.length} items · ${facts.recurring.length} weekly patterns · ${facts.ambiguities.length} to double-check`)
}
