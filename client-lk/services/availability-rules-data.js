import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../shared/firebase.js';
import { COL } from '../../shared/schema.js';
import { normalizeAvailabilityRuleDoc } from '../../shared/availability-rules.js';

/** @returns {Promise<import('../../shared/availability-rules.js').AvailabilityRuleDoc[]>} */
export async function fetchAllAvailabilityRules() {
  const snap = await getDocs(collection(db, COL.AVAILABILITY_RULES));
  return snap.docs
    .map(d => normalizeAvailabilityRuleDoc({ id: d.id, ...d.data() }, d.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
