import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const REMOTE = 'r2:cloud-epb/ffxiv/'
const LOCAL = '_local_ref/'

if (!existsSync(LOCAL)) {
  console.error(`Error: ${LOCAL} does not exist.`)
  process.exit(1)
}

const hasFiles = readdirSync(LOCAL, { recursive: true }).some((entry) => {
  const name = String(entry)
  if (name.endsWith('.DS_Store')) return false
  const full = join(LOCAL, name)
  return existsSync(full) && !statSync(full).isDirectory()
})

if (!hasFiles) {
  console.error(`Error: ${LOCAL} is empty. Refusing to sync to prevent deleting remote files.`)
  process.exit(1)
}

console.log(`Pushing assets from ${LOCAL} -> ${REMOTE}`)
execSync(`rclone sync ${LOCAL} ${REMOTE} --exclude ".DS_Store" --progress`, { stdio: 'inherit' })
console.log('Done.')
