package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"math/cmplx"

	"github.com/go-audio/wav"
	"gonum.org/v1/gonum/dsp/fourier"
)

type SpectrogramPoint struct {
	Time int
	Freq int
}

type Fingerprint struct {
	Hash       string
	TimeAnchor int
}

func toDecibel(n float64) float64 {
	return 20 * math.Log10(n+1e-12)
}

func applyHannWindow(frame []float64) []float64 {
	frameSize := len(frame)
	for i := range frameSize {
		scale := 0.5 * (1 - (math.Cos(2 * math.Pi * float64(i) / float64(frameSize-1))))
		frame[i] = scale * frame[i]
	}
	return frame
}

func hashPeak(f1, f2, dt int) string {
	return fmt.Sprintf("%d.%d.%d", f1, f2, dt)
}

// z-score tells us how much a value from the rest of the dataset.
func getZScore(x float64, data []float64) float64 {
	n := float64(len(data))
	if n == 0 {
		return 0
	}

	sum := 0.0
	for _, v := range data {
		sum += v
	}
	mean := sum / n

	variance := 0.0
	for _, v := range data {
		variance += math.Pow(v-mean, 2)
	}
	stdDev := math.Sqrt(variance / n)

	if stdDev == 0 {
		return 0
	}

	return (x - mean) / stdDev
}

func computeAudioFingerprints(file io.ReadSeeker) []Fingerprint {
	// 1. Decode WAV file
	decoder := wav.NewDecoder(file)
	if !decoder.IsValidFile() {
		panic("invalid WAV file")
	}

	// 2. Get full PCM samples as an array of integers
	buf, err := decoder.FullPCMBuffer()
	if err != nil {
		panic("failed to get full PCM buffer")
	}

	// 3. Normalize integers to float64 for bit-depth independent processing.
	samples := make([]float64, len(buf.Data))
	for i, v := range buf.Data {
		samples[i] = float64(v) / float64(int(1)<<(buf.SourceBitDepth-1))
	}

	// 4. Compute spectrogram.
	frameSize := 2048
	hopSize := frameSize / 2
	numFrames := (len(samples) - frameSize) / hopSize
	spectrogram := make([][]float64, numFrames)
	fft := fourier.NewFFT(frameSize)

	for i := range numFrames {
		start := i * hopSize
		end := start + frameSize
		frame := samples[start:end]
		windowedFrame := applyHannWindow(frame)
		spectrum := fft.Coefficients(nil, windowedFrame)

		magnitudes := make([]float64, frameSize/2)
		for j, c := range spectrum[:frameSize/2] {
			magnitudes[j] = cmplx.Abs(c)
		}
		spectrogram[i] = magnitudes
	}

	avgMagnitude := 0.0
	for _, frame := range spectrogram {
		for _, magnitude := range frame {
			avgMagnitude += magnitude
		}
	}
	avgMagnitude /= float64(len(spectrogram) * len(spectrogram[0]))
	peakThresholdDb := toDecibel(avgMagnitude * 2)
	neighborhoodSize := 8

	// 5. Find peaks
	var peaks []SpectrogramPoint

	for t := neighborhoodSize; t < len(spectrogram)-neighborhoodSize; t++ {
		for f := neighborhoodSize; f < len(spectrogram[t])-neighborhoodSize; f++ {
			magnitude := spectrogram[t][f]
			magnitudeDb := toDecibel(magnitude)
			if magnitudeDb < peakThresholdDb {
				continue
			}

			localMax := true
			for dt := -neighborhoodSize; dt <= neighborhoodSize && localMax; dt++ {
				for df := -neighborhoodSize; df <= neighborhoodSize; df++ {
					if dt == 0 && df == 0 {
						continue
					}
					neighbor := spectrogram[t+dt][f+df]
					neighborDb := toDecibel(neighbor)
					if neighborDb > magnitudeDb {
						localMax = false
						break
					}
				}
			}

			if localMax {
				peaks = append(peaks, SpectrogramPoint{Time: t, Freq: f})
			}
		}
	}

	// 6. Generate fingerprints
	var fingerprints []Fingerprint
	for i := range peaks {
		for j := 1; j <= 5 && i+j < len(peaks); j++ {
			f1 := peaks[i]
			f2 := peaks[i+j]
			deltaT := f2.Time - f1.Time

			if deltaT > 0 && deltaT <= 200 {
				hash := hashPeak(f1.Freq, f2.Freq, deltaT)
				fingerprints = append(fingerprints, Fingerprint{
					Hash:       hash,
					TimeAnchor: f1.Time,
				})
			}
		}
	}

	return fingerprints
}

