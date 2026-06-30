package manager

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	defaultRealtimeMonitorWindow = 15 * time.Minute
	defaultRealtimeMonitorPoints = 45
	minRealtimeMonitorStep       = 5 * time.Second
	maxRealtimeMonitorStep       = 5 * time.Minute

	RealtimeMonitorStatusReady                 = "ready"
	RealtimeMonitorStatusPartial               = "partial"
	RealtimeMonitorStatusPrometheusDisabled    = "prometheus_disabled"
	RealtimeMonitorStatusPrometheusUnavailable = "prometheus_unavailable"

	RealtimeMonitorScopeUnified = "realtime_monitor"

	RealtimeMonitorSourcePrometheus       = "prometheus"
	RealtimeMonitorSourceControlSnapshot = "control_snapshot"

	RealtimeMonitorCategoryCommon       = "common"
	RealtimeMonitorCategoryGateway      = "gateway"
	RealtimeMonitorCategoryInternal     = "internal"
	RealtimeMonitorCategoryMessage      = "message"
	RealtimeMonitorCategoryConversation = "conversation"
	RealtimeMonitorCategoryChannel      = "channel"
	RealtimeMonitorCategoryDatabase     = "database"
	RealtimeMonitorCategoryControl      = "control"
	RealtimeMonitorCategorySlot         = "slot"
	RealtimeMonitorCategoryNode         = "node"

	RealtimeMonitorToneNormal   = "normal"
	RealtimeMonitorToneWarning  = "warning"
	RealtimeMonitorToneCritical = "critical"
)

// RealtimeMonitorProvider returns Prometheus-backed manager monitor snapshots.
type RealtimeMonitorProvider interface {
	RealtimeMonitor(context.Context, RealtimeMonitorQuery) (RealtimeMonitorResponse, error)
}

// RealtimeMonitorQuery contains validated realtime monitor request parameters.
type RealtimeMonitorQuery struct {
	Window   time.Duration
	Step     time.Duration
	NodeID   uint64
	Category string
}

// RealtimeMonitorResponse is the unified manager realtime monitor payload.
type RealtimeMonitorResponse struct {
	Status        string                       `json:"status"`
	GeneratedAt   time.Time                    `json:"generated_at"`
	WindowSeconds int                          `json:"window_seconds"`
	StepSeconds   int                          `json:"step_seconds"`
	Scope         RealtimeMonitorScope         `json:"scope"`
	Sources       RealtimeMonitorSources       `json:"sources"`
	Categories    []RealtimeMonitorCategory    `json:"categories"`
	Snapshot      []RealtimeMonitorSnapshotEntry `json:"snapshot"`
	Cards         []RealtimeMonitorCard        `json:"cards"`
}

type RealtimeMonitorScope struct {
	View   string `json:"view"`
	NodeID uint64 `json:"node_id,omitempty"`
}

type RealtimeMonitorSources struct {
	Prometheus      RealtimeMonitorPrometheusSource `json:"prometheus"`
	ControlSnapshot RealtimeMonitorSource           `json:"control_snapshot"`
}

type RealtimeMonitorPrometheusSource struct {
	Enabled bool   `json:"enabled"`
	BaseURL string `json:"base_url"`
	QueryMS int64  `json:"query_ms"`
	Error   string `json:"error"`
}

type RealtimeMonitorSource struct {
	Enabled bool   `json:"enabled"`
	QueryMS int64  `json:"query_ms"`
	Error   string `json:"error"`
}

type RealtimeMonitorCategory struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type RealtimeMonitorSnapshotEntry struct {
	Key       string  `json:"key"`
	MetricKey string  `json:"metric_key"`
	Value     float64 `json:"value"`
	Unit      string  `json:"unit,omitempty"`
	Tone      string  `json:"tone"`
	Source    string  `json:"source,omitempty"`
}

type RealtimeMonitorCard struct {
	Key               string                  `json:"key"`
	Category          string                  `json:"category"`
	Stage             string                  `json:"stage"`
	Source            string                  `json:"source"`
	Tone              string                  `json:"tone"`
	Unit              string                  `json:"unit"`
	Value             float64                 `json:"value"`
	Series            []RealtimeMonitorPoint  `json:"series"`
	Stats             []RealtimeMonitorStat   `json:"stats"`
	Available         bool                    `json:"available"`
	UnavailableReason string                  `json:"unavailable_reason,omitempty"`
	Error             string                  `json:"error"`
}

type RealtimeMonitorPoint struct {
	Timestamp int64   `json:"timestamp"`
	Value     float64 `json:"value"`
	Label     string  `json:"label,omitempty"`
	SeriesKey string  `json:"series_key,omitempty"`
}

type RealtimeMonitorStat struct {
	Key   string  `json:"key"`
	Label string  `json:"label,omitempty"`
	Value float64 `json:"value"`
	Text  string  `json:"text,omitempty"`
	Unit  string  `json:"unit,omitempty"`
}

