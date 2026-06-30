package manager

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var monitorMetricSelectorRE = regexp.MustCompile(`\b((?:wukongim|go)_[a-zA-Z0-9_:]+)(\{[^{}]*\})?`)

const (
	prometheusQueryTimeout = 10 * time.Second
	prometheusJobName      = "wukongim"
)

// PrometheusMonitorOptions configures the Prometheus-backed monitor provider.
type PrometheusMonitorOptions struct {
	BaseURL string
	NodeID  uint64
	Now     func() time.Time
}

type prometheusMonitorProvider struct {
	opts   PrometheusMonitorOptions
	client *http.Client
	now    func() time.Time
}

type monitorMetricDef struct {
	key      string
	category string
	stage    string
	tone     string
	unit     string
	query    func(rateWindow string) string
}

type promQueryRangeResponse struct {
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
	Data   struct {
		ResultType string              `json:"resultType"`
		Result     []promMatrixElement `json:"result"`
	} `json:"data"`
}

type promMatrixElement struct {
	Metric map[string]string   `json:"metric"`
	Values [][]json.RawMessage `json:"values"`
}

// NewPrometheusMonitorProvider creates a Prometheus-backed RealtimeMonitorProvider.
func NewPrometheusMonitorProvider(opts PrometheusMonitorOptions) *prometheusMonitorProvider {
	client := &http.Client{Timeout: prometheusQueryTimeout}
	now := opts.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &prometheusMonitorProvider{opts: opts, client: client, now: now}
}

func (p *prometheusMonitorProvider) RealtimeMonitor(ctx context.Context, query RealtimeMonitorQuery) (RealtimeMonitorResponse, error) {
	now := p.now().UTC()
	if strings.TrimSpace(p.opts.BaseURL) == "" {
		return p.disabledResponse(query, now), nil
	}

	started := time.Now()
	defs := p.metricDefinitions(query.Category)
	rateWindow := monitorRateWindow(query.Window, query.Step)
	end := now
	start := end.Add(-query.Window)

	cards := make([]RealtimeMonitorCard, 0, len(defs))
	var firstErr error
	available := 0

	for _, def := range defs {
		promQL := p.filterNodeID(def.query(rateWindow), query.NodeID)
		series, err := p.queryRange(ctx, promQL, start, end, query.Step)
		card := RealtimeMonitorCard{
			Key:       def.key,
			Category:  def.category,
			Stage:     def.stage,
			Source:    RealtimeMonitorSourcePrometheus,
			Tone:      def.tone,
			Unit:      def.unit,
			Series:    series,
			Available: len(series) > 0 && err == nil,
		}
		if err != nil {
			card.Error = err.Error()
			card.UnavailableReason = "prometheus_query_error"
			if firstErr == nil {
				firstErr = err
			}
		} else if len(series) == 0 {
			card.Error = "prometheus returned no data"
			card.UnavailableReason = "prometheus_no_data"
		} else {
			available++
			card.Value = monitorLatestValue(series)
			card.Stats = monitorCardStats(series, query.Step)
		}
		cards = append(cards, card)
	}

	status := RealtimeMonitorStatusReady
	sourceErr := ""
	if available == 0 {
		status = RealtimeMonitorStatusPrometheusUnavailable
		if firstErr != nil {
			sourceErr = firstErr.Error()
		} else {
			sourceErr = "prometheus returned no monitor series"
		}
	} else if available < len(defs) {
		status = RealtimeMonitorStatusPartial
		if firstErr != nil {
			sourceErr = firstErr.Error()
		}
	}

	categories := p.buildCategories(defs)
	snapshot := monitorSnapshotFromCards(cards)

	return RealtimeMonitorResponse{
		Status:        status,
		GeneratedAt:   now,
		WindowSeconds: int(query.Window / time.Second),
		StepSeconds:   int(query.Step / time.Second),
		Scope: RealtimeMonitorScope{
			View:   RealtimeMonitorScopeUnified,
			NodeID: query.NodeID,
		},
		Sources: RealtimeMonitorSources{
			Prometheus: RealtimeMonitorPrometheusSource{
				Enabled: true,
				BaseURL: strings.TrimRight(strings.TrimSpace(p.opts.BaseURL), "/"),
				QueryMS: time.Since(started).Milliseconds(),
				Error:   sourceErr,
			},
			ControlSnapshot: RealtimeMonitorSource{Enabled: false},
		},
		Categories: categories,
		Snapshot:   snapshot,
		Cards:      cards,
	}, nil
}

