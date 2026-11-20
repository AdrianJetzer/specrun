import type { RunInfo } from '../results';

export default function Header({ run }: { run: RunInfo }) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          ▮▮▮
        </span>
        <span className="brand-name">Levelboard</span>
      </div>
      <dl className="run-meta">
        <div>
          <dt>Durchlauf</dt>
          <dd data-testid="run-id">{run.id}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd data-testid="run-version">{run.version}</dd>
        </div>
      </dl>
    </header>
  );
}
