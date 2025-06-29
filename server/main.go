package main

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
)

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow all origins
		w.Header().Set("Access-Control-Allow-Origin", "*")

		// Handle preflight requests
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.WriteHeader(http.StatusNoContent)
			return
		}

		// Serve the actual request
		h.ServeHTTP(w, r)
	})
}

func main() {
	db, err := NewDB()
	if err != nil {
		panic(err)
	}
	server := http.NewServeMux()
	server.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("Hello, World!"))
	})

	handleUpload := func(w http.ResponseWriter, r *http.Request) {
		file, _, err := r.FormFile("audio")
		if err != nil {
			http.Error(w, "Failed to get audio file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		header := r.MultipartForm.File["audio"][0]
		if err = saveAudioFingerprints(file, header.Filename, db); err != nil {
			fmt.Println(err)
			w.Write([]byte("Failed to upload audio"))
			return
		}
		w.Write([]byte("Audio uploaded successfully!"))
	}

	handleFindMatch := func(w http.ResponseWriter, r *http.Request) {
		file, _, err := r.FormFile("audio")
		if err != nil {
			http.Error(w, "Failed to get audio file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		matches, err := findAudioMatches(file, db)
		if err != nil {
			panic(err)
		}
		res := map[string]any{
			"matches": matches,
		}
		jsonData, err := json.Marshal(res)
		if err != nil {
			http.Error(w, "Failed to marshal response", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(jsonData)
	}

	handleListAudio := func(w http.ResponseWriter, r *http.Request) {
		audioFiles, err := ListAudio(db)
		if err != nil {
			panic(err)
		}
		res := map[string]any{
			"fileNames": audioFiles,
		}
		jsonData, err := json.Marshal(res)
		if err != nil {
			http.Error(w, "Failed to marshal response", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(jsonData)
	}
	server.Handle("/audio/list", withCORS(http.HandlerFunc(handleListAudio)))
	server.Handle("/audio/save", withCORS(http.HandlerFunc(handleUpload)))
	server.Handle("/audio/search", withCORS(http.HandlerFunc(handleFindMatch)))
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))
	slog.Info("Starting server on port 8080")
	err = http.ListenAndServe(":8080", server)
	if err != nil {
		slog.Error("Error starting server", "error", err)
	}
}
