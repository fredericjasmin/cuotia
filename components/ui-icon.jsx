export default function UiIcon({ as: IconComponent, size = 18, strokeWidth = 1.8, className = '', ...props }) {
  if (!IconComponent) return null;
  return <IconComponent
    aria-hidden="true"
    focusable="false"
    className={`ui-icon ${className}`.trim()}
    size={size}
    strokeWidth={strokeWidth}
    {...props}
  />;
}
