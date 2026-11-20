package main

import (
	"errors"
	"sync"
	"testing"
	"time"
)

func fixedNow() time.Time { return time.Date(2026, 11, 21, 9, 14, 0, 0, time.UTC) }

func ok(n int) []Check {
	cs := make([]Check, n)
	for i := range cs {
		cs[i] = Check{Name: "c", OK: true}
	}
	return cs
}

func TestStartzustand(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	r := s.Snapshot()
	if len(r.Levels) != 10 || r.Run.ID != "lokal" || r.Run.UpdatedAt != nil {
		t.Fatalf("unerwarteter Startzustand: %+v", r.Run)
	}
	for i, l := range r.Levels {
		if l.Level != i+1 || l.Title != Titles[i] || l.Status != StatusOffen || l.CheckedAt != nil || l.DurationMs != nil || len(l.Checks) != 0 {
			t.Errorf("Level %d nicht im Startzustand: %+v", i+1, l)
		}
	}
}

func TestBestandenSetztHoehereAufOffen(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	r, err := s.Report(1, Report{Checks: ok(3), DurationMs: 120})
	if err != nil {
		t.Fatal(err)
	}
	l := r.Levels[0]
	if l.Status != StatusBestanden || *l.CheckedAt != "2026-11-21T09:14:00.000Z" || *l.DurationMs != 120 || len(l.Checks) != 3 {
		t.Fatalf("Level 1 falsch: %+v", l)
	}
	if *r.Run.UpdatedAt != *l.CheckedAt {
		t.Error("run.updatedAt nicht gesetzt")
	}
	for _, h := range r.Levels[1:] {
		if h.Status != StatusOffen {
			t.Errorf("Level %d sollte offen sein, ist %s", h.Level, h.Status)
		}
	}
}

func TestFehlschlagSperrtHoehere(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	_, _ = s.Report(1, Report{Checks: ok(1)})
	r, err := s.Report(2, Report{Checks: []Check{{"a", true}, {"b", false}}})
	if err != nil {
		t.Fatal(err)
	}
	if r.Levels[0].Status != StatusBestanden || r.Levels[1].Status != StatusFehlgeschlagen {
		t.Fatalf("Status falsch: %s / %s", r.Levels[0].Status, r.Levels[1].Status)
	}
	for _, h := range r.Levels[2:] {
		if h.Status != StatusGesperrt || h.CheckedAt != nil {
			t.Errorf("Level %d sollte gesperrt und leer sein: %+v", h.Level, h)
		}
	}
	// Erneut bestanden → höhere Levels wieder offen
	r, _ = s.Report(2, Report{Checks: ok(1)})
	if r.Levels[2].Status != StatusOffen {
		t.Errorf("Level 3 sollte wieder offen sein, ist %s", r.Levels[2].Status)
	}
}

func TestReihenfolgeErzwungen(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	before := s.Snapshot()
	if _, err := s.Report(3, Report{Checks: ok(1)}); !errors.Is(err, ErrConflict) {
		t.Fatalf("erwartet ErrConflict, bekommen %v", err)
	}
	if s.Snapshot().Levels[2].Status != before.Levels[2].Status {
		t.Error("Zustand wurde trotz Konflikt geändert")
	}
}

func TestUnbekanntesLevel(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	for _, n := range []int{0, 11, -1} {
		if _, err := s.Report(n, Report{Checks: ok(1)}); !errors.Is(err, ErrNotFound) {
			t.Errorf("Level %d: erwartet ErrNotFound, bekommen %v", n, err)
		}
		if _, err := s.Level(n); !errors.Is(err, ErrNotFound) {
			t.Errorf("Level %d: erwartet ErrNotFound", n)
		}
	}
}

func TestSnapshotIstKopie(t *testing.T) {
	s := NewStore("lokal", "0.1.0", fixedNow)
	_, _ = s.Report(1, Report{Checks: ok(1), Metrics: map[string]any{"x": 1.0}})
	r := s.Snapshot()
	r.Levels[0].Checks[0].Name = "verändert"
	r.Levels[0].Metrics["x"] = 2.0
	l, _ := s.Level(1)
	if l.Checks[0].Name != "c" || l.Metrics["x"] != 1.0 {
		t.Error("Snapshot teilt Daten mit dem Store")
	}
}

func TestGleichzeitigeMeldungen(t *testing.T) {
	s := NewStore("lokal", "0.1.0", nil)
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(2)
		go func(pass bool) {
			defer wg.Done()
			_, _ = s.Report(1, Report{Checks: []Check{{"c", pass}}})
		}(i%2 == 0)
		go func() { defer wg.Done(); _ = s.Snapshot() }()
	}
	wg.Wait()
	r := s.Snapshot()
	want := StatusOffen
	if r.Levels[0].Status == StatusFehlgeschlagen {
		want = StatusGesperrt
	}
	for _, h := range r.Levels[1:] {
		if h.Status != want {
			t.Fatalf("inkonsistenter Endzustand: Level 1 %s, Level %d %s", r.Levels[0].Status, h.Level, h.Status)
		}
	}
}
