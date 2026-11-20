package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strconv"
)

const maxBody = 64 * 1024

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

// allow prüft die Methode; bei falscher Methode 405 mit Allow-Header.
func allow(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeError(w, http.StatusMethodNotAllowed, "Methode nicht erlaubt")
	return false
}

func levelNumber(r *http.Request) (int, bool) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 1 || n > len(Titles) {
		return 0, false
	}
	return n, true
}

// reportBody ist der Body von POST /api/levels/{n}/result. Zeiger erkennen fehlende Felder.
type reportBody struct {
	Checks []struct {
		Name *string `json:"name"`
		OK   *bool   `json:"ok"`
	} `json:"checks"`
	DurationMs *int64          `json:"durationMs"`
	Metrics    json.RawMessage `json:"metrics"`
}

func parseReport(body []byte) (Report, string) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	var b reportBody
	if err := dec.Decode(&b); err != nil {
		return Report{}, "ungültiges JSON oder unbekannte Felder"
	}
	if dec.More() {
		return Report{}, "ungültiges JSON"
	}
	if b.Checks == nil || len(b.Checks) == 0 || len(b.Checks) > 100 {
		return Report{}, "checks muss 1 bis 100 Einträge enthalten"
	}
	rep := Report{Checks: make([]Check, 0, len(b.Checks))}
	for _, c := range b.Checks {
		if c.Name == nil || *c.Name == "" || c.OK == nil {
			return Report{}, "jeder Check braucht name (nicht leer) und ok"
		}
		rep.Checks = append(rep.Checks, Check{Name: *c.Name, OK: *c.OK})
	}
	if b.DurationMs == nil || *b.DurationMs < 0 {
		return Report{}, "durationMs muss eine ganze Zahl ≥ 0 sein"
	}
	rep.DurationMs = *b.DurationMs
	if len(b.Metrics) > 0 && string(b.Metrics) != "null" {
		var m map[string]any
		if err := json.Unmarshal(b.Metrics, &m); err != nil || m == nil {
			return Report{}, "metrics muss ein Objekt sein"
		}
		rep.Metrics = m
	}
	return rep, ""
}

// NewHandler baut alle Routen der API.
func NewHandler(s *Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if !allow(w, r, http.MethodGet) {
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.Snapshot().Run.Version})
	})

	mux.HandleFunc("/api/levels", func(w http.ResponseWriter, r *http.Request) {
		if !allow(w, r, http.MethodGet) {
			return
		}
		writeJSON(w, http.StatusOK, s.Snapshot())
	})

	mux.HandleFunc("/api/levels/{n}", func(w http.ResponseWriter, r *http.Request) {
		n, ok := levelNumber(r)
		if !ok {
			writeError(w, http.StatusNotFound, "Level nicht gefunden")
			return
		}
		if !allow(w, r, http.MethodGet) {
			return
		}
		l, _ := s.Level(n)
		writeJSON(w, http.StatusOK, l)
	})

	mux.HandleFunc("/api/levels/{n}/result", func(w http.ResponseWriter, r *http.Request) {
		n, ok := levelNumber(r)
		if !ok {
			writeError(w, http.StatusNotFound, "Level nicht gefunden")
			return
		}
		if !allow(w, r, http.MethodPost) {
			return
		}
		mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mt != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "Content-Type muss application/json sein")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				writeError(w, http.StatusRequestEntityTooLarge, "Body größer als 64 KB")
				return
			}
			writeError(w, http.StatusBadRequest, "Body nicht lesbar")
			return
		}
		rep, msg := parseReport(body)
		if msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
		res, err := s.Report(n, rep)
		if errors.Is(err, ErrConflict) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	// Alles andere: 404 als JSON
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "nicht gefunden")
	})
	return mux
}
