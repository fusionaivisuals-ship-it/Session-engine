import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { SessionFacts, SessionState } from '../types.js';
import { findParticipantSeat } from './identity.js';

type Commitment = NonNullable<SessionFacts['commitment']>;
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile<Commitment>({
  type: 'object', additionalProperties: false,
  required: ['owner', 'firstAction', 'dueDate', 'successSignal'],
  properties: {
    owner: { type: 'string', minLength: 1 },
    firstAction: { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' },
    dueDate: { type: 'string', format: 'date' },
    successSignal: { type: 'string', minLength: 1, maxLength: 4000, pattern: '\\S' },
  },
});

export function validateCommitment(session: SessionState, value: unknown): Commitment {
  if (!validate(value)) throw new Error(`Invalid commitment: ${ajv.errorsText(validate.errors)}`);
  const seat = findParticipantSeat(session, value.owner);
  if (!seat) throw new Error('Commitment owner must be a participant');
  return { ...value, owner: seat };
}
