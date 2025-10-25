import { spawn } from 'node:child_process'

function run(cmd, args, name) {
  const p = spawn(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  p.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[${name}] exited with signal ${signal}`)
    } else {
      console.log(`[${name}] exited with code ${code}`)
    }
  })
  return p
}

const web = run('npm', ['run', 'dev:web'], 'web')
const tg = run('npm', ['run', 'dev:tg'], 'telegram')

function shutdown() {
  if (web && !web.killed) web.kill('SIGINT')
  if (tg && !tg.killed) tg.kill('SIGINT')
  process.exit()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

