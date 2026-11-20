const TEXT = {
  missing: 'Keine Ergebnisse gefunden. Die Datei results.json fehlt.',
  invalid: 'Die Ergebnisdatei ist ungültig. Es werden keine Ergebnisse angezeigt.',
} as const;

export default function Notice({ kind }: { kind: keyof typeof TEXT }) {
  return (
    <div className="notice" role="alert" data-testid="notice" data-kind={kind}>
      <span className="notice-icon" aria-hidden="true">
        !
      </span>
      {TEXT[kind]}
    </div>
  );
}
