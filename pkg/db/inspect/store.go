package inspect

import (
	"errors"

	db "github.com/WuKongIM/WuKongIM/pkg/db"
	"github.com/WuKongIM/WuKongIM/pkg/db/internal/engine"
	"github.com/WuKongIM/WuKongIM/pkg/db/message"
	"github.com/WuKongIM/WuKongIM/pkg/db/meta"
)

const (
	defaultLimit = 100
	maxLimit     = 10000
)

// MetaEngineProvider exposes the underlying Pebble engine without importing internal/engine.
type MetaEngineProvider interface {
	Engine() *engine.DB
}

// MessageEngineProvider exposes the underlying Pebble message engine without importing internal/engine.
type MessageEngineProvider interface {
	Engine() *engine.DB
}

// Store owns read-only database handles for inspection.
type Store struct {
	opts Options

	metaEngine     *engine.DB
	metaEngineOwned bool
	messageEngine     *engine.DB
	messageEngineOwned bool
	metaDB        *meta.MetaDB
	messageDB     *message.MessageDB
}

// OpenStore opens metadata and message stores in read-only mode.
func OpenStore(opts Options) (*Store, error) {
	if opts.MetaPath == "" && opts.MessagePath == "" && opts.MetaDB == nil && opts.MessageDB == nil {
		return nil, db.ErrInvalidArgument
	}
	if opts.DefaultLimit <= 0 {
		opts.DefaultLimit = defaultLimit
	}
	if opts.MaxLimit <= 0 {
		opts.MaxLimit = maxLimit
	}

	store := &Store{opts: opts}
	if opts.MetaDB != nil {
		store.metaEngine = opts.MetaDB.Engine()
		store.metaDB = meta.NewDB(store.metaEngine)
	} else if opts.MetaPath != "" {
		eng, err := engine.Open(opts.MetaPath, engine.Options{ReadOnly: true})
		if err != nil {
			return nil, err
		}
		store.metaEngine = eng
		store.metaEngineOwned = true
		store.metaDB = meta.NewDB(eng)
	}
	if opts.MessageDB != nil {
		store.messageEngine = opts.MessageDB.Engine()
		store.messageDB = message.NewDB(store.messageEngine)
	} else if opts.MessagePath != "" {
		eng, err := engine.Open(opts.MessagePath, engine.Options{ReadOnly: true})
		if err != nil {
			_ = store.Close()
			return nil, err
		}
		store.messageEngine = eng
		store.messageEngineOwned = true
		store.messageDB = message.NewDB(eng)
	}
	return store, nil
}

// Meta returns the read-only metadata database handle.
func (s *Store) Meta() *meta.MetaDB {
	if s == nil {
		return nil
	}
	return s.metaDB
}

// Messages returns the read-only message database handle.
func (s *Store) Messages() *message.MessageDB {
	if s == nil {
		return nil
	}
	return s.messageDB
}

// Close releases all opened inspect store handles.
func (s *Store) Close() error {
	if s == nil {
		return nil
	}
	var err error
	if s.metaEngine != nil && s.metaEngineOwned {
		err = errors.Join(err, s.metaEngine.Close())
	}
	s.metaEngine = nil
	s.metaDB = nil
	if s.messageEngine != nil && s.messageEngineOwned {
		err = errors.Join(err, s.messageEngine.Close())
	}
	s.messageEngine = nil
	s.messageDB = nil
	return err
}
