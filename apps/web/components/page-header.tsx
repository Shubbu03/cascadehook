export function PageHeader({
  title,
  titleId,
  description,
  actions,
}: {
  title: React.ReactNode;
  titleId?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div className="page-heading-copy">
        <h1 id={titleId}>{title}</h1>
        {description && (
          <div className="page-heading-description">{description}</div>
        )}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
  );
}
