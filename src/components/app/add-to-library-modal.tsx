import type { Recommendation } from '@/lib/types';
import type { ArrFolder, ArrProfile } from './models';

interface AddToLibraryModalProps {
    recommendation: Recommendation | null;
    profiles: ArrProfile[];
    folders: ArrFolder[];
    selectedProfile: number;
    selectedFolder: string;
    searchForContent: boolean;
    loading: boolean;
    submitting: boolean;
    onProfileChange: (value: number) => void;
    onFolderChange: (value: string) => void;
    onSearchChange: (value: boolean) => void;
    onClose: () => void;
    onSubmit: () => void;
}

export function AddToLibraryModal({
    recommendation,
    profiles,
    folders,
    selectedProfile,
    selectedFolder,
    searchForContent,
    loading,
    submitting,
    onProfileChange,
    onFolderChange,
    onSearchChange,
    onClose,
    onSubmit,
}: AddToLibraryModalProps) {
    if (!recommendation) return null;

    return (
        <div className="sheet-overlay" onClick={() => !submitting && onClose()}>
            <div className="sheet-card" onClick={(event) => event.stopPropagation()}>
                <div className="sheet-header">
                    <div>
                        <p className="sheet-eyebrow">Library Action</p>
                        <h3>Add to {recommendation.mediaType === 'movie' ? 'Radarr' : 'Sonarr'}</h3>
                    </div>
                    <button className="sheet-close" onClick={() => !submitting && onClose()} aria-label="Close add modal">
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
                            <p>{recommendation.mediaType === 'movie' ? 'Movie' : 'Series'}{recommendation.year ? ` · ${recommendation.year}` : ''}</p>
                            <span className="helper-copy">
                                Choose the default quality profile and storage target before sending this to your library manager.
                            </span>
                        </div>
                    </div>

                    {loading ? (
                        <div className="sheet-loading">
                            <span className="spinner spinner-lg" />
                            <p>Loading profiles and folders...</p>
                        </div>
                    ) : (
                        <>
                            <label className="sheet-field">
                                <span>Quality profile</span>
                                <select value={selectedProfile} onChange={(event) => onProfileChange(Number(event.target.value))}>
                                    {profiles.map((profile) => (
                                        <option key={profile.id} value={profile.id}>
                                            {profile.name}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="sheet-field">
                                <span>Root folder</span>
                                <select value={selectedFolder} onChange={(event) => onFolderChange(event.target.value)}>
                                    {folders.map((folder) => (
                                        <option key={folder.id} value={folder.path}>
                                            {folder.path} ({(folder.freeSpace / 1e12).toFixed(2)} TB free)
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="toggle-card">
                                <div>
                                    <strong>Search immediately</strong>
                                    <p>
                                        {recommendation.mediaType === 'movie'
                                            ? 'Start a Radarr movie search as soon as the title is added.'
                                            : 'Start a Sonarr search for missing episodes immediately.'}
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={searchForContent}
                                    onChange={(event) => onSearchChange(event.target.checked)}
                                />
                            </label>
                        </>
                    )}
                </div>

                <div className="sheet-footer">
                    <button className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                        Cancel
                    </button>
                    <button className="btn btn-success" onClick={onSubmit} disabled={loading || submitting}>
                        {submitting ? (
                            <>
                                <span className="spinner" />
                                Adding...
                            </>
                        ) : (
                            'Add to library'
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
