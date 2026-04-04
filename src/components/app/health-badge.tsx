interface HealthBadgeProps {
    label: string;
    status: 'healthy' | 'warning' | 'error' | 'neutral';
}

export function HealthBadge({ label, status }: HealthBadgeProps) {
    return (
        <span className={`health-badge ${status}`}>
            <span className="health-badge-dot" />
            {label}
        </span>
    );
}
