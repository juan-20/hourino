import { useId } from "react";

/**
 * The hourino mark ("Filled Day"): one calendar day with hours poured in; the
 * fill line doubles as a smile. Colors are the fixed --brand-* tokens (the mark
 * doesn't flip with the theme); only the hard shadow follows --border.
 * Geometry mirrors apps/web/public/favicon.svg; change both together.
 */
export function LogoMark({ className }: { className?: string }) {
	const clipId = useId();

	return (
		<svg
			aria-hidden="true"
			className={className}
			fill="none"
			viewBox="0 0 48 48"
			xmlns="http://www.w3.org/2000/svg"
		>
			<clipPath id={clipId}>
				<rect height="35" rx="5" width="36" x="4.5" y="6.5" />
			</clipPath>
			<rect fill="var(--border)" height="35" rx="5" width="36" x="7" y="9" />
			<rect
				fill="var(--brand-paper)"
				height="35"
				rx="5"
				width="36"
				x="4.5"
				y="6.5"
			/>
			<g clipPath={`url(#${clipId})`}>
				<path d="M4.5 28Q22.5 35 40.5 28V42H4.5z" fill="var(--brand-blue)" />
				<path
					d="M2 27Q22.5 36 43 27"
					stroke="var(--brand-ink)"
					strokeWidth="3"
				/>
			</g>
			<rect
				height="35"
				rx="5"
				stroke="var(--brand-ink)"
				strokeWidth="3"
				width="36"
				x="4.5"
				y="6.5"
			/>
			<circle cx="16.5" cy="19" fill="var(--brand-ink)" r="2.4" />
			<circle cx="28.5" cy="19" fill="var(--brand-ink)" r="2.4" />
		</svg>
	);
}
