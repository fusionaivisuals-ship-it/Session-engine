// Print cost line for a session manifest
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';

const sessionsDir = resolve(process.cwd(), 'sessions');
const files = readdirSync(sessionsDir).filter(f => f.endsWith('.json'));

const priceInputPerM = parseFloat(process.env.PRICE_INPUT_PER_M || '0.80');
const priceOutputPerM = parseFloat(process.env.PRICE_OUTPUT_PER_M || '4.00');
const ntdPerUsd = parseFloat(process.env.NTD_PER_USD || '32');

for (const f of files) {
  const session = JSON.parse(readFileSync(join(sessionsDir, f), 'utf8'));
  const calls = session.metrics?.modelCalls ?? [];
  if (calls.length === 0) {
    console.log(`${f}: no model calls`);
    continue;
  }
  let totalInput = 0, totalOutput = 0;
  for (const c of calls) {
    totalInput += c.inputTokens;
    totalOutput += c.outputTokens;
  }
  const costUsd = (totalInput / 1_000_000) * priceInputPerM + (totalOutput / 1_000_000) * priceOutputPerM;
  const costNtd = costUsd * ntdPerUsd;
  console.log(`${f}: ${calls.length} calls, ${totalInput} input + ${totalOutput} output tokens`);
  console.log(`  Cost: $${costUsd.toFixed(4)} USD / NT$${costNtd.toFixed(2)} (assumed ${ntdPerUsd} NTD/USD)`);
  console.log(`  Retried: ${calls.filter((c: any) => c.retried).length}`);
}
