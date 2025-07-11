package main

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func NewDB() (*sql.DB, error) {
	db, err := sql.Open("sqlite", "app.db?cache=shared")
	if err != nil {
		return nil, fmt.Errorf("failed to open db: %w", err)
	}

	db.SetMaxOpenConns(1)
	settings := []string{
		"PRAGMA journal_mode = WAL",
		"PRAGMA busy_timeout = 5000",
		"PRAGMA foreign_keys = ON",
	}
	for _, stmt := range settings {
		if _, err := db.Exec(stmt); err != nil {
			return nil, fmt.Errorf("failed to apply %q: %w", stmt, err)
		}
	}

	schema := []string{
		`CREATE TABLE IF NOT EXISTS songs (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS fingerprints (
			hash TEXT PRIMARY KEY,
			song_ids TEXT NOT NULL
		)`,
	}
	for _, query := range schema {
		if _, err := db.Exec(query); err != nil {
			return nil, fmt.Errorf("failed to exec schema %q: %w", query, err)
		}
	}

	return db, nil
}
