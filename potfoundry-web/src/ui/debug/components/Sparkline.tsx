/**
 * Sparkline component for performance visualization.
 * Renders a simple SVG line chart.
 * 
 * @module ui/debug/components/Sparkline
 */

import React from 'react';

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    fillColor?: string;
    strokeWidth?: number;
    min?: number;
    max?: number;
    className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    width = 100,
    height = 30,
    color = '#4a9eff',
    fillColor,
    strokeWidth = 1.5,
    min: overrideMin,
    max: overrideMax,
    className,
}) => {
    if (data.length === 0) {
        return (
            <svg width={width} height={height} className={className}>
                <text x={width / 2} y={height / 2} textAnchor="middle" fill="#666" fontSize={10}>
                    No data
                </text>
            </svg>
        );
    }

    const padding = 2;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const minValue = overrideMin ?? Math.min(...data);
    const maxValue = overrideMax ?? Math.max(...data);
    const range = maxValue - minValue || 1;

    const points = data.map((value, index) => {
        const x = padding + (index / (data.length - 1 || 1)) * chartWidth;
        const y = padding + chartHeight - ((value - minValue) / range) * chartHeight;
        return `${x},${y}`;
    });

    const pathData = `M ${points.join(' L ')}`;

    // Fill area under the line
    const fillPath = fillColor
        ? `${pathData} L ${padding + chartWidth},${padding + chartHeight} L ${padding},${padding + chartHeight} Z`
        : undefined;

    return (
        <svg width={width} height={height} className={className}>
            {fillPath && (
                <path
                    d={fillPath}
                    fill={fillColor}
                    opacity={0.3}
                />
            )}
            <path
                d={pathData}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Current value dot */}
            {data.length > 0 && (
                <circle
                    cx={padding + chartWidth}
                    cy={padding + chartHeight - ((data[data.length - 1] - minValue) / range) * chartHeight}
                    r={3}
                    fill={color}
                />
            )}
        </svg>
    );
};

/**
 * Metric card with sparkline for health dashboard.
 */
interface MetricCardProps {
    label: string;
    value: string | number;
    unit?: string;
    data?: number[];
    color?: string;
    trend?: 'up' | 'down' | 'stable';
}

export const MetricCard: React.FC<MetricCardProps> = ({
    label,
    value,
    unit,
    data,
    color = '#4a9eff',
    trend,
}) => {
    return (
        <div className="pf-metric-card">
            <div className="pf-metric-header">
                <span className="pf-metric-label">{label}</span>
                {trend && (
                    <span className={`pf-metric-trend pf-metric-trend--${trend}`}>
                        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                    </span>
                )}
            </div>
            <div className="pf-metric-body">
                <span className="pf-metric-value">{value}</span>
                {unit && <span className="pf-metric-unit">{unit}</span>}
            </div>
            {data && data.length > 1 && (
                <div className="pf-metric-sparkline">
                    <Sparkline
                        data={data}
                        width={160}
                        height={32}
                        color={color}
                        fillColor={color}
                    />
                </div>
            )}
        </div>
    );
};
