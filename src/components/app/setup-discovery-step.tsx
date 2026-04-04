import type { ReactNode } from 'react';

interface SetupDiscoveryStepProps {
    eyebrow: string;
    title: string;
    description: string;
    discovery?: ReactNode;
    children: ReactNode;
    footer: ReactNode;
}

export function SetupDiscoveryStep({
    eyebrow,
    title,
    description,
    discovery,
    children,
    footer,
}: SetupDiscoveryStepProps) {
    return (
        <div className="setup-card refined">
            <div className="setup-step-head">
                <div>
                    <p className="setup-kicker">{eyebrow}</p>
                    <h2>{title}</h2>
                    <p className="setup-desc">{description}</p>
                </div>
                {discovery && <div className="setup-discovery-panel">{discovery}</div>}
            </div>

            <div className="setup-step-body">{children}</div>
            <div className="setup-actions">{footer}</div>
        </div>
    );
}