func (p *prometheusMonitorProvider) disabledResponse(query RealtimeMonitorQuery, now time.Time) RealtimeMonitorResponse {
	return RealtimeMonitorResponse{
		Status:        RealtimeMonitorStatusPrometheusDisabled,
		GeneratedAt:   now,
		WindowSeconds: int(query.Window / time.Second),
		StepSeconds:   int(query.Step / time.Second),
		Scope: RealtimeMonitorScope{
			View:   RealtimeMonitorScopeUnified,
			NodeID: query.NodeID,
		},
		Sources: RealtimeMonitorSources{
			Prometheus: RealtimeMonitorPrometheusSource{
				Enabled: false,
				Error:   "prometheus is disabled; WK_PROMETHEUS_LISTENADDR is not set",
			},
			ControlSnapshot: RealtimeMonitorSource{Enabled: false},
		},
		Categories: []RealtimeMonitorCategory{},
		Snapshot:   []RealtimeMonitorSnapshotEntry{},
		Cards:      []RealtimeMonitorCard{},
	}
}

func (p *prometheusMonitorProvider) queryRange(ctx context.Context, promQL string, start, end time.Time, step time.Duration) ([]RealtimeMonitorPoint, error) {
	base, err := url.Parse(strings.TrimRight(strings.TrimSpace(p.opts.BaseURL), "/") + "/api/v1/query_range")
	if err != nil {
		return nil, fmt.Errorf("prometheus base url invalid: %w", err)
	}
	q := base.Query()
	q.Set("query", promQL)
	q.Set("start", strconv.FormatInt(start.Unix(), 10))
	q.Set("end", strconv.FormatInt(end.Unix(), 10))
	q.Set("step", strconv.FormatInt(int64(step/time.Second), 10))
	base.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base.String(), nil)
	if err != nil {
		return nil, fmt.Errorf("create prometheus query: %w", err)
	}
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("query prometheus: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, fmt.Errorf("read prometheus response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("prometheus returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}

	var decoded promQueryRangeResponse
	if err := json.Unmarshal(body, &decoded); err != nil {
		return nil, fmt.Errorf("decode prometheus response: %w", err)
	}
	if decoded.Status != "success" {
		if decoded.Error != "" {
			return nil, fmt.Errorf("prometheus query failed: %s", decoded.Error)
		}
		return nil, fmt.Errorf("prometheus query failed: %s", decoded.Status)
	}
	return parsePromMatrix(decoded.Data.Result)
}

func (p *prometheusMonitorProvider) filterNodeID(promQL string, nodeID uint64) string {
	if nodeID == 0 {
		return promQL
	}
	return monitorMetricSelectorRE.ReplaceAllStringFunc(promQL, func(selector string) string {
		matches := monitorMetricSelectorRE.FindStringSubmatch(selector)
		if len(matches) < 3 {
			return selector
		}
		metric := matches[1]
		labels := matches[2]
		if strings.Contains(labels, "node_id=") {
			return selector
		}
		if !strings.Contains(labels, "job=") {
			injected := fmt.Sprintf(`job="%s",node_id="%d"`, prometheusJobName, nodeID)
			if labels == "" {
				return metric + "{" + injected + "}"
			}
			return metric + "{" + injected + "," + strings.TrimPrefix(labels, "{")
		}
		if labels == "" {
			return metric + "{node_id=\"" + strconv.FormatUint(nodeID, 10) + "\"}"
		}
		return metric + "{node_id=\"" + strconv.FormatUint(nodeID, 10) + "\"," + strings.TrimPrefix(labels, "{")
	})
}

var commonMonitorMetricKeys = map[string]struct{}{
	"activeConnections":    {},
	"sendRate":             {},
	"deliveryRate":         {},
	"appendLatencyP99":     {},
	"deliveryLatencyP99":   {},
	"retryQueueDepth":      {},
	"pathErrorRate":        {},
	"nodeCpuPercent":       {},
	"nodeMemoryRSS":        {},
	"controllerQueueUsage": {},
	"slotLeaderStability":  {},
	"conversationDirtyAge": {},
	"rpcSuccessRate":       {},
}

func (p *prometheusMonitorProvider) metricDefinitions(category string) []monitorMetricDef {
	return filterMonitorDefs([]monitorMetricDef{
		{
			key:   "sendRate",
			stage: "sendEntry",
			tone:  RealtimeMonitorToneNormal,
			unit:  "msg/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_gateway_messages_received_total[" + rateWindow + "]))")
			},
		},
		{
			key:   "deliveryRate",
			stage: "onlineDelivery",
			tone:  RealtimeMonitorToneNormal,
			unit:  "msg/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_gateway_messages_delivered_total[" + rateWindow + "]))")
			},
		},
		{
			key:   "activeConnections",
			stage: "sendEntry",
			tone:  RealtimeMonitorToneNormal,
			unit:  "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_gateway_connections_active)")
			},
		},
		{
			key:   "sendQueueUsage",
			stage: "sendEntry",
			tone:  RealtimeMonitorToneWarning,
			unit:  "%",
			query: func(string) string {
				return promZeroFallback("(sum(wukongim_gateway_async_send_queue_depth) / clamp_min(sum(wukongim_gateway_async_send_queue_capacity), 1)) * 100")
			},
		},
		{
			key:      "gatewayInboundTraffic",
			category: RealtimeMonitorCategoryGateway,
			stage:    "sendEntry",
			tone:     RealtimeMonitorToneNormal,
			unit:     "B/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_gateway_messages_received_bytes_total[" + rateWindow + "]))")
			},
		},
		{
			key:      "gatewayOutboundTraffic",
			category: RealtimeMonitorCategoryGateway,
			stage:    "sendEntry",
			tone:     RealtimeMonitorToneNormal,
			unit:     "B/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_gateway_messages_delivered_bytes_total[" + rateWindow + "]))")
			},
		},
		{
			key:      "connectionOpenRate",
			category: RealtimeMonitorCategoryGateway,
			stage:    "sendEntry",
			tone:     RealtimeMonitorToneNormal,
			unit:     "conn/s",
			query: func(rateWindow string) string {
				return promZeroFallback(`sum(rate(wukongim_gateway_connections_total{event="open"}[` + rateWindow + `]))`)
			},
		},
		{
			key:               "frameHandleLatencyP99",
			category:          RealtimeMonitorCategoryGateway,
			stage:             "sendEntry",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return "histogram_quantile(0.99, sum(rate(wukongim_gateway_frame_handle_duration_seconds_bucket[" + rateWindow + "])) by (le)) * 1000"
			},
		},
		{
			key:               "appendLatencyP99",
			category:          RealtimeMonitorCategoryMessage,
			stage:             "appendCommit",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return `histogram_quantile(0.99, sum(rate(wukongim_message_append_duration_seconds_bucket{result="ok"}[` + rateWindow + `])) by (le)) * 1000`
			},
		},
		{
			key:      "appendRate",
			category: RealtimeMonitorCategoryMessage,
			stage:    "appendCommit",
			tone:     RealtimeMonitorToneNormal,
			unit:     "msg/s",
			query: func(rateWindow string) string {
				return promZeroFallback(`sum(rate(wukongim_message_append_total{result="ok"}[` + rateWindow + `]))`)
			},
		},
		{
			key:      "appendErrorRate",
			category: RealtimeMonitorCategoryMessage,
			stage:    "appendCommit",
			tone:     RealtimeMonitorToneCritical,
			unit:     "%",
			query: func(rateWindow string) string {
				errors := promZeroWhenPresent(
					`sum(rate(wukongim_message_append_total{result!="ok"}[`+rateWindow+`]))`,
					`sum(rate(wukongim_message_append_total["`+rateWindow+`]))`,
				)
				total := promZeroFallback("sum(rate(wukongim_message_append_total[" + rateWindow + "]))")
				return "(" + errors + " / clamp_min(" + total + ", 1)) * 100"
			},
		},
		{
			key:      "dispatchEnqueueRate",
			category: RealtimeMonitorCategoryMessage,
			stage:    "appendCommit",
			tone:     RealtimeMonitorToneNormal,
			unit:     "msg/s",
			query: func(rateWindow string) string {
				return promZeroFallback(`sum(rate(wukongim_message_committed_dispatch_enqueue_total{result="ok"}[` + rateWindow + `]))`)
			},
		},
		{
			key:      "pendingCommitBacklog",
			category: RealtimeMonitorCategoryMessage,
			stage:    "appendCommit",
			tone:     RealtimeMonitorToneWarning,
			unit:     "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_message_committed_dispatch_queue_depth)")
			},
		},
		{
			key:               "deliveryLatencyP99",
			category:          RealtimeMonitorCategoryMessage,
			stage:             "onlineDelivery",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return "histogram_quantile(0.99, sum(rate(wukongim_delivery_resolve_duration_seconds_bucket[" + rateWindow + "])) by (le)) * 1000"
			},
		},
		{
			key:      "deliveryQueueUsage",
			category: RealtimeMonitorCategoryMessage,
			stage:    "onlineDelivery",
			tone:     RealtimeMonitorToneWarning,
			unit:     "%",
			query: func(string) string {
				depth := "sum(wukongim_delivery_recipient_worker_queue_depth)"
				capacity := "sum(wukongim_delivery_recipient_worker_queue_capacity)"
				return promZeroFallback("(" + depth + " / clamp_min(" + capacity + ", 1)) * 100")
			},
		},
		{
			key:      "retryQueueDepth",
			category: RealtimeMonitorCategoryMessage,
			stage:    "offlineRetry",
			tone:     RealtimeMonitorToneWarning,
			unit:     "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_delivery_retry_queue_depth)")
			},
		},
		{
			key:      "deliveryRouteExpireRate",
			category: RealtimeMonitorCategoryMessage,
			stage:    "offlineRetry",
			tone:     RealtimeMonitorToneCritical,
			unit:     "events/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_delivery_route_expired_total[" + rateWindow + "]))")
			},
		},
		{
			key:      "pathErrorRate",
			category: RealtimeMonitorCategoryMessage,
			stage:    "errorClosure",
			tone:     RealtimeMonitorToneCritical,
			unit:     "%",
			query: func(rateWindow string) string {
				errors := promZeroFallback("sum(rate(wukongim_delivery_route_expired_total[" + rateWindow + "]))")
				total := promZeroFallback("sum(rate(wukongim_delivery_resolve_routes_total[" + rateWindow + "]))")
				return "(" + errors + " / clamp_min(" + total + ", 1)) * 100"
			},
		},
		{
			key:      "conversationActiveRows",
			category: RealtimeMonitorCategoryConversation,
			stage:    "conversationSync",
			tone:     RealtimeMonitorToneNormal,
			unit:     "rows",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_conversation_active_cache_rows)")
			},
		},
		{
			key:      "conversationDirtyRows",
			category: RealtimeMonitorCategoryConversation,
			stage:    "conversationSync",
			tone:     RealtimeMonitorToneWarning,
			unit:     "rows",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_conversation_active_cache_dirty_rows)")
			},
		},
		{
			key:      "conversationDirtyAge",
			category: RealtimeMonitorCategoryConversation,
			stage:    "conversationSync",
			tone:     RealtimeMonitorToneWarning,
			unit:     "s",
			query: func(string) string {
				return "max(wukongim_conversation_active_cache_oldest_dirty_age_seconds)"
			},
		},
		{
			key:      "nodeCpuPercent",
			category: RealtimeMonitorCategoryNode,
			stage:    "runtimePressure",
			tone:     RealtimeMonitorToneWarning,
			unit:     "%",
			query: func(string) string {
				return promZeroFallback("avg(wukongim_node_cpu_percent)")
			},
		},
		{
			key:      "nodeMemoryRSS",
			category: RealtimeMonitorCategoryNode,
			stage:    "runtimePressure",
			tone:     RealtimeMonitorToneWarning,
			unit:     "B",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_node_memory_rss_bytes)")
			},
		},
		{
			key:      "nodeGoroutines",
			category: RealtimeMonitorCategoryNode,
			stage:    "runtimePressure",
			tone:     RealtimeMonitorToneNormal,
			unit:     "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_node_goroutines)")
			},
		},
		{
			key:      "controllerQueueUsage",
			category: RealtimeMonitorCategoryControl,
			stage:    "controlPlane",
			tone:     RealtimeMonitorToneWarning,
			unit:     "%",
			query: func(string) string {
				depth := "sum(wukongim_controller_raft_step_queue_depth)"
				capacity := "sum(wukongim_controller_raft_step_queue_capacity)"
				return promZeroFallback("(" + depth + " / clamp_min(" + capacity + ", 1)) * 100")
			},
		},
		{
			key:      "slotLeaderStability",
			category: RealtimeMonitorCategorySlot,
			stage:    "slotReplication",
			tone:     RealtimeMonitorToneWarning,
			unit:     "",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_slot_leader_elections_total[" + rateWindow + "]))")
			},
		},
		{
			key:               "slotApplyLatencyP99",
			category:          RealtimeMonitorCategorySlot,
			stage:             "slotReplication",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return "histogram_quantile(0.99, sum(rate(wukongim_slot_apply_duration_seconds_bucket[" + rateWindow + "])) by (le)) * 1000"
			},
		},
		{
			key:      "channelActiveCount",
			category: RealtimeMonitorCategoryChannel,
			stage:    "channelReplication",
			tone:     RealtimeMonitorToneNormal,
			unit:     "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_channel_active_channels)")
			},
		},
		{
			key:               "channelAppendLatencyP99",
			category:          RealtimeMonitorCategoryChannel,
			stage:             "channelReplication",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return "histogram_quantile(0.99, sum(rate(wukongim_channel_append_duration_seconds_bucket[" + rateWindow + "])) by (le)) * 1000"
			},
		},
		{
			key:      "rpcSuccessRate",
			category: RealtimeMonitorCategoryInternal,
			stage:    "internalNetwork",
			tone:     RealtimeMonitorToneNormal,
			unit:     "%",
			query: func(rateWindow string) string {
				success := promZeroFallback(`sum(rate(wukongim_transport_rpc_total{result="ok"}[` + rateWindow + `]))`)
				total := promZeroFallback("sum(rate(wukongim_transport_rpc_total[" + rateWindow + "]))")
				return "(" + success + " / clamp_min(" + total + ", 1)) * 100"
			},
		},
		{
			key:      "rpcRate",
			category: RealtimeMonitorCategoryInternal,
			stage:    "internalNetwork",
			tone:     RealtimeMonitorToneNormal,
			unit:     "req/s",
			query: func(rateWindow string) string {
				return promZeroFallback("sum(rate(wukongim_transport_rpc_total[" + rateWindow + "]))")
			},
		},
		{
			key:               "rpcLatencyP99",
			category:          RealtimeMonitorCategoryInternal,
			stage:             "internalNetwork",
			tone:              RealtimeMonitorToneWarning,
			unit:              "ms",
			query: func(rateWindow string) string {
				return "histogram_quantile(0.99, sum(rate(wukongim_transport_rpc_duration_seconds_bucket[" + rateWindow + "])) by (le)) * 1000"
			},
		},
		{
			key:      "transportConnectionsPool",
			category: RealtimeMonitorCategoryInternal,
			stage:    "internalNetwork",
			tone:     RealtimeMonitorToneNormal,
			unit:     "",
			query: func(string) string {
				return promZeroFallback("sum(wukongim_transport_connections_pool_active)")
			},
		},
	}, category)
}

