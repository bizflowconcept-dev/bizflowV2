/* Documentation integrity check: builds the platform registry from the real source tree and validates it against docsContent.ts.
   Exits 1 on any error-level finding; warnings and info are printed for review. */
import { scanSource } from "./lib/sourceScan.mjs"
import { loadModules } from "./lib/loadModules.mjs"

const source = scanSource(process.cwd())
const [registry, integrity] = await loadModules(["/src/platform/registry.ts", "/src/platform/integrity.ts"])
const r = registry.buildRegistry(source)
const findings = integrity.runIntegrity(r)
const s = integrity.summarize(findings)

const show = (severity, label) => {
  const list = findings.filter((f) => f.severity === severity)
  if (!list.length) return
  console.log(`\n${label} (${list.length})`)
  for (const f of list) console.log(`- [${f.check}] ${f.message}\n    fix: ${f.fix.label}${f.fix.file ? ` (${f.fix.file})` : ""}${f.fix.to ? ` (${f.fix.to})` : ""}`)
}
show("error", "ERRORS")
show("warn", "WARNINGS")
if (process.argv.includes("--verbose")) show("info", "INFO")

console.log(`\nDocs integrity: ${r.modules.length} modules, ${r.routes.length} routes, ${r.storage.length} storage keys checked. ${s.error} errors, ${s.warn} warnings, ${s.info} notes.`)
if (!s.pass) { console.error("Docs integrity check failed."); process.exit(1) }
console.log("Docs integrity check passed.")
