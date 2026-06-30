package app

import (
	"context"
	"time"

	"github.com/WuKongIM/WuKongIM/pkg/db/inspect"
	metadb "github.com/WuKongIM/WuKongIM/pkg/db/meta"

	accessmanager "github.com/WuKongIM/WuKongIM/internal/access/manager"
)

type dbInspectProvider struct {
	nodeID        uint64
	metaDB        *metadb.DB
	hashSlotCount uint16
}

func newDBInspectProvider(nodeID uint64, metaDB *metadb.DB, hashSlotCount uint16) *dbInspectProvider {
	return &dbInspectProvider{
		nodeID:        nodeID,
		metaDB:        metaDB,
		hashSlotCount: hashSlotCount,
	}
}

func (p *dbInspectProvider) QueryDBInspect(ctx context.Context, nodeID uint64, query string) (accessmanager.DBInspectQueryResponse, error) {
	store, err := inspect.OpenStore(inspect.Options{
		MetaDB:        p.metaDB,
		HashSlotCount: p.hashSlotCount,
	})
	if err != nil {
		return accessmanager.DBInspectQueryResponse{}, err
	}
	defer store.Close()

	result, err := store.Query(ctx, query)
	if err != nil {
		return accessmanager.DBInspectQueryResponse{}, err
	}
	rows := make([]map[string]any, 0, len(result.Rows))
	for _, row := range result.Rows {
		next := make(map[string]any, len(row))
		for key, value := range row {
			next[key] = value
		}
		rows = append(rows, next)
	}
	if rows == nil {
		rows = []map[string]any{}
	}
	if nodeID == 0 {
		nodeID = p.nodeID
	}
	scannedSlots := result.Stats.ScannedHashSlots
	if scannedSlots == nil {
		scannedSlots = []uint16{}
	}
	return accessmanager.DBInspectQueryResponse{
		NodeID:      nodeID,
		GeneratedAt: time.Now(),
		Rows:        rows,
		Stats: accessmanager.DBInspectStats{
			ScanMode:         result.Stats.ScanMode,
			ScannedHashSlots: scannedSlots,
			ScannedRows:      result.Stats.ScannedRows,
			ReturnedRows:     result.Stats.ReturnedRows,
			HasMore:          result.Stats.HasMore,
			NextCursor:       result.Stats.NextCursor,
		},
	}, nil
}
