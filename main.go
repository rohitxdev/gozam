package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

//go:embed client/build/client/**/* client/build/client/*
var clientBuildDir embed.FS

func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow all origins
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Expose-Headers", "Content-Disposition")

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

type YoutubeVideo struct {
	Title string
	Body  []byte
}

func downloadYoutubeVideo(url string) (*YoutubeVideo, error) {
	fileName, err := uuid.NewV7()
	if err != nil {
		return nil, fmt.Errorf("failed to get uuid: %w", err)
	}

	filePath := fmt.Sprintf("%s/%s.mp4", os.TempDir(), fileName)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var (
		videoData []byte
		videoErr  error
		title     string
		titleErr  error
	)

	var wg sync.WaitGroup
	wg.Add(2)

	go func() {
		defer wg.Done()
		cmd := exec.CommandContext(ctx, "yt-dlp", "-f", "best[ext=mp4]", "--no-playlist", "-o", filePath, url)
		if err := cmd.Run(); err != nil {
			videoErr = fmt.Errorf("failed to download video: %w", err)
			return
		}
		data, err := os.ReadFile(filePath)
		if err != nil {
			videoErr = fmt.Errorf("failed to read downloaded video file: %w", err)
			return
		}
		videoData = data
	}()

	go func() {
		defer wg.Done()
		var out bytes.Buffer
		cmd := exec.CommandContext(ctx, "yt-dlp", "--no-playlist", "--skip-download", "--print", "title", url)
		cmd.Stdout = &out
		if err := cmd.Run(); err != nil {
			titleErr = fmt.Errorf("failed to get video title: %w", err)
			return
		}
		title = strings.TrimSpace(out.String())
	}()

	wg.Wait()

	if videoErr != nil {
		return nil, videoErr
	}
	if titleErr != nil {
		return nil, titleErr
	}

	return &YoutubeVideo{
		Title: title,
		Body:  videoData,
	}, nil
}

func main() {
	db, err := NewDB()
	if err != nil {
		panic(err)
	}
	server := http.NewServeMux()
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

	handleDownloadYoutube := func(w http.ResponseWriter, r *http.Request) {
		videoUrl := r.URL.Query().Get("url")
		if videoUrl == "" {
			http.Error(w, "'url' is required", http.StatusBadRequest)
		}

		t := time.Now()
		video, err := downloadYoutubeVideo(videoUrl)
		fmt.Println("Download:", time.Since(t))
		if err != nil {
			slog.Error("failed to download youtube video", "error", err)
			http.Error(w, "failed to download youtube video", http.StatusInternalServerError)
			return
		}
		if video.Title != "" {
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", video.Title))
		}
		w.Header().Set("Content-Type", http.DetectContentType(video.Body))
		w.Write(video.Body)
	}

	server.Handle("/api/audio/list", withCORS(http.HandlerFunc(handleListAudio)))
	server.Handle("/api/audio/save", withCORS(http.HandlerFunc(handleUpload)))
	server.Handle("/api/audio/search", withCORS(http.HandlerFunc(handleFindMatch)))
	server.Handle("/api/download/youtube", withCORS(http.HandlerFunc(handleDownloadYoutube)))

	spaFS, err := fs.Sub(clientBuildDir, "client/build/client")
	if err != nil {
		panic("failed to get sub dir: " + err.Error())
	}
	server.Handle("/", http.FileServerFS(spaFS))

	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, nil)))
	slog.Info("Starting server on port 8080")
	err = http.ListenAndServe(":8080", server)
	if err != nil {
		slog.Error("Error starting server", "error", err)
	}
}
