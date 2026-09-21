import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { getSessionsDir } from './manifest.js';
import { renderReport } from './report.js';
import {
  frameToCommitSec,
  wordsBySeat as computeWordsBySeat,
  shareBySeat,
  participationFlags,
  lensCoverage as computeLensCoverage,
} from './metrics.js';
import { seatLabel, anonymizePayload, anonymousParticipationSummary } from './anonymize.js';
import { saveManifest } from './manifest.js';
import type { SessionState, Method } from '../types.js';

/** Generate the one-pager (legacy from prompt 02) */
function generateOnePager(session: SessionState, method: Method): string {
  const isAnon = session.anonymous;
  const lines: string[] = [];
  lines.push(`# Session Report: ${method.name}`);
  lines.push(`Room: ${session.roomCode} | ${session.createdAt}`);
  lines.push('');

  lines.push('## Problem');
  lines.push(session.facts.problemStatement ?? '(not set)');
  lines.push('');

  for (const block of method.blocks) {
    const record = session.blocks[block.id];
    if (!record) continue;
    if (block.type === 'artifact') continue;

    lines.push(`## ${block.title}`);

    if (record.submissions && record.submissions.length > 0) {
      for (const sub of record.submissions) {
        const name = isAnon ? seatLabel(session, method, sub.seat) : (session.participants.find(pp => pp.seat === sub.seat)?.displayName ?? sub.seat);
        const tag = sub.autoSubmitted ? ' (auto-submitted)' : sub.passed ? ' (passed)' : '';
        lines.push(`**${name}**${tag}:`);
        lines.push(sub.passed ? `*Passed: ${sub.passReason || 'no reason'}*` : sub.text);
        lines.push('');
      }
    }

    if (record.decision) {
      lines.push(`**Decision:** ${record.decision}`);
      lines.push('');
    }
    if (record.decisionAcceptance) {
      lines.push(`**Reason for proceeding:** ${record.decisionAcceptance.reason || 'Reviewed the advice and chose to proceed.'}`, '');
    }

    if (record.overrideReason) {
      lines.push(`*Facilitator override: ${record.overrideReason}*`);
      lines.push('');
    }

    lines.push(`Exit: ${record.exitReason} | Entered: ${record.enteredAt}${record.exitedAt ? ' | Exited: ' + record.exitedAt : ''}`);
    lines.push('');
  }

  if (session.facts.commitment) {
    const c = session.facts.commitment;
    lines.push('## Commitment');
    lines.push(`- **Owner:** ${c.owner}`);
    lines.push(`- **First action:** ${c.firstAction}`);
    lines.push(`- **Due:** ${c.dueDate}`);
    lines.push(`- **Success signal:** ${c.successSignal}`);
    lines.push('');
  }

  // Participation
  if (session.anonymous) {
    lines.push('## Participation', ...anonymousParticipationSummary(shareBySeat(session, method), participationFlags(session, method)), '');
  } else if (session.metrics.wordsBySeat) {
    lines.push('## Participation');
    const total = Object.values(session.metrics.wordsBySeat).reduce((a, b) => a + b, 0);
    for (const [seat, words] of Object.entries(session.metrics.wordsBySeat)) {
      const name = isAnon ? seatLabel(session, method, seat) : (session.participants.find(pp => pp.seat === seat)?.displayName ?? seat);
      const pct = total > 0 ? Math.round((words / total) * 100) : 0;
      lines.push(`- ${name}: ${words} words (${pct}%)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function writeArtifacts(session: SessionState, method: Method): { onePagerPath: string; reportPath: string } {
  const roomCode = session.roomCode;

  const reportsDir = join(getSessionsDir(), 'reports');
  if (!existsSync(reportsDir)) mkdirSync(reportsDir, { recursive: true });

  // Update metrics before generating
  session.metrics.frameToCommitSec = frameToCommitSec(session, method);
  session.metrics.wordsBySeat = computeWordsBySeat(session, method);
  const coverage = computeLensCoverage(session, method);
  session.metrics.lensCoverage = {};
  for (const c of coverage) {
    session.metrics.lensCoverage[c.lensOrRoleId] = c.coverage;
  }

  // 1. One-pager (legacy from prompt 02)
  const onePagerContent = generateOnePager(anonymizePayload(session, method), method);
  const onePagerPath = join(reportsDir, `${roomCode}-onepager.md`);
  writeFileSync(onePagerPath, onePagerContent);

  // 2. Full report (new in prompt 06a)
  const reportContent = renderReport(session, method);
  const reportPath = join(reportsDir, `${roomCode}.md`);
  writeFileSync(reportPath, reportContent);

  // 3. Copy facilitator run log template if it exists
  const sessionsDir = getSessionsDir();
  // Template lives in the project root sessions/ directory
  const projectSessionsDir = resolve(process.cwd(), '..', 'sessions');
  const templatePath = [
    join(sessionsDir, '_template-run-log.md'),
    resolve(dirname(process.argv[1] ?? ''), '../_template-run-log.md'),
    join(projectSessionsDir, '_template-run-log.md'),
  ].find(existsSync);
  if (templatePath) {
    const date = new Date().toISOString().split('T')[0];
    const logPath = join(sessionsDir, `${date}-${roomCode}-${method.id}.md`);
    if (!existsSync(logPath)) {
      let template = readFileSync(templatePath, 'utf-8');
      template = template
        .replace('{{DATE}}', date)
        .replace('{{ROOM_CODE}}', roomCode)
        .replace('{{METHOD_ID}}', method.id)
        .replace('{{METHOD_NAME}}', method.name)
        .replace('{{PARTICIPANTS}}', session.anonymous
          ? `${session.participants.length} participants (anonymous)`
          : session.participants.map(p => p.displayName).join(', '))
        .replace('{{PROBLEM}}', session.facts.problemStatement ?? '(not set)')
        .replace('{{DECISION}}', session.facts.decision ?? '(none)')
        .replace('{{TIME_MIN}}', session.metrics.frameToCommitSec != null ? String(Math.round(session.metrics.frameToCommitSec / 60)) : '?');
      writeFileSync(logPath, template);
    }
  }

  // Update session artifacts
  session.artifacts = { onePagerPath, reportPath };
  saveManifest(session);

  return { onePagerPath, reportPath };
}
