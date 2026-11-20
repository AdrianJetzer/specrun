import { useEffect, useState } from 'react';
import { emptyResults, loadResults, type LoadState } from './results';
import Header from './components/Header';
import Summary from './components/Summary';
import Notice from './components/Notice';
import LevelCard from './components/LevelCard';

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let active = true;
    loadResults().then((s) => active && setState(s));
    return () => {
      active = false;
    };
  }, []);

  const results = state.kind === 'ok' ? state.results : emptyResults();

  return (
    <div className="app" data-testid="board" data-state={state.kind}>
      <Header run={results.run} />
      <main className="main">
        {(state.kind === 'missing' || state.kind === 'invalid') && <Notice kind={state.kind} />}
        <Summary levels={results.levels} updatedAt={results.run.updatedAt} />
        <section className="grid" aria-label="Levels">
          {results.levels.map((l) => (
            <LevelCard key={l.level} result={l} />
          ))}
        </section>
      </main>
    </div>
  );
}