func filterMonitorDefs(defs []monitorMetricDef, category string) []monitorMetricDef {
	out := make([]monitorMetricDef, 0, len(defs))
	for _, def := range defs {
		if def.category == "" {
			def.category = monitorCategoryForStage(def.stage)
		}
		if category == "" || category == RealtimeMonitorCategoryCommon {
			if _, ok := commonMonitorMetricKeys[def.key]; ok {
				out = append(out, def)
			}
		} else if def.category == category {
			out = append(out, def)
		}
	}
	return out
}

func monitorCategoryForStage(stage string) string {
	switch stage {
	case "sendEntry":
		return RealtimeMonitorCategoryGateway
	case "conversationSync":
		return RealtimeMonitorCategoryConversation
	case "appendCommit", "onlineDelivery", "offlineRetry", "errorClosure":
		return RealtimeMonitorCategoryMessage
	case "internalNetwork":
		return RealtimeMonitorCategoryInternal
	case "controlPlane":
		return RealtimeMonitorCategoryControl
	case "slotReplication":
		return RealtimeMonitorCategorySlot
	case "channelReplication":
		return RealtimeMonitorCategoryChannel
	case "runtimePressure":
		return RealtimeMonitorCategoryNode
	default:
		return RealtimeMonitorCategoryMessage
	}
}

