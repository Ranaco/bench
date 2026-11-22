interface SwitchProps {
  readonly label: string;
  readonly detail?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/** An on/off setting, like an iOS settings row. */
export function Switch({ label, detail, checked, onChange }: SwitchProps) {
  return (
    <label className="switch-row">
      <span>
        <span className="switch-label">{label}</span>
        {detail && <small>{detail}</small>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className="toggle"
        onClick={() => {
          onChange(!checked);
        }}
      >
        <span className="switch-knob" />
      </button>
    </label>
  );
}
