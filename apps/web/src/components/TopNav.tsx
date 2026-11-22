import { Fragment } from 'react';

/** Where you are, as a trail back up: Bench › Lessons › Light an LED. Each step but the last is a link. */
export function TopNav({ trail }: { readonly trail: readonly { readonly label: string; readonly href?: string }[] }) {
  return (
    <nav className="title crumbs" aria-label="Where you are">
      {trail.map((step, i) => (
        <Fragment key={step.label}>
          {i > 0 && (
            <span className="crumb-gap" aria-hidden="true">
              /
            </span>
          )}
          {step.href ? (
            <a href={step.href} className={i === 0 ? 'brand' : undefined}>
              {step.label}
            </a>
          ) : (
            <span aria-current="page">{step.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}
