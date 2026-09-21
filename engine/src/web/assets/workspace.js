(function () {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const stages = ['Frame', 'Think privately', 'Reveal', 'Decide', 'Commit'];
  const stageIndex = type => ({ frame: 0, assign: 0, private_input: 1, reveal: 2, converge: 3, commit: 4, artifact: 4 }[type] ?? 0);
  const fmt = sec => `${Math.floor(Math.max(0, sec) / 60)}:${String(Math.floor(Math.max(0, sec) % 60)).padStart(2, '0')}`;

  function progress(block) {
    const current = stageIndex(block?.type);
    return `<nav class="session-progress" aria-label="Session progress"><ol>${stages.map((name, i) => `<li class="${i === current ? 'current' : i < current ? 'done' : ''}" ${i === current ? 'aria-current="step"' : ''}><span class="step-number">${i < current ? '✓' : String(i + 1).padStart(2, '0')}</span><span>${name}</span></li>`).join('')}</ol></nav>`;
  }

  function timer(clock, session, block) {
    const timed = Boolean(block?.timeboxSec);
    const remaining = clock?.remainingSec ?? 0;
    const fraction = clock?.totalSec > 0 ? Math.min(1, Math.max(0, remaining / clock.totalSec)) : 0;
    const state = session.status === 'paused' ? 'Paused' : !timed ? 'No time limit' : clock?.expired ? 'Time is up' : clock?.amber ? 'Finishing time' : 'Time to think';
    return `<section class="sidebar-card clock-card"><h2>Time remaining</h2><div class="clock-face ${clock?.amber ? 'amber' : ''} ${clock?.expired ? 'expired' : ''}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle class="clock-track" cx="50" cy="50" r="45"/><circle class="clock-arc" cx="50" cy="50" r="45" stroke-dasharray="282.743" stroke-dashoffset="${282.743 * (1 - fraction)}"/></svg><span class="timer" role="timer" aria-live="off">${timed && clock ? fmt(remaining) : '—'}</span></div><div class="clock-state">${state}</div></section>`;
  }

  function participants(session, block, viewerSeat) {
    const record = session.blocks[block.id] || {};
    const active = session.participants.filter(p => p.presence !== 'absent');
    let completed = new Set(record.confirmations || []);
    let verb = 'confirmed';
    if (block.type === 'private_input') { completed = new Set((record.submissions || []).map(s => s.seat)); verb = 'submitted'; }
    if (block.type === 'converge') { completed = new Set(Object.keys(record.votes || {})); verb = 'voted'; }
    return `<section class="sidebar-card people-card"><h2>${session.mode === 'solo' ? 'Your progress' : 'In this session'}</h2><p class="participant-count">${active.filter(p => completed.has(p.seat)).length} of ${active.length} ${verb}</p><ul class="participant-list">${session.participants.map((p, index) => {
      const done = completed.has(p.seat);
      const status = p.presence === 'absent' ? 'Away' : done ? '✓ ' + verb : block.type === 'private_input' ? 'Thinking' : 'Ready';
      const label = p.seat === viewerSeat ? 'You' : session.anonymous ? `Seat ${index + 1}` : p.displayName;
      return `<li><span class="avatar" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span><span class="participant-name">${esc(label)}</span><span class="participant-status ${done ? 'finished' : ''}">${esc(status)}</span></li>`;
    }).join('')}</ul></section>`;
  }

  function shell(data, content, viewerSeat) {
    const { session, method, block, clockStatus } = data;
    const guidance = block.walkthrough?.whyItMatters;
    return `${progress(block)}<div class="workspace-grid" data-block-id="${esc(block.id)}" data-session-status="${esc(session.status)}" data-timed="${Boolean(block.timeboxSec)}"><aside class="session-sidebar" aria-label="Session status">${timer(clockStatus, session, block)}${participants(session, block, viewerSeat)}${guidance ? `<section class="sidebar-card guidance-card"><h2>A little guidance</h2><p>${esc(guidance)}</p></section>` : ''}<p class="sidebar-foot">${esc(method.name)}${session.anonymous ? '<br>Anonymous session' : ''}</p></aside><main class="task-panel" id="task" tabindex="-1">${content}</main></div>`;
  }

  function heading(data, viewerSeat) {
    const { session, method, block, lens } = data;
    const index = method.blocks.findIndex(b => b.id === block.id);
    const roleId = session.participants.find(p => p.seat === viewerSeat)?.roleId;
    const role = method.roles?.find(r => r.id === roleId);
    const badge = role?.name || lens?.name;
    return `<p class="eyebrow">${esc(stages[stageIndex(block.type)])} <span aria-hidden="true">/</span> Round ${index + 1} of ${method.blocks.length}</p><h1>${esc(session.facts.problemStatement || block.title)}</h1>${session.status === 'paused' ? '<p class="task-intro" role="status">Session paused. Your facilitator will resume the clock.</p>' : ''}${badge ? `<span class="perspective-badge">${esc(badge)}</span>` : ''}${role ? `<p class="task-intro">${esc(role.brief)}</p>${role.hiddenBrief ? `<details><summary>Your private brief</summary><p>${esc(role.hiddenBrief)}</p></details>` : ''}` : ''}`;
  }

  function updateClock(message) {
    const root = document.querySelector('.workspace-grid');
    const clock = message.clockStatus;
    if (!root || root.dataset.blockId !== message.blockId || !clock) return;
    const face = root.querySelector('.clock-face');
    if (!face) return;
    const timed = root.dataset.timed === 'true';
    face.querySelector('.timer').textContent = timed ? fmt(clock.remainingSec) : '—';
    const fraction = clock.totalSec > 0 ? Math.min(1, Math.max(0, clock.remainingSec / clock.totalSec)) : 0;
    face.querySelector('.clock-arc').setAttribute('stroke-dashoffset', String(282.743 * (1 - fraction)));
    face.classList.toggle('amber', clock.amber);
    face.classList.toggle('expired', clock.expired);
    root.querySelector('.clock-state').textContent = root.dataset.sessionStatus === 'paused' ? 'Paused' : !timed ? 'No time limit' : clock.expired ? 'Time is up' : clock.amber ? 'Finishing time' : 'Time to think';
  }

  function decisionRecord(session) {
    const commitment = session.facts.commitment;
    if (!commitment) return '';
    const owner = session.participants.find(p => p.seat === commitment.owner)?.displayName || commitment.owner;
    return `<div class="decision-paper"><div class="paper-topline"><span>Session Engine</span><span>Decision record</span></div><h3>${esc(session.facts.problemStatement)}</h3><p class="record-label">The decision</p><p class="record-decision">${esc(session.facts.decision || 'No decision recorded')}</p><div class="record-fields"><div><p class="record-label">Owner</p><p>${esc(owner)}</p></div><div><p class="record-label">Due date</p><p>${esc(commitment.dueDate)}</p></div><div><p class="record-label">First action</p><p>${esc(commitment.firstAction)}</p></div><div><p class="record-label">Success signal</p><p>${esc(commitment.successSignal)}</p></div></div></div>`;
  }

  function preserveForm(root, blockId) {
    const sameBlock = root.dataset.renderedBlock === blockId;
    const fields = sameBlock ? Array.from(root.querySelectorAll('input[id], textarea[id], select[id]'), el => ({ id: el.id, value: el.value, checked: el.checked })) : [];
    const active = sameBlock && root.contains(document.activeElement) ? document.activeElement : null;
    const focus = active ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
    root.dataset.renderedBlock = blockId;
    return () => {
      for (const field of fields) {
        const el = document.getElementById(field.id);
        if (el && root.contains(el)) { el.value = field.value; if (el.type === 'checkbox') el.checked = field.checked; }
      }
      const el = focus?.id ? document.getElementById(focus.id) : null;
      if (el && !el.disabled) { el.focus({ preventScroll: true }); if (typeof focus.start === 'number' && typeof el.setSelectionRange === 'function') el.setSelectionRange(focus.start, focus.end); }
    };
  }

  function currentReview(record) {
    return (record.reviewerVerdicts || []).filter(v => (v.decisionRound || 0) === (record.decisionRound || 0) && (!v.decision || v.decision === record.decision)).at(-1);
  }
  function ready(v) { return Boolean(v?.pass && v.confidence >= .5 && !v.scores.some(s => s.unverifiedEvidence || (s.concern && s.concern !== 'none'))); }
  function review(record, block) {
    const v = currentReview(record);
    if (!v) return '<p class="info">No review of the current decision yet. You can request advice or proceed with a recorded reason.</p>';
    const labels = { none: 'No concern identified', missing_evidence: 'Missing evidence — not addressed in the notes', weak_reasoning: 'Weak reasoning — inference needs support', contradiction: 'Contradiction — conflicts with supplied evidence' };
    return `<section class="verdict-panel ${ready(v) ? 'pass' : 'fail'}"><h2>${ready(v) ? 'Ready to act' : 'Needs attention'}</h2><p>${esc(v.oneLineFeedback)}</p><p class="task-intro">Advice, not a verdict. A matching quotation confirms the text exists; it does not establish that the interpretation is sound.</p>${v.scores.map(s => {
      const c = block.rubric?.criteria.find(c => c.id === s.criterion);
      return `<div class="review-criterion"><h3>${esc(c?.text || s.criterion)} <span>${s.score}/2</span></h3><p><strong>${esc(labels[s.concern] || 'Concern not classified in this older review')}</strong></p>${s.explanation ? `<p>${esc(s.explanation)}</p>` : ''}${s.evidence ? `<blockquote>${esc(s.evidence)}</blockquote>` : '<p>No supporting quotation supplied.</p>'}${s.unverifiedEvidence ? '<p class="error">Quotation could not be verified. Treat this assessment as uncertain.</p>' : ''}${c?.scoring ? `<details><summary>What scores 0, 1 and 2 mean</summary><ul><li>0 — ${esc(c.scoring.zero)}</li><li>1 — ${esc(c.scoring.one)}</li><li>2 — ${esc(c.scoring.two)}</li></ul></details>` : ''}</div>`;
    }).join('')}${v.ignoredLenses?.length ? `<p>Perspectives to revisit: ${v.ignoredLenses.map(esc).join(', ')}</p>` : ''}${v.confidence < .5 ? '<p>Reviewer uncertainty is high. Read the sources before proceeding.</p>' : ''}</section>`;
  }
  function acceptance(record) {
    const needsReason = !ready(currentReview(record));
    return `<section class="decision-acceptance"><h3>Your decision to proceed</h3><p class="task-intro">You may revise the proposal or proceed after considering the concerns. Your choice and reason are recorded.</p><label for="proceedReason">Reason for proceeding ${needsReason ? '(required)' : '(optional)'}</label><textarea id="proceedReason" maxlength="4000" ${needsReason ? 'required' : ''} placeholder="Which concerns remain, and why is proceeding reasonable?"></textarea><button onclick="doAcceptDecision()" ${record.decision ? '' : 'disabled'}>${needsReason ? 'Proceed with a recorded reason' : 'Accept decision and continue'}</button></section>`;
  }
  function themes(session, block, record) {
    const originals = (block.sourceBlockId || '').split(',').flatMap(id => session.blocks[id.trim()]?.submissions || []);
    const reveal = record.reveal || {};
    const renderOriginal = s => `<div class="submission-card"><strong>${esc(session.participants.find(p => p.seat === s.seat)?.displayName || s.seat)}</strong><p>${esc(s.passed ? 'Passed: ' + (s.passReason || '') : s.text)}</p></div>`;
    let html = '<p class="task-intro">Themes organize topics; they do not imply consensus. Read the originals and retain different views.</p>';
    if (reveal.disagreements?.length) html += `<div class="disagreements"><strong>Unresolved disagreements</strong><ul>${reveal.disagreements.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>`;
    const covered = new Set();
    for (const c of reveal.clusters || []) {
      const sources = originals.filter(s => c.seats.includes(s.seat));
      sources.forEach(s => covered.add(s));
      html += `<section class="cluster-group"><h3>${esc(c.label)}</h3><p>${esc(c.summary)}</p><details><summary>Read original responses (${sources.length})</summary>${sources.map(renderOriginal).join('') || '<p>Original responses unavailable in this recording.</p>'}</details></section>`;
    }
    const omitted = originals.filter(s => !covered.has(s));
    if (omitted.length) html += `<section><h3>${reveal.clusters?.length ? 'Additional perspectives — not grouped' : 'Original responses'}</h3>${omitted.map(renderOriginal).join('')}</section>`;
    if (reveal.agreements?.length) html += `<div class="agreements"><strong>Possible shared points — check the scope</strong><ul>${reveal.agreements.map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
    return html;
  }
  window.WorkspaceUI = { esc, shell, heading, progress, updateClock, decisionRecord, preserveForm, currentReview, ready, review, acceptance, themes };
})();