func (p *prometheusMonitorProvider) buildCategories(defs []monitorMetricDef) []RealtimeMonitorCategory {
	counts := map[string]int{}
	common := 0
	for _, def := range defs {
		cat := def.category
		if cat == "" {
			cat = monitorCategoryForStage(def.stage)
		}
		counts[cat]++
		if _, ok := commonMonitorMetricKeys[def.key]; ok {
			common++
		}
	}
	return []RealtimeMonitorCategory{
		{Key: RealtimeMonitorCategoryCommon, Count: common},
		{Key: RealtimeMonitorCategoryGateway, Count: counts[RealtimeMonitorCategoryGateway]},
		{Key: RealtimeMonitorCategoryInternal, Count: counts[RealtimeMonitorCategoryInternal]},
		{Key: RealtimeMonitorCategoryMessage, Count: counts[RealtimeMonitorCategoryMessage]},
		{Key: RealtimeMonitorCategoryConversation, Count: counts[RealtimeMonitorCategoryConversation]},
		{Key: RealtimeMonitorCategoryChannel, Count: counts[RealtimeMonitorCategoryChannel]},
		{Key: RealtimeMonitorCategoryControl, Count: counts[RealtimeMonitorCategoryControl]},
		{Key: RealtimeMonitorCategorySlot, Count: counts[RealtimeMonitorCategorySlot]},
		{Key: RealtimeMonitorCategoryNode, Count: counts[RealtimeMonitorCategoryNode]},
	}
}

