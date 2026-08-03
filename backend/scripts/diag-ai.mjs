import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
const env = fs.readFileSync(path.resolve('.env'),'utf8');
for (const line of env.split(/\r?\n/)) { const m = line.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g,''); }
const prisma = new PrismaClient();
const ps = await prisma.aIProvider.findMany({ orderBy: { priority: 'asc' } });
console.log('=== AIProvider ===');
for (const p of ps) console.log(`  [${p.status}] prio=${p.priority} name=${p.name} type=${p.type} endpoint=${p.endpoint} model=${p.model} key=${String(p.apiKey||'').slice(0,8)}...`);
console.log('\n=== 最近 20 条 APILog ===');
const logs = await prisma.aPILog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
for (const l of logs) console.log(`  ${l.createdAt.toISOString()} ${l.status} ${l.responseTime}ms ${String(l.endpoint||'').slice(0,40)} | ${String(l.errorMessage||'').slice(0,90)}`);
await prisma.$disconnect();
