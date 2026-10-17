import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"

const failures = []
const read = (path) => readFileSync(path, "utf8")
const walk = (path) => readdirSync(path).flatMap((name) => {
  const file = join(path, name)
  return statSync(file).isDirectory() ? walk(file) : [file]
})

const appFiles = [...walk("src/components/app"), ...walk("src/pages/app")].filter((file) => /\.[jt]sx?$/.test(file))
for (const file of appFiles) {
  const source = read(file)
  if (source.includes("includes('*')")) failures.push(`${file}: wildcard company permission found`)
  if (/role === ['"]platform['"]|ROLES\.platform|ROLES\.support/.test(source)) failures.push(`${file}: platform identity embedded in company role model`)
}

const routes = read("src/routes.tsx")
if (routes.includes("validSupport")) failures.push("src/routes.tsx: support access satisfies company route guard")
if (/pages\/billing\/Checkout|pages\/app\/AdminBilling|pages\/admin\/BillingOps/.test(routes)) failures.push("src/routes.tsx: legacy billing engine is still routed")

const policy = read("src/security/access.ts")
const admin = policy.match(/admin:\s*\{[\s\S]*?\n\s*\},\n\s*md:/)?.[0] ?? ""
const md = policy.match(/md:\s*\{[\s\S]*?\n\s*\},\n\s*hr:/)?.[0] ?? ""
for (const permission of ["payroll.approve", "accounting.post", "payments.disburse", "finance.tiers.manage"]) {
  if (admin.includes(`'${permission}'`)) failures.push(`Company Administrator incorrectly has ${permission}`)
}
for (const permission of ["company.roles.manage", "company.subscription.manage", "company.brand.manage"]) {
  if (md.includes(`'${permission}'`)) failures.push(`CEO/MD incorrectly has ${permission}`)
}

const changes = read("src/platform/changes.ts")
if (!changes.includes("COMPANY_CONTROLLED_AREAS.includes")) failures.push("Platform changes do not enforce company-controlled areas")

if (failures.length) {
  console.error("Security boundary checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"))
  process.exit(1)
}

console.log(`Security boundary checks passed across ${appFiles.length} company application files.`)