func promZeroFallback(expr string) string {
	return "((" + expr + ") or vector(0))"
}

func promZeroWhenPresent(query, presence string) string {
	return "((" + query + ") or on() ((" + presence + ") * 0))"
}

func monitorRateWindow(window, step time.Duration) string {
	rateWindow := step * 3
	if rateWindow < 30*time.Second {
		rateWindow = 30 * time.Second
	}
	if rateWindow > window {
		rateWindow = window
	}
	return promDuration(rateWindow)
}

func promDuration(d time.Duration) string {
	seconds := int64(d / time.Second)
	if seconds < 1 {
		return "1s"
	}
	return strconv.FormatInt(seconds, 10) + "s"
}

func parsePromMatrix(results []promMatrixElement) ([]RealtimeMonitorPoint, error) {
	byTimestamp := make(map[int64]float64)
	for _, result := range results {
		points, err := parsePromMatrixValues(result.Values)
		if err != nil {
			return nil, err
		}
		for _, point := range points {
			byTimestamp[point.Timestamp] += point.Value
		}
	}
	timestamps := make([]int64, 0, len(byTimestamp))
	for ts := range byTimestamp {
		timestamps = append(timestamps, ts)
	}
	sort.Slice(timestamps, func(i, j int) bool { return timestamps[i] < timestamps[j] })
	points := make([]RealtimeMonitorPoint, 0, len(timestamps))
	for _, ts := range timestamps {
		points = append(points, RealtimeMonitorPoint{Timestamp: ts, Value: byTimestamp[ts]})
	}
	return points, nil
}