func (s *Server) handleRealtimeMonitor(c *gin.Context) {
	query, err := parseRealtimeMonitorQuery(c)
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid_request", err.Error())
		return
	}
	if s == nil || s.realtimeMonitor == nil {
		c.JSON(http.StatusOK, realtimeMonitorDisabledResponse(query, "prometheus monitor provider is not configured"))
		return
	}
	response, err := s.realtimeMonitor.RealtimeMonitor(c.Request.Context(), query)
	if err != nil {
		response = realtimeMonitorUnavailableResponse(query, err.Error())
	}
	c.JSON(http.StatusOK, response)
}

func parseRealtimeMonitorQuery(c *gin.Context) (RealtimeMonitorQuery, error) {
	query := RealtimeMonitorQuery{Window: defaultRealtimeMonitorWindow, Category: RealtimeMonitorCategoryCommon}
	if raw := strings.TrimSpace(c.Query("window")); raw != "" {
		window, err := parseRealtimeMonitorWindow(raw)
		if err != nil {
			return query, err
		}
		query.Window = window
	}
	query.Step = derivedRealtimeMonitorStep(query.Window)
	if raw := strings.TrimSpace(c.Query("step")); raw != "" {
		step, err := time.ParseDuration(raw)
		if err != nil {
			return query, fmt.Errorf("step invalid")
		}
		query.Step = step
	}
	if query.Step < minRealtimeMonitorStep || query.Step > maxRealtimeMonitorStep {
		return query, fmt.Errorf("step invalid")
	}
	nodeID, err := parseOptionalConnectionNodeID(strings.TrimSpace(c.Query("node_id")))
	if err != nil {
		return query, fmt.Errorf("invalid node_id")
	}
	query.NodeID = nodeID
	if raw := strings.TrimSpace(c.Query("category")); raw != "" {
		if !isValidRealtimeMonitorCategory(raw) {
			return query, fmt.Errorf("category invalid")
		}
		query.Category = raw
	}
	return query, nil
}

func isValidRealtimeMonitorCategory(category string) bool {
	switch category {
	case RealtimeMonitorCategoryCommon,
		RealtimeMonitorCategoryGateway,
		RealtimeMonitorCategoryInternal,
		RealtimeMonitorCategoryMessage,
		RealtimeMonitorCategoryConversation,
		RealtimeMonitorCategoryChannel,
		RealtimeMonitorCategoryDatabase,
		RealtimeMonitorCategoryControl,
		RealtimeMonitorCategorySlot,
		RealtimeMonitorCategoryNode:
		return true
	default:
		return false
	}
}

func parseRealtimeMonitorWindow(raw string) (time.Duration, error) {
	window, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("window invalid")
	}
	switch window {
	case 5 * time.Minute, 15 * time.Minute, 30 * time.Minute, time.Hour:
		return window, nil
	default:
		return 0, fmt.Errorf("window invalid")
	}
}

func derivedRealtimeMonitorStep(window time.Duration) time.Duration {
	step := time.Duration(int64(window) / int64(defaultRealtimeMonitorPoints))
	if step < minRealtimeMonitorStep {
		return minRealtimeMonitorStep
	}
	if step > maxRealtimeMonitorStep {
		return maxRealtimeMonitorStep
	}
	return step.Round(time.Second)
}

func realtimeMonitorDisabledResponse(query RealtimeMonitorQuery, message string) RealtimeMonitorResponse {
	return RealtimeMonitorResponse{
		Status:        RealtimeMonitorStatusPrometheusDisabled,
		GeneratedAt:   time.Now().UTC(),
		WindowSeconds: int(query.Window / time.Second),
		StepSeconds:   int(query.Step / time.Second),
		Scope:         RealtimeMonitorScope{View: RealtimeMonitorScopeUnified, NodeID: query.NodeID},
		Sources: RealtimeMonitorSources{
			Prometheus:      RealtimeMonitorPrometheusSource{Enabled: false, Error: message},
			ControlSnapshot: RealtimeMonitorSource{Enabled: false},
		},
		Categories: []RealtimeMonitorCategory{},
		Snapshot:   []RealtimeMonitorSnapshotEntry{},
		Cards:      []RealtimeMonitorCard{},
	}
}

func parseOptionalConnectionNodeID(raw string) (uint64, error) {
	if raw == "" {
		return 0, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || value == 0 {
		return 0, strconv.ErrSyntax
	}
	return value, nil
}

func realtimeMonitorUnavailableResponse(query RealtimeMonitorQuery, message string) RealtimeMonitorResponse {
	return RealtimeMonitorResponse{
		Status:        RealtimeMonitorStatusPrometheusUnavailable,
		GeneratedAt:   time.Now().UTC(),
		WindowSeconds: int(query.Window / time.Second),
		StepSeconds:   int(query.Step / time.Second),
		Scope:         RealtimeMonitorScope{View: RealtimeMonitorScopeUnified, NodeID: query.NodeID},
		Sources: RealtimeMonitorSources{
			Prometheus:      RealtimeMonitorPrometheusSource{Enabled: true, Error: message},
			ControlSnapshot: RealtimeMonitorSource{Enabled: false},
		},
		Categories: []RealtimeMonitorCategory{},
		Snapshot:   []RealtimeMonitorSnapshotEntry{},
		Cards:      []RealtimeMonitorCard{},
	}
}
