/**
 * Scenario loader — reads scenario JSON files from design/scenarios/.
 */
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getMethodsDir } from './methods.js';

export interface ScenarioSeat {
  seat: string;
  persona: string;
  submissions: Record<string, string>;
  passes?: string[];
}

export interface ScenarioCanned {
  reveals: Record<string, { clusters: any[]; disagreements: string[]; agreements: string[] }>;
  verdicts: Record<string, any[]>;
  decision: string;
  commitment: { owner: string; firstAction: string; dueDate: string; successSignal: string };
}

export interface Scenario {
  id: string;
  title: string;
  tier: 'fun' | 'opener' | 'critical-thinking' | 'team' | 'serious';
  methodId: string;
  minutes: number;
  audience: string;
  whatItTeaches: string;
  problemStatement: string;
  anonymous: boolean;
  seats: ScenarioSeat[];
  canned: ScenarioCanned;
}

let scenariosDir: string | null = null;

export function setScenariosDir(dir: string): void {
  scenariosDir = dir;
}

export function getScenariosDir(): string {
  if (scenariosDir) return scenariosDir;
  // Default: design/scenarios relative to methods dir
  const methodsDir = getMethodsDir();
  return join(methodsDir, '..', 'scenarios');
}

export function loadScenario(id: string): Scenario {
  const dir = getScenariosDir();
  const filePath = join(dir, `${id}.json`);
  if (!existsSync(filePath)) throw new Error(`Scenario "${id}" not found at ${filePath}`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

export function listScenarios(): Scenario[] {
  const dir = getScenariosDir();
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  return files.map(f => JSON.parse(readFileSync(join(dir, f), 'utf-8')));
}