func parsePromMatrixValues(values [][]json.RawMessage) ([]RealtimeMonitorPoint, error) {
	points := make([]RealtimeMonitorPoint, 0, len(values))
	for _, raw := range values {
		if len(raw) != 2 {
			return nil, fmt.Errorf("prometheus matrix value must contain timestamp and value")
		}
		var seconds float64
		if err := json.Unmarshal(raw[0], &seconds); err != nil {
			return nil, fmt.Errorf("decode prometheus timestamp: %w", err)
		}
		var value float64
		if err := json.Unmarshal(raw[1], &value); err != nil {
			var text string
			if err2 := json.Unmarshal(raw[1], &text); err2 != nil {
				return nil, fmt.Errorf("decode prometheus sample: %w", err)
			}
			v, parseErr := strconv.ParseFloat(text, 64)
			if parseErr != nil {
				return nil, fmt.Errorf("decode prometheus sample %q: %w", text, parseErr)
			}
			value = v
		}
		if math.IsNaN(value) || math.IsInf(value, 0) {
			continue
		}
		points = append(points, RealtimeMonitorPoint{
			Timestamp: int64(seconds * 1000),
			Value:     value,
		})
	}
	return points, nil
}

func monitorLatestValue(series []RealtimeMonitorPoint) float64 {
	if len(series) == 0 {
		return 0
	}
	return series[len(series)-1].Value
}

