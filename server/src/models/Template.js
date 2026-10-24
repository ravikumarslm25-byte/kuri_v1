import mongoose from 'mongoose';

// A Template is a fortune "theme" (Cosmic Fortune, Love & Destiny, Career Oracle ...).
// It drives the AI prompt tone, the print card artwork and the offline fallback lines.
const templateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true }, // TMPL-001
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ['active', 'draft', 'archived'], default: 'draft' },
    theme: { type: String, default: 'general' }, // general | love | career | wealth | health
    promptHint: { type: String, default: '' }, // extra instruction appended to the AI prompt
    cardImageUrl: { type: String, default: '' }, // print-card frame artwork
    // Where the face photo / palm photo / fortune go on the artwork (see services/cardLayout.js).
    // null = the kiosk prints its standard design on top of the artwork.
    cardLayout: { type: mongoose.Schema.Types.Mixed, default: null },
    fallbackFortunes: { type: [String], default: [] },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Template = mongoose.model('Template', templateSchema);