func saveAudioFingerprints(file io.ReadSeeker, fileName string, db *sql.DB) error {
	fingerprints := computeAudioFingerprints(file)

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to start transaction in database: %w", err)
	}
	defer func() {
		if err != nil {
			tx.Rollback()
		} else {
			tx.Commit()
		}
	}()
	res, err := tx.Exec("INSERT INTO songs (title) VALUES(?);", fileName)
	if err != nil {
		return fmt.Errorf("failed to insert song into database: %w", err)
	}
	songId, err := res.LastInsertId()
	if err != nil {
		return fmt.Errorf("failed to get last inserted id in songs database: %w", err)
	}
	for _, fp := range fingerprints {
		if _, err = tx.Exec("INSERT INTO fingerprints (hash, song_ids) VALUES (?, json('[]')) ON CONFLICT(hash) DO NOTHING;", fp.Hash); err != nil {
			return fmt.Errorf("failed to insert fingerprint into database: %w", err)
		}
		if _, err = tx.Exec("UPDATE fingerprints SET song_ids = json_insert(song_ids,'$[#]',?) WHERE hash = ?;", songId, fp.Hash); err != nil {
			return fmt.Errorf("failed to update fingerprint in database: %w", err)
		}
	}
	return nil
}

func findAudioMatches(file io.ReadSeeker, db *sql.DB) ([]string, error) {
	fingerprints := computeAudioFingerprints(file)

	scores := make(map[uint]uint, 0)
	for _, v := range fingerprints {
		var jsonStr string
		err := db.QueryRow(`SELECT song_ids FROM fingerprints WHERE hash = ?`, v.Hash).Scan(&jsonStr)
		if err == sql.ErrNoRows {
			continue
		} else if err != nil {
			return nil, fmt.Errorf("failed to get song_ids from fingerprints: %w", err)
		}

		var songIDs []uint
		if err := json.Unmarshal([]byte(jsonStr), &songIDs); err != nil {
			return nil, fmt.Errorf("failed to unmarshal songIDs: %w", err)
		}

		for _, id := range songIDs {
			scores[id]++
		}
	}

	var maxScore uint
	for _, v := range scores {
		maxScore = max(maxScore, v)
	}

	scoreValues := make([]float64, len(scores))
	for _, v := range scores {
		scoreValues = append(scoreValues, float64(v))
	}
	zScore := getZScore(float64(maxScore), scoreValues)

	matches := make([]string, 0)
	if zScore < 1 {
		return matches, nil // if z-score < 1, it means there are no strong matches.
	}

	for id, score := range scores {
		if score == maxScore {
			var title string
			if err := db.QueryRow(`SELECT title FROM songs WHERE id = ?`, id).Scan(&title); err != nil {
				return nil, fmt.Errorf("failed to get title from songs: %w", err)
			}
			matches = append(matches, title)
		}
	}

	return matches, nil
}

func ListAudio(db *sql.DB) ([]string, error) {
	songs := make([]string, 0)

	res, _ := db.Query("SELECT title from songs;")
	for res.Next() {
		var title string
		if err := res.Scan(&title); err != nil {
			return nil, fmt.Errorf("failed to scan title from songs: %w", err)
		}
		songs = append(songs, title)
	}
	return songs, nil
}
