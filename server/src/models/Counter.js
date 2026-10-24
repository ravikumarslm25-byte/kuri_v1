import mongoose from 'mongoose';

// Atomic sequences for human-readable IDs (BKG-0001, TMPL-004 ...).
const counterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = mongoose.model('Counter', counterSchema);

export async function nextId(prefix, width = 4) {
  await Counter.updateOne({ _id: prefix }, { $inc: { seq: 1 } }, { upsert: true });
  const c = await Counter.findById(prefix).lean();
  return `${prefix}-${String(c.seq).padStart(width, '0')}`;
}
