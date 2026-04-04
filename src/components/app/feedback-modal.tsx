import type { FeedbackReason, Recommendation } from '@/lib/types';
import { FEEDBACK_OPTIONS } from './models';

interface FeedbackModalProps {
    recommendation: Recommendation | null;
    feedbackReason: FeedbackReason;
    feedbackNotes: string;
    saving: boolean;
    onReasonChange: (value: FeedbackReason) => void;
    onNotesChange: (value: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}

export function FeedbackModal({
    recommendation,
    feedbackReason,
    feedbackNotes,
    saving,
    onReasonChange,
    onNotesChange,
    onClose,
    onSubmit,
}: FeedbackModalProps) {
    if (!recommendation) return null;

    return (
        <div className="sheet-overlay" onClick={() => !saving && onClose()}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-header">
                    <div>
                        <p className="sheet-eyebrow">Feedback Loop</p>
                        <h3>Reject Recommendation</h3>
                    </div>
                    <button className="sheet-close" onClick={() => !saving && onClose()} aria-label="Close feedback modal">
                        x
                    </button>
                </div>

                <div className="sheet-body">
                    <div className="sheet-hero">
                        {recommendation.posterUrl ? (
                            <img src={recommendation.posterUrl} alt={recommendation.title} className="sheet-poster" />
                        ) : (
                            <div className="sheet-poster placeholder">No poster</div>
                        )}
                        <div className="sheet-hero-copy">
                            <h4>{recommendation.title}</h4>
                            <p>{recommendation.year || 'Release year unknown'}</p>
                            <span className="helper-copy">
                                This feedback teaches the engine what to suppress or de-rank in future runs.
                            </span>
                        </div>
                    </div>

                    <label className="sheet-field">
                        <span>Reason</span>
                        <select value={feedbackReason} onChange={(event) => onReasonChange(event.target.value as FeedbackReason)}>
                            {FEEDBACK_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <small>{FEEDBACK_OPTIONS.find((option) => option.value === feedbackReason)?.hint}</small>
                    </label>

                    <label className="sheet-field">
                        <span>Optional notes</span>
                        <textarea
                            value={feedbackNotes}
                            onChange={(event) => onNotesChange(event.target.value)}
                            rows={4}
                            placeholder="Example: Too close to titles I keep declining, or not the right mood for this week."
                        />
                    </label>
                </div>

                <div className="sheet-footer">
                    <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
                        Cancel
                    </button>
                    <button className="btn btn-danger" onClick={onSubmit} disabled={saving}>
                        {saving ? (
                            <>
                                <span className="spinner" />
                                Saving...
                            </>
                        ) : (
                            'Save feedback'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
