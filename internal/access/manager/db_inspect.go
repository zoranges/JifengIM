package manager

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	dbinspect "github.com/WuKongIM/WuKongIM/pkg/db/inspect"
	metadb "github.com/WuKongIM/WuKongIM/pkg/db/meta"
	"github.com/gin-gonic/gin"
)

// DBInspectProvider executes read-only inspect queries against node-local storage.
type DBInspectProvider interface {
	QueryDBInspect(ctx context.Context, nodeID uint64, query string) (DBInspectQueryResponse, error)
}

// DBInspectQueryResponse is one manager DB inspect result.
type DBInspectQueryResponse struct {
	NodeID      uint64           `json:"node_id"`
	GeneratedAt time.Time        `json:"generated_at"`
	Rows        []map[string]any `json:"rows"`
	Stats       DBInspectStats   `json:"stats"`
}

// DBInspectStats summarizes inspect query execution.
type DBInspectStats struct {
	ScanMode         string   `json:"scan_mode"`
	ScannedHashSlots []uint16 `json:"scanned_hash_slots"`
	ScannedRows      int      `json:"scanned_rows"`
	ReturnedRows     int      `json:"returned_rows"`
	HasMore          bool     `json:"has_more"`
	NextCursor       string   `json:"next_cursor"`
}

type dbInspectQueryRequestDTO struct {
	NodeID uint64 `json:"node_id"`
	Query  string `json:"query"`
}

func (s *Server) handleDBInspectTables(c *gin.Context) {
	if s == nil || s.dbInspect == nil {
		jsonError(c, http.StatusServiceUnavailable, "service_unavailable", "db inspect not configured")
		return
	}
	nodeID, err := parseDBInspectNodeID(c.Query("node_id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid_request", "invalid node_id")
		return
	}
	resp, err := s.dbInspect.QueryDBInspect(c.Request.Context(), nodeID, "show tables")
	if err != nil {
		writeDBInspectError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (s *Server) handleDBInspectTable(c *gin.Context) {
	if s == nil || s.dbInspect == nil {
		jsonError(c, http.StatusServiceUnavailable, "service_unavailable", "db inspect not configured")
		return
	}
	nodeID, err := parseDBInspectNodeID(c.Query("node_id"))
	if err != nil {
		jsonError(c, http.StatusBadRequest, "invalid_request", "invalid node_id")
		return
	}
	domain := c.Param("domain")
	table := c.Param("table")
	if !validDBInspectIdentifier(domain) || !validDBInspectIdentifier(table) {
		jsonError(c, http.StatusBadRequest, "invalid_request", "invalid table identifier")
		return
	}
	resp, err := s.dbInspect.QueryDBInspect(c.Request.Context(), nodeID, "describe "+domain+"."+table)
	if err != nil {
		writeDBInspectError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func (s *Server) handleDBInspectQuery(c *gin.Context) {
	if s == nil || s.dbInspect == nil {
		jsonError(c, http.StatusServiceUnavailable, "service_unavailable", "db inspect not configured")
		return
	}
	var body dbInspectQueryRequestDTO
	if err := c.ShouldBindJSON(&body); err != nil {
		jsonError(c, http.StatusBadRequest, "invalid_request", "invalid db inspect query body")
		return
	}
	if strings.TrimSpace(body.Query) == "" {
		jsonError(c, http.StatusBadRequest, "invalid_request", "query is required")
		return
	}
	resp, err := s.dbInspect.QueryDBInspect(c.Request.Context(), body.NodeID, body.Query)
	if err != nil {
		writeDBInspectError(c, err)
		return
	}
	c.JSON(http.StatusOK, resp)
}

func parseDBInspectNodeID(raw string) (uint64, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, nil
	}
	value, err := strconv.ParseUint(raw, 10, 64)
	if err != nil {
		return 0, err
	}
	return value, nil
}

func writeDBInspectError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, dbinspect.ErrCursorMismatch):
		jsonError(c, http.StatusBadRequest, "invalid_cursor", "invalid cursor")
	case errors.Is(err, dbinspect.ErrInvalidQuery), errors.Is(err, dbinspect.ErrUnsupportedQuery), errors.Is(err, metadb.ErrInvalidArgument):
		jsonError(c, http.StatusBadRequest, "invalid_request", "invalid db inspect query")
	case errors.Is(err, errDBInspectUnavailable):
		jsonError(c, http.StatusServiceUnavailable, "service_unavailable", "db inspect unavailable")
	default:
		jsonError(c, http.StatusInternalServerError, "internal_error", "db inspect query failed")
	}
}

var errDBInspectUnavailable = errors.New("manager: db inspect unavailable")

func validDBInspectIdentifier(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '_' {
			continue
		}
		return false
	}
	return true
}
