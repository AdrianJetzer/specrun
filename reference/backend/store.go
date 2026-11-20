package main

import (
	"errors"
	"sync"
	"time"
)

// Feste Level-Titel (siehe spec/01-produkt.md).
var Titles = [10]string{
	"Statische Seite",
	"Webserver",
	"REST-Backend",
	"Datenbank",
	"Frontend + Backend",
	"Repo + CI",
	"Images in der Pipeline",
	"Deployment",
	"Live-Prüfung",
	"Metriken veröffentlicht",
}

const (
	StatusOffen          = "offen"
	StatusBestanden      = "bestanden"
	StatusFehlgeschlagen = "fehlgeschlagen"
	StatusGesperrt       = "gesperrt"
)

type Check struct {
	Name string `json:"name"`
	OK   bool   `json:"ok"`
}

type Level struct {
	Level      int            `json:"level"`
	Title      string         `json:"title"`
	Status     string         `json:"status"`
	CheckedAt  *string        `json:"checkedAt"`
	DurationMs *int64         `json:"durationMs"`
	Checks     []Check        `json:"checks"`
	Metrics    map[string]any `json:"metrics"`
}

type Run struct {
	ID        string  `json:"id"`
	Version   string  `json:"version"`
	Commit    *string `json:"commit"`
	UpdatedAt *string `json:"updatedAt"`
}

// Results hat exakt das Format von results.json (spec/results.schema.json).
type Results struct {
	Run    Run     `json:"run"`
	Levels []Level `json:"levels"`
}

// Report ist ein gemeldetes Prüfergebnis für ein Level.
type Report struct {
	Checks     []Check
	DurationMs int64
	Metrics    map[string]any
}

var (
	ErrNotFound = errors.New("Level nicht gefunden")
	ErrConflict = errors.New("ein niedrigeres Level ist nicht bestanden")
)

// Store hält den Zustand im Arbeitsspeicher; alle Zugriffe sind über einen Mutex abgesichert.
type Store struct {
	mu  sync.Mutex
	res Results
	now func() time.Time
}

func NewStore(runID, version string, now func() time.Time) *Store {
	if now == nil {
		now = time.Now
	}
	levels := make([]Level, len(Titles))
	for i := range Titles {
		levels[i] = emptyLevel(i+1, StatusOffen)
	}
	return &Store{
		res: Results{Run: Run{ID: runID, Version: version}, Levels: levels},
		now: now,
	}
}

func emptyLevel(n int, status string) Level {
	return Level{Level: n, Title: Titles[n-1], Status: status, Checks: []Check{}, Metrics: map[string]any{}}
}

// Zeitformat wie JavaScript toISOString(): UTC mit Millisekunden.
func isoTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func copyLevel(l Level) Level {
	c := l
	c.Checks = append([]Check{}, l.Checks...)
	c.Metrics = make(map[string]any, len(l.Metrics))
	for k, v := range l.Metrics {
		c.Metrics[k] = v
	}
	return c
}

// Snapshot liefert eine unabhängige Kopie des Gesamtstands.
func (s *Store) Snapshot() Results {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotLocked()
}

func (s *Store) snapshotLocked() Results {
	out := Results{Run: s.res.Run, Levels: make([]Level, len(s.res.Levels))}
	for i, l := range s.res.Levels {
		out.Levels[i] = copyLevel(l)
	}
	return out
}

// Level liefert ein einzelnes Level (1–10).
func (s *Store) Level(n int) (Level, error) {
	if n < 1 || n > len(Titles) {
		return Level{}, ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return copyLevel(s.res.Levels[n-1]), nil
}

// Report übernimmt ein Prüfergebnis und setzt die Regeln durch:
//   - Status aus den Checks (alle ok → bestanden, sonst fehlgeschlagen)
//   - checkedAt und run.updatedAt vom Server
//   - alle höheren Levels: offen (bestanden) bzw. gesperrt (fehlgeschlagen)
//   - ist ein niedrigeres Level nicht bestanden: ErrConflict, nichts wird geändert
func (s *Store) Report(n int, rep Report) (Results, error) {
	if n < 1 || n > len(Titles) {
		return Results{}, ErrNotFound
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	for i := 0; i < n-1; i++ {
		if s.res.Levels[i].Status != StatusBestanden {
			return Results{}, ErrConflict
		}
	}

	passed := true
	for _, c := range rep.Checks {
		if !c.OK {
			passed = false
			break
		}
	}
	now := isoTime(s.now())
	d := rep.DurationMs
	metrics := rep.Metrics
	if metrics == nil {
		metrics = map[string]any{}
	}
	l := emptyLevel(n, StatusFehlgeschlagen)
	if passed {
		l.Status = StatusBestanden
	}
	l.CheckedAt = &now
	l.DurationMs = &d
	l.Checks = append([]Check{}, rep.Checks...)
	l.Metrics = metrics
	s.res.Levels[n-1] = l

	rest := StatusOffen
	if !passed {
		rest = StatusGesperrt
	}
	for i := n; i < len(s.res.Levels); i++ {
		s.res.Levels[i] = emptyLevel(i+1, rest)
	}
	s.res.Run.UpdatedAt = &now
	return s.snapshotLocked(), nil
}