func monitorCardStats(series []RealtimeMonitorPoint, step time.Duration) []RealtimeMonitorStat {
	if len(series) == 0 {
		return nil
	}
	var sum float64
	peak := series[0].Value
	for _, point := range series {
		sum += point.Value
		if point.Value > peak {
			peak = point.Value
		}
	}
	return []RealtimeMonitorStat{
		{Key: "avg", Value: sum / float64(len(series))},
		{Key: "peak", Value: peak},
		{Key: "total", Value: sum * step.Seconds()},
	}
}

func monitorSnapshotFromCards(cards []RealtimeMonitorCard) []RealtimeMonitorSnapshotEntry {
	byKey := make(map[string]RealtimeMonitorCard, len(cards))
	for _, card := range cards {
		if card.Available {
			byKey[card.Key] = card
		}
	}
	specs := []struct {
		key       string
		metricKey string
		unit      string
		tone      string
	}{
		{key: "send", metricKey: "sendRate", unit: "msg/s", tone: RealtimeMonitorToneNormal},
		{key: "delivery", metricKey: "deliveryRate", unit: "msg/s", tone: RealtimeMonitorToneNormal},
		{key: "appendP99", metricKey: "appendLatencyP99", unit: "ms", tone: RealtimeMonitorToneWarning},
		{key: "deliveryP99", metricKey: "deliveryLatencyP99", unit: "ms", tone: RealtimeMonitorToneWarning},
		{key: "errors", metricKey: "pathErrorRate", unit: "%", tone: RealtimeMonitorToneCritical},
		{key: "retryDepth", metricKey: "retryQueueDepth", tone: RealtimeMonitorToneWarning},
		{key: "online", metricKey: "activeConnections", tone: RealtimeMonitorToneNormal},
		{key: "cpu", metricKey: "nodeCpuPercent", unit: "%", tone: RealtimeMonitorToneWarning},
		{key: "memory", metricKey: "nodeMemoryRSS", unit: "B", tone: RealtimeMonitorToneWarning},
		{key: "controllerQueue", metricKey: "controllerQueueUsage", unit: "%", tone: RealtimeMonitorToneWarning},
		{key: "dirtyAge", metricKey: "conversationDirtyAge", unit: "s", tone: RealtimeMonitorToneWarning},
	}
	out := make([]RealtimeMonitorSnapshotEntry, 0, len(specs))
	for _, spec := range specs {
		card, ok := byKey[spec.metricKey]
		if !ok {
			continue
		}
		out = append(out, RealtimeMonitorSnapshotEntry{
			Key:       spec.key,
			MetricKey: spec.metricKey,
			Value:     card.Value,
			Unit:      spec.unit,
			Tone:      spec.tone,
		})
	}
	return out
}
