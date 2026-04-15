import { execSync } from 'node:child_process'

const REMOTE = 'r2:cloud-epb/ffxiv/'
const LOCAL = '_local_ref/'

console.log(`Pulling assets from ${REMOTE} -> ${LOCAL}`)
execSync(`rclone sync ${REMOTE} ${LOCAL} --progress`, { stdio: 'inherit' })
console.log('Done.')
