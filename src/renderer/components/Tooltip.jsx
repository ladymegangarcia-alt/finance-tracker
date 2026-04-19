export default function Tooltip({ text, children }) {
  return (
    <span className="tooltip-wrap">
      {children ?? <span className="tooltip-icon">?</span>}
      <span className="tooltip-bubble">{text}</span>
    </span>
  );
}
